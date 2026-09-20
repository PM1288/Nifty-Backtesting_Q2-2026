import test from "node:test";
import assert from "node:assert/strict";
import { deriveScalperOiHistory } from "./scalperOiHistory";

test("derived Scalper OI history converts SmartAPI underlying units to contracts and preserves signed change", () => {
  const points = deriveScalperOiHistory({
    observations: [
      { capturedAtMs: 100, token: "ce", strike: 23_400, side: "CE", oiUnderlyingUnits: 6_500, lotSize: 65 },
      { capturedAtMs: 100, token: "pe", strike: 23_400, side: "PE", oiUnderlyingUnits: 13_000, lotSize: 65 },
    ],
    baselines: [
      { token: "ce", oiUnderlyingUnits: 5_200, lotSize: 65 },
      { token: "pe", oiUnderlyingUnits: 14_300, lotSize: 65 },
    ],
    spots: [{ capturedAtMs: 90, value: 23_410 }],
    bucketEndsMs: [120],
    strikesAround: 0,
  });
  assert.deepEqual(points.map((point) => ({ ceOi: point.ceOi, peOi: point.peOi, ceChangeOi: point.ceChangeOi, peChangeOi: point.peChangeOi })), [
    { ceOi: 100, peOi: 200, ceChangeOi: 20, peChangeOi: -20 },
  ]);
});

test("derived Scalper OI history keeps incomplete current or baseline cohorts unavailable", () => {
  const points = deriveScalperOiHistory({
    observations: [
      { capturedAtMs: 100, token: "ce", strike: 23_400, side: "CE", oiUnderlyingUnits: 6_501, lotSize: 65 },
      { capturedAtMs: 100, token: "pe", strike: 23_400, side: "PE", oiUnderlyingUnits: 13_000, lotSize: 65 },
    ],
    baselines: [{ token: "pe", oiUnderlyingUnits: 13_000, lotSize: 65 }],
    spots: [{ capturedAtMs: 90, value: 23_400 }],
    bucketEndsMs: [120],
    strikesAround: 0,
  });
  assert.equal(points[0].ceOi, null);
  assert.equal(points[0].ceChangeOi, null);
  assert.equal(points[0].peOi, 200);
  assert.equal(points[0].peChangeOi, 0);
});
