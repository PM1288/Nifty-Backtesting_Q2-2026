import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { registerAnalyticsOptionsStructure } from "./analyticsOptionsStructure";

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
  registerAnalyticsOptionsStructure(app, prisma);
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

test("analytics options structure route returns a teaching payload", async () =>
  withServer(
    [
      [
        {
          id: 1,
          captured_at: "2026-04-05T06:11:28.852Z",
          symbol: "NIFTY",
          expiry_date: "2026-04-07",
          underlying_value: 22713.1,
          atm_strike: 22700
        }
      ],
      [
        { strike: 22700, option_type: "CE", last_price: 120, implied_volatility: 26.35, total_traded_volume: 5000, open_interest: 35397, change_in_oi: 761, delta: 0.52, gamma: 0.000865 },
        { strike: 22700, option_type: "PE", last_price: 126, implied_volatility: 29.77, total_traded_volume: 5400, open_interest: 36016, change_in_oi: 2178, delta: -0.48, gamma: 0.000766 },
        { strike: 22800, option_type: "CE", last_price: 78, implied_volatility: 26.0, total_traded_volume: 7200, open_interest: 39383, change_in_oi: 7307, delta: 0.44, gamma: 0.000867 },
        { strike: 22500, option_type: "PE", last_price: 88, implied_volatility: 30.72, total_traded_volume: 8300, open_interest: 63652, change_in_oi: 19746, delta: -0.34, gamma: 0.000679 }
      ],
      [
        { expiry: "2026-04-07", ts: "2026-04-03T14:31:54.847Z", pcr: 1.03, ce_oi: 90327965, pe_oi: 93427425 }
      ],
      [
        { ts: "2026-04-03T14:31:54.847Z", pcr: 5.61 },
        { ts: "2026-04-03T14:26:54.840Z", pcr: 0.67 }
      ],
      [
        { expiry: "2026-03-10", updated_at: "2026-03-08T09:56:43.745Z", max_pain_strike: 22750, spot_price: 24469.4 }
      ],
      [
        { captured_at: "2026-04-05T06:09:28.959Z", expiry_date: "2026-04-07", underlying_value: 22713.1, option_type: "CE", strike: 22800, open_interest: 39000, change_in_oi: 7000 },
        { captured_at: "2026-04-05T06:09:28.959Z", expiry_date: "2026-04-07", underlying_value: 22713.1, option_type: "PE", strike: 22700, open_interest: 36000, change_in_oi: 2100 }
      ],
      [
        { expiry: "2026-04-07", ts: "2026-04-02T18:07:12.166Z", strike: 24550, iv: 43.96, delta: -0.9963, gamma: 0 }
      ],
      [
        { expiry: "2026-03-10", strike: 24650, ref_price: null, ce_norm: 50, pe_norm: 50, updated_at: "2026-03-07T01:25:00.000Z" }
      ],
      [
        { ts: "2026-03-07T01:25:00.000Z", expiry: "2026-03-10", ce_mean_norm: 50, pe_mean_norm: 50, ce_count: 77, pe_count: 77, lookback_minutes: 390 }
      ]
    ],
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/v1/analytics/options-structure`);
      assert.equal(response.status, 200);

      const payload = (await response.json()) as {
        symbol: string;
        latestSnapshot: { expiryDate: string | null; spot: number | null } | null;
        summary: { spotState: string; dataQualityFlags: string[] } | null;
        nearestCallWalls: Array<{ strike: number }>;
        nearestPutWalls: Array<{ strike: number }>;
        strikeLadder: Array<{ strike: number }>;
        pcrByExpiry: Array<{ expiry: string | null; pcr: number | null }>;
        maxPainDrift: Array<{ expiry: string | null }>;
        termStructure: Array<{ expiry: string | null }>;
        equilibrium: { current: { expiry: string | null } | null; meanSeries: Array<{ expiry: string | null }> };
      };

      assert.equal(calls.count, 9);
      assert.equal(payload.symbol, "NIFTY");
      assert.equal(payload.latestSnapshot?.expiryDate, "2026-04-07");
      assert.equal(payload.latestSnapshot?.spot, 22713.1);
      assert.equal(payload.summary?.spotState, "fighting structure");
      assert.ok(payload.summary?.dataQualityFlags.length);
      assert.equal(payload.nearestCallWalls[0]?.strike, 22700);
      assert.equal(payload.nearestPutWalls[0]?.strike, 22700);
      assert.equal(payload.strikeLadder.length, 3);
      assert.equal(payload.pcrByExpiry[0]?.expiry, "2026-04-07");
      assert.equal(payload.maxPainDrift[0]?.expiry, "2026-03-10");
      assert.equal(payload.termStructure[0]?.expiry, "2026-04-07");
      assert.equal(payload.equilibrium.current?.expiry, "2026-03-10");
      assert.equal(payload.equilibrium.meanSeries[0]?.expiry, "2026-03-10");
    }
  ));

test("analytics options structure route returns an empty payload when no snapshot exists", async () =>
  withServer([[]], async (baseUrl, calls) => {
    const response = await fetch(`${baseUrl}/v1/analytics/options-structure`);
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      latestSnapshot: unknown;
      strikeLadder: unknown[];
      summary: unknown;
    };

    assert.equal(calls.count, 1);
    assert.equal(payload.latestSnapshot, null);
    assert.deepEqual(payload.strikeLadder, []);
    assert.equal(payload.summary, null);
  }));
