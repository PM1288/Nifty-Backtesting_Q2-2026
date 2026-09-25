import assert from "node:assert/strict";
import test from "node:test";

import { buildHeaderStockTickerTape, buildHomeMw5Alerts, buildScalperScreenerSpreadsheet, getScalperProgression, projectedFullDayVolumeMultiple, projectedIntervalVolumeMultiple, SCALPER_PROGRESSION_CACHE_MS } from "./overview.js";

test("shared progression snapshot refreshes every thirty seconds", () => {
  assert.equal(SCALPER_PROGRESSION_CACHE_MS, 30_000);
});

const homeMw5Payload = () => ({
  generatedAt: "2026-09-25T05:54:30.000Z",
  sessionDate: "2026-09-25",
  scope: "CURRENT_NSE_STOCK_FNO_UNIVERSE" as const,
  basis: "test fixture",
  rows: [{
    symbol: "TEST", companyName: "Test", sector: "Test", currentValue: 110,
    currentMonthOpen: 100, previousMonthClose: 95, twoMonthsAgoClose: 90,
    currentWeekOpen: 105, previousWeekOpen: 101, todayOpen: 103,
    currentHourOpen: 109, previousHourOpen: 108, currentHourStartedAt: "2026-09-25T05:30:00.000Z",
    current15mOpen: 110, previous15mOpen: 109, current15mStartedAt: "2026-09-25T05:45:00.000Z",
    current5mOpen: 111, previous5mOpen: 110,
    v20VolumeMultiple: 1.2,
    current5mStartedAt: "2026-09-25T05:50:00.000Z", previous5mStartedAt: "2026-09-25T05:45:00.000Z",
    observedAt: "2026-09-25T05:54:15.000Z",
  }],
}) as unknown as Parameters<typeof buildHomeMw5Alerts>[0];

test("Home MW5 notification requires both monthly gates, all intraday price gates, and V20 above 1x", () => {
  const result = buildHomeMw5Alerts(homeMw5Payload(), new Date("2026-09-25T05:54:45.000Z"));
  assert.equal(result.length, 1);
  assert.equal(result[0].direction, "BULL");
  assert.equal(result[0].route, "M-2");
  assert.equal(result[0].payload.gates instanceof Array, true);
  assert.equal((result[0].payload.gates as Array<{ passed: boolean }>).every((gate) => gate.passed), true);
  assert.equal((result[0].payload.gates as Array<{ id: string }>).some((gate) => gate.id === "V20"), true);
  assert.equal(result[0].barStartedAt, "2026-09-25T05:50:00.000Z");
});

test("Home MW5 requires M-2 and V20 > 1x; intraday volume is not a gate", () => {
  const m2Fail = homeMw5Payload();
  m2Fail.rows[0].twoMonthsAgoClose = 105;
  assert.equal(buildHomeMw5Alerts(m2Fail, new Date("2026-09-25T05:54:45.000Z")).length, 0);
  const atOne = homeMw5Payload();
  atOne.rows[0].v20VolumeMultiple = 1;
  assert.equal(buildHomeMw5Alerts(atOne, new Date("2026-09-25T05:54:45.000Z")).length, 0);
  const missingV20 = homeMw5Payload();
  missingV20.rows[0].v20VolumeMultiple = null;
  assert.equal(buildHomeMw5Alerts(missingV20, new Date("2026-09-25T05:54:45.000Z")).length, 0);
  const lowIntraday = homeMw5Payload();
  lowIntraday.rows[0].intradayVolumeMultiple = 0.1;
  assert.equal(buildHomeMw5Alerts(lowIntraday, new Date("2026-09-25T05:54:45.000Z")).length, 1);

  const incomplete = homeMw5Payload();
  incomplete.rows[0].previous15mOpen = null;
  assert.equal(buildHomeMw5Alerts(incomplete, new Date("2026-09-25T05:54:45.000Z")).length, 0);
  assert.equal(buildHomeMw5Alerts(homeMw5Payload(), new Date("2026-09-25T06:20:00.000Z")).length, 0);
});

