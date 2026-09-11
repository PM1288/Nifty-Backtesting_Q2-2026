import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

type Row = Record<string, unknown>;

export const FUTURES_VOLATILITY_RULE_VERSION = "FOVOLT_FUT_DAILY_DELTA_GT_0001_V1";
export const FUTURES_VOLATILITY_THRESHOLD_RAW = "0.0001";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const scopeSchema = z.enum(["stocks", "indices", "all"]);

function errorPayload(message: string) {
  return { error: { code: "FUTURES_VOLATILITY_UNAVAILABLE", message } };
}

async function reportCatalog(prisma: PrismaClient) {
  return prisma.$queryRawUnsafe<Row[]>(`
    SELECT r.revision_id "revisionId",r.report_date::text "reportDate",
           r.content_sha256 "contentSha256",r.source_filename "sourceFilename",
           r.source_url "sourceUrl",r.source_basis "sourceBasis",
           r.source_published_at::text "sourcePublishedAt",r.first_seen_at::text "firstSeenAt",
           r.ingested_at::text "ingestedAt",r.parser_version "parserVersion",
           r.schema_identifier "schemaIdentifier",r.row_count "rowCount",
           r.validation_summary "validationSummary",s.run_id "runId",
           s.analysis_session::text "analysisSession",s.timing_mode "timingMode",
           s.source_row_count "sourceRowCount",s.computable_count "computableCount",
           s.matched_count "matchedCount",s.status
      FROM audit.nse_fovolt_report_revision r
      LEFT JOIN market_data.nse_fovolt_screen_run s ON s.revision_id=r.revision_id
     ORDER BY r.report_date DESC,r.first_seen_at DESC`);
}

async function selectedRun(prisma: PrismaClient, analysisDate?: string, reportDate?: string) {
  const values = await prisma.$queryRawUnsafe<Row[]>(`
    SELECT s.run_id,s.revision_id,s.report_date::text report_date,
           s.analysis_session::text analysis_session,s.rule_version,s.threshold_raw::text threshold_raw,
           s.timing_mode,s.intended_decision_cutoff::text intended_decision_cutoff,
           s.cohort_frozen_at::text cohort_frozen_at,s.source_row_count,s.computable_count,
           s.matched_count,s.status,r.source_filename,r.source_url,r.source_basis,
           r.content_sha256,r.first_seen_at::text first_seen_at,r.ingested_at::text ingested_at
      FROM market_data.nse_fovolt_screen_run s
      JOIN audit.nse_fovolt_report_revision r ON r.revision_id=s.revision_id
     WHERE ($1::date IS NULL OR s.analysis_session=$1::date)
       AND ($2::date IS NULL OR s.report_date=$2::date)
     ORDER BY s.report_date DESC,s.cohort_frozen_at DESC LIMIT 1`, analysisDate ?? null, reportDate ?? null);
  return values[0] ?? null;
}

