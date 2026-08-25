import { formatNumber, roundUiNumber } from "../../lib/format";

export const MAX_CHART_DECIMAL_PLACES = 2;

export function roundChartNumber(value: number): number {
  return roundUiNumber(value);
}

export function formatChartNumber(value: number): string {
  return formatNumber(roundChartNumber(value), { maximumFractionDigits: MAX_CHART_DECIMAL_PLACES });
}

const LONG_DECIMAL_PATTERN = /[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{3,}/g;

/** Rounds long decimals emitted by custom chart formatters without touching dates or IDs. */
export function sanitizeChartDecimalText(value: unknown): string {
  return String(value).replace(LONG_DECIMAL_PATTERN, (match) => {
    const parsed = Number(match.replaceAll(",", ""));
    return Number.isFinite(parsed) ? formatChartNumber(parsed) : match;
  });
}

export function roundChartData(value: unknown): unknown {
  if (typeof value === "number") return roundChartNumber(value);
  if (Array.isArray(value)) return value.map((entry) => roundChartData(entry));
  if (value && typeof value === "object" && "value" in (value as Record<string, unknown>)) {
    const record = value as Record<string, unknown>;
    return { ...record, value: roundChartData(record.value) };
  }
  return value;
}

export function normalizeChartAxisFormatter(formatter: unknown) {
  if (typeof formatter === "function") {
    return (value: unknown, index: number) => sanitizeChartDecimalText(formatter(value, index));
  }
  if (typeof formatter === "string") {
    return (value: unknown) => sanitizeChartDecimalText(formatter.replace("{value}", formatChartValue(value)));
  }
  return (value: unknown) => formatChartValue(value);
}

export function normalizeChartTooltipValueFormatter(formatter: unknown) {
  if (typeof formatter === "function") {
    return (value: unknown, dataIndex: number) => sanitizeChartDecimalText(formatter(value, dataIndex));
  }
  return (value: unknown) => formatChartValue(value);
}

export function normalizeChartTooltipFormatter(formatter: unknown) {
  if (typeof formatter !== "function") return formatter;
  return (...args: unknown[]) => sanitizeChartDecimalText(formatter(...args));
}

function formatChartValue(value: unknown): string {
  if (typeof value === "number") return formatChartNumber(value);
  if (Array.isArray(value)) return value.map((entry) => formatChartValue(entry)).join(", ");
  return sanitizeChartDecimalText(value);
}
