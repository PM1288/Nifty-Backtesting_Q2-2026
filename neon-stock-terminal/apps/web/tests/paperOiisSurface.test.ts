import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOiisSurfaceGrid,
  interpolateOiisSurface,
  oiisSurfaceColor,
  oiisSurfaceDomain,
  oiisSurfaceMetric,
  oiisSurfacePoints,
} from "../src/lib/paperOiisSurface";

const trade = {
  evidence_ofactor: "74",
  evidence_xfactor: "82",
  evidence_rsi14: "64.5",
  evidence_willr14: "-18.2",
  evidence_atr14: "31.25",
  evidence_volume_ratio: "1.8",
  opened_quantity: "700",
  fixed_investment_quantity: 186,
  intraday_max_profit: 3500,
  fixed_investment_mfe_5d_pnl: 8000,
  fixed_investment_mae_5d_pnl: -3200,
  fixed_investment_mfe_30d_pnl: 12000,
  fixed_investment_mae_30d_pnl: -6000,
};

test("OIIS surface uses the fixed two-lakh quantity for intraday reward", () => {
  assert.equal(oiisSurfaceMetric(trade, "INTRADAY_MAX_PROFIT"), 930);
  assert.equal(oiisSurfaceMetric(trade, "SWING_5D_MAX_PROFIT"), 8000);
  assert.equal(oiisSurfaceMetric(trade, "SWING_5D_MAX_DRAWDOWN"), -3200);
  assert.equal(oiisSurfaceMetric(trade, "HORIZON_30D_MAX_PROFIT"), 12000);
  assert.equal(oiisSurfaceMetric(trade, "HORIZON_30D_MAX_DRAWDOWN"), -6000);
});

test("OIIS surface excludes rows without point-in-time O and X evidence", () => {
  const points = oiisSurfacePoints([trade, { ...trade, evidence_ofactor: null }], "SWING_5D_MAX_PROFIT");
  assert.equal(points.length, 1);
  assert.equal(points[0].o, 74);
  assert.equal(points[0].x, 82);
});

test("OIIS contour colour anchors preserve red yellow and green semantics", () => {
  assert.equal(oiisSurfaceColor(-2000), "rgb(255 22 79)");
  assert.equal(oiisSurfaceColor(-100), "rgb(244 255 48)");
  assert.equal(oiisSurfaceColor(100), "rgb(244 255 48)");
  assert.equal(oiisSurfaceColor(2000), "rgb(0 122 69)");
  assert.equal(oiisSurfaceColor(null), "#e7edf4");
});

test("five axis presets use point-in-time factor evidence without changing outcomes", () => {
  const rsiAtr = oiisSurfacePoints([trade], "SWING_5D_MAX_PROFIT", "RSI_ATR");
  assert.deepEqual({ x: rsiAtr[0].o, y: rsiAtr[0].x, value: rsiAtr[0].value }, { x: 64.5, y: 31.25, value: 8000 });
  const atrVolume = oiisSurfacePoints([trade], "SWING_5D_MAX_PROFIT", "ATR_VOLUME");
  assert.deepEqual({ x: atrVolume[0].o, y: atrVolume[0].x }, { x: 31.25, y: 1.8 });
  assert.equal(oiisSurfacePoints([{ ...trade, evidence_rsi14: null }], "SWING_5D_MAX_PROFIT", "RSI_ATR").length, 0);
});

test("surface interpolation returns exact evidence and leaves unsupported corners blank", () => {
  const points = oiisSurfacePoints([
    trade,
    { ...trade, evidence_ofactor: 78, evidence_xfactor: 86, fixed_investment_mfe_5d_pnl: 4000 },
  ], "SWING_5D_MAX_PROFIT");
  const domain = oiisSurfaceDomain(points);
  assert.ok(domain);
  assert.equal(interpolateOiisSurface(points, domain, 74, 82), 8000);
  assert.equal(interpolateOiisSurface(points, domain, domain.oMin, domain.xMin), null);
  const grid = buildOiisSurfaceGrid(points, domain, 12, 8);
  assert.equal(grid.length, 96);
  assert.ok(grid.some((cell) => cell.value != null));
});
