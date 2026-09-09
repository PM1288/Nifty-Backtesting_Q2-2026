import assert from "node:assert/strict";
import test from "node:test";
import {
  ALIGNED_PANE_MINIMUMS,
  alignedChartContentHeight,
  alignedPaneManifest,
  formatScalperNumber,
  formatSignedScalperNumber,
  inspectionBar,
  oiCompositeSegments,
  paddedRenderBounds,
} from "../src/lib/scalperAlignedView";

test("five baseline panes retain their readable minimum heights", () => {
  const visibility = { rsi: false, macd: false, pcr: false };
  assert.deepEqual(alignedPaneManifest(visibility), ["underlying", "call", "put", "oi", "doi"]);
  assert.ok(alignedChartContentHeight(visibility) >= 320 + 210 + 210 + 130 + 120);
  assert.equal(ALIGNED_PANE_MINIMUMS.call, 210);
  assert.equal(ALIGNED_PANE_MINIMUMS.put, 210);
});

test("OI composite separates retained, added and removed amounts", () => {
  assert.deepEqual(oiCompositeSegments(80_000, -20_000), {
    baseline: 100_000,
    retained: 80_000,
    addition: 0,
    reduction: 20_000,
  });
  assert.deepEqual(oiCompositeSegments(120_000, 20_000), {
    baseline: 100_000,
    retained: 100_000,
    addition: 20_000,
    reduction: 0,
  });
  assert.deepEqual(oiCompositeSegments(80_000, null), {
    baseline: null,
    retained: null,
    addition: null,
    reduction: null,
  });
});

test("optional analytical units receive independent panes", () => {
  const panes = alignedPaneManifest({ rsi: true, macd: true, pcr: true });
  assert.deepEqual(panes.slice(-3), ["rsi", "macd", "pcr"]);
  assert.ok(alignedChartContentHeight({ rsi: true, macd: true, pcr: true }) > 1300);
});

test("drawing allowance does not alter strict session eligibility", () => {
  const render = paddedRenderBounds({ min: 100, max: 110 }, 0.05);
  assert.ok(render && render.min < 100 && render.max > 110);
});

test("inspection uses exact completed timestamps and never a nearby candle", () => {
  const bars = [
    { end: "2026-09-09T04:00:00Z", close: 100, closed: true },
    { end: "2026-09-09T04:05:00Z", close: 101, closed: true },
  ];
  assert.equal(inspectionBar(bars, "2026-09-09T04:05:00Z")?.close, 101);
  assert.equal(inspectionBar(bars, "2026-09-09T04:03:00Z"), null);
  assert.equal(inspectionBar(bars, null)?.close, 101);
});

test("formatters preserve zero, missingness and signs", () => {
  assert.equal(formatScalperNumber(null), "—");
  assert.equal(formatScalperNumber(0), "0.00");
  assert.equal(formatSignedScalperNumber(1.2), "+1.20");
  assert.equal(formatSignedScalperNumber(-1.2), "-1.20");
  assert.equal(formatSignedScalperNumber(-0), "0.00");
});
