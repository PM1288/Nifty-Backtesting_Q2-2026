import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { getJson } from "../lib/api";
import {
  MATRIX_INTERVALS,
  MATRIX_SIDES,
  barsForIstDay,
  containingBar,
  latestIstDay,
  matrixSide,
  type MatrixInterval,
  type MatrixPane,
  type MatrixSide,
} from "../lib/multiTimeframeMatrix";
import styles from "./TradingAnalyticsPage.module.css";

type Row = Record<string, unknown>;
type ChartPayload = {
  interval: number;
  panes: Array<MatrixPane & { coverage: Row[]; oiHistory: Row[] }>;
  availableContracts: Array<{ expiry: string; strike: number; ce_contracts: number; pe_contracts: number }>;
  limitations: string[];
};

const finite = (value: unknown) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const stamp = (value: unknown): UTCTimestamp | null => {
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) as UTCTimestamp : null;
};
const isoTime = (value: Time | undefined) => {
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  if (value && typeof value === "object" && "year" in value)
    return new Date(Date.UTC(value.year, value.month - 1, value.day)).toISOString();
  return null;
};
const valueText = (value: unknown) => {
  const parsed = finite(value);
  return parsed == null ? "—" : parsed.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
};
const sideTitle = (side: MatrixSide, label: string) => side === "UNDERLYING" ? label : `Selected ${side}`;

function MatrixCandleChart({
  pane,
  interval,
  side,
  day,
  cursorTime,
  onCursor,
}: {
  pane: (MatrixPane & { oiHistory?: Row[] }) | null;
  interval: MatrixInterval;
  side: MatrixSide;
  day: string | null;
  cursorTime: string | null;
  onCursor: (time: string | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const applyingExternalCursor = useRef(false);
  const rows = useMemo(() => barsForIstDay(pane?.bars ?? [], day), [day, pane?.bars]);
  const observed = useMemo(() => containingBar(rows, cursorTime) ?? [...rows].filter((row) => row.closed === true).at(-1) ?? null, [cursorTime, rows]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const chart = createChart(host, {
      autoSize: false,
      layout: { background: { type: ColorType.Solid, color: "#ffffff" }, textColor: "#53657d", fontFamily: "IBM Plex Mono, monospace", fontSize: 10 },
      grid: { vertLines: { color: "#edf1f6" }, horzLines: { color: "#edf1f6" } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "#315ad7", width: 1, labelBackgroundColor: "#315ad7" }, horzLine: { color: "#94a3b8", width: 1 } },
      rightPriceScale: { borderColor: "#dce4ef", minimumWidth: 58 },
      timeScale: { borderColor: "#dce4ef", timeVisible: true, secondsVisible: false, rightOffset: 1, barSpacing: 5 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a", downColor: "#dc2626", wickUpColor: "#16a34a", wickDownColor: "#dc2626", borderVisible: false,
      priceLineVisible: false,
    });
    const ema = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const candleData = rows.flatMap((row) => {
      const time = stamp(row.end), open = finite(row.open), high = finite(row.high), low = finite(row.low), close = finite(row.close);
      return row.closed === true && time != null && open != null && high != null && low != null && close != null
        ? [{ time, open, high, low, close }]
        : [];
    });
    candles.setData(candleData);
    ema.setData(rows.flatMap((row) => {
      const time = stamp(row.end), value = finite(row.ema9);
      return row.closed === true && time != null && value != null ? [{ time, value }] : [];
    }));
    const resize = () => chart.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight), true);
    resize();
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    chart.subscribeCrosshairMove((parameter) => {
      if (!applyingExternalCursor.current) onCursor(isoTime(parameter.time));
    });
    chartRef.current = chart;
    seriesRef.current = candles;
    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [onCursor, rows]);

  useEffect(() => {
    const chart = chartRef.current, series = seriesRef.current;
    if (!chart || !series) return;
    const row = containingBar(rows, cursorTime);
    const time = stamp(row?.end), price = finite(row?.close);
    applyingExternalCursor.current = true;
    if (time == null || price == null) chart.clearCrosshairPosition();
    else chart.setCrosshairPosition(price, time, series);
    requestAnimationFrame(() => { applyingExternalCursor.current = false; });
  }, [cursorTime, rows]);

  const symbol = String(pane?.identity.tradingsymbol ?? sideTitle(side, "Underlying"));
  return <section className={styles.matrixChartCell} data-matrix-chart={`${interval}-${side}`} data-synced-time={cursorTime ?? ""}>
    <header>
      <strong>{interval}m · {symbol}</strong>
      <span>O {valueText(observed?.open)} · H {valueText(observed?.high)} · L {valueText(observed?.low)} · C {valueText(observed?.close)}</span>
    </header>
    <div ref={hostRef} className={styles.matrixChartHost} aria-label={`${interval} minute ${sideTitle(side, "underlying")} candlestick chart`} />
    {!rows.some((row) => row.closed === true) && <p className={styles.matrixMissing}>No completed retained candles</p>}
  </section>;
}

