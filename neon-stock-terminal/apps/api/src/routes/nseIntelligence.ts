import type { Express, Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";

type AnyRow = Record<string, any>;

const CORE_REPORTS = new Set([
  "bhavcopy_udiff",
  "market_activity",
  "pr_zip",
  "sec_bhavdata_full",
  "security_master",
]);

function asNumber(value: unknown) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function reportLabel(reportName: string) {
  return reportName
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const AVAILABLE_REPORT_STATES = new Set(["LOADED", "REUSED", "SKIPPED"]);

function elapsedMs(startedAt: unknown, finishedAt: unknown) {
  if (!startedAt || !finishedAt) return null;
  const value = new Date(String(finishedAt)).getTime() - new Date(String(startedAt)).getTime();
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function buildNseIntelligence(prisma: PrismaClient) {
  const [jobs, reports, breadth, movers, events, recentJobs] = await Promise.all([
    prisma.$queryRawUnsafe<AnyRow[]>(
      `SELECT d.id,d.job_date,d.source_trade_date,d.run_id,d.scheduled_for,d.status,
        d.metrics,d.started_at,d.finished_at,
        n.status AS notification_status,n.sent_at AS notification_sent_at,n.last_error AS notification_error
       FROM nse.daily_job_run d
       LEFT JOIN LATERAL (
         SELECT status,sent_at,last_error FROM nse.notification_outbox
         WHERE trade_date=d.source_trade_date ORDER BY created_at DESC LIMIT 1
       ) n ON true
       ORDER BY d.job_date DESC LIMIT 1`,
    ),
    prisma.$queryRawUnsafe<AnyRow[]>(
      `WITH latest AS (SELECT run_id FROM nse.daily_job_run ORDER BY job_date DESC LIMIT 1)
       SELECT rr.report_name,rr.source_date,rr.file_name,rr.file_sha256,rr.bytes_downloaded,
         rr.rows_loaded,upper(rr.status) AS status,rr.started_at,rr.finished_at,rr.message,
         rr.metadata AS run_metadata,fr.load_status,fr.loaded_at,fr.metadata AS registry_metadata
       FROM nse.ingest_run_reports rr
       JOIN latest l ON l.run_id=rr.run_id
       LEFT JOIN nse.file_registry fr ON fr.report_name=rr.report_name
         AND fr.source_date=rr.source_date AND fr.file_name=rr.file_name
       ORDER BY rr.report_name`,
    ),
    prisma.$queryRawUnsafe<AnyRow[]>(
      `SELECT trade_date,count(*)::int AS securities,
        count(*) FILTER (WHERE close_price>prev_close)::int AS advancers,
        count(*) FILTER (WHERE close_price<prev_close)::int AS decliners,
        count(*) FILTER (WHERE close_price=prev_close)::int AS unchanged,
        sum(total_trading_volume)::numeric AS total_volume,
        sum(total_traded_value)::numeric AS total_value
       FROM nse.fact_bhavcopy_udiff
       WHERE series='EQ' AND trade_date >= (SELECT max(trade_date)-20 FROM nse.fact_bhavcopy_udiff)
       GROUP BY trade_date ORDER BY trade_date`,
    ),
    prisma.$queryRawUnsafe<AnyRow[]>(
      `WITH latest AS (SELECT max(trade_date) AS trade_date FROM nse.fact_bhavcopy_udiff), ranked AS (
         SELECT b.trade_date,b.symbol,b.security_name,b.close_price,b.prev_close,b.total_trading_volume,
           b.total_traded_value,100*(b.close_price/NULLIF(b.prev_close,0)-1) AS change_pct
         FROM nse.fact_bhavcopy_udiff b JOIN latest l USING(trade_date)
         WHERE b.series='EQ' AND b.close_price IS NOT NULL AND b.prev_close>0
       ), selected AS (
         (SELECT *, 'GAINER'::text AS direction FROM ranked ORDER BY change_pct DESC,symbol LIMIT 10)
         UNION ALL
         (SELECT *, 'LOSER'::text AS direction FROM ranked ORDER BY change_pct ASC,symbol LIMIT 10)
       ) SELECT * FROM selected ORDER BY direction,change_pct DESC`,
    ),
    prisma.$queryRawUnsafe<AnyRow[]>(
      `SELECT report_date,event_type,symbol,headline,raw_text,source_file,loaded_at
       FROM nse.fact_text_events ORDER BY report_date DESC,loaded_at DESC LIMIT 30`,
    ),
    prisma.$queryRawUnsafe<AnyRow[]>(
      `SELECT id,job_date,source_trade_date,run_id,scheduled_for,status,metrics,
         started_at,finished_at
       FROM nse.daily_job_run
       ORDER BY job_date DESC LIMIT 30`,
    ),
  ]);

  const job = jobs[0] ?? null;
  const metrics = (job?.metrics && typeof job.metrics === "object") ? job.metrics : {};
  const normalizedReports = reports.map((row) => {
    const status = String(row.status).toUpperCase();
    const metadata = row.run_metadata && typeof row.run_metadata === "object" ? row.run_metadata : {};
    const attemptedUrls = Array.isArray(metadata.attempted_urls)
      ? metadata.attempted_urls.filter((value: unknown) => typeof value === "string")
      : [];
    return {
      reportId: String(row.report_name),
      report: reportLabel(String(row.report_name)),
      priority: CORE_REPORTS.has(String(row.report_name)) ? "CORE" : "ANCILLARY",
      requiredForCashOverview: CORE_REPORTS.has(String(row.report_name)),
      status,
      downloadState: status === "LOADED" ? "DOWNLOADED_AND_LOADED"
        : ["REUSED", "SKIPPED"].includes(status) ? "ALREADY_LOADED"
        : status === "UNAVAILABLE" ? "SOURCE_UNAVAILABLE"
        : status === "FAILED" ? "LOAD_FAILED"
        : status === "RUNNING" ? "IN_PROGRESS"
        : status,
      sourceDate: row.source_date,
      fileName: row.file_name,
      checksum: row.file_sha256,
      bytes: asNumber(row.bytes_downloaded),
      rows: asNumber(row.rows_loaded),
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      durationMs: elapsedMs(row.started_at, row.finished_at),
      loadStatus: row.load_status ? String(row.load_status).toUpperCase() : null,
      loadedAt: row.loaded_at ?? row.finished_at,
      message: row.message,
      attemptedUrls,
    };
  });
  const availableReports = normalizedReports.filter((row) => AVAILABLE_REPORT_STATES.has(row.status));
  const coreAvailable = normalizedReports.filter((row) => row.requiredForCashOverview && AVAILABLE_REPORT_STATES.has(row.status));
  const coreExpected = normalizedReports.filter((row) => row.requiredForCashOverview).length;
  const latestBreadth = breadth.at(-1) ?? null;
  const coreReady = coreExpected > 0 && coreAvailable.length === coreExpected;
  const overallStatus = String(job?.status ?? "NO_DATA").toUpperCase();
  const readiness = !job ? "NO_DATA" : coreReady ? (overallStatus === "SUCCESS" ? "READY" : "DEGRADED") : "BLOCKED";

  return {
    tradeDate: job?.source_trade_date ?? latestBreadth?.trade_date ?? null,
    dataAsOf: job?.finished_at ?? latestBreadth?.trade_date ?? null,
    generatedAt: new Date().toISOString(),
    timezone: "Asia/Kolkata",
    featureVersion: "nse-intelligence-cash-v2",
    quality: {
      readiness,
      jobStatus: overallStatus,
      requiredInputs: coreExpected,
      availableInputs: coreAvailable.length,
      missingInputs: normalizedReports.filter((row) => row.requiredForCashOverview && !AVAILABLE_REPORT_STATES.has(row.status)).map((row) => row.reportId),
      allExpectedInputs: Number(metrics.expected_files ?? normalizedReports.length),
      allAvailableInputs: Number(metrics.available_files ?? availableReports.length),
      missingReportCount: Number(metrics.missing_count ?? normalizedReports.length - availableReports.length),
    },
    ingestion: job ? {
      jobId: asNumber(job.id),
      jobDate: job.job_date,
      sourceTradeDate: job.source_trade_date,
      scheduledFor: job.scheduled_for,
      startedAt: job.started_at,
      finishedAt: job.finished_at,
      status: overallStatus,
      rowsLoaded: Number(metrics.rows_total ?? 0),
      notification: {
        status: job.notification_status ?? "NOT_REQUIRED",
        sentAt: job.notification_sent_at,
        error: job.notification_error,
      },
    } : null,
    downloadHealth: {
      state: !job ? "NO_DATA"
        : overallStatus === "FAILED" || normalizedReports.some((row) => row.status === "FAILED") ? "FAILED"
        : overallStatus !== "SUCCESS" || Number(metrics.missing_count ?? normalizedReports.length - availableReports.length) > 0 ? "DEGRADED"
        : "HEALTHY",
      expected: Number(metrics.expected_files ?? normalizedReports.length),
      downloaded: normalizedReports.filter((row) => row.bytes != null && row.bytes > 0).length,
      loaded: availableReports.length,
      missing: normalizedReports.filter((row) => row.status === "UNAVAILABLE").length,
      failed: normalizedReports.filter((row) => row.status === "FAILED").length,
      totalBytes: normalizedReports.reduce((total, row) => total + (row.bytes ?? 0), 0),
      latestFinishedAt: job?.finished_at ?? null,
      reports: normalizedReports,
      recentRuns: recentJobs.map((row) => {
        const rowMetrics = row.metrics && typeof row.metrics === "object" ? row.metrics : {};
        return {
          jobId: asNumber(row.id),
          runId: asNumber(row.run_id),
          jobDate: row.job_date,
          sourceTradeDate: row.source_trade_date,
          scheduledFor: row.scheduled_for,
          startedAt: row.started_at,
          finishedAt: row.finished_at,
          durationMs: elapsedMs(row.started_at, row.finished_at),
          status: String(row.status).toUpperCase(),
          expectedFiles: asNumber(rowMetrics.expected_files),
          availableFiles: asNumber(rowMetrics.available_files),
          missingCount: asNumber(rowMetrics.missing_count),
          rowsLoaded: asNumber(rowMetrics.rows_total),
          errors: asNumber(rowMetrics.errors),
        };
      }),
    },
    market: latestBreadth ? {
      tradeDate: latestBreadth.trade_date,
      securities: asNumber(latestBreadth.securities),
      advancers: asNumber(latestBreadth.advancers),
      decliners: asNumber(latestBreadth.decliners),
      unchanged: asNumber(latestBreadth.unchanged),
      totalVolume: latestBreadth.total_volume,
      totalValue: latestBreadth.total_value,
    } : null,
    breadthTrend: breadth.map((row) => ({
      tradeDate: row.trade_date,
      securities: asNumber(row.securities),
      advancers: asNumber(row.advancers),
      decliners: asNumber(row.decliners),
      unchanged: asNumber(row.unchanged),
      breadthPct: Number(row.securities) > 0 ? 100 * (Number(row.advancers) - Number(row.decliners)) / Number(row.securities) : null,
      totalVolume: row.total_volume,
      totalValue: row.total_value,
    })),
    movers: movers.map((row) => ({
      tradeDate: row.trade_date,
      symbol: row.symbol,
      name: row.security_name,
      close: row.close_price,
      previousClose: row.prev_close,
      changePct: row.change_pct,
      volume: asNumber(row.total_trading_volume),
      tradedValue: row.total_traded_value,
      direction: row.direction,
    })),
    events: events.map((row) => ({
      reportDate: row.report_date,
      eventType: row.event_type,
      symbol: row.symbol,
      headline: row.headline,
      detail: row.raw_text,
      sourceFile: row.source_file,
      loadedAt: row.loaded_at,
    })),
    reports: normalizedReports,
    unavailableModules: [
      { module: "Sector Activity", reason: "Effective-dated sector membership is not yet complete." },
      { module: "Stock-level F&O Positioning", reason: "Official contract, MWPL and ban datasets are not yet complete." },
      { module: "Short-selling and surveillance analytics", reason: "The latest official source files were unavailable." },
    ],
    sources: [
      { schema: "nse", dataset: "daily_job_run", role: "Scheduler and ingestion state" },
      { schema: "nse", dataset: "ingest_run_reports", role: "Per-report availability and lineage" },
      { schema: "nse", dataset: "fact_bhavcopy_udiff", role: "Official cash-market OHLCV and breadth" },
      { schema: "nse", dataset: "fact_text_events", role: "Normalized report events" },
    ],
  };
}

export function registerNseIntelligence(app: Express, prisma: PrismaClient) {
  const handler = async (_req: Request, res: Response) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json(await buildNseIntelligence(prisma));
    } catch (error) {
      res.status(503).json({ error: "NSE Intelligence data is unavailable", detail: error instanceof Error ? error.message : String(error) });
    }
  };
  app.get("/v1/nse-intelligence/overview", handler);
  app.get("/v1/nse-intelligence/reports", handler);
  app.get("/v1/nse-intelligence/health", handler);
}
