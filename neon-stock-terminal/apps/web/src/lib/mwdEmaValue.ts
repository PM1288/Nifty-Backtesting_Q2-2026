import type { IntradayBar } from "./types";

export type MwdLevelId = "15m" | "1h" | "day" | "week" | "month" | "quarter" | "year" | "pdc" | "previous-day" | "previous-week" | "previous-month";
export type MwdBias = "UP" | "DOWN" | "UNAVAILABLE";

export type MwdLevel = {
  id: MwdLevelId;
  label: string;
  value: number | null;
  bias: MwdBias;
  color: string;
  plot: boolean;
  startIndex: number;
  basis: string;
};

export type MwdEmaValueModel = {
  bars: IntradayBar[];
  levels: MwdLevel[];
  ema9: Array<number | null>;
  ema21: Array<number | null>;
  ema50: Array<number | null>;
  ema200: Array<number | null>;
  tradedValueCr: Array<number | null>;
  latestPrice: number | null;
  sessionDate: string | null;
};

const IST_OFFSET_MS = 330 * 60_000;
const NSE_SESSION_OPEN_MINUTE = 9 * 60 + 15;
const NSE_SESSION_CLOSE_MINUTE = 15 * 60 + 30;

const finite = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const validBars = (bars: IntradayBar[]) => bars
  .filter((bar) => Number.isFinite(Date.parse(bar.t)) && [bar.o, bar.h, bar.l, bar.c].every(Number.isFinite))
  .sort((left, right) => Date.parse(left.t) - Date.parse(right.t));

