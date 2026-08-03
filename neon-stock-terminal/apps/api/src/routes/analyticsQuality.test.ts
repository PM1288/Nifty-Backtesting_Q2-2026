import test from "node:test";
import assert from "node:assert/strict";
import { getAnalyticsQuality } from "./analytics";

test("analytics quality payload suppresses stale modules and exposes trust charts", async () => {
  const queryResults: unknown[] = [
    [
      { source_key: "security_daily_features", label: "Daily features", last_seen_date: "2026-04-02", last_loaded_at: "2026-04-04T10:00:00.000Z", recent_rows: 99 },
      { source_key: "nse_event_calendar", label: "Event calendar", last_seen_date: "2025-12-19", last_loaded_at: "2026-04-04T10:00:00.000Z", recent_rows: 0 }
    ],
    [
      {
        expected_count: 100,
        eod_latest_date: "2026-04-02",
        eod_actual_count: 99,
        feature_latest_date: "2026-04-02",
        feature_actual_count: 99,
        signal_latest_date: "2026-04-02",
        signal_actual_count: 52,
        reco_latest_date: "2026-04-02",
        reco_actual_count: 99,
        intraday_latest_date: "2026-04-02",
        intraday_actual_count: 99,
        intraday_expected_bars: 217,
        intraday_latest_minute_symbols: 92,
        intraday_partial_symbols: 8,
        bars_latest_date: "2026-04-02",
        bars_actual_count: 0,
        option_latest_date: "2026-04-03",
        option_snapshot_count: 438,
        pcr_latest_date: "2026-04-03",
        max_pain_latest_date: "2026-03-08",
        equilibrium_latest_date: "2026-03-07",
        fii_latest_date: "2026-03-30",
        fii_actual_count: 5,
        event_latest_date: "2025-12-19",
        event_recent_count: 0,
        fin_latest_date: "2025-02-17",
        fin_recent_count: 0,
        corp_latest_date: "2025-12-18",
        corp_recent_count: 0,
        bucket_latest_date: null,
        bucket_count: 0
      }
    ],
    [
      { trade_date: "2026-04-03", eod_present: false, feature_present: false, signal_present: false, reco_present: false, intraday_present: false, options_present: true, fii_present: false, catalyst_present: false, strategy_present: false },
      { trade_date: "2026-04-02", eod_present: true, feature_present: true, signal_present: true, reco_present: true, intraday_present: true, options_present: true, fii_present: false, catalyst_present: false, strategy_present: false }
    ],
    [{ trade_date: "2026-04-02", symbol: "INFY", bars_seen: 216, bars_expected: 217, missing_bars: 1 }],
    [{ job_date: "2026-04-03", job_name: "refresh-backtesting", status: "failed", count: 2 }],
    [{ latest_pre_date: "2024-07-05", earliest_post_date: "2024-07-08", latest_post_date: "2026-04-02", overlap_dates: ["2024-07-08"] }],
    [{ job_run_id: 11, job_name: "refresh-all", started_at: "2026-04-04T09:00:00.000Z", finished_at: "2026-04-04T09:15:00.000Z", status: "success", notes: "ok" }],
    [{ check_name: "intraday_coverage", severity: "high", status: "failed", observed_value: 92, operator: ">=", threshold: 100, checked_at: "2026-04-04T09:16:00.000Z" }],
    [{ report_name: "bhavcopy_udiff", latest_source_date: "2026-04-02", latest_loaded_at: "2026-04-04T09:20:00.000Z", loaded_files_15d: 10, failed_files_15d: 0, rows_loaded_15d: 5000 }]
  ];

  let callIndex = 0;
  const prisma = {
    async $queryRaw() {
      const next = queryResults[callIndex];
      callIndex += 1;
      return next;
    }
  } as any;

  const payload = await getAnalyticsQuality(prisma);

  assert.equal(callIndex, 9);
  assert.equal(payload.expectedTradeDate, "2026-04-02");
  assert.equal(payload.summary.verdict, "mixed");
  assert.equal(payload.summary.hiddenModuleCount, 2);
  assert.ok(payload.summary.schemaBoundaryRisk.includes("2024-07-08"));
  assert.equal(payload.moduleStatus.find((item: { moduleKey: string }) => item.moduleKey === "market-state")?.status, "downgraded");
  assert.equal(payload.moduleStatus.find((item: { moduleKey: string }) => item.moduleKey === "stock-leadership")?.status, "downgraded");
  assert.equal(payload.moduleStatus.find((item: { moduleKey: string }) => item.moduleKey === "options-structure")?.status, "downgraded");
  assert.equal(payload.moduleStatus.find((item: { moduleKey: string }) => item.moduleKey === "event-context")?.status, "hidden");
  assert.equal(payload.charts.freshnessBySource.length, 2);
  assert.equal(payload.charts.coverageByModule.length, 7);
  assert.equal(payload.charts.missingBarHeatmap.length, 1);
  assert.equal(payload.charts.failedJobsTimeline.length, 1);
  assert.ok(payload.charts.missingDateLedger.some((row: { present: boolean }) => !row.present));
  assert.equal(payload.schemaBoundary.riskLabel, "medium");
});
