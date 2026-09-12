import type { Quote, ScalperProgressionRow } from "../../lib/types";
import {
  buildBearishScalperProgressionBranches,
  buildScalperProgressionBranches,
  type ScalperProgressionBranch,
  type ScalperProgressionCheck,
  type ScalperProgressionDirection,
} from "./todayModel";

export type ProgressionRouteSummary = {
  branch: ScalperProgressionBranch;
  pass: number;
  fail: number;
  pending: number;
  complete: boolean;
  weightedScore: number;
  maximumWeight: number;
  weightedPercent: number;
};

export type ProgressionMatrixRow = {
  stock: Quote;
  source: ScalperProgressionRow;
  routes: [ProgressionRouteSummary, ProgressionRouteSummary];
  best: ProgressionRouteSummary;
  allGreen: boolean;
  starterState: "pass" | "fail" | "pending";
  bothStartersFailed: boolean;
  rank: number;
  bearRoutes: [ProgressionRouteSummary, ProgressionRouteSummary];
  bearBest: ProgressionRouteSummary;
  bearAllRed: boolean;
  bearStarterState: "pass" | "fail" | "pending";
  bearBothStartersFailed: boolean;
  bearRank: number;
};

export type DirectionalProgression = {
  direction: ScalperProgressionDirection;
  routes: [ProgressionRouteSummary, ProgressionRouteSummary];
  best: ProgressionRouteSummary;
  complete: boolean;
  starterState: "pass" | "fail" | "pending";
  bothStartersFailed: boolean;
  rank: number;
};

export const PROGRESSION_GATE_WEIGHTS: Record<ScalperProgressionCheck["id"], number> = {
  "month-m1": 1,
  "month-m2": 1,
  week: 2,
  "previous-week": 3,
  today: 4,
  hour: 5,
  "15m": 6,
  "5m": 7,
};

export function summarizeProgressionRoute(branch: ScalperProgressionBranch): ProgressionRouteSummary {
  const pass = branch.checks.filter((check) => check.passed === true).length;
  const fail = branch.checks.filter((check) => check.passed === false).length;
  const pending = branch.checks.length - pass - fail;
  const weightedScore = branch.checks.reduce((sum, check) => sum + (check.passed === true ? PROGRESSION_GATE_WEIGHTS[check.id] : 0), 0);
  const maximumWeight = branch.checks.reduce((sum, check) => sum + PROGRESSION_GATE_WEIGHTS[check.id], 0);
  return { branch, pass, fail, pending, complete: pass === branch.checks.length, weightedScore, maximumWeight, weightedPercent: maximumWeight ? weightedScore / maximumWeight * 100 : 0 };
}

function compareRoutes(left: ProgressionRouteSummary, right: ProgressionRouteSummary): number {
  return Number(right.complete) - Number(left.complete)
    || right.weightedPercent - left.weightedPercent
    || right.weightedScore - left.weightedScore
    || right.branch.depth - left.branch.depth
    || right.pass - left.pass
    || left.fail - right.fail
    || left.branch.id.localeCompare(right.branch.id);
}

