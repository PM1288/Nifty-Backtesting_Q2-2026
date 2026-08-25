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
      { report_name: "bhavcopy_udiff", source_date: "2026-08-12", file_name: "bhav.zip", status: "LOADED", rows_loaded: 3480 },
      { report_name: "market_activity", source_date: "2026-08-12", file_name: "ma.csv", status: "LOADED", rows_loaded: 167 },
      { report_name: "pr_zip", source_date: "2026-08-12", file_name: "pr.zip", status: "LOADED", rows_loaded: 2806 },
      { report_name: "sec_bhavdata_full", source_date: "2026-08-12", file_name: "sec.csv", status: "LOADED", rows_loaded: 3308 },
      { report_name: "security_master", source_date: "2026-08-12", file_name: "master.gz", status: "LOADED", rows_loaded: 36296 },
      { report_name: "shortselling", source_date: "2026-08-12", file_name: "short.csv", status: "UNAVAILABLE", message: "No official file was available" },
    ],
    [{ trade_date: "2026-08-12", securities: 2459, advancers: 976, decliners: 1451, unchanged: 32, total_volume: "4879454888", total_value: "1294607756012.24" }],
    [{ trade_date: "2026-08-12", symbol: "ABC", close_price: "100.50", prev_close: "98.00", change_pct: "2.551", direction: "GAINER" }],
    [{ report_date: "2026-08-12", event_type: "BOARD_MEETING", symbol: "ABC", raw_text: "Meeting notice", source_file: "pr.zip" }],
  ], async (baseUrl, calls) => {
    const response = await fetch(`${baseUrl}/v1/nse-intelligence/overview`);
    assert.equal(response.status, 200);
    const payload = await response.json() as any;
    assert.equal(calls(), 5);
    assert.equal(payload.quality.readiness, "DEGRADED");
    assert.equal(payload.quality.jobStatus, "PARTIAL");
    assert.equal(payload.quality.availableInputs, 5);
    assert.equal(payload.quality.allAvailableInputs, 5);
    assert.equal(payload.quality.missingReportCount, 12);
    assert.equal(payload.market.decliners, 1451);
    assert.equal(payload.reports[5].status, "UNAVAILABLE");
    assert.equal(payload.ingestion.notification.status, "SENT");
  }));

test("NSE Intelligence reports NO_DATA honestly when no run or facts exist", async () =>
  withServer([[], [], [], [], []], async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/nse-intelligence/health`);
    assert.equal(response.status, 200);
    const payload = await response.json() as any;
    assert.equal(payload.quality.readiness, "NO_DATA");
    assert.equal(payload.ingestion, null);
    assert.equal(payload.market, null);
    assert.deepEqual(payload.reports, []);
  }));
