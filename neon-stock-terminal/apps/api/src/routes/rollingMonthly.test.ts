import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { registerRollingMonthly } from "./rollingMonthly";

async function withServer(results: unknown[], run: (baseUrl: string, count: () => number) => Promise<void>) {
  let calls = 0;
  const prisma = { async $queryRawUnsafe() { const value = results[calls]; calls += 1; return value; } } as any;
  const app = express();
  registerRollingMonthly(app, prisma);
  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`, () => calls);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("rolling monthly dashboard remains independent from OIIS and paper trading", async () =>
  withServer([
    [{ run_id: "run-1", signal_date: "2026-08-11", quality_status: "VALID" }],
    [{ candidate_id: "c1", symbol: "HUDCO", side: "SHORT", quality_band: "LOW", entry_eligible: false }],
    [{ strategy_id: "rolling_monthly_bearish_short_quality_v2", side: "SHORT" }],
    [{ side: "SHORT", quality_band: "HIGH", metric_key: "profit_factor_t5_s2", metric_value: 2.53 }],
    [{ service_name: "rolling-monthly-runner", status: "HEALTHY" }],
    [{ signal_date: "2026-08-11" }],
    [],
    [],
    [],
    [{ signal_month: "2026-07-01", side: "LONG", quality_band: "MEDIUM", trades: 1 }],
    [],
    [{
      expiry_month: "2026-07-01",
      symbol: "HUDCO",
      side: "SHORT",
      next_scheduled_expiry_date: "2026-08-25",
      expiry_evaluation_status: "DEVELOPING",
      expiry_return_pct: "1.25",
      max_profit_pct: "3.5",
      max_drawdown_pct: "-1.75",
    }],
    [{ factor_version: "2.0.0-research", status: "BLOCKED_DATA_QUALITY_REBUILD" }],
  ], async (baseUrl, count) => {
    const response = await fetch(`${baseUrl}/v1/rolling-monthly/dashboard`);
    assert.equal(response.status, 200);
    const payload = await response.json() as Record<string, any>;
    assert.equal(count(), 13);
    assert.equal(payload.strategyFamily, "ROLLING_MONTHLY");
    assert.equal(payload.independentFromOiis, true);
    assert.equal(payload.paperTradingConnected, false);
    assert.equal(payload.qualifyingCandidates.length, 0);
    assert.equal(payload.candidates[0].symbol, "HUDCO");
    assert.equal(payload.backtestHistory.monthlySummary[0].signal_month, "2026-07-01");
    assert.equal(payload.backtestHistory.governance.status, "BLOCKED_DATA_QUALITY_REBUILD");
    assert.match(payload.expiryHistory.cohortWindowRule, /following monthly expiry close/);
    assert.match(payload.expiryHistory.cohortAverageRule, /six-condition base-scanner matches/);
    assert.equal(payload.expiryHistory.candidates[0].max_drawdown_pct, "-1.75");
  }));

test("rolling monthly dashboard rejects malformed signal dates", async () =>
  withServer([], async (baseUrl, count) => {
    const response = await fetch(`${baseUrl}/v1/rolling-monthly/dashboard?signalDate=not-a-date`);
    assert.equal(response.status, 400);
    assert.equal(count(), 0);
  }));

test("rolling monthly weekly chart rejects malformed candidate ids before querying", async () =>
  withServer([], async (baseUrl, count) => {
    const response = await fetch(`${baseUrl}/v1/rolling-monthly/expiry-candidates/not-a-uuid/chart`);
    assert.equal(response.status, 400);
    assert.equal(count(), 0);
  }));

test("absolute monthly closure exposes separate calendar-month evidence", async () =>
  withServer([
    [{ evaluation_month: "2026-08-01", maturity_state: "DEVELOPING", methodology: { anchor: "ABSOLUTE_CALENDAR_MONTH" } }],
    [{ candidate_id: "11111111-1111-4111-8111-111111111111", symbol: "MPHASIS", end_return_pct: "4.25", max_profit_pct: "6.5", max_drawdown_pct: "-1.2" }],
    [{
      evaluation_id: "33333333-3333-4333-8333-333333333333",
      variant: "ABSOLUTE_MONTH",
      symbol: "PAYTM",
      comparison_session: "2026-08-03",
      selection_status: "REJECTED",
      conditions: {},
      rejection_reasons: ["M2_RED"],
    }],
    [{ evaluation_month: "2026-08-01", opportunities: 1, average_end_return_pct: "4.25" }],
    [{ year: 2026, opportunities: 1, average_end_return_pct: "4.25" }],
  ], async (baseUrl, count) => {
    const response = await fetch(`${baseUrl}/v1/rolling-monthly/absolute-months?year=2026&month=08`);
    assert.equal(response.status, 200);
    const payload = await response.json() as Record<string, any>;
    assert.equal(count(), 5);
    assert.equal(payload.variant, "ABSOLUTE_MONTHLY_CLOSURE");
    assert.equal(payload.independentFromOiis, true);
    assert.equal(payload.paperTradingConnected, false);
    assert.equal(payload.methodology.anchor, "ABSOLUTE_CALENDAR_MONTH");
    assert.equal(payload.candidates[0].symbol, "MPHASIS");
    assert.equal(payload.evaluations[0].symbol, "PAYTM");
    assert.deepEqual(payload.evaluations[0].rejection_reasons, ["M2_RED"]);
  }));

test("absolute monthly export returns an Excel-readable multi-sheet workbook", async () =>
  withServer([
    [{ evaluation_month: "2026-08-01", symbol: "MPHASIS", end_return_pct: "4.25" }],
    [{ evaluation_month: "2026-08-01", opportunities: 1, average_end_return_pct: "4.25" }],
    [{ year: 2026, opportunities: 1, average_end_return_pct: "4.25" }],
  ], async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/rolling-monthly/absolute-months/export?format=xls&year=2026`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /application\/vnd\.ms-excel/);
    const body = await response.text();
    assert.match(body, /Worksheet ss:Name="Opportunities"/);
    assert.match(body, /Worksheet ss:Name="Monthly Summary"/);
    assert.match(body, /Worksheet ss:Name="Yearly Summary"/);
    assert.match(body, /MPHASIS/);
  }));