test("Home MW5 evaluates the inverse Bear gates and rejects zero-valued price evidence", () => {
  const bearish = homeMw5Payload();
  Object.assign(bearish.rows[0], {
    currentMonthOpen: 90, previousMonthClose: 100, twoMonthsAgoClose: 95,
    currentValue: 80, currentWeekOpen: 85, previousWeekOpen: 82, todayOpen: 83,
    currentHourOpen: 79, previousHourOpen: 80, current15mOpen: 78, previous15mOpen: 79,
    current5mOpen: 77, previous5mOpen: 78,
  });
  const result = buildHomeMw5Alerts(bearish, new Date("2026-09-25T05:54:45.000Z"));
  assert.equal(result.length, 1);
  assert.equal(result[0].direction, "BEAR");

  const zero = homeMw5Payload();
  zero.rows[0].previousMonthClose = 0;
  assert.equal(buildHomeMw5Alerts(zero, new Date("2026-09-25T05:54:45.000Z")).length, 0);
});

test("projected volume compares an as-of session pace with the prior 20-day daily SMA", () => {
  const now = new Date("2026-09-18T06:45:00.000Z"); // 12:15 IST, 180/375 minutes
  assert.equal(projectedFullDayVolumeMultiple(960_000, 1_000_000, now, now), 2);
  assert.equal(projectedFullDayVolumeMultiple(480_000, 1_000_000, now, now), 1);
  assert.equal(projectedFullDayVolumeMultiple(2_200_000, 1_000_000, new Date("2026-09-17T10:00:00.000Z"), now), 2.2);
  assert.equal(projectedFullDayVolumeMultiple(null, 1_000_000, now, now), null);
  assert.equal(projectedFullDayVolumeMultiple(100, 0, now, now), null);
});

test("forming 15-minute volume is projected before comparing with the prior 15-bucket SMA", () => {
  const started = new Date("2026-09-18T05:00:00.000Z");
  assert.equal(projectedIntervalVolumeMultiple(500, 1_000, started, 15, new Date("2026-09-18T05:07:30.000Z")), 1);
  assert.equal(projectedIntervalVolumeMultiple(2_000, 1_000, started, 15, new Date("2026-09-18T05:15:00.000Z")), 2);
  assert.equal(projectedIntervalVolumeMultiple(null, 1_000, started), null);
});

test("header ticker contains stock quotes and never repeats index context", () => {
  const ticker = buildHeaderStockTickerTape([
    { symbol: "IDEA", last: 15.25, change_pct: 8.54, timestamp: "2026-08-25T10:00:00Z" },
    { symbol: "OFSS", last: 11_729, change_pct: 1.08, timestamp: "2026-08-25T10:00:00Z" },
    { symbol: "NIFTY50", last: 24_142.55, change_pct: -0.32, timestamp: "2026-08-25T10:00:00Z" },
    { symbol: "INDIAVIX", last: 12.5, change_pct: 2.1, timestamp: "2026-08-25T10:00:00Z" }
  ]);

  assert.deepEqual(ticker, [
    { symbol: "IDEA", last: 15.25, changePct: 8.54 },
    { symbol: "OFSS", last: 11_729, changePct: 1.08 }
  ]);
});

