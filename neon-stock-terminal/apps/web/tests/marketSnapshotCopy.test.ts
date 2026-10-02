import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMarketSnapshot } from "../src/lib/marketSnapshotCopy";
test("snapshot labels preserve signed prices, unavailable values and units", () => {
 assert.equal(formatMarketSnapshot("NIFTY LAST=22421.95 CHG=-0.88% PREV_CLOSE=NA"), "NIFTY  · Last: 22421.95  · Change: -0.88%  · Previous close: NA");
 assert.equal(formatMarketSnapshot("Required evidence is missing."), "Required evidence is missing.");
 assert.equal(formatMarketSnapshot("FII_BUY_VALUE_CR=3182.56"), "FII buy (₹ crore): 3182.56");
});
