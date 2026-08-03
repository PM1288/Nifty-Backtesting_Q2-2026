import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useI18n } from "../i18n/LocaleProvider";
import { useQuery } from "@tanstack/react-query";
import { useAuthGate } from "../auth/AuthGateProvider";
import { useObservedQueryTiming, usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { CandlestickChart } from "../components/visual/CandlestickChart";
import { GlitchText } from "../components/visual/GlitchText";
import { fetchStockHoverDetails } from "../lib/hoverDetails";
import { fmtChange, fmtDecimal, fmtPct, fmtPrice, fmtWholeNumber, formatTime, arrow } from "../lib/format";
import { useLiveQuotes, useStock } from "../lib/hooks";
import { directionFromChangePct } from "../lib/types";
import type { IntradayBar, Quote } from "../lib/types";
import styles from "./StockPage.module.css";

const RANGES = ["1D", "5D", "1M", "6M", "1Y"] as const;
type RangeKey = (typeof RANGES)[number];

type PivotLevels = {
  pivot: number;
  r1: number;
  r2: number;
  s1: number;
  s2: number;
};

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function volumeFromBar(bar: IntradayBar): number {
  const raw = (bar as IntradayBar & { v?: unknown }).v;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function mergeWithLive(quote: Quote, live: { price: number; change: number; changePct: number; timestamp: string } | undefined) {
  if (!live) return quote;
  const previousClose = quote.last - quote.change;
  const canUsePrevClose = Number.isFinite(previousClose) && Math.abs(previousClose) > 1e-9;
  const nextChange = canUsePrevClose ? live.price - previousClose : live.change;
  const nextChangePct = canUsePrevClose ? (nextChange / previousClose) * 100 : live.changePct;

  return {
    ...quote,
    last: live.price,
    change: Number.isFinite(nextChange) ? nextChange : live.change,
    changePct: Number.isFinite(nextChangePct) ? nextChangePct : live.changePct,
    timestamp: live.timestamp
  };
}

function computeVwap(bars: IntradayBar[]): number | null {
  let pv = 0;
  let totalVolume = 0;
  let closeSum = 0;
  let closeCount = 0;

  for (const bar of bars) {
    const volume = volumeFromBar(bar);
    const close = finiteNumber(bar.c);
    if (close != null) {
      closeSum += close;
      closeCount += 1;
    }

    if (volume <= 0) continue;

    const high = finiteNumber(bar.h);
    const low = finiteNumber(bar.l);
    if (high == null || low == null || close == null) continue;

    const typicalPrice = (high + low + close) / 3;
    pv += typicalPrice * volume;
    totalVolume += volume;
  }

  if (totalVolume > 0) return pv / totalVolume;
  return closeCount > 0 ? closeSum / closeCount : null;
}

function sumIntradayVolume(bars: IntradayBar[]): number | null {
  const total = bars.reduce((acc, bar) => acc + volumeFromBar(bar), 0);
  return total > 0 ? total : null;
}

function computePivotLevels(high: number | null, low: number | null, close: number | null): PivotLevels | null {
  if (high == null || low == null || close == null) return null;
  if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) return null;
  const pivot = (high + low + close) / 3;
  return {
    pivot,
    r1: 2 * pivot - low,
    r2: pivot + (high - low),
    s1: 2 * pivot - high,
    s2: pivot - (high - low)
  };
}

function computePercentileRank(value: number | null, samples: number[]): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const valid = samples.filter((sample) => Number.isFinite(sample) && sample > 0);
  if (!valid.length) return null;
  const lessOrEqual = valid.filter((sample) => sample <= value).length;
  return (lessOrEqual / valid.length) * 100;
}

function average(values: number[]): number | null {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function fmtMaybePrice(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : fmtPrice(value);
}

function fmtMaybePct(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : fmtPct(value);
}

function fmtMaybeNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return fmtDecimal(value, digits);
}

function fmtVolume(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return fmtWholeNumber(value);
}

