import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { registerAnalyticsFiiFlow } from "./analyticsFiiFlow";

async function withServer(
  queryResults: unknown[],
  run: (baseUrl: string, calls: { count: number }) => Promise<void>
) {
  const calls = { count: 0 };
  const prisma = {
    async $queryRaw() {
      const next = queryResults[calls.count];
      calls.count += 1;
      return next;
    }
  } as any;

  const app = express();
  registerAnalyticsFiiFlow(app, prisma);
  const server = app.listen(0);

  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`, calls);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

test("analytics fii flow route returns a teaching payload", async () =>
  withServer(
    [
      [
        { trade_date: "2026-03-27", client_type: "FII", total_long_contracts: 5000000, total_short_contracts: 4500000, loaded_at: "2026-03-27T12:00:00.000Z" },
        { trade_date: "2026-03-27", client_type: "Client", total_long_contracts: 7000000, total_short_contracts: 3500000, loaded_at: "2026-03-27T12:00:00.000Z" },
        { trade_date: "2026-03-27", client_type: "DII", total_long_contracts: 400000, total_short_contracts: 3900000, loaded_at: "2026-03-27T12:00:00.000Z" },
        { trade_date: "2026-03-27", client_type: "Pro", total_long_contracts: 2600000, total_short_contracts: 2500000, loaded_at: "2026-03-27T12:00:00.000Z" },
        { trade_date: "2026-03-30", client_type: "FII", total_long_contracts: 5134114, total_short_contracts: 4294717, loaded_at: "2026-03-30T12:00:00.000Z" },
        { trade_date: "2026-03-30", client_type: "Client", total_long_contracts: 6518349, total_short_contracts: 3873927, loaded_at: "2026-03-30T12:00:00.000Z" },
        { trade_date: "2026-03-30", client_type: "DII", total_long_contracts: 449147, total_short_contracts: 4223261, loaded_at: "2026-03-30T12:00:00.000Z" },
        { trade_date: "2026-03-30", client_type: "Pro", total_long_contracts: 2772576, total_short_contracts: 2482281, loaded_at: "2026-03-30T12:00:00.000Z" }
      ],
      [
        { trade_date: "2026-03-27", client_type: "FII", total_long_contracts: 2000000, total_short_contracts: 1900000, loaded_at: "2026-03-27T12:00:00.000Z" },
        { trade_date: "2026-03-27", client_type: "Client", total_long_contracts: 3100000, total_short_contracts: 2500000, loaded_at: "2026-03-27T12:00:00.000Z" },
        { trade_date: "2026-03-27", client_type: "DII", total_long_contracts: 150000, total_short_contracts: 950000, loaded_at: "2026-03-27T12:00:00.000Z" },
        { trade_date: "2026-03-27", client_type: "Pro", total_long_contracts: 1200000, total_short_contracts: 1180000, loaded_at: "2026-03-27T12:00:00.000Z" },
        { trade_date: "2026-03-30", client_type: "FII", total_long_contracts: 2500000, total_short_contracts: 2100000, loaded_at: "2026-03-30T12:00:00.000Z" },
        { trade_date: "2026-03-30", client_type: "Client", total_long_contracts: 3000000, total_short_contracts: 2000000, loaded_at: "2026-03-30T12:00:00.000Z" },
        { trade_date: "2026-03-30", client_type: "DII", total_long_contracts: 120000, total_short_contracts: 1200000, loaded_at: "2026-03-30T12:00:00.000Z" },
        { trade_date: "2026-03-30", client_type: "Pro", total_long_contracts: 1100000, total_short_contracts: 1000000, loaded_at: "2026-03-30T12:00:00.000Z" }
      ],
      [
        { trade_date: "2026-03-30", fii_derivatives: "INDEX OPTIONS", buy_value_in_cr: 3958218.76, sell_value_in_cr: 3966946.95, open_contracts_value_in_cr: 242247.63, loaded_at: "2026-03-30T12:00:00.000Z" },
        { trade_date: "2026-03-30", fii_derivatives: "NIFTY FUTURES", buy_value_in_cr: 11856.28, sell_value_in_cr: 16595.09, open_contracts_value_in_cr: 42607.69, loaded_at: "2026-03-30T12:00:00.000Z" },
        { trade_date: "2026-03-30", fii_derivatives: "STOCK FUTURES", buy_value_in_cr: 43278.52, sell_value_in_cr: 39055.05, open_contracts_value_in_cr: 415158.46, loaded_at: "2026-03-30T12:00:00.000Z" }
      ],
      [
        { trade_date: "2026-03-27", close_price: 23500, prev_close: 23000, loaded_at: "2026-03-27T12:00:00.000Z" },
        { trade_date: "2026-03-30", close_price: 23800, prev_close: 23500, loaded_at: "2026-03-30T12:00:00.000Z" },
        { trade_date: "2026-03-31", close_price: 24100, prev_close: 23800, loaded_at: "2026-03-31T12:00:00.000Z" }
      ],
      [
        { market_date: "2026-03-27", participant_type: "FII/FPI", buy_value: 1200, sell_value: 1000, net_value: 200, exchange_scope: "nse_only", source_dataset: "nse_fii_dii_nse_only" },
        { market_date: "2026-03-27", participant_type: "DII", buy_value: 900, sell_value: 1000, net_value: -100, exchange_scope: "nse_only", source_dataset: "nse_fii_dii_nse_only" },
        { market_date: "2026-03-30", participant_type: "FII/FPI", buy_value: 1100, sell_value: 1000, net_value: 100, exchange_scope: "nse_only", source_dataset: "nse_fii_dii_nse_only" },
        { market_date: "2026-03-30", participant_type: "DII", buy_value: 1300, sell_value: 1000, net_value: 300, exchange_scope: "nse_only", source_dataset: "nse_fii_dii_nse_only" }
      ],
      [
        { source_id: "cash_fii_dii", source_label: "NSE cash FII/DII", latest_market_date: "2026-03-30", latest_refresh_at: "2026-03-31T03:00:00.000Z", row_count: 4, cadence: "DAILY" },
        { source_id: "participant_oi", source_label: "NSE participant derivatives OI", latest_market_date: "2026-03-30", latest_refresh_at: null, row_count: 8, cadence: "DAILY" }
      ]
    ],
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/v1/analytics/fii-flow`);
      assert.equal(response.status, 200);

      const payload = (await response.json()) as {
        latestTradeDate: string | null;
        latestCashTradeDate: string | null;
        backdrop: string;
        summary: { regimeLabel: string; reportLagNote: string } | null;
        participants: Array<{ clientType: string; oiNetPct: number | null }>;
        divergences: Array<{ title: string }>;
        percentileBuckets: Array<{ label: string; sampleSize: number }>;
        diagnostics: { sampleSize: number };
        cashCoverage: { expectedRecentSessions: number; availableRecentSessions: number; missingTradeDates: string[] };
        sourceStatus: Array<{ sourceId: string; freshness: string }>;
        charts: {
          clientLongShortMatrix: unknown[];
          fiiVsClientSpread: unknown[];
          productValueByProduct: unknown[];
          positioningPercentile: unknown[];
          regimeOverlay: unknown[];
          dayOverDayPositioningChange: unknown[];
          cashFlowTrend: Array<{ tradeDate: string; fiiNetCr: number; diiNetCr: number; cumulativeFiiCr: number }>;
        };
      };

      assert.equal(calls.count, 6);
      assert.equal(payload.latestTradeDate, "2026-03-30");
      assert.equal(payload.latestCashTradeDate, "2026-03-30");
      assert.ok(["supportive", "contrarian", "stretched", "neutral"].includes(payload.backdrop));
      assert.ok(payload.summary?.regimeLabel);
      assert.ok(payload.summary?.reportLagNote.includes("daily context layer"));
      assert.equal(payload.participants.length, 4);
      assert.equal(payload.participants[0]?.clientType, "FII");
      assert.ok(payload.divergences.length >= 1);
      assert.equal(payload.percentileBuckets.length, 5);
      assert.equal(payload.diagnostics.sampleSize, 2);
      assert.equal(payload.charts.clientLongShortMatrix.length, 4);
      assert.equal(payload.charts.fiiVsClientSpread.length, 2);
      assert.equal(payload.charts.productValueByProduct.length, 3);
      assert.equal(payload.charts.positioningPercentile.length, 2);
      assert.equal(payload.charts.regimeOverlay.length, 2);
      assert.ok(payload.charts.dayOverDayPositioningChange.length >= 4);
      assert.equal(payload.charts.cashFlowTrend.length, 2);
      assert.equal(payload.charts.cashFlowTrend[1]?.fiiNetCr, 100);
      assert.equal(payload.charts.cashFlowTrend[1]?.diiNetCr, 300);
      assert.equal(payload.charts.cashFlowTrend[1]?.cumulativeFiiCr, 300);
      assert.deepEqual(payload.cashCoverage.missingTradeDates, ["2026-03-31"]);
      assert.equal(payload.sourceStatus.length, 2);
    }
  ));

test("analytics fii flow route returns an empty teaching payload when no OI rows exist", async () =>
  withServer([[], [], [], [], [], []], async (baseUrl, calls) => {
    const response = await fetch(`${baseUrl}/v1/analytics/fii-flow`);
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      latestTradeDate: unknown;
      summary: unknown;
      participants: unknown[];
      charts: { clientLongShortMatrix: unknown[] };
      backdrop: string;
    };

    assert.equal(calls.count, 6);
    assert.equal(payload.latestTradeDate, null);
    assert.equal(payload.summary, null);
    assert.equal(payload.backdrop, "neutral");
    assert.deepEqual(payload.participants, []);
    assert.deepEqual(payload.charts.clientLongShortMatrix, []);
  }));
