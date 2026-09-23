import assert from "node:assert/strict";
import test from "node:test";
import {
  scaleScalperV2OiTimePoints,
  scaleScalperV2ProfileRows,
  scalperV2OiLotContext,
  scalperV2OiMultiplier,
} from "../src/lib/scalperV2OiDisplay";

test("lot context requires contract units and one common exact lot size", () => {
  assert.deepEqual(scalperV2OiLotContext([
    { open_interest: 100, oi_unit: "contracts", lotsize: 65 },
    { open_interest: 200, oi_unit: "contracts", lotsize: 65 },
  ]), { available: true, lotSize: 65, sourceUnit: "contracts", reason: null });
  assert.equal(scalperV2OiLotContext([{ open_interest: 100, oi_unit: "PROVIDER_NATIVE_UNVERIFIED", lotsize: 65 }]).available, false);
  assert.equal(scalperV2OiLotContext([{ open_interest: 100, oi_unit: "contracts", lotsize: 65 }, { open_interest: 200, oi_unit: "contracts", lotsize: 50 }]).available, false);
});

test("underlying-unit display scales OI, signed change and cumulative components without filling nulls", () => {
  const multiplier = scalperV2OiMultiplier("underlying_units", 65);
  const profile = scaleScalperV2ProfileRows([{
    side: "CE", strike: 23_400, currentOi: 100, baselineOi: 80, changeOi: 20,
    baselineKind: "PROVIDER_REPORTED_CHANGE", baselineAt: null, currentAt: null,
    source: "fixture", unit: "contracts", state: "comparable",
  }], multiplier);
  assert.equal(profile[0].currentOi, 6_500);
  assert.equal(profile[0].baselineOi, 5_200);
  assert.equal(profile[0].changeOi, 1_300);
  assert.equal(profile[0].unit, "underlying_units");

  const points = scaleScalperV2OiTimePoints([{
    capturedAt: "2026-09-23T04:00:00.000Z", ceOi: 100, peOi: 200,
    ceChangeOi: -10, peChangeOi: null, oiDifference: 100,
    changeOiDifference: null, pcr: 2,
  }], multiplier);
  assert.deepEqual(points[0], {
    capturedAt: "2026-09-23T04:00:00.000Z", ceOi: 6_500, peOi: 13_000,
    ceChangeOi: -650, peChangeOi: null, oiDifference: 6_500,
    changeOiDifference: null, pcr: 2,
  });
});

test("contracts display remains identity-preserving", () => {
  assert.equal(scalperV2OiMultiplier("contracts", 65), 1);
});
