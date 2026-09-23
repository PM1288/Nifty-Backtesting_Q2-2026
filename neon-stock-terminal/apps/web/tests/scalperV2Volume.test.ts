import assert from "node:assert/strict";
import test from "node:test";
import { scalperV2VolumeEma, scalperV2VolumeEmaPeriod } from "../src/lib/scalperV2Volume";

test("volume EMA period follows the selected Scalper V2 timeframe", () => {
  assert.equal(scalperV2VolumeEmaPeriod(1), 20);
  assert.equal(scalperV2VolumeEmaPeriod(5), 20);
  assert.equal(scalperV2VolumeEmaPeriod(15), 5);
  assert.equal(scalperV2VolumeEmaPeriod(60), 5);
});

test("volume EMA progressively warms from the first candle and preserves missing-volume boundaries", () => {
  assert.deepEqual(scalperV2VolumeEma([
    { time: 1, value: 10 },
    { time: 2, value: 20 },
    { time: 3, value: 30 },
    { time: 4, value: 40 },
  ], 3), [
    { time: 1, value: 10 },
    { time: 2, value: 15 },
    { time: 3, value: 20 },
    { time: 4, value: 30 },
  ]);
  assert.deepEqual(scalperV2VolumeEma([
    { time: 1, value: 10 },
    { time: 2, value: 20 },
    { time: 3, value: null },
    { time: 4, value: 30 },
    { time: 5, value: 60 },
  ], 2), [
    { time: 1, value: 10 },
    { time: 2, value: 15 },
    { time: 4, value: 30 },
    { time: 5, value: 45 },
  ]);
});
