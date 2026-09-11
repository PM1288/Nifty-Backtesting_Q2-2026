import assert from "node:assert/strict";
import test from "node:test";
import { scalperConditionStates, scalperScore } from "../src/lib/scalperDashboard";
import type { ScalperProgressionRow } from "../src/lib/types";

const row: ScalperProgressionRow = {
  symbol: "TEST",
  currentValue: 125,
  todayOpen: 120,
  currentWeekOpen: 118,
  previousWeekOpen: 115,
  currentMonthOpen: 110,
  previousMonthOpen: 100,
  previousMonthClose: 105,
  twoMonthsAgoOpen: 90,
  twoMonthsAgoClose: 85,
  previousDayOpen: 119,
  observedAt: null,
};

test("scalper dashboard derives all five current Monthly Open conditions from raw anchors", () => {
  assert.deepEqual(scalperConditionStates(row), {
    M2_RED: "PASS",
    M1_GREEN: "PASS",
    D0_OPEN_ABOVE_W0_OPEN: "PASS",
    D0_OPEN_ABOVE_W1_OPEN: "PASS",
    D0_OPEN_ABOVE_D1_OPEN: "PASS",
  });
  assert.deepEqual(scalperScore(row), { passed: 5, available: 5 });
});

test("scalper dashboard distinguishes a real zero from missing anchor data", () => {
  const result = scalperConditionStates({ ...row, previousMonthClose: 0, previousDayOpen: undefined });
  assert.equal(result.M1_GREEN, "FAIL");
  assert.equal(result.D0_OPEN_ABOVE_D1_OPEN, "UNAVAILABLE");
  assert.deepEqual(scalperScore({ ...row, previousMonthClose: 0, previousDayOpen: undefined }), { passed: 3, available: 4 });
});
