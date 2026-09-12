import type { Quote, ScalperProgressionRow } from "../../lib/types";
import { buildScalperProgressionBranches, type ScalperProgressionBranch } from "./todayModel";

export type ProgressionRouteSummary = {
  branch: ScalperProgressionBranch;
  pass: number;
  fail: number;
  pending: number;
  complete: boolean;
};

export type ProgressionMatrixRow = {
  stock: Quote;
  source: ScalperProgressionRow;
  routes: [ProgressionRouteSummary, ProgressionRouteSummary];
  best: ProgressionRouteSummary;
  allGreen: boolean;
};

export function summarizeProgressionRoute(branch: ScalperProgressionBranch): ProgressionRouteSummary {
  const pass = branch.checks.filter((check) => check.passed === true).length;
  const fail = branch.checks.filter((check) => check.passed === false).length;
  const pending = branch.checks.length - pass - fail;
  return { branch, pass, fail, pending, complete: pass === branch.checks.length };
}

function compareRoutes(left: ProgressionRouteSummary, right: ProgressionRouteSummary): number {
  return Number(right.complete) - Number(left.complete)
    || right.branch.depth - left.branch.depth
    || right.pass - left.pass
    || left.fail - right.fail
    || left.branch.id.localeCompare(right.branch.id);
}

export function buildProgressionMatrixRows(stocks: Quote[], rows: ScalperProgressionRow[]): ProgressionMatrixRow[] {
  const sourceBySymbol = new Map(rows.map((row) => [row.symbol, row]));
  return stocks.map((stock) => {
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
    const best = [...routes].sort(compareRoutes)[0];
    return { stock, source, routes, best, allGreen: routes.some((route) => route.complete) };
  }).sort((left, right) => Number(right.allGreen) - Number(left.allGreen)
    || right.best.branch.depth - left.best.branch.depth
    || right.best.pass - left.best.pass
    || left.best.fail - right.best.fail
    || (Date.parse(right.source.observedAt ?? "") || 0) - (Date.parse(left.source.observedAt ?? "") || 0)
    || left.stock.symbol.localeCompare(right.stock.symbol));
}

export type ProgressionFilter = "all" | "7" | "6" | "5plus" | "m1" | "m2" | "waiting" | "failure";

export function progressionRowMatches(row: ProgressionMatrixRow, filter: ProgressionFilter): boolean {
  if (filter === "all") return true;
  if (filter === "7") return row.best.branch.depth === 7;
  if (filter === "6") return row.best.branch.depth === 6;
  if (filter === "5plus") return row.best.branch.depth >= 5;
  if (filter === "m1") return row.best.branch.id === "previous-month";
  if (filter === "m2") return row.best.branch.id === "two-month";
  if (filter === "failure") return row.routes.some((route) => route.fail > 0);
  return row.routes.some((route) => route.branch.checks.slice(0, 4).every((check) => check.passed === true)
    && route.branch.checks.slice(4).some((check) => check.passed == null));
}
