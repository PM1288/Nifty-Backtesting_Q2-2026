import type { NseIntelligenceResponse } from "./api";

function csvCell(value: unknown) {
  if (value == null) return "";
  const text = Array.isArray(value) ? value.join(" | ") : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function nseReportHealthCsv(data: NseIntelligenceResponse) {
  const columns = [
    "job_id", "job_date", "source_trade_date", "job_status", "health_state",
    "report_id", "report", "priority", "download_state", "report_status",
    "source_date", "file_name", "bytes", "sha256", "rows_loaded", "load_status",
    "started_at", "finished_at", "duration_ms", "loaded_at", "message", "attempted_urls",
  ] as const;
  const rows = data.downloadHealth.reports.map((report) => ({
    job_id: data.ingestion?.jobId,
    job_date: data.ingestion?.jobDate,
    source_trade_date: data.ingestion?.sourceTradeDate,
    job_status: data.quality.jobStatus,
    health_state: data.downloadHealth.state,
    report_id: report.reportId,
    report: report.report,
    priority: report.priority,
    download_state: report.downloadState,
    report_status: report.status,
    source_date: report.sourceDate,
    file_name: report.fileName,
    bytes: report.bytes,
    sha256: report.checksum,
    rows_loaded: report.rows,
    load_status: report.loadStatus,
    started_at: report.startedAt,
    finished_at: report.finishedAt,
    duration_ms: report.durationMs,
    loaded_at: report.loadedAt,
    message: report.message,
    attempted_urls: report.attemptedUrls,
  }));
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n");
}

export function nseReportHealthJson(data: NseIntelligenceResponse) {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    tradeDate: data.tradeDate,
    dataAsOf: data.dataAsOf,
    timezone: data.timezone,
    featureVersion: data.featureVersion,
    quality: data.quality,
    ingestion: data.ingestion,
    downloadHealth: data.downloadHealth,
    sources: data.sources,
  }, null, 2);
}

export function reportHealthFilter<T extends { priority: "CORE" | "ANCILLARY"; status: string }>(
  rows: T[],
  filter: "ALL" | "CORE" | "ANCILLARY" | "ISSUES",
) {
  if (filter === "ALL") return rows;
  if (filter === "ISSUES") return rows.filter((row) => !["LOADED", "REUSED", "SKIPPED"].includes(row.status));
  return rows.filter((row) => row.priority === filter);
}
