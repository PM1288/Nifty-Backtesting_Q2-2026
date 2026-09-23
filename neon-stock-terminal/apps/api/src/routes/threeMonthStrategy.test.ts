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

test("3Month strategy scores twelve bullish gates plus one prior-month OR group", () => {
  const result = buildThreeMonthEvaluation(daily, {
    hourCurrent: { open: 118, close: 121, startedAt: null, complete: true, index: 4 },
    hourPrevious: { open: 117, close: 118, startedAt: null, complete: true, index: 3 },
    fifteenCurrent: { open: 120, close: 122, startedAt: null, complete: true, index: 18 },
    fifteenPrevious: { open: 119, close: 120, startedAt: null, complete: true, index: 17 },
    fiveCurrent: { open: 121, close: 123, startedAt: null, complete: true, index: 56 },
    fivePrevious: { open: 120, close: 121, startedAt: null, complete: true, index: 55 },
  });
  assert.equal(result.qualification, "QUALIFIED");
  assert.equal(result.passedGateCount, 12);
  assert.equal(result.scoredConditionCount, 13);
  assert.equal(result.availableConditionCount, 13);
  assert.equal(result.totalConditionCount, 13);
  assert.equal(result.weaknessState, "PASS");
  assert.equal(result.weaknessMonths.filter((item) => item.state === "PASS").length, 1);
});

test("all three bullish historical months reject while missing evidence remains incomplete", () => {
  const allGreen = buildThreeMonthEvaluation({ ...daily, previous_month_close: 111 });
  assert.equal(allGreen.weaknessState, "FAIL");
  assert.equal(allGreen.scoredConditionCount, 6);
  assert.equal(allGreen.availableConditionCount, 7);
  assert.equal(allGreen.qualification, "REJECTED");
  assert.ok(allGreen.gates.slice(6).every((item) => item.state === "SKIPPED"));
  const missing = buildThreeMonthEvaluation({ ...daily, previous_month_open: null, previous_month_close: null, two_months_ago_open: null, two_months_ago_close: null, three_months_ago_open: null, three_months_ago_close: null });
  assert.equal(missing.weaknessState, "UNAVAILABLE");
  assert.equal(missing.scoredConditionCount, 5);
  assert.equal(missing.availableConditionCount, 5);
  assert.equal(missing.qualification, "INCOMPLETE");
});

test("one passing historical month resolves the OR group as one point despite another missing month", () => {
  const result = buildThreeMonthEvaluation({
    ...daily,
    previous_month_open: 110,
    previous_month_close: 105,
    two_months_ago_open: null,
    two_months_ago_close: null,
  });
  assert.equal(result.weaknessState, "PASS");
  assert.equal(result.scoredConditionCount, 7);
  assert.equal(result.availableConditionCount, 7);
  assert.equal(result.totalConditionCount, 13);
  assert.equal(result.weaknessMonths.filter((item) => item.state === "PASS").length, 1);
});

test("forming mode labels intraday evidence without changing the formula", () => {
  const result = buildThreeMonthEvaluation(daily, {
    hourCurrent: { open: 118, close: 121, startedAt: null, complete: false, index: 4 },
    hourPrevious: { open: 117, close: 118, startedAt: null, complete: true, index: 3 },
    fifteenCurrent: { open: 120, close: 122, startedAt: null, complete: false, index: 18 },
    fifteenPrevious: { open: 119, close: 120, startedAt: null, complete: true, index: 17 },
    fiveCurrent: { open: 121, close: 123, startedAt: null, complete: false, index: 56 },
    fivePrevious: { open: 120, close: 121, startedAt: null, complete: true, index: 55 },
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
    fiveCurrent: { open: 121, close: 123, startedAt: null, complete: true, index: 56 },
    fivePrevious: { open: 120, close: 121, startedAt: null, complete: true, index: 55 },
  }, "forming");
  assert.ok(result.gates.slice(6).every((item) => !item.forming));
});

test("bear strategy is the exact inverse with any one prior green month", () => {
  const bearish = {
    ...daily,
    current_month_open: 120, current_month_close: 90,
    previous_month_open: 110, previous_month_close: 105,
    current_week_open: 112, current_week_close: 90, previous_week_open: 111,
    today_open: 96, today_close: 90, previous_day_open: 95,
    two_months_ago_open: 100, two_months_ago_close: 101,
  };
  const result = buildThreeMonthEvaluation(bearish, {
    hourCurrent: { open: 93, close: 89, startedAt: null, complete: true, index: 4 },
    hourPrevious: { open: 94, close: 93, startedAt: null, complete: true, index: 3 },
    fifteenCurrent: { open: 91, close: 88, startedAt: null, complete: true, index: 18 },
    fifteenPrevious: { open: 92, close: 91, startedAt: null, complete: true, index: 17 },
    fiveCurrent: { open: 89, close: 87, startedAt: null, complete: true, index: 56 },
    fivePrevious: { open: 90, close: 89, startedAt: null, complete: true, index: 55 },
  }, "completed", "BEAR");
  assert.equal(result.qualification, "QUALIFIED");
  assert.equal(result.passedGateCount, 12);
  assert.equal(result.scoredConditionCount, 13);
  assert.equal(result.weaknessState, "PASS");
  assert.ok(result.gates.every((item) => item.operator === "<"));
  assert.ok(result.weaknessMonths.every((item) => item.operator === ">"));
});

test("5-minute confirmation is mandatory and remains one paired Home tick", () => {
  const result = buildThreeMonthEvaluation(daily, {
    hourCurrent: { open: 118, close: 121, startedAt: null, complete: true, index: 4 },
    hourPrevious: { open: 117, close: 118, startedAt: null, complete: true, index: 3 },
    fifteenCurrent: { open: 120, close: 122, startedAt: null, complete: true, index: 18 },
    fifteenPrevious: { open: 119, close: 120, startedAt: null, complete: true, index: 17 },
    fiveCurrent: { open: 121, close: 120.5, startedAt: null, complete: true, index: 56 },
    fivePrevious: { open: 120, close: 121, startedAt: null, complete: true, index: 55 },
  });
  const fiveMinuteGates = result.gates.filter((item) => item.timeframe === "5M");
  assert.equal(fiveMinuteGates.length, 2);
  assert.deepEqual(fiveMinuteGates.map((item) => item.state), ["FAIL", "PASS"]);
  assert.equal(result.qualification, "REJECTED");
  assert.equal(result.totalConditionCount, 13);
});
