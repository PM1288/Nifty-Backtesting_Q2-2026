import assert from "node:assert/strict";
import test from "node:test";
import { buildThreeMonthEvaluation } from "./threeMonthStrategy.js";

const daily = {
  symbol: "TEST", company_name: "Test", sector: "Industrials", session_date: "2026-09-18", observed_at: "2026-09-18T10:00:00Z",
  current_month_open: 100, current_month_close: 120, previous_month_open: 110, previous_month_close: 105,
  two_months_ago_open: 100, two_months_ago_close: 101, three_months_ago_open: 90, three_months_ago_close: 92,
  current_week_open: 112, current_week_close: 120, previous_week_open: 111,
  today_open: 116, today_close: 120, previous_day_open: 115,
};

test("3Month strategy requires all ten bullish gates and any one bearish prior month", () => {
  const result = buildThreeMonthEvaluation(daily, {
    hourCurrent: { open: 118, close: 121, startedAt: null, complete: true, index: 4 },
    hourPrevious: { open: 117, close: 118, startedAt: null, complete: true, index: 3 },
    fifteenCurrent: { open: 120, close: 122, startedAt: null, complete: true, index: 18 },
    fifteenPrevious: { open: 119, close: 120, startedAt: null, complete: true, index: 17 },
  });
  assert.equal(result.qualification, "QUALIFIED");
  assert.equal(result.passedGateCount, 10);
  assert.equal(result.weaknessState, "PASS");
  assert.equal(result.weaknessMonths.filter((item) => item.state === "PASS").length, 1);
});

test("all three bullish historical months reject while missing evidence remains incomplete", () => {
  const allGreen = buildThreeMonthEvaluation({ ...daily, previous_month_close: 111 });
  assert.equal(allGreen.weaknessState, "FAIL");
  assert.equal(allGreen.qualification, "REJECTED");
  assert.ok(allGreen.gates.slice(6).every((item) => item.state === "SKIPPED"));
  const missing = buildThreeMonthEvaluation({ ...daily, previous_month_open: null, previous_month_close: null, two_months_ago_open: null, two_months_ago_close: null, three_months_ago_open: null, three_months_ago_close: null });
  assert.equal(missing.weaknessState, "UNAVAILABLE");
  assert.equal(missing.qualification, "INCOMPLETE");
});

test("forming mode labels intraday evidence without changing the formula", () => {
  const result = buildThreeMonthEvaluation(daily, {
    hourCurrent: { open: 118, close: 121, startedAt: null, complete: false, index: 4 },
    hourPrevious: { open: 117, close: 118, startedAt: null, complete: true, index: 3 },
    fifteenCurrent: { open: 120, close: 122, startedAt: null, complete: false, index: 18 },
    fifteenPrevious: { open: 119, close: 120, startedAt: null, complete: true, index: 17 },
  }, "forming");
  assert.equal(result.qualification, "QUALIFIED");
  assert.ok(result.gates.slice(6).every((item) => item.forming));
});

test("forming mode does not relabel an already complete intraday candle", () => {
  const result = buildThreeMonthEvaluation(daily, {
    hourCurrent: { open: 118, close: 121, startedAt: null, complete: true, index: 4 },
    hourPrevious: { open: 117, close: 118, startedAt: null, complete: true, index: 3 },
    fifteenCurrent: { open: 120, close: 122, startedAt: null, complete: true, index: 18 },
    fifteenPrevious: { open: 119, close: 120, startedAt: null, complete: true, index: 17 },
  }, "forming");
  assert.ok(result.gates.slice(6).every((item) => !item.forming));
});
