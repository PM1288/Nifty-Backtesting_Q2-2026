import type { ScalperProgressionRow } from "./types";

export const SCALPER_CONDITION_CODES = [
  "M2_RED",
  "M1_GREEN",
  "D0_OPEN_ABOVE_W0_OPEN",
  "D0_OPEN_ABOVE_W1_OPEN",
  "D0_OPEN_ABOVE_D1_OPEN",
] as const;

export type ScalperConditionCode = (typeof SCALPER_CONDITION_CODES)[number];
export type ScalperConditionState = "PASS" | "FAIL" | "UNAVAILABLE";

const CONDITION_LABELS: Record<ScalperConditionCode, string> = {
  M2_RED: "M−2 close < open",
  M1_GREEN: "M−1 close > open",
  D0_OPEN_ABOVE_W0_OPEN: "Today open > W0 open",
  D0_OPEN_ABOVE_W1_OPEN: "Today open > W−1 open",
  D0_OPEN_ABOVE_D1_OPEN: "Today open > D−1 open",
};

function compare(left: number | null | undefined, operator: "<" | ">", right: number | null | undefined): ScalperConditionState {
  if (left == null || right == null) return "UNAVAILABLE";
  return operator === ">" ? (left > right ? "PASS" : "FAIL") : (left < right ? "PASS" : "FAIL");
}

/** Backward-compatible fallback for a cached response produced before condition metadata was added. */
export function scalperConditionStates(row: ScalperProgressionRow): Record<ScalperConditionCode, ScalperConditionState> {
  const supplied = new Map((row.conditions ?? []).map((condition) => [condition.code, condition.state]));
  return {
    M2_RED: supplied.get("M2_RED") ?? compare(row.twoMonthsAgoClose, "<", row.twoMonthsAgoOpen),
    M1_GREEN: supplied.get("M1_GREEN") ?? compare(row.previousMonthClose, ">", row.previousMonthOpen),
    D0_OPEN_ABOVE_W0_OPEN: supplied.get("D0_OPEN_ABOVE_W0_OPEN") ?? compare(row.todayOpen, ">", row.currentWeekOpen),
    D0_OPEN_ABOVE_W1_OPEN: supplied.get("D0_OPEN_ABOVE_W1_OPEN") ?? compare(row.todayOpen, ">", row.previousWeekOpen),
    D0_OPEN_ABOVE_D1_OPEN: supplied.get("D0_OPEN_ABOVE_D1_OPEN") ?? compare(row.todayOpen, ">", row.previousDayOpen),
  };
}

export function scalperConditionLabel(code: ScalperConditionCode): string {
  return CONDITION_LABELS[code];
}

export function scalperScore(row: ScalperProgressionRow): { passed: number; available: number } {
  const values = Object.values(scalperConditionStates(row));
  return {
    passed: values.filter((state) => state === "PASS").length,
    available: values.filter((state) => state !== "UNAVAILABLE").length,
  };
}
