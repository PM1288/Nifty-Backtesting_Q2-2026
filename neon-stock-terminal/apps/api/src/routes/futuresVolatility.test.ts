import assert from "node:assert/strict";
import test from "node:test";
import { FUTURES_VOLATILITY_RULE_VERSION, FUTURES_VOLATILITY_THRESHOLD_RAW, registerFuturesVolatility } from "./futuresVolatility.js";

test("futures volatility route preserves decimal strings and outcome state", async () => {
  const handlers = new Map<string, Function>();
  const app = { get(path: string, handler: Function) { handlers.set(path, handler); } } as any;
  let calls = 0;
  const prisma = { async $queryRawUnsafe(sql: string) {
    calls += 1;
    if (sql.includes("FROM market_data.nse_fovolt_screen_run s")) return [{
      run_id: "run-1", revision_id: "rev-1", report_date: "2026-09-10", analysis_session: "2026-09-11",
      rule_version: FUTURES_VOLATILITY_RULE_VERSION, threshold_raw: FUTURES_VOLATILITY_THRESHOLD_RAW,
      source_row_count: 221, computable_count: 221, matched_count: 4,
    }];
    return [{ symbol: "IDEA", deltaRaw: "0.00010440", deltaBasisPoints: "1.04400000", outcomeState: "FINAL" }];
  } } as any;
  registerFuturesVolatility(app, prisma);
  let payload: any;
  const res = { status() { return this; }, json(value: any) { payload = value; return value; } };
  await handlers.get("/v1/futures-volatility/screener")!({ query: {} }, res);
  assert.equal(calls, 2);
  assert.equal(payload.ruleVersion, FUTURES_VOLATILITY_RULE_VERSION);
  assert.equal(payload.thresholdRaw, "0.0001");
  assert.equal(payload.rows[0].deltaRaw, "0.00010440");
  assert.equal(payload.counts.matched, 4);
  assert.equal(payload.counts.priceCovered, 1);
});

test("futures volatility route distinguishes report-not-ready from zero matches", async () => {
  const handlers = new Map<string, Function>();
  const app = { get(path: string, handler: Function) { handlers.set(path, handler); } } as any;
  registerFuturesVolatility(app, { async $queryRawUnsafe() { return []; } } as any);
  let payload: any;
  const res = { status() { return this; }, json(value: any) { payload = value; return value; } };
  await handlers.get("/v1/futures-volatility/screener")!({ query: {} }, res);
  assert.equal(payload.readiness, "REPORT_NOT_READY");
  assert.deepEqual(payload.rows, []);
});
