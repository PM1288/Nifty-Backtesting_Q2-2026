import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { registerAnalyticsMarketState } from "./analyticsMarketState";

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
  registerAnalyticsMarketState(app, prisma);
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

test("analytics market state route returns latest session payload", async () =>
  withServer(
    [
      [
        {
          trade_date: "2026-04-02",
          index_code: "NIFTY 50",
          as_of_ts: "2026-04-02T10:00:00.000Z",
          index_name: "NIFTY 50",
          last_price: 22700.3,
          prev_close: 22701.35,
          change_pct: -0.004625,
          gap_pct: -1.456742,
          session_range_pct: 2.605572,
          close_location_pct: 86.196112,
          open_range_15_pct: 0.713614,
          breadth_up_pct: 51.086957,
          breadth_above_vwap_pct: 58.695652,
          breadth_above_or_high_pct: 81.521739,
          breadth_below_or_low_pct: 1.086957,
          dispersion_pct: 1.227522,
          weighted_participation_pct: 48.913043,
          top10_concentration_pct: 27.840398,
          participation_label: "balanced",
          primary_state: "high-volatility-chop",
          secondary_states_json: ["gap-fill", "chop"],
          confidence_score: 40,
          gap_filled: true,
          failed_open: true,
          late_day_reversal: false,
          high_volatility_chop: true,
          narrow_leadership: false,
          broad_participation: false,
          narrative: "Test narrative",
          generated_at: "2026-04-04T10:29:00.000Z"
        }
      ],
      [
        {
          minute_no: 1,
          minute_ts: "2026-04-02T03:45:00.000Z",
          minute_ist: "09:15",
          last_price: 22224.2,
          change_pct_from_prev_close: -2.101857,
          breadth_up_pct: 0,
          breadth_above_vwap_pct: null,
          weighted_participation_pct: 100,
          top10_concentration_pct: 16.794193
        },
        {
          minute_no: 217,
          minute_ts: "2026-04-02T10:00:00.000Z",
          minute_ist: "15:30",
          last_price: 22700.3,
          change_pct_from_prev_close: -0.004625,
          breadth_up_pct: 51.086957,
          breadth_above_vwap_pct: 58.695652,
          weighted_participation_pct: 48.913043,
          top10_concentration_pct: 27.840398
        }
      ],
      [
        {
          primary_state: "high-volatility-chop",
          session_count: 2,
          avg_session_change_pct: -1.3,
          avg_gap_pct: -0.4,
          avg_breadth_up_pct: 44.2,
          avg_breadth_above_vwap_pct: 47.1,
          avg_top10_concentration_pct: 28.4,
          avg_next_day_change_pct: -2.6,
          next_day_followthrough_pct: 0
        },
        {
          primary_state: "gap-and-go-up",
          session_count: 14,
          avg_session_change_pct: 1.2,
          avg_gap_pct: 0.6,
          avg_breadth_up_pct: 76.4,
          avg_breadth_above_vwap_pct: 68.9,
          avg_top10_concentration_pct: 21.3,
          avg_next_day_change_pct: 0.4,
          next_day_followthrough_pct: 64
        }
      ],
      [
        {
          trade_date: "2026-03-20",
          primary_state: "high-volatility-chop",
          change_pct: -0.8,
          gap_pct: -0.5,
          close_location_pct: 31.2,
          breadth_up_pct: 42.3,
          breadth_above_vwap_pct: 45.7,
          weighted_participation_pct: 46.1,
          top10_concentration_pct: 30.2,
          next_day_change_pct: -2.1,
          similarity_score: 8
        }
      ],
      [
        {
          index_code: "INDIA VIX",
          trade_date: "2026-04-02",
          close_px: 25.52,
          prev_close: 25.01
        },
        {
          index_code: "NIFTY 50",
          trade_date: "2026-04-02",
          close_px: 22713.1,
          prev_close: 22679.4
        }
      ]
    ],
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/v1/analytics/market-state`);
      assert.equal(response.status, 200);

      const payload = (await response.json()) as {
        tradeDate: string | null;
        session: { primaryState: string; secondaryStates: string[] };
        verdict: { dominantState: string; preferredEnvironment: string };
        minuteSeries: Array<{ minuteNo: number; sessionState: string }>;
        exactStateStats: { primaryState: string; sessionCount: number } | null;
        analogs: Array<{ tradeDate: string | null; similarityScore: number | null }>;
        officialContext: {
          nifty50: { changePct: number | null } | null;
          indiaVix: { changePct: number | null } | null;
        };
      };

      assert.equal(calls.count, 5);
      assert.equal(payload.tradeDate, "2026-04-02");
      assert.equal(payload.session.primaryState, "high-volatility-chop");
      assert.deepEqual(payload.session.secondaryStates, ["gap-fill", "chop"]);
      assert.equal(payload.verdict.dominantState, "high-volatility chop");
      assert.equal(payload.verdict.preferredEnvironment, "fade setups");
      assert.equal(payload.minuteSeries.length, 2);
      assert.equal(payload.minuteSeries[0]?.minuteNo, 1);
      assert.ok(payload.minuteSeries[1]?.sessionState.length);
      assert.equal(payload.exactStateStats?.primaryState, "high-volatility-chop");
      assert.equal(payload.exactStateStats?.sessionCount, 2);
      assert.equal(payload.analogs[0]?.tradeDate, "2026-03-20");
      assert.equal(payload.officialContext.nifty50?.changePct?.toFixed(4), "0.1486");
      assert.equal(payload.officialContext.indiaVix?.changePct?.toFixed(4), "2.0392");
    }
  ));

test("analytics market state route returns empty payload when no session exists", async () =>
  withServer([[]], async (baseUrl, calls) => {
    const response = await fetch(`${baseUrl}/v1/analytics/market-state`);
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      tradeDate: string | null;
      session: unknown;
      minuteSeries: unknown[];
      stateStats: unknown[];
    };

    assert.equal(calls.count, 1);
    assert.equal(payload.tradeDate, null);
    assert.equal(payload.session, null);
    assert.deepEqual(payload.minuteSeries, []);
    assert.deepEqual(payload.stateStats, []);
  }));
