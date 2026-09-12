import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBearishScalperProgressionBranches,
  buildScalperProgressionBranches,
  breadthWording, niftyMovementWording, parseBoardSort, parseQuickView, parseSummaryLens,
  serializeQuickView, slugifySector, vixWording,
} from "../src/features/today/todayModel";
import { buildProgressionMatrixRows, directionalProgression, progressionRowMatches, progressionStockState, sortProgressionRows } from "../src/features/today/scalperProgressionMatrix";

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
  assert.equal(branches[1].depth, 1);
  assert.deepEqual(branches[1].checks.map((check) => check.passed), [true, false, true, true, true, true, true, true]);
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
  assert.equal(rows[0].best.pass, 8);
  assert.equal(rows[0].best.weightedScore, 29);
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[0].starterState, "pass");
  assert.equal(progressionStockState(rows[0]), "complete");
  assert.equal(progressionRowMatches(rows[0], "7"), true);
  assert.equal(progressionRowMatches(rows[1], "waiting"), false);
});

test("M-2 route requires the visible M-1 sufficiency gate and weighted rank favours nearer confirmations", () => {
  const stocks = [
    { symbol: "MONTH", name: "Month", last: 120, dayOpen: 100 },
    { symbol: "MINUTE", name: "Minute", last: 120, dayOpen: 130 },
    { symbol: "FAILED", name: "Failed", last: 80, dayOpen: 90 },
  ] as never;
  const base = { currentValue: 120, todayOpen: 130, currentWeekOpen: 130, previousWeekOpen: 130, currentMonthOpen: 110, previousMonthClose: 100, twoMonthsAgoClose: 105, observedAt: null };
  const rows = buildProgressionMatrixRows(stocks, [
    { symbol: "MONTH", ...base, currentHourOpen: null, previousHourOpen: null, current15mOpen: null, previous15mOpen: null, current5mOpen: null, previous5mOpen: null },
    { symbol: "MINUTE", ...base, currentHourOpen: 110, previousHourOpen: 100, current15mOpen: 110, previous15mOpen: 100, current5mOpen: 110, previous5mOpen: 100 },
    { symbol: "FAILED", ...base, currentValue: 80, currentMonthOpen: 90, previousMonthClose: 100, twoMonthsAgoClose: 105, currentHourOpen: null, previousHourOpen: null, current15mOpen: null, previous15mOpen: null, current5mOpen: null, previous5mOpen: null },
  ]);
  const month = rows.find((row) => row.stock.symbol === "MONTH")!;
  const minute = rows.find((row) => row.stock.symbol === "MINUTE")!;
  const failed = rows.find((row) => row.stock.symbol === "FAILED")!;
  assert.deepEqual(month.routes[1].branch.checks.slice(0, 2).map((check) => check.id), ["month-m1", "month-m2"]);
  assert.ok(minute.best.weightedScore > month.best.weightedScore);
  assert.ok(minute.rank < month.rank);
  assert.equal(month.starterState, "pass");
  assert.equal(month.allGreen, false);
  assert.equal(progressionStockState(month), "incomplete", "one passing starter or gate must not make the stock cell green");
  assert.equal(failed.bothStartersFailed, true);
  assert.equal(failed.starterState, "fail");
  assert.equal(progressionStockState(failed), "failed");
});

test("MWHD-BEAR is the exact comparison inverse with unchanged gates, operands, and weights", () => {
  const stock = { symbol: "BEAR", name: "Bear", last: 80, dayOpen: 90 } as never;
  const source = {
    symbol: "BEAR", currentValue: 80, todayOpen: 90, currentWeekOpen: 95,
    previousWeekOpen: 100, currentMonthOpen: 90, previousMonthClose: 100,
    twoMonthsAgoClose: 105, currentHourOpen: 80, previousHourOpen: 85,
    current15mOpen: 79, previous15mOpen: 82, current5mOpen: 78,
    previous5mOpen: 79, observedAt: "2026-09-12T05:00:00.000Z",
  };
  const bull = buildScalperProgressionBranches(stock, source);
  const bear = buildBearishScalperProgressionBranches(stock, source);
  assert.deepEqual(bear.map((route) => route.checks.map((check) => check.id)), bull.map((route) => route.checks.map((check) => check.id)));
  assert.deepEqual(bear[1].checks.slice(0, 2).map((check) => check.id), ["month-m1", "month-m2"]);
  assert.deepEqual(bear[1].checks.map((check) => check.passed), [true, true, true, true, true, true, true, true]);
  assert.ok(bear[1].checks.every((check, index) => check.left === bull[1].checks[index].left && check.right === bull[1].checks[index].right));
  assert.ok(bear[1].checks.every((check, index) => check.passed !== bull[1].checks[index].passed));
});

test("every stock receives independent MWHD-BULL and MWHD-BEAR weighted ranks", () => {
  const stocks = [
    { symbol: "UP", name: "Up", last: 120, dayOpen: 110 },
    { symbol: "DOWN", name: "Down", last: 80, dayOpen: 90 },
  ] as never;
  const rows = buildProgressionMatrixRows(stocks, [
    { symbol: "UP", currentValue: 120, todayOpen: 110, currentWeekOpen: 108, previousWeekOpen: 106, currentMonthOpen: 105, previousMonthClose: 100, twoMonthsAgoClose: 101, currentHourOpen: 119, previousHourOpen: 118, current15mOpen: 120, previous15mOpen: 119, current5mOpen: 120, previous5mOpen: 119, observedAt: null },
    { symbol: "DOWN", currentValue: 80, todayOpen: 90, currentWeekOpen: 92, previousWeekOpen: 94, currentMonthOpen: 95, previousMonthClose: 100, twoMonthsAgoClose: 101, currentHourOpen: 84, previousHourOpen: 86, current15mOpen: 82, previous15mOpen: 84, current5mOpen: 80, previous5mOpen: 82, observedAt: null },
  ]);
  const up = rows.find((row) => row.stock.symbol === "UP")!;
  const down = rows.find((row) => row.stock.symbol === "DOWN")!;
  assert.equal(directionalProgression(up, "bull").complete, true);
  assert.equal(directionalProgression(down, "bear").complete, true);
  assert.equal(up.rank, 1);
  assert.equal(down.bearRank, 1);
  assert.deepEqual(sortProgressionRows(rows, "bear").map((row) => row.stock.symbol), ["DOWN", "UP"]);
  assert.equal(progressionStockState(down, "bear"), "complete");
});
