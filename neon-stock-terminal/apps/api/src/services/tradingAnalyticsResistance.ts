import { levels, numeric, type Facts, type Bar } from "./tradingAnalytics";
import { periodCandles } from "./tradingAnalyticsPeriods";
export function resistanceViews(
  daily: Facts[],
  asOf: string,
  price: number | null,
  dayCount?: number,
  weekCount?: number,
) {
  const rows = {
    daily: daily.map((r) => ({
      ...r,
      end: new Date(Date.parse(String(r.date) + "T18:30:00Z")).toISOString(),
      knownAt: r.created_at,
      closed: true,
    })),
    weekly: periodCandles(daily, "week", asOf),
    monthly: periodCandles(daily, "month", asOf),
  };
  return Object.entries(rows).map(([timeframe, source]) => {
    const count =
      timeframe === "monthly"
        ? 12
        : timeframe === "weekly"
          ? weekCount
          : dayCount;
    const bars = source
      .filter((r) =>
        ["open", "high", "low", "close"].every(
          (k) => numeric((r as Facts)[k]) != null,
        ),
      )
      .map((r) => ({
        ...r,
        start: String((r as Facts).date),
        end: String(r.end),
        knownAt:
          r.knownAt == null ? null : new Date(String(r.knownAt)).toISOString(),
      })) as Bar[];
    const result = levels(bars, asOf, count ?? null);
    const available = bars.filter(
      (b) =>
        b.closed &&
        b.knownAt != null &&
        Date.parse(b.knownAt) <= Date.parse(asOf) &&
        Date.parse(b.end) <= Date.parse(asOf),
    ).length;
    const selected =
      count && available >= count && price != null
        ? (result.candidates.find(
            (c) => !c.resistanceBrokenAt && c.resistance > price,
          ) ?? null)
        : null;
    return {
      timeframe,
      lookback: count ?? null,
      availableBars: available,
      price,
      selected,
      state:
        count == null
          ? "LOOKBACK_REQUIRED"
          : available < count
            ? "DATA_INSUFFICIENT"
            : selected
              ? "PREVIEW_UNAPPROVED"
              : "NO_VALID_RESISTANCE",
      policy:
        "BEARISH_OPEN_LARGEST_BODY_THEN_RECENT_STRICT_CLOSE_BREAK_V1_PREVIEW",
      coverage:
        "Retained source; original revisions and complete session coverage not certified",
      ...{ candidates: result.candidates },
    };
  });
}
