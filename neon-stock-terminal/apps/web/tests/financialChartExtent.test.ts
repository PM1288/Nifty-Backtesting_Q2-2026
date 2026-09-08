import test from "node:test";
import assert from "node:assert/strict";
import { candlestickAxisValues } from "../src/lib/financialChartExtent";

test("candlestick extent extraction includes low and high, not only the array tail", () => {
  assert.deepEqual(
    [
      ...candlestickAxisValues([100, 101, 94, 108], "y")!,
      ...candlestickAxisValues([101, 99, 96, 104], "y")!,
    ],
    [94, 108, 96, 104],
  );
});

test("invalid candlestick extrema remain unavailable rather than becoming zero", () => {
  assert.deepEqual(candlestickAxisValues([100, 101, null, undefined], "y"), []);
  assert.equal(candlestickAxisValues(null, "y"), null);
});