async function screenRows(prisma: PrismaClient, runId: string, scope: "stocks" | "indices" | "all", matchesOnly: boolean) {
  return prisma.$queryRawUnsafe<Row[]>(`
    WITH chosen AS (
      SELECT * FROM market_data.nse_fovolt_screen_run WHERE run_id=$1
    ), source_rows AS (
      SELECT sr.run_id,sr.revision_id,sr.source_csv_line,sr.symbol,
             sr.previous_futures_daily_vol,sr.current_futures_daily_vol,sr.delta_raw,
             sr.delta_basis_points,sr.qualifies,sr.rank_in_valid_report,sr.match_rank,
             sr.screen_state,sr.mapping_state,sr.quality_flags,
             rr.underlying_close,rr.underlying_previous_close,rr.underlying_log_return,
             rr.underlying_vol_previous,rr.underlying_vol_current,rr.underlying_vol_annual,
             rr.futures_close,rr.futures_previous_close,rr.futures_log_return,
             rr.futures_vol_annual,rr.applicable_vol_daily,rr.applicable_vol_annual,rr.raw_fields,
             c.analysis_session,c.report_date source_report_date,
             EXISTS (SELECT 1 FROM nse.fact_eod_prices known
                      WHERE upper(known.symbol)=upper(sr.symbol) AND known.series='EQ') is_stock
        FROM chosen c
        JOIN market_data.nse_fovolt_screen_row sr ON sr.run_id=c.run_id
        JOIN market_data.nse_fovolt_report_row rr
          ON rr.revision_id=sr.revision_id AND rr.source_csv_line=sr.source_csv_line
    ), outcome AS (
      SELECT x.*,
             p.prev_close target_previous_close,p.open_price target_open,p.high_price target_high,
             p.low_price target_low,p.close_price target_close,p.loaded_at target_loaded_at
        FROM source_rows x
        LEFT JOIN nse.fact_eod_prices p ON p.trade_date=x.analysis_session
          AND upper(p.symbol)=upper(x.symbol) AND p.series='EQ'
    )
    SELECT match_rank "matchRank",rank_in_valid_report "rankInValidReport",symbol,
           source_report_date::text "reportDate",analysis_session::text "analysisSession",
           revision_id "sourceRevisionId",source_csv_line "sourceCsvLine",
           previous_futures_daily_vol::text "previousFuturesDailyVol",
           current_futures_daily_vol::text "currentFuturesDailyVol",
           delta_raw::text "deltaRaw",delta_basis_points::text "deltaBasisPoints",
           qualifies,screen_state "screenState",mapping_state "mappingState",quality_flags "qualityFlags",
           underlying_close::text "reportUnderlyingClose",
           underlying_previous_close::text "reportUnderlyingPreviousClose",
           futures_close::text "reportFuturesClose",futures_previous_close::text "reportFuturesPreviousClose",
           underlying_log_return::text "underlyingLogReturn",underlying_vol_previous::text "underlyingVolPrevious",
           underlying_vol_current::text "underlyingVolCurrent",underlying_vol_annual::text "underlyingVolAnnual",
           futures_log_return::text "futuresLogReturn",futures_vol_annual::text "futuresVolAnnual",
           applicable_vol_daily::text "applicableVolDaily",applicable_vol_annual::text "applicableVolAnnual",
           raw_fields "rawFields",is_stock "isStock",
           target_previous_close::text "targetPreviousClose",target_open::text "targetOpen",
           target_high::text "targetHigh",target_low::text "targetLow",target_close::text "targetClose",
           target_loaded_at::text "outcomeAsOf",
           CASE WHEN analysis_session IS NULL THEN 'UNMAPPED'
                WHEN target_close IS NOT NULL THEN 'FINAL'
                WHEN analysis_session>CURRENT_DATE THEN 'AWAITING_SESSION'
                WHEN analysis_session=CURRENT_DATE THEN 'AWAITING_FINAL_BAR'
                ELSE 'PRICE_MISSING' END "outcomeState",
           CASE WHEN target_open>0 AND target_close IS NOT NULL
                THEN ((target_close-target_open)*100/target_open)::text END "openCloseChangePct",
           CASE WHEN target_previous_close>0 AND target_close IS NOT NULL
                THEN ((target_close-target_previous_close)*100/target_previous_close)::text END "previousCloseChangePct",
           CASE WHEN target_low>0 AND target_high IS NOT NULL
                THEN ((target_high-target_low)*100/target_low)::text END "lowHighRangePct",
           CASE WHEN target_open IS NOT NULL AND target_close IS NOT NULL
                THEN (target_close-target_open)::text END "openCloseChange",
           CASE WHEN target_previous_close IS NOT NULL AND target_close IS NOT NULL
                THEN (target_close-target_previous_close)::text END "previousCloseChange",
           CASE WHEN target_low IS NOT NULL AND target_high IS NOT NULL
                THEN (target_high-target_low)::text END "lowHighRange"
      FROM outcome
     WHERE ($3::boolean=false OR qualifies IS TRUE)
       AND ($2='all' OR ($2='stocks' AND is_stock) OR ($2='indices' AND NOT is_stock))
     ORDER BY qualifies DESC NULLS LAST,delta_raw DESC NULLS LAST,symbol`, runId, scope, matchesOnly);
}

