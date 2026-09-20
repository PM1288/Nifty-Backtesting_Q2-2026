import assert from "node:assert/strict";
import test from "node:test";
import { scalperV2PositioningModel, scalperV2Regime, scalperV2StrikeStructureOption } from "../src/lib/scalperV2Positioning";

test("Scalper V2 classifies option price and OI regimes mechanically", () => {
  assert.equal(scalperV2Regime(2, 10), "Long buildup");
  assert.equal(scalperV2Regime(-2, 10), "Short buildup");
  assert.equal(scalperV2Regime(2, -10), "Short covering");
  assert.equal(scalperV2Regime(-2, -10), "Long unwinding");
  assert.equal(scalperV2Regime(0, 10), "Neutral");
  assert.equal(scalperV2Regime(null, 10), "Unavailable");
});

test("positioning pressure preserves missing components and derives session baselines", () => {
  const model = scalperV2PositioningModel([
    { capturedAt: "2026-09-18T03:45:00Z", strike: 23_400, side: "CE", price: 100, oi: 1_000, volume: 100, totalBuyQty: 60, totalSellQty: 40 },
    { capturedAt: "2026-09-18T03:50:00Z", strike: 23_400, side: "CE", price: 95, oi: 1_100, volume: 180, totalBuyQty: 40, totalSellQty: 60 },
    { capturedAt: "2026-09-18T03:45:00Z", strike: 23_450, side: "CE", price: 80, oi: 500, volume: null },
    { capturedAt: "2026-09-18T03:50:00Z", strike: 23_450, side: "CE", price: 84, oi: 450, volume: null },
  ]);
  const latest = model.cells.find((cell) => cell.strike === 23_400 && cell.timestamp === Date.parse("2026-09-18T03:50:00Z"));
  assert.equal(latest?.changeOi, 100);
  assert.ok(Math.abs((latest?.premiumReturnPct ?? 0) + 5) < 1e-9);
  assert.equal(latest?.regime, "Short buildup");
  assert.equal(latest?.baselineKind, "SESSION_FIRST_OBSERVATION");
  assert.equal(latest?.componentCount, 4);
  const missingVolume = model.cells.find((cell) => cell.strike === 23_450 && cell.timestamp === Date.parse("2026-09-18T03:50:00Z"));
  assert.equal(missingVolume?.volumeShare, null);
  assert.equal(missingVolume?.componentCount, 2);
  assert.ok(Number.isFinite(missingVolume?.pressure));
});

test("strike structure exposes OI, signed delta, premium and top-five rank labels", () => {
  const rows = Array.from({ length: 6 }, (_, index) => ({ oi: 600 - index * 50, changeOi: index % 2 ? -10 : 10, premiumReturnPct: index % 2 ? 2 : -2 }));
  const option = scalperV2StrikeStructureOption([100, 110, 120, 130, 140, 150], rows, [...rows].reverse(), 123, 120);
  const series = option.series as Array<{ name: string; type: string; data: Array<null | { label?: { formatter?: string } }> }>;
  assert.deepEqual(series.map((item) => item.name), ["CE OI", "PE OI", "CE ΔOI", "PE ΔOI", "CE premium %", "PE premium %"]);
  assert.equal(series[0].type, "bar");
  assert.match(series[0].data[0]?.label?.formatter ?? "", /CE1 SB/);
  assert.match(series[1].data[5]?.label?.formatter ?? "", /PE1 SB/);
});
