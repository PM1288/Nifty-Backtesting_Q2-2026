import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { registerAnalyticsStrategyEvaluation } from "./analyticsStrategyEvaluation";

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
  registerAnalyticsStrategyEvaluation(app, prisma);
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

test("analytics strategy evaluation route returns a teaching payload", async () =>
  withServer(
    [
      [
        {
          trade_date: "2026-04-03",
          index_code: "NIFTY 50",
          horizon: "30m",
          symbol: "RELIANCE",
          asof_ts: "2026-04-03T09:45:00.000Z",
          signal_family: "trend_continuation",
          signal_quality: 72,
          regime_fit: 68,
          historical_edge: 61,
          risk_penalty: 11,
          anomaly_penalty: 4,
          final_score: 74,
          action: "buy_now",
          direction: "long",
          explanation: {},
          sector_name: "Energy"
        },
        {
          trade_date: "2026-04-03",
          index_code: "NIFTY 50",
          horizon: "30m",
          symbol: "INFY",
          asof_ts: "2026-04-03T09:45:00.000Z",
          signal_family: "relative_strength",
          signal_quality: 66,
          regime_fit: 63,
          historical_edge: 58,
          risk_penalty: 10,
          anomaly_penalty: 6,
          final_score: 68,
          action: "wait_for_pullback",
          direction: "long",
          explanation: {},
          sector_name: "Information Technology"
        },
        {
          trade_date: "2026-04-03",
          index_code: "NIFTY 50",
          horizon: "30m",
          symbol: "SBIN",
          asof_ts: "2026-04-03T09:45:00.000Z",
          signal_family: "mean_reversion",
          signal_quality: 49,
          regime_fit: 41,
          historical_edge: 35,
          risk_penalty: 24,
          anomaly_penalty: 16,
          final_score: 36,
          action: "avoid_despite_strength",
          direction: "neutral",
          explanation: {},
          sector_name: "Banks"
        }
      ],
      [
        {
          action: "buy_now",
          direction: "long",
          sample_count: 120,
          avg_ret_15m_pct: 0.18,
          avg_ret_30m_pct: 0.34,
          avg_ret_60m_pct: 0.61,
          avg_ret_close_pct: 0.78,
          win_rate_30m_pct: 59
        },
        {
          action: "avoid_despite_strength",
          direction: "neutral",
          sample_count: 58,
          avg_ret_15m_pct: -0.08,
          avg_ret_30m_pct: -0.19,
          avg_ret_60m_pct: -0.31,
          avg_ret_close_pct: -0.41,
          win_rate_30m_pct: 38
        }
      ],
      [
        {
          signal_family: "trend_continuation",
          sample_count: 94,
          hit_rate_pct: 61,
          avg_ret_15m_pct: 0.15,
          avg_ret_30m_pct: 0.29,
          avg_ret_60m_pct: 0.55,
          avg_ret_close_pct: 0.7
        },
        {
          signal_family: "relative_strength",
          sample_count: 88,
          hit_rate_pct: 58,
          avg_ret_15m_pct: 0.11,
          avg_ret_30m_pct: 0.22,
          avg_ret_60m_pct: 0.38,
          avg_ret_close_pct: 0.49
        }
      ],
      [
        {
          horizon: "30m",
          regime: "trend_up",
          signal_family: "trend_continuation",
          sample_count: 42,
          win_rate: 0.63,
          avg_return_pct: 0.41,
          p50_return_pct: 0.22
        },
        {
          horizon: "30m",
          regime: "trend_up",
          signal_family: "relative_strength",
          sample_count: 37,
          win_rate: 0.59,
          avg_return_pct: 0.28,
          p50_return_pct: 0.16
        }
      ],
      [
        { symbol: "RELIANCE", sector_name: "Energy" },
        { symbol: "INFY", sector_name: "Information Technology" },
        { symbol: "SBIN", sector_name: "Banks" }
      ],
      [
        {
          batch_run_id: 10,
          data_as_of_date: "2026-04-03",
          generated_at: "2026-04-03T18:30:00.000Z",
          stale_after: null,
          row_counts: {},
          validation_metrics: {}
        }
      ],
      [
        {
          strategy_version_id: "ver-1",
          scenario_key: "nifty_100:capital_10l",
          strategy_id: "strat-1",
          display_name: "Trend Continuation Core",
          archetype: "trend_continuation",
          universe_mode: "nifty_100",
          capital_mode: "capital_10l",
          as_of_date: "2026-04-03",
          version_number: 3,
          strategy_slug: "trend-core",
          compare_json: {
            currentValue: 1224000,
            realizedPnl: 198000,
            unrealizedPnl: 12000,
            totalReturnPct: 22.4,
            excessOverFd: 11.1,
            winRatePct: 57.3,
            totalClosedTrades: 154,
            openPositions: 5,
            maxDrawdownPct: -8.2,
            avgHoldDays: 3.6,
            minHoldDays: 1.1,
            maxHoldDays: 12.4,
            totalCharges: 42150,
            avgExposurePct: 63,
            topPerformingStock: "RELIANCE",
            worstPerformingStock: "SBIN",
            regimeStrengthSummary: {
              bestRegime: "trend_up",
              worstRegime: "volatile_chop"
            }
          }
        }
      ],
      [
        {
          strategy_version_id: "ver-1",
          scenario_key: "nifty_100:capital_10l",
          trade_date: "2026-04-01",
          active_positions: 4,
          deployed_capital: 640000,
          available_cash: 360000,
          market_value: 1005000,
          total_equity: 1005000,
          benchmark_value: 1000000,
          daily_return_pct: 0.5,
          drawdown_pct: 0
        },
        {
          strategy_version_id: "ver-1",
          scenario_key: "nifty_100:capital_10l",
          trade_date: "2026-04-02",
          active_positions: 5,
          deployed_capital: 680000,
          available_cash: 350000,
          market_value: 1020000,
          total_equity: 1020000,
          benchmark_value: 1007000,
          daily_return_pct: 1.49,
          drawdown_pct: 0
        },
        {
          strategy_version_id: "ver-1",
          scenario_key: "nifty_100:capital_10l",
          trade_date: "2026-04-03",
          active_positions: 5,
          deployed_capital: 710000,
          available_cash: 340000,
          market_value: 1012000,
          total_equity: 1012000,
          benchmark_value: 1009000,
          daily_return_pct: -0.78,
          drawdown_pct: -0.78
        }
      ],
      [
        {
          strategy_version_id: "ver-1",
          scenario_key: "nifty_100:capital_10l",
          regime_label: "trend_up",
          summary_json: {
            trade_count: 52,
            win_rate_pct: 61,
            avg_return_pct: 0.42,
            median_return_pct: 0.19,
            max_drawdown_contribution_pct: -2.1,
            avg_hold_days: 3.1,
            total_charges: 11500
          }
        },
        {
          strategy_version_id: "ver-1",
          scenario_key: "nifty_100:capital_10l",
          regime_label: "volatile_chop",
          summary_json: {
            trade_count: 27,
            win_rate_pct: 41,
            avg_return_pct: -0.18,
            median_return_pct: -0.09,
            max_drawdown_contribution_pct: -3.6,
            avg_hold_days: 2.4,
            total_charges: 9200
          }
        }
      ],
      [
        {
          strategy_version_id: "ver-1",
          scenario_key: "nifty_100:capital_10l",
          symbol: "RELIANCE",
          summary_json: {
            signal_count: 22,
            accepted_trades: 18,
            skipped_trades: 4,
            win_rate_pct: 63,
            avg_return_pct: 0.58,
            median_return_pct: 0.32,
            total_net_pnl: 52400,
            best_regime: "trend_up",
            worst_regime: "volatile_chop",
            last_signal_date: "2026-04-03",
            open_position_flag: true
          }
        },
        {
          strategy_version_id: "ver-1",
          scenario_key: "nifty_100:capital_10l",
          symbol: "INFY",
          summary_json: {
            signal_count: 19,
            accepted_trades: 14,
            skipped_trades: 5,
            win_rate_pct: 55,
            avg_return_pct: 0.31,
            median_return_pct: 0.14,
            total_net_pnl: 24300,
            best_regime: "trend_up",
            worst_regime: "range_low",
            last_signal_date: "2026-04-03",
            open_position_flag: false
          }
        },
        {
          strategy_version_id: "ver-1",
          scenario_key: "nifty_100:capital_10l",
          symbol: "SBIN",
          summary_json: {
            signal_count: 17,
            accepted_trades: 11,
            skipped_trades: 6,
            win_rate_pct: 39,
            avg_return_pct: -0.12,
            median_return_pct: -0.05,
            total_net_pnl: -9100,
            best_regime: "trend_down",
            worst_regime: "volatile_chop",
            last_signal_date: "2026-04-03",
            open_position_flag: false
          }
        }
      ],
      [
        {
          trade_date: "2026-04-03",
          regime: "trend_up",
          direction: "up",
          score: 74
        }
      ]
    ],
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/v1/analytics/strategy-evaluation`);
      assert.equal(response.status, 200);

      const payload = (await response.json()) as {
        asOfDate: string | null;
        horizon: string;
        summary: {
          currentRegime: string;
          signalCount: number;
          actionCounts: { buyNow: number };
          costNote: string;
        } | null;
        currentSetups: Array<{ symbol: string; confidenceLabel: string; expectancy: { sampleCount: number } }>;
        cautionSetups: Array<{ symbol: string }>;
        referenceStrategy: { displayName: string } | null;
        diagnostics: { currentSampleSize: number; historicalActionSamples: number };
        charts: {
          scoreDecomposition: unknown[];
          forwardReturnByActionDirection: unknown[];
          hitRateBySignalFamily: unknown[];
          equityCurveVsBenchmark: unknown[];
          drawdownCurve: unknown[];
          performanceByRegime: unknown[];
          sectorContribution: unknown[];
        };
      };

      assert.equal(calls.count, 11);
      assert.equal(payload.asOfDate, "2026-04-03");
      assert.equal(payload.horizon, "30m");
      assert.equal(payload.summary?.currentRegime, "Trend Up");
      assert.equal(payload.summary?.signalCount, 3);
      assert.equal(payload.summary?.actionCounts.buyNow, 1);
      assert.ok(payload.summary?.costNote.includes("charges"));
      assert.equal(payload.currentSetups.length, 3);
      assert.equal(payload.currentSetups[0]?.symbol, "RELIANCE");
      assert.equal(payload.currentSetups[0]?.expectancy.sampleCount, 42);
      assert.equal(payload.cautionSetups[0]?.symbol, "SBIN");
      assert.equal(payload.referenceStrategy?.displayName, "Trend Continuation Core");
      assert.equal(payload.diagnostics.currentSampleSize, 3);
      assert.equal(payload.diagnostics.historicalActionSamples, 178);
      assert.equal(payload.charts.scoreDecomposition.length, 3);
      assert.equal(payload.charts.forwardReturnByActionDirection.length, 2);
      assert.equal(payload.charts.hitRateBySignalFamily.length, 2);
      assert.equal(payload.charts.equityCurveVsBenchmark.length, 3);
      assert.equal(payload.charts.drawdownCurve.length, 3);
      assert.equal(payload.charts.performanceByRegime.length, 2);
      assert.equal(payload.charts.sectorContribution.length, 3);
    }
  ));

test("analytics strategy evaluation route returns an empty-but-valid payload when recommendation data is missing", async () =>
  withServer(
    [
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      []
    ],
    async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/v1/analytics/strategy-evaluation`);
      assert.equal(response.status, 200);

      const payload = (await response.json()) as {
        asOfDate: string | null;
        summary: unknown;
        currentSetups: unknown[];
        charts: { scoreDecomposition: unknown[]; sectorContribution: unknown[] };
      };

      assert.equal(calls.count, 6);
      assert.equal(payload.asOfDate, null);
      assert.equal(payload.summary, null);
      assert.deepEqual(payload.currentSetups, []);
      assert.deepEqual(payload.charts.scoreDecomposition, []);
      assert.deepEqual(payload.charts.sectorContribution, []);
    }
  ));
