import assert from "node:assert/strict";
import test from "node:test";
import {
  hasQualifiedStockFitSample,
  MIN_ACCEPTED_CLOSED_TRADES,
  MIN_STOCK_FIT_TRADES,
  passesBacktestAcceptance
} from "../src/lib/backtestingAcceptance";

test("a negative-return strategy never passes even when it is relatively best", () => {
  assert.equal(passesBacktestAcceptance({ totalReturnPct: -0.01, totalClosedTrades: 500 }), false);
});

test("a positive low-sample strategy remains inconclusive", () => {
  assert.equal(
    passesBacktestAcceptance({ totalReturnPct: 12, totalClosedTrades: MIN_ACCEPTED_CLOSED_TRADES - 1 }),
    false
  );
});

test("a finite positive return with the minimum sample passes", () => {
  assert.equal(
    passesBacktestAcceptance({ totalReturnPct: 0.0001, totalClosedTrades: MIN_ACCEPTED_CLOSED_TRADES }),
    true
  );
});

test("undefined and non-finite metrics do not pass", () => {
  assert.equal(passesBacktestAcceptance({ totalReturnPct: undefined, totalClosedTrades: 100 }), false);
  assert.equal(passesBacktestAcceptance({ totalReturnPct: Number.NaN, totalClosedTrades: 100 }), false);
  assert.equal(passesBacktestAcceptance({ totalReturnPct: 10, totalClosedTrades: Number.POSITIVE_INFINITY }), false);
});

test("stock-fit evidence requires the declared minimum accepted-trade sample", () => {
  assert.equal(hasQualifiedStockFitSample(MIN_STOCK_FIT_TRADES - 1), false);
  assert.equal(hasQualifiedStockFitSample(MIN_STOCK_FIT_TRADES), true);
});
