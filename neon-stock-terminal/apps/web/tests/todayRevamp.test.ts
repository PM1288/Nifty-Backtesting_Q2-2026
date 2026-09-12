import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScalperProgressionBranches,
  breadthWording, niftyMovementWording, parseBoardSort, parseQuickView, parseSummaryLens,
  serializeQuickView, slugifySector, vixWording,
} from "../src/features/today/todayModel";
import { buildProgressionMatrixRows, progressionRowMatches } from "../src/features/today/scalperProgressionMatrix";

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

test("progression matrix keeps one stock row, both routes, and sorts maximum qualification first", () => {
  const stocks = [
    { symbol: "WEAK", name: "Weak Limited", last: 100, dayOpen: 95 },
    { symbol: "STRONG", name: "Strong Limited", last: 120, dayOpen: 110 },
  ] as never;
  const rows = buildProgressionMatrixRows(stocks, [
    {
      symbol: "WEAK", currentValue: 100, todayOpen: 95, currentWeekOpen: 105,
      previousWeekOpen: 90, currentMonthOpen: 90, previousMonthClose: 80,
      twoMonthsAgoClose: 85, currentHourOpen: null, previousHourOpen: null,
      current15mOpen: null, previous15mOpen: null, current5mOpen: null,
      previous5mOpen: null, observedAt: "2026-09-11T05:00:00.000Z",
    },
    {
      symbol: "STRONG", currentValue: 120, todayOpen: 110, currentWeekOpen: 108,
      previousWeekOpen: 106, currentMonthOpen: 105, previousMonthClose: 100,
      twoMonthsAgoClose: 101, currentHourOpen: 119, previousHourOpen: 118,
      current15mOpen: 120, previous15mOpen: 119, current5mOpen: 120,
      previous5mOpen: 119, observedAt: "2026-09-11T05:05:00.000Z",
    },
  ]);
  assert.deepEqual(rows.map((row) => row.stock.symbol), ["STRONG", "WEAK"]);
  assert.equal(rows[0].routes.length, 2);
  assert.equal(rows[0].best.complete, true);
  assert.equal(rows[0].best.pass, 7);
  assert.equal(progressionRowMatches(rows[0], "7"), true);
  assert.equal(progressionRowMatches(rows[1], "waiting"), false);
});
