import assert from "node:assert/strict";
import test from "node:test";
import { nseReportHealthCsv, reportHealthFilter } from "../src/lib/nseReportHealth";

const reports = [
  { priority: "CORE" as const, status: "LOADED", reportId: "bhavcopy_udiff" },
  { priority: "ANCILLARY" as const, status: "UNAVAILABLE", reportId: "shortselling" },
  { priority: "ANCILLARY" as const, status: "SKIPPED", reportId: "cmvolt" },
];

test("NSE report health filters keep missing distinct from reused files", () => {
  assert.deepEqual(reportHealthFilter(reports, "ISSUES").map((row) => row.reportId), ["shortselling"]);
  assert.deepEqual(reportHealthFilter(reports, "CORE").map((row) => row.reportId), ["bhavcopy_udiff"]);
});

test("NSE report health CSV preserves exact download evidence", () => {
  const csv = nseReportHealthCsv({
    tradeDate: "2026-09-10",
    dataAsOf: "2026-09-11T04:00:04Z",
    generatedAt: "2026-09-11T04:01:00Z",
    timezone: "Asia/Kolkata",
    featureVersion: "nse-intelligence-cash-v1",
    quality: { readiness: "DEGRADED", jobStatus: "PARTIAL", requiredInputs: 1, availableInputs: 1, missingInputs: [], allExpectedInputs: 2, allAvailableInputs: 1, missingReportCount: 1 },
    ingestion: { jobId: 12, jobDate: "2026-09-11", sourceTradeDate: "2026-09-10", scheduledFor: "2026-09-11T04:00:00Z", startedAt: "2026-09-11T04:00:01Z", finishedAt: "2026-09-11T04:00:04Z", status: "PARTIAL", rowsLoaded: 100, notification: { status: "SENT", sentAt: null, error: null } },
    market: null,
    breadthTrend: [], movers: [], events: [], unavailableModules: [], sources: [],
    reports: [],
    downloadHealth: {
      state: "DEGRADED", expected: 2, downloaded: 1, loaded: 1, missing: 1, failed: 0, totalBytes: 1234, latestFinishedAt: "2026-09-11T04:00:04Z", recentRuns: [],
      reports: [{ reportId: "shortselling", report: "Shortselling", priority: "ANCILLARY", requiredForCashOverview: false, status: "UNAVAILABLE", downloadState: "SOURCE_UNAVAILABLE", sourceDate: "2026-09-10", fileName: "short.csv", checksum: null, bytes: null, rows: null, startedAt: "2026-09-11T04:00:02Z", finishedAt: "2026-09-11T04:00:03Z", durationMs: 1000, loadStatus: null, loadedAt: "2026-09-11T04:00:03Z", message: "No official file was available, after retry", attemptedUrls: ["https://example.test/a.csv"] }],
    },
  });
  assert.match(csv, /SOURCE_UNAVAILABLE/);
  assert.match(csv, /"No official file was available, after retry"/);
  assert.match(csv, /https:\/\/example\.test\/a\.csv/);
  assert.match(csv, /,1000,/);
});
