import assert from "node:assert/strict";
import test from "node:test";

import { buildHeaderStockTickerTape, buildScalperScreenerSpreadsheet, getScalperProgression } from "./overview.js";

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
      current_5m_open: 126,
      previous_5m_open: 125,
      current_5m_started_at: "2026-09-11T05:50:00Z",
      previous_5m_started_at: "2026-09-11T05:45:00Z",
      history_through: "2026-09-11",
      observed_at: "2026-09-11T03:15:00Z",
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
    current5mOpen: 126,
    previous5mOpen: 125,
    current5mStartedAt: "2026-09-11T05:50:00.000Z",
    previous5mStartedAt: "2026-09-11T05:45:00.000Z",
    historyThrough: "2026-09-11T00:00:00.000Z",
    observedAt: "2026-09-11T03:15:00.000Z",
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
