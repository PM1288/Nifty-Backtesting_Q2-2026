import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import type { EChartsOption } from "echarts";
import { getJson } from "../lib/api";
import { SCALPER_V2_OPTION_HISTORY_REFRESH_MS, SCALPER_V2_PRICE_REFRESH_MS } from "../lib/liveCadence";
import { evidenceCsv } from "../lib/tradingAnalyticsExport";
import { MwhdRankBadge } from "../features/mwhd/MwhdRankBadge";
import { useMwhdRankings } from "../features/mwhd/useMwhdRankings";
import { dayRows, istDay } from "../lib/tradingAnalyticsChartView";
import { measurePanes, scalperIndicators } from "../lib/scalperMeasurement";
import { SCALPER_ENTRY_RULE, scalperPairedBody70Signals } from "../lib/scalperSignals";
import { formatOiAxisValue, maxPainDistribution, oiPcr, rankCurrentOi } from "../lib/scalperV2";
import { scalperV2CompactSideOption, scalperV2CompactTooltipOption, scalperV2ExpandedOption, scalperV2VerticalStrikeOption } from "../lib/scalperV2Analytics";
import { SCALPER_DIRECTIONAL_OI_ENTRY_RULE, scalperV2DirectionalOiEntries } from "../lib/scalperV2DirectionalEntry";
import {
  SCALPER_V2_THREE_INSTRUMENT_EMA_RULE,
  scalperV2EmaAlignmentAvailability,
  scalperV2EmaAlignmentSignals,
  scalperV2EmaAlignmentSpeech,
} from "../lib/scalperV2EmaAlignment";
import { scalperV2OiDifferenceOption, scalperV2OiMetricOption, scalperV2PcrTimeOption } from "../lib/scalperV2OiTime";
import { scalperV2CompactRangePriceOption, scalperV2NormalizedPriceSeries, visibleScalperV2PriceSeries, type ScalperV2OptionPricePoint, type ScalperV2PriceMode } from "../lib/scalperV2NormalizedPrice";
import { scalperV2PositioningHeatmapOption, scalperV2PositioningModel, scalperV2StrikeStructureOption } from "../lib/scalperV2Positioning";
import { scalperV2OiTotals, scalperV2StructureRows } from "../lib/scalperV2Structure";
import { oiComparisonState } from "../lib/scalperV2Geometry";
import { normalizeScalperV2ProfileRows, profileBaselineLabel } from "../lib/scalperV2OiProfile";
import { scalperV2ReferenceGauge, type ScalperV2ReferenceLevelPayload } from "../lib/scalperV2ReferenceLevels";
import { ScalperV2CursorCoordinator } from "../lib/scalperV2Cursor";
import { scalperV2CompletedCandleSignature, scalperV2RefreshClock, scalperV2SessionSlotCount, scalperV2StableFitSlotBudget, shouldFollowScalperV2TradingDay, shouldRefitScalperV2Day } from "../lib/scalperV2LiveSession";
import {
  applyScalperLegsToChartQuery,
  availableScalperStrikes,
  nearestScalperStrike,
  scalperLegSelection,
  setScalperLegSelection,
  type AvailableScalperContract,
} from "../lib/scalperContractSelection";
import {
  ScalperV2Chart,
  type ScalperV2Crosshair,
  type ScalperV2HorizontalView,
  type ScalperV2InspectionMode,
  type ScalperV2TimeRange,
  type ScalperV2VerticalView,
} from "./scalper-v2/ScalperV2Chart";
import { createScalperV2Drawing, DRAWING_TOOLS, type ScalperV2Drawing, type ScalperV2DrawingAnchor, type ScalperV2DrawingTool, type ScalperV2PaneRole } from "./scalper-v2/scalperV2Drawings";
import { useScalperV2Drawings } from "./scalper-v2/useScalperV2Drawings";
import css from "./scalper-v2/ScalperV2.module.css";
import { ScalperV2Freshness } from "./scalper-v2/ScalperV2Freshness";
import type { ScalperSession } from "../lib/scalperV2Freshness";
import { intervalBarChartTime } from "../lib/tradingAnalyticsTime";
import { scalperV3AccelerationArrow, scalperV3AgeLabel, scalperV3Delta, scalperV3FeedState, scalperV3ReferenceTime, scalperV3RowAtOrBefore, scalperV3Velocity, type ScalperV3ComparisonReference } from "../lib/scalperV3Live";

const Chart = lazy(async () => ({ default: (await import("../components/visual/EChartSurface")).EChartSurface }));
type Row = Record<string, unknown>;
type ChartPane = { identity: Row; bars: Row[]; coverage: Row[]; sourceMinuteCount: number; oiHistory: Row[] };
type CumulativeOiPoint = {
  snapshotId: string;
  capturedAt: string;
  source: unknown;
  strikesAround: number | null;
  strikeCount: number | null;
  ceContractCount: number | null;
  ceObservedCount: number | null;
  ceOi: number | null;
  peContractCount: number | null;
  peObservedCount: number | null;
  peOi: number | null;
  ceChangeObservedCount: number | null;
  ceChangeOi: number | null;
  peChangeObservedCount: number | null;
  peChangeOi: number | null;
  baselineKind: string | null;
  oiDifference: number | null;
  changeOiDifference: number | null;
  pcr: number | null;
  state: "COMPLETE" | "PARTIAL";
  changeState: "COMPLETE" | "PARTIAL";
};
type ChartPayload = {
  calendar?: { sessions: ScalperSession[] };
  panes: ChartPane[];
  availableContracts: AvailableScalperContract[];
  limitations: string[];
  interval: number;
  asOf: string;
  volumeSeries?: {
    kind: "CASH_UNDERLYING" | "CURRENT_MONTH_FUTURE";
    unit: "provider_native_volume";
    state: "AVAILABLE" | "UNAVAILABLE";
    identity: { exchange: string; symbolToken: string; tradingSymbol: string; expiry: string | null } | null;
    bars: Row[];
    limitations: string[];
  };
  cumulativeOiHistory?: {
    expiry: string | null;
    unit: "contracts";
    scope: "ALL_STRIKES_CAPTURED_PER_SNAPSHOT";
    points: CumulativeOiPoint[];
    limitations: string[];
  };
};
type OptionPriceHistoryPayload = {
  asOf: string;
  symbol: string;
  expiry: string;
  unit: "INR";
  scope: "ALL_STRIKES_CAPTURED_PER_SNAPSHOT";
  points: ScalperV2OptionPricePoint[];
  limitations: string[];
};
type RailTab = "time" | "chain" | "profile" | "levels" | "rules" | "measure" | "objects" | "health";
type AnalyticsTab = "overview" | "matrix" | "oi" | "strength" | "total" | "maxpain";
type ExpandableChartId = "oi" | "delta-oi" | "strike-structure" | "positioning-heatmap" | "oi-difference" | "change-oi-difference" | "range-price";
type ChartInfoId = "strike-structure" | "positioning-heatmap";
type V3LayoutPreset = "trading" | "options" | "structure";
type V3Density = "standard" | "dense" | "readable";
type V3CursorSnap = "candle" | "exact" | "free";
type V3RangeDisplay = "current" | "context" | "all";

