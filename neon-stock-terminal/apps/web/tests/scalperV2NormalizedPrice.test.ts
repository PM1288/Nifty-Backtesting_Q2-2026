import test from "node:test";
import assert from "node:assert/strict";
import { scalperV2NormalizedPrice, scalperV2NormalizedPriceSeries, scalperV2PriceValue, visibleScalperV2PriceSeries } from "../src/lib/scalperV2NormalizedPrice";

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
  const model = scalperV2NormalizedPriceSeries(points, 23_450, 23_550, "range");
  const selectedCe = model.series.find((series) => series.id === "CE:23450")!;
  const fartherCe = model.series.find((series) => series.id === "CE:23500")!;
  const selectedPe = model.series.find((series) => series.id === "PE:23550")!;
  assert.equal(selectedCe.opacity, 1);
  assert.ok(fartherCe.opacity < selectedCe.opacity);
  assert.equal(selectedPe.opacity, 1);
  assert.deepEqual(selectedCe.data.map((point) => point.value[1]), [0, 100, null]);
  assert.deepEqual(fartherCe.data.map((point) => point.value[1]), [0, null, -100]);
});

test("Scalper V2 stable price modes use the first session observation", () => {
  assert.ok(Math.abs(scalperV2PriceValue("return", 110, 100, 120, 80)! - 10) < 1e-12);
  assert.equal(scalperV2PriceValue("indexed", 110, 100, 120, 80), 110);
  assert.ok(Math.abs(scalperV2PriceValue("relative", 110, 100, 120, 80, 4)! - 6) < 1e-12);
  assert.equal(scalperV2PriceValue("range", 110, 100, 120, 80), 50);
});

test("Scalper V2 relative mode compares each side with its actual ATM contract", () => {
  const model = scalperV2NormalizedPriceSeries([
    { capturedAt: "2026-09-10T03:46:00Z", strike: 100, side: "CE", price: 100 },
    { capturedAt: "2026-09-10T03:51:00Z", strike: 100, side: "CE", price: 110 },
    { capturedAt: "2026-09-10T03:46:00Z", strike: 120, side: "CE", price: 50 },
    { capturedAt: "2026-09-10T03:51:00Z", strike: 120, side: "CE", price: 60 },
  ], 120, null, "relative", 100, null);
  const selected = model.series.find((series) => series.id === "CE:120")!;
  assert.ok(Math.abs(selected.data[1].value[1]! - 10) < 1e-12);
});

test("Scalper V2 default line selection keeps selected, leaders and nearby context", () => {
  const model = scalperV2NormalizedPriceSeries([
    ...[100, 110, 120, 130, 140, 150].map((strike) => ({ capturedAt: "2026-09-10T03:46:00Z", strike, side: "CE", price: 10 })),
    ...[100, 110, 120, 130, 140, 150].map((strike) => ({ capturedAt: "2026-09-10T03:46:00Z", strike, side: "PE", price: 10 })),
  ], 120, 130);
  const visible = visibleScalperV2PriceSeries(model.series, 120, 130, ["CE:150"], false);
  assert.ok(visible.some((row) => row.id === "CE:120"));
  assert.ok(visible.some((row) => row.id === "PE:130"));
  assert.ok(visible.some((row) => row.id === "CE:150"));
  assert.ok(visible.length < model.series.length);
});