type MetricCardProps = {
  label: string;
  value: string;
  hint?: string;
};

function MetricCard({ label, value, hint }: MetricCardProps) {
  return (
    <div className={styles.metricCard}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricValue}>{value}</div>
      {hint ? <div className={styles.metricHint}>{hint}</div> : null}
    </div>
  );
}

export function StockPage() {
  const { tr } = useI18n();
  const { user, authReady } = useAuthGate();
  const detailAccessEnabled = authReady;
  const sessionEnabled = authReady && !!user;
  const params = useParams();
  const symbol = (params.symbol ?? "").toUpperCase().trim();
  const [range, setRange] = useState<RangeKey>("1D");

  const chartQuery = useStock(symbol, range, detailAccessEnabled);
  const intradayQuery = useStock(symbol, "1D", detailAccessEnabled);
  const yearlyQuery = useStock(symbol, "1Y", detailAccessEnabled);
  const indicatorQuery = useQuery({
    queryKey: ["stock-hover-details", symbol],
    queryFn: () => fetchStockHoverDetails(symbol),
    enabled: detailAccessEnabled && symbol.length > 0,
    refetchInterval: 20_000
  });
  const live = useLiveQuotes(symbol ? [symbol] : [], sessionEnabled);
  useObservedQueryTiming(`stock-hover-details:${symbol}`, indicatorQuery, detailAccessEnabled && symbol.length > 0);
  usePageLoadProfile({
    pageName: "stock_page",
    enabled: detailAccessEnabled && !!symbol,
    queries: [
      { name: `stock:${symbol}:${range}`, isLoading: chartQuery.isLoading, isError: !!chartQuery.error },
      { name: `stock:${symbol}:1D`, isLoading: intradayQuery.isLoading, isError: !!intradayQuery.error },
      { name: `stock:${symbol}:1Y`, isLoading: yearlyQuery.isLoading, isError: !!yearlyQuery.error },
      { name: `stock-hover-details:${symbol}`, isLoading: indicatorQuery.isLoading, isError: !!indicatorQuery.error }
    ],
    extra: { symbol, range }
  });

  if (!detailAccessEnabled) {
    return <div className={styles.state}>{tr("Loading {{symbol}} dashboard…").replace("{{symbol}}", symbol || tr("symbol"))}</div>;
  }

  const hasData = Boolean(chartQuery.data || intradayQuery.data || yearlyQuery.data);
  if (!hasData && (chartQuery.isLoading || intradayQuery.isLoading || yearlyQuery.isLoading)) {
    return <div className={styles.state}>{tr("Loading {{symbol}} dashboard…").replace("{{symbol}}", symbol || tr("symbol"))}</div>;
  }
  if (!hasData) {
    return <div className={styles.state}>{tr("Failed to load {{symbol}} dashboard.").replace("{{symbol}}", symbol || tr("symbol"))}</div>;
  }

  const baseStock = chartQuery.data?.stock ?? intradayQuery.data?.stock ?? yearlyQuery.data?.stock ?? null;
  if (!baseStock) {
    return <div className={styles.state}>{tr("No stock data available for {{symbol}}.").replace("{{symbol}}", symbol || tr("this symbol"))}</div>;
  }

  const stock = mergeWithLive(baseStock, live[symbol]);
  const dir = directionFromChangePct(stock.changePct);
  const tone = dir === "up" ? "green" : dir === "down" ? "red" : "white";

  const chartBars = chartQuery.data?.intraday ?? [];
  const intradayBars = intradayQuery.data?.intraday ?? [];
  const yearlyBars = yearlyQuery.data?.intraday ?? [];
  const day = intradayQuery.data?.stock.day ?? chartQuery.data?.stock.day ?? null;

  const last = stock.last;
  const open = finiteNumber(day?.open);
  const high = finiteNumber(day?.high);
  const low = finiteNumber(day?.low);
  const prevClose = finiteNumber(day?.prevClose);
  const close = finiteNumber(last);

  const vwap = computeVwap(intradayBars);
  const pivots = computePivotLevels(high, low, close);

  const currentVolume =
    finiteNumber(day?.volume) ?? sumIntradayVolume(intradayBars) ?? finiteNumber(stock.volume ?? null);
  const yearlyVolumes = yearlyBars.map((bar) => volumeFromBar(bar)).filter((volume) => volume > 0);
  const recentVolumes = yearlyVolumes.slice(-24);
  const volumePercentile = computePercentileRank(currentVolume, yearlyVolumes);
  const volumeAvg20 = average(yearlyVolumes.slice(-20));
  const volumeVs20 =
    currentVolume != null && volumeAvg20 != null && Math.abs(volumeAvg20) > 1e-9
      ? ((currentVolume - volumeAvg20) / volumeAvg20) * 100
      : null;

  const dayRangePct =
    high != null && low != null && close != null && high > low ? ((close - low) / (high - low)) * 100 : null;
  const closeVsVwap = close != null && vwap != null && Math.abs(vwap) > 1e-9 ? ((close - vwap) / vwap) * 100 : null;

  const details = indicatorQuery.data;
  const referenceLines = day
    ? [
        { label: "OPEN", value: day.open },
        { label: "HIGH", value: day.high },
        { label: "LOW", value: day.low }
      ]
    : [];

  const volumeScaleMax = Math.max(...recentVolumes, currentVolume ?? 0, 1);

  return (
    <div className={styles.page}>
      <div className={styles.topNav}>
        <Link to="/" className={styles.back}>
          {tr("Back to dashboard")}
        </Link>
        <div className={styles.meta}>
          <span className={styles.symbol}>{stock.symbol}</span>
          <span className={styles.name}>{stock.name}</span>
          {stock.sector ? <span className={styles.sector}>{stock.sector}</span> : null}
        </div>
      </div>

      <section className={styles.kpiCard}>
        <div className={styles.priceWrap}>
          <div className={styles.price}>
            <GlitchText text={fmtPrice(stock.last)} tone={tone} />
          </div>
          <div className={styles.delta} data-dir={dir}>
            {arrow(stock.changePct)} {fmtChange(stock.change)} ({fmtPct(stock.changePct)})
          </div>
          <div className={styles.asOf}>
            {tr("As of")} {formatTime(stock.timestamp ?? chartQuery.data?.asOf ?? new Date().toISOString(), { hour12: false })}
          </div>
        </div>
        <div className={styles.quickMetrics}>
          <MetricCard label={tr("Open")} value={fmtMaybePrice(open)} />
          <MetricCard label={tr("High")} value={fmtMaybePrice(high)} />
          <MetricCard label={tr("Low")} value={fmtMaybePrice(low)} />
          <MetricCard label={tr("Prev Close")} value={fmtMaybePrice(prevClose)} />
        </div>
      </section>

      <section className={styles.chartCard}>
        <div className={styles.chartHeader}>
          <div className={styles.chartTitle}>{tr("Intraday Candlestick / Bollinger / Volume")}</div>
          <div className={styles.ranges}>
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={styles.rangeBtn}
                data-active={range === r ? "true" : "false"}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <CandlestickChart bars={chartBars} direction={dir} referenceLines={referenceLines} />
      </section>

      <section className={styles.metricsGrid}>
        <MetricCard label={tr("53W Price Percentile")} value={fmtMaybePct(details?.percentile53w)} />
        <MetricCard label={tr("Day Range Position")} value={fmtMaybePct(dayRangePct)} hint={tr("0% = day low, 100% = day high")} />
        <MetricCard label={tr("Intraday RSI (14)")} value={fmtMaybeNumber(details?.intradayRsi)} />
        <MetricCard label={tr("Daily RSI (14)")} value={fmtMaybeNumber(details?.dailyRsi)} />
        <MetricCard label={tr("Intraday WillR (14)")} value={fmtMaybeNumber(details?.intradayWillr)} />
        <MetricCard label={tr("Daily WillR (14)")} value={fmtMaybeNumber(details?.dailyWillr)} />
        <MetricCard label={tr("Bollinger Upper")} value={fmtMaybePrice(details?.bollingerUpper)} />
        <MetricCard label={tr("Bollinger Mid")} value={fmtMaybePrice(details?.bollingerMiddle)} />
        <MetricCard label={tr("Bollinger Lower")} value={fmtMaybePrice(details?.bollingerLower)} />
        <MetricCard label={tr("VWAP (1D)")} value={fmtMaybePrice(vwap)} />
        <MetricCard label={tr("Close vs VWAP")} value={fmtMaybePct(closeVsVwap)} />
        <MetricCard label={tr("Volume (Today)")} value={fmtVolume(currentVolume)} />
      </section>

      <section className={styles.detailGrid}>
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>{tr("Pivot Points")}</h3>
          <div className={styles.panelMetrics}>
            <MetricCard label={tr("Pivot")} value={fmtMaybePrice(pivots?.pivot)} />
            <MetricCard label="R1" value={fmtMaybePrice(pivots?.r1)} />
            <MetricCard label="R2" value={fmtMaybePrice(pivots?.r2)} />
            <MetricCard label="S1" value={fmtMaybePrice(pivots?.s1)} />
            <MetricCard label="S2" value={fmtMaybePrice(pivots?.s2)} />
          </div>
        </div>

        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>{tr("Volume Position")}</h3>
          <div className={styles.volumeMetaRow}>
            <span>{tr("Percentile")}: {fmtMaybePct(volumePercentile)}</span>
            <span>{tr("vs 20D Avg")}: {fmtMaybePct(volumeVs20)}</span>
          </div>
          <div className={styles.volumeTrack} role="img" aria-label={tr("Volume percentile bar")}>
            <div className={styles.volumeFill} style={{ width: `${Math.max(2, Math.min(100, volumePercentile ?? 0))}%` }} />
          </div>
          <div className={styles.volumeScale}>
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
          <div className={styles.volumeBars}>
            {recentVolumes.length
              ? recentVolumes.map((value, idx) => {
                  const h = Math.max(6, (value / volumeScaleMax) * 100);
                  return <span key={`${idx}-${value}`} className={styles.volumeBar} style={{ height: `${h}%` }} />;
                })
              : null}
          </div>
        </div>

        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>{tr("Price Change vs Prior Sessions")}</h3>
          <div className={styles.lookbackGrid}>
            {(details?.lookbacks ?? []).map((lookback) => (
              <div key={lookback.days} className={styles.lookbackRow}>
                <span className={styles.lookbackLabel}>{lookback.days}D</span>
                <span className={styles.lookbackBase}>{fmtMaybePrice(lookback.base)}</span>
                <span
                  className={styles.lookbackPct}
                  data-dir={lookback.pct != null && Number.isFinite(lookback.pct) ? directionFromChangePct(lookback.pct) : "flat"}
                >
                  {fmtMaybePct(lookback.pct)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.futureGrid}>
        <section className={styles.futureCard}>
          <h3>{tr("Strategy Backtesting")}</h3>
          <p>{tr("Reserved for configurable strategy simulations and outcome comparisons.")}</p>
        </section>
        <section className={styles.futureCard}>
          <h3>{tr("Technical Indicators")}</h3>
          <p>{tr("Reserved for extended indicators, alerting rules, and custom overlays.")}</p>
        </section>
        <section className={styles.futureCard}>
          <h3>{tr("Historical Performance")}</h3>
          <p>{tr("Reserved for multi-horizon performance, seasonality, and benchmark overlays.")}</p>
        </section>
        <section className={styles.futureCard}>
          <h3>{tr("AI Strategy Evaluation")}</h3>
          <p>{tr("Reserved for explanatory model outputs and educational strategy scoring.")}</p>
        </section>
      </section>
    </div>
  );
}
