import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { openAt, closeAt, type MeasurementPane } from "../lib/scalperMeasurement";
import type { ScalperSignal } from "../lib/scalperSignals";
import {
  levelIsInSessionRange,
  oiProfilePoints,
  profileWidth,
  roundNumberGuides,
} from "../lib/tradingAnalyticsChartView";
import styles from "./TradingAnalyticsPage.module.css";

type Row = Record<string, unknown>;
type Pane = MeasurementPane & { coverage: Row[]; sourceMinuteCount: number; oiHistory: Row[] };
type Indicator = { time: string; rsi: number | null; macd: number | null; signal: number | null; histogram: number | null };
type Level = { row: Row; side: "R" | "S"; value: number };
type Measurement = ReturnType<typeof import("../lib/scalperMeasurement").measurePanes> | null;

const CE = "#3b82f6";
const PE = "#facc15";
const UP = "#16c784";
const DOWN = "#ea3943";
const ORANGE = "#f59e0b";
const PURPLE = "#a78bfa";
const number = (value: unknown) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const fmt = (value: number | null, digits = 2) => value == null
  ? "—"
  : value.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const compact = (value: number | null) => value == null
  ? "—"
  : new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 }).format(value);
const timestamp = (value: unknown): UTCTimestamp | null => {
  const milliseconds = Date.parse(String(value));
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) as UTCTimestamp : null;
};
const side = (pane: Pane) => {
  const symbol = String(pane.identity.tradingsymbol ?? "").toUpperCase();
  return symbol.endsWith("CE") ? "CE" : symbol.endsWith("PE") ? "PE" : "NIFTY";
};
const closedBars = (pane: Pane): CandlestickData<Time>[] => pane.bars.flatMap((bar) => {
  const time = timestamp(bar.end);
  const open = number(bar.open), high = number(bar.high), low = number(bar.low), close = number(bar.close);
  return bar.closed === true && time != null && open != null && high != null && low != null && close != null
    ? [{ time, open, high, low, close }]
    : [];
});

function latestForSide(panes: Pane[], wanted: "CE" | "PE") {
  const pane = panes.find((candidate) => side(candidate) === wanted);
  if (!pane) return null;
  const bar = [...pane.bars].filter((row) => row.closed === true).at(-1);
  const oi = [...pane.oiHistory].sort((a, b) => String(a.event_time).localeCompare(String(b.event_time))).at(-1);
  return {
    symbol: String(pane.identity.tradingsymbol ?? wanted),
    ltp: number(bar?.close),
    oi: number(oi?.current),
    change: number(oi?.interval_change),
    at: oi?.event_time == null ? null : String(oi.event_time),
  };
}

function OiStrikeOverlay({
  rows,
  bounds,
  coordinates,
}: {
  rows: Row[];
  bounds: { min: number; max: number } | null;
  coordinates: Map<number, number>;
}) {
  const points = oiProfilePoints(rows).filter((point) => levelIsInSessionRange(point.strike, bounds));
  const maximum = Math.max(0, ...points.map((point) => point.current ?? 0));
  return <div className={styles.alignedOiProfile} aria-hidden="true">
    <span className={styles.alignedOiProfileTitle}>OI BY STRIKE · {points.length}/{oiProfilePoints(rows).length} IN RANGE</span>
    {points.map((point) => {
      const top = coordinates.get(point.strike);
      if (top == null || point.current == null) return null;
      const width = profileWidth(point.current, maximum, 74);
      return <span
        key={`${point.side}-${point.strike}`}
        className={point.side === "CE" ? styles.alignedOiBarCe : styles.alignedOiBarPe}
        style={{ top, width }}
        title={`${point.side} ${point.strike} OI ${point.current}`}
      />;
    })}
  </div>;
}

