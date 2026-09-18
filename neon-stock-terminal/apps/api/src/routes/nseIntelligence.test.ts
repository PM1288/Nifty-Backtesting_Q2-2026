import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { registerNseIntelligence } from "./nseIntelligence";

async function withServer(results: unknown[][], run: (baseUrl: string, calls: () => number) => Promise<void>) {
  let count = 0;
  const prisma = { async $queryRawUnsafe() { return results[count++] ?? []; } } as any;
  const app = express();
  registerNseIntelligence(app, prisma);
  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`, () => count);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("NSE Intelligence separates core readiness from a partial ancillary run", async () =>
  withServer([
    [{ id: 1, job_date: "2026-08-13", source_trade_date: "2026-08-12", status: "PARTIAL", metrics: { expected_files: 17, available_files: 5, missing_count: 12, rows_total: 46057 }, notification_status: "SENT" }],
    [
      { report_name: "bhavcopy_udiff", source_date: "2026-08-12", file_name: "bhav.zip", status: "LOADED", rows_loaded: 3480, bytes_downloaded: 4096, started_at: "2026-08-13T04:00:00Z", finished_at: "2026-08-13T04:00:02Z", load_status: "loaded" },
      { report_name: "market_activity", source_date: "2026-08-12", file_name: "ma.csv", status: "LOADED", rows_loaded: 167 },
      { report_name: "pr_zip", source_date: "2026-08-12", file_name: "pr.zip", status: "LOADED", rows_loaded: 2806 },
      { report_name: "sec_bhavdata_full", source_date: "2026-08-12", file_name: "sec.csv", status: "LOADED", rows_loaded: 3308 },
      { report_name: "security_master", source_date: "2026-08-12", file_name: "master.gz", status: "LOADED", rows_loaded: 36296 },
      { report_name: "shortselling", source_date: "2026-08-12", file_name: "short.csv", status: "UNAVAILABLE", message: "No official file was available", run_metadata: { attempted_urls: ["https://example.test/short.csv"] } },
    ],
    [{ trade_date: "2026-08-12", securities: 2459, advancers: 976, decliners: 1451, unchanged: 32, total_volume: "4879454888", total_value: "1294607756012.24" }],
    [{ trade_date: "2026-08-12", symbol: "ABC", close_price: "100.50", prev_close: "98.00", change_pct: "2.551", direction: "GAINER" }],
    [{ report_date: "2026-08-12", event_type: "BOARD_MEETING", symbol: "ABC", raw_text: "Meeting notice", source_file: "pr.zip" }],
    [{ id: 1, run_id: 10, job_date: "2026-08-13", source_trade_date: "2026-08-12", status: "PARTIAL", started_at: "2026-08-13T04:00:00Z", finished_at: "2026-08-13T04:01:00Z", metrics: { expected_files: 17, available_files: 5, missing_count: 12, rows_total: 46057, errors: 0 } }],
  ], async (baseUrl, calls) => {
    const response = await fetch(`${baseUrl}/v1/nse-intelligence/overview`);
    assert.equal(response.status, 200);
    const payload = await response.json() as any;
    assert.equal(calls(), 6);
    assert.equal(payload.quality.readiness, "DEGRADED");
    assert.equal(payload.quality.jobStatus, "PARTIAL");
    assert.equal(payload.quality.availableInputs, 5);
    assert.equal(payload.quality.allAvailableInputs, 5);
    assert.equal(payload.quality.missingReportCount, 12);
    assert.equal(payload.market.decliners, 1451);
    assert.equal(payload.reports[5].status, "UNAVAILABLE");
    assert.equal(payload.ingestion.notification.status, "SENT");
    assert.equal(payload.downloadHealth.state, "DEGRADED");
    assert.equal(payload.downloadHealth.downloaded, 1);
    assert.equal(payload.downloadHealth.recentRuns[0].durationMs, 60_000);
    assert.deepEqual(payload.reports[5].attemptedUrls, ["https://example.test/short.csv"]);
  }));

test("NSE Intelligence reports NO_DATA honestly when no run or facts exist", async () =>
  withServer([[], [], [], [], [], []], async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/nse-intelligence/health`);
    assert.equal(response.status, 200);
    const payload = await response.json() as any;
    assert.equal(payload.quality.readiness, "NO_DATA");
    assert.equal(payload.ingestion, null);
    assert.equal(payload.market, null);
    assert.deepEqual(payload.reports, []);
    assert.equal(payload.downloadHealth.state, "NO_DATA");
    assert.deepEqual(payload.downloadHealth.recentRuns, []);
  }));