const numeric = (value: unknown) => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const compact = (value: unknown) => numeric(value) == null ? "—" : new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 }).format(Number(value));
const number = (value: unknown) => numeric(value) == null ? "—" : Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const price = (value: unknown) => numeric(value) == null ? "—" : `₹${number(value)}`;
const signed = (value: unknown) => numeric(value) == null ? "—" : `${Number(value) > 0 ? "+" : ""}${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const side = (row: Row) => String(row.option_type ?? "").toUpperCase();
const chartSide = (pane: ChartPane) => {
  const symbol = String(pane.identity.tradingsymbol ?? "").toUpperCase();
  return symbol.endsWith("CE") ? "CE" : symbol.endsWith("PE") ? "PE" : "UNDERLYING";
};
const latest = (rows: Row[]) => rows.filter((row) => row.closed === true).at(-1);
const exactAt = (rows: Row[], selectedTime: number | null) => selectedTime == null ? latest(rows) : rows.find((row) => row.closed === true && intervalBarChartTime(row) === selectedTime);
const chartQuery = (symbol: string, asOf: string, expiry: string, ceStrike: string, peStrike: string, interval: number) => {
  // Retain enough canonical history for indicator warm-up and sparse OI snapshot
  // capture. The visible chart still slices to the explicitly selected session.
  const query = new URLSearchParams({ symbol, interval: String(interval), historyDays: "15" });
  if (asOf) query.set("asOf", asOf);
  return applyScalperLegsToChartQuery(query, expiry, { ceStrike, peStrike });
};
const chartKey = (query: URLSearchParams) => ["trading-analytics-charts", query.toString()] as const;
const signClass = (value: unknown) => numeric(value) == null || numeric(value) === 0 ? undefined : numeric(value)! > 0 ? css.positive : css.negative;
const legSpread = (row: Row | undefined) => {
  const bid = numeric(row?.bid_price), ask = numeric(row?.ask_price);
  return bid == null || ask == null || ask < bid ? null : ask - bid;
};
const istClock = (value: number) => new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false,
}).format(new Date(value));
const percent = (value: unknown) => numeric(value) == null ? "—" : `${Number(value) > 0 ? "+" : ""}${number(value)}%`;
const RefreshStamp = ({ at }: { at: number }) => <small className={css.refreshStamp}>{scalperV2RefreshClock(at)}</small>;

function ChartActions({ title, onExpand, onInfo }: { title: string; onExpand: () => void; onInfo?: () => void }) {
  return <span className={css.chartActions}>
    {onInfo && <button type="button" className={css.infoButton} aria-label={`Show ${title} calculation`} title={`Show ${title} calculation`} onClick={onInfo}>i</button>}
    <button type="button" className={css.expandButton} aria-label={`Expand ${title}`} title={`Expand ${title}`} onClick={onExpand}>⛶</button>
  </span>;
}

function ChartOverlay({ title, option, onClose }: { title: string; option: EChartsOption; onClose: () => void }) {
  return <div className={css.chartOverlay} role="dialog" aria-modal="true" aria-label={`${title} expanded chart`} data-testid="v2-expanded-chart">
    <header><h2>{title}</h2><button type="button" autoFocus onClick={onClose} aria-label={`Close ${title}`}>Close ×</button></header>
    <Suspense fallback={<p>Loading expanded chart…</p>}><Chart className={css.expandedChart} ariaLabel={`${title} expanded`} axisExtentPolicy="native" option={scalperV2ExpandedOption(option)} /></Suspense>
  </div>;
}

function ChartInfoOverlay({ kind, onClose }: { kind: ChartInfoId; onClose: () => void }) {
  const structure = kind === "strike-structure";
  return <div className={css.infoOverlay} role="dialog" aria-modal="true" aria-label={`${structure ? "Strike structure" : "Positioning heatmap"} calculation`} data-testid="v2-chart-calculation">
    <section><header><h2>{structure ? "Strike structure calculation" : "Strike × time positioning calculation"}</h2><button type="button" autoFocus onClick={onClose}>Close ×</button></header>
      {structure ? <>
        <p>Each strike keeps CE and PE separate. Bars are current OI; signed ΔOI is the current observation minus its comparable source baseline; the premium marker is <code>100 × (current premium / first observed session premium − 1)</code>.</p>
        <p>Regime uses premium direction and signed ΔOI: price↑/OI↑ long buildup; price↓/OI↑ short buildup; price↑/OI↓ short covering; price↓/OI↓ long unwinding. Missing inputs remain unavailable. CE/PE ranks are calculated before viewport filtering.</p>
      </> : <>
        <p>Rows are exact CE/PE strikes and columns are retained 5m or 15m timestamps. For each side and timestamp: <code>ΔOI share = signed ΔOI / Σ|ΔOI|</code>; premium is clamped from <code>return % / 5</code> to −1…+1; volume pressure is <code>sign(premium return) × volume share</code>; depth is <code>(buy − sell) / (buy + sell)</code>. Pressure is 100 times the arithmetic mean of the available components, and the cell states how many of the four existed.</p>
        <p>The diverging colour scale is centred on zero. Missing components are omitted, not replaced with zero, and CE/PE identity remains in the row label rather than changing gain/loss colour.</p>
      </>}
    </section>
  </div>;
}

function Snapshot({ name, row }: { name: string; row: Row | undefined }) {
  const ema = numeric(row?.ema9), close = numeric(row?.close), distance = ema == null || close == null ? null : close - ema;
  return <section className={css.instrumentSnapshot}><h3>{name}</h3><div className={css.valueGrid}>{[
    ["Open", row?.open], ["High", row?.high], ["Low", row?.low], ["Close", row?.close], ["EMA9", row?.ema9], ["C − EMA", distance],
  ].map(([label, value]) => <div key={String(label)}><small>{String(label)}</small><strong className={label === "C − EMA" ? signClass(value) : undefined}>{label === "C − EMA" ? signed(value) : number(value)}</strong></div>)}</div>
    <p className={css.snapshotMeta}>{row ? `Candle ${String(row.start ?? "—")} → ${String(row.end)} · completed` : "No exact completed candle at this time"}</p></section>;
}

function UnderlyingLevelGauge({ payload, strikes }: { payload: ScalperV2ReferenceLevelPayload; strikes: number[] }) {
  const gauge = scalperV2ReferenceGauge(payload.levels, strikes);
  const current = payload.levels.find((level) => level.id === "current");
  if (gauge.low == null || gauge.high == null) return null;
  const currentPoint = gauge.points.find((point) => point.id === "current");
  const trackWidth = Math.max(720, gauge.strikes.length * 54);
  return <section className={css.levelGauge} data-testid="v2-underlying-level-gauge" aria-label="Underlying daily weekly monthly and rolling reference tracker">
    <header><strong>30-session underlying range</strong><span>{payload.sessionDate} · every available expiry strike is marked</span></header>
    <div className={css.levelGaugeBody}>
      <div className={css.levelGaugeCurrent}><small>Current</small><strong>{number(current?.value)}</strong><span>{payload.sessionDate}</span></div>
      <div className={css.levelGaugeViewport}>
        <div className={css.levelGaugePlot} style={{ minWidth: `${trackWidth}px` }} role="img" aria-label={`30-session underlying scale from ${number(gauge.low)} to ${number(gauge.high)} with ${gauge.strikes.length} strike ticks`} data-range-low={gauge.low} data-range-high={gauge.high} data-strike-count={gauge.strikes.length}>
          <i className={css.levelGaugeLine} />
          {currentPoint && <i className={css.levelGaugeProgress} style={{ width: `${currentPoint.position}%` }} />}
          <span className={css.levelGaugeBoundary} style={{ left: 0 }}><b>30D LOW</b><strong>{number(gauge.low)}</strong></span>
          <span className={css.levelGaugeBoundary} style={{ left: "100%" }}><b>30D HIGH</b><strong>{number(gauge.high)}</strong></span>
          {gauge.strikes.map((strike) => <span key={strike.value} className={css.levelGaugeStrike} data-testid="v2-reference-strike-tick" style={{ left: `${strike.position}%` }} title={`Strike ${number(strike.value)}`}><i /><b>{number(strike.value)}</b></span>)}
          {gauge.points.filter((point) => !point.id.startsWith("thirty-day")).map((point) => <span key={point.id} className={css.levelGaugeMarker} data-current={point.id === "current" || undefined} data-period={point.id.includes("month") ? "month" : point.id.includes("week") ? "week" : point.id.includes("day") || point.id === "today-open" ? "day" : "range"} style={{ left: `${point.position}%` }} title={`${point.label}: ${number(point.value)} · ${point.sourceDate ?? "date unavailable"}`}><i /><b>{point.shortLabel}</b></span>)}
        </div>
      </div>
    </div>
    <div className={css.levelGaugeValues}>{payload.levels.filter((point) => point.id !== "current").map((point) => <span key={point.id} title={`${point.label} · ${point.sourceDate ?? "date unavailable"}`}><b>{point.shortLabel}</b><strong>{number(point.value)}</strong></span>)}</div>
  </section>;
}

function DrawingEditor({ drawing, onApply }: { drawing: ScalperV2Drawing; onApply: (changes: Partial<ScalperV2Drawing>) => void }) {
  const [anchors, setAnchors] = useState(() => drawing.anchors.map((anchor) => ({ time: String(anchor.time), price: String(anchor.price) })));
  const [color, setColor] = useState(drawing.style.color), [lineWidth, setLineWidth] = useState(drawing.style.lineWidth);
  const [lineStyle, setLineStyle] = useState(drawing.style.lineStyle), [text, setText] = useState(drawing.text), [error, setError] = useState("");
  const apply = () => {
    const parsed = anchors.map((anchor) => ({ time: Number(anchor.time), price: Number(anchor.price) }));
    if (!parsed.every((anchor) => Number.isFinite(anchor.time) && Number.isFinite(anchor.price))) { setError("Every UTC second and price must be numeric."); return; }
    if (parsed.length > 1 && parsed[0].time === parsed[1].time && parsed[0].price === parsed[1].price) { setError("The first two anchors must be different."); return; }
    setError(""); onApply({ anchors: parsed, style: { ...drawing.style, color, lineWidth, lineStyle }, text });
  };
  return <fieldset className={css.drawingEditor}><legend>Coordinates and style</legend>
    <p>Market anchors use UTC epoch seconds and this pane&apos;s own price scale.</p>
    {anchors.map((anchor, index) => <div className={css.anchorEditor} key={index}><b>{String.fromCharCode(65 + index)}</b><label>UTC second <input aria-label={`Anchor ${index + 1} UTC second`} inputMode="numeric" value={anchor.time} onChange={(event) => setAnchors((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, time: event.target.value } : row))} /></label><label>Price <input aria-label={`Anchor ${index + 1} price`} inputMode="decimal" value={anchor.price} onChange={(event) => setAnchors((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, price: event.target.value } : row))} /></label></div>)}
    <label>Colour <input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
    <label>Width <select value={lineWidth} onChange={(event) => setLineWidth(Number(event.target.value) as 1 | 2 | 3 | 4)}>{[1, 2, 3, 4].map((width) => <option key={width}>{width}</option>)}</select></label>
    <label>Line <select value={lineStyle} onChange={(event) => setLineStyle(event.target.value as "solid" | "dashed" | "dotted")}><option>solid</option><option>dashed</option><option>dotted</option></select></label>
    <label>Label <input value={text} onChange={(event) => setText(event.target.value)} /></label>
    {error && <p role="alert" className={css.editorError}>{error}</p>}
    <button type="button" onClick={apply}>Apply coordinates and style</button>
  </fieldset>;
}

export function TradingAnalyticsScalperV2({ symbol, label, asOf, expiry, strikes, spot, legs, metricLegs = [], state, errors = [], referenceLevels, layout = "v2" }: {
  symbol: string; label: string; asOf: string; expiry: string; strikes: number[]; spot: number | null;
  legs: Row[]; metricLegs?: Row[]; state: string; errors?: Row[]; referenceLevels?: ScalperV2ReferenceLevelPayload; layout?: "v2" | "v3";
}) {
  const [params, setParams] = useSearchParams();
  const isV3 = layout === "v3", viewId = isV3 ? "scalper_v3" : "scalper_v2";
  const isPopout = params.get("popout") === viewId;
  const mwhd = useMwhdRankings();
  const selectedDayParam = params.get("day");
  const interval = [1, 5, 15, 60].includes(Number(params.get("interval"))) ? Number(params.get("interval")) : 5;
  const defaultStrike = nearestScalperStrike(strikes, spot);
  const { ceStrike: selectedCeStrike, peStrike: selectedPeStrike } = scalperLegSelection(params, defaultStrike);
  // Live requests let the server resolve now. A changing response timestamp must
  // never create a new cache entry and unmount the three native charts.
  const replayAsOf = params.get("asOf") ?? "";
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>("overview");
  const query = chartQuery(symbol, replayAsOf, expiry, selectedCeStrike, selectedPeStrike, interval);
  const active = useQuery({
    queryKey: chartKey(query),
    queryFn: ({ signal }) => getJson<ChartPayload>(`/v1/trading-analytics/charts?${query}`, signal),
    staleTime: 10_000,
    refetchInterval: replayAsOf ? false : SCALPER_V2_PRICE_REFRESH_MS,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const optionPriceHistory = useQuery({
    queryKey: ["trading-analytics-option-price-history", symbol, expiry, replayAsOf, interval === 15 ? 15 : 5],
    queryFn: ({ signal }) => getJson<OptionPriceHistoryPayload>(`/v1/trading-analytics/option-price-history?${new URLSearchParams({ symbol, expiry, ...(replayAsOf ? { asOf: replayAsOf } : {}), historyDays: "3", interval: String(interval === 15 ? 15 : 5) })}`, signal),
    enabled: Boolean(expiry),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    refetchInterval: params.has("asOf") ? false : SCALPER_V2_OPTION_HISTORY_REFRESH_MS,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  useEffect(() => {
    if (!active.data || (selectedCeStrike && selectedPeStrike)) return;
    const ceStrike = selectedCeStrike || String(nearestScalperStrike(availableScalperStrikes(active.data.availableContracts, expiry, "CE"), spot) ?? "");
    const peStrike = selectedPeStrike || String(nearestScalperStrike(availableScalperStrikes(active.data.availableContracts, expiry, "PE"), spot) ?? "");
    if (ceStrike && peStrike) setParams(setScalperLegSelection(params, { ceStrike, peStrike }), { replace: true });
  }, [active.data, expiry, params, selectedCeStrike, selectedPeStrike, setParams, spot]);

  const [hoverCrosshair, setHoverCrosshair] = useState<ScalperV2Crosshair>(null);
  const cursorCoordinator = useMemo(() => new ScalperV2CursorCoordinator(), []);
  const [lockedTime, setLockedTime] = useState<number | null>(null);
  const [linkedRange, setLinkedRange] = useState<ScalperV2TimeRange>(null);
  const [hoveredStrike, setHoveredStrike] = useState<number | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [horizontalView, setHorizontalView] = useState<ScalperV2HorizontalView>("day");
  const [verticalView, setVerticalView] = useState<ScalperV2VerticalView>("session"), [yLocked, setYLocked] = useState(false);
  const [railOpen, setRailOpen] = useState(!isV3), [railTab, setRailTab] = useState<RailTab>("time");
  const [v3RightOpen, setV3RightOpen] = useState(() => !isV3 || typeof window === "undefined" || window.localStorage.getItem("n50.scalper-v3.right") !== "closed");
  const [v3BottomOpen, setV3BottomOpen] = useState(() => !isV3 || typeof window === "undefined" || window.localStorage.getItem("n50.scalper-v3.bottom") !== "closed");
  const [v3BottomHeight, setV3BottomHeight] = useState(() => { const saved = typeof window === "undefined" ? NaN : Number(window.localStorage.getItem("n50.scalper-v3.bottom-height")); return isV3 && Number.isFinite(saved) && saved >= 150 && saved <= 320 ? saved : 180; });
  const [v3LinkTime, setV3LinkTime] = useState(() => !isV3 || typeof window === "undefined" || window.localStorage.getItem("n50.scalper-v3.link-time") !== "false");
  const [v3LinkStrike, setV3LinkStrike] = useState(() => !isV3 || typeof window === "undefined" || window.localStorage.getItem("n50.scalper-v3.link-strike") !== "false");
  const [v3PinnedStrike, setV3PinnedStrike] = useState<number | null>(null);
  const [v3InspectorExpanded, setV3InspectorExpanded] = useState(false);
  const [v3CursorSnap, setV3CursorSnap] = useState<V3CursorSnap>("candle");
  const [v3FollowLive, setV3FollowLive] = useState(true);
  const [v3LayoutPreset, setV3LayoutPreset] = useState<V3LayoutPreset>(() => (typeof window !== "undefined" ? window.localStorage.getItem("n50.scalper-v3.layout") as V3LayoutPreset : null) || "trading");
  const [v3Density, setV3Density] = useState<V3Density>(() => (typeof window !== "undefined" ? window.localStorage.getItem("n50.scalper-v3.density") as V3Density : null) || "standard");
  const [v3RangeDisplay, setV3RangeDisplay] = useState<V3RangeDisplay>("context");
  const [v3HeatmapFixed, setV3HeatmapFixed] = useState(true);
  const [v3HelpOpen, setV3HelpOpen] = useState(false);
  const [v3ShowEma, setV3ShowEma] = useState(true);
  const [v3ShowVolumeEma, setV3ShowVolumeEma] = useState(true);
  const [v3ShowSignals, setV3ShowSignals] = useState(true);
  const [v3ShowReferences, setV3ShowReferences] = useState(true);
  const [v3Clock, setV3Clock] = useState(() => Date.now());
  const [v3CompareA, setV3CompareA] = useState<number | null>(null);
  const [v3CompareB, setV3CompareB] = useState<number | null>(null);
  const [v3ComparisonReference, setV3ComparisonReference] = useState<ScalperV3ComparisonReference>("pinned");
  const [v3WhatChanged, setV3WhatChanged] = useState(false);
  const [v3AtmShift, setV3AtmShift] = useState<{ from: number; to: number } | null>(null);
  const [v3PulseStrikeIndices, setV3PulseStrikeIndices] = useState<number[]>([]);
  const [measureMode, setMeasureMode] = useState(false), [points, setPoints] = useState<string[]>([]), [quantity, setQuantity] = useState("65");
  const [measurementContext, setMeasurementContext] = useState<{ panes: ChartPane[]; interval: number; symbol: string; expiry: string; ceStrike: string; peStrike: string } | null>(null);
  const [drawingTool, setDrawingTool] = useState<ScalperV2DrawingTool>("select");
  const [profileRangeExpanded, setProfileRangeExpanded] = useState(false);
  const [priceMode, setPriceMode] = useState<ScalperV2PriceMode>("return");
  const [showAllPriceSeries, setShowAllPriceSeries] = useState(false);
  const [expandedChart, setExpandedChart] = useState<ExpandableChartId | null>(null);
  const [v3MaximizedPrice, setV3MaximizedPrice] = useState<"underlying" | "call" | "put" | null>(null);
  const [chartInfo, setChartInfo] = useState<ChartInfoId | null>(null);
  const latestDayRef = useRef<string | null>(null);
  const completedCandleSignatureRef = useRef<string | null>(null);
  const fitDayBudgetRef = useRef<{ key: string; slots: number | null }>({ key: "", slots: null });
  const v3ShiftDownRef = useRef(false);
  const v3PreviousAtmRef = useRef<number | null>(null);
  const v3PreviousStrikeValuesRef = useRef<Map<number, string>>(new Map());
  const drawingStore = useScalperV2Drawings(symbol);
  const drawingSelectedId = drawingStore.selectedId, removeDrawing = drawingStore.remove;
  const inspectionMode: ScalperV2InspectionMode = lockedTime != null ? "locked" : hoverCrosshair ? "hover" : "latest";
  const inspectionTime = lockedTime ?? hoverCrosshair?.time ?? null;
  const crosshair = lockedTime == null ? hoverCrosshair : { time: lockedTime, source: "locked", sequence: lockedTime };
  useEffect(() => { if (!isV3 || typeof window === "undefined") return; window.localStorage.setItem("n50.scalper-v3.right", v3RightOpen ? "open" : "closed"); window.localStorage.setItem("n50.scalper-v3.bottom", v3BottomOpen ? "open" : "closed"); window.localStorage.setItem("n50.scalper-v3.bottom-height", String(v3BottomHeight)); window.localStorage.setItem("n50.scalper-v3.link-time", String(v3LinkTime)); window.localStorage.setItem("n50.scalper-v3.link-strike", String(v3LinkStrike)); window.localStorage.setItem("n50.scalper-v3.layout", v3LayoutPreset); window.localStorage.setItem("n50.scalper-v3.density", v3Density); }, [isV3, v3BottomHeight, v3BottomOpen, v3Density, v3LayoutPreset, v3LinkStrike, v3LinkTime, v3RightOpen]);

  useEffect(() => {
    if (!isV3) return;
    const update = () => setV3Clock(Date.now());
    const timer = window.setInterval(update, 5_000);
    const down = (event: KeyboardEvent) => { if (event.key === "Shift") v3ShiftDownRef.current = true; };
    const up = (event: KeyboardEvent) => { if (event.key === "Shift") v3ShiftDownRef.current = false; };
    const blur = () => { v3ShiftDownRef.current = false; };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.clearInterval(timer); window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [isV3]);

  useEffect(() => {
    const clear = (event: KeyboardEvent) => {
      const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
      if (event.key === "Escape") { setExpandedChart(null); setV3MaximizedPrice(null); setChartInfo(null); setLockedTime(null); setHoverCrosshair(null); setV3PinnedStrike(null); setV3CompareA(null); setV3CompareB(null); setV3HelpOpen(false); setV3WhatChanged(false); setDrawingTool("select"); }
      if (isV3 && !editing && event.key === "1") setV3MaximizedPrice("underlying");
      if (isV3 && !editing && event.key === "2") setV3MaximizedPrice("call");
      if (isV3 && !editing && event.key === "3") setV3MaximizedPrice("put");
      if (isV3 && !editing && event.key.toLowerCase() === "b") setV3BottomOpen((value) => !value);
      if (isV3 && !editing && event.key.toLowerCase() === "k") setLockedTime((current) => current == null ? hoverCrosshair?.time ?? null : null);
      if (isV3 && !editing && event.key.toLowerCase() === "l") { setV3FollowLive(true); setHorizontalView("day"); setLinkedRange(null); setFitRequest((value) => value + 1); }
      if (isV3 && !editing && event.key === "?") setV3HelpOpen((value) => !value);
      if ((event.key === "Delete" || event.key === "Backspace") && drawingSelectedId && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) removeDrawing(drawingSelectedId);
    };
    window.addEventListener("keydown", clear); return () => window.removeEventListener("keydown", clear);
  }, [drawingSelectedId, hoverCrosshair?.time, isV3, removeDrawing]);
  useEffect(() => { setFitRequest((value) => value + 1); setVerticalView("session"); setProfileRangeExpanded(false); setYLocked(false); setLockedTime(null); setHoverCrosshair(null); }, [symbol, expiry, selectedCeStrike, selectedPeStrike, interval, selectedDayParam]);

  const activeData = active.data;
  const rawPanes = useMemo(() => activeData?.panes ?? [], [activeData]);
  const days = useMemo(() => [...new Set((rawPanes[0]?.bars ?? []).map((row) => istDay(row.end)).filter(Boolean))].sort().reverse(), [rawPanes]);
  const latestAvailableDay = days[0] ?? "";
  const tradingDay = selectedDayParam && days.includes(selectedDayParam) ? selectedDayParam : (days[0] ?? "");
  const activeReferenceLevels = useMemo(
    () => referenceLevels?.sessionDate === tradingDay ? referenceLevels.levels : [],
    [referenceLevels, tradingDay],
  );
  const panes = useMemo(() => rawPanes.map((pane) => ({ ...pane, bars: dayRows(pane.bars, tradingDay, "end"), oiHistory: dayRows(pane.oiHistory, tradingDay, "event_time") })), [rawPanes, tradingDay]);
  const completedCandleSignature = useMemo(() => scalperV2CompletedCandleSignature(panes), [panes]);
  useEffect(() => {
    const previousLatestDay = latestDayRef.current;
    latestDayRef.current = latestAvailableDay || null;
    if (!shouldFollowScalperV2TradingDay({ historical: Boolean(replayAsOf), selectedDay: selectedDayParam, previousLatestDay, latestDay: latestAvailableDay })) return;
    const next = new URLSearchParams(params);
    next.set("day", latestAvailableDay);
    setParams(next, { replace: true });
  }, [latestAvailableDay, params, replayAsOf, selectedDayParam, setParams]);
  useEffect(() => {
    if (!completedCandleSignature) return;
    const previousSignature = completedCandleSignatureRef.current;
    completedCandleSignatureRef.current = completedCandleSignature;
    if ((!isV3 || v3FollowLive) && shouldRefitScalperV2Day({ historical: Boolean(replayAsOf), horizontalView, previousSignature, nextSignature: completedCandleSignature })) setFitRequest((value) => value + 1);
  }, [completedCandleSignature, horizontalView, isV3, replayAsOf, v3FollowLive]);
  const underlying = panes.find((pane) => chartSide(pane) === "UNDERLYING"), call = panes.find((pane) => chartSide(pane) === "CE"), put = panes.find((pane) => chartSide(pane) === "PE");
  const rawUnderlying = rawPanes.find((pane) => chartSide(pane) === "UNDERLYING");
  const callLeg = legs.find((leg) => String(leg.strike) === selectedCeStrike && side(leg) === "CE");
  const putLeg = legs.find((leg) => String(leg.strike) === selectedPeStrike && side(leg) === "PE");
  const selectedCeIsAtm = defaultStrike != null && Number(selectedCeStrike) === defaultStrike;
  const selectedPeIsAtm = defaultStrike != null && Number(selectedPeStrike) === defaultStrike;
  const availableRows = activeData?.availableContracts ?? [];
  const ceStrikes = availableScalperStrikes(availableRows, expiry, "CE");
  const peStrikes = availableScalperStrikes(availableRows, expiry, "PE");
  const selectableCeStrikes = [...new Set([...(ceStrikes.length ? ceStrikes : strikes), Number(selectedCeStrike)])].filter(Number.isFinite).sort((a, b) => a - b);
  const selectablePeStrikes = [...new Set([...(peStrikes.length ? peStrikes : strikes), Number(selectedPeStrike)])].filter(Number.isFinite).sort((a, b) => a - b);
  const rankSource = metricLegs.length ? metricLegs : legs;
  const leaders = useMemo(() => rankCurrentOi(rankSource), [rankSource]);
  const maxPain = useMemo(() => maxPainDistribution(rankSource), [rankSource]);
  const pcr = useMemo(() => oiPcr(rankSource), [rankSource]);
  const indicators = useMemo(() => scalperIndicators(rawUnderlying?.bars ?? []), [rawUnderlying]);
  const signals = useMemo(() => scalperPairedBody70Signals(panes, interval), [panes, interval]);
  const potentialEmaSignals = useMemo(() => scalperV2EmaAlignmentSignals(panes, interval), [panes, interval]);
  const potentialEmaAvailability = useMemo(() => scalperV2EmaAlignmentAvailability(panes, interval), [panes, interval]);
  const measurement = useMemo(() => points.length === 2 ? measurePanes(measurementContext?.panes ?? panes, points[0], points[1], Number(quantity)) : null, [measurementContext, panes, points, quantity]);
  const inspectedRows = [underlying, call, put].map((pane) => exactAt(pane?.bars ?? [], inspectionTime));
  const measurementOptions = useMemo(() => {
    const sets = [underlying, call, put].map((pane) => new Set((pane?.bars ?? []).filter((row) => row.closed === true).map((row) => String(row.end))));
    return [...(sets[0] ?? new Set<string>())].filter((time) => sets.slice(1).every((values) => values.has(time))).sort();
  }, [call, put, underlying]);
  const contextRows = useMemo(() => rankSource.map((row) => ({ ...row, ranking_scope: metricLegs.length ? "Observed retained cohort" : "Nearest paired observed window", analysis_as_of: asOf })), [asOf, metricLegs.length, rankSource]);
  const strikeRows = useMemo(() => [...new Set(rankSource.map((row) => numeric(row.strike)).filter((value): value is number => value != null))].sort((a, b) => a - b), [rankSource]);
  const nearestSpotStrike = spot == null || strikeRows.length === 0 ? null : [...strikeRows].sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot))[0];
  const profileModel = useMemo(() => normalizeScalperV2ProfileRows(rankSource, legs), [legs, rankSource]);
  const profileRows = profileModel.rows;
  // Request time can be Saturday while the latest real observation is Friday.
  // Never label the request cutoff as the snapshot's source date.
  const snapshotDays = [...new Set(profileRows.map((row) => istDay(row.currentAt)).filter(Boolean))].sort();
  const differentSnapshotDay = Boolean(tradingDay && snapshotDays.some((day) => day !== tradingDay));
  const deltaBasisLabel = `${profileBaselineLabel(profileModel.baselineKind)} ΔOI`;
  const { ceCurrent, peCurrent, ceChanges, peChanges } = useMemo(() => {
    const currentSeries = (wanted: "CE" | "PE") => strikeRows.map((strike) => profileRows.find((row) => row.side === wanted && row.strike === strike)?.currentOi ?? null);
    const changeSeries = (wanted: "CE" | "PE") => strikeRows.map((strike) => profileRows.find((row) => row.side === wanted && row.strike === strike)?.changeOi ?? null);
    return { ceCurrent: currentSeries("CE"), peCurrent: currentSeries("PE"), ceChanges: changeSeries("CE"), peChanges: changeSeries("PE") };
  }, [profileRows, rankSource, strikeRows]);
  const deltaState = useMemo(() => oiComparisonState(
    profileRows.map((row) => row.currentOi),
    profileRows.map((row) => row.state === "comparable" ? row.baselineOi : null),
  ), [profileRows]);
  const deltaMaximum = Math.max(0, ...[...ceChanges, ...peChanges].flatMap((value) => value == null ? [] : [Math.abs(value)]));
  const profileComparable = profileRows.filter((row) => row.state === "comparable").length;
  const positioningPoints = useMemo(
    () => (optionPriceHistory.data?.points ?? []).filter((point) => istDay(point.capturedAt) === tradingDay),
    [optionPriceHistory.data?.points, tradingDay],
  );
  const positioningModel = useMemo(() => scalperV2PositioningModel(positioningPoints), [positioningPoints]);
  const latestPositioning = useMemo(() => {
    const byContract = new Map<string, (typeof positioningModel.cells)[number]>();
    positioningModel.cells.forEach((cell) => byContract.set(`${cell.side}:${cell.strike}`, cell));
    return byContract;
  }, [positioningModel.cells]);
  const structureRows = useMemo(() => scalperV2StructureRows(rankSource, profileRows, leaders), [leaders, profileRows, rankSource]);
  const oiTotals = useMemo(() => scalperV2OiTotals(profileRows), [profileRows]);
  const cumulativeOiPoints = useMemo(
    () => (activeData?.cumulativeOiHistory?.points ?? []).filter((point) => istDay(point.capturedAt) === tradingDay),
    [activeData?.cumulativeOiHistory?.points, tradingDay],
  );
  const cumulativeOiComplete = cumulativeOiPoints.filter((point) => point.state === "COMPLETE").length;
  const cumulativeChangeComplete = cumulativeOiPoints.filter((point) => point.changeState === "COMPLETE").length;
  const cumulativeBaselineKinds = [...new Set(cumulativeOiPoints.map((point) => point.baselineKind).filter((value): value is string => Boolean(value)))];
  const cumulativeChangeBasis = cumulativeBaselineKinds.includes("PRE_SESSION_LAST_CAPTURE")
    ? cumulativeBaselineKinds.length > 1 ? "Source-specific baseline" : "Previous-session captured baseline"
    : "Reported baseline";
  const cumulativeStrikeCounts = [...new Set(cumulativeOiPoints.map((point) => point.strikeCount).filter((value): value is number => value != null))].sort((a, b) => a - b);
  const cumulativeLatest = cumulativeOiPoints.at(-1) ?? null;
  const directionalSignals = useMemo(
    () => scalperV2DirectionalOiEntries(panes, cumulativeOiPoints, activeReferenceLevels),
    [activeReferenceLevels, cumulativeOiPoints, panes],
  );
  const establishedSignals = useMemo(
    () => [...signals, ...directionalSignals].sort((left, right) => Date.parse(left.setupTime) - Date.parse(right.setupTime)),
    [directionalSignals, signals],
  );
  const chartSignals = useMemo(
    () => [...establishedSignals, ...potentialEmaSignals].sort((left, right) => Date.parse(left.setupTime) - Date.parse(right.setupTime)),
    [establishedSignals, potentialEmaSignals],
  );
  // A potential reference is a three-instrument observation, so its yellow
  // star belongs on all three panes. Existing direction-specific references
  // retain their original CE-only / PE-only presentation.
  const callSignals = useMemo(() => [
    ...establishedSignals.filter((signal) => signal.direction === "CALL"),
    ...potentialEmaSignals,
  ].sort((left, right) => Date.parse(left.setupTime) - Date.parse(right.setupTime)), [establishedSignals, potentialEmaSignals]);
  const putSignals = useMemo(() => [
    ...establishedSignals.filter((signal) => signal.direction === "PUT"),
    ...potentialEmaSignals,
  ].sort((left, right) => Date.parse(left.setupTime) - Date.parse(right.setupTime)), [establishedSignals, potentialEmaSignals]);
  useEffect(() => {
    if (typeof window === "undefined" || replayAsOf || interval !== 5 || tradingDay !== istDay(new Date().toISOString())) return;
    if (window.localStorage.getItem("n50.paper-alert-voice") !== "speak" || !("speechSynthesis" in window)) return;
    const now = Date.now();
    const recent = potentialEmaSignals.filter((signal) => {
      const age = now - Date.parse(signal.setupTime);
      return age >= 0 && age <= 10 * 60_000;
    });
    if (!recent.length) return;
    const storageKey = "n50.scalper-v2-ema-reference-spoken";
    let spoken: string[] = [];
    try { spoken = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]"); } catch { spoken = []; }
    const known = new Set(spoken);
    const fresh = recent.filter((signal) => !known.has(signal.id));
    if (!fresh.length) return;
    fresh.forEach((signal) => {
      const utterance = new SpeechSynthesisUtterance(scalperV2EmaAlignmentSpeech(signal, symbol));
      utterance.lang = "en-IN";
      utterance.rate = 0.96;
      utterance.volume = 0.9;
      window.speechSynthesis.speak(utterance);
      known.add(signal.id);
    });
    window.localStorage.setItem(storageKey, JSON.stringify([...known].slice(-100)));
  }, [interval, potentialEmaSignals, replayAsOf, symbol, tradingDay]);
  const sessionTimes = useMemo(() => (underlying?.bars ?? []).flatMap((bar) => {
    const value = intervalBarChartTime(bar);
    return value == null ? [] : [Number(value) * 1000];
  }).sort((left, right) => left - right), [underlying?.bars]);
  const selectedSession = activeData?.calendar?.sessions.find((session) => session.trade_date === tradingDay);
  const fitDayStartTimeMs = selectedSession ? Date.parse(selectedSession.market_open_ts) : Number.NaN;
  const fitDayCloseTimeMs = selectedSession ? Date.parse(selectedSession.market_close_ts) : Number.NaN;
  const fitDaySessionSlotCount = selectedSession ? scalperV2SessionSlotCount(selectedSession.market_open_ts, selectedSession.market_close_ts, interval) : null;
  const latestSessionEndMs = (underlying?.bars ?? []).reduce((latestEnd, bar) => {
    if (bar.closed !== true) return latestEnd;
    const end = Date.parse(String(bar.end ?? ""));
    return Number.isFinite(end) && end > fitDayStartTimeMs && end <= fitDayCloseTimeMs ? Math.max(latestEnd, end) : latestEnd;
  }, Number.NEGATIVE_INFINITY);
  const observedFitSlots = Number.isFinite(fitDayStartTimeMs) && Number.isFinite(latestSessionEndMs)
    ? Math.ceil((latestSessionEndMs - fitDayStartTimeMs) / (interval * 60_000))
    : 0;
  const fitDayBudgetKey = `${tradingDay}:${interval}:${fitDayStartTimeMs}:${fitDaySessionSlotCount}`;
  if (fitDayBudgetRef.current.key !== fitDayBudgetKey) fitDayBudgetRef.current = { key: fitDayBudgetKey, slots: null };
  fitDayBudgetRef.current.slots = fitDaySessionSlotCount == null
    ? null
    : scalperV2StableFitSlotBudget(observedFitSlots, fitDaySessionSlotCount, interval, fitDayBudgetRef.current.slots);
  const fitDaySlotCount = fitDayBudgetRef.current.slots;
  const dayOpenMs = selectedSession && Number.isFinite(Date.parse(selectedSession.market_open_ts))
    ? Date.parse(selectedSession.market_open_ts)
    : sessionTimes[0] ?? null;
  const sharedTimeDomain = useMemo(() => {
    if (linkedRange?.from != null && linkedRange?.to != null) return { from: linkedRange.from * 1000, to: linkedRange.to * 1000 };
    return sessionTimes.length ? { from: sessionTimes[0], to: sessionTimes.at(-1)! } : undefined;
  }, [linkedRange, sessionTimes]);
  const cumulativeOiOption = useMemo<EChartsOption>(() => ({
    animation: false,
    tooltip: { trigger: "axis" },
    legend: { data: ["CE Total OI", "PE Total OI"], top: 2 },
    grid: { left: 72, right: 24, top: 42, bottom: 52 },
    xAxis: {
      type: "time",
      min: sharedTimeDomain?.from,
      max: sharedTimeDomain?.to,
      name: "Timestamp · IST",
      nameGap: 30,
      axisLabel: { formatter: (value: number) => istClock(value) },
    },
    yAxis: {
      type: "value",
      min: 0,
      name: "Total OI",
      axisLabel: { formatter: formatOiAxisValue },
    },
    series: [
      {
        name: "CE Total OI",
        type: "line",
        data: cumulativeOiPoints.map((point) => [Date.parse(point.capturedAt), point.ceOi]),
        connectNulls: false,
        showSymbol: cumulativeOiPoints.length <= 1,
        symbolSize: 7,
        lineStyle: { color: "#eab308", width: 2 },
        itemStyle: { color: "#eab308" },
      },
      {
        name: "PE Total OI",
        type: "line",
        data: cumulativeOiPoints.map((point) => [Date.parse(point.capturedAt), point.peOi]),
        connectNulls: false,
        showSymbol: cumulativeOiPoints.length <= 1,
        symbolSize: 7,
        lineStyle: { color: "#2563eb", width: 2 },
        itemStyle: { color: "#2563eb" },
      },
    ],
  }), [cumulativeOiPoints, sharedTimeDomain]);
  const cumulativeDifferenceOption = useMemo<EChartsOption>(
    () => scalperV2OiDifferenceOption(cumulativeOiPoints, istClock, sharedTimeDomain, dayOpenMs),
    [cumulativeOiPoints, dayOpenMs, sharedTimeDomain],
  );
  const cumulativeOiDifferenceOnlyOption = useMemo<EChartsOption>(
    () => scalperV2OiMetricOption(cumulativeOiPoints, "oi", istClock, sharedTimeDomain, dayOpenMs),
    [cumulativeOiPoints, dayOpenMs, sharedTimeDomain],
  );
  const cumulativeChangeDifferenceOnlyOption = useMemo<EChartsOption>(
    () => scalperV2OiMetricOption(cumulativeOiPoints, "change", istClock, sharedTimeDomain, dayOpenMs),
    [cumulativeOiPoints, dayOpenMs, sharedTimeDomain],
  );
  const cumulativePcrOption = useMemo<EChartsOption>(
    () => scalperV2PcrTimeOption(cumulativeOiPoints, istClock, sharedTimeDomain),
    [cumulativeOiPoints, sharedTimeDomain],
  );
  const normalizedPriceModel = useMemo(() => scalperV2NormalizedPriceSeries(
    (optionPriceHistory.data?.points ?? []).filter((point) => istDay(point.capturedAt) === tradingDay),
    numeric(selectedCeStrike),
    numeric(selectedPeStrike),
    priceMode,
    defaultStrike,
    defaultStrike,
  ), [defaultStrike, optionPriceHistory.data?.points, priceMode, selectedCeStrike, selectedPeStrike, tradingDay]);
  const compactRangePriceModel = useMemo(() => scalperV2NormalizedPriceSeries(
    (optionPriceHistory.data?.points ?? []).filter((point) => istDay(point.capturedAt) === tradingDay),
    numeric(selectedCeStrike),
    numeric(selectedPeStrike),
    "range",
    defaultStrike,
    defaultStrike,
  ), [defaultStrike, optionPriceHistory.data?.points, selectedCeStrike, selectedPeStrike, tradingDay]);
  const compactRangeDisplayModel = useMemo(() => ({
    ...compactRangePriceModel,
    series: v3RangeDisplay === "all" ? compactRangePriceModel.series : visibleScalperV2PriceSeries(
      compactRangePriceModel.series,
      numeric(selectedCeStrike),
      numeric(selectedPeStrike),
      v3RangeDisplay === "current" ? [] : leaders.slice(0, 4).map((leader) => `${leader.side}:${leader.strike}`),
      false,
    ).filter((series) => v3RangeDisplay !== "current" || series.selected),
  }), [compactRangePriceModel, leaders, selectedCeStrike, selectedPeStrike, v3RangeDisplay]);
  const compactRangePriceOption = useMemo(
    () => scalperV2CompactRangePriceOption(isV3 ? compactRangeDisplayModel : compactRangePriceModel, istClock, sharedTimeDomain),
    [compactRangeDisplayModel, compactRangePriceModel, isV3, sharedTimeDomain],
  );
  const visiblePriceSeries = useMemo(() => visibleScalperV2PriceSeries(
    normalizedPriceModel.series,
    numeric(selectedCeStrike),
    numeric(selectedPeStrike),
    leaders.slice(0, 4).map((leader) => `${leader.side}:${leader.strike}`),
    showAllPriceSeries,
  ), [leaders, normalizedPriceModel.series, selectedCeStrike, selectedPeStrike, showAllPriceSeries]);
  const normalizedPriceOption = useMemo<EChartsOption>(() => ({
    animation: false,
    tooltip: {
      trigger: "axis",
      formatter: (input: unknown) => {
        const rows = (Array.isArray(input) ? input : [input]) as Array<{ axisValue?: unknown; seriesName?: string; data?: { value?: [number, number | null]; rawPrice?: number | null } }>;
        const time = Number(rows[0]?.data?.value?.[0] ?? rows[0]?.axisValue);
        const heading = Number.isFinite(time) ? new Date(time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) : "Timestamp unavailable";
        return [heading, ...rows.flatMap((row) => {
          const normalized = row.data?.value?.[1];
          const raw = row.data?.rawPrice;
          return normalized == null ? [] : [`${row.seriesName ?? "Series"}: ${normalized.toFixed(2)} · raw ${raw == null ? "—" : `₹${number(raw)}`}`];
        })].join("<br/>");
      },
    },
    legend: { data: visiblePriceSeries.map((series) => series.name), top: 2, type: "scroll" },
    grid: { left: 64, right: 24, top: 88, bottom: 70 },
    dataZoom: [{ type: "inside", xAxisIndex: 0 }, { type: "slider", xAxisIndex: 0, bottom: 10, height: 18 }],
    xAxis: { type: "time", min: sharedTimeDomain?.from, max: sharedTimeDomain?.to, name: "Timestamp · IST", nameGap: 42, axisLabel: { formatter: (value: number) => istClock(value) } },
      yAxis: { type: "value", min: priceMode === "range" ? -100 : undefined, max: priceMode === "range" ? 100 : undefined, interval: priceMode === "range" ? 50 : undefined, name: priceMode === "indexed" ? "Indexed to 100" : priceMode === "relative" ? "Relative to ATM %" : priceMode === "range" ? "Range normalised" : "Return from open %", axisLabel: { formatter: (value: number) => `${value > 0 ? "+" : ""}${value}` } },
    series: visiblePriceSeries.map((series, index) => ({
      id: series.id,
      name: series.name,
      type: "line",
      data: series.data,
      connectNulls: false,
      showSymbol: false,
      symbol: "none",
      lineStyle: { color: series.side === "CE" ? "#2563eb" : "#eab308", width: series.selected ? 3 : 1.35, opacity: series.opacity },
      itemStyle: { color: series.side === "CE" ? "#2563eb" : "#eab308", opacity: series.opacity },
      emphasis: { focus: "series", lineStyle: { width: 3, opacity: 1 } },
      z: series.selected ? 10 : 1,
      markLine: index === 0 ? { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: "#64748b", type: "dashed", width: 1 }, data: [{ yAxis: 0 }] } : undefined,
    })),
  }), [priceMode, sharedTimeDomain, visiblePriceSeries]);
  const optionPriceHeatmap = useMemo<EChartsOption>(() => {
    const rows = normalizedPriceModel.series;
    const labels = rows.map((series) => `${series.side} ${series.strike.toLocaleString("en-IN")}`);
    const timestamps = normalizedPriceModel.timestamps;
    const timestampIndex = new Map(timestamps.map((time, index) => [time, index]));
    const values = rows.flatMap((series, y) => series.data.flatMap((datum) => datum.returnPct == null ? [] : [{
      value: [timestampIndex.get(datum.value[0]) ?? 0, y, datum.returnPct], rawPrice: datum.rawPrice, timestamp: datum.value[0],
      itemStyle: series.selected ? { borderColor: series.side === "CE" ? "#2563eb" : "#8a6200", borderWidth: 2 } : undefined,
    }]));
    const maximum = Math.max(1, ...values.map((entry) => Math.abs(Number(entry.value[2]))));
    return {
      animation: false,
      tooltip: { formatter: (raw: unknown) => { const item = raw as { data?: { value?: number[]; rawPrice?: number | null; timestamp?: number } }; const value = item.data?.value; return value ? `${labels[value[1]]}<br/>${new Date(item.data?.timestamp ?? timestamps[value[0]]).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false })}<br/>Return ${value[2] >= 0 ? "+" : ""}${value[2].toFixed(2)}%<br/>Price ${price(item.data?.rawPrice)}` : "Unavailable"; } },
      grid: { left: 92, right: 28, top: 18, bottom: 52 },
      dataZoom: [{ type: "inside", xAxisIndex: 0 }, { type: "slider", xAxisIndex: 0, bottom: 8, height: 18 }],
      xAxis: { type: "category", data: timestamps.map(String), axisLabel: { formatter: (value: string) => istClock(Number(value)) } },
      yAxis: { type: "category", data: labels, axisLabel: { color: (value?: string | number) => String(value ?? "").startsWith("CE") ? "#1d4ed8" : "#785500", fontWeight: 650 } },
      visualMap: { min: -maximum, max: maximum, calculable: false, orient: "horizontal", left: "center", top: 0, show: false, inRange: { color: ["#b42336", "#f7f8fa", "#15803d"] } },
      series: [{ type: "heatmap", data: values, progressive: 5000, emphasis: { itemStyle: { borderColor: "#14243a", borderWidth: 2 } } }],
    };
  }, [normalizedPriceModel.series, normalizedPriceModel.timestamps]);
  const niftyCurrentGuide = useCallback((categoryIndex: number) => spot == null || nearestSpotStrike == null || categoryIndex < 0 ? undefined : ({
    silent: true,
    symbol: "none",
    lineStyle: { color: "#0f766e", type: "dotted" as const, width: 2 },
    label: {
      show: true,
      color: "#0f5f59",
      backgroundColor: "rgba(255,255,255,.92)",
      padding: [3, 5],
      formatter: `NIFTY current ${number(spot)}\nnearest strike ${nearestSpotStrike.toLocaleString("en-IN")}`,
    },
    // These are categorical strike axes. Use the category index while the
    // label retains the exact current value and nearest listed strike.
    data: [{ xAxis: categoryIndex }],
  }), [nearestSpotStrike, spot]);
  const payoutNiftyCurrentGuide = useMemo(
    () => niftyCurrentGuide(nearestSpotStrike == null ? -1 : maxPain.points.findIndex((point) => point.settlement === nearestSpotStrike)),
    [maxPain.points, nearestSpotStrike, niftyCurrentGuide],
  );
  const analyticOptions = useMemo<EChartsOption[]>(() => [
    scalperV2VerticalStrikeOption(strikeRows, ceCurrent, peCurrent, "oi", spot, nearestSpotStrike),
    scalperV2VerticalStrikeOption(strikeRows, ceChanges, peChanges, "change", spot, nearestSpotStrike),
    { tooltip: { trigger: "axis" }, legend: { data: ["Call payout", "Put payout", "Combined"] }, grid: { left: 72, right: 20, top: 42, bottom: 52 }, xAxis: { type: "category", data: maxPain.points.map((point) => point.settlement) }, yAxis: { type: "value", name: "Common-unit payout" }, series: [{ name: "Call payout", type: "line", data: maxPain.points.map((point) => point.callPayout), lineStyle: { color: "#2563eb" }, markLine: payoutNiftyCurrentGuide }, { name: "Put payout", type: "line", data: maxPain.points.map((point) => point.putPayout), lineStyle: { color: "#eab308" } }, { name: "Combined", type: "line", data: maxPain.points.map((point) => point.totalPayout), lineStyle: { color: "#14243a", width: 3 } }] },
  ], [ceChanges, ceCurrent, maxPain.points, nearestSpotStrike, payoutNiftyCurrentGuide, peChanges, peCurrent, spot, strikeRows]);
  const structureInput = useMemo(() => {
    const rows = (wanted: "CE" | "PE") => strikeRows.map((strike) => {
      const history = latestPositioning.get(`${wanted}:${strike}`);
      const snapshot = rankSource.find((row) => side(row) === wanted && numeric(row.strike) === strike);
      const lastPrice = numeric(snapshot?.last_price), dayOpen = numeric(snapshot?.day_open);
      return {
        oi: history?.oi ?? profileRows.find((row) => row.side === wanted && row.strike === strike)?.currentOi ?? null,
        changeOi: history?.changeOi ?? profileRows.find((row) => row.side === wanted && row.strike === strike)?.changeOi ?? null,
        premiumReturnPct: history?.premiumReturnPct ?? (lastPrice != null && dayOpen != null && dayOpen > 0 ? 100 * (lastPrice / dayOpen - 1) : null),
      };
    });
    return { calls: rows("CE"), puts: rows("PE") };
  }, [latestPositioning, profileRows, rankSource, strikeRows]);
  const strikeStructureOption = useMemo(() => scalperV2StrikeStructureOption(strikeRows, structureInput.calls, structureInput.puts, spot, nearestSpotStrike), [nearestSpotStrike, spot, strikeRows, structureInput]);
  const positioningHeatmapOption = useMemo(() => scalperV2PositioningHeatmapOption(positioningModel, istClock), [positioningModel]);
  const dockTooltip = useCallback((option: EChartsOption) => isV3 ? { ...option, tooltip: { show: false } } : option, [isV3]);
  const compactOiOption = useMemo(() => dockTooltip(scalperV2CompactSideOption(analyticOptions[0])), [analyticOptions, dockTooltip]);
  const compactDeltaOiOption = useMemo(() => dockTooltip(scalperV2CompactSideOption(analyticOptions[1])), [analyticOptions, dockTooltip]);
  const compactStrikeStructureOption = useMemo(() => dockTooltip(scalperV2CompactSideOption(strikeStructureOption)), [dockTooltip, strikeStructureOption]);
  const compactPositioningHeatmapOption = useMemo(() => {
    const compactOption = dockTooltip(scalperV2CompactSideOption(positioningHeatmapOption));
    if (!isV3 || v3HeatmapFixed) return compactOption;
    const maximum = Math.max(10, ...positioningModel.cells.map((cell) => Math.abs(cell.pressure ?? 0)));
    return { ...compactOption, visualMap: { ...(compactOption.visualMap as Record<string, unknown> ?? {}), min: -maximum, max: maximum } };
  }, [dockTooltip, isV3, positioningHeatmapOption, positioningModel.cells, v3HeatmapFixed]);
  const compactOiDifferenceOption = useMemo(() => scalperV2CompactTooltipOption(cumulativeOiDifferenceOnlyOption), [cumulativeOiDifferenceOnlyOption]);
  const compactChangeOiDifferenceOption = useMemo(() => scalperV2CompactTooltipOption(cumulativeChangeDifferenceOnlyOption), [cumulativeChangeDifferenceOnlyOption]);
  const compactRangeOption = useMemo(() => scalperV2CompactTooltipOption(compactRangePriceOption), [compactRangePriceOption]);
  const expandedCharts = useMemo<Record<ExpandableChartId, { title: string; option: EChartsOption }>>(() => ({
    oi: { title: "OI by strike", option: analyticOptions[0] },
    "delta-oi": { title: "Change in OI by strike", option: analyticOptions[1] },
    "strike-structure": { title: "Strike structure", option: strikeStructureOption },
    "positioning-heatmap": { title: "Strike × time positioning", option: positioningHeatmapOption },
    "oi-difference": { title: "Cumulative PE OI − cumulative CE OI", option: cumulativeOiDifferenceOnlyOption },
    "change-oi-difference": { title: "Cumulative PE ΔOI − cumulative CE ΔOI", option: cumulativeChangeDifferenceOnlyOption },
    "range-price": { title: "Range-normalised CE / PE", option: compactRangePriceOption },
  }), [analyticOptions, compactRangePriceOption, cumulativeChangeDifferenceOnlyOption, cumulativeOiDifferenceOnlyOption, positioningHeatmapOption, strikeStructureOption]);

  const selectTime = (time: string) => {
    const seconds = Math.floor(Date.parse(time) / 1000);
    if (!measureMode) {
      if (isV3) {
        if (v3ShiftDownRef.current && v3CompareA != null) setV3CompareB(seconds);
        else { setV3CompareA(seconds); setV3CompareB(null); }
        setV3ComparisonReference("pinned");
      }
      setLockedTime(seconds); setRailTab("time"); return;
    }
    const canonicalTime = [underlying, call, put].flatMap((pane) => pane?.bars ?? [])
      .find((row) => row.closed === true && intervalBarChartTime(row) === seconds)?.end;
    const measurementTime = canonicalTime == null ? time : String(canonicalTime);
    setPoints((current) => {
      if (current.length !== 1) {
        setMeasurementContext({ panes, interval, symbol, expiry, ceStrike: selectedCeStrike, peStrike: selectedPeStrike });
        return [measurementTime];
      }
      return [current[0], measurementTime].sort();
    });
    if (points.length === 1) setMeasureMode(false);
  };
  const selectMeasurementTime = (index: 0 | 1, time: string) => {
    if (!time) return;
    if (!measurementContext) setMeasurementContext({ panes, interval, symbol, expiry, ceStrike: selectedCeStrike, peStrike: selectedPeStrike });
    setPoints((current) => {
      const next = [...current]; next[index] = time;
      return next.filter(Boolean).sort();
    });
  };
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next); };
  const openPopout = () => {
    const next = new URLSearchParams(params);
    next.set("view", viewId);
    next.set("popout", viewId);
    window.open(`${window.location.pathname}?${next.toString()}#trading-analytics-top`, `n50-${viewId}`, "popup=yes,width=1900,height=1040,resizable=yes,scrollbars=yes");
  };
  const updateLegStrike = (wanted: "CE" | "PE", value: string) => {
    setParams(setScalperLegSelection(params, {
      ceStrike: wanted === "CE" ? value : selectedCeStrike,
      peStrike: wanted === "PE" ? value : selectedPeStrike,
    }));
  };
  const selectBothAtm = () => {
    const next = new URLSearchParams(params);
    for (const key of ["strike", "ceStrike", "peStrike", "pin"]) next.delete(key);
    setParams(next);
  };
  const handleCrosshair = (value: ScalperV2Crosshair) => {
    if (lockedTime != null) return;
    setHoverCrosshair(value);
    if (isV3 && value && !v3LinkTime) return;
  };
  const underlyingChartTimes = useMemo(
    () => (underlying?.bars ?? []).flatMap((bar) => {
      const value = intervalBarChartTime(bar);
      return value == null ? [] : [Number(value)];
    }).sort((left, right) => left - right),
    [underlying?.bars],
  );
  const handleOiTimeHover = useCallback((timeMs: number | null, source: string) => {
    if (lockedTime != null) return;
    if (isV3 && !v3LinkTime) return;
    if (timeMs == null || !Number.isFinite(timeMs)) {
      cursorCoordinator.publish({ time: null, source });
      setHoverCrosshair(null);
      return;
    }
    const target = timeMs / 1000;
    const nearest = underlyingChartTimes.reduce<number | null>((best, value) => (
      best == null || Math.abs(value - target) < Math.abs(best - target) ? value : best
    ), null);
    const selected = isV3 && v3CursorSnap !== "candle" ? Math.floor(target) : nearest;
    cursorCoordinator.publish({ time: selected, source });
    setHoverCrosshair(selected == null ? null : { time: selected, source, sequence: performance.now() });
  }, [cursorCoordinator, isV3, lockedTime, underlyingChartTimes, v3CursorSnap, v3LinkTime]);
  const pinOiTime = useCallback((timeMs: number) => {
    if (!Number.isFinite(timeMs)) return;
    const target = timeMs / 1000;
    const nearest = underlyingChartTimes.reduce<number | null>((best, value) => best == null || Math.abs(value - target) < Math.abs(best - target) ? value : best, null);
    const selected = v3CursorSnap === "candle" ? nearest : Math.floor(target);
    if (selected != null) {
      if (v3ShiftDownRef.current && v3CompareA != null) setV3CompareB(selected);
      else { setV3CompareA(selected); setV3CompareB(null); }
      setV3ComparisonReference("pinned");
      setLockedTime(selected); setHoverCrosshair({ time: selected, source: "v3-time-pin", sequence: performance.now() });
    }
  }, [underlyingChartTimes, v3CompareA, v3CursorSnap]);
  const hoverStrike = useCallback((index: number | null) => {
    if (isV3 && !v3LinkStrike) return;
    setHoveredStrike(index == null ? null : strikeRows[index] ?? null);
  }, [isV3, strikeRows, v3LinkStrike]);
  const pinStrike = useCallback((index: number) => {
    const strike = strikeRows[index];
    if (strike == null) return;
    setV3PinnedStrike((current) => current === strike ? null : strike);
  }, [strikeRows]);
  const heatmapCell = (data: unknown) => data && typeof data === "object" && "cell" in data ? (data as { cell?: { strike?: number; timestamp?: number } }).cell : undefined;
  const hoverHeatmapCell = useCallback((data: unknown) => {
    if (!v3LinkStrike) return;
    const cell = heatmapCell(data);
    setHoveredStrike(typeof cell?.strike === "number" ? cell.strike : null);
  }, [v3LinkStrike]);
  const pinHeatmapCell = useCallback((data: unknown) => {
    const cell = heatmapCell(data);
    if (typeof cell?.strike === "number") setV3PinnedStrike((current) => current === cell.strike ? null : cell.strike!);
    if (typeof cell?.timestamp === "number") pinOiTime(cell.timestamp);
  }, [pinOiTime]);
  const instrumentId = (paneRole: ScalperV2PaneRole) => String((paneRole === "underlying" ? underlying : paneRole === "call" ? call : put)?.identity.tradingsymbol ?? `${symbol}:${paneRole}`);
  const createDrawing = (tool: Exclude<ScalperV2DrawingTool, "select">, paneRole: ScalperV2PaneRole, anchors: ScalperV2DrawingAnchor[]) => {
    const drawing = createScalperV2Drawing({ id: drawingStore.newId(), tool, paneRole, instrumentId: instrumentId(paneRole), anchors });
    drawingStore.upsert(drawing); setDrawingTool("select"); setRailOpen(true); setRailTab("objects");
  };
  const selectedDrawing = drawingStore.drawings.find((drawing) => drawing.id === drawingStore.selectedId) ?? null;
  const inspectionLabel = inspectionMode === "latest" ? "Latest completed candles" : `${inspectionMode === "locked" ? "Locked" : "At cursor"} · ${inspectionTime == null ? "—" : new Date(inspectionTime * 1000).toISOString()}`;
  const signalCounts = useMemo(() => Object.fromEntries(["WAIT_NEXT_OPEN", "NEXT_BAR_MISSING", "NEXT_OPEN_FAILED", "RETROSPECTIVE_ENTRY_REFERENCE"].map((key) => [key, signals.filter((signal) => signal.state === key).length])), [signals]);
  const hoveredStrikeIndex = hoveredStrike == null ? null : strikeRows.indexOf(hoveredStrike);
  const pinnedStrikeIndex = v3PinnedStrike == null ? null : strikeRows.indexOf(v3PinnedStrike);
  const hoveredPayoutIndex = hoveredStrike == null ? null : maxPain.points.findIndex((point) => point.settlement === hoveredStrike);
  const callProfile = profileRows.find((row) => row.side === "CE" && row.strike === numeric(selectedCeStrike));
  const putProfile = profileRows.find((row) => row.side === "PE" && row.strike === numeric(selectedPeStrike));
  const maxPainValue = maxPain.candidates[0] ?? null;
  const inspectedUnderlying = numeric(inspectedRows[0]?.close) ?? spot;
  const cursorStrikeIndex = inspectionTime == null || inspectedUnderlying == null || !strikeRows.length ? null : strikeRows.reduce((best, strike, index) => (
    Math.abs(strike - inspectedUnderlying) < Math.abs(strikeRows[best] - inspectedUnderlying) ? index : best
  ), 0);
  const activeStrikeIndex = hoveredStrikeIndex ?? pinnedStrikeIndex ?? cursorStrikeIndex;
  const underlyingOpen = numeric(underlying?.bars.find((row) => row.closed === true)?.open);
  const underlyingChange = inspectedUnderlying != null && underlyingOpen != null && underlyingOpen > 0 ? 100 * (inspectedUnderlying / underlyingOpen - 1) : null;
  const selectedDistance = (row: Row | undefined) => { const close = numeric(row?.close), ema = numeric(row?.ema9); return close == null || ema == null ? null : close - ema; };
  const sessionOpen = (pane: ChartPane | undefined) => numeric(pane?.bars.find((row) => row.closed === true)?.open);
  const sessionReturn = (pane: ChartPane | undefined, row: Row | undefined) => {
    const open = sessionOpen(pane), close = numeric(row?.close);
    return open == null || close == null || open <= 0 ? null : 100 * (close / open - 1);
  };
  const inspectedTimeLabel = (row: Row | undefined) => {
    const parsed = Date.parse(String(row?.end ?? ""));
    return Number.isFinite(parsed) ? istClock(parsed) : "time unavailable";
  };
  const latestSignal = chartSignals.filter((signal) => signal.state.includes("ENTRY_REFERENCE")).at(-1) ?? chartSignals.at(-1);
  const structureOiMaximum = Math.max(1, ...structureRows.flatMap((row) => [row.ce.oi ?? 0, row.pe.oi ?? 0]));
  const structureDeltaMaximum = Math.max(1, ...structureRows.flatMap((row) => [Math.abs(row.ce.changeOi ?? 0), Math.abs(row.pe.changeOi ?? 0)]));
  const inspectedStrikeRow = structureRows.find((row) => row.strike === hoveredStrike) ?? structureRows.find((row) => row.strike === v3PinnedStrike) ?? structureRows.find((row) => row.strike === Number(selectedCeStrike)) ?? structureRows.find((row) => row.strike === Number(selectedPeStrike));
  const volumeSeries = useMemo(() => activeData?.volumeSeries ? {
    ...activeData.volumeSeries,
    bars: dayRows(activeData.volumeSeries.bars, tradingDay, "end"),
  } : undefined, [activeData?.volumeSeries, tradingDay]);
  const latestChartTime = underlyingChartTimes.at(-1) ?? null;
  const latestObservationMs = (() => {
    const parsed = Date.parse(String(latest(underlying?.bars ?? [])?.end ?? ""));
    return Number.isFinite(parsed) ? parsed : null;
  })();
  const marketOpenNow = Boolean(!replayAsOf && selectedSession && tradingDay === istDay(new Date(v3Clock).toISOString()) && v3Clock >= Date.parse(selectedSession.market_open_ts) && v3Clock <= Date.parse(selectedSession.market_close_ts));
  const v3FeedAgeMs = latestObservationMs == null ? null : Math.max(0, v3Clock - latestObservationMs);
  const v3FeedStatus = scalperV3FeedState(v3FeedAgeMs, interval, marketOpenNow);
  const v3FeedAge = scalperV3AgeLabel(v3FeedAgeMs);
  const previousSessionRow = useMemo(() => {
    const candidates = (rawUnderlying?.bars ?? []).filter((row) => row.closed === true && istDay(row.end) < tradingDay);
    return candidates.at(-1) ?? null;
  }, [rawUnderlying?.bars, tradingDay]);
  const previousCloseTime = previousSessionRow == null ? null : intervalBarChartTime(previousSessionRow);
  const comparisonReferenceTime = scalperV3ReferenceTime({
    reference: v3ComparisonReference,
    latestTime: latestChartTime,
    sessionOpenTime: underlyingChartTimes[0] ?? null,
    previousCloseTime,
    pinnedTime: v3CompareA,
  });
  const comparisonTargetTime = v3CompareB ?? latestChartTime;
  const rowAt = (pane: ChartPane | undefined, target: number | null) => scalperV3RowAtOrBefore(
    pane?.bars.filter((row) => row.closed === true) ?? [], target, (row) => intervalBarChartTime(row),
  );
  const comparisonPanes = [
    rawUnderlying,
    rawPanes.find((pane) => chartSide(pane) === "CE"),
    rawPanes.find((pane) => chartSide(pane) === "PE"),
  ];
  const comparisonReferenceRows = comparisonPanes.map((pane) => rowAt(pane, comparisonReferenceTime));
  const comparisonTargetRows = comparisonPanes.map((pane) => rowAt(pane, comparisonTargetTime));
  const cumulativeAt = (target: number | null) => scalperV3RowAtOrBefore(cumulativeOiPoints, target == null ? null : target * 1000, (point) => Date.parse(point.capturedAt));
  const comparisonReferenceOi = cumulativeAt(comparisonReferenceTime);
  const comparisonTargetOi = cumulativeAt(comparisonTargetTime);
  const selectedPositioningAt = (wanted: "CE" | "PE", strike: number, target: number | null) => scalperV3RowAtOrBefore(
    positioningModel.cells.filter((cell) => cell.side === wanted && cell.strike === strike), target == null ? null : target * 1000, (cell) => cell.timestamp,
  );
  const comparisonReferenceCe = selectedPositioningAt("CE", Number(selectedCeStrike), comparisonReferenceTime);
  const comparisonReferencePe = selectedPositioningAt("PE", Number(selectedPeStrike), comparisonReferenceTime);
  const comparisonTargetCe = selectedPositioningAt("CE", Number(selectedCeStrike), comparisonTargetTime);
  const comparisonTargetPe = selectedPositioningAt("PE", Number(selectedPeStrike), comparisonTargetTime);
  const comparisonDeltas = {
    nifty: scalperV3Delta(numeric(comparisonTargetRows[0]?.close), numeric(comparisonReferenceRows[0]?.close)),
    ce: scalperV3Delta(numeric(comparisonTargetRows[1]?.close), numeric(comparisonReferenceRows[1]?.close)),
    pe: scalperV3Delta(numeric(comparisonTargetRows[2]?.close), numeric(comparisonReferenceRows[2]?.close)),
    ceOi: scalperV3Delta(comparisonTargetCe?.oi, comparisonReferenceCe?.oi),
    peOi: scalperV3Delta(comparisonTargetPe?.oi, comparisonReferencePe?.oi),
    netOi: scalperV3Delta(comparisonTargetOi?.oiDifference, comparisonReferenceOi?.oiDifference),
  };
  const inspectedStrikeCells = inspectedStrikeRow == null ? [] : positioningModel.cells.filter((cell) => cell.strike === inspectedStrikeRow.strike).sort((left, right) => left.timestamp - right.timestamp);
  const strikeVelocity = (wanted: "CE" | "PE") => {
    const cells = inspectedStrikeCells.filter((cell) => cell.side === wanted && cell.oi != null);
    const current = cells.at(-1) ?? null, previous = cells.at(-2) ?? null, prior = cells.at(-3) ?? null;
    const velocity = scalperV3Velocity(current?.oi ?? null, previous?.oi ?? null, current?.timestamp ?? null, previous?.timestamp ?? null);
    const priorVelocity = scalperV3Velocity(previous?.oi ?? null, prior?.oi ?? null, previous?.timestamp ?? null, prior?.timestamp ?? null);
    return { velocity, arrow: scalperV3AccelerationArrow(velocity, priorVelocity) };
  };
  const ceVelocity = strikeVelocity("CE"), peVelocity = strikeVelocity("PE");
  const largestChange = structureRows.flatMap((row) => [
    { strike: row.strike, side: "CE" as const, value: row.ce.changeOi },
    { strike: row.strike, side: "PE" as const, value: row.pe.changeOi },
  ]).filter((row): row is { strike: number; side: "CE" | "PE"; value: number } => row.value != null).sort((left, right) => Math.abs(right.value) - Math.abs(left.value))[0] ?? null;

  useEffect(() => {
    if (!isV3 || defaultStrike == null) return;
    const previous = v3PreviousAtmRef.current;
    v3PreviousAtmRef.current = defaultStrike;
    if (previous == null || previous === defaultStrike) return;
    setV3AtmShift({ from: previous, to: defaultStrike });
    const timeout = window.setTimeout(() => setV3AtmShift(null), 1_000);
    return () => window.clearTimeout(timeout);
  }, [defaultStrike, isV3]);

  useEffect(() => {
    if (!isV3 || !profileRows.length) return;
    const previous = v3PreviousStrikeValuesRef.current;
    const next = new Map<number, string>();
    strikeRows.forEach((strike) => {
      const ce = profileRows.find((row) => row.side === "CE" && row.strike === strike);
      const pe = profileRows.find((row) => row.side === "PE" && row.strike === strike);
      next.set(strike, `${ce?.currentOi ?? ""}:${ce?.changeOi ?? ""}:${pe?.currentOi ?? ""}:${pe?.changeOi ?? ""}`);
    });
    if (previous.size) {
      const changed = strikeRows.flatMap((strike, index) => previous.get(strike) !== next.get(strike) ? [index] : []);
      if (changed.length) {
        setV3PulseStrikeIndices(changed);
        const timeout = window.setTimeout(() => setV3PulseStrikeIndices([]), 900);
        v3PreviousStrikeValuesRef.current = next;
        return () => window.clearTimeout(timeout);
      }
    }
    v3PreviousStrikeValuesRef.current = next;
  }, [isV3, profileRows, strikeRows]);

  useEffect(() => {
    if (!isV3) return;
    const keydown = (event: KeyboardEvent) => {
      const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
      if (editing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.code === "Space") {
        event.preventDefault(); setV3WhatChanged(true);
        window.setTimeout(() => setV3WhatChanged(false), 3_000);
        return;
      }
      if ((event.key === "ArrowUp" || event.key === "ArrowDown") && strikeRows.length) {
        event.preventDefault();
        const current = v3PinnedStrike == null ? Math.max(0, strikeRows.indexOf(nearestSpotStrike ?? strikeRows[0])) : strikeRows.indexOf(v3PinnedStrike);
        const nextIndex = Math.max(0, Math.min(strikeRows.length - 1, current + (event.key === "ArrowUp" ? 1 : -1)));
        setV3PinnedStrike(strikeRows[nextIndex]); return;
      }
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) && underlyingChartTimes.length) {
        event.preventDefault();
        const currentTime = lockedTime ?? hoverCrosshair?.time ?? underlyingChartTimes.at(-1)!;
        const currentIndex = Math.max(0, underlyingChartTimes.reduce((best, time, index) => Math.abs(time - currentTime) < Math.abs(underlyingChartTimes[best] - currentTime) ? index : best, 0));
        const jump = event.shiftKey ? 5 : 1;
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? underlyingChartTimes.length - 1 : Math.max(0, Math.min(underlyingChartTimes.length - 1, currentIndex + (event.key === "ArrowRight" ? jump : -jump)));
        const time = underlyingChartTimes[nextIndex];
        setLockedTime(time); setV3CompareA(time); setV3CompareB(null); setV3ComparisonReference("pinned");
        cursorCoordinator.publish({ time, source: "v3-keyboard" });
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [cursorCoordinator, hoverCrosshair?.time, isV3, lockedTime, nearestSpotStrike, strikeRows, underlyingChartTimes, v3PinnedStrike]);
  const maximizeV3Price = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isV3 || (event.target as HTMLElement).closest("button,select,input,a")) return;
    const panel = (event.target as HTMLElement).closest<HTMLElement>('[data-testid^="v2-chart-panel-"]');
    const id = panel?.dataset.testid?.replace("v2-chart-panel-", "");
    if (id === "underlying" || id === "call" || id === "put") setV3MaximizedPrice((current) => current === id ? null : id);
  };
  const expandV3Analytic = (event: ReactMouseEvent<HTMLElement>) => {
    if (!isV3 || (event.target as HTMLElement).closest("button,select,input,a")) return;
    const testId = (event.target as HTMLElement).closest<HTMLElement>("article")?.dataset.testid;
    const id = testId === "v2-side-oi-chart" ? "oi" : testId === "v2-side-delta-oi-chart" ? "delta-oi" : testId === "v2-side-strike-structure-chart" ? "strike-structure" : testId === "v2-side-positioning-heatmap" ? "positioning-heatmap" : testId === "v2-oi-difference-time" ? "oi-difference" : testId === "v2-change-oi-difference-time" ? "change-oi-difference" : testId === "v2-compact-range-price" ? "range-price" : null;
    if (id) setExpandedChart(id);
  };
  const handleRangeChange = useCallback((value: ScalperV2TimeRange) => {
    if (isV3) setV3FollowLive(false);
    if (!isV3 || v3LinkTime) setLinkedRange(value);
  }, [isV3, v3LinkTime]);
  const returnToLive = useCallback(() => {
    setV3FollowLive(true); setHorizontalView("day"); setLinkedRange(null); setLockedTime(null); setHoverCrosshair(null); setFitRequest((value) => value + 1);
  }, []);
  const presetColumns = v3LayoutPreset === "options" ? { main: 72, right: 28, nifty: 36, options: 36 } : v3LayoutPreset === "structure" ? { main: 82, right: 18, nifty: 46, options: 36 } : { main: 78, right: 22, nifty: 41, options: 37 };
  const sessionProgress = selectedSession ? Math.max(0, Math.min(1, (v3Clock - Date.parse(selectedSession.market_open_ts)) / Math.max(1, Date.parse(selectedSession.market_close_ts) - Date.parse(selectedSession.market_open_ts)))) : 0;
  const v3Style = isV3 ? {
    "--v3-bottom-height": `${v3BottomHeight}px`,
    "--v3-main-width": `${presetColumns.main}fr`,
    "--v3-right-width": `${presetColumns.right}fr`,
    "--v3-nifty-width": `${presetColumns.nifty}fr`,
    "--v3-options-width": `${presetColumns.options}fr`,
    "--v3-session-progress": `${sessionProgress * 100}%`,
  } as CSSProperties : undefined;
  const cursorVolumeRow = exactAt(volumeSeries?.bars ?? [], inspectionTime);
  const cursorNetOi = callProfile?.currentOi != null && putProfile?.currentOi != null ? putProfile.currentOi - callProfile.currentOi : null;

  if (!active.data) return <section className={css.loading} role="status">{active.isLoading ? `Loading ${label} ${interval}m first…` : "Exact chart context unavailable."}{active.isError && <ScalperV2Freshness sessions={[]} observations={[]} interval={interval} historical={Boolean(replayAsOf)} symbol={symbol} failed />}</section>;
  return <section className={css.page} data-testid={isV3 ? "scalper-v3" : "scalper-v2"} data-layout={layout} data-popout={isPopout || undefined} data-right-open={isV3 ? v3RightOpen : undefined} data-bottom-open={isV3 ? v3BottomOpen : undefined} data-maximized-price={v3MaximizedPrice ?? undefined} data-v3-density={isV3 ? v3Density : undefined} data-v3-preset={isV3 ? v3LayoutPreset : undefined} data-v3-live={isV3 ? v3FollowLive : undefined} data-v3-feed={isV3 ? v3FeedStatus : undefined} data-what-changed={isV3 && v3WhatChanged ? true : undefined} style={v3Style} data-potential-ema-state={potentialEmaAvailability.state} data-potential-ema-references={potentialEmaAvailability.state === "READY" ? potentialEmaSignals.length : ""}>
    <header className={css.commandBar}>
      <strong className={css.commandSymbol}>{symbol}</strong>
      <div className={css.topQuotes} aria-label="Current selected values"><span><b>{label}</b>{number(inspectedUnderlying)}</span><span className={css.callText}><b>CE {selectedCeStrike}</b>{price(inspectedRows[1]?.close ?? callLeg?.last_price)}</span><span className={css.putText}><b>PE {selectedPeStrike}</b>{price(inspectedRows[2]?.close ?? putLeg?.last_price)}</span></div>
      <MwhdRankBadge ranking={mwhd.rankings.get(symbol.toUpperCase())} />
      <div className={css.commandGroup}><span>Time</span><label>Session <select value={tradingDay} onChange={(event) => update("day", event.target.value)}>{days.map((day) => <option key={day}>{day}</option>)}</select></label>{([1, 5, 15, 60] as const).map((minutes) => <button key={minutes} aria-current={interval === minutes ? "page" : undefined} onClick={() => update("interval", String(minutes))}>{minutes === 60 ? "1h" : `${minutes}m`}</button>)}<button aria-pressed={horizontalView === "day"} onClick={() => { setHorizontalView("day"); setFitRequest((value) => value + 1); }}>Fit day</button></div>
      <div className={css.commandGroup}><span>Contract</span><label>CE <select aria-label="Selected CE strike" value={selectedCeStrike} disabled={points.length > 0} onChange={(event) => updateLegStrike("CE", event.target.value)}>{selectableCeStrikes.map((strike) => <option key={strike} value={strike}>{strike.toLocaleString("en-IN")}</option>)}</select></label><label>PE <select aria-label="Selected PE strike" value={selectedPeStrike} disabled={points.length > 0} onChange={(event) => updateLegStrike("PE", event.target.value)}>{selectablePeStrikes.map((strike) => <option key={strike} value={strike}>{strike.toLocaleString("en-IN")}</option>)}</select></label><button disabled={points.length > 0 || defaultStrike == null} onClick={selectBothAtm}>Both ATM</button><small>{expiry || "Expiry unavailable"}</small></div>
      <details className={css.commandMenu}><summary>Scale</summary><div><button aria-pressed={verticalView === "session" && !profileRangeExpanded} onClick={() => { setVerticalView("session"); setProfileRangeExpanded(false); setYLocked(false); }}>Session Y</button><button aria-pressed={profileRangeExpanded} disabled={!profileRows.length} onClick={() => { setVerticalView("session"); setProfileRangeExpanded(true); setYLocked(false); }}>All strikes Y</button><button aria-pressed={verticalView === "visible"} onClick={() => { setVerticalView("visible"); setProfileRangeExpanded(false); setYLocked(false); }}>Visible Y</button><button aria-pressed={verticalView === "manual"} onClick={() => { setVerticalView("manual"); setProfileRangeExpanded(false); setYLocked(false); }}>Manual Y</button><button aria-pressed={yLocked} onClick={() => setYLocked((value) => !value)}>{yLocked ? "Unlock Y" : "Lock Y"}</button><button onClick={() => { setHorizontalView("last30"); setFitRequest((value) => value + 1); }}>Last 30</button><button onClick={() => { setHorizontalView("last60"); setFitRequest((value) => value + 1); }}>Last 60</button></div></details>
      <details className={css.commandMenu}><summary>OI</summary><div><button onClick={() => { setAnalyticsTab("matrix"); document.getElementById("scalper-v2-analytics")?.scrollIntoView({ block: "nearest" }); }}>Strike matrix</button><button onClick={() => { setAnalyticsTab("oi"); document.getElementById("scalper-v2-analytics")?.scrollIntoView({ block: "nearest" }); }}>OI &amp; ΔOI charts</button></div></details>
      <details className={css.commandMenu}><summary>Tools</summary><div><button aria-pressed={measureMode} onClick={() => { setMeasureMode(!measureMode); if (!measureMode) setRailTab("measure"); }}>Measure A–B</button><button onClick={drawingStore.undo} disabled={!drawingStore.canUndo}>Undo drawing</button><button onClick={drawingStore.redo} disabled={!drawingStore.canRedo}>Redo drawing</button><button onClick={() => { setRailOpen(true); setRailTab("objects"); }}>Drawings</button></div></details>
      {isV3 && <><button type="button" className={css.linkToggle} aria-pressed={v3LinkTime} onClick={() => setV3LinkTime((value) => !value)}>Link time</button><button type="button" className={css.linkToggle} aria-pressed={v3LinkStrike} onClick={() => setV3LinkStrike((value) => !value)}>Link strike</button><button type="button" className={v3FollowLive ? css.liveButton : css.pausedButton} data-feed-state={v3FeedStatus} data-testid="v3-live-state" onClick={returnToLive}>{v3FollowLive ? `${v3FeedStatus === "closed" ? "CLOSED" : v3FeedStatus.toUpperCase()} · ${v3FeedAge}` : "↦ Return live"}</button><label className={css.referenceChip}>Δ vs <select aria-label="Global comparison reference" value={v3ComparisonReference} onChange={(event) => setV3ComparisonReference(event.target.value as ScalperV3ComparisonReference)}><option value="previous-close">Previous close</option><option value="session-open">Session open</option><option value="15m">15m</option><option value="5m">5m</option><option value="pinned">Pinned cursor</option></select></label><details className={css.commandMenu}><summary>Chart</summary><div><label>Cursor <select value={v3CursorSnap} onChange={(event) => setV3CursorSnap(event.target.value as V3CursorSnap)}><option value="candle">Candle</option><option value="exact">Exact time</option><option value="free">Free</option></select></label><button aria-pressed={v3ShowEma} onClick={() => setV3ShowEma((value) => !value)}>EMA</button><button aria-pressed={v3ShowVolumeEma} onClick={() => setV3ShowVolumeEma((value) => !value)}>Volume EMA</button><button aria-pressed={v3ShowSignals} onClick={() => setV3ShowSignals((value) => !value)}>Entry markers</button><button aria-pressed={v3ShowReferences} onClick={() => setV3ShowReferences((value) => !value)}>References</button><label>Range traces <select value={v3RangeDisplay} onChange={(event) => setV3RangeDisplay(event.target.value as V3RangeDisplay)}><option value="current">Current only</option><option value="context">Context</option><option value="all">All</option></select></label></div></details><details className={css.commandMenu}><summary>Layout</summary><div><label>Workspace <select value={v3LayoutPreset} onChange={(event) => setV3LayoutPreset(event.target.value as V3LayoutPreset)}><option value="trading">Trading</option><option value="options">Options Analysis</option><option value="structure">Market Structure</option></select></label><label>Density <select value={v3Density} onChange={(event) => setV3Density(event.target.value as V3Density)}><option value="standard">Standard</option><option value="dense">Ultra dense</option><option value="readable">Readable</option></select></label><button aria-pressed={v3RightOpen} onClick={() => setV3RightOpen((value) => !value)}>{v3RightOpen ? "Collapse strike rail" : "Show strike rail"}</button><button aria-pressed={v3BottomOpen} onClick={() => setV3BottomOpen((value) => !value)}>{v3BottomOpen ? "Collapse bottom strip" : "Show bottom strip"}</button><button onClick={() => setV3BottomHeight(120)}>Compact 120</button><button onClick={() => setV3BottomHeight(180)}>Default 180</button><button onClick={() => setV3BottomHeight(260)}>Analysis 260</button><button onClick={() => { setV3RightOpen(true); setV3BottomOpen(true); setV3BottomHeight(180); setV3LayoutPreset("trading"); setV3Density("standard"); }}>Reset workspace</button><button onClick={() => setV3HelpOpen(true)}>Keyboard help</button></div></details></>}
      <details className={css.commandMenu}><summary>More</summary><div><button aria-pressed={railOpen} onClick={() => setRailOpen(!railOpen)}>{railOpen ? "Hide details" : "Show details"}</button><button onClick={() => { const body = JSON.stringify({ version: "SCALPER_V2_WORKSTATION_V2", symbol, expiry, selectedCeStrike, selectedPeStrike, interval, asOf, tradingDay, inspectionMode, inspectionTime, horizontalView, priceMode, referenceLevels: referenceLevels ?? null, rankLevels: leaders, source: contextRows, chart: active.data, optionPriceHistory: optionPriceHistory.data ?? null, drawings: drawingStore.drawings, measurement }, null, 2); const url = URL.createObjectURL(new Blob([body], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `scalper-v2-${symbol}-${tradingDay || "current"}.json`; anchor.click(); URL.revokeObjectURL(url); }}>Export JSON</button><button onClick={() => { const url = URL.createObjectURL(new Blob([evidenceCsv(contextRows)], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `scalper-v2-chain-${symbol}-${tradingDay || "current"}.csv`; anchor.click(); URL.revokeObjectURL(url); }}>Chain CSV</button><button onClick={() => { setRailOpen(true); setRailTab("health"); }}>Data health</button></div></details>
      <ScalperV2Freshness compact sessions={active.data.calendar?.sessions ?? []} observations={['UNDERLYING', 'CE', 'PE'].map(name => ({ name, end: String(latest(rawPanes.find(pane => chartSide(pane) === name)?.bars ?? [])?.end ?? '') }))} interval={interval} historical={Boolean(replayAsOf || (selectedDayParam && selectedDayParam < (active.data.calendar?.sessions.at(-1)?.trade_date ?? '')))} symbol={symbol} failed={active.isError} />
      {!isPopout && <button type="button" className={css.popoutButton} data-testid={`${viewId}-popout`} onClick={openPopout} title={`Pop out ${isV3 ? "Scalper V3" : "Scalper V2"}`}><span aria-hidden="true">↗</span><span className={css.popoutLabel}> Pop out</span></button>}
    </header>
    {isV3 && <div className={css.cursorStrip} data-testid="v3-cursor-strip" data-mode={inspectionMode} data-snap={v3CursorSnap}><b>{inspectionMode === "locked" ? "PINNED" : inspectionMode === "hover" ? "CURSOR" : "LATEST"}</b><span>{inspectionTime == null ? inspectedTimeLabel(inspectedRows[0]) : istClock(inspectionTime * 1000)}</span><span>NIFTY O {number(inspectedRows[0]?.open)} H {number(inspectedRows[0]?.high)} L {number(inspectedRows[0]?.low)} C {number(inspectedRows[0]?.close)}</span><span className={css.callText}>CE {number(inspectedRows[1]?.close)}</span><span className={css.putText}>PE {number(inspectedRows[2]?.close)}</span><span>CE OI {compact(callProfile?.currentOi)}</span><span>PE OI {compact(putProfile?.currentOi)}</span><span>Net {signed(cursorNetOi)}</span><span>Vol {compact(cursorVolumeRow?.volume)}</span>{comparisonReferenceTime != null && <span className={css.comparisonValues} data-testid="v3-comparison-values"><b>{istClock(comparisonReferenceTime * 1000)} → {comparisonTargetTime == null ? "NOW" : istClock(comparisonTargetTime * 1000)}</b> NIFTY {signed(comparisonDeltas.nifty)} · CE {signed(comparisonDeltas.ce)} · PE {signed(comparisonDeltas.pe)} · CE OI {signed(comparisonDeltas.ceOi)} · PE OI {signed(comparisonDeltas.peOi)} · Net {signed(comparisonDeltas.netOi)}</span>}{v3AtmShift && <span className={css.atmShift}>ATM shifted {v3AtmShift.from.toLocaleString("en-IN")} → {v3AtmShift.to.toLocaleString("en-IN")}</span>}{lockedTime != null && <button type="button" onClick={() => { setLockedTime(null); setV3CompareA(null); setV3CompareB(null); }}>Unpin</button>}</div>}
    {isV3 && v3WhatChanged && <div className={css.whatChanged} data-testid="v3-what-changed" role="status"><b>WHAT CHANGED · {v3ComparisonReference === "pinned" ? "FROM PIN" : v3ComparisonReference.toUpperCase()}</b><span>NIFTY {signed(comparisonDeltas.nifty)}</span><span>CE {signed(comparisonDeltas.ce)}</span><span>PE {signed(comparisonDeltas.pe)}</span><span>Net OI {signed(comparisonDeltas.netOi)}</span>{largestChange && <button type="button" onClick={() => setV3PinnedStrike(largestChange.strike)}>Largest ΔOI {largestChange.side} {largestChange.strike.toLocaleString("en-IN")} · {signed(largestChange.value)}</button>}</div>}
    {active.error && <div className={css.warning} role="alert">The selected timeframe could not refresh. Cached timeframes remain available.</div>}
    <div className={css.workspace}>
      <div className={css.chartStage}>
        <nav className={css.drawingTools} aria-label="Chart drawing tools">
          {DRAWING_TOOLS.map((entry) => <button key={entry.tool} type="button" title={entry.label} aria-label={entry.label} aria-pressed={drawingTool === entry.tool} onClick={() => { setDrawingTool(entry.tool); setMeasureMode(false); }}>{entry.short}</button>)}
          <span title={`Drawing persistence ${drawingStore.saveState}`}>{drawingStore.saveState === "saved" ? "Saved" : drawingStore.saveState}</span>
        </nav>
        <div className={css.charts} onDoubleClick={maximizeV3Price} title={isV3 ? "Double-click a price pane to maximize or restore" : undefined}>
          <ScalperV2Chart id="underlying" title={label} subtitle="Underlying · price and volume" bars={underlying?.bars ?? []} volumeBars={volumeSeries?.bars ?? []} volumeLabel={volumeSeries?.identity ? `${volumeSeries.kind === "CURRENT_MONTH_FUTURE" ? "Current-month future" : "Cash stock"} volume · ${volumeSeries.identity.tradingSymbol}${volumeSeries.identity.expiry ? ` · ${volumeSeries.identity.expiry}` : ""}` : "Volume unavailable"} interval={interval} lastRefreshAt={active.dataUpdatedAt} fitDaySlotCount={fitDaySlotCount} externalCrosshair={isV3 && !v3LinkTime ? null : crosshair} externalRange={isV3 && !v3LinkTime ? null : linkedRange} inspectionMode={inspectionMode} inspectionTime={inspectionTime} cursorCoordinator={cursorCoordinator} fitRequest={fitRequest} horizontalView={horizontalView} verticalView={verticalView} yLocked={yLocked} onCrosshair={handleCrosshair} onRangeChange={handleRangeChange} onTimeClick={selectTime} signalEvents={chartSignals} measurementTimes={points} referenceLevels={activeReferenceLevels} drawingTool={drawingTool} drawings={drawingStore.drawings.filter((drawing) => drawing.paneRole === "underlying" && drawing.instrumentId === instrumentId("underlying"))} selectedDrawingId={drawingStore.selectedId} onDrawingCreate={createDrawing} onDrawingUpdate={drawingStore.upsert} onDrawingSelect={drawingStore.setSelectedId} linkCursor={!isV3 || v3LinkTime} hideReadout={isV3} showEma={!isV3 || v3ShowEma} showVolumeEma={!isV3 || v3ShowVolumeEma} showSignals={!isV3 || v3ShowSignals} showReferences={!isV3 || v3ShowReferences} rightOffset={isV3 ? 6 : 1} onMaximize={isV3 ? () => setV3MaximizedPrice((current) => current === "underlying" ? null : "underlying") : undefined} />
          <ScalperV2Chart id="call" title={`CE ${Number(selectedCeStrike).toLocaleString("en-IN")}`} subtitle={String(call?.identity.tradingsymbol ?? "Exact call unavailable")} bars={call?.bars ?? []} volumeBars={call?.bars ?? []} volumeLabel="Exact CE contract volume" interval={interval} lastRefreshAt={active.dataUpdatedAt} fitDaySlotCount={fitDaySlotCount} externalCrosshair={isV3 && !v3LinkTime ? null : crosshair} externalRange={isV3 && !v3LinkTime ? null : linkedRange} inspectionMode={inspectionMode} inspectionTime={inspectionTime} cursorCoordinator={cursorCoordinator} fitRequest={fitRequest} horizontalView={horizontalView} verticalView={verticalView} yLocked={yLocked} onCrosshair={handleCrosshair} onRangeChange={handleRangeChange} onTimeClick={selectTime} signalEvents={callSignals} measurementTimes={points} drawingTool={drawingTool} drawings={drawingStore.drawings.filter((drawing) => drawing.paneRole === "call" && drawing.instrumentId === instrumentId("call"))} selectedDrawingId={drawingStore.selectedId} onDrawingCreate={createDrawing} onDrawingUpdate={drawingStore.upsert} onDrawingSelect={drawingStore.setSelectedId} linkCursor={!isV3 || v3LinkTime} hideReadout={isV3} showEma={!isV3 || v3ShowEma} showVolumeEma={!isV3 || v3ShowVolumeEma} showSignals={!isV3 || v3ShowSignals} rightOffset={isV3 ? 6 : 1} onMaximize={isV3 ? () => setV3MaximizedPrice((current) => current === "call" ? null : "call") : undefined} />
          <ScalperV2Chart id="put" title={`PE ${Number(selectedPeStrike).toLocaleString("en-IN")}`} subtitle={String(put?.identity.tradingsymbol ?? "Exact put unavailable")} bars={put?.bars ?? []} volumeBars={put?.bars ?? []} volumeLabel="Exact PE contract volume" interval={interval} lastRefreshAt={active.dataUpdatedAt} fitDaySlotCount={fitDaySlotCount} externalCrosshair={isV3 && !v3LinkTime ? null : crosshair} externalRange={isV3 && !v3LinkTime ? null : linkedRange} inspectionMode={inspectionMode} inspectionTime={inspectionTime} cursorCoordinator={cursorCoordinator} fitRequest={fitRequest} horizontalView={horizontalView} verticalView={verticalView} yLocked={yLocked} onCrosshair={handleCrosshair} onRangeChange={handleRangeChange} onTimeClick={selectTime} signalEvents={putSignals} measurementTimes={points} drawingTool={drawingTool} drawings={drawingStore.drawings.filter((drawing) => drawing.paneRole === "put" && drawing.instrumentId === instrumentId("put"))} selectedDrawingId={drawingStore.selectedId} onDrawingCreate={createDrawing} onDrawingUpdate={drawingStore.upsert} onDrawingSelect={drawingStore.setSelectedId} linkCursor={!isV3 || v3LinkTime} hideReadout={isV3} showEma={!isV3 || v3ShowEma} showVolumeEma={!isV3 || v3ShowVolumeEma} showSignals={!isV3 || v3ShowSignals} rightOffset={isV3 ? 6 : 1} onMaximize={isV3 ? () => setV3MaximizedPrice((current) => current === "put" ? null : "put") : undefined} />
        </div>
      </div>
      {(!isV3 || v3RightOpen) && <aside className={css.structureCharts} data-testid={`${viewId}-strike-side-charts`} aria-label="Strike open interest comparison charts" onDoubleClick={expandV3Analytic}>
        {isV3 && <button type="button" className={css.strikeInspector} data-testid="v3-strike-inspector" data-pinned={v3PinnedStrike != null || undefined} aria-expanded={v3InspectorExpanded} aria-live="polite" onClick={() => setV3InspectorExpanded((value) => !value)}>{inspectedStrikeRow ? <><b>{v3PinnedStrike === inspectedStrikeRow.strike ? "PIN " : ""}{inspectedStrikeRow.strike.toLocaleString("en-IN")}</b><span>{spot == null ? "spot —" : `${signed(inspectedStrikeRow.strike - spot)} from spot`}</span><span className={css.callText}>CE OI {compact(inspectedStrikeRow.ce.oi)} · Δ {signed(inspectedStrikeRow.ce.changeOi)} · {ceVelocity.arrow} {ceVelocity.velocity == null ? "—" : `${signed(ceVelocity.velocity)}/5m`}</span><span className={css.putText}>PE OI {compact(inspectedStrikeRow.pe.oi)} · Δ {signed(inspectedStrikeRow.pe.changeOi)} · {peVelocity.arrow} {peVelocity.velocity == null ? "—" : `${signed(peVelocity.velocity)}/5m`}</span>{v3InspectorExpanded && <span>Net OI {signed((inspectedStrikeRow.pe.oi ?? 0) - (inspectedStrikeRow.ce.oi ?? 0))} · premium CE {percent(inspectedStrikeRow.ce.priceChangePct)} / PE {percent(inspectedStrikeRow.pe.priceChangePct)} · {inspectedStrikeRow.ce.priceChangePct != null && inspectedStrikeRow.ce.changeOi != null ? `CE price ${inspectedStrikeRow.ce.priceChangePct >= 0 ? "↑" : "↓"} / OI ${inspectedStrikeRow.ce.changeOi >= 0 ? "↑" : "↓"}` : "CE state unavailable"}</span>}</> : <span>Hover a strike to inspect it across all strike charts</span>}</button>}
        <article data-testid="v2-side-oi-chart">
          <header><strong>OI by strike</strong><RefreshStamp at={active.dataUpdatedAt} /><span>CE / PE · PE − CE</span><ChartActions title="OI by strike" onExpand={() => setExpandedChart("oi")} /></header>
          <Suspense fallback={<p>Loading OI chart…</p>}><Chart className={css.structureChart} ariaLabel="Open interest by strike with put minus call difference" axisExtentPolicy="native" option={compactOiOption} activeCategoryIndex={v3LinkStrike ? activeStrikeIndex : null} pinnedCategoryIndex={pinnedStrikeIndex} pulseCategoryIndices={v3PulseStrikeIndices} onCategoryHover={hoverStrike} onCategoryClick={pinStrike} /></Suspense>
        </article>
        <article data-testid="v2-side-delta-oi-chart">
          <header><strong>ΔOI by strike</strong>{largestChange && <button type="button" className={css.headerMetric} onClick={() => setV3PinnedStrike(largestChange.strike)} title="Focus the largest absolute change in OI">Largest {largestChange.side} {largestChange.strike.toLocaleString("en-IN")} {signed(largestChange.value)}</button>}<RefreshStamp at={active.dataUpdatedAt} /><span>CE / PE · PE ΔOI − CE ΔOI</span><ChartActions title="Change in OI by strike" onExpand={() => setExpandedChart("delta-oi")} /></header>
          {profileComparable > 0 ? <Suspense fallback={<p>Loading ΔOI chart…</p>}><Chart className={css.structureChart} ariaLabel="Change in open interest by strike with put delta OI minus call delta OI difference" axisExtentPolicy="native" option={compactDeltaOiOption} activeCategoryIndex={v3LinkStrike ? activeStrikeIndex : null} pinnedCategoryIndex={pinnedStrikeIndex} pulseCategoryIndices={v3PulseStrikeIndices} onCategoryHover={hoverStrike} onCategoryClick={pinStrike} /></Suspense> : <div className={css.sideState}><strong>ΔOI unavailable</strong><span>A comparable baseline is required; missing values are not zero.</span></div>}
        </article>
        <article data-testid="v2-side-strike-structure-chart">
          <header><strong>Strike structure</strong><RefreshStamp at={active.dataUpdatedAt} /><span>OI bars · ΔOI lines · premium markers · CE1–5 / PE1–5</span><ChartActions title="Strike structure" onInfo={() => setChartInfo("strike-structure")} onExpand={() => setExpandedChart("strike-structure")} /></header>
          {strikeRows.length ? <Suspense fallback={<p>Loading strike structure…</p>}><Chart className={css.structureChart} ariaLabel="Strike wise open interest change in open interest premium return and buildup regime" axisExtentPolicy="native" option={compactStrikeStructureOption} activeCategoryIndex={v3LinkStrike ? activeStrikeIndex : null} pinnedCategoryIndex={pinnedStrikeIndex} pulseCategoryIndices={v3PulseStrikeIndices} onCategoryHover={hoverStrike} onCategoryClick={pinStrike} /></Suspense> : <div className={css.sideState}><strong>Strike structure unavailable</strong><span>No exact tracked strikes exist for this snapshot.</span></div>}
        </article>
        <article data-testid="v2-side-positioning-heatmap">
          <header><strong>Strike × time positioning</strong><RefreshStamp at={optionPriceHistory.dataUpdatedAt} /><span>{interval === 15 ? "15m" : "5m"} · ΔOI share + premium + volume + depth</span>{isV3 && <button type="button" className={css.scaleToggle} onClick={() => setV3HeatmapFixed((value) => !value)} title="Toggle fixed or automatic heatmap colour scale">{v3HeatmapFixed ? "±100" : "AUTO"}</button>}<ChartActions title="Strike by time positioning" onInfo={() => setChartInfo("positioning-heatmap")} onExpand={() => setExpandedChart("positioning-heatmap")} /></header>
          {positioningModel.cells.some((cell) => cell.pressure != null) ? <Suspense fallback={<p>Loading positioning heatmap…</p>}><Chart className={css.structureChart} ariaLabel="Strike by time option positioning pressure heatmap" axisExtentPolicy="native" option={compactPositioningHeatmapOption} activeTimeMs={v3LinkTime && inspectionTime != null ? inspectionTime * 1000 : null} onTimeHover={(value) => handleOiTimeHover(value, "positioning-heatmap")} onTimeClick={(value) => pinOiTime(value)} onDataHover={hoverHeatmapCell} onDataClick={pinHeatmapCell} /></Suspense> : <div className={css.sideState}><strong>Positioning history unavailable</strong><span>No retained session observations have enough OI, premium, volume or depth evidence. Missing inputs are not zero.</span></div>}
        </article>
      </aside>}
      {(!isV3 || v3BottomOpen) && <section className={css.oiHistoryRow} data-testid={`${viewId}-oi-history-row`} aria-label="Tracked option-chain open-interest differences over time" onDoubleClick={expandV3Analytic}>
        <div className={css.oiHistoryPair}>
          <article data-testid="v2-oi-difference-time"><header><strong>Cum PE OI − CE OI</strong><RefreshStamp at={active.dataUpdatedAt} /><span>All tracked strikes · timestamp aligned</span><ChartActions title="Cumulative PE OI minus cumulative CE OI" onExpand={() => setExpandedChart("oi-difference")} /></header>{cumulativeOiPoints.some((point) => point.oiDifference != null) ? <Suspense fallback={<p>Loading OI difference…</p>}><Chart className={css.oiHistoryChart} ariaLabel="Cumulative put open interest minus cumulative call open interest over time" axisExtentPolicy="native" option={compactOiDifferenceOption} activeTimeMs={v3LinkTime && inspectionTime != null ? inspectionTime * 1000 : null} onTimeHover={(value) => handleOiTimeHover(value, "oi-difference")} onTimeClick={pinOiTime} /></Suspense> : <div className={css.oiHistoryState}><strong>OI history unavailable</strong><span>No comparable CE/PE tracked-chain snapshots for this session.</span></div>}</article>
          <article data-testid="v2-change-oi-difference-time"><header><strong>Cum PE ΔOI − CE ΔOI</strong><RefreshStamp at={active.dataUpdatedAt} /><span>All tracked strikes · {cumulativeChangeBasis}</span><ChartActions title="Cumulative PE change in OI minus cumulative CE change in OI" onExpand={() => setExpandedChart("change-oi-difference")} /></header>{cumulativeOiPoints.some((point) => point.changeOiDifference != null) ? <Suspense fallback={<p>Loading ΔOI difference…</p>}><Chart className={css.oiHistoryChart} ariaLabel="Cumulative put change in open interest minus cumulative call change in open interest over time" axisExtentPolicy="native" option={compactChangeOiDifferenceOption} activeTimeMs={v3LinkTime && inspectionTime != null ? inspectionTime * 1000 : null} onTimeHover={(value) => handleOiTimeHover(value, "change-oi-difference")} onTimeClick={pinOiTime} /></Suspense> : <div className={css.oiHistoryState}><strong>Change-in-OI history unavailable</strong><span>A comparable baseline is required; missing values are not zero.</span></div>}</article>
        </div>
        <article className={css.oiHistorySideChart} data-testid="v2-compact-range-price">
          <header><strong>Norm CE / PE · {v3RangeDisplay}</strong><RefreshStamp at={optionPriceHistory.dataUpdatedAt} /><span>CE yellow · PE blue · open 0 · high +100 · low −100</span><ChartActions title="Range-normalised CE and PE" onExpand={() => setExpandedChart("range-price")} /></header>
          {compactRangePriceModel.series.length ? <Suspense fallback={<p>Loading range-normalised prices…</p>}><Chart className={css.oiHistoryChart} ariaLabel="All tracked call and put prices range normalised from minus one hundred to plus one hundred" axisExtentPolicy="native" option={compactRangeOption} activeTimeMs={v3LinkTime && inspectionTime != null ? inspectionTime * 1000 : null} onTimeHover={(value) => handleOiTimeHover(value, "compact-range-price")} onTimeClick={pinOiTime} /></Suspense> : <div className={css.oiHistoryState}><strong>Option price history unavailable</strong><span>No exact tracked CE/PE observations exist for this session.</span></div>}
        </article>
      </section>}
      {isV3 && !v3BottomOpen && <button type="button" className={css.collapsedStrip} onClick={() => setV3BottomOpen(true)}>Show time analytics</button>}
      {railOpen && <aside className={css.rail} aria-label="Scalper V2 option chain and inspector">
        <header className={css.railHeader}><h2>{label} · CE {Number(selectedCeStrike).toLocaleString("en-IN")} / PE {Number(selectedPeStrike).toLocaleString("en-IN")}</h2><span className={css.identity}>{expiry} · <b>Selected independently</b>{selectedCeIsAtm && selectedPeIsAtm ? " · both ATM" : defaultStrike == null ? "" : ` · ATM ${defaultStrike.toLocaleString("en-IN")}`}</span></header>
        <div className={css.niftyQuote}><span>NIFTY</span><strong>{number(inspectedUnderlying)}</strong><b className={signClass(underlyingChange)}>{percent(underlyingChange)}</b></div>
        <div className={css.premiums}><div className={`${css.premium} ${css.call}`}><b>CE {Number(selectedCeStrike).toLocaleString("en-IN")}</b><strong>{price(inspectedRows[1]?.close ?? (inspectionMode === "latest" ? callLeg?.last_price : null))}</strong><small className={signClass(sessionReturn(call, inspectedRows[1]))}>Open {percent(sessionReturn(call, inspectedRows[1]))} · EMA {signed(selectedDistance(inspectedRows[1]))}</small><small>{inspectionMode === "latest" ? "Latest completed close" : inspectionMode === "locked" ? "Locked close" : "Cursor close"} · {inspectedTimeLabel(inspectedRows[1])}</small></div><div className={`${css.premium} ${css.put}`}><b>PE {Number(selectedPeStrike).toLocaleString("en-IN")}</b><strong>{price(inspectedRows[2]?.close ?? (inspectionMode === "latest" ? putLeg?.last_price : null))}</strong><small className={signClass(sessionReturn(put, inspectedRows[2]))}>Open {percent(sessionReturn(put, inspectedRows[2]))} · EMA {signed(selectedDistance(inspectedRows[2]))}</small><small>{inspectionMode === "latest" ? "Latest completed close" : inspectionMode === "locked" ? "Locked close" : "Cursor close"} · {inspectedTimeLabel(inspectedRows[2])}</small></div></div>
        <table className={css.pairMetrics} aria-label="Selected contracts snapshot metrics"><thead><tr><th>Latest snapshot</th><th className={css.callText}>CE {selectedCeStrike}</th><th className={css.putText}>PE {selectedPeStrike}</th></tr></thead><tbody>
          <tr><th>Open Interest</th><td>{compact(callProfile?.currentOi)}</td><td>{compact(putProfile?.currentOi)}</td></tr>
          <tr><th>Change in OI</th><td className={signClass(callProfile?.changeOi)}>{signed(callProfile?.changeOi)}</td><td className={signClass(putProfile?.changeOi)}>{signed(putProfile?.changeOi)}</td></tr>
          <tr><th>Change in OI %</th><td className={signClass(callProfile?.changeOi)}>{callProfile?.changeOi != null && callProfile.baselineOi ? percent(100 * callProfile.changeOi / callProfile.baselineOi) : "—"}</td><td className={signClass(putProfile?.changeOi)}>{putProfile?.changeOi != null && putProfile.baselineOi ? percent(100 * putProfile.changeOi / putProfile.baselineOi) : "—"}</td></tr>
          <tr><th>IV · %</th><td>{number(callLeg?.implied_volatility)}</td><td>{number(putLeg?.implied_volatility)}</td></tr>
          <tr><th>IV change · pp</th><td className={signClass(callLeg?.change_in_iv)}>{signed(callLeg?.change_in_iv)}</td><td className={signClass(putLeg?.change_in_iv)}>{signed(putLeg?.change_in_iv)}</td></tr>
          <tr><th>Volume</th><td>{compact(callLeg?.total_traded_volume)}</td><td>{compact(putLeg?.total_traded_volume)}</td></tr>
          <tr><th>Bid / ask qty</th><td>{compact(callLeg?.bid_qty)} / {compact(callLeg?.ask_qty)}</td><td>{compact(putLeg?.bid_qty)} / {compact(putLeg?.ask_qty)}</td></tr>
          <tr><th>Delta</th><td>{number(callLeg?.delta)}</td><td>{number(putLeg?.delta)}</td></tr>
          <tr><th>Gamma</th><td>{number(callLeg?.gamma)}</td><td>{number(putLeg?.gamma)}</td></tr>
          <tr><th>Theta</th><td>{number(callLeg?.theta)}</td><td>{number(putLeg?.theta)}</td></tr>
          <tr><th>Vega</th><td>{number(callLeg?.vega)}</td><td>{number(putLeg?.vega)}</td></tr>
          <tr><th>Bid–ask spread · ₹</th><td>{price(legSpread(callLeg))}</td><td>{price(legSpread(putLeg))}</td></tr>
        </tbody></table>
        {(inspectionMode !== "latest" || differentSnapshotDay) && <p className={css.scopeNotice}>Prices use the selected candle · OI, IV, PCR and Max Pain use the latest snapshot.</p>}
        <section className={css.structureSummary}><h3>Structure · latest snapshot</h3><div><span>OI PCR <b>{pcr == null ? "—" : pcr.toFixed(2)}</b></span><span>Max Pain <b>{maxPainValue == null ? "—" : maxPainValue.toLocaleString("en-IN")}</b></span><span>Distance <b className={signClass(inspectedUnderlying != null && maxPainValue != null ? inspectedUnderlying - maxPainValue : null)}>{signed(inspectedUnderlying != null && maxPainValue != null ? inspectedUnderlying - maxPainValue : null)} pts</b></span><span>Signal <b>{latestSignal ? `${latestSignal.direction} · ${latestSignal.state === "POTENTIAL_ENTRY_REFERENCE" ? "potential EMA alignment" : latestSignal.state === "DIRECTIONAL_ENTRY_REFERENCE" ? "OI direction entry reference" : latestSignal.state === "RETROSPECTIVE_ENTRY_REFERENCE" ? "EMA entry reference" : latestSignal.state.replaceAll("_", " ").toLowerCase()}` : "None"}</b></span></div></section>
        <div className={css.leaders}>{leaders.filter((leader) => leader.rank <= 2).map((leader) => <div className={css.leader} key={`${leader.side}-${leader.rank}`}><span className={leader.side === "CE" ? css.callText : css.putText}>{leader.side}{leader.rank}</span><b>{leader.strike.toLocaleString("en-IN")}</b><small>OI {compact(leader.currentOi)} · Δ {signed(leader.changeOi)}</small></div>)}</div>
        <div className={css.inspectionModes} data-testid="v2-inspection-mode"><div><button aria-pressed={inspectionMode === "latest"} onClick={() => { setLockedTime(null); setHoverCrosshair(null); }}>Latest</button><button aria-pressed={inspectionMode === "hover"} disabled={!hoverCrosshair}>Cursor</button><button aria-pressed={inspectionMode === "locked"} disabled={!hoverCrosshair && lockedTime == null} onClick={() => setLockedTime((current) => current ?? hoverCrosshair?.time ?? null)}>Lock time</button></div><span data-testid="v2-cursor-time">{inspectionLabel}</span></div>
        <div className={css.tabs} role="tablist">{(["time", "chain", "profile", "levels", "rules", "measure", "objects", "health"] as const).map((tab) => <button key={tab} role="tab" aria-selected={railTab === tab} onClick={() => setRailTab(tab)}>{tab === "time" ? "Snapshot" : tab === "profile" ? "ΔOI profile" : tab[0].toUpperCase() + tab.slice(1)}</button>)}</div>
        <div className={css.railBody}>
          {railTab === "time" && <div data-testid="v2-at-time-grid"><Snapshot name={label} row={inspectedRows[0]} /><Snapshot name={`Selected CE ${selectedCeStrike}`} row={inspectedRows[1]} /><Snapshot name={`Selected PE ${selectedPeStrike}`} row={inspectedRows[2]} /></div>}
          {railTab === "chain" && <table className={css.chain} onMouseLeave={() => setHoveredStrike(null)}><thead><tr><th>CE OI</th><th>Select CE</th><th>Strike</th><th>Select PE</th><th>PE OI</th></tr></thead><tbody>{strikeRows.map((strike) => { const ce = rankSource.find((row) => side(row) === "CE" && numeric(row.strike) === strike), pe = rankSource.find((row) => side(row) === "PE" && numeric(row.strike) === strike); return <tr key={strike} data-ce-selected={String(strike) === selectedCeStrike || undefined} data-pe-selected={String(strike) === selectedPeStrike || undefined} onMouseEnter={() => setHoveredStrike(strike)}><td>{compact(ce?.open_interest)}</td><td><button disabled={points.length > 0 || !ce} aria-pressed={String(strike) === selectedCeStrike} onClick={() => updateLegStrike("CE", String(strike))}>{price(ce?.last_price)}{String(strike) === selectedCeStrike ? " · Selected" : ""}</button></td><th>{strike.toLocaleString("en-IN")}{strike === defaultStrike ? " · ATM" : ""}</th><td><button disabled={points.length > 0 || !pe} aria-pressed={String(strike) === selectedPeStrike} onClick={() => updateLegStrike("PE", String(strike))}>{price(pe?.last_price)}{String(strike) === selectedPeStrike ? " · Selected" : ""}</button></td><td>{compact(pe?.open_interest)}</td></tr>; })}</tbody></table>}
          {railTab === "profile" && <section className={css.profileEvidence} aria-label="Accessible strike change in open interest profile">
            <header><strong>Strike-aligned ΔOI</strong><span>{deltaBasisLabel}<br />{profileComparable}/{profileRows.length} comparable legs</span></header>
            <div className={css.profileLegend}><span><i className={css.ce} />CE yellow</span><span><i className={css.pe} />PE blue</span><span className={css.positive}>+ right</span><span className={css.negative}>− left</span></div>
            {profileModel.duplicates > 0 && <p role="alert">{profileModel.duplicates} duplicate strike-side row(s) excluded from the visual cohort.</p>}
            <table className={css.profileTable}><thead><tr><th>Leg</th><th>Strike</th><th>Current OI</th><th>Baseline OI</th><th>ΔOI</th></tr></thead><tbody>{profileRows.map((row) => <tr key={`${row.side}-${row.strike}`} onMouseEnter={() => setHoveredStrike(row.strike)} onMouseLeave={() => setHoveredStrike(null)}><td className={row.side === "CE" ? css.callText : css.putText}>{row.side}</td><td>{row.strike.toLocaleString("en-IN")}</td><td>{row.currentOi == null ? "—" : row.currentOi.toLocaleString("en-IN")}</td><td title={`${profileBaselineLabel(row.baselineKind)} · ${row.baselineAt ?? "time unavailable"}`}>{row.baselineOi == null ? "—" : row.baselineOi.toLocaleString("en-IN")}</td><td className={row.changeOi == null ? css.neutral : row.side === "CE" ? css.callText : css.putText} title={`${row.source} · ${row.unit} · current ${row.currentAt ?? "time unavailable"}`}>{signed(row.changeOi)}</td></tr>)}</tbody></table>
            <p>Bars use one shared maximum of <strong>{formatOiAxisValue(deltaMaximum)}</strong>. Positive extends right and negative extends left from zero; yellow is CE and blue is PE. Missing baseline is dashed evidence, not zero.</p>
          </section>}
          {railTab === "levels" && <><p>Ranked from <strong>{metricLegs.length ? "the retained observed cohort" : "the nearest paired observed window"}</strong>. Off-session leaders remain here and are not promoted.</p>{leaders.map((leader) => <p key={`${leader.side}${leader.rank}`}><b>{leader.side}{leader.rank}</b> {leader.strike.toLocaleString("en-IN")} · OI {leader.currentOi.toLocaleString("en-IN")} · ΔOI {signed(leader.changeOi)}</p>)}</>}
          {railTab === "rules" && <><p><strong>{SCALPER_V2_THREE_INSTRUMENT_EMA_RULE}</strong></p><p data-testid="v2-potential-ema-count">{potentialEmaAvailability.state === "READY" ? `Potential 5m references ${potentialEmaSignals.length}` : potentialEmaAvailability.reasons.join(" · ")} · yellow stars are evidence, not executed trades</p>{potentialEmaSignals.slice(-20).map((signal) => <p key={signal.id}><b>{signal.direction}</b> · potential entry reference · {signal.setupTime}<br /><small>{signal.legs.map((leg) => `${leg.instrument} ${leg.targetSide.toLowerCase()} at ${leg.crossTime} (${leg.sourceSideCloses}/5 prior source-side closes)`).join(" · ")}</small></p>)}<p><strong>{SCALPER_ENTRY_RULE}</strong></p><p>Entry references {signalCounts.RETROSPECTIVE_ENTRY_REFERENCE ?? 0} · waiting {signalCounts.WAIT_NEXT_OPEN ?? 0} · missing {signalCounts.NEXT_BAR_MISSING ?? 0} · failed {signalCounts.NEXT_OPEN_FAILED ?? 0}</p>{signals.slice(-20).map((signal) => <p key={signal.id}><b>{signal.direction}</b> · {signal.state.replaceAll("_", " ")} · {signal.setupTime}</p>)}<p><strong>{SCALPER_DIRECTIONAL_OI_ENTRY_RULE}</strong></p><p>Independent direction/OI references {directionalSignals.filter((signal) => signal.state === "DIRECTIONAL_ENTRY_REFERENCE").length} · option price unavailable {directionalSignals.filter((signal) => signal.state === "OPTION_PRICE_UNAVAILABLE").length}</p>{directionalSignals.slice(-20).map((signal) => <p key={signal.id}><b>{signal.direction}</b> · {signal.state.replaceAll("_", " ")} · {signal.setupTime}<br /><small>OI cross {signed(signal.previousOiDifference)} → {signed(signal.oiDifference)} · ΔOI pressure {signed(signal.changeOiDifference)} vs open {signed(signal.dayOpenChangeOiDifference)} · refs {signal.matchedReferences.join(", ")}</small></p>)}</>}
          {railTab === "measure" && <><p><strong>A open → B close</strong> · illustrative, before costs/slippage, not booked P&amp;L.</p>{measurementContext && <p><strong>Locked evidence:</strong> {measurementContext.interval === 60 ? "1h" : `${measurementContext.interval}m`} · CE {measurementContext.ceStrike} / PE {measurementContext.peStrike} · {measurementContext.expiry}. Display timeframe changes do not rebind these values.</p>}<label>Quantity units <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label>A interval <select aria-label="Measurement A interval" value={points[0] ?? ""} onChange={(event) => selectMeasurementTime(0, event.target.value)}><option value="">Select exact candle</option>{measurementOptions.map((time) => <option key={`a-${time}`} value={time}>{time}</option>)}</select></label><label>B interval <select aria-label="Measurement B interval" value={points[1] ?? ""} onChange={(event) => selectMeasurementTime(1, event.target.value)}><option value="">Select exact candle</option>{measurementOptions.map((time) => <option key={`b-${time}`} value={time}>{time}</option>)}</select></label><p>{points[0] ? `A ${points[0]}` : "Click a chart candle or select A"}</p><p>{points[1] ? `B ${points[1]}` : "Then click a candle or select B"}</p>{measurement && <table className={css.metricGrid} data-testid="v2-measurement-pnl"><tbody><tr><th>Underlying points</th><td className={signClass(measurement.rows.find((row) => row.kind === "UNDERLYING")?.delta)}>{signed(measurement.rows.find((row) => row.kind === "UNDERLYING")?.delta)}</td></tr><tr><th>CE premium Δ</th><td className={signClass(measurement.rows.find((row) => row.kind === "CE")?.delta)}>{signed(measurement.rows.find((row) => row.kind === "CE")?.delta)}</td></tr><tr><th>PE premium Δ</th><td className={signClass(measurement.rows.find((row) => row.kind === "PE")?.delta)}>{signed(measurement.rows.find((row) => row.kind === "PE")?.delta)}</td></tr><tr><th>Combined premium Δ</th><td className={signClass(measurement.combined)}>{signed(measurement.combined)}</td></tr><tr><th>Illustrative P&amp;L</th><td className={signClass(measurement.pnl)}>{price(measurement.pnl)}</td></tr></tbody></table>}<button onClick={() => { setPoints([]); setMeasureMode(false); setMeasurementContext(null); }}>Clear A/B and unlock contracts</button></>}
          {railTab === "objects" && <section className={css.objectPanel} data-testid="v2-drawing-objects"><header><strong>Drawing objects</strong><span>{drawingStore.drawings.length} · {drawingStore.saveState}</span></header><div className={css.objectActions}><button type="button" data-testid="v2-clear-drawings" disabled={drawingStore.drawings.length === 0} onClick={drawingStore.clearAll}>Clear all drawings</button><small>Undo restores the cleared set.</small></div>{drawingStore.drawings.length === 0 ? <p>No saved drawings for {symbol}. Choose a tool and click its market anchors on any price pane.</p> : <ul>{drawingStore.drawings.map((drawing) => <li key={drawing.id} aria-current={drawing.id === drawingStore.selectedId}><button type="button" onClick={() => drawingStore.setSelectedId(drawing.id)}><b>{drawing.tool.replaceAll("_", " ")}</b><span>{drawing.paneRole} · {drawing.instrumentId}</span></button><div><button type="button" onClick={() => drawingStore.patch(drawing.id, { visible: !drawing.visible })}>{drawing.visible ? "Hide" : "Show"}</button><button type="button" onClick={() => drawingStore.patch(drawing.id, { locked: !drawing.locked })}>{drawing.locked ? "Unlock" : "Lock"}</button><button type="button" onClick={() => drawingStore.duplicate(drawing.id)}>Duplicate</button><button type="button" onClick={() => drawingStore.remove(drawing.id)}>Delete</button></div></li>)}</ul>}{selectedDrawing && <DrawingEditor key={`${selectedDrawing.id}:${selectedDrawing.updatedAt}`} drawing={selectedDrawing} onApply={(changes) => drawingStore.patch(selectedDrawing.id, changes)} />}</section>}
          {railTab === "health" && <><p><strong>{state}</strong> · {errors.length} source failures</p><p>Ranking: {metricLegs.length ? "Observed retained cohort" : "Nearest paired observed window; not full expiry"}</p><p>As-of {asOf}</p>{inspectionMode !== "latest" && <p><strong>Historical chain unavailable at this time.</strong> Price OHLC/EMA use the exact inspected candle; OI, PCR and payout remain separately labelled latest retained snapshot evidence.</p>}<p>OI totals are displayed in contracts; each time point retains its source and baseline kind. No account position source is connected in this view; selected pair is not a holding.</p><p>Canvas screenshot export is not provided by V2. Complete source and measurement evidence is available through JSON; chain observations through CSV.</p>{active.data.limitations.map((item) => <p key={item}>{item}</p>)}</>}
        </div>
      </aside>}
    </div>
    {referenceLevels?.sessionDate === tradingDay && <UnderlyingLevelGauge payload={referenceLevels} strikes={strikes} />}
    <section id="scalper-v2-analytics" className={css.analytics} data-testid="v2-analytics-dock">
      <div className={css.structureRibbon} aria-label="Current option structure summary"><span><b>CE OI</b>{compact(oiTotals.ceOi)}</span><span><b>PE OI</b>{compact(oiTotals.peOi)}</span><span><b>PCR</b>{oiTotals.pcr == null ? "—" : oiTotals.pcr.toFixed(2)}</span><span className={signClass(oiTotals.ceDelta)}><b>CE ΔOI</b>{signed(oiTotals.ceDelta)}</span><span className={signClass(oiTotals.peDelta)}><b>PE ΔOI</b>{signed(oiTotals.peDelta)}</span><span><b>Max Pain</b>{maxPainValue?.toLocaleString("en-IN") ?? "—"}</span><span><b>CE1</b>{leaders.find((leader) => leader.side === "CE" && leader.rank === 1)?.strike.toLocaleString("en-IN") ?? "—"}</span><span><b>PE1</b>{leaders.find((leader) => leader.side === "PE" && leader.rank === 1)?.strike.toLocaleString("en-IN") ?? "—"}</span><span><b>Signal</b>{latestSignal?.direction ?? "—"}</span></div>
      <nav className={css.analyticsTabs} aria-label="Scalper analytics">{(["overview", "matrix", "oi", "strength", "total", "maxpain"] as const).map((tab) => <button key={tab} aria-selected={analyticsTab === tab} onClick={() => setAnalyticsTab(tab)}>{tab === "oi" ? "OI & ΔOI" : tab === "strength" ? "Price Strength" : tab === "total" ? "Total OI" : tab === "maxpain" ? "Max Pain" : tab[0].toUpperCase() + tab.slice(1)}</button>)}</nav>
      {(analyticsTab === "overview" || analyticsTab === "matrix") && <div className={css.matrixWrap} data-testid="v2-strike-matrix"><div className={css.matrixContext}><strong>Option Structure Matrix</strong><span>{inspectionMode === "latest" ? "Latest snapshot" : "Latest snapshot · price charts at selected time"}</span></div><table className={css.structureMatrix} onMouseLeave={() => setHoveredStrike(null)}><thead><tr><th>CE Price</th><th>CE Δ%</th><th>CE OI</th><th>CE ΔOI</th><th>CE Rank</th><th>Strike</th><th>PE Rank</th><th>PE ΔOI</th><th>PE OI</th><th>PE Δ%</th><th>PE Price</th></tr></thead><tbody>{structureRows.map((row) => <tr key={row.strike} onMouseEnter={() => setHoveredStrike(row.strike)} data-ce-selected={row.strike === Number(selectedCeStrike) || undefined} data-pe-selected={row.strike === Number(selectedPeStrike) || undefined}><td className={css.callText}>{price(row.ce.price)}</td><td className={signClass(row.ce.priceChangePct)}>{percent(row.ce.priceChangePct)}</td><td className={css.barCell}><i className={css.ceBar} style={{ width: `${100 * (row.ce.oi ?? 0) / structureOiMaximum}%` }} />{compact(row.ce.oi)}</td><td className={`${css.barCell} ${signClass(row.ce.changeOi) ?? ""}`}><i className={row.ce.changeOi != null && row.ce.changeOi < 0 ? css.negativeBar : css.positiveBar} style={{ width: `${100 * Math.abs(row.ce.changeOi ?? 0) / structureDeltaMaximum}%` }} />{signed(row.ce.changeOi)}</td><td>{row.ce.rank ? <b className={css.callRank}>CE{row.ce.rank}</b> : ""}</td><th>{row.strike.toLocaleString("en-IN")}{row.strike === defaultStrike ? <em>ATM</em> : null}{maxPain.candidates.includes(row.strike) ? <em className={css.maxPainBadge}>MAX</em> : null}{row.strike === nearestSpotStrike ? <span className={css.spotMarker}>NIFTY {number(spot)}</span> : null}</th><td>{row.pe.rank ? <b className={css.putRank}>PE{row.pe.rank}</b> : ""}</td><td className={`${css.barCell} ${signClass(row.pe.changeOi) ?? ""}`}><i className={row.pe.changeOi != null && row.pe.changeOi < 0 ? css.negativeBar : css.positiveBar} style={{ width: `${100 * Math.abs(row.pe.changeOi ?? 0) / structureDeltaMaximum}%` }} />{signed(row.pe.changeOi)}</td><td className={css.barCell}><i className={css.peBar} style={{ width: `${100 * (row.pe.oi ?? 0) / structureOiMaximum}%` }} />{compact(row.pe.oi)}</td><td className={signClass(row.pe.priceChangePct)}>{percent(row.pe.priceChangePct)}</td><td className={css.putText}>{price(row.pe.price)}</td></tr>)}</tbody></table></div>}
      {analyticsTab === "overview" && <div className={css.overviewKpis}><article><small>OI imbalance</small><b>{oiTotals.oiImbalance == null ? "—" : percent(100 * oiTotals.oiImbalance)}</b></article><article><small>ΔOI imbalance</small><b>{oiTotals.deltaImbalance == null ? "—" : percent(100 * oiTotals.deltaImbalance)}</b></article><article><small>Tracked strikes</small><b>{structureRows.length}</b></article><article><small>OI history</small><b>{cumulativeOiPoints.length} points</b></article></div>}
      {analyticsTab === "oi" && <div className={css.analyticsGrid}><article className={css.analyticCard}><h3>OI by strike <RefreshStamp at={active.dataUpdatedAt} /></h3><Suspense fallback={<p>Loading chart…</p>}><Chart className={css.analyticChart} ariaLabel="Open interest by strike" axisExtentPolicy="native" option={analyticOptions[0]} activeCategoryIndex={activeStrikeIndex} onCategoryHover={(index) => setHoveredStrike(index == null ? null : strikeRows[index] ?? null)} /></Suspense></article><article id="scalper-v2-deltaoi" className={css.analyticCard} data-testid="v2-deltaoi-chart"><h3>Change in OI by strike <RefreshStamp at={active.dataUpdatedAt} /></h3>{deltaState.state === "baseline_unavailable" || deltaState.state === "current_unavailable" ? <div className={css.stateCard} data-testid="v2-deltaoi-state"><strong>{deltaState.state === "baseline_unavailable" ? "Baseline unavailable" : "Current OI unavailable"}</strong><span>{deltaState.comparable}/{deltaState.total} comparable contracts</span></div> : <Suspense fallback={<p>Loading chart…</p>}><Chart className={css.deltaOiChart} ariaLabel="Change in OI by strike with adaptive signed scale" axisExtentPolicy="native" option={analyticOptions[1]} activeCategoryIndex={activeStrikeIndex} onCategoryHover={(index) => setHoveredStrike(index == null ? null : strikeRows[index] ?? null)} /></Suspense>}</article></div>}
      {analyticsTab === "strength" && <article className={css.dockPanel} data-testid="v2-normalized-option-price"><header className={css.dockControls}><h3>Option price strength <RefreshStamp at={optionPriceHistory.dataUpdatedAt} /></h3><label>Mode <select value={priceMode} onChange={(event) => setPriceMode(event.target.value as ScalperV2PriceMode)}><option value="return">Return from Open %</option><option value="indexed">Indexed to 100</option><option value="relative">Relative to ATM</option><option value="range">Range Normalised</option></select></label><label><input type="checkbox" checked={showAllPriceSeries} onChange={(event) => setShowAllPriceSeries(event.target.checked)} /> Show all strikes</label></header>{normalizedPriceModel.series.length ? <><Suspense fallback={<p>Loading chart…</p>}><Chart className={css.normalizedPriceChart} ariaLabel="Option price strength over time" axisExtentPolicy="native" option={normalizedPriceOption} activeTimeMs={inspectionTime == null ? null : inspectionTime * 1000} onTimeHover={(value) => handleOiTimeHover(value, "price-strength")} /></Suspense><h3>All-strike return heatmap <RefreshStamp at={optionPriceHistory.dataUpdatedAt} /></h3><Suspense fallback={<p>Loading heatmap…</p>}><Chart className={css.heatmapChart} ariaLabel="Option return from open heatmap by time and strike" axisExtentPolicy="native" option={optionPriceHeatmap} /></Suspense></> : <div className={css.stateCard}><strong>Option price history unavailable</strong></div>}</article>}
      {analyticsTab === "total" && <article className={css.dockPanel} data-testid="v2-cumulative-oi-time"><h3>Total OI, differences and PCR vs Time <RefreshStamp at={active.dataUpdatedAt} /></h3><div className={css.overviewKpis}><article><small>CE Total OI</small><b>{compact(cumulativeLatest?.ceOi)}</b></article><article><small>PE Total OI</small><b>{compact(cumulativeLatest?.peOi)}</b></article><article><small>OI PCR</small><b>{cumulativeLatest?.pcr?.toFixed(3) ?? "—"}</b></article><article><small>Snapshot coverage</small><b>{cumulativeOiComplete}/{cumulativeOiPoints.length} OI · {cumulativeChangeComplete}/{cumulativeOiPoints.length} ΔOI</b><small>{cumulativeStrikeCounts.length ? `${cumulativeStrikeCounts.join("–")} strikes` : "Unavailable"}</small></article></div>{cumulativeOiPoints.length ? <div className={css.oiTimeGrid}><section className={css.oiTimeWide}><h4>CE and PE total OI <RefreshStamp at={active.dataUpdatedAt} /></h4><Suspense fallback={<p>Loading chart…</p>}><Chart className={css.cumulativeOiChart} ariaLabel="Total CE and PE open interest over time" axisExtentPolicy="native" option={cumulativeOiOption} activeTimeMs={inspectionTime == null ? null : inspectionTime * 1000} onTimeHover={(value) => handleOiTimeHover(value, "total-oi")} /></Suspense></section><section data-testid="v2-oi-differences-time"><h4>Put minus call OI and reported change in OI <RefreshStamp at={active.dataUpdatedAt} /></h4><Suspense fallback={<p>Loading difference chart…</p>}><Chart className={css.oiDifferenceChart} ariaLabel="Put minus call total OI and put minus call reported change in OI over time" axisExtentPolicy="native" option={cumulativeDifferenceOption} activeTimeMs={inspectionTime == null ? null : inspectionTime * 1000} onTimeHover={(value) => handleOiTimeHover(value, "oi-differences")} /></Suspense></section><section data-testid="v2-pcr-time"><h4>OI PCR over time · PE OI / CE OI <RefreshStamp at={active.dataUpdatedAt} /></h4><Suspense fallback={<p>Loading PCR chart…</p>}><Chart className={css.oiDifferenceChart} ariaLabel="Open interest PCR over time" axisExtentPolicy="native" option={cumulativePcrOption} activeTimeMs={inspectionTime == null ? null : inspectionTime * 1000} onTimeHover={(value) => handleOiTimeHover(value, "pcr-time")} /></Suspense></section></div> : <div className={css.stateCard}><strong>OI history unavailable</strong></div>}</article>}
      {analyticsTab === "maxpain" && <article className={css.dockPanel}><div className={css.maxPainKpi}><span>Max Pain <RefreshStamp at={active.dataUpdatedAt} /></span><strong>{maxPainValue?.toLocaleString("en-IN") ?? "—"}</strong><b>{inspectedUnderlying != null && maxPainValue != null ? `${signed(inspectedUnderlying - maxPainValue)} pts from NIFTY` : "Distance unavailable"}</b></div><Suspense fallback={<p>Loading chart…</p>}><Chart className={css.analyticChart} ariaLabel="Max pain payout distribution" axisExtentPolicy="native" option={analyticOptions[2]} activeCategoryIndex={hoveredPayoutIndex} onCategoryHover={(index) => setHoveredStrike(index == null ? null : maxPain.points[index]?.settlement ?? null)} /></Suspense></article>}
    </section>
    {expandedChart && <ChartOverlay title={expandedCharts[expandedChart].title} option={expandedCharts[expandedChart].option} onClose={() => setExpandedChart(null)} />}
    {chartInfo && <ChartInfoOverlay kind={chartInfo} onClose={() => setChartInfo(null)} />}
    {isV3 && v3HelpOpen && <div className={css.chartOverlay} role="dialog" aria-modal="true" aria-label="Scalper V3 keyboard shortcuts"><header><h2>Keyboard shortcuts</h2><button type="button" onClick={() => setV3HelpOpen(false)}>Close</button></header><div className={css.shortcutHelp}><kbd>1</kbd><span>Maximise NIFTY</span><kbd>2</kbd><span>Maximise CE</span><kbd>3</kbd><span>Maximise PE</span><kbd>L / End</kbd><span>Return to live / latest candle</span><kbd>K</kbd><span>Pin/unpin cursor time</span><kbd>← / →</kbd><span>Previous/next candle; Shift jumps five</span><kbd>↑ / ↓</kbd><span>Move locked strike one interval</span><kbd>Home</kbd><span>Jump to session open</span><kbd>Space</kbd><span>What changed overlay</span><kbd>Shift+click</kbd><span>Set comparison point B after point A</span><kbd>B</kbd><span>Collapse/restore bottom strip</span><kbd>Esc</kbd><span>Clear pins and restore workspace</span><kbd>?</kbd><span>Toggle this help</span></div></div>}
    <details><summary>Indicator evidence</summary><p>Underlying RSI14 and MACD are calculated from retained completed bars before the selected day is sliced for display.</p><table className={css.snapshotGrid}><thead><tr><th>End</th><th>RSI14</th><th>MACD</th><th>Signal</th></tr></thead><tbody>{indicators.filter((row) => istDay(row.time) === tradingDay).slice(-20).map((row) => <tr key={row.time}><td>{row.time}</td><td>{row.rsi?.toFixed(2) ?? "—"}</td><td>{row.macd?.toFixed(4) ?? "—"}</td><td>{row.signal?.toFixed(4) ?? "—"}</td></tr>)}</tbody></table></details>
  </section>;
}
