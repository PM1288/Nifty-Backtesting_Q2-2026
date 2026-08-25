import assert from "node:assert/strict";
import test from "node:test";
import { STOCK_PIXEL_MAX_ALPHA, STOCK_PIXEL_MIN_ALPHA, stockPixelCellSize, stockPixelColour } from "../src/components/market/stockPixelField";

test("stock pixel colours preserve the active heatmap semantics", () => {
  assert.equal(stockPixelColour("positive"), "#159766");
  assert.equal(stockPixelColour("negative"), "#d2485b");
  assert.equal(stockPixelColour("high"), "#7558d5");
  assert.equal(stockPixelColour("medium"), "#c68a0b");
  assert.equal(stockPixelColour("missing"), "#8996a8");
});

test("stock pixel cells remain visible without overwhelming compact tiles", () => {
  assert.equal(STOCK_PIXEL_MIN_ALPHA, 0.08);
  assert.equal(STOCK_PIXEL_MAX_ALPHA, 0.26);
  assert.equal(stockPixelCellSize(120), 4);
  assert.equal(stockPixelCellSize(180), 5);
  assert.equal(stockPixelCellSize(280), 6);
  assert.equal(stockPixelCellSize(Number.NaN), 5);
});