test("absolute monthly routes reject malformed filters and ids before querying", async () =>
  withServer([], async (baseUrl, count) => {
    assert.equal((await fetch(`${baseUrl}/v1/rolling-monthly/absolute-months?year=26`)).status, 400);
    assert.equal((await fetch(`${baseUrl}/v1/rolling-monthly/absolute-months?month=13`)).status, 400);
    assert.equal((await fetch(`${baseUrl}/v1/rolling-monthly/absolute-month-candidates/not-a-uuid/chart`)).status, 400);
    assert.equal(count(), 0);
  }));

test("absolute first-session variant exposes entry and both capital scenarios", async () =>
  withServer([
    [{ evaluation_month: "2026-08-01", maturity_state: "DEVELOPING" }],
    [{ candidate_id: "22222222-2222-4222-8222-222222222222", symbol: "MPHASIS", gap_threshold_pct: "0.50", entry_status: "ENTERED", profit_per_share: "12.50", end_pnl_10000: "48.75" }],
    [{ evaluation_month: "2026-08-01", entered: 1, end_pnl_10000: "48.75" }],
    [{ year: 2026, entered: 1, end_pnl_10000: "48.75" }],
    [{ entered: 2, path_evaluable: 2, profit_target_1_count: 2, profit_target_2_count: 1,
      profit_target_3_count: 1, profit_target_5_count: 0, profit_target_10_count: 0,
      drawdown_1_count: 1, drawdown_2_count: 0, drawdown_3_count: 0,
      drawdown_5_count: 0, drawdown_10_count: 0, one_share_end_pnl: "12.50",
      invested_10000: "9950", end_pnl_10000: "48.75" }],
  ], async (baseUrl, count) => {
    const response = await fetch(`${baseUrl}/v1/rolling-monthly/absolute-first-session?year=2026&month=08&threshold=0.50`);
    assert.equal(response.status, 200);
    const payload = await response.json() as Record<string, any>;
    assert.equal(count(), 5);
    assert.equal(payload.strategyVersion, "absolute_monthly_first_session_gap_fill_long_v1");
    assert.equal(payload.researchNotionalPerOpportunity, 10_000);
    assert.equal(payload.gapThresholdPct, 0.5);
    assert.equal(payload.candidates[0].entry_status, "ENTERED");
    assert.equal(payload.totals.one_share_end_pnl, "12.50");
    assert.deepEqual(payload.performanceThresholdsPct, [1, 2, 3, 5, 10]);
    assert.equal(payload.totals.path_evaluable, 2);
    assert.equal(payload.totals.profit_target_1_count, 2);
    assert.equal(payload.totals.drawdown_1_count, 1);
  }));

test("absolute first-session export and filter validation are deterministic", async () => {
  await withServer([
    [{ evaluation_month: "2026-08-01", symbol: "MPHASIS", gap_threshold_pct: "0.50", entry_status: "ENTERED" }],
  ], async (baseUrl, count) => {
    const response = await fetch(`${baseUrl}/v1/rolling-monthly/absolute-first-session/export?format=xls&threshold=0.50`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /First Session Scenarios/);
    assert.equal(count(), 1);
  });
  await withServer([], async (baseUrl, count) => {
    assert.equal((await fetch(`${baseUrl}/v1/rolling-monthly/absolute-first-session?threshold=0.25`)).status, 400);
    assert.equal((await fetch(`${baseUrl}/v1/rolling-monthly/absolute-first-session/not-a-uuid/chart`)).status, 400);
    assert.equal(count(), 0);
  });
});
