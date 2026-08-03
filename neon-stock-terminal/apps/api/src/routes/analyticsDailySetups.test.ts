import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { registerAnalyticsDailySetups } from "./analyticsDailySetups";

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
  registerAnalyticsDailySetups(app, prisma);
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

test("analytics daily setups route returns ranked setup payload", async () =>
  withServer(
    [
      [
        {
          trade_date: "2026-04-02",
          market_regime: "risk_on",
          breakout_count: 72,
          breakdown_count: 50,
          accumulation_count: 15,
          distribution_count: 19,
          positive_ratio: 0.61,
          avg_daily_return: 0.011
        }
      ],
      [
        {
          trade_date: "2026-04-02",
          market_regime: "risk_on",
          symbol: "SIEMENS",
          security_name: "Siemens Ltd",
          close_price: 3120,
          daily_return: 0.021,
          volume_rel_20: 1.8,
          delivery_rel_20: 1.12,
          distance_from_52w_high_pct: 3.2,
          breakout_20d_flag: true,
          breakdown_20d_flag: false,
          high_volume_flag: true,
          high_delivery_flag: true,
          has_announcement: false,
          has_board_meeting: false,
          has_corporate_action: false,
          composite_trend_score: 74,
          composite_reversal_score: 22,
          composite_anomaly_score: 10,
          composite_risk_score: 15,
          analysis_type: "momentum_breakout",
          signal_name: "breakout_20d",
          signal_direction: "bullish",
          signal_strength: 82,
          rationale: "Fresh breakout with volume confirmation",
          sample_size: 1326,
          hit_rate_1d: 56,
          hit_rate_3d: 54,
          hit_rate_5d: 52,
          hit_rate_10d: 50,
          avg_fwd_return_1d: 0.004,
          avg_fwd_return_3d: 0.006,
          avg_fwd_return_5d: 0.008,
          avg_fwd_return_10d: 0.01
        },
        {
          trade_date: "2026-04-02",
          market_regime: "risk_on",
          symbol: "SPIKECO",
          security_name: "Spike Co",
          close_price: 220,
          daily_return: 0.18,
          volume_rel_20: 0.7,
          delivery_rel_20: 0.62,
          distance_from_52w_high_pct: 1.5,
          breakout_20d_flag: true,
          breakdown_20d_flag: false,
          high_volume_flag: false,
          high_delivery_flag: false,
          has_announcement: true,
          has_board_meeting: false,
          has_corporate_action: false,
          composite_trend_score: 28,
          composite_reversal_score: 64,
          composite_anomaly_score: 72,
          composite_risk_score: 77,
          analysis_type: "delivery_conviction",
          signal_name: "speculative_rise",
          signal_direction: "caution",
          signal_strength: 44,
          rationale: "One-candle spike on poor structure",
          sample_size: 83,
          hit_rate_1d: 42,
          hit_rate_3d: 38,
          hit_rate_5d: 36,
          hit_rate_10d: 34,
          avg_fwd_return_1d: -0.01,
          avg_fwd_return_3d: -0.018,
          avg_fwd_return_5d: -0.03,
          avg_fwd_return_10d: -0.04
        }
      ],
      [{ trade_date: "2026-04-02", market_regime: "risk_on", breakout_count: 72, breakdown_count: 50 }],
      [{ bucket_label: "1.2-2.0x", bucket_order: 3, sample_size: 100, hit_rate_5d: 54, avg_forward_return_1d: 0.002, avg_forward_return_3d: 0.004, avg_forward_return_5d: 0.006, avg_forward_return_10d: 0.007, median_forward_return_5d: 0.005 }],
      [{ bucket_label: "1.0-1.25x", bucket_order: 3, sample_size: 100, hit_rate_5d: 53, avg_forward_return_1d: 0.002, avg_forward_return_3d: 0.003, avg_forward_return_5d: 0.004, avg_forward_return_10d: 0.005, median_forward_return_5d: 0.004 }],
      [{ bucket_label: "0-5%", bucket_order: 1, sample_size: 100, hit_rate_5d: 55, avg_forward_return_1d: 0.003, avg_forward_return_3d: 0.004, avg_forward_return_5d: 0.005, avg_forward_return_10d: 0.007, median_forward_return_5d: 0.004 }],
      [{ analysis_type: "momentum_breakout", signal_name: "breakout_20d", signal_direction: "bullish", sample_size: 1326, hit_rate_1d: 56, hit_rate_3d: 54, hit_rate_5d: 52, hit_rate_10d: 50, avg_fwd_return_1d: 0.004, avg_fwd_return_3d: 0.006, avg_fwd_return_5d: 0.008, avg_fwd_return_10d: 0.01 }],
      [{ analysis_type: "momentum_breakout", signal_name: "breakout_20d", signal_direction: "bullish", market_regime: "risk_on", sample_size: 1326, avg_1d: 0.004, avg_3d: 0.006, avg_5d: 0.008, avg_10d: 0.01 }]
    ],
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/v1/analytics/daily-setups`);
      assert.equal(response.status, 200);

      const payload = (await response.json()) as {
        tradeDate: string | null;
        marketContext: { marketRegime: string } | null;
        summary: { activeSetupCount: number; constructiveCount: number; deceptiveCount: number } | null;
        bestCurrentSetups: Array<{ symbol: string; qualityLabel: string; setupStyle: string }>;
        deceptiveSetups: Array<{ symbol: string; qualityLabel: string }>;
        signalHitRates: unknown[];
        regimePerformance: unknown[];
      };

      assert.equal(calls.count, 8);
      assert.equal(payload.tradeDate, "2026-04-02");
      assert.equal(payload.marketContext?.marketRegime, "Risk On");
      assert.equal(payload.summary?.activeSetupCount, 2);
      assert.equal(payload.summary?.constructiveCount, 1);
      assert.equal(payload.summary?.deceptiveCount, 1);
      assert.equal(payload.bestCurrentSetups[0]?.symbol, "SIEMENS");
      assert.equal(payload.bestCurrentSetups[0]?.qualityLabel, "constructive");
      assert.equal(payload.bestCurrentSetups[0]?.setupStyle, "breakout continuation");
      assert.equal(payload.deceptiveSetups[0]?.symbol, "SPIKECO");
      assert.equal(payload.deceptiveSetups[0]?.qualityLabel, "deceptive");
      assert.equal(payload.signalHitRates.length, 1);
      assert.equal(payload.regimePerformance.length, 1);
    }
  ));

test("analytics daily setups route returns empty payload when market context is missing", async () =>
  withServer([[]], async (baseUrl, calls) => {
    const response = await fetch(`${baseUrl}/v1/analytics/daily-setups`);
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      tradeDate: string | null;
      marketContext: unknown;
      currentSetups: unknown[];
    };

    assert.equal(calls.count, 1);
    assert.equal(payload.tradeDate, null);
    assert.equal(payload.marketContext, null);
    assert.deepEqual(payload.currentSetups, []);
  }));
