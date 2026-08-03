import { fetchStock } from "./api";
import type { IntradayBar } from "./types";

type LookbackChange = {
  days: 5 | 10 | 15 | 30;
  base: number | null;
  pct: number | null;
};

export type StockHoverDetails = {
  symbol: string;
  name: string;
  last: number;
  change: number;
  changePct: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | string | null;
  percentile53w: number | null;
  dailyRsi: number | null;
  dailyWillr: number | null;
  intradayRsi: number | null;
  intradayWillr: number | null;
  bollingerLower: number | null;
  bollingerMiddle: number | null;
  bollingerUpper: number | null;
  lookbacks: LookbackChange[];
};

function finiteOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function closeSeries(bars: IntradayBar[]): number[] {
  return bars.map((b) => Number(b.c)).filter((n) => Number.isFinite(n));
}

function computeRsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  const start = closes.length - period;

  for (let i = start; i < closes.length; i += 1) {
    const prev = closes[i - 1];
    const next = closes[i];
    if (!Number.isFinite(prev) || !Number.isFinite(next)) continue;
    const delta = next - prev;
    if (delta > 0) gains += delta;
    else losses += Math.abs(delta);
  }

  if (gains === 0 && losses === 0) return 50;
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - 100 / (1 + rs);
}

function computeWillr(bars: IntradayBar[], period = 14): number | null {
  if (bars.length < period) return null;
  const windowBars = bars.slice(-period);
  const closeLatest = finiteOrNull(windowBars[windowBars.length - 1]?.c);
  if (closeLatest == null) return null;

  let highMax = Number.NEGATIVE_INFINITY;
  let lowMin = Number.POSITIVE_INFINITY;
  for (const bar of windowBars) {
    const high = finiteOrNull(bar.h);
    const low = finiteOrNull(bar.l);
    if (high == null || low == null) continue;
    highMax = Math.max(highMax, high);
    lowMin = Math.min(lowMin, low);
  }
  if (!Number.isFinite(highMax) || !Number.isFinite(lowMin) || highMax === lowMin) return null;
  return ((highMax - closeLatest) / (highMax - lowMin)) * -100;
}

function computeBollinger(closes: number[], period = 20) {
  if (closes.length < period) return { lower: null, middle: null, upper: null };
  const window = closes.slice(-period);
  const mean = window.reduce((sum, value) => sum + value, 0) / window.length;
  const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / window.length;
  const sd = Math.sqrt(variance);
  return {
    lower: mean - 2 * sd,
    middle: mean,
    upper: mean + 2 * sd
  };
}

function computePercentile53w(current: number, dailyCloses: number[]): number | null {
  if (!Number.isFinite(current) || !dailyCloses.length) return null;
  const window = dailyCloses.slice(-252);
  if (!window.length) return null;
  const low = Math.min(...window);
  const high = Math.max(...window);
  if (!Number.isFinite(low) || !Number.isFinite(high) || high === low) return null;
  const percentile = ((current - low) / (high - low)) * 100;
  return Math.max(0, Math.min(100, percentile));
}

function computeLookbacks(current: number, dailyCloses: number[]): LookbackChange[] {
  const targets: Array<5 | 10 | 15 | 30> = [5, 10, 15, 30];
  return targets.map((days) => {
    const index = dailyCloses.length - 1 - days;
    const base = index >= 0 ? finiteOrNull(dailyCloses[index]) : null;
    const pct = base != null && base !== 0 ? ((current - base) / base) * 100 : null;
    return { days, base, pct };
  });
}

export async function fetchStockHoverDetails(symbolRaw: string): Promise<StockHoverDetails> {
  const symbol = symbolRaw.toUpperCase();
  const [intraday, yearly] = await Promise.all([fetchStock(symbol, "1D"), fetchStock(symbol, "1Y")]);

  const intradayBars = intraday.intraday ?? [];
  const yearlyBars = yearly.intraday ?? [];
  const intradayCloses = closeSeries(intradayBars);
  const yearlyCloses = closeSeries(yearlyBars);

  const current =
    finiteOrNull(intraday.stock.last) ??
    finiteOrNull(yearly.stock.last) ??
    (intradayCloses.length ? intradayCloses[intradayCloses.length - 1] : 0);
  const open = finiteOrNull(intraday.stock.day?.open);
  const high = finiteOrNull(intraday.stock.day?.high);
  const low = finiteOrNull(intraday.stock.day?.low);
  const volume = intraday.stock.day?.volume ?? intraday.stock.volume ?? yearly.stock.day?.volume ?? null;
  const bollinger = computeBollinger(yearlyCloses);

  return {
    symbol: intraday.stock.symbol,
    name: intraday.stock.name,
    last: current,
    change: finiteOrNull(intraday.stock.change) ?? 0,
    changePct: finiteOrNull(intraday.stock.changePct) ?? 0,
    open,
    high,
    low,
    volume,
    percentile53w: computePercentile53w(current, yearlyCloses),
    dailyRsi: computeRsi(yearlyCloses, 14),
    dailyWillr: computeWillr(yearlyBars, 14),
    intradayRsi: computeRsi(intradayCloses, 14),
    intradayWillr: computeWillr(intradayBars, 14),
    bollingerLower: bollinger.lower,
    bollingerMiddle: bollinger.middle,
    bollingerUpper: bollinger.upper,
    lookbacks: computeLookbacks(current, yearlyCloses)
  };
}
