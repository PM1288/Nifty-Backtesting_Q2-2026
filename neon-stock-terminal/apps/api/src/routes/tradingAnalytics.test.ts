import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "@prisma/client";
import { registerTradingAnalytics,loadTradingAnalytics,resolveChartStrikeSelection } from "./tradingAnalytics";

test("chart selection accepts independent CE and PE strikes while preserving legacy pair links", () => {
  assert.deepEqual(resolveChartStrikeSelection({ strike: 23450 }), { ceStrike: 23450, peStrike: 23450 });
  assert.deepEqual(resolveChartStrikeSelection({ strike: 23450, ceStrike: 23500, peStrike: 23400 }), { ceStrike: 23500, peStrike: 23400 });
});

test("charts endpoint resolves one exact CE and one exact PE at different strikes", async () => {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  const prisma = {
    $queryRawUnsafe: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      if (sql.includes("FROM public.instruments s") && sql.includes("s.name=$2")) {
        return [{ symbol: "NIFTY", label: "Nifty 50", token: "99926000", kind: "INDEX", optionType: "OPTIDX" }];
      }
      if (sql.includes("GROUP BY i.expiry,i.strike")) {
        return [
          { expiry: "2026-09-15", strike: 23400, ce_contracts: 0, pe_contracts: 1 },
          { expiry: "2026-09-15", strike: 23500, ce_contracts: 1, pe_contracts: 0 },
        ];
      }
      if (sql.includes("tradingsymbol LIKE '%CE'") && sql.includes("tradingsymbol LIKE '%PE'") && sql.includes("strike=$3::numeric")) {
        return [
          { exchange: "NFO", symbol_token: "ce-token", tradingsymbol: "NIFTY15SEP2623500CE", expiry: "2026-09-15", strike: 23500 },
          { exchange: "NFO", symbol_token: "pe-token", tradingsymbol: "NIFTY15SEP2623400PE", expiry: "2026-09-15", strike: 23400 },
        ];
      }
      if (sql.includes("ALL_STRIKES_CAPTURED_PER_SNAPSHOT") || (sql.includes("sum(l.open_interest)") && sql.includes("option_chain_snapshots s"))) {
        return [{
          snapshot_id: "91", captured_at: "2026-09-10T09:55:00.000Z", source: "fixture", strikes_around: 6,
          strike_count: 13, ce_contract_count: 13, ce_observed_count: 13, ce_oi: "1300",
          pe_contract_count: 13, pe_observed_count: 13, pe_oi: "1170",
        }];
      }
      return [];
    },
  } as unknown as PrismaClient;
  const app = express(); registerTradingAnalytics(app, prisma);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const response = await fetch(`${base}/v1/trading-analytics/charts?asOf=2026-09-10T10:00:00Z&expiry=2026-09-15&ceStrike=23500&peStrike=23400`);
    assert.equal(response.status, 200);
    const body = await response.json() as {
      panes: Array<{ identity: { tradingsymbol: string; strike?: number } }>;
      availableContracts: Array<{ strike: number; ce_contracts: number; pe_contracts: number }>;
      cumulativeOiHistory: { scope: string; unit: string; points: Array<{ capturedAt: string; strikeCount: number; ceOi: number; peOi: number; state: string }> };
    };
    assert.deepEqual(body.panes.slice(1).map((pane) => [pane.identity.tradingsymbol, pane.identity.strike]), [
      ["NIFTY15SEP2623500CE", 23500],
      ["NIFTY15SEP2623400PE", 23400],
    ]);
    assert.equal(body.availableContracts.length, 2);
    assert.equal(body.cumulativeOiHistory.scope, "ALL_STRIKES_CAPTURED_PER_SNAPSHOT");
    assert.equal(body.cumulativeOiHistory.unit, "provider_native_oi");
    assert.deepEqual(body.cumulativeOiHistory.points[0], {
      snapshotId: "91", capturedAt: "2026-09-10T09:55:00.000Z", source: "fixture", strikesAround: 6,
      strikeCount: 13, ceContractCount: 13, ceObservedCount: 13, ceOi: 1300,
      peContractCount: 13, peObservedCount: 13, peOi: 1170, state: "COMPLETE",
    });
    const contractRead = calls.find((call) => call.sql.includes("strike=$3::numeric") && call.sql.includes("strike=$4::numeric"));
    assert.deepEqual(contractRead?.args.slice(2, 4), [23500, 23400]);
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("option price history returns every captured CE and PE strike without enabling orders", async () => {
  const prisma = {
    $queryRawUnsafe: async (sql: string) => sql.includes("FROM option_chain_snapshots s") && sql.includes("l.last_price::float8") ? [
      { snapshot_id: "101", captured_at: "2026-09-10T03:46:00.000Z", source: "fixture", underlying_value: 23_477.8, strike: 23_450, option_type: "CE", last_price: 100 },
      { snapshot_id: "101", captured_at: "2026-09-10T03:46:00.000Z", source: "fixture", underlying_value: 23_477.8, strike: 23_450, option_type: "PE", last_price: 80 },
      { snapshot_id: "101", captured_at: "2026-09-10T03:46:00.000Z", source: "fixture", underlying_value: 23_477.8, strike: 23_500, option_type: "CE", last_price: null },
    ] : [],
  } as unknown as PrismaClient;
  const app = express(); registerTradingAnalytics(app, prisma);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const response = await fetch(`${base}/v1/trading-analytics/option-price-history?symbol=NIFTY&expiry=2026-09-15&asOf=2026-09-10T10:00:00Z`);
    assert.equal(response.status, 200);
    const body = await response.json() as { scope: string; points: Array<{ strike: number; side: string; price: number | null }>; liveOrdersEnabled: boolean; paperOrdersEnabled: boolean };
    assert.equal(body.scope, "ALL_STRIKES_CAPTURED_PER_SNAPSHOT");
    assert.deepEqual(body.points.map((point) => [point.strike, point.side, point.price]), [[23_450, "CE", 100], [23_450, "PE", 80], [23_500, "CE", null]]);
    assert.equal(body.liveOrdersEnabled, false);
    assert.equal(body.paperOrdersEnabled, false);
    const invalid = await fetch(`${base}/v1/trading-analytics/option-price-history?symbol=NIFTY`);
    assert.equal(invalid.status, 400);
    const mutation = await fetch(`${base}/v1/trading-analytics/option-price-history?symbol=NIFTY&expiry=2026-09-15`, { method: "POST" });
    assert.equal(mutation.status, 404);
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
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
    const badContext = await fetch(`${base}/v1/trading-analytics/scalper-context?symbol=bad symbol`);
    assert.equal(badContext.status, 400);
    const context = await fetch(`${base}/v1/trading-analytics/scalper-context`);
    assert.equal(context.status, 200);
    const contextBody = await context.json() as { paperOrdersEnabled: boolean; liveOrdersEnabled: boolean; errors: unknown[]; underlying: { symbol: string } };
    assert.equal(contextBody.underlying.symbol, "NIFTY");
    assert.equal(contextBody.paperOrdersEnabled, false);
    assert.equal(contextBody.liveOrdersEnabled, false);
    assert.ok(contextBody.errors.length > 0);
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
