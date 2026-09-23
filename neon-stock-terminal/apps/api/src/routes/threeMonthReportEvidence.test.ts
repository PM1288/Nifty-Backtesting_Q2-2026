import assert from "node:assert/strict";
import test from "node:test";
import { threeMonthEvidenceTestExports } from "./backtesting";

test("3Month report CSV parser preserves quoted values and escaped quotes", () => {
  assert.deepEqual(
    threeMonthEvidenceTestExports.parseCsvLine('"ABC","M-1:PASS|M-2:FAIL","say ""yes"""'),
    ["ABC", "M-1:PASS|M-2:FAIL", 'say "yes"'],
  );
});

test("3Month stock summary uses causal values and keeps missing horizons unavailable", () => {
  const common = {
    symbol: "ABC", signalDate: "2026-01-01", signalOpen: 100, signalClose: 102,
    mandatoryGates: [], historyPass: [], references: {}, causalEntryDate: "2026-01-02", causalEntryOpen: 101,
  };
  const summary = threeMonthEvidenceTestExports.directionSummary([
    { ...common, direction: "BULL", causalReturn1: 1, causalReturn5: 2, causalReturn15: 4, causalDrawdown15: -3 },
    { ...common, direction: "BULL", signalDate: "2026-02-01", causalReturn1: 3, causalReturn5: null, causalReturn15: -2, causalDrawdown15: -5 },
    { ...common, direction: "BEAR", causalReturn1: 9, causalReturn5: 9, causalReturn15: 9, causalDrawdown15: -9 },
  ], "BULL");
  assert.deepEqual(summary, { direction: "BULL", count: 2, average1: 2, average5: 2, average15: 1, maximum15: 4, minimum15: -2, drawdown15: -5 });
});
