import assert from "node:assert/strict";
import test from "node:test";
import {
  breadthWording, niftyMovementWording, parseBoardSort, parseQuickView, parseSummaryLens,
  serializeQuickView, slugifySector, vixWording,
} from "../src/features/today/todayModel";

test("Today URL state canonicalizes unsupported values", () => {
  assert.equal(parseSummaryLens(null), "story");
  assert.equal(parseSummaryLens("anything"), "story");
  assert.equal(parseSummaryLens("sector-matrix"), "sector-matrix");
  assert.equal(parseBoardSort("unsupported"), "stable");
  assert.deepEqual(parseQuickView("stock:infy"), { type: "stock", symbol: "INFY" });
  assert.deepEqual(parseQuickView("sector:Information Technology"), { type: "sector", id: "information-technology" });
  assert.equal(parseQuickView("bad"), null);
  assert.equal(serializeQuickView({ type: "stock", symbol: "INFY" }), "stock:INFY");
});

test("market story thresholds match the approved boundaries", () => {
  assert.equal(niftyMovementWording(0.75), "NIFTY rises strongly");
  assert.equal(niftyMovementWording(0.15), "NIFTY trades higher");
  assert.equal(niftyMovementWording(0.14), "NIFTY is broadly flat");
  assert.equal(niftyMovementWording(-0.15), "NIFTY trades lower");
  assert.equal(niftyMovementWording(-0.75), "NIFTY falls sharply");
  assert.equal(breadthWording(0.25), "breadth is strong");
  assert.equal(breadthWording(-0.25), "breadth is very weak");
  assert.equal(vixWording(-1), "volatility is easing materially");
  assert.equal(vixWording(1), "volatility is rising sharply");
});

test("sector IDs are stable URL-safe slugs", () => {
  assert.equal(slugifySector("Oil, Gas & Consumable Fuels"), "oil-gas-and-consumable-fuels");
});