export function TradingAnalyticsTimeframeMatrix({
  symbol,
  label,
  asOf,
  expiry,
  strikes,
  spot,
}: {
  symbol: string;
  label: string;
  asOf: string;
  expiry: string;
  strikes: number[];
  spot: number | null;
}) {
  const [params, setParams] = useSearchParams();
  const defaultStrike = spot == null ? null : [...strikes].sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot) || a - b)[0] ?? null;
  const selectedExpiry = params.get("chartExpiry") ?? expiry;
  const selectedStrike = params.get("strike") ?? String(defaultStrike ?? "");
  const queries = useQueries({ queries: MATRIX_INTERVALS.map((interval) => {
    const query = new URLSearchParams({ symbol, asOf, interval: String(interval) });
    if (selectedExpiry && selectedStrike) {
      query.set("expiry", selectedExpiry);
      query.set("strike", selectedStrike);
    }
    return {
      queryKey: ["trading-analytics-charts", query.toString()],
      queryFn: () => getJson<ChartPayload>(`/v1/trading-analytics/charts?${query}`),
      staleTime: 30_000,
      retry: 1,
    };
  }) });
  const fiveMinute = queries[1].data;
  useEffect(() => {
    if (!fiveMinute || params.get("chartExpiry")) return;
    const exact = fiveMinute.panes.filter((pane) => matrixSide(pane.identity) !== "UNDERLYING");
    if (exact.length === 2 && exact.every((pane) => pane.sourceMinuteCount > 1)) return;
    const candidate = [...fiveMinute.availableContracts].sort((a, b) =>
      Math.abs(Date.parse(a.expiry) - Date.parse(asOf)) - Math.abs(Date.parse(b.expiry) - Date.parse(asOf))
      || Math.abs(a.strike - Number(spot ?? 0)) - Math.abs(b.strike - Number(spot ?? 0))
      || a.strike - b.strike,
    )[0];
    if (!candidate) return;
    const next = new URLSearchParams(params);
    next.set("chartExpiry", candidate.expiry);
    next.set("strike", String(candidate.strike));
    next.set("pin", "true");
    setParams(next, { replace: true });
  }, [asOf, fiveMinute, params, setParams, spot]);

  const day = latestIstDay(fiveMinute?.panes ?? []);
  const [cursorTime, setCursorTime] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const onCursor = useMemo(() => (time: string | null) => {
    if (time === cursorRef.current) return;
    cursorRef.current = time;
    setCursorTime(time);
  }, []);
  const loading = queries.some((query) => query.isLoading);
  const failed = queries.filter((query) => query.isError).length;
  const chartExpiryMismatch = selectedExpiry && expiry && selectedExpiry !== expiry;

  return <section className={styles.timeframeMatrix} data-testid="multi-timeframe-matrix" data-cursor-time={cursorTime ?? ""}>
    <header className={styles.matrixSummary}>
      <div><strong>1m · 5m · 15m synchronized matrix</strong><span>No interval selector · latest retained IST session</span></div>
      <div><b>{label}</b><span>{selectedExpiry || "Expiry unavailable"} · {selectedStrike || "Strike unavailable"}</span></div>
      <div><b>{day ?? "Session unavailable"}</b><span>{chartExpiryMismatch ? `Retained pair; current chain ${expiry} is not mixed` : "Pair and chain aligned"}</span></div>
      <div aria-live="polite"><b>{cursorTime ? new Date(cursorTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) + " IST" : "Move cursor"}</b><span>{loading ? "Loading retained candles" : failed ? `${failed} interval source failures` : "Hover any pane to synchronize all nine"}</span></div>
    </header>
    <div className={styles.matrixColumnHeaders} aria-hidden="true">
      {MATRIX_SIDES.map((side) => <strong key={side}>{sideTitle(side, label)}</strong>)}
    </div>
    <div className={styles.matrixGrid}>
      {MATRIX_INTERVALS.flatMap((interval, index) => MATRIX_SIDES.map((side) => {
        const pane = queries[index].data?.panes.find((candidate) => matrixSide(candidate.identity) === side) ?? null;
        return <MatrixCandleChart key={`${interval}-${side}`} pane={pane} interval={interval} side={side} day={day} cursorTime={cursorTime} onCursor={onCursor} />;
      }))}
    </div>
  </section>;
}
