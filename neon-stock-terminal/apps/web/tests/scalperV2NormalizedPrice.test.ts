import test from "node:test";
import assert from "node:assert/strict";
import { scalperV2NormalizedPrice, scalperV2NormalizedPriceSeries } from "../src/lib/scalperV2NormalizedPrice";

test("Scalper V2 normalized price maps open high and low to 0 +100 and -100", () => {
  assert.equal(scalperV2NormalizedPrice(100, 100, 120, 80), 0);
  assert.equal(scalperV2NormalizedPrice(120, 100, 120, 80), 100);
  assert.equal(scalperV2NormalizedPrice(80, 100, 120, 80), -100);
  assert.equal(scalperV2NormalizedPrice(110, 100, 120, 80), 50);
  assert.equal(scalperV2NormalizedPrice(90, 100, 120, 80), -50);
  assert.equal(scalperV2NormalizedPrice(100, 100, 100, 100), 0);
});

test("Scalper V2 normalized series keeps gaps and fades strikes with distance", () => {
  const points = [
    ["2026-09-10T03:46:00.000Z", 23_450, "CE", 100],
    ["2026-09-10T03:51:00.000Z", 23_450, "CE", 110],
    ["2026-09-10T03:46:00.000Z", 23_500, "CE", 80],
    ["2026-09-10T03:56:00.000Z", 23_500, "CE", 70],
    ["2026-09-10T03:46:00.000Z", 23_550, "PE", 90],
    ["2026-09-10T03:51:00.000Z", 23_550, "PE", 100],
  ].map(([capturedAt, strike, side, price]) => ({ capturedAt: String(capturedAt), strike: Number(strike), side, price: Number(price) }));
  const model = scalperV2NormalizedPriceSeries(points, 23_450, 23_550);
  const selectedCe = model.series.find((series) => series.id === "CE:23450")!;
  const fartherCe = model.series.find((series) => series.id === "CE:23500")!;
  const selectedPe = model.series.find((series) => series.id === "PE:23550")!;
  assert.equal(selectedCe.opacity, 1);
  assert.ok(fartherCe.opacity < selectedCe.opacity);
  assert.equal(selectedPe.opacity, 1);
  assert.deepEqual(selectedCe.data.map((point) => point.value[1]), [0, 100, null]);
  assert.deepEqual(fartherCe.data.map((point) => point.value[1]), [0, null, -100]);
});