export function registerFuturesVolatility(app: Express, prisma: PrismaClient) {
  app.get("/v1/futures-volatility/reports", async (_req, res) => {
    try {
      const reports = await reportCatalog(prisma);
      res.json({ ruleVersion: FUTURES_VOLATILITY_RULE_VERSION, thresholdRaw: FUTURES_VOLATILITY_THRESHOLD_RAW, reports });
    } catch {
      res.status(503).json(errorPayload("FOVOLT storage is not ready. Apply the additive migration and load a validated report."));
    }
  });

  app.get("/v1/futures-volatility/screener", async (req, res) => {
    const parsed = z.object({
      analysisDate: dateSchema.optional(), reportDate: dateSchema.optional(),
      scope: scopeSchema.default("stocks"), matchesOnly: z.enum(["true", "false"]).default("true"),
    }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: { code: "INVALID_FUTURES_VOLATILITY_QUERY", message: parsed.error.issues.map(issue => issue.message).join("; ") } });
    try {
      const run = await selectedRun(prisma, parsed.data.analysisDate, parsed.data.reportDate);
      if (!run) return res.json({
        readiness: "REPORT_NOT_READY", requestedAnalysisDate: parsed.data.analysisDate ?? null,
        ruleVersion: FUTURES_VOLATILITY_RULE_VERSION, thresholdRaw: FUTURES_VOLATILITY_THRESHOLD_RAW,
        run: null, counts: { displayed: 0, sourceRows: 0, matched: 0, priceCovered: 0 }, rows: [],
      });
      const rows = await screenRows(prisma, String(run.run_id), parsed.data.scope, parsed.data.matchesOnly === "true");
      const priceCovered = rows.filter(row => row.outcomeState === "FINAL").length;
      return res.json({
        readiness: "READY", requestedAnalysisDate: parsed.data.analysisDate ?? null,
        ruleVersion: FUTURES_VOLATILITY_RULE_VERSION, thresholdRaw: FUTURES_VOLATILITY_THRESHOLD_RAW,
        scope: parsed.data.scope, matchesOnly: parsed.data.matchesOnly === "true", run,
        counts: { displayed: rows.length, sourceRows: Number(run.source_row_count), computable: Number(run.computable_count), matched: Number(run.matched_count), priceCovered },
        rows,
      });
    } catch {
      return res.status(503).json(errorPayload("FOVOLT screener evidence is unavailable from the canonical database."));
    }
  });

  app.get("/v1/futures-volatility/history", async (req, res) => {
    const parsed = z.object({ symbol: z.string().trim().min(1).max(40) }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: { code: "INVALID_SYMBOL", message: "A symbol is required." } });
    try {
      const rows = await prisma.$queryRawUnsafe<Row[]>(`
        SELECT rr.report_date::text "reportDate",rr.symbol,
               sr.previous_futures_daily_vol::text "previousFuturesDailyVol",
               sr.current_futures_daily_vol::text "currentFuturesDailyVol",
               sr.delta_raw::text "deltaRaw",sr.delta_basis_points::text "deltaBasisPoints",
               sr.qualifies,s.analysis_session::text "analysisSession",s.timing_mode "timingMode"
          FROM market_data.nse_fovolt_report_row rr
          JOIN market_data.nse_fovolt_screen_row sr ON sr.revision_id=rr.revision_id AND sr.source_csv_line=rr.source_csv_line
          JOIN market_data.nse_fovolt_screen_run s ON s.run_id=sr.run_id
         WHERE upper(rr.symbol)=upper($1) ORDER BY rr.report_date`, parsed.data.symbol);
      return res.json({ symbol: parsed.data.symbol.toUpperCase(), rows });
    } catch {
      return res.status(503).json(errorPayload("FOVOLT history is unavailable."));
    }
  });
}