test("home scalper progression preserves period references, zero and missingness", async () => {
  const payload = await getScalperProgression({
    $queryRaw: async () => [{
      symbol: "TEST",
      company_name: "Test Industries",
      sector: "Industrials",
      current_value: "125.50",
      today_open: 120,
      today_close: 125,
      previous_day_open: 117,
      previous_day_close: 119,
      current_week_open: 118,
      current_week_close: 125,
      previous_week_open: 115,
      previous_week_close: 117,
      two_weeks_ago_open: 112,
      two_weeks_ago_close: 114,
      current_month_open: 110,
      current_month_close: 125,
      previous_month_open: 100,
      previous_month_close: 0,
      two_months_ago_open: 90,
      two_months_ago_close: null,
      current_hour_open: 124,
      previous_hour_open: 123,
      current_hour_started_at: "2026-09-11T05:30:00Z",
      previous_hour_started_at: "2026-09-11T04:30:00Z",
      current_15m_open: 125,
      previous_15m_open: 124,
      current_15m_started_at: "2026-09-11T05:45:00Z",
      previous_15m_started_at: "2026-09-11T05:30:00Z",
      current_15m_volume: 2000,
      average_15m_volume_15: 1000,
      current_5m_open: 126,
      previous_5m_open: 125,
      current_5m_started_at: "2026-09-11T05:50:00Z",
      previous_5m_started_at: "2026-09-11T05:45:00Z",
      history_through: "2026-09-11",
      observed_at: "2026-09-11T03:15:00Z",
      current_volume: null,
      average_volume_20: null,
    }],
  } as never);

  assert.equal(payload.scope, "CURRENT_NSE_STOCK_FNO_UNIVERSE");
  assert.deepEqual(payload.rows, [{
    symbol: "TEST",
    companyName: "Test Industries",
    sector: "Industrials",
    currentValue: 125.5,
    todayOpen: 120,
    todayClose: 125,
    previousDayOpen: 117,
    previousDayClose: 119,
    currentWeekOpen: 118,
    currentWeekClose: 125,
    previousWeekOpen: 115,
    previousWeekClose: 117,
    twoWeeksAgoOpen: 112,
    twoWeeksAgoClose: 114,
    currentMonthOpen: 110,
    currentMonthClose: 125,
    previousMonthOpen: 100,
    previousMonthClose: 0,
    twoMonthsAgoOpen: 90,
    twoMonthsAgoClose: null,
    currentHourOpen: 124,
    previousHourOpen: 123,
    currentHourStartedAt: "2026-09-11T05:30:00.000Z",
    previousHourStartedAt: "2026-09-11T04:30:00.000Z",
    current15mOpen: 125,
    previous15mOpen: 124,
    current15mStartedAt: "2026-09-11T05:45:00.000Z",
    previous15mStartedAt: "2026-09-11T05:30:00.000Z",
    current15mVolume: 2000,
    average15mVolume15: 1000,
    intradayVolumeMultiple: 2,
    current5mOpen: 126,
    previous5mOpen: 125,
    current5mStartedAt: "2026-09-11T05:50:00.000Z",
    previous5mStartedAt: "2026-09-11T05:45:00.000Z",
    historyThrough: "2026-09-11T00:00:00.000Z",
    observedAt: "2026-09-11T03:15:00.000Z",
    v20VolumeMultiple: null,
    conditions: [
      { code: "M2_RED", label: "Two months ago close < open", left: null, operator: "<", right: 90, state: "UNAVAILABLE" },
      { code: "M1_GREEN", label: "Previous-month close > previous-month open", left: 0, operator: ">", right: 100, state: "FAIL" },
      { code: "D0_OPEN_ABOVE_W0_OPEN", label: "Today open > current-week open", left: 120, operator: ">", right: 118, state: "PASS" },
      { code: "D0_OPEN_ABOVE_W1_OPEN", label: "Today open > previous-week open", left: 120, operator: ">", right: 115, state: "PASS" },
      { code: "D0_OPEN_ABOVE_D1_OPEN", label: "Today open > previous-day open", left: 120, operator: ">", right: 117, state: "PASS" },
    ],
    passedConditionCount: 3,
    availableConditionCount: 4,
  }]);

  const workbook = buildScalperScreenerSpreadsheet(payload);
  assert.match(workbook, /Worksheet ss:Name="Current month"/);
  assert.match(workbook, /Current month close \/ as-of/);
  assert.match(workbook, /Previous month open/);
  assert.match(workbook, /Two weeks ago close/);
  assert.match(workbook, /Latest clock-hour open/);
  assert.match(workbook, /Previous contiguous 15-minute open/);
  assert.match(workbook, /M2 red state/);
  assert.match(workbook, />UNAVAILABLE</);
  assert.match(workbook, /ss:Type="Number">0<\/Data>/);
  assert.doesNotMatch(workbook, /undefined|null/);
});
