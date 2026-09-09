import test from "node:test";
import assert from "node:assert/strict";
import {
  MATRIX_INTERVALS,
  MATRIX_SIDES,
  activeChartExpiry,
  barsForIstDay,
  containingBar,
  latestIstDay,
  matrixSide,
} from "../src/lib/multiTimeframeMatrix";

test("matrix contract is fixed to three intervals and three exact identities", () => {
  assert.deepEqual(MATRIX_INTERVALS, [1, 5, 15]);
  assert.deepEqual(MATRIX_SIDES, ["UNDERLYING", "CE", "PE"]);
  assert.equal(matrixSide({ tradingsymbol: "NIFTY08SEP2623650CE" }), "CE");
  assert.equal(matrixSide({ tradingsymbol: "NIFTY08SEP2623650PE" }), "PE");
  assert.equal(matrixSide({ tradingsymbol: "Nifty 50" }), "UNDERLYING");
});

test("expired weekly option selection rolls to the current contract without overriding a current pin", () => {
  const asOf = "2026-09-09T04:30:00.000Z";
  assert.equal(activeChartExpiry("2026-09-08", "2026-09-15", asOf), "2026-09-15");
  assert.equal(activeChartExpiry("2026-09-15", "2026-09-15", asOf), "2026-09-15");
  assert.equal(activeChartExpiry("2026-09-22", "2026-09-15", asOf), "2026-09-22");
  assert.equal(activeChartExpiry(null, "2026-09-15", asOf), "2026-09-15");
});

test("matrix uses one latest IST session without inventing missing rows", () => {
  const panes = [{ identity: {}, sourceMinuteCount: 2, bars: [
    { end: "2026-09-07T10:00:00.000Z", closed: true },
    { end: "2026-09-08T03:46:00.000Z", closed: true },
  ] }];
  assert.equal(latestIstDay(panes), "2026-09-08");
  assert.equal(barsForIstDay(panes[0].bars, "2026-09-08").length, 1);
  assert.deepEqual(barsForIstDay(panes[0].bars, "2026-09-09"), []);
});

test("shared cursor maps to the containing completed lower-frequency candle", () => {
  const rows = [
    { end: "2026-09-08T04:00:00.000Z", closed: true, close: 10 },
    { end: "2026-09-08T04:05:00.000Z", closed: true, close: 11 },
    { end: "2026-09-08T04:10:00.000Z", closed: false, close: 12 },
  ];
  assert.equal(containingBar(rows, "2026-09-08T04:02:00.000Z")?.close, 11);
  assert.equal(containingBar(rows, "2026-09-08T04:10:00.000Z")?.close, 11);
  assert.equal(containingBar([], "2026-09-08T04:02:00.000Z"), null);
});
