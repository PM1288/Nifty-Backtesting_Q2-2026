import { ema9, numeric, type Facts } from "./tradingAnalytics";
/** Presentation read model; does not change existing bar tables or strategy indicators. */
export function periodCandles(
  rows: Facts[],
  period: "week" | "month",
  asOf: string,
  expectedSessions: Facts[] = [],
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
      const belongs = (candidate: Facts) => {
        const value = new Date(`${candidate.trade_date}T00:00:00Z`);
        if (period === "month") value.setUTCDate(1);
        else value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
        return value.toISOString().slice(0, 10) === date;
      };
      const expected = expectedSessions
        .filter(belongs)
        .sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));
      const finalSession = expected.at(-1);
      const end = finalSession?.market_close_ts
        ? new Date(String(finalSession.market_close_ts))
        : period === "month"
          ? new Date(
              Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth() + 1, 1) -
                19800000,
            )
          : new Date(utc.getTime() + 7 * 86400000 - 19800000);
      const valid = items.every((r) =>
        ["open", "close", "high", "low"].every((k) => numeric(r[k]) != null),
      );
      const observedDates = new Set(items.map((row) => String(row.date)));
      const expectedDates = expected.map((row) => String(row.trade_date));
      const sessionReconciled =
        expectedDates.length > 0 &&
        expectedDates.every((value) => observedDates.has(value));
      const priceBases = new Set(items.map((row) => String(row.source ?? "")));
      const consistentPriceBasis = priceBases.size === 1 && !priceBases.has("");
      const periodClosed = end.getTime() <= Date.parse(asOf);
      const calendarQualified = expectedDates.length > 0;
      const coverageComplete =
        periodClosed && valid && (calendarQualified ? sessionReconciled && consistentPriceBasis : true);
      return {
        date,
        end: end.toISOString(),
        knownAt: items.every((r) => r.created_at != null)
          ? new Date(
              Math.max(
                ...items.map((r) => new Date(String(r.created_at)).getTime()),
                end.getTime(),
              ),
            ).toISOString()
          : null,
        open: valid ? numeric(items[0].open) : null,
        close: valid ? numeric(items.at(-1)?.close) : null,
        high: valid ? Math.max(...items.map((r) => numeric(r.high)!)) : null,
        low: valid ? Math.min(...items.map((r) => numeric(r.low)!)) : null,
        closed: coverageComplete,
        periodClosed,
        coverageComplete,
        sourceDays: items.length,
        sourceStart: items[0].date,
        sourceEnd: items.at(-1)?.date,
        source: "retained_daily_aggregation",
        expectedDays: expectedDates.length || null,
        missingSessions: expectedDates.filter((value) => !observedDates.has(value)),
        priceBasis: consistentPriceBasis ? [...priceBases][0] : null,
        coverageState:
          !calendarQualified
            ? "DAILY_SOURCE_AGGREGATION_NOT_SESSION_RECONCILED"
            : !consistentPriceBasis
              ? "PRICE_BASIS_UNVERIFIED"
              : !sessionReconciled
                ? "MISSING_EXPECTED_SESSION"
                : periodClosed
                  ? "COMPLETE"
                  : "FORMING",
      };
    });
  const closed = bars.filter((b) => b.closed && b.close != null);
  const ema = ema9(closed.map((b) => b.close!));
  const byDate = new Map(closed.map((b, i) => [b.date, ema[i]]));
  return bars.map((b) => ({ ...b, ema9: byDate.get(b.date) ?? null }));
}
