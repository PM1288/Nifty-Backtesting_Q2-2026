import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "@prisma/client";
import { registerTradingAnalytics,loadTradingAnalytics } from "./tradingAnalytics";
test("older cash history stays descriptive and does not fill missing selected-date matrix",async()=>{
  const calls:{sql:string;args:unknown[]}[]=[];
  const rows=[{market_date:"2026-09-03",participant_type:"DII",buy_value:10,sell_value:10,net_value:0}];
  const prisma={$queryRawUnsafe:async(sql:string,...args:unknown[])=>{calls.push({sql,args});return sql.includes("normalized_nse_fii_dii")&&sql.includes("market_date<=")?rows:[];}} as unknown as PrismaClient;
  const d=await loadTradingAnalytics(prisma,"2026-09-07T12:00:00Z","2026-09-07");
  assert.equal(d.cashHistory.latestDate,"2026-09-03");
  assert.equal(d.cashHistory.state,"OLDER_REPORT");
  assert.equal(d.cashHistory.rows[0].net_value,0);
  assert.equal(d.morning.cashNet,null);
  assert.equal(d.morning.matrix,"INSUFFICIENT_DATA");
  assert.ok(calls.some(c=>c.sql.includes("market_date<=")&&c.args[0]==="2026-09-07"));
});
test("read-only API validates input and reports partial source failure without leaking errors", async () => {
  const app = express();
  const prisma = {
    $queryRawUnsafe: async () => {
      throw new Error("secret connection details must not escape");
    },
  } as unknown as PrismaClient;
  registerTradingAnalytics(app, prisma);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const bad = await fetch(`${base}/v1/trading-analytics?asOf=bad`);
    assert.equal(bad.status, 400);
    const future = await fetch(
      `${base}/v1/trading-analytics?asOf=2099-01-01T00:00:00Z`,
    );
    assert.equal(future.status, 400);
    const valid = await fetch(`${base}/v1/trading-analytics`);
    assert.equal(valid.status, 200);
    const text = await valid.text();
    assert.ok(!text.includes("secret connection"));
    const body = JSON.parse(text);
    assert.equal(body.paperOrdersEnabled, false);
    assert.equal(body.liveOrdersEnabled, false);
    assert.equal(body.morning.matrix, "INSUFFICIENT_DATA");
    assert.ok(body.errors.length > 0);
    assert.equal(body.chain.metrics.oiPcr, null);
    const mutation = await fetch(`${base}/v1/trading-analytics`, {
      method: "POST",
    });
    assert.equal(mutation.status, 404);
    const chart = await fetch(`${base}/v1/trading-analytics/charts?interval=7`);
    assert.equal(chart.status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("scalper trade log is read-only, filter validated and preserves nested evidence", async () => {
  const expected = { signal_key: "signal-1", ce_entry_open: 10, pe_entry_open: 0, condition_evidence: { option_precursors_are_context_only: true }, outcome_evidence: { "15m": { maturity: "MATURE" } } };
  const prisma = { $queryRawUnsafe: async (sql: string) => sql.includes("scalper_trade_observation") ? [expected] : [] } as unknown as PrismaClient;
  const app = express(); registerTradingAnalytics(app, prisma);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const bad = await fetch(`${base}/v1/trading-analytics/scalper-log?interval=7`);
    assert.equal(bad.status, 400);
    const response = await fetch(`${base}/v1/trading-analytics/scalper-log?date=2026-09-09&interval=1`);
    assert.equal(response.status, 200);
    const body = await response.json() as { paperOrdersEnabled: boolean; rows: Array<{ pe_entry_open: number; condition_evidence: { option_precursors_are_context_only: boolean } }> };
    assert.equal(body.paperOrdersEnabled, false);
    assert.equal(body.rows[0].pe_entry_open, 0);
    assert.equal(body.rows[0].condition_evidence.option_precursors_are_context_only, true);
    const mutation = await fetch(`${base}/v1/trading-analytics/scalper-log`, { method: "POST" });
    assert.equal(mutation.status, 404);
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
