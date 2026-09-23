import assert from "node:assert/strict";
import test from "node:test";
import { scalperV2OiRateByStrikeOption, scalperV2OiRateSnapshot, scalperV2PositioningModel, scalperV2Regime, scalperV2StrikeStructureOption } from "../src/lib/scalperV2Positioning";

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

test("OI rate by strike uses exact predecessor intervals and preserves missingness", () => {
  const model = scalperV2PositioningModel([
    { capturedAt: "2026-09-18T03:45:00Z", strike: 23_400, side: "CE", oi: 1_000 },
    { capturedAt: "2026-09-18T03:50:00Z", strike: 23_400, side: "CE", oi: 1_100 },
    { capturedAt: "2026-09-18T03:45:00Z", strike: 23_400, side: "PE", oi: 1_300 },
    { capturedAt: "2026-09-18T03:50:00Z", strike: 23_400, side: "PE", oi: 1_250 },
    { capturedAt: "2026-09-18T03:45:00Z", strike: 23_450, side: "CE", oi: 800 },
    { capturedAt: "2026-09-18T03:50:00Z", strike: 23_450, side: "CE", oi: 850 },
  ]);
  const snapshot = scalperV2OiRateSnapshot(model, Date.parse("2026-09-18T03:52:00Z"));
  assert.equal(snapshot.timestamp, Date.parse("2026-09-18T03:50:00Z"));
  assert.deepEqual(snapshot.calls, [20, 10]);
  assert.deepEqual(snapshot.puts, [-10, null]);
  assert.deepEqual(snapshot.difference, [-30, null]);
  const option = scalperV2OiRateByStrikeOption(model, snapshot.timestamp, String, "×65", 65);
  const series = option.series as Array<{ name: string; yAxisIndex?: number; data: Array<number | null> }>;
  assert.deepEqual(series.map((row) => row.name), ["CE OI rate", "PE OI rate", "PE rate − CE rate"]);
  assert.deepEqual(series[0].data, [1300, 650]);
  assert.deepEqual(series[1].data, [-650, null]);
  assert.deepEqual(series[2].data, [-1950, null]);
  assert.equal(series[2].yAxisIndex, 1);
});
