import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  type IPriceLine,
  type SeriesMarker,
  type Time,
  type IRange,
  type UTCTimestamp,
} from "lightweight-charts";
import { exactPairPcr, openAt, closeAt, type MeasurementPane } from "../lib/scalperMeasurement";
import type { ScalperSignal } from "../lib/scalperSignals";
import {
  financialVisibleBounds,
  levelIsInSessionRange,
  oiProfilePoints,
  profileWidth,
  roundNumberGuides,
} from "../lib/tradingAnalyticsChartView";
import { istChartTimeLabel } from "../lib/tradingAnalyticsTime";
import { evidenceCsv } from "../lib/tradingAnalyticsExport";
import {
  ALIGNED_PANE_MINIMUMS,
  alignedChartContentHeight,
  alignedPaneManifest,
  formatScalperNumber,
  formatSignedScalperNumber,
  inspectionBar,
  oiCompositeSegments,
  paddedRenderBounds,
  DEFAULT_SCALPER_PRESENTATION,
  SCALPER_PRESENTATION_STORAGE_KEY,
  parseScalperPresentationPreferences,
  type AlignedPaneVisibility,
  type ScalperInspectorSection,
  type ScalperLadderMetric,
  type ScalperWorkspacePreset,
} from "../lib/scalperAlignedView";
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
const signed = (value: unknown, digits = 2) => formatSignedScalperNumber(value, digits);
const money = (value: unknown) => number(value) == null ? "—" : `₹${formatScalperNumber(value)}`;
const istTime = (value: string | null) => value ? new Date(value).toLocaleString("en-IN", {
  timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
}) : "—";
const timestamp = (value: unknown): UTCTimestamp | null => {
  const milliseconds = Date.parse(String(value));
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) as UTCTimestamp : null;
};
const initialPresentation = () => {
  if (typeof window === "undefined") return DEFAULT_SCALPER_PRESENTATION;
  try {
    return parseScalperPresentationPreferences(JSON.parse(window.localStorage.getItem(SCALPER_PRESENTATION_STORAGE_KEY) ?? "null"));
  } catch {
    return DEFAULT_SCALPER_PRESENTATION;
  }
};
const downloadEvidence = (name: string, body: string, type: string) => {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
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

function readingForSide(panes: Pane[], legs: Row[], selectedStrike: string, wanted: "CE" | "PE", inspectedTime: string | null = null) {
  const pane = panes.find((candidate) => side(candidate) === wanted);
  const leg = legs.find((candidate) => String(candidate.option_type) === wanted && String(candidate.strike) === selectedStrike);
  if (!pane && !leg) return null;
  const bar = pane ? inspectionBar(pane.bars, inspectedTime) ?? undefined : undefined;
  const oi = [...(pane?.oiHistory ?? [])]
    .filter((row) => number(row.current) != null && (!inspectedTime || String(row.event_time ?? "") <= inspectedTime))
    .sort((a, b) => String(a.event_time).localeCompare(String(b.event_time)))
    .at(-1);
  const legAt = String(leg?.exchange_feed_at ?? leg?.collected_at ?? "") || null;
  const ivAvailable = !inspectedTime || (legAt != null && legAt <= inspectedTime);
  return {
    symbol: String(pane?.identity.tradingsymbol ?? leg?.tradingsymbol ?? wanted),
    ltp: number(bar?.close) ?? (!inspectedTime ? number(leg?.last_price) : null),
    oi: number(oi?.current) ?? (!inspectedTime ? number(leg?.open_interest) : null),
    intervalChange: number(oi?.interval_change),
    cumulativeChange: number(oi?.cumulative_change),
    snapshotChange: ivAvailable ? number((leg?.oi_layers as Row | undefined)?.change) : null,
    iv: ivAvailable ? number(leg?.implied_volatility) : null,
    ivAt: ivAvailable ? legAt : null,
    priceAt: String(bar?.end ?? (!inspectedTime ? leg?.exchange_feed_at ?? leg?.collected_at : "") ?? "") || null,
    priceBasis: bar ? "Completed candle close" : !inspectedTime && leg?.last_price != null ? "Snapshot price" : "Exact bar unavailable",
    oiAt: String(oi?.selected_event_time ?? oi?.event_time ?? (!inspectedTime ? leg?.collected_at ?? leg?.exchange_feed_at : "") ?? "") || null,
    baselineAt: String(oi?.baseline_event_time ?? oi?.baseline_time ?? "") || null,
  };
}

function OiStrikeOverlay({
  rows,
  bounds,
  coordinates,
  geometry,
  mode,
}: {
  rows: Row[];
  bounds: { min: number; max: number } | null;
  coordinates: Map<number, number>;
  geometry: { top: number; height: number } | null;
  mode: "current" | "change" | "composite";
}) {
  const points = oiProfilePoints(rows).filter((point) => levelIsInSessionRange(point.strike, bounds));
  if (!points.length || !geometry) return null;
  const maximum = Math.max(0, ...points.flatMap((point) => {
    const baseline = point.current != null && point.change != null ? point.current - point.change : null;
    return mode === "current"
      ? [Math.abs(point.current ?? 0)]
      : mode === "change"
        ? [Math.abs(point.change ?? 0)]
        : [Math.abs(point.current ?? 0), Math.abs(baseline ?? 0)];
  }));
  return <div className={styles.alignedOiProfile} aria-hidden="true" style={{ top: geometry.top, height: geometry.height }}>
    <span className={styles.alignedOiProfileTitle}>{mode === "current" ? "CURRENT OI" : mode === "change" ? "SNAPSHOT ΔOI" : "BASELINE / CURRENT"} · MAX {compact(maximum)} · {points.length}/{oiProfilePoints(rows).length} IN RANGE</span>
    {points.map((point) => {
      const top = coordinates.get(point.strike);
      if (top == null || !Number.isFinite(top) || point.current == null) return null;
      const laneRight = point.side === "CE" ? 4 : 86;
      const laneTop = top - geometry.top + (point.side === "CE" ? -3 : 2);
      const composite = oiCompositeSegments(point.current, point.change);
      const baseline = composite.baseline;
      if (mode === "change") {
        if (point.change == null) return null;
        return <span key={`${point.side}-${point.strike}`} data-profile-strike={point.strike} data-profile-coordinate={laneTop} className={styles.alignedOiDeltaBar} style={{ top: laneTop, right: laneRight, width: profileWidth(point.change, maximum, 74), background: point.change >= 0 ? UP : DOWN, borderColor: point.side === "CE" ? CE : PE }} title={`${point.side} ${point.strike} snapshot ΔOI ${point.change}`} />;
      }
      if (mode === "composite" && baseline != null) {
        const retained = composite.retained ?? 0;
        const addition = composite.addition ?? 0;
        const reduction = composite.reduction ?? 0;
        const retainedWidth = profileWidth(retained, maximum, 74);
        const additionWidth = profileWidth(addition, maximum, 74);
        const reductionWidth = profileWidth(reduction, maximum, 74);
        return <span key={`${point.side}-${point.strike}`} data-profile-strike={point.strike} data-profile-coordinate={laneTop} title={`${point.side} ${point.strike} baseline ${baseline}; current ${point.current}; change ${point.change}`}>
          <span className={styles.alignedOiCompositeRetained} style={{ top: laneTop, right: laneRight, width: retainedWidth, background: point.side === "CE" ? CE : PE }} />
          {additionWidth > 0 && <span className={styles.alignedOiCompositeAddition} style={{ top: laneTop, right: laneRight + retainedWidth, width: additionWidth, color: point.side === "CE" ? CE : PE, borderColor: point.side === "CE" ? CE : PE }} />}
          {reductionWidth > 0 && <span className={styles.alignedOiCompositeReduction} style={{ top: laneTop, right: laneRight + retainedWidth, width: reductionWidth, borderColor: point.side === "CE" ? CE : PE }} />}
        </span>;
      }
      const width = profileWidth(point.current, maximum, 74);
      return <span key={`${point.side}-${point.strike}`} data-profile-strike={point.strike} data-profile-coordinate={laneTop} className={point.side === "CE" ? styles.alignedOiBarCe : styles.alignedOiBarPe} style={{ top: laneTop, width }} title={`${point.side} ${point.strike} current OI ${point.current}`} />;
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
  selectedCeStrike,
  selectedPeStrike,
  defaultStrike,
  fixed,
  onStrike,
  expiry,
  tradingDay,
  interval,
  maxPainStrikes = [],
  signals = [],
  manualBounds = [],
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
  selectedCeStrike: string;
  selectedPeStrike: string;
  defaultStrike: number | null;
  fixed: boolean;
  onStrike: (side: "CE" | "PE", strike: string) => void;
  expiry: string;
  tradingDay: string;
  interval: number;
  maxPainStrikes?: number[];
  signals?: ScalperSignal[];
  manualBounds?: Array<{ min: number; max: number } | null>;
}) {
  const initialPreferences = useRef(initialPresentation()).current;
  const workspaceRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const panesRef = useRef(panes);
  panesRef.current = panes;
  const legsRef = useRef(legs);
  legsRef.current = legs;
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const signalsRef = useRef(signals);
  signalsRef.current = signals;
  const indicatorsRef = useRef(indicators);
  indicatorsRef.current = indicators;
  const timeLookupRef = useRef(new Map<number, string>());
  const priceControllersRef = useRef<Array<{
    instrument: "NIFTY" | "CE" | "PE";
    candle: ISeriesApi<"Candlestick", Time>;
    ema: ISeriesApi<"Line", Time>;
    setMarkers: (markers: SeriesMarker<Time>[]) => void;
  }>>([]);
  const oiControllersRef = useRef<Array<{
    instrument: "CE" | "PE";
    current: ISeriesApi<"Line", Time>;
    delta: ISeriesApi<"Histogram", Time>;
  }>>([]);
  const analyticControllersRef = useRef<{
    rsi?: ISeriesApi<"Line", Time>;
    macd?: ISeriesApi<"Line", Time>;
    signal?: ISeriesApi<"Line", Time>;
    histogram?: ISeriesApi<"Histogram", Time>;
    pcr?: ISeriesApi<"Line", Time>;
  }>({});
  const referenceLinesRef = useRef<Array<{ series: ISeriesApi<"Candlestick", Time>; line: IPriceLine }>>([]);
  const refreshGeometryRef = useRef<() => void>(() => {});
  const visibleRangeRef = useRef<{ context: string; range: IRange<Time> } | null>(null);
  const [cursor, setCursor] = useState<{ time: string; rows: Array<{ label: string; value: string }> } | null>(null);
  const [profileCoordinates, setProfileCoordinates] = useState<Map<number, number>>(new Map());
  const [profileGeometry, setProfileGeometry] = useState<{ top: number; height: number } | null>(null);
  const [paneTops, setPaneTops] = useState<number[]>([]);
  const [inspectionMode, setInspectionMode] = useState<"latest" | "cursor" | "locked">("latest");
  const inspectionModeRef = useRef(inspectionMode);
  inspectionModeRef.current = inspectionMode;
  const onTimeClickRef = useRef(onTimeClick);
  onTimeClickRef.current = onTimeClick;
  const selectingRef = useRef(selecting);
  selectingRef.current = selecting;
  const [lockedTime, setLockedTime] = useState<string | null>(null);
  const [section, setSection] = useState<ScalperInspectorSection>(initialPreferences.inspectorSection);
  const [visibility, setVisibility] = useState<AlignedPaneVisibility>(initialPreferences.paneVisibility);
  const [workspacePreset, setWorkspacePreset] = useState<ScalperWorkspacePreset>(initialPreferences.workspacePreset);
  const [ladderMetric, setLadderMetric] = useState<ScalperLadderMetric>(initialPreferences.ladderMetric);
  const [compactOi, setCompactOi] = useState(initialPreferences.compactOi);
  const [priceRangeMode, setPriceRangeMode] = useState<"session" | "visible">(initialPreferences.priceRangeMode);
  const [paneHeights, setPaneHeights] = useState(initialPreferences.paneHeights);
  const paneHeightsRef = useRef(paneHeights);
  paneHeightsRef.current = paneHeights;
  const [doiMode, setDoiMode] = useState<"interval" | "cumulative">("interval");
  const [profileMode, setProfileMode] = useState<"current" | "change" | "composite">("current");
  const [rangePreset, setRangePreset] = useState<"30" | "60" | "session" | "follow">("session");
  const rangePresetRef = useRef(rangePreset);
  rangePresetRef.current = rangePreset;
  const [inspectorWidth, setInspectorWidth] = useState(initialPreferences.inspectorWidth);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const inspectorToggleRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ x: number; width: number } | null>(null);
  const [measurementBoxes, setMeasurementBoxes] = useState<Array<{
    key: string;
    left: number;
    top: number;
    width: number;
    height: number;
  }>>([]);
  const latestCe = useMemo(() => readingForSide(panes, legs, selectedCeStrike, "CE"), [panes, legs, selectedCeStrike]);
  const latestPe = useMemo(() => readingForSide(panes, legs, selectedPeStrike, "PE"), [panes, legs, selectedPeStrike]);
  const latestIndicator = useMemo(
    () => [...indicators.values()].sort((a, b) => a.time.localeCompare(b.time)).at(-1) ?? null,
    [indicators],
  );
  const pcrRows = useMemo(() => exactPairPcr(
    panes.find((pane) => side(pane) === "CE")?.oiHistory ?? [],
    panes.find((pane) => side(pane) === "PE")?.oiHistory ?? [],
  ), [panes]);
  const currentPcr = pcrRows.at(-1)?.value ?? null;
  const paneManifest = useMemo(() => alignedPaneManifest(visibility), [visibility]);
  const paneManifestRef = useRef(paneManifest);
  paneManifestRef.current = paneManifest;
  const chartContentHeight = alignedChartContentHeight(visibility);
  const chartContentHeightRef = useRef(chartContentHeight);
  chartContentHeightRef.current = chartContentHeight;
  const dataContext = `${tradingDay}|${interval}|CE:${selectedCeStrike}|PE:${selectedPeStrike}|${panes.map((pane) => String(pane.identity.tradingsymbol ?? "")).sort().join("|")}`;
  const boundsKey = bounds ? `${bounds.min}:${bounds.max}` : "missing";
  const levelsKey = levels.map((level) => `${String(level.row.timeframe)}:${level.side}:${level.value}`).join("|");
  const maxPainKey = maxPainStrikes.join("|");
  const manualBoundsKey = manualBounds.map((value) => value ? `${value.min}:${value.max}` : "auto").join("|");
  const closedCount = Math.max(0, ...panes.map((pane) => closedBars(pane).length));
  const inspectedTime = inspectionMode === "locked" ? lockedTime : inspectionMode === "cursor" ? cursor?.time ?? null : null;
  const activeCe = useMemo(() => readingForSide(panes, legs, selectedCeStrike, "CE", inspectedTime), [panes, legs, selectedCeStrike, inspectedTime]);
  const activePe = useMemo(() => readingForSide(panes, legs, selectedPeStrike, "PE", inspectedTime), [panes, legs, selectedPeStrike, inspectedTime]);
  const activePcr = useMemo(() => pcrRows.filter((row) => !inspectedTime || row.time <= inspectedTime).at(-1) ?? null, [inspectedTime, pcrRows]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SCALPER_PRESENTATION_STORAGE_KEY, JSON.stringify({
        version: 4,
        inspectorWidth,
        inspectorSection: section,
        paneVisibility: visibility,
        workspacePreset,
        ladderMetric,
        compactOi,
        priceRangeMode,
        paneHeights,
      }));
    } catch {
      // Presentation persistence is optional; the terminal remains fully usable without it.
    }
  }, [compactOi, inspectorWidth, ladderMetric, paneHeights, priceRangeMode, section, visibility, workspacePreset]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragRef.current) return;
      setInspectorWidth(Math.min(460, Math.max(320, dragRef.current.width + dragRef.current.x - event.clientX)));
    };
    const stop = () => { dragRef.current = null; document.body.style.cursor = ""; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
  }, []);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (mobileInspectorOpen) {
        setMobileInspectorOpen(false);
        requestAnimationFrame(() => inspectorToggleRef.current?.focus());
      } else if (inspectionModeRef.current === "locked") {
        setLockedTime(null);
        setInspectionMode("latest");
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobileInspectorOpen]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || panes.length === 0) return;
    const timeLookup = new Map<number, string>();
    panes.flatMap((pane) => pane.bars).forEach((bar) => {
      const at = timestamp(bar.end);
      if (at != null) timeLookup.set(Number(at), String(bar.end));
    });
    timeLookupRef.current = timeLookup;
    const chart = createChart(host, {
      // autoSize ignores explicit chart.resize calls. This chart sits inside
      // a shrinking CSS-grid row, so bind it to the measured host ourselves.
      autoSize: false,
      width: Math.max(1, host.clientWidth),
      height: chartContentHeight,
      addDefaultPane: false,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#475569",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 12,
        panes: { separatorColor: "#d7e0eb", separatorHoverColor: "#3b82f666", enableResize: true },
        // Keep the vendor's in-chart attribution visible in every theme and fullscreen mode.
        attributionLogo: true,
      },
      localization: { locale: "en-IN", timeFormatter: istChartTimeLabel },
      grid: {
        vertLines: { color: "#eef2f7", style: LineStyle.SparseDotted },
        horzLines: { color: "#eef2f7", style: LineStyle.SparseDotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#64748baa", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#315ad7" },
        horzLine: { color: "#64748b88", width: 1, style: LineStyle.Dotted, labelBackgroundColor: "#315ad7" },
      },
      rightPriceScale: { borderColor: "#cbd5e1", scaleMargins: { top: 0.08, bottom: 0.08 }, minimumWidth: 74 },
      timeScale: { borderColor: "#cbd5e1", timeVisible: true, secondsVisible: false, rightOffset: 3, barSpacing: 10, minBarSpacing: 3, tickMarkFormatter: istChartTimeLabel },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });
    chartRef.current = chart;
    priceControllersRef.current = [];
    oiControllersRef.current = [];
    analyticControllersRef.current = {};
    const priceSeries: Array<{ pane: Pane; api: ISeriesApi<"Candlestick", Time>; paneIndex: number }> = [];
    panes.slice(0, 3).forEach((pane, index) => {
      const instrument = side(pane);
      const renderBounds = manualBounds[index] ?? (priceRangeMode === "session" ? paddedRenderBounds(financialVisibleBounds(pane.bars), 0.05) : null);
      const candle = chart.addSeries(CandlestickSeries, {
        title: instrument === "NIFTY" ? String(pane.identity.tradingsymbol) : `${instrument} ${String(pane.identity.strike ?? "")}`,
        upColor: UP,
        downColor: DOWN,
        borderUpColor: UP,
        borderDownColor: DOWN,
        wickUpColor: UP,
        wickDownColor: DOWN,
        priceLineVisible: false,
        lastValueVisible: true,
        priceFormat: { type: "price", precision: 2, minMove: 0.05 },
        autoscaleInfoProvider: renderBounds ? () => ({ priceRange: { minValue: renderBounds.min, maxValue: renderBounds.max } }) : undefined,
      }, index);
      candle.setData(closedBars(pane));
      priceSeries.push({ pane, api: candle, paneIndex: index });
      const ema = chart.addSeries(LineSeries, {
        title: `${instrument} EMA9`, color: ORANGE, lineWidth: 2, visible: showEma,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        autoscaleInfoProvider: () => null,
      }, index);
      ema.setData(pane.bars.flatMap((bar) => {
        const time = timestamp(bar.end), value = number(bar.ema9);
        return bar.closed === true && time != null && value != null ? [{ time, value }] : [];
      }));
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
      const markerPlugin = createSeriesMarkers(candle, markers, { autoScale: false, zOrder: "top" });
      priceControllersRef.current.push({ instrument, candle, ema, setMarkers: (next) => markerPlugin.setMarkers(next) });
    });

    const underlying = priceSeries[0]?.api;

    const optionPanes = panes.filter((pane) => side(pane) !== "NIFTY");
    optionPanes.forEach((pane) => {
      const identity = side(pane) as "CE" | "PE";
      const color = identity === "CE" ? CE : PE;
      const current = chart.addSeries(LineSeries, {
        title: `${identity} OI`, color, lineWidth: 2, lineStyle: LineStyle.Solid,
        priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
        priceFormat: { type: "volume" },
      }, 3);
      current.setData(pane.oiHistory.flatMap((row) => {
        const time = timestamp(row.event_time), value = number(row.current);
        return time != null && value != null ? [{ time, value }] : [];
      }));
      const delta = chart.addSeries(HistogramSeries, {
        title: `${identity} ${doiMode === "interval" ? "interval" : "cumulative"} ΔOI`, color,
        priceLineVisible: false, lastValueVisible: false, base: 0,
        priceFormat: { type: "volume" },
      }, 4);
      delta.setData(pane.oiHistory.flatMap((row) => {
        const time = timestamp(row.event_time);
        const value = number(doiMode === "interval" ? row.interval_change : row.cumulative_change);
        return time != null && value != null ? [{ time, value, color: value >= 0 ? `${UP}cc` : `${DOWN}cc` }] : [];
      }));
      oiControllersRef.current.push({ instrument: identity, current, delta });
    });
    const indicatorRows = [...indicators.values()]
      .filter((row) => {
        const at = timestamp(row.time);
        return at != null && timeLookup.has(Number(at));
      })
      .sort((a, b) => a.time.localeCompare(b.time));
    let analyticPane = 5;
    if (visibility.rsi) {
      const rsi = chart.addSeries(LineSeries, {
        title: "RSI 14", color: "#15803d", lineWidth: 2, pointMarkersVisible: true,
        pointMarkersRadius: 2, priceLineVisible: false, lastValueVisible: true,
      }, analyticPane++);
      rsi.setData(indicatorRows.flatMap((row) => {
        const time = timestamp(row.time);
        return time != null && row.rsi != null ? [{ time, value: row.rsi }] : [];
      }));
      analyticControllersRef.current.rsi = rsi;
      [30, 50, 70].forEach((value) => rsi.createPriceLine({
        price: value, color: "#64748b", lineWidth: 1, lineStyle: LineStyle.Dotted,
        axisLabelVisible: value === 50, title: value === 50 ? "RSI 50" : "",
      }));
    }
    const indicatorData = (key: "macd" | "signal" | "histogram") => indicatorRows.flatMap((row) => {
      const time = timestamp(row.time), value = row[key];
      return time != null && value != null ? [{ time, value }] : [];
    });
    if (visibility.macd) {
      const macdPane = analyticPane++;
      const macd = chart.addSeries(LineSeries, { title: "MACD", color: CE, lineWidth: 2, priceLineVisible: false, lastValueVisible: false }, macdPane);
      const signal = chart.addSeries(LineSeries, { title: "SIGNAL", color: ORANGE, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, macdPane);
      const histogram = chart.addSeries(HistogramSeries, { title: "MACD HIST", color: "#64748b", base: 0, priceLineVisible: false, lastValueVisible: false }, macdPane);
      analyticControllersRef.current.macd = macd;
      analyticControllersRef.current.signal = signal;
      analyticControllersRef.current.histogram = histogram;
      macd.setData(indicatorData("macd")); signal.setData(indicatorData("signal"));
      histogram.setData(indicatorRows.flatMap((row) => {
        const time = timestamp(row.time), value = row.histogram;
        return time != null && value != null ? [{ time, value, color: value >= 0 ? `${UP}aa` : `${DOWN}aa` }] : [];
      }));
    }
    if (visibility.pcr) {
      const pcr = chart.addSeries(LineSeries, { title: "PAIR OI PCR", color: PURPLE, lineWidth: 2, pointMarkersVisible: true, pointMarkersRadius: 2, priceLineVisible: false, lastValueVisible: true }, analyticPane);
      analyticControllersRef.current.pcr = pcr;
      pcr.setData(pcrRows.flatMap((row) => {
        const time = timestamp(row.time);
        return time != null && timeLookup.has(Number(time)) ? [{ time, value: row.value }] : [];
      }));
    }
    const updateProfile = () => {
      if (!underlying) return;
      const nativePanes = chart.panes();
      const heights = nativePanes.map((pane) => pane.getHeight());
      const offsets = heights.map((_, index) => heights.slice(0, index).reduce((sum, height) => sum + height, 0));
      const underlyingHeight = heights[0] ?? 0;
      setProfileGeometry(underlyingHeight > 0 ? { top: 0, height: underlyingHeight } : null);
      setPaneTops(offsets.map((top) => top + 6));
      setProfileCoordinates(new Map(oiProfilePoints(legsRef.current).flatMap((point) => {
        const y = underlying.priceToCoordinate(point.strike);
        return y == null || !Number.isFinite(y) ? [] : [[point.strike, y] as const];
      })));
      const activePoints = pointsRef.current;
      if (activePoints.length === 2) {
        const firstTime = timestamp(activePoints[0]);
        const lastTime = timestamp(activePoints[1]);
        const firstX = firstTime == null ? null : chart.timeScale().timeToCoordinate(firstTime);
        const lastX = lastTime == null ? null : chart.timeScale().timeToCoordinate(lastTime);
        setMeasurementBoxes(firstX == null || lastX == null ? [] : priceSeries.flatMap(({ pane, api, paneIndex }) => {
          const currentPane = panesRef.current.find((candidate) => side(candidate) === side(pane));
          if (!currentPane) return [];
          const start = openAt(currentPane.bars, activePoints[0]);
          const end = closeAt(currentPane.bars, activePoints[1]);
          const firstY = start == null ? null : api.priceToCoordinate(start);
          const lastY = end == null ? null : api.priceToCoordinate(end);
          const paneTop = offsets[paneIndex];
          if (firstY == null || lastY == null || paneTop == null) return [];
          return [{
            key: String(currentPane.identity.tradingsymbol),
            left: Math.min(firstX, lastX),
            top: paneTop + Math.min(firstY, lastY),
            width: Math.max(2, Math.abs(lastX - firstX)),
            height: Math.max(2, Math.abs(lastY - firstY)),
          }];
        }));
      } else {
        setMeasurementBoxes([]);
      }
    };
    refreshGeometryRef.current = () => requestAnimationFrame(updateProfile);
    chart.panes().forEach((pane, index) => {
      const id = paneManifest[index];
      pane.setStretchFactor(ALIGNED_PANE_MINIMUMS[id] ?? 120);
      const savedHeight = id ? paneHeightsRef.current[id] : null;
      if (savedHeight != null) pane.setHeight(Math.max(ALIGNED_PANE_MINIMUMS[id], savedHeight));
    });
    const rememberVisibleRange = (range: IRange<Time> | null) => {
      if (range) visibleRangeRef.current = { context: dataContext, range };
    };
    const resizeChart = () => {
      chart.resize(
        Math.max(1, host.clientWidth),
        chartContentHeightRef.current,
        true,
      );
      requestAnimationFrame(updateProfile);
    };
    requestAnimationFrame(() => {
      resizeChart();
      const saved = visibleRangeRef.current;
      if (saved?.context === dataContext && rangePresetRef.current !== "follow") chart.timeScale().setVisibleRange(saved.range);
    });
    const resize = new ResizeObserver(resizeChart);
    resize.observe(host);
    const refreshAfterGesture = (event: PointerEvent) => {
      if (event.buttons !== 0) refreshGeometryRef.current();
    };
    const refreshAfterWheel = () => refreshGeometryRef.current();
    const finishPaneGesture = () => {
      refreshGeometryRef.current();
      const manifest = paneManifestRef.current;
      setPaneHeights((current) => ({ ...current, ...Object.fromEntries(chart.panes().flatMap((pane, index) => {
        const id = manifest[index];
        return id ? [[id, pane.getHeight()]] : [];
      })) }));
    };
    host.addEventListener("pointermove", refreshAfterGesture);
    host.addEventListener("pointerup", finishPaneGesture);
    host.addEventListener("wheel", refreshAfterWheel, { passive: true });
    chart.timeScale().subscribeVisibleLogicalRangeChange(updateProfile);
    chart.timeScale().subscribeVisibleTimeRangeChange(rememberVisibleRange);
    chart.subscribeClick((parameter) => {
      if (parameter.time == null) return;
      const source = timeLookupRef.current.get(Number(parameter.time));
      if (!source) return;
      if (selectingRef.current) onTimeClickRef.current(source);
      else { setCursor({ time: source, rows: [] }); setLockedTime(source); setInspectionMode("locked"); }
    });
    chart.subscribeCrosshairMove((parameter) => {
      if (parameter.time == null) {
        if (inspectionModeRef.current !== "locked") { setCursor(null); setInspectionMode("latest"); }
        return;
      }
      const source = timeLookupRef.current.get(Number(parameter.time));
      if (!source) return;
      const rows = priceSeries.map(({ pane, api }) => {
        const value = parameter.seriesData.get(api) as CandlestickData<Time> | undefined;
        return { label: String(pane.identity.tradingsymbol), value: value ? `O ${fmt(value.open)} · H ${fmt(value.high)} · L ${fmt(value.low)} · C ${fmt(value.close)}` : "—" };
      });
      const indicator = indicatorsRef.current.get(source);
      rows.push({ label: "RSI / MACD", value: `${fmt(indicator?.rsi ?? null)} / ${fmt(indicator?.macd ?? null, 3)}` });
      if (inspectionModeRef.current !== "locked") { setCursor({ time: source, rows }); setInspectionMode("cursor"); }
    });
    return () => {
      resize.disconnect();
      host.removeEventListener("pointermove", refreshAfterGesture);
      host.removeEventListener("pointerup", finishPaneGesture);
      host.removeEventListener("wheel", refreshAfterWheel);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateProfile);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(rememberVisibleRange);
      chart.remove();
      chartRef.current = null;
      priceControllersRef.current = [];
      oiControllersRef.current = [];
      analyticControllersRef.current = {};
      referenceLinesRef.current = [];
      refreshGeometryRef.current = () => {};
    };
  }, [dataContext]);

  useEffect(() => {
    const chart = chartRef.current;
    const host = hostRef.current;
    if (!chart || !host) return;
    const controllers = analyticControllersRef.current;
    const remove = (series: ISeriesApi<"Line" | "Histogram", Time> | undefined) => {
      if (series) chart.removeSeries(series);
    };
    if (!visibility.rsi && controllers.rsi) { remove(controllers.rsi); delete controllers.rsi; }
    if (!visibility.macd && controllers.macd) {
      remove(controllers.macd); remove(controllers.signal); remove(controllers.histogram);
      delete controllers.macd; delete controllers.signal; delete controllers.histogram;
    }
    if (!visibility.pcr && controllers.pcr) { remove(controllers.pcr); delete controllers.pcr; }

    const indicatorRows = [...indicatorsRef.current.values()]
      .filter((row) => timestamp(row.time) != null)
      .sort((a, b) => a.time.localeCompare(b.time));
    const lineData = (key: "rsi" | "macd" | "signal") => indicatorRows.flatMap((row) => {
      const time = timestamp(row.time), value = row[key];
      return time != null && value != null ? [{ time, value }] : [];
    });
    if (visibility.rsi && !controllers.rsi) {
      controllers.rsi = chart.addSeries(LineSeries, { title: "RSI 14", color: "#15803d", lineWidth: 2, pointMarkersVisible: true, pointMarkersRadius: 2, priceLineVisible: false, lastValueVisible: true }, chart.panes().length);
      controllers.rsi.setData(lineData("rsi"));
      [30, 50, 70].forEach((value) => controllers.rsi?.createPriceLine({ price: value, color: "#64748b", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: value === 50, title: value === 50 ? "RSI 50" : "" }));
    }
    if (visibility.macd && !controllers.macd) {
      controllers.macd = chart.addSeries(LineSeries, { title: "MACD", color: CE, lineWidth: 2, priceLineVisible: false, lastValueVisible: false }, chart.panes().length);
      const pane = controllers.macd.getPane().paneIndex();
      controllers.signal = chart.addSeries(LineSeries, { title: "SIGNAL", color: ORANGE, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, pane);
      controllers.histogram = chart.addSeries(HistogramSeries, { title: "MACD HIST", color: "#64748b", base: 0, priceLineVisible: false, lastValueVisible: false }, pane);
      controllers.macd.setData(lineData("macd")); controllers.signal.setData(lineData("signal"));
      controllers.histogram.setData(indicatorRows.flatMap((row) => {
        const time = timestamp(row.time), value = row.histogram;
        return time != null && value != null ? [{ time, value, color: value >= 0 ? `${UP}aa` : `${DOWN}aa` }] : [];
      }));
    }
    if (visibility.pcr && !controllers.pcr) {
      controllers.pcr = chart.addSeries(LineSeries, { title: "PAIR OI PCR", color: PURPLE, lineWidth: 2, pointMarkersVisible: true, pointMarkersRadius: 2, priceLineVisible: false, lastValueVisible: true }, chart.panes().length);
      controllers.pcr.setData(pcrRows.flatMap((row) => {
        const time = timestamp(row.time);
        return time == null ? [] : [{ time, value: row.value }];
      }));
    }
    const representatives = [visibility.rsi ? controllers.rsi : null, visibility.macd ? controllers.macd : null, visibility.pcr ? controllers.pcr : null].filter((series): series is ISeriesApi<"Line", Time> => Boolean(series));
    representatives.forEach((series, index) => series.getPane().moveTo(5 + index));
    chart.resize(Math.max(1, host.clientWidth), chartContentHeightRef.current, true);
    chart.panes().forEach((pane, index) => {
      const id = paneManifest[index];
      pane.setStretchFactor(ALIGNED_PANE_MINIMUMS[id] ?? 120);
      const savedHeight = id ? paneHeightsRef.current[id] : null;
      if (savedHeight != null) pane.setHeight(Math.max(ALIGNED_PANE_MINIMUMS[id], savedHeight));
    });
    refreshGeometryRef.current();
  }, [chartContentHeight, paneManifest, pcrRows, visibility]);

  useEffect(() => {
    referenceLinesRef.current.forEach(({ series, line }) => series.removePriceLine(line));
    referenceLinesRef.current = [];
    const underlying = priceControllersRef.current.find((controller) => controller.instrument === "NIFTY")?.candle;
    if (!underlying) return;
    const compactChart = (hostRef.current?.clientWidth ?? 0) < 700;
    const add = (options: Parameters<typeof underlying.createPriceLine>[0]) => {
      referenceLinesRef.current.push({ series: underlying, line: underlying.createPriceLine(options) });
    };
    if (showLevels) levels.filter((level) => levelIsInSessionRange(level.value, bounds)).forEach((level) => add({
      price: level.value,
      color: level.side === "R" ? "#fb7185" : "#34d399",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: !compactChart,
      title: compactChart ? "" : `${String(level.row.timeframe).toUpperCase()} ${level.side}`,
    }));
    if (showGrid) roundNumberGuides(bounds, 50).forEach((value) => add({
      price: value, color: "#50627a", lineWidth: 1, lineStyle: LineStyle.SparseDotted,
      axisLabelVisible: false, title: "",
    }));
    maxPainStrikes.filter((value) => levelIsInSessionRange(value, bounds)).forEach((value) => add({
      price: value, color: PURPLE, lineWidth: 2, lineStyle: LineStyle.Dotted,
      axisLabelVisible: !compactChart, title: compactChart ? "" : "MAX PAIN · INDICATIVE",
    }));
  }, [boundsKey, levelsKey, maxPainKey, showGrid, showLevels]);

  useEffect(() => {
    if (!chartRef.current || !priceControllersRef.current.length) return;
    const nextLookup = new Map<number, string>();
    panes.flatMap((pane) => pane.bars).forEach((bar) => {
      const at = timestamp(bar.end);
      if (at != null) nextLookup.set(Number(at), String(bar.end));
    });
    timeLookupRef.current = nextLookup;

    priceControllersRef.current.forEach((controller) => {
      const pane = panes.find((candidate) => side(candidate) === controller.instrument);
      if (!pane) return;
      controller.candle.setData(closedBars(pane));
      const paneIndex = controller.instrument === "NIFTY" ? 0 : controller.instrument === "CE" ? 1 : 2;
      const renderBounds = manualBounds[paneIndex] ?? (priceRangeMode === "session" ? paddedRenderBounds(financialVisibleBounds(pane.bars), 0.05) : null);
      controller.candle.applyOptions({
        autoscaleInfoProvider: renderBounds ? () => ({ priceRange: { minValue: renderBounds.min, maxValue: renderBounds.max } }) : undefined,
      });
      controller.ema.applyOptions({ visible: showEma });
      controller.ema.setData(pane.bars.flatMap((bar) => {
        const time = timestamp(bar.end), value = number(bar.ema9);
        return bar.closed === true && time != null && value != null ? [{ time, value }] : [];
      }));
      const measurementMarkers: SeriesMarker<Time>[] = points.flatMap((point, markerIndex) => {
        const time = timestamp(point);
        const value = markerIndex === 0 ? openAt(pane.bars, point) : closeAt(pane.bars, point);
        return time != null && value != null ? [{
          time, price: value, position: "atPriceMiddle" as const,
          color: markerIndex === 0 ? "#38bdf8" : "#f472b6",
          shape: "circle" as const, text: markerIndex === 0 ? "A · OPEN" : "B · CLOSE",
        }] : [];
      });
      const signalMarkers: SeriesMarker<Time>[] = signals.flatMap((event) => {
        if (controller.instrument === "NIFTY") {
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
        return controller.instrument === wanted && event.state === "RETROSPECTIVE_ENTRY_REFERENCE" && entryAt != null && event.optionPremium != null
          ? [{ time: entryAt, price: event.optionPremium, position: "atPriceMiddle", color: controller.instrument === "CE" ? CE : PE, shape: "circle", text: `${controller.instrument} OPEN · REF` }]
          : [];
      });
      controller.setMarkers([...measurementMarkers, ...signalMarkers].sort((a, b) => Number(a.time) - Number(b.time)));
    });

    oiControllersRef.current.forEach((controller) => {
      const pane = panes.find((candidate) => side(candidate) === controller.instrument);
      if (!pane) return;
      controller.current.setData(pane.oiHistory.flatMap((row) => {
        const time = timestamp(row.event_time), value = number(row.current);
        return time != null && value != null ? [{ time, value }] : [];
      }));
      controller.delta.setData(pane.oiHistory.flatMap((row) => {
        const time = timestamp(row.event_time);
        const value = number(doiMode === "interval" ? row.interval_change : row.cumulative_change);
        return time != null && value != null ? [{ time, value, color: value >= 0 ? `${UP}cc` : `${DOWN}cc` }] : [];
      }));
    });

    const indicatorRows = [...indicators.values()]
      .filter((row) => {
        const at = timestamp(row.time);
        return at != null && nextLookup.has(Number(at));
      })
      .sort((a, b) => a.time.localeCompare(b.time));
    const indicatorData = (key: "rsi" | "macd" | "signal") => indicatorRows.flatMap((row) => {
      const time = timestamp(row.time), value = row[key];
      return time != null && value != null ? [{ time, value }] : [];
    });
    analyticControllersRef.current.rsi?.setData(indicatorData("rsi"));
    analyticControllersRef.current.macd?.setData(indicatorData("macd"));
    analyticControllersRef.current.signal?.setData(indicatorData("signal"));
    analyticControllersRef.current.histogram?.setData(indicatorRows.flatMap((row) => {
      const time = timestamp(row.time), value = row.histogram;
      return time != null && value != null ? [{ time, value, color: value >= 0 ? `${UP}aa` : `${DOWN}aa` }] : [];
    }));
    analyticControllersRef.current.pcr?.setData(pcrRows.flatMap((row) => {
      const time = timestamp(row.time);
      return time != null && nextLookup.has(Number(time)) ? [{ time, value: row.value }] : [];
    }));
    refreshGeometryRef.current();
  }, [doiMode, indicators, manualBoundsKey, panes, pcrRows, points, priceRangeMode, showEma, signals]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (!closedCount) return;
    const visible = rangePreset === "30" ? 30 : rangePreset === "60" ? 60 : closedCount;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(-0.5, closedCount - visible - 0.5), to: closedCount + 1.5 });
    if (rangePreset === "follow") chart.timeScale().scrollToRealTime();
  }, [closedCount, dataContext, rangePreset]);

  const underlyingPane = panes.find((pane) => side(pane) === "NIFTY");
  const callPane = panes.find((pane) => side(pane) === "CE");
  const putPane = panes.find((pane) => side(pane) === "PE");
  const inspected = [underlyingPane, callPane, putPane].map((pane) => pane ? inspectionBar(pane.bars, inspectedTime) : null);
  const indicator = inspectedTime ? indicators.get(inspectedTime) ?? null : latestIndicator;
  const stateCounts = signals.reduce<Record<ScalperSignal["state"], number>>((counts, event) => ({ ...counts, [event.state]: counts[event.state] + 1 }), {
    WAIT_NEXT_OPEN: 0, NEXT_BAR_MISSING: 0, NEXT_OPEN_FAILED: 0, RETROSPECTIVE_ENTRY_REFERENCE: 0,
  });
  const issues = panes.filter((pane) => pane.sourceMinuteCount === 0).length + (latestCe?.iv == null ? 1 : 0) + (latestPe?.iv == null ? 1 : 0);
  const selectedUnderlying = number(inspected[0]?.close);
  const oiValue = (value: number | null) => compactOi ? compact(value) : fmt(value, 0);
  const signedOiValue = (value: number | null) => value == null ? "—" : `${value > 0 ? "+" : ""}${oiValue(value)}`;
  const metricRows = [
    { label: "Open interest · provider-native", ce: activeCe?.oi, pe: activePe?.oi, format: oiValue },
    { label: `Interval ΔOI · ${interval}m endpoint`, ce: activeCe?.intervalChange, pe: activePe?.intervalChange, format: signedOiValue },
    { label: "Cumulative ΔOI · session baseline", ce: activeCe?.cumulativeChange, pe: activePe?.cumulativeChange, format: signedOiValue },
    { label: "Snapshot ΔOI · archived comparison", ce: activeCe?.snapshotChange, pe: activePe?.snapshotChange, format: signedOiValue },
    { label: `IV · % · ${inspectedTime ? "at/prior snapshot" : "latest snapshot"}`, ce: activeCe?.iv, pe: activePe?.iv, format: (value: number | null) => fmt(value) },
    { label: "Bid–ask spread · unavailable when not captured", ce: null, pe: null, format: (value: number | null) => money(value) },
  ];
  const setPreset = (preset: Exclude<ScalperWorkspacePreset, "custom">) => {
    setWorkspacePreset(preset);
    setVisibility(preset === "full" ? { rsi: true, macd: true, pcr: true } : { rsi: false, macd: false, pcr: false });
  };
  const jumpToTime = (time: string) => {
    const center = Date.parse(time);
    if (!Number.isFinite(center)) return;
    const radius = Math.max(15, interval * 8) * 60_000;
    chartRef.current?.timeScale().setVisibleRange({
      from: Math.floor((center - radius) / 1_000) as UTCTimestamp,
      to: Math.floor((center + radius) / 1_000) as UTCTimestamp,
    });
    setCursor({ time, rows: [] });
    setLockedTime(time);
    setInspectionMode("locked");
    setSection("snapshot");
  };
  const copySnapshot = async () => {
    const payload = {
      inspection_mode: inspectionMode,
      inspected_at: inspectedTime,
      trading_day: tradingDay,
      interval_minutes: interval,
      expiry,
      ce_strike: selectedCeStrike,
      pe_strike: selectedPeStrike,
      underlying: inspected[0],
      call: { identity: callPane?.identity ?? null, bar: inspected[1], reading: activeCe },
      put: { identity: putPane?.identity ?? null, bar: inspected[2], reading: activePe },
      pair_oi_pcr: activePcr,
    };
    await navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
  };
  const exportPayload = {
    analysis_as_of: inspectedTime,
    generated_at: new Date().toISOString(),
    context: { tradingDay, intervalMinutes: interval, expiry, selectedCeStrike, selectedPeStrike, inspectionMode },
    panes,
    chain: legs,
    levels: levels.map((level) => ({ ...level.row, side: level.side, value: level.value })),
    maxPainStrikes,
    signals,
    measurement: measured,
    quantity,
  };
  const ladderCell = (leg: Row | undefined) => ladderMetric === "premium"
    ? money(leg?.last_price)
    : ladderMetric === "oi"
      ? oiValue(number(leg?.open_interest))
      : signedOiValue(number((leg?.oi_layers as Row | undefined)?.change));
  const paneLabels: Array<{
    label: string;
    className: string;
    price?: { open: string; high: string; low: string; close: string; ema: string; relationship: string; status: string };
  }> = [
    ...["NIFTY 50", `CE ${selectedCeStrike}`, `PE ${selectedPeStrike}`].map((label, index) => {
      const bar = inspected[index], close = number(bar?.close), ema = number(bar?.ema9), distance = close == null || ema == null ? null : close - ema;
      return {
        label,
        className: index === 1 ? styles.ceText : index === 2 ? styles.peText : "",
        price: {
          open: fmt(number(bar?.open)), high: fmt(number(bar?.high)), low: fmt(number(bar?.low)), close: fmt(close), ema: fmt(ema),
          relationship: distance == null ? "Unavailable" : `${signed(distance)} ${index === 0 ? "points" : "₹"} · ${distance > 0 ? "Above" : distance < 0 ? "Below" : "At"} EMA9`,
          status: bar ? `Closed · ${interval}m${index ? ` · exp ${expiry}` : ""}` : `Missing · ${interval}m`,
        },
      };
    }),
    { label: "OUTSTANDING OI · CE BLUE / PE YELLOW · PROVIDER-NATIVE UNITS", className: "" },
    { label: `${doiMode === "interval" ? `SIGNED INTERVAL ΔOI · ${interval}m` : "SIGNED CUMULATIVE ΔOI · SESSION BASELINE"} · GREEN + / RED −`, className: "" },
    ...(visibility.rsi ? [{ label: `RSI 14 · 0–100 · ${fmt(indicator?.rsi ?? null)}`, className: "" }] : []),
    ...(visibility.macd ? [{ label: `MACD 12/26/9 · ${fmt(indicator?.macd ?? null, 4)} · SIGNAL ${fmt(indicator?.signal ?? null, 4)} · HIST ${fmt(indicator?.histogram ?? null, 4)}`, className: "" }] : []),
    ...(visibility.pcr ? [{ label: `PAIR OI PCR · MATCHED ENDPOINT · ${fmt(currentPcr)}`, className: "" }] : []),
  ];
  const snapshotCard = (label: string, pane: Pane | undefined, bar: Row | null, option: boolean) => {
    const close = number(bar?.close), ema = number(bar?.ema9), distance = close == null || ema == null ? null : close - ema;
    const values: Array<[string, unknown]> = [
      ["Open", bar?.open], ["High", bar?.high], ["Low", bar?.low], ["Close", bar?.close], ["EMA9", bar?.ema9],
    ];
    return <article className={styles.alignedSnapshotCard} key={label}><header><strong>{label}</strong><span>{bar ? istTime(String(bar.end)) : "Exact bar unavailable"}</span></header><div className={styles.alignedOhlcGrid}>{values.map(([name, value]) => <span key={name}><small>{name}</small><strong>{option ? money(value) : fmt(number(value))}</strong></span>)}</div><p><b>Close − EMA9</b><strong className={distance != null && distance > 0 ? styles.positiveText : distance != null && distance < 0 ? styles.negativeText : undefined}>{distance == null ? "—" : `${signed(distance)} ${option ? "₹" : "points"}`} · {distance == null ? "Unavailable" : distance > 0 ? "Above EMA" : distance < 0 ? "Below EMA" : "At EMA"}</strong></p></article>;
  };

  return <div ref={workspaceRef} className={styles.alignedTerminal} data-testid="aligned-scalper-terminal" data-chart-context={dataContext} data-chart-config={`${bounds?.min ?? "—"}:${bounds?.max ?? "—"}|${levels.length}|${maxPainStrikes.join(",")}`} style={{ "--sc-inspector-width": `${inspectorWidth}px` } as CSSProperties}>
    <div className={styles.alignedChartColumn}>
      <div className={styles.alignedChartViewport} aria-label="Scrollable aligned chart stack">
        <section className={styles.alignedChartSurface} aria-label="Aligned NIFTY, exact call, exact put and evidence panes" style={{ height: chartContentHeight }}>
          <div className={styles.alignedPaneLabels}>{paneLabels.map((item, index) => item.price ? <div key={`${index}-${item.label}`} data-testid={`aligned-pane-label-${index}`} className={`${styles.alignedPricePaneLabel} ${item.className}`} style={{ top: paneTops[index] ?? 6 }} title={index === 0 ? String(underlyingPane?.identity.tradingsymbol ?? item.label) : String((index === 1 ? callPane : putPane)?.identity.tradingsymbol ?? item.label)}>
            <strong>{item.label}</strong><small>{item.price.status}</small>
            <span><i>O</i>{item.price.open}</span><span><i>H</i>{item.price.high}</span><span><i>L</i>{item.price.low}</span><span><i>C</i>{item.price.close}</span><span><i>EMA9</i>{item.price.ema}</span>
            <b>{item.price.relationship}</b>
          </div> : <span key={`${index}-${item.label}`} data-testid={`aligned-pane-label-${index}`} className={item.className} style={{ top: paneTops[index] ?? 6 }}>{item.label}</span>)}</div>
          <div ref={hostRef} className={`${styles.alignedChartHost} ${selecting ? styles.alignedSelecting : ""}`} style={{ height: chartContentHeight }} />
          <div className={styles.alignedMeasurementOverlay} data-testid="aligned-measurement-boxes" aria-hidden="true">{measurementBoxes.map((box) => <span key={box.key} style={box} />)}</div>
          <OiStrikeOverlay rows={legs} bounds={bounds} coordinates={profileCoordinates} geometry={profileGeometry} mode={profileMode} />
        </section>
      </div>
      <footer className={styles.alignedChartFooter}>
        <span><b>{inspectionMode === "latest" ? "Latest" : inspectionMode === "cursor" ? "At cursor" : "Locked"}</b> · {istTime(inspectedTime)}</span>
        <button type="button" aria-pressed={workspacePreset === "price"} onClick={() => setPreset("price")}>Price focus</button>
        <button type="button" aria-pressed={workspacePreset === "full"} onClick={() => setPreset("full")}>Full analysis</button>
        {(["30", "60", "session", "follow"] as const).map((value) => <button key={value} type="button" aria-pressed={rangePreset === value} onClick={() => setRangePreset(value)}>{value === "30" ? "Last 30" : value === "60" ? "Last 60" : value === "session" ? "Full session" : "Follow latest"}</button>)}
        <label>ΔOI <select value={doiMode} onChange={(event) => setDoiMode(event.target.value as typeof doiMode)}><option value="interval">Interval</option><option value="cumulative">Cumulative</option></select></label>
        <label>Profile <select value={profileMode} onChange={(event) => setProfileMode(event.target.value as typeof profileMode)}><option value="current">Current OI</option><option value="change">Snapshot ΔOI</option><option value="composite">Composite</option></select></label>
        <label>Price range <select value={priceRangeMode} onChange={(event) => setPriceRangeMode(event.target.value as "session" | "visible")}><option value="session">Session</option><option value="visible">Visible candles</option></select></label>
        {(["rsi", "macd", "pcr"] as const).map((name) => <label key={name}><input type="checkbox" checked={visibility[name]} onChange={(event) => { setWorkspacePreset("custom"); setVisibility((current) => ({ ...current, [name]: event.target.checked })); }} />{name.toUpperCase()}</label>)}
        <label title="Only a timestamped latest IV exists in this response"><input type="checkbox" disabled checked={false} />IV unavailable</label>
        <details className={styles.alignedFooterMenu}><summary>Export</summary><div>
          <button type="button" onClick={() => downloadEvidence("scalper-chart-candles.csv", evidenceCsv(panes.flatMap((pane) => pane.bars.map((bar) => ({ ...pane.identity, ...bar })))), "text/csv;charset=utf-8")}>Chart candles CSV</button>
          <button type="button" onClick={() => downloadEvidence("scalper-oi-observations.csv", evidenceCsv(panes.flatMap((pane) => pane.oiHistory.map((row) => ({ ...pane.identity, ...row })))), "text/csv;charset=utf-8")}>OI observations CSV</button>
          <button type="button" onClick={() => downloadEvidence("scalper-inspector-snapshot.json", JSON.stringify(exportPayload, null, 2), "application/json")}>Full evidence JSON</button>
          <button type="button" disabled={!measured} onClick={() => downloadEvidence("scalper-measurement.json", JSON.stringify({ generated_at: new Date().toISOString(), context: exportPayload.context, quantity, measurement: measured }, null, 2), "application/json")}>Measurement JSON</button>
        </div></details>
        <button type="button" onClick={() => workspaceRef.current?.requestFullscreen?.()}>Fullscreen</button>
        <button ref={inspectorToggleRef} type="button" className={styles.alignedInspectorToggle} aria-expanded={mobileInspectorOpen} onClick={() => setMobileInspectorOpen(true)}>Inspector</button>
      </footer>
    </div>
    <button type="button" className={styles.alignedDivider} aria-label="Resize evidence inspector" onPointerDown={(event) => { dragRef.current = { x: event.clientX, width: inspectorWidth }; document.body.style.cursor = "col-resize"; }} />
    {mobileInspectorOpen && <button type="button" className={styles.alignedInspectorBackdrop} aria-label="Close evidence inspector" onClick={() => setMobileInspectorOpen(false)} />}
    <aside className={`${styles.alignedInspector} ${mobileInspectorOpen ? styles.alignedInspectorOpen : ""}`} aria-label="Aligned terminal evidence inspector">
      <section className={styles.alignedInspectorSummary}>
        <header><strong>{String(underlyingPane?.identity.tradingsymbol ?? "Underlying")} · CE {fmt(number(selectedCeStrike), 0)} / PE {fmt(number(selectedPeStrike), 0)}</strong><span>{expiry || "—"}</span><button type="button" className={styles.alignedInspectorClose} aria-label="Close evidence inspector" onClick={() => setMobileInspectorOpen(false)}>×</button></header>
        <p className={styles.alignedIdentityMeta}>{tradingDay || "—"} · {interval}m · {fixed ? "Measurement contracts fixed" : Number(selectedCeStrike) === defaultStrike && Number(selectedPeStrike) === defaultStrike ? "Both selected · ATM" : `Selected independently · ATM ${fmt(defaultStrike, 0)}`} · {inspectionMode === "latest" ? "Latest" : inspectionMode === "cursor" ? "At cursor" : `Locked ${istTime(lockedTime)}`}</p>
        <div className={styles.alignedPairCards}>
          <article data-side="ce"><b className={styles.ceText}>CE · {fmt(number(selectedCeStrike), 0)}</b><strong>{money(activeCe?.ltp)}</strong><small>{activeCe?.priceBasis ?? "Unavailable"} · {istTime(activeCe?.priceAt ?? null)}</small></article>
          <article data-side="pe"><b className={styles.peText}>PE · {fmt(number(selectedPeStrike), 0)}</b><strong>{money(activePe?.ltp)}</strong><small>{activePe?.priceBasis ?? "Unavailable"} · {istTime(activePe?.priceAt ?? null)}</small></article>
        </div>
        <div className={styles.alignedMetricMatrix} role="table" aria-label="Selected pair metrics"><div role="row"><b>Metric</b><b className={styles.ceText}>CE</b><b className={styles.peText}>PE</b></div>{metricRows.map((row) => <div role="row" key={row.label}><span>{row.label}</span><strong>{row.format(row.ce ?? null)}</strong><strong>{row.format(row.pe ?? null)}</strong></div>)}</div>
        <div className={styles.alignedPcrSummary}><span>Pair OI PCR</span><strong>{fmt(activePcr?.value ?? null)}</strong><small>{activePcr == null ? "Unavailable · matching endpoint required" : `${inspectedTime ? "Same endpoint at/prior cursor" : "Same endpoint"} · ${istTime(activePcr.time)}`}</small></div>
        <button type="button" className={issues ? styles.alignedHealthWarning : styles.alignedHealthOk} onClick={() => setSection("health")}>{issues ? `${issues} data issues · inspect Health` : "Source checks current · inspect Health"}</button>
      </section>
      <nav className={styles.alignedInspectorTabs} aria-label="Inspector sections">{(["snapshot", "chain", "rules", "measure", "levels", "health"] as const).map((item) => <button type="button" key={item} aria-current={section === item ? "page" : undefined} onClick={() => setSection(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</nav>
      <div className={styles.alignedInspectorBody}>
        {section === "snapshot" && <section><div className={styles.alignedModeBar}><button type="button" aria-pressed={inspectionMode === "latest"} onClick={() => { setInspectionMode("latest"); setLockedTime(null); }}>Latest</button><button type="button" aria-pressed={inspectionMode === "cursor"} disabled={!cursor?.time} onClick={() => setInspectionMode("cursor")}>Cursor</button><button type="button" aria-pressed={inspectionMode === "locked"} disabled={!lockedTime} onClick={() => setInspectionMode("locked")}>Locked</button></div><div className={styles.alignedSnapshotActions}><button type="button" onClick={copySnapshot}>Copy exact snapshot</button><button type="button" disabled={!inspectedTime} onClick={() => inspectedTime && jumpToTime(inspectedTime)}>Jump chart to time</button></div>{snapshotCard(String(underlyingPane?.identity.tradingsymbol ?? "Underlying"), underlyingPane, inspected[0], false)}{snapshotCard(`CE ${selectedCeStrike}`, callPane, inspected[1], true)}{snapshotCard(`PE ${selectedPeStrike}`, putPane, inspected[2], true)}<article className={styles.alignedSnapshotCard}><header><strong>Underlying indicators</strong><span>{istTime(inspectedTime)}</span></header><div className={styles.alignedOhlcGrid}>{[["RSI14", indicator?.rsi], ["MACD", indicator?.macd], ["Signal", indicator?.signal], ["Histogram", indicator?.histogram]].map(([label, value]) => <span key={String(label)}><small>{label}</small><strong>{fmt(number(value), label === "RSI14" ? 2 : 4)}</strong></span>)}</div></article></section>}
        {section === "chain" && <section><header><strong>Independent CE / PE ladder</strong><span>{expiry} · provider-native</span></header><div className={styles.alignedChainControls}><label>Outside columns <select value={ladderMetric} onChange={(event) => setLadderMetric(event.target.value as ScalperLadderMetric)}><option value="premium">Premium</option><option value="oi">Current OI</option><option value="doi">Snapshot ΔOI</option></select></label><label><input type="checkbox" checked={compactOi} onChange={(event) => setCompactOi(event.target.checked)} />Compact OI</label></div>{legs.length ? <div className={styles.alignedLadderScroll}><table><thead><tr><th>Select CE · {ladderMetric === "premium" ? "premium" : ladderMetric === "oi" ? "OI" : "ΔOI"}</th><th>Strike</th><th>Select PE · {ladderMetric === "premium" ? "premium" : ladderMetric === "oi" ? "OI" : "ΔOI"}</th></tr></thead><tbody>{strikes.map((strike) => {
          const ceLeg = legs.find((leg) => Number(leg.strike) === strike && leg.option_type === "CE");
          const peLeg = legs.find((leg) => Number(leg.strike) === strike && leg.option_type === "PE");
          return <tr key={strike} data-ce-selected={String(strike) === selectedCeStrike || undefined} data-pe-selected={String(strike) === selectedPeStrike || undefined}><td><button type="button" disabled={fixed || !ceLeg} aria-pressed={String(strike) === selectedCeStrike} onClick={() => onStrike("CE", String(strike))}>{ladderCell(ceLeg)}{String(strike) === selectedCeStrike ? " · Selected" : ""}</button></td><th>{fmt(strike, 0)}{strike === defaultStrike ? " · ATM" : ""}</th><td><button type="button" disabled={fixed || !peLeg} aria-pressed={String(strike) === selectedPeStrike} onClick={() => onStrike("PE", String(strike))}>{ladderCell(peLeg)}{String(strike) === selectedPeStrike ? " · Selected" : ""}</button></td></tr>;
        })}</tbody></table></div> : <p className={styles.alignedMuted}>Current-chain ladder is not mixed into this retained historical expiry.</p>}<details><summary>Accessible price-aligned OI table</summary><table><thead><tr><th>Side</th><th>Strike</th><th>Current OI</th><th>Snapshot ΔOI</th></tr></thead><tbody>{oiProfilePoints(legs).map((point) => <tr key={`${point.side}-${point.strike}`}><td>{point.side}</td><td>{fmt(point.strike, 0)}</td><td>{fmt(point.current, 0)}</td><td>{signed(point.change, 0)}</td></tr>)}</tbody></table></details></section>}
        {section === "rules" && <section><header><strong>Paired EMA9 entry · V7</strong><span>{stateCounts.RETROSPECTIVE_ENTRY_REFERENCE} entry references</span></header><div className={styles.alignedRuleCounts}><span>{stateCounts.WAIT_NEXT_OPEN} waiting</span><span>{stateCounts.NEXT_BAR_MISSING} next candle missing</span><span>{stateCounts.NEXT_OPEN_FAILED} next-open failed</span></div>{signals.length ? signals.slice().reverse().map((event) => <details key={event.id}><summary><b className={event.direction === "CALL" ? styles.ceText : styles.peText}>{event.direction}</b> · {event.state === "WAIT_NEXT_OPEN" ? "Setup · waiting for next open" : event.state === "NEXT_BAR_MISSING" ? "Next candle unavailable" : event.state === "NEXT_OPEN_FAILED" ? "Next-open confirmation failed" : "Entry reference · retrospective"} · {istTime(event.setupTime)}</summary><p><b>Body evidence</b><strong>NIFTY {fmt(event.underlyingBodyFraction * 100)}% · option {fmt(event.optionBodyFraction * 100)}%</strong></p><p><b>References</b><strong>{fmt(event.underlyingOpen)} · {money(event.optionPremium)}</strong></p><button type="button" onClick={() => jumpToTime(event.setupTime)}>Inspect setup candle</button><small>Closed-bar research reference; not a live fill. Setup timestamp is the canonical bar-end label.</small></details>) : <p className={styles.alignedMuted}>No timestamp-aligned NIFTY plus selected-option confirmation in this range.</p>}</section>}
        {section === "measure" && <section><header><strong>A open → B close</strong><span>{points.length}/2 anchors · {quantity} units</span></header>{measured ? <>
          <p><b>Intervals</b><small>A {istTime(measured.start)} → B {istTime(measured.end)}</small></p>
          <table className={styles.alignedMeasureTable}><thead><tr><th>Instrument</th><th>A open</th><th>B close</th><th>Change</th><th>Change × quantity</th></tr></thead><tbody>{measured.rows.map((row) => {
            const contribution = row.kind === "UNDERLYING" || row.delta == null || !Number.isSafeInteger(quantity) || quantity <= 0 ? null : row.delta * quantity;
            return <tr key={row.symbol}><th title={row.symbol}>{row.kind}<small>{row.symbol}</small></th><td>{fmt(row.from)}</td><td>{fmt(row.to)}</td><td className={number(row.delta) != null && Number(row.delta) > 0 ? styles.positiveText : number(row.delta) != null && Number(row.delta) < 0 ? styles.negativeText : undefined}>{signed(row.delta)} {row.kind === "UNDERLYING" ? "points" : "₹"}</td><td>{row.kind === "UNDERLYING" ? "Not included" : money(contribution)}</td></tr>;
          })}</tbody></table>
          <div className={styles.alignedPcrSummary}><span>Combined premium change</span><strong>{signed(measured.combined)}</strong><small>Illustrative long-both · before costs/slippage · not booked</small><strong>{money(measured.pnl)}</strong></div>
        </> : <p className={styles.alignedMuted}>{selecting ? `Select ${points.length ? "B at candle close" : "A at candle open"}.` : "Use Measure in the command bar to fix the pair and select A/B."}</p>}</section>}
        {section === "levels" && <section><header><strong>All structural levels</strong><span>{levels.filter((level) => levelIsInSessionRange(level.value, bounds)).length} plotted / {levels.length} available</span></header><table className={styles.alignedLevelsTable}><thead><tr><th>Level</th><th>Price</th><th>Level − price</th><th>Status</th></tr></thead><tbody>{levels.map((level) => <tr key={`${level.side}-${String(level.row.timeframe)}`}><th>{String(level.row.timeframe).toUpperCase()} {level.side}</th><td>{fmt(level.value)}</td><td>{selectedUnderlying == null ? "—" : `${signed(level.value - selectedUnderlying)} points`}</td><td>{levelIsInSessionRange(level.value, bounds) ? "Plotted" : "Outside session"}</td></tr>)}{maxPainStrikes.map((value) => <tr key={`max-${value}`}><th className={styles.maxPainText}>Max pain</th><td>{fmt(value)}</td><td>{selectedUnderlying == null ? "—" : `${signed(value - selectedUnderlying)} points`}</td><td>Snapshot · indicative</td></tr>)}</tbody></table></section>}
        {section === "health" && <section><header><strong>Source and coverage</strong><span>{issues ? `${issues} visible issues` : "Current checks"}</span></header>{panes.map((pane) => <details key={String(pane.identity.tradingsymbol)}><summary>{String(pane.identity.tradingsymbol)} · {pane.sourceMinuteCount.toLocaleString("en-IN")} minutes · {pane.coverage.length} coverage rows</summary><pre>{JSON.stringify(pane.coverage, null, 2)}</pre></details>)}<p><b>IV state</b><small>CE {latestCe?.iv == null ? "Unavailable" : `snapshot ${istTime(latestCe.ivAt)}`} · PE {latestPe?.iv == null ? "Unavailable" : `snapshot ${istTime(latestPe.ivAt)}`}</small></p><p><b>OI basis</b><small>Current, interval and cumulative values remain distinct; missing baselines are never zero.</small></p></section>}
      </div>
    </aside>
  </div>;
}
