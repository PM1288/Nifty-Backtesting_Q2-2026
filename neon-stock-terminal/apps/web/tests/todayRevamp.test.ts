import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScalperProgressionBranches,
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

test("Home scalper progression keeps alternative month routes and additive confirmations", () => {
  const branches = buildScalperProgressionBranches(
    { symbol: "TEST", last: 125, dayOpen: 121 } as never,
    {
      symbol: "TEST", currentValue: 124, todayOpen: 121, currentWeekOpen: 120,
      previousWeekOpen: 122, currentMonthOpen: 110, previousMonthClose: 108,
      twoMonthsAgoClose: 112, currentHourOpen: 124, previousHourOpen: 123,
      current15mOpen: 124, previous15mOpen: 123, current5mOpen: 124,
      previous5mOpen: 123, observedAt: "2026-09-11T05:00:00.000Z",
    },
  );
  assert.equal(branches[0].depth, 7);
  assert.deepEqual(branches[0].checks.map((check) => check.passed), [true, true, true, true, true, true, true]);
  assert.equal(branches[1].depth, 0);
  assert.deepEqual(branches[1].checks.map((check) => check.passed), [false, true, true, true, true, true, true]);
});

test("Home scalper progression preserves missing references and stops the AND depth", () => {
  const [branch] = buildScalperProgressionBranches(
    { symbol: "TEST", last: 125, dayOpen: 121 } as never,
    {
      symbol: "TEST", currentValue: 125, todayOpen: 121, currentWeekOpen: null,
      previousWeekOpen: 122, currentMonthOpen: 110, previousMonthClose: 108,
      twoMonthsAgoClose: 100, currentHourOpen: 124, previousHourOpen: 123,
      current15mOpen: 124, previous15mOpen: 123, current5mOpen: null,
      previous5mOpen: 123, observedAt: null,
    },
  );
  assert.deepEqual(branch.checks.map((check) => check.passed), [true, null, true, true, true, true, null]);
  assert.equal(branch.depth, 1);
});
