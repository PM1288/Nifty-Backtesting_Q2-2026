import { ema9, numeric, type Facts } from "./tradingAnalytics";
/** Presentation read model; does not change existing bar tables or strategy indicators. */
export function periodCandles(
  rows: Facts[],
  period: "week" | "month",
  asOf: string,
) {
  const groups = new Map<string, Facts[]>();
  for (const row of rows) {
    const d = new Date(`${row.date}T00:00:00Z`);
    if (!Number.isFinite(d.getTime())) continue;
    if (period === "month") d.setUTCDate(1);
    else d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const key = d.toISOString().slice(0, 10);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const bars = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => {
      items.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const utc = new Date(`${date}T00:00:00Z`);
      const end =
        period === "month"
          ? new Date(
              Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth() + 1, 1) -
                19800000,
            )
          : new Date(utc.getTime() + 7 * 86400000 - 19800000);
      const valid = items.every((r) =>
        ["open", "close", "high", "low"].every((k) => numeric(r[k]) != null),
      );
      return {
        date,
        open: valid ? numeric(items[0].open) : null,
        close: valid ? numeric(items.at(-1)?.close) : null,
        high: valid ? Math.max(...items.map((r) => numeric(r.high)!)) : null,
        low: valid ? Math.min(...items.map((r) => numeric(r.low)!)) : null,
        closed: end.getTime() <= Date.parse(asOf),
        sourceDays: items.length,
        sourceStart: items[0].date,
        sourceEnd: items.at(-1)?.date,
        source: "retained_daily_aggregation",
        coverageState: "DAILY_SOURCE_AGGREGATION_NOT_SESSION_RECONCILED",
      };
    });
  const closed = bars.filter((b) => b.closed && b.close != null);
  const ema = ema9(closed.map((b) => b.close!));
  const byDate = new Map(closed.map((b, i) => [b.date, ema[i]]));
  return bars.map((b) => ({ ...b, ema9: byDate.get(b.date) ?? null }));
}