test("archive-only reports are downloaded but never counted as parsed rows", async () =>
  withServer([
    [{ id: 3, status: "SUCCESS", metrics: { expected_files: 1, available_files: 1, missing_count: 0 } }],
    [{ report_name: "fo_udiff", status: "ARCHIVED", bytes_downloaded: 2048, rows_loaded: 0, load_status: "archived" }],
    [], [], [], [],
  ], async (baseUrl) => {
    const payload = await (await fetch(`${baseUrl}/v1/nse-intelligence/reports`)).json() as any;
    assert.equal(payload.downloadHealth.downloaded, 1);
    assert.equal(payload.downloadHealth.loaded, 0);
    assert.equal(payload.downloadHealth.archived, 1);
    assert.equal(payload.reports[0].downloadState, "DOWNLOADED_NOT_PARSED");
    assert.equal(payload.quality.availableInputs, 0);
  }));

test("a failed repeat download does not conceal a previously archived source-date copy", async () =>
  withServer([
    [{ id: 5, source_trade_date: "2026-09-18", status: "PARTIAL", metrics: { expected_files: 1, available_files: 0, missing_count: 1 } }],
    [{ report_name: "fo_udiff", source_date: "2026-09-18", status: "UNAVAILABLE", load_status: "archived", message: "HTTP 404" }],
    [], [], [], [],
  ], async base => {
    const payload = await (await fetch(`${base}/v1/nse-intelligence/reports`)).json() as any;
    assert.equal(payload.reports[0].status, "UNAVAILABLE");
    assert.equal(payload.reports[0].retainedEvidence, true);
    assert.match(payload.reports[0].message, /Earlier archived copy/);
    assert.equal(payload.downloadHealth.retained, 1);
    assert.equal(payload.downloadHealth.loaded, 0);
  }));

test("report health queries include explicit daily catch-ups, not only scheduled jobs", async () => {
  const queries: string[] = [];
  const app = express();
  registerNseIntelligence(app, { $queryRawUnsafe: async (query: string) => { queries.push(query); return []; } } as any);
  const server = app.listen(0);
  try {
    await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/nse-intelligence/reports`);
    for (const index of [0, 1, 5]) assert.match(queries[index], /nse\.ingest_runs/);
    assert.match(queries[0], /r\.run_mode='daily'/);
    assert.match(queries[1], /ORDER BY started_at DESC,run_id DESC/);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("NSE Intelligence treats a skipped already-loaded file as available evidence", async () =>
  withServer([
    [{ id: 2, job_date: "2026-08-14", source_trade_date: "2026-08-13", status: "SUCCESS", metrics: { expected_files: 1, available_files: 1, missing_count: 0, rows_total: 0 } }],
    [{ report_name: "bhavcopy_udiff", source_date: "2026-08-13", file_name: "bhav.zip", status: "SKIPPED", bytes_downloaded: 2048, rows_loaded: 0, message: "Already loaded", load_status: "loaded" }],
    [], [], [],
    [{ id: 2, run_id: 11, job_date: "2026-08-14", source_trade_date: "2026-08-13", status: "SUCCESS", metrics: { expected_files: 1, available_files: 1, missing_count: 0, rows_total: 0 } }],
  ], async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/nse-intelligence/reports`);
    const payload = await response.json() as any;
    assert.equal(payload.quality.availableInputs, 1);
    assert.equal(payload.downloadHealth.state, "HEALTHY");
    assert.equal(payload.reports[0].downloadState, "ALREADY_LOADED");
  }));