export function buildProgressionMatrixRows(stocks: Quote[], rows: ScalperProgressionRow[]): ProgressionMatrixRow[] {
  const sourceBySymbol = new Map(rows.map((row) => [row.symbol, row]));
  const ranked = stocks.map((stock) => {
    const source = sourceBySymbol.get(stock.symbol) ?? {
      symbol: stock.symbol,
      currentValue: null,
      todayOpen: null,
      currentWeekOpen: null,
      previousWeekOpen: null,
      currentMonthOpen: null,
      previousMonthClose: null,
      twoMonthsAgoClose: null,
      observedAt: null,
    };
    const routes = buildScalperProgressionBranches(stock, source).map(summarizeProgressionRoute) as [ProgressionRouteSummary, ProgressionRouteSummary];
    const bearRoutes = buildBearishScalperProgressionBranches(stock, source).map(summarizeProgressionRoute) as [ProgressionRouteSummary, ProgressionRouteSummary];
    const best = [...routes].sort(compareRoutes)[0];
    const bearBest = [...bearRoutes].sort(compareRoutes)[0];
    const m1 = routes[0].branch.checks.find((check) => check.id === "month-m1")?.passed ?? null;
    const m2 = routes[1].branch.checks.find((check) => check.id === "month-m2")?.passed ?? null;
    const starterState = m1 === true || m2 === true ? "pass" : m1 === false && m2 === false ? "fail" : "pending";
    const bearM1 = bearRoutes[0].branch.checks.find((check) => check.id === "month-m1")?.passed ?? null;
    const bearM2 = bearRoutes[1].branch.checks.find((check) => check.id === "month-m2")?.passed ?? null;
    const bearStarterState = bearM1 === true || bearM2 === true ? "pass" : bearM1 === false && bearM2 === false ? "fail" : "pending";
    return {
      stock, source, routes, best, allGreen: routes.some((route) => route.complete), starterState,
      bothStartersFailed: starterState === "fail", rank: 0, bearRoutes, bearBest,
      bearAllRed: bearRoutes.some((route) => route.complete), bearStarterState,
      bearBothStartersFailed: bearStarterState === "fail", bearRank: 0,
    } satisfies ProgressionMatrixRow;
  }).sort((left, right) => Number(right.allGreen) - Number(left.allGreen)
    || Number(right.starterState === "pass") - Number(left.starterState === "pass")
    || right.best.weightedPercent - left.best.weightedPercent
    || right.best.weightedScore - left.best.weightedScore
    || right.best.branch.depth - left.best.branch.depth
    || right.best.pass - left.best.pass
    || left.best.fail - right.best.fail
    || (Date.parse(right.source.observedAt ?? "") || 0) - (Date.parse(left.source.observedAt ?? "") || 0)
    || left.stock.symbol.localeCompare(right.stock.symbol));
  const withBullRanks = ranked.map((row, index) => ({ ...row, rank: index + 1 }));
  const bearOrder = [...withBullRanks].sort((left, right) => Number(right.bearAllRed) - Number(left.bearAllRed)
    || Number(right.bearStarterState === "pass") - Number(left.bearStarterState === "pass")
    || right.bearBest.weightedPercent - left.bearBest.weightedPercent
    || right.bearBest.weightedScore - left.bearBest.weightedScore
    || right.bearBest.branch.depth - left.bearBest.branch.depth
    || right.bearBest.pass - left.bearBest.pass
    || left.bearBest.fail - right.bearBest.fail
    || (Date.parse(right.source.observedAt ?? "") || 0) - (Date.parse(left.source.observedAt ?? "") || 0)
    || left.stock.symbol.localeCompare(right.stock.symbol));
  const bearRanks = new Map(bearOrder.map((row, index) => [row.stock.symbol, index + 1]));
  return withBullRanks.map((row) => ({ ...row, bearRank: bearRanks.get(row.stock.symbol) ?? 0 }));
}

export function directionalProgression(row: ProgressionMatrixRow, direction: ScalperProgressionDirection): DirectionalProgression {
  return direction === "bull"
    ? { direction, routes: row.routes, best: row.best, complete: row.allGreen, starterState: row.starterState, bothStartersFailed: row.bothStartersFailed, rank: row.rank }
    : { direction, routes: row.bearRoutes, best: row.bearBest, complete: row.bearAllRed, starterState: row.bearStarterState, bothStartersFailed: row.bearBothStartersFailed, rank: row.bearRank };
}

export function sortProgressionRows(rows: ProgressionMatrixRow[], direction: ScalperProgressionDirection): ProgressionMatrixRow[] {
  return [...rows].sort((left, right) => directionalProgression(left, direction).rank - directionalProgression(right, direction).rank);
}

export type ProgressionFilter = "all" | "7" | "6" | "5plus" | "m1" | "m2" | "waiting" | "failure";

export type ProgressionStockState = "complete" | "failed" | "incomplete";

export function progressionStockState(row: ProgressionMatrixRow, direction: ScalperProgressionDirection = "bull"): ProgressionStockState {
  const summary = directionalProgression(row, direction);
  if (summary.complete) return "complete";
  if (summary.bothStartersFailed) return "failed";
  return "incomplete";
}

export function progressionRowMatches(row: ProgressionMatrixRow, filter: ProgressionFilter): boolean {
  if (filter === "all") return true;
  if (filter === "7") return row.best.complete;
  if (filter === "6") return row.best.fail === 0 && row.best.pending === 1;
  if (filter === "5plus") return row.best.pass >= 5;
  if (filter === "m1") return row.best.branch.id === "previous-month";
  if (filter === "m2") return row.best.branch.id === "two-month";
  if (filter === "failure") return row.routes.some((route) => route.fail > 0);
  return row.routes.some((route) => {
    const intraday = route.branch.checks.filter((check) => ["hour", "15m", "5m"].includes(check.id));
    const prerequisite = route.branch.checks.filter((check) => !["hour", "15m", "5m"].includes(check.id));
    return prerequisite.every((check) => check.passed === true) && intraday.some((check) => check.passed == null);
  });
}