export function AlignedScalperTerminal({
  panes,
  legs,
  levels,
  bounds,
  showEma,
  showLevels,
  showGrid,
  points,
  selecting,
  onTimeClick,
  indicators,
  measured,
  quantity,
  strikes,
  selectedStrike,
  defaultStrike,
  fixed,
  onStrike,
  expiry,
  maxPainStrikes = [],
  signals = [],
}: {
  panes: Pane[];
  legs: Row[];
  levels: Level[];
  bounds: { min: number; max: number } | null;
  showEma: boolean;
  showLevels: boolean;
  showGrid: boolean;
  points: string[];
  selecting: boolean;
  onTimeClick: (time: string) => void;
  indicators: Map<string, Indicator>;
  measured: Measurement;
  quantity: number;
  strikes: number[];
  selectedStrike: string;
  defaultStrike: number | null;
  fixed: boolean;
  onStrike: (strike: string) => void;
  expiry: string;
  maxPainStrikes?: number[];
  signals?: ScalperSignal[];
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [cursor, setCursor] = useState<{ time: string; rows: Array<{ label: string; value: string }> } | null>(null);
  const [profileCoordinates, setProfileCoordinates] = useState<Map<number, number>>(new Map());
  const [paneTops, setPaneTops] = useState<number[]>([]);
  const [measurementBoxes, setMeasurementBoxes] = useState<Array<{
    key: string;
    left: number;
    top: number;
    width: number;
    height: number;
  }>>([]);
  const latestCe = useMemo(() => latestForSide(panes, "CE"), [panes]);
  const latestPe = useMemo(() => latestForSide(panes, "PE"), [panes]);
  const currentPcr = latestCe?.oi && latestPe?.oi != null ? latestPe.oi / latestCe.oi : null;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || panes.length === 0) return;
    const compactChart = host.clientWidth < 700;
    const timeLookup = new Map<number, string>();
    panes.flatMap((pane) => pane.bars).forEach((bar) => {
      const at = timestamp(bar.end);
      if (at != null) timeLookup.set(Number(at), String(bar.end));
    });
    const chart = createChart(host, {
      autoSize: true,
      addDefaultPane: false,
      layout: {
        background: { type: ColorType.Solid, color: "#08111f" },
        textColor: "#9fb0c6",
        fontFamily: "IBM Plex Mono, ui-monospace, monospace",
        fontSize: 11,
        panes: { separatorColor: "#22324a", separatorHoverColor: "#3b82f666", enableResize: true },
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#16243a", style: LineStyle.SparseDotted },
        horzLines: { color: "#16243a", style: LineStyle.SparseDotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#94a3b8aa", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#334155" },
        horzLine: { color: "#64748b88", width: 1, style: LineStyle.Dotted, labelBackgroundColor: "#334155" },
      },
      rightPriceScale: { borderColor: "#30435d", scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: "#30435d", timeVisible: true, secondsVisible: false, rightOffset: 3, barSpacing: 9, minBarSpacing: 3 },
      handleScroll: selecting ? false : { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: selecting ? false : { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });
    chartRef.current = chart;
    const priceSeries: Array<{ pane: Pane; api: ISeriesApi<"Candlestick", Time>; paneIndex: number }> = [];
    panes.slice(0, 3).forEach((pane, index) => {
      const instrument = side(pane);
      const candle = chart.addSeries(CandlestickSeries, {
        title: String(pane.identity.tradingsymbol),
        upColor: UP,
        downColor: DOWN,
        borderUpColor: UP,
        borderDownColor: DOWN,
        wickUpColor: UP,
        wickDownColor: DOWN,
        priceLineVisible: false,
        lastValueVisible: true,
        priceFormat: { type: "price", precision: 2, minMove: 0.05 },
      }, index);
      candle.setData(closedBars(pane));
      priceSeries.push({ pane, api: candle, paneIndex: index });
      if (showEma) {
        const ema = chart.addSeries(LineSeries, {
          title: `${instrument} EMA9`, color: ORANGE, lineWidth: 2,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        }, index);
        ema.setData(pane.bars.flatMap((bar) => {
          const time = timestamp(bar.end), value = number(bar.ema9);
          return bar.closed === true && time != null && value != null ? [{ time, value }] : [];
        }));
      }
      const measurementMarkers: SeriesMarker<Time>[] = points.flatMap((point, markerIndex) => {
        const time = timestamp(point);
        const value = markerIndex === 0 ? openAt(pane.bars, point) : closeAt(pane.bars, point);
        return time != null && value != null ? [{
          time,
          price: value,
          position: "atPriceMiddle" as const,
          color: markerIndex === 0 ? "#38bdf8" : "#f472b6",
          shape: "circle" as const,
          text: markerIndex === 0 ? "A · OPEN" : "B · CLOSE",
        }] : [];
      });
      const signalMarkers: SeriesMarker<Time>[] = signals.flatMap((event) => {
        if (instrument === "NIFTY") {
          const setupAt = timestamp(event.setupTime);
          const setup: SeriesMarker<Time>[] = setupAt == null ? [] : [{
            time: setupAt, price: event.setupClose, position: "atPriceMiddle",
            color: event.direction === "CALL" ? CE : PE,
            shape: event.direction === "CALL" ? "arrowUp" : "arrowDown",
            text: `${event.direction === "CALL" ? "CE" : "PE"} SETUP`,
          }];
          const entryAt = timestamp(event.nextTime);
          return event.state === "RETROSPECTIVE_ENTRY_REFERENCE" && entryAt != null && event.underlyingOpen != null
            ? [...setup, { time: entryAt, price: event.underlyingOpen, position: "atPriceMiddle", color: event.direction === "CALL" ? CE : PE, shape: "circle", text: `BUY ${event.direction === "CALL" ? "CE" : "PE"} · REF` }]
            : setup;
        }
        const wanted = event.direction === "CALL" ? "CE" : "PE";
        const entryAt = timestamp(event.nextTime);
        return instrument === wanted && event.state === "RETROSPECTIVE_ENTRY_REFERENCE" && entryAt != null && event.optionPremium != null
          ? [{ time: entryAt, price: event.optionPremium, position: "atPriceMiddle", color: instrument === "CE" ? CE : PE, shape: "circle", text: `${instrument} OPEN · REF` }]
          : [];
      });
      const markers = [...measurementMarkers, ...signalMarkers].sort((a, b) => Number(a.time) - Number(b.time));
      if (markers.length) createSeriesMarkers(candle, markers, { autoScale: false, zOrder: "top" });
    });

    const underlying = priceSeries[0]?.api;
    if (underlying) {
      if (showLevels) levels.filter((level) => levelIsInSessionRange(level.value, bounds)).forEach((level) => {
        underlying.createPriceLine({
          price: level.value,
          color: level.side === "R" ? "#fb7185" : "#34d399",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: !compactChart,
          title: compactChart ? "" : `${String(level.row.timeframe).toUpperCase()} ${level.side}`,
        });
      });
      if (showGrid) roundNumberGuides(bounds, 50).forEach((value) => underlying.createPriceLine({
        price: value, color: "#50627a", lineWidth: 1, lineStyle: LineStyle.SparseDotted,
        axisLabelVisible: false, title: "",
      }));
      maxPainStrikes.filter((value) => levelIsInSessionRange(value, bounds)).forEach((value) => underlying.createPriceLine({
        price: value, color: PURPLE, lineWidth: 2, lineStyle: LineStyle.Dotted,
        axisLabelVisible: !compactChart, title: compactChart ? "" : "MAX PAIN · INDICATIVE",
      }));
    }

    const optionPanes = panes.filter((pane) => side(pane) !== "NIFTY");
    optionPanes.forEach((pane) => {
      const identity = side(pane) as "CE" | "PE";
      const color = identity === "CE" ? CE : PE;
      const current = chart.addSeries(LineSeries, {
        title: `${identity} OI`, color, lineWidth: 2, lineStyle: LineStyle.Solid,
        priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
      }, 3);
      current.setData(pane.oiHistory.flatMap((row) => {
        const time = timestamp(row.event_time), value = number(row.current);
        return time != null && value != null ? [{ time, value }] : [];
      }));
      const delta = chart.addSeries(HistogramSeries, {
        title: `${identity} ΔOI`, color, priceLineVisible: false, lastValueVisible: false,
        base: 0, priceFormat: { type: "volume" },
      }, 4);
      delta.setData(pane.oiHistory.flatMap((row) => {
        const time = timestamp(row.event_time), value = number(row.interval_change);
        return time != null && value != null ? [{ time, value, color: value >= 0 ? `${color}bb` : `${DOWN}bb` }] : [];
      }));
    });

    // Indicators keep prior sessions for warm-up in the parent calculation,
    // but the aligned time scale must contain only the currently selected
    // display range. Otherwise retained history compresses one-day candles to
    // the far edge of the chart.
    const indicatorRows = [...indicators.values()]
      .filter((row) => {
        const at = timestamp(row.time);
        return at != null && timeLookup.has(Number(at));
      })
      .sort((a, b) => a.time.localeCompare(b.time));
    const rsi = chart.addSeries(LineSeries, {
      title: "RSI 14", color: PURPLE, lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
    }, 5);
    rsi.setData(indicatorRows.flatMap((row) => {
      const time = timestamp(row.time);
      return time != null && row.rsi != null ? [{ time, value: row.rsi }] : [];
    }));
    [30, 50, 70].forEach((value) => rsi.createPriceLine({
      price: value, color: value === 50 ? "#64748b" : "#475569", lineWidth: 1,
      lineStyle: LineStyle.Dotted, axisLabelVisible: value === 50, title: value === 50 ? "RSI 50" : "",
    }));
    const macd = chart.addSeries(LineSeries, {
      title: "MACD", color: "#60a5fa", lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
    }, 6);
    const signal = chart.addSeries(LineSeries, {
      title: "SIGNAL", color: ORANGE, lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    }, 6);
    const histogram = chart.addSeries(HistogramSeries, {
      title: "MACD HIST", color: "#64748b", base: 0, priceLineVisible: false, lastValueVisible: false,
    }, 6);
    const indicatorData = (key: "macd" | "signal" | "histogram") => indicatorRows.flatMap((row) => {
      const time = timestamp(row.time), value = row[key];
      return time != null && value != null ? [{ time, value }] : [];
    });
    macd.setData(indicatorData("macd"));
    signal.setData(indicatorData("signal"));
    histogram.setData(indicatorRows.flatMap((row) => {
      const time = timestamp(row.time), value = row.histogram;
      return time != null && value != null ? [{ time, value, color: value >= 0 ? `${UP}aa` : `${DOWN}aa` }] : [];
    }));

    const heights = [300, 145, 145, 72, 72, 72, 78];
    const updateProfile = () => {
      if (!underlying) return;
      const paneElement = chart.panes()[0]?.getHTMLElement();
      if (!paneElement) return;
      const hostBox = host.getBoundingClientRect(), paneBox = paneElement.getBoundingClientRect();
      setPaneTops(chart.panes().map((pane) => {
        const element = pane.getHTMLElement();
        return element ? element.getBoundingClientRect().top - hostBox.top + 6 : 0;
      }));
      setProfileCoordinates(new Map(oiProfilePoints(legs).flatMap((point) => {
        const y = underlying.priceToCoordinate(point.strike);
        return y == null ? [] : [[point.strike, paneBox.top - hostBox.top + y] as const];
      })));
      if (points.length === 2) {
        const firstTime = timestamp(points[0]);
        const lastTime = timestamp(points[1]);
        const firstX = firstTime == null ? null : chart.timeScale().timeToCoordinate(firstTime);
        const lastX = lastTime == null ? null : chart.timeScale().timeToCoordinate(lastTime);
        setMeasurementBoxes(firstX == null || lastX == null ? [] : priceSeries.flatMap(({ pane, api, paneIndex }) => {
          const start = openAt(pane.bars, points[0]);
          const end = closeAt(pane.bars, points[1]);
          const firstY = start == null ? null : api.priceToCoordinate(start);
          const lastY = end == null ? null : api.priceToCoordinate(end);
          const element = chart.panes()[paneIndex]?.getHTMLElement();
          if (firstY == null || lastY == null || !element) return [];
          const paneBox = element.getBoundingClientRect();
          return [{
            key: String(pane.identity.tradingsymbol),
            left: Math.min(firstX, lastX),
            top: paneBox.top - hostBox.top + Math.min(firstY, lastY),
            width: Math.max(2, Math.abs(lastX - firstX)),
            height: Math.max(2, Math.abs(lastY - firstY)),
          }];
        }));
      } else {
        setMeasurementBoxes([]);
      }
    };
    chart.timeScale().fitContent();
    requestAnimationFrame(() => {
      chart.panes().forEach((pane, index) => pane.setHeight(heights[index] ?? 70));
      // Pane geometry settles on the next frame. Coordinate overlays must not
      // use the equal-height intermediate layout.
      requestAnimationFrame(updateProfile);
    });
    const resize = new ResizeObserver(updateProfile);
    resize.observe(host);
    chart.timeScale().subscribeVisibleLogicalRangeChange(updateProfile);
    chart.subscribeClick((parameter) => {
      if (!selecting || parameter.time == null) return;
      const source = timeLookup.get(Number(parameter.time));
      if (source) onTimeClick(source);
    });
    chart.subscribeCrosshairMove((parameter) => {
      if (parameter.time == null) return setCursor(null);
      const source = timeLookup.get(Number(parameter.time));
      if (!source) return;
      const rows = priceSeries.map(({ pane, api }) => {
        const value = parameter.seriesData.get(api) as CandlestickData<Time> | undefined;
        return { label: String(pane.identity.tradingsymbol), value: value ? `O ${fmt(value.open)} · H ${fmt(value.high)} · L ${fmt(value.low)} · C ${fmt(value.close)}` : "—" };
      });
      const indicator = indicators.get(source);
      rows.push({ label: "RSI / MACD", value: `${fmt(indicator?.rsi ?? null)} / ${fmt(indicator?.macd ?? null, 3)}` });
      setCursor({ time: source, rows });
    });
    return () => {
      resize.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateProfile);
      chart.remove();
      chartRef.current = null;
    };
  }, [bounds, indicators, legs, levels, maxPainStrikes, onTimeClick, panes, points, selecting, showEma, showGrid, showLevels]);

  return <div className={styles.alignedTerminal} data-testid="aligned-scalper-terminal">
    <section className={styles.alignedChartSurface} aria-label="Aligned NIFTY, exact call, exact put and evidence panes">
      <div className={styles.alignedPaneLabels} aria-hidden="true">{[
        { label: "NIFTY · CANDLES + EMA9 + LEVELS", className: "" },
        { label: `EXACT CE · ${panes.find((pane) => side(pane) === "CE")?.bars.some((row) => row.closed === true) ? "CANDLES + EMA9" : "CANDLES UNAVAILABLE"}`, className: styles.ceText },
        { label: `EXACT PE · ${panes.find((pane) => side(pane) === "PE")?.bars.some((row) => row.closed === true) ? "CANDLES + EMA9" : "CANDLES UNAVAILABLE"}`, className: styles.peText },
        { label: `OUTSTANDING OI · ${panes.some((pane) => side(pane) !== "NIFTY" && pane.oiHistory.some((row) => number(row.current) != null)) ? "OBSERVED" : "UNAVAILABLE"}`, className: "" },
        { label: `SIGNED INTERVAL ΔOI · ${panes.some((pane) => side(pane) !== "NIFTY" && pane.oiHistory.some((row) => number(row.interval_change) != null)) ? "OBSERVED" : "UNAVAILABLE"}`, className: "" },
        { label: "RSI 14", className: "" },
        { label: "MACD 12/26/9", className: "" },
      ].map((item, index) => <span key={item.label} className={item.className} style={{ top: paneTops[index] ?? 6 }}>{item.label}</span>)}</div>
      <div ref={hostRef} className={`${styles.alignedChartHost} ${selecting ? styles.alignedSelecting : ""}`} />
      <div className={styles.alignedMeasurementOverlay} data-testid="aligned-measurement-boxes" aria-hidden="true">{measurementBoxes.map((box) => <span key={box.key} style={box} />)}</div>
      <OiStrikeOverlay rows={legs} bounds={bounds} coordinates={profileCoordinates} />
    </section>
    <section className={styles.alignedInspector} aria-label="Aligned terminal evidence inspector">
      <section>
        <header><strong>SELECTED PAIR</strong><span>{expiry || "—"}</span></header>
        <div className={styles.alignedPairCards}>
          <article><b className={styles.ceText}>CE</b><strong>{fmt(latestCe?.ltp ?? null)}</strong><small>OI {compact(latestCe?.oi ?? null)} · Δ {compact(latestCe?.change ?? null)}</small></article>
          <article><b className={styles.peText}>PE</b><strong>{fmt(latestPe?.ltp ?? null)}</strong><small>OI {compact(latestPe?.oi ?? null)} · Δ {compact(latestPe?.change ?? null)}</small></article>
        </div>
        <p>OI PCR <strong>{fmt(currentPcr)}</strong> · selected exact contracts</p>
      </section>
      <section>
        <header><strong>NEAREST PAIRS</strong><span>provider-native</span></header>
        <div className={styles.alignedLadderScroll}><table><thead><tr><th>CE</th><th>Strike</th><th>PE</th></tr></thead><tbody>{strikes.map((strike) => <tr key={strike} aria-selected={String(strike) === selectedStrike}><td>{fmt(number(legs.find((leg) => Number(leg.strike) === strike && leg.option_type === "CE")?.last_price))}</td><th><button type="button" disabled={fixed} onClick={() => onStrike(String(strike))}>{strike}{strike === defaultStrike ? " · ATM" : ""}</button></th><td>{fmt(number(legs.find((leg) => Number(leg.strike) === strike && leg.option_type === "PE")?.last_price))}</td></tr>)}</tbody></table></div>
      </section>
      <section>
        <header><strong>AT CURSOR</strong><span>{cursor ? new Date(cursor.time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : "move cursor"}</span></header>
        {cursor ? cursor.rows.map((row) => <p key={row.label}><b>{row.label}</b><small>{row.value}</small></p>) : <p className={styles.alignedMuted}>Hover any pane for synchronized values.</p>}
      </section>
      <section>
        <header><strong>A → B MEASUREMENT</strong><span>{points.length}/2 points</span></header>
        {measured ? <><p><b>Long CE + PE</b><strong>₹{fmt(measured.pnl)}</strong></p>{measured.rows.map((row) => <p key={row.symbol}><b>{row.kind}</b><small>{fmt(row.from)} → {fmt(row.to)} · Δ {fmt(row.delta)}</small></p>)}<p><b>Quantity</b><small>{Number.isSafeInteger(quantity) && quantity > 0 ? quantity : "—"} units</small></p></> : <p className={styles.alignedMuted}>{selecting ? `Select ${points.length ? "B at candle close" : "A at candle open"}.` : "Fix pair, then select A and B."}</p>}
            </section>
      <section>
        <header><strong>EMA9 SETUP REFERENCES</strong><span>{signals.length} observed</span></header>
        {signals.length ? signals.slice(-6).reverse().map((event) => <p key={event.id}><b className={event.direction === "CALL" ? styles.ceText : styles.peText}>{event.direction}</b><small>{Math.round(event.bodyFraction * 10000) / 100}% body · {event.state.replaceAll("_", " ")}</small></p>) : <p className={styles.alignedMuted}>No qualifying closed-bar setup in this selected range.</p>}
      </section>
      <section>
        <header><strong>LEVELS IN SESSION RANGE</strong><span>{levels.filter((level) => levelIsInSessionRange(level.value, bounds)).length}/{levels.length}</span></header>
        {levels.map((level) => <p key={`${level.side}-${String(level.row.timeframe)}`}><b>{String(level.row.timeframe).toUpperCase()} {level.side}</b><small>{fmt(level.value)} · {levelIsInSessionRange(level.value, bounds) ? "plotted" : "outside range"}</small></p>)}
        {maxPainStrikes.map((value) => <p key={`max-${value}`}><b className={styles.maxPainText}>MAX PAIN</b><small>{fmt(value)} · indicative scope</small></p>)}
      </section>
      <section>
        <header><strong>SOURCE HEALTH</strong><span>{panes.length === 3 ? "3/3 panes" : `${panes.length}/3 panes`}</span></header>
        {panes.map((pane) => <p key={String(pane.identity.tradingsymbol)}><b>{String(pane.identity.tradingsymbol)}</b><small>{pane.sourceMinuteCount.toLocaleString("en-IN")} retained minutes · {pane.coverage.length} coverage rows</small></p>)}
      </section>
    </section>
  </div>;
}