function istParts(timestamp: string) {
  const shifted = new Date(Date.parse(timestamp) + IST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  return {
    year,
    month,
    day,
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

function weekKey(timestamp: string) {
  const parts = istParts(timestamp);
  const mondayOffset = (parts.weekday + 6) % 7;
  const monday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - mondayOffset));
  return monday.toISOString().slice(0, 10);
}

const monthKey = (timestamp: string) => {
  const { year, month } = istParts(timestamp);
  return `${year}-${String(month).padStart(2, "0")}`;
};
const quarterKey = (timestamp: string) => {
  const { year, month } = istParts(timestamp);
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
};
const yearKey = (timestamp: string) => String(istParts(timestamp).year);

function currentAndPreviousOpen(bars: IntradayBar[], key: (timestamp: string) => string) {
  const groups: Array<{ key: string; open: number }> = [];
  for (const bar of bars) {
    const groupKey = key(bar.t);
    if (groups.at(-1)?.key !== groupKey) groups.push({ key: groupKey, open: bar.o });
  }
  return { current: groups.at(-1)?.open ?? null, previous: groups.at(-2)?.open ?? null };
}

function sessionBucketStartIndex(bars: IntradayBar[], minutes: number) {
  if (!bars.length) return -1;
  const last = istParts(bars.at(-1)!.t);
  const lastOffset = Math.max(0, last.minute - NSE_SESSION_OPEN_MINUTE);
  const bucketStart = NSE_SESSION_OPEN_MINUTE + Math.floor(lastOffset / minutes) * minutes;
  return bars.findIndex((bar) => {
    const parts = istParts(bar.t);
    return parts.date === last.date && parts.minute >= bucketStart;
  });
}

function ema(values: number[], length: number) {
  const alpha = 2 / (length + 1);
  let current: number | null = null;
  return values.map((value) => {
    current = current == null ? value : value * alpha + current * (1 - alpha);
    return current;
  });
}

function tradedValue(bars: IntradayBar[]) {
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;
  return bars.map((bar) => {
    const volume = finite(bar.v);
    if (volume == null || volume < 0) return null;
    cumulativePriceVolume += ((bar.h + bar.l + bar.c) / 3) * volume;
    cumulativeVolume += volume;
    if (cumulativeVolume <= 0) return 0;
    return (cumulativePriceVolume / cumulativeVolume * volume) / 10_000_000;
  });
}

/**
 * Repository-native implementation of the supplied Opens+ Pine methodology.
 * Intraday lines use the current NSE session; higher-period anchors and PDC use
 * retained daily bars. Warm-up bars feed EMAs but are never returned for display.
 */
export function buildMwdEmaValueModel(
  displayBarsInput: IntradayBar[],
  dailyBarsInput: IntradayBar[],
  warmupBarsInput: IntradayBar[] = [],
): MwdEmaValueModel {
  const allDisplay = validBars(displayBarsInput);
  const sessionEligible = allDisplay.filter((bar) => {
    const parts = istParts(bar.t);
    return parts.minute >= NSE_SESSION_OPEN_MINUTE && parts.minute < NSE_SESSION_CLOSE_MINUTE;
  });
  const sessionDate = sessionEligible.length ? istParts(sessionEligible.at(-1)!.t).date : null;
  const bars = sessionDate ? sessionEligible.filter((bar) => istParts(bar.t).date === sessionDate) : [];
  const dailyBars = validBars(dailyBarsInput).filter((bar) => !sessionDate || istParts(bar.t).date <= sessionDate);
  const dailyByDate = new Map(dailyBars.map((bar) => [istParts(bar.t).date, bar]));
  if (sessionDate && bars.length) {
    const first = bars[0]!, last = bars.at(-1)!;
    dailyByDate.set(sessionDate, {
      t: first.t,
      o: first.o,
      h: Math.max(...bars.map((bar) => bar.h)),
      l: Math.min(...bars.map((bar) => bar.l)),
      c: last.c,
      v: bars.some((bar) => finite(bar.v) != null) ? bars.reduce((sum, bar) => sum + (finite(bar.v) ?? 0), 0) : undefined,
    });
  }
  const anchoredDaily = [...dailyByDate.values()].sort((left, right) => Date.parse(left.t) - Date.parse(right.t));
  const day = currentAndPreviousOpen(anchoredDaily, (timestamp) => istParts(timestamp).date);
  const week = currentAndPreviousOpen(anchoredDaily, weekKey);
  const month = currentAndPreviousOpen(anchoredDaily, monthKey);
  const quarter = currentAndPreviousOpen(anchoredDaily, quarterKey);
  const year = currentAndPreviousOpen(anchoredDaily, yearKey);
  const previousDaily = sessionDate ? anchoredDaily.filter((bar) => istParts(bar.t).date < sessionDate).at(-1) : anchoredDaily.at(-2);
  const latestPrice = finite(bars.at(-1)?.c);
  const bucket15 = sessionBucketStartIndex(bars, 15);
  const bucket60 = sessionBucketStartIndex(bars, 60);
  const bias = (value: number | null): MwdBias => latestPrice == null || value == null ? "UNAVAILABLE" : latestPrice > value ? "UP" : "DOWN";
  const level = (id: MwdLevelId, label: string, value: number | null, color: string, plot: boolean, startIndex: number, basis: string): MwdLevel => ({
    id, label, value, color, plot, startIndex: Math.max(0, startIndex), basis, bias: bias(value),
  });
  const current15 = bucket15 >= 0 ? bars[bucket15]!.o : null;
  const current60 = bucket60 >= 0 ? bars[bucket60]!.o : null;
  const levels = [
    level("15m", "15m open", current15, "#0f766e", true, bucket15, "Current session-aligned 15-minute bucket open"),
    level("1h", "1H open", current60, "#c026d3", true, bucket60, "Current session-aligned 60-minute bucket open"),
    level("day", "Day open", day.current, "#15803d", true, 0, "Current NSE trading-day open"),
    level("week", "Week open", week.current, "#d97706", true, 0, "Current trading-week first observed open"),
    level("month", "Month open", month.current, "#dc2626", true, 0, "Current calendar-month first observed open"),
    level("quarter", "3M open", quarter.current, "#7e22ce", true, 0, "Current calendar-quarter first observed open"),
    level("year", "Year open", year.current, "#2563eb", true, 0, "Current calendar-year first observed open"),
    level("pdc", "PDC", finite(previousDaily?.c), "#64748b", true, 0, "Previous completed NSE trading-day close"),
    level("previous-day", "1D ago open", day.previous, "#15803d", false, 0, "Previous completed trading-day open"),
    level("previous-week", "1W ago open", week.previous, "#d97706", false, 0, "Previous completed trading-week open"),
    level("previous-month", "1M ago open", month.previous, "#dc2626", false, 0, "Previous completed calendar-month open"),
  ];
  const warmup = validBars(warmupBarsInput).filter((bar) => !bars.length || Date.parse(bar.t) < Date.parse(bars[0]!.t));
  const emaInput = [...warmup, ...bars];
  const slice = <T,>(values: T[]) => values.slice(Math.max(0, values.length - bars.length));
  const closes = emaInput.map((bar) => bar.c);
  return {
    bars,
    levels,
    ema9: slice(ema(closes, 9)),
    ema21: slice(ema(closes, 21)),
    ema50: slice(ema(closes, 50)),
    ema200: slice(ema(closes, 200)),
    tradedValueCr: tradedValue(bars),
    latestPrice,
    sessionDate,
  };
}
