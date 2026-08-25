import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { registerTrendlyneSummary } from "./trendlyneSummary";

test("Trendlyne summary exposes recommendation, house, stock, monthly and run evidence", async () => {
  const results = [
    [{ reports: 3, actionable: 2, resolved_targets: 1, target_hits: 1, target_hit_rate_pct: "100.00" }],
    [{ report_id: "r1", symbol: "PAYTM", stock_name: "One 97 Communications", direction: "LONG", target_hit: true }],
    [{ research_house: "Example Research", actionable: 2, resolved_targets: 1, target_hits: 1, target_hit_rate_pct: "100.00" }],
    [{ symbol: "PAYTM", stock_name: "One 97 Communications", reports: 1, actionable: 1 }],
    [{ month: "2026-08-01", reports: 1, actionable: 1 }],
    [{ run_id: "run-1", status: "SUCCESS", recommendation_analysis: { evaluations: 3 } }],
  ];
  let calls = 0;
  const prisma = { async $queryRawUnsafe() { const result = results[calls]; calls += 1; return result; } } as any;
  const app = express();
  registerTrendlyneSummary(app, prisma);
  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/trendlyne-summary/dashboard`);
    assert.equal(response.status, 200);
    const payload = await response.json() as Record<string, any>;
    assert.equal(calls, 6);
    assert.equal(payload.strategyFamily, "TRENDLYNE_RESEARCH_SUMMARY");
    assert.equal(payload.window, "TRAILING_SIX_MONTHS");
    assert.equal(payload.summary.actionable, 2);
    assert.equal(payload.rows[0].symbol, "PAYTM");
    assert.equal(payload.houseSummary[0].research_house, "Example Research");
    assert.equal(payload.stockSummary[0].stock_name, "One 97 Communications");
    assert.match(payload.methodology.pathStart, /strictly after/);
    assert.ok(payload.warnings.some((warning: string) => warning.includes("not application-generated advice")));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
