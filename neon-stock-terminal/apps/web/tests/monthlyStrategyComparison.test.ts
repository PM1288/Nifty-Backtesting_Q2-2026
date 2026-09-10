import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMonthlyStrategyComparison,
  summarizeMonthlyStrategyComparison,
  type MonthlyStrategyComparisonInput,
} from "../src/lib/monthlyStrategyComparison";

const candidate = (
  symbol: string,
  period: string,
  endReturn: number | null,
): MonthlyStrategyComparisonInput => ({
  id: `${period}-${symbol}`,
  symbol,
  period,
  signalDate: `${period}-01`,
  entryDate: `${period}-01`,
  entryPrice: 100,
  endReturn,
  maxProfit: 5,
  maxDrawdown: -2,
  status: "COMPLETE",
});

test("monthly comparison separates same-month overlap from close-only and open-only selections", () => {
  const rows = buildMonthlyStrategyComparison(
    [candidate("BOTH", "2026-08", 4), candidate("CLOSE", "2026-08", 2)],
    [candidate("BOTH", "2026-08", 7), candidate("OPEN", "2026-08", -1)],
  );
  assert.deepEqual(rows.map((row) => [row.symbol, row.membership]), [
    ["BOTH", "BOTH"],
    ["CLOSE", "CLOSE_ONLY"],
    ["OPEN", "OPEN_ONLY"],
  ]);
  assert.equal(rows[0].endReturnDifference, 3);
  assert.deepEqual(summarizeMonthlyStrategyComparison(rows), {
    both: 1,
    closeOnly: 1,
    openOnly: 1,
    total: 3,
    uniqueSymbols: 3,
  });
});

test("the same symbol in different months is not reported as a same-selection overlap", () => {
  const rows = buildMonthlyStrategyComparison(
    [candidate("ABC", "2026-07", 1)],
    [candidate("ABC", "2026-08", 2)],
  );
  assert.deepEqual(rows.map((row) => row.membership), ["OPEN_ONLY", "CLOSE_ONLY"]);
  assert.equal(summarizeMonthlyStrategyComparison(rows).uniqueSymbols, 1);
});

test("missing outcomes remain unavailable instead of becoming zero", () => {
  const rows = buildMonthlyStrategyComparison(
    [candidate("ABC", "2026-08", null)],
    [candidate("ABC", "2026-08", 0)],
  );
  assert.equal(rows[0].endReturnDifference, null);
  assert.equal(rows[0].open?.endReturn, 0);
});
