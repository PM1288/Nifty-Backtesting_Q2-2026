import assert from "node:assert/strict";
import test from "node:test";
import { paperCapitalScenarios, paperCapitalStrategyComparisons, simulatePaperCapitalAllocation } from "./paperCapitalSimulation";

const asOf = new Date("2026-08-21T10:00:00.000Z");

function trade(id: string, openedAt: string, overrides: Record<string, unknown> = {}) {
  return {
    trade_group_id: id,
    symbol: id,
    side: "BUY",
    opened_at: openedAt,
    average_entry_price: "100",
    hypothetical_carry_mark: "98",
    targets: [],
    ...overrides,
  };
}

test("four fixed allocations enforce 10, 5, 2 and 1 simultaneous slots", () => {
  const trades = Array.from({ length: 12 }, (_, index) => trade(`T${String(index).padStart(2, "0")}`, "2026-08-20T04:00:00.000Z"));
  const scenarios = paperCapitalScenarios(trades, asOf);
  assert.deepEqual(scenarios.map((scenario) => scenario.maximumConcurrentSlots), [10, 5, 2, 1]);
  assert.deepEqual(scenarios.map((scenario) => scenario.tradesTaken), [10, 5, 2, 1]);
  assert.deepEqual(scenarios.map((scenario) => scenario.tradesSkipped), [2, 7, 10, 11]);
});

test("capital is released at the first governed target timestamp and reused", () => {
  const first = trade("FIRST", "2026-08-20T04:00:00.000Z", {
    targets: [
      { lifecycle: "SWING", target_pct: ".03", target_price: "103", first_hit_at: "2026-08-20T06:00:00.000Z" },
      { lifecycle: "INTRADAY", target_pct: ".01", target_price: "101", first_hit_at: "2026-08-20T05:00:00.000Z" },
    ],
  });
  const second = trade("SECOND", "2026-08-20T05:01:00.000Z", {
    targets: [{ lifecycle: "INTRADAY", target_pct: ".01", target_price: "101", first_hit_at: "2026-08-20T05:30:00.000Z" }],
  });
  const result = simulatePaperCapitalAllocation([second, first], 1_000_000, asOf);
  assert.equal(result.tradesTaken, 2);
  assert.equal(result.closedTargetTrades, 2);
  assert.equal(result.positions[0].exitReason, "INTRADAY_1_PCT");
  assert.equal(result.positions[0].pnl, 10_000);
  assert.equal(result.totalGrossPnl, 20_000);
  assert.equal(result.endingEquity, 1_020_000);
});

test("short target exits are direction normalised", () => {
  const result = simulatePaperCapitalAllocation([trade("SHORT", "2026-08-20T04:00:00.000Z", {
    side: "SELL",
    targets: [{ lifecycle: "SWING", target_pct: ".03", target_price: "97", first_hit_at: "2026-08-20T07:00:00.000Z" }],
  })], 100_000, asOf);
  assert.equal(result.positions[0].quantity, 1000);
  assert.equal(result.positions[0].pnl, 3000);
  assert.ok(Math.abs(result.positions[0].returnPct - 3) < 1e-9);
});

test("an unhit trade remains open, locks its slot and contributes its current marked drawdown", () => {
  const first = trade("OPEN", "2026-08-20T04:00:00.000Z", { hypothetical_carry_mark: "94" });
  const blocked = trade("BLOCKED", "2026-08-20T04:01:00.000Z");
  const result = simulatePaperCapitalAllocation([first, blocked], 1_000_000, asOf);
  assert.equal(result.tradesTaken, 1);
  assert.equal(result.tradesSkipped, 1);
  assert.equal(result.openTrades, 1);
  assert.equal(result.openMarkedGrossPnl, -60_000);
  assert.equal(result.maxEventDrawdown, 60_000);
  assert.equal(result.maxEventDrawdownPct, 6);
});

test("missing current marks keep capital locked without inventing PnL", () => {
  const result = simulatePaperCapitalAllocation([trade("UNMARKED", "2026-08-20T04:00:00.000Z", { hypothetical_carry_mark: null, last_mark: null })], 200_000, asOf);
  assert.equal(result.unmarkedOpenTrades, 1);
  assert.equal(result.openMarkedGrossPnl, 0);
  assert.equal(result.positions[0].status, "OPEN_UNMARKED");
});

test("entry strategies receive independent ledgers and never buy across strategies", () => {
  const comparisons = paperCapitalStrategyComparisons([
    trade("RSI_A", "2026-08-20T04:00:00.000Z", { entry_strategy: "RSI_WILLR" }),
    trade("RSI_B", "2026-08-20T04:01:00.000Z", { entry_strategy: "RSI_WILLR" }),
    trade("MOMENTUM_A", "2026-08-20T04:00:30.000Z", { entry_strategy: "PRICE_MOMENTUM_1D_1H_15M" }),
  ], asOf);
  assert.deepEqual(comparisons.map((comparison) => comparison.entryStrategy), ["RSI_WILLR", "PRICE_MOMENTUM_1D_1H_15M"]);
  assert.deepEqual(comparisons.map((comparison) => comparison.sourceTradeCount), [2, 1]);
  for (const comparison of comparisons) {
    const expectedPrefix = comparison.entryStrategy === "RSI_WILLR" ? "RSI_" : "MOMENTUM_";
    assert.ok(comparison.scenarios.every((scenario) => scenario.positions.every((position) => position.tradeGroupId.startsWith(expectedPrefix))));
  }
  assert.equal(comparisons[0].scenarios[3].tradesTaken, 1);
  assert.equal(comparisons[1].scenarios[3].tradesTaken, 1);
});

test("swing-only capital ignores intraday hits and releases cash only at the swing target", () => {
  const first = trade("SWING_FIRST", "2026-08-20T04:00:00.000Z", {
    targets: [
      { lifecycle: "INTRADAY", target_pct: ".01", target_price: "101", first_hit_at: "2026-08-20T05:00:00.000Z" },
      { lifecycle: "SWING", target_pct: ".03", target_price: "103", first_hit_at: "2026-08-20T07:00:00.000Z" },
    ],
  });
  const beforeSwing = trade("BLOCKED_BEFORE_SWING", "2026-08-20T06:00:00.000Z");
  const afterSwing = trade("ADMITTED_AFTER_SWING", "2026-08-20T07:01:00.000Z", {
    targets: [{ lifecycle: "SWING", target_pct: ".03", target_price: "103", first_hit_at: "2026-08-20T08:00:00.000Z" }],
  });
  const result = simulatePaperCapitalAllocation([first, beforeSwing, afterSwing], 1_000_000, asOf, "SWING_ONLY");
  assert.equal(result.exitPolicy, "SWING_ONLY");
  assert.equal(result.tradesTaken, 2);
  assert.equal(result.tradesSkipped, 1);
  assert.equal(result.positions[0].exitReason, "SWING_3_PCT");
  assert.equal(result.positions[0].exitAt, "2026-08-20T07:00:00.000Z");
  assert.equal(result.totalGrossPnl, 60_000);
});
