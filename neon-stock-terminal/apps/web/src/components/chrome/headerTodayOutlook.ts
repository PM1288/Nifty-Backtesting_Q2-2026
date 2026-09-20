import type { MorningSummaryResponse } from "../../lib/types";

export type HeaderOutlookTone = "positive" | "negative" | "neutral";

const POSITIVE_OUTLOOKS = new Set(["Super Bullish", "Bullish", "Sideways (Bullish)"]);
const NEGATIVE_OUTLOOKS = new Set(["Super Bearish", "Bearish", "Sideways (Bearish)"]);

function finiteNumber(value: number | string | null | undefined) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function formatCrore(value: number | string | null | undefined) {
  const numeric = finiteNumber(value);
  if (numeric == null) return "—";
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function state(value: string | null | undefined) {
  return value === "Buy" || value === "Sell" || value === "Neutral" ? value : "—";
}

export function outlookTone(matrix: string | null | undefined): HeaderOutlookTone {
  if (matrix && POSITIVE_OUTLOOKS.has(matrix)) return "positive";
  if (matrix && NEGATIVE_OUTLOOKS.has(matrix)) return "negative";
  return "neutral";
}

export function buildHeaderTodayOutlook(summary: MorningSummaryResponse | null | undefined) {
  const equity = state(summary?.equity);
  const futures = state(summary?.futures);
  const options = state(summary?.options);
  const result = summary?.matrix && !["INSUFFICIENT_DATA", "NEUTRAL_INPUT", "UNMAPPED_COMBINATION"].includes(summary.matrix)
    ? summary.matrix
    : "Data unavailable";
  const report = summary?.reportDate ?? "report unavailable";
  const derivativesReport = summary?.derivativesReportDate ?? summary?.reportDate ?? "unavailable";
  const cashReport = summary?.cashReportDate ?? "unavailable";
  const equityValue = formatCrore(summary?.equityNet);
  const futuresValue = formatCrore(summary?.futuresNet);
  const optionsValue = formatCrore(summary?.optionsNet);
  const title = [
    `Today outlook · FII activity · derivatives ${derivativesReport} · cash ${cashReport}`,
    `Equity ${equity} · ₹${equityValue} crore`,
    `Index futures ${futures} · ₹${futuresValue} crore`,
    `Index options ${options} · ₹${optionsValue} crore`,
    `Original market matrix: ${result}`,
    "Index derivatives cover all indices, not NIFTY only. Options value is not premium cash flow.",
  ].join("\n");
  return { equity, futures, options, equityValue, futuresValue, optionsValue, result, report, derivativesReport, cashReport, title, tone: outlookTone(summary?.matrix) };
}
