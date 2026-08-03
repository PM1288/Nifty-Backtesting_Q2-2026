import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { registerAnalyticsLeadership } from "./analyticsLeadership";

async function withServer(queryResults: unknown[], run: (baseUrl: string, calls: { count: number }) => Promise<void>) {
  const calls = { count: 0 };
  const prisma = {
    async $queryRaw() {
      const next = queryResults[calls.count];
      calls.count += 1;
      return next;
    }
  } as any;

  const app = express();
  registerAnalyticsLeadership(app, prisma);
  const server = app.listen(0);

  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`, calls);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

test("analytics leadership route ranks leaders and avoids", async () =>
  withServer(
    [
      [
        {
          trade_date: "2026-04-02",
          generated_at: "2026-04-02T10:00:00.000Z",
          primary_state: "high-volatility-chop",
          change_pct: 0.15,
          breadth_up_pct: 51.1,
          breadth_above_vwap_pct: 58.7,
          weighted_participation_pct: 48.9,
          top10_concentration_pct: 27.8
        }
      ],
      [
        {
          trade_date: "2026-04-02",
          minute_ts: "2026-04-02T10:00:00.000Z",
          symbol: "SIEMENS",
          sector_name: "Capital Goods",
          universe_weight: 0.9,
          security_name: "Siemens Ltd",
          last_price: 3120,
          absolute_return_pct: 2.1,
          residual_return_60m_pct: 1.4,
          residual_return_30m_pct: 0.8,
          relative_strength_bps: 120,
          above_vwap: true,
          time_above_vwap_pct: 82,
          vwap_hold_quality_score: 78,
          relative_strength_persistence_score: 77,
          range_efficiency_pct: 74,
          minute_volume_ratio: 1.4,
          cum_volume_vs_profile: 1.3,
          volume_curve_surprise: 165,
          close_location_quality_pct: 84,
          beta_20d: 0.9,
          beta_60d: 0.88,
          volume_ratio_day: 1.5,
          continuation_score: 81,
          weakness_score: 20,
          mean_reversion_score: 24,
          reversal_score: 18,
          dominant_signal: "continuation",
          direction: "up",
          conclusion: "Held VWAP with persistent residual strength",
          residual_leadership_score: 71,
          index_beta_follow_score: 25,
          vwap_control_score: 80,
          headline_spike_score: 18,
          catch_up_score: 32,
          volume_rel_20: 1.7,
          delivery_rel_20: 1.2,
          composite_trend_score: 74,
          composite_reversal_score: 29,
          composite_anomaly_score: 18,
          composite_risk_score: 21,
          has_announcement: false,
          max_bullish_signal: 80,
          max_bearish_signal: 22,
          trend_signal_strength: 77,
          reversal_signal_strength: 31,
          anomaly_signal_strength: 20
        },
        {
          trade_date: "2026-04-02",
          minute_ts: "2026-04-02T10:00:00.000Z",
          symbol: "BETAFAKE",
          sector_name: "Banks",
          universe_weight: 1.2,
          security_name: "Beta Fake Bank",
          last_price: 920,
          absolute_return_pct: 1.9,
          residual_return_60m_pct: 0.1,
          residual_return_30m_pct: 0.05,
          relative_strength_bps: 12,
          above_vwap: true,
          time_above_vwap_pct: 48,
          vwap_hold_quality_score: 44,
          relative_strength_persistence_score: 42,
          range_efficiency_pct: 35,
          minute_volume_ratio: 0.7,
          cum_volume_vs_profile: 0.8,
          volume_curve_surprise: 80,
          close_location_quality_pct: 52,
          beta_20d: 1.4,
          beta_60d: 1.3,
          volume_ratio_day: 0.8,
          continuation_score: 49,
          weakness_score: 33,
          mean_reversion_score: 42,
          reversal_score: 58,
          dominant_signal: "mixed",
          direction: "up",
          conclusion: "Looked strong but mostly tracked the index",
          residual_leadership_score: 28,
          index_beta_follow_score: 92,
          vwap_control_score: 40,
          headline_spike_score: 82,
          catch_up_score: 35,
          volume_rel_20: 0.7,
          delivery_rel_20: 0.8,
          composite_trend_score: 41,
          composite_reversal_score: 58,
          composite_anomaly_score: 74,
          composite_risk_score: 76,
          has_announcement: true,
          max_bullish_signal: 45,
          max_bearish_signal: 61,
          trend_signal_strength: 44,
          reversal_signal_strength: 60,
          anomaly_signal_strength: 70
        }
      ]
    ],
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/v1/analytics/leadership`);
      assert.equal(response.status, 200);

      const payload = (await response.json()) as {
        tradeDate: string | null;
        marketState: { dominantState: string; continuationBias: string } | null;
        coverage: { stockCount: number; sectorCount: number };
        summary: { trueLeaderCount: number; avoidCount: number } | null;
        topLeaders: Array<{ symbol: string; category: string }>;
        falseLeaders: Array<{ symbol: string; category: string }>;
      };

      assert.equal(calls.count, 2);
      assert.equal(payload.tradeDate, "2026-04-02");
      assert.equal(payload.marketState?.dominantState, "high-volatility-chop");
      assert.equal(payload.coverage.stockCount, 2);
      assert.equal(payload.coverage.sectorCount, 2);
      assert.equal(payload.summary?.trueLeaderCount, 1);
      assert.equal(payload.summary?.avoidCount, 1);
      assert.equal(payload.topLeaders[0]?.symbol, "SIEMENS");
      assert.equal(payload.topLeaders[0]?.category, "true leader");
      assert.equal(payload.falseLeaders[0]?.symbol, "BETAFAKE");
      assert.equal(payload.falseLeaders[0]?.category, "avoid / noisy");
    }
  ));

test("analytics leadership route returns empty payload when state is missing", async () =>
  withServer([[]], async (baseUrl, calls) => {
    const response = await fetch(`${baseUrl}/v1/analytics/leadership`);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      tradeDate: string | null;
      marketState: unknown;
      rankingBoard: unknown[];
    };
    assert.equal(calls.count, 1);
    assert.equal(payload.tradeDate, null);
    assert.equal(payload.marketState, null);
    assert.deepEqual(payload.rankingBoard, []);
  }));
