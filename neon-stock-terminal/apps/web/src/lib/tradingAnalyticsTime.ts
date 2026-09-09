export type ChartTimeValue = number | string | { year: number; month: number; day: number };

export function chartTimeToIso(value: ChartTimeValue | undefined) {
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  if (value && typeof value === "object" && "year" in value)
    return new Date(Date.UTC(value.year, value.month - 1, value.day)).toISOString();
  return null;
}

/** Lightweight Charts formats epoch timestamps as UTC unless a formatter is
 * supplied. Trading Analytics is an NSE workstation, so every financial-chart
 * axis and crosshair timestamp uses the same explicit Asia/Kolkata policy. */
export function istChartTimeLabel(value: ChartTimeValue) {
  const iso = chartTimeToIso(value);
  return iso == null ? "—" : new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
