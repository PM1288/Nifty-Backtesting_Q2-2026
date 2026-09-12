import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import type { EChartsOption } from "echarts";
import { getJson } from "../lib/api";
import { evidenceCsv } from "../lib/tradingAnalyticsExport";
import { MwhdRankBadge } from "../features/mwhd/MwhdRankBadge";
import { useMwhdRankings } from "../features/mwhd/useMwhdRankings";
import { dayRows, istDay } from "../lib/tradingAnalyticsChartView";
import { measurePanes, scalperIndicators } from "../lib/scalperMeasurement";
import { SCALPER_ENTRY_RULE, scalperPairedBody70Signals } from "../lib/scalperSignals";
import { formatOiAxisValue, maxPainDistribution, oiPcr, rankCurrentOi } from "../lib/scalperV2";
import { scalperV2HorizontalDeltaOiOption } from "../lib/scalperV2Analytics";
import { scalperV2NormalizedPriceSeries, visibleScalperV2PriceSeries, type ScalperV2OptionPricePoint, type ScalperV2PriceMode } from "../lib/scalperV2NormalizedPrice";
import { scalperV2OiTotals, scalperV2StructureRows } from "../lib/scalperV2Structure";
import { oiComparisonState } from "../lib/scalperV2Geometry";
import { normalizeScalperV2ProfileRows, profileBaselineLabel } from "../lib/scalperV2OiProfile";
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
  state: "COMPLETE" | "PARTIAL";
};
type ChartPayload = {
  panes: ChartPane[];
  availableContracts: AvailableScalperContract[];
  limitations: string[];
  interval: number;
  asOf: string;
  cumulativeOiHistory?: {
    expiry: string | null;
    unit: "provider_native_oi";
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
const exactAt = (rows: Row[], selectedTime: number | null) => selectedTime == null ? latest(rows) : rows.find((row) => row.closed === true && Math.floor(Date.parse(String(row.end)) / 1000) === selectedTime);
const chartQuery = (symbol: string, asOf: string, expiry: string, ceStrike: string, peStrike: string, interval: number) => {
  const query = new URLSearchParams({ symbol, asOf, interval: String(interval), historyDays: "3" });
  return applyScalperLegsToChartQuery(query, expiry, { ceStrike, peStrike });
};
const chartKey = (query: URLSearchParams) => ["trading-analytics-charts", query.toString()] as const;
const signClass = (value: unknown) => numeric(value) == null || numeric(value) === 0 ? undefined : numeric(value)! > 0 ? css.positive : css.negative;
const legSpread = (row: Row | undefined) => {
  const bid = numeric(row?.bid_price), ask = numeric(row?.ask_price);
  return bid == null || ask == null ? null : ask - bid;
};
const istClock = (value: number) => new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false,
}).format(new Date(value));
const percent = (value: unknown) => numeric(value) == null ? "—" : `${Number(value) > 0 ? "+" : ""}${number(value)}%`;

function Snapshot({ name, row }: { name: string; row: Row | undefined }) {
  const ema = numeric(row?.ema9), close = numeric(row?.close), distance = ema == null || close == null ? null : close - ema;
  return <section className={css.instrumentSnapshot}><h3>{name}</h3><div className={css.valueGrid}>{[
    ["Open", row?.open], ["High", row?.high], ["Low", row?.low], ["Close", row?.close], ["EMA9", row?.ema9], ["C − EMA", distance],
  ].map(([label, value]) => <div key={String(label)}><small>{String(label)}</small><strong className={label === "C − EMA" ? signClass(value) : undefined}>{label === "C − EMA" ? signed(value) : number(value)}</strong></div>)}</div>
    <p className={css.snapshotMeta}>{row ? `Completed candle · ${String(row.end)}` : "No exact completed candle at this time"}</p></section>;
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

export function TradingAnalyticsScalperV2({ symbol, label, asOf, expiry, strikes, spot, legs, metricLegs = [], state, errors = [] }: {
  symbol: string; label: string; asOf: string; expiry: string; strikes: number[]; spot: number | null;
  legs: Row[]; metricLegs?: Row[]; state: string; errors?: Row[];
}) {
  const [params, setParams] = useSearchParams(), client = useQueryClient();
  const mwhd = useMwhdRankings();
  const selectedDayParam = params.get("day");
  const interval = [1, 5, 15, 60].includes(Number(params.get("interval"))) ? Number(params.get("interval")) : 5;
  const defaultStrike = nearestScalperStrike(strikes, spot);
  const { ceStrike: selectedCeStrike, peStrike: selectedPeStrike } = scalperLegSelection(params, defaultStrike);
  const query = chartQuery(symbol, asOf, expiry, selectedCeStrike, selectedPeStrike, interval);
  const active = useQuery({ queryKey: chartKey(query), queryFn: () => getJson<ChartPayload>(`/v1/trading-analytics/charts?${query}`), staleTime: 30_000, retry: 1 });
  const optionPriceHistory = useQuery({
    queryKey: ["trading-analytics-option-price-history", symbol, expiry, asOf],
    queryFn: () => getJson<OptionPriceHistoryPayload>(`/v1/trading-analytics/option-price-history?${new URLSearchParams({ symbol, expiry, asOf, historyDays: "3" })}`),
    enabled: Boolean(expiry),
    staleTime: 30_000,
    retry: 1,
  });
  useEffect(() => {
    if (!active.data || (selectedCeStrike && selectedPeStrike)) return;
    const ceStrike = selectedCeStrike || String(nearestScalperStrike(availableScalperStrikes(active.data.availableContracts, expiry, "CE"), spot) ?? "");
    const peStrike = selectedPeStrike || String(nearestScalperStrike(availableScalperStrikes(active.data.availableContracts, expiry, "PE"), spot) ?? "");
    if (ceStrike && peStrike) setParams(setScalperLegSelection(params, { ceStrike, peStrike }), { replace: true });
  }, [active.data, expiry, params, selectedCeStrike, selectedPeStrike, setParams, spot]);
  useEffect(() => {
    if (!active.data) return;
    for (const backgroundInterval of [1, 5, 15, 60]) {
      if (backgroundInterval === interval) continue;
      const background = chartQuery(symbol, asOf, expiry, selectedCeStrike, selectedPeStrike, backgroundInterval);
      void client.prefetchQuery({ queryKey: chartKey(background), queryFn: () => getJson<ChartPayload>(`/v1/trading-analytics/charts?${background}`), staleTime: 30_000 });
    }
  }, [active.data, asOf, client, expiry, interval, selectedCeStrike, selectedPeStrike, symbol]);

  const [hoverCrosshair, setHoverCrosshair] = useState<ScalperV2Crosshair>(null);
  const [lockedTime, setLockedTime] = useState<number | null>(null);
  const [linkedRange, setLinkedRange] = useState<ScalperV2TimeRange>(null);
  const [hoveredStrike, setHoveredStrike] = useState<number | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [horizontalView, setHorizontalView] = useState<ScalperV2HorizontalView>("day");
  const [verticalView, setVerticalView] = useState<ScalperV2VerticalView>("session"), [yLocked, setYLocked] = useState(false);
  const [railOpen, setRailOpen] = useState(true), [railTab, setRailTab] = useState<RailTab>("time");
  const [measureMode, setMeasureMode] = useState(false), [points, setPoints] = useState<string[]>([]), [quantity, setQuantity] = useState("65");
  const [measurementContext, setMeasurementContext] = useState<{ panes: ChartPane[]; interval: number; symbol: string; expiry: string; ceStrike: string; peStrike: string } | null>(null);
  const [drawingTool, setDrawingTool] = useState<ScalperV2DrawingTool>("select");
  const [profileMode, setProfileMode] = useState<"current" | "change" | "structure">("structure");
  const [profileRangeExpanded, setProfileRangeExpanded] = useState(false);
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>("overview");
  const [priceMode, setPriceMode] = useState<ScalperV2PriceMode>("return");
  const [showAllPriceSeries, setShowAllPriceSeries] = useState(false);
  const drawingStore = useScalperV2Drawings(symbol);
  const drawingSelectedId = drawingStore.selectedId, removeDrawing = drawingStore.remove;
  const inspectionMode: ScalperV2InspectionMode = lockedTime != null ? "locked" : hoverCrosshair ? "hover" : "latest";
  const inspectionTime = lockedTime ?? hoverCrosshair?.time ?? null;
  const crosshair = lockedTime == null ? hoverCrosshair : { time: lockedTime, source: "locked", sequence: lockedTime };

  useEffect(() => {
    const clear = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setLockedTime(null); setHoverCrosshair(null); setDrawingTool("select"); }
      if ((event.key === "Delete" || event.key === "Backspace") && drawingSelectedId && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) removeDrawing(drawingSelectedId);
    };
    window.addEventListener("keydown", clear); return () => window.removeEventListener("keydown", clear);
  }, [drawingSelectedId, removeDrawing]);
  useEffect(() => { setFitRequest((value) => value + 1); setVerticalView("session"); setProfileRangeExpanded(false); setYLocked(false); setLockedTime(null); setHoverCrosshair(null); }, [symbol, expiry, selectedCeStrike, selectedPeStrike, interval, selectedDayParam]);

  const activeData = active.data;
  const rawPanes = useMemo(() => activeData?.panes ?? [], [activeData]);
  const days = useMemo(() => [...new Set((rawPanes[0]?.bars ?? []).map((row) => istDay(row.end)).filter(Boolean))].sort().reverse(), [rawPanes]);
  const tradingDay = selectedDayParam && days.includes(selectedDayParam) ? selectedDayParam : (days[0] ?? "");
  const panes = useMemo(() => rawPanes.map((pane) => ({ ...pane, bars: dayRows(pane.bars, tradingDay, "end"), oiHistory: dayRows(pane.oiHistory, tradingDay, "event_time") })), [rawPanes, tradingDay]);
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
  const callSignals = useMemo(() => signals.filter((signal) => signal.direction === "CALL"), [signals]);
  const putSignals = useMemo(() => signals.filter((signal) => signal.direction === "PUT"), [signals]);
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
  const deltaBasisLabel = `${profileBaselineLabel(profileModel.baselineKind)} ΔOI`;
  const { ceCurrent, peCurrent, ceChanges, peChanges } = useMemo(() => {
    const currentSeries = (wanted: "CE" | "PE") => strikeRows.map((strike) => profileRows.find((row) => row.side === wanted && row.strike === strike)?.currentOi ?? null);
    const changeSeries = (wanted: "CE" | "PE") => strikeRows.map((strike) => profileRows.find((row) => row.side === wanted && row.strike === strike)?.changeOi ?? null);
    return { ceCurrent: currentSeries("CE"), peCurrent: currentSeries("PE"), ceChanges: changeSeries("CE"), peChanges: changeSeries("PE") };
  }, [profileRows, strikeRows]);
  const deltaState = useMemo(() => oiComparisonState(
    profileRows.map((row) => row.currentOi),
    profileRows.map((row) => row.state === "comparable" ? row.baselineOi : null),
  ), [profileRows]);
  const deltaMaximum = Math.max(0, ...[...ceChanges, ...peChanges].flatMap((value) => value == null ? [] : [Math.abs(value)]));
  const profileComparable = profileRows.filter((row) => row.state === "comparable").length;
  const structureRows = useMemo(() => scalperV2StructureRows(rankSource, profileRows, leaders), [leaders, profileRows, rankSource]);
  const oiTotals = useMemo(() => scalperV2OiTotals(profileRows), [profileRows]);
  const cumulativeOiPoints = useMemo(
    () => (activeData?.cumulativeOiHistory?.points ?? []).filter((point) => istDay(point.capturedAt) === tradingDay),
    [activeData?.cumulativeOiHistory?.points, tradingDay],
  );
  const cumulativeOiComplete = cumulativeOiPoints.filter((point) => point.state === "COMPLETE").length;
  const cumulativeStrikeCounts = [...new Set(cumulativeOiPoints.map((point) => point.strikeCount).filter((value): value is number => value != null))].sort((a, b) => a - b);
  const cumulativeOiOption = useMemo<EChartsOption>(() => ({
    animation: false,
    tooltip: { trigger: "axis" },
    legend: { data: ["CE Total OI", "PE Total OI"], top: 2 },
    grid: { left: 72, right: 24, top: 42, bottom: 52 },
    xAxis: {
      type: "time",
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
        lineStyle: { color: "#2563eb", width: 2 },
        itemStyle: { color: "#2563eb" },
      },
      {
        name: "PE Total OI",
        type: "line",
        data: cumulativeOiPoints.map((point) => [Date.parse(point.capturedAt), point.peOi]),
        connectNulls: false,
        showSymbol: cumulativeOiPoints.length <= 1,
        symbolSize: 7,
        lineStyle: { color: "#eab308", width: 2 },
        itemStyle: { color: "#eab308" },
      },
    ],
  }), [cumulativeOiPoints]);
  const normalizedPriceModel = useMemo(() => scalperV2NormalizedPriceSeries(
    (optionPriceHistory.data?.points ?? []).filter((point) => istDay(point.capturedAt) === tradingDay),
    numeric(selectedCeStrike),
    numeric(selectedPeStrike),
    priceMode,
    defaultStrike,
    defaultStrike,
  ), [defaultStrike, optionPriceHistory.data?.points, priceMode, selectedCeStrike, selectedPeStrike, tradingDay]);
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
    xAxis: { type: "time", name: "Timestamp · IST", nameGap: 42, axisLabel: { formatter: (value: number) => istClock(value) } },
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
  }), [priceMode, visiblePriceSeries]);
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
  const oiNiftyCurrentGuide = useMemo(
    () => niftyCurrentGuide(nearestSpotStrike == null ? -1 : strikeRows.indexOf(nearestSpotStrike)),
    [nearestSpotStrike, niftyCurrentGuide, strikeRows],
  );
  const payoutNiftyCurrentGuide = useMemo(
    () => niftyCurrentGuide(nearestSpotStrike == null ? -1 : maxPain.points.findIndex((point) => point.settlement === nearestSpotStrike)),
    [maxPain.points, nearestSpotStrike, niftyCurrentGuide],
  );
  const analyticOptions = useMemo<EChartsOption[]>(() => [
    { tooltip: { trigger: "axis" }, legend: { data: ["CE OI", "PE OI"], top: 2, left: 86 }, grid: { left: 72, right: 20, top: 38, bottom: 48 }, xAxis: { type: "category", data: strikeRows, name: "Strike", nameGap: 30 }, yAxis: { type: "value", min: 0, axisLine: { show: true }, axisTick: { show: true }, axisLabel: { formatter: formatOiAxisValue, margin: 9 }, splitNumber: 5 }, series: [{ name: "CE OI", type: "bar", data: ceCurrent, itemStyle: { color: "#2563eb" }, markLine: oiNiftyCurrentGuide }, { name: "PE OI", type: "bar", data: peCurrent, itemStyle: { color: "#eab308" } }] },
    scalperV2HorizontalDeltaOiOption(strikeRows, ceChanges, peChanges, spot, nearestSpotStrike),
    { tooltip: { trigger: "axis" }, legend: { data: ["Call payout", "Put payout", "Combined"] }, grid: { left: 72, right: 20, top: 42, bottom: 52 }, xAxis: { type: "category", data: maxPain.points.map((point) => point.settlement) }, yAxis: { type: "value", name: "Common-unit payout" }, series: [{ name: "Call payout", type: "line", data: maxPain.points.map((point) => point.callPayout), lineStyle: { color: "#2563eb" }, markLine: payoutNiftyCurrentGuide }, { name: "Put payout", type: "line", data: maxPain.points.map((point) => point.putPayout), lineStyle: { color: "#eab308" } }, { name: "Combined", type: "line", data: maxPain.points.map((point) => point.totalPayout), lineStyle: { color: "#14243a", width: 3 } }] },
  ], [ceChanges, ceCurrent, maxPain.points, nearestSpotStrike, oiNiftyCurrentGuide, payoutNiftyCurrentGuide, peChanges, peCurrent, spot, strikeRows]);

  const selectTime = (time: string) => {
    const seconds = Math.floor(Date.parse(time) / 1000);
    if (!measureMode) { setLockedTime(seconds); setRailTab("time"); return; }
    setPoints((current) => {
      if (current.length !== 1) {
        setMeasurementContext({ panes, interval, symbol, expiry, ceStrike: selectedCeStrike, peStrike: selectedPeStrike });
        return [time];
      }
      return [current[0], time].sort();
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
  const handleCrosshair = (value: ScalperV2Crosshair) => { if (lockedTime == null) setHoverCrosshair(value); };
  const instrumentId = (paneRole: ScalperV2PaneRole) => String((paneRole === "underlying" ? underlying : paneRole === "call" ? call : put)?.identity.tradingsymbol ?? `${symbol}:${paneRole}`);
  const createDrawing = (tool: Exclude<ScalperV2DrawingTool, "select">, paneRole: ScalperV2PaneRole, anchors: ScalperV2DrawingAnchor[]) => {
    const drawing = createScalperV2Drawing({ id: drawingStore.newId(), tool, paneRole, instrumentId: instrumentId(paneRole), anchors });
    drawingStore.upsert(drawing); setDrawingTool("select"); setRailOpen(true); setRailTab("objects");
  };
  const selectedDrawing = drawingStore.drawings.find((drawing) => drawing.id === drawingStore.selectedId) ?? null;
  const inspectionLabel = inspectionMode === "latest" ? "Latest completed candles" : `${inspectionMode === "locked" ? "Locked" : "At cursor"} · ${inspectionTime == null ? "—" : new Date(inspectionTime * 1000).toISOString()}`;
  const signalCounts = useMemo(() => Object.fromEntries(["WAIT_NEXT_OPEN", "NEXT_BAR_MISSING", "NEXT_OPEN_FAILED", "RETROSPECTIVE_ENTRY_REFERENCE"].map((key) => [key, signals.filter((signal) => signal.state === key).length])), [signals]);
  const hoveredStrikeIndex = hoveredStrike == null ? null : strikeRows.indexOf(hoveredStrike);
  const hoveredPayoutIndex = hoveredStrike == null ? null : maxPain.points.findIndex((point) => point.settlement === hoveredStrike);
  const callProfile = profileRows.find((row) => row.side === "CE" && row.strike === numeric(selectedCeStrike));
  const putProfile = profileRows.find((row) => row.side === "PE" && row.strike === numeric(selectedPeStrike));
  const maxPainValue = maxPain.candidates[0] ?? null;
  const inspectedUnderlying = numeric(inspectedRows[0]?.close) ?? spot;
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
  const latestSignal = signals.filter((signal) => signal.state === "RETROSPECTIVE_ENTRY_REFERENCE").at(-1) ?? signals.at(-1);
  const structureOiMaximum = Math.max(1, ...structureRows.flatMap((row) => [row.ce.oi ?? 0, row.pe.oi ?? 0]));
  const structureDeltaMaximum = Math.max(1, ...structureRows.flatMap((row) => [Math.abs(row.ce.changeOi ?? 0), Math.abs(row.pe.changeOi ?? 0)]));

  if (!active.data) return <section className={css.loading} role="status">{active.isLoading ? `Loading ${label} ${interval}m first…` : "Exact chart context unavailable."}</section>;
  return <section className={css.page} data-testid="scalper-v2">
    <header className={css.commandBar}>
      <strong>Scalper V2</strong><MwhdRankBadge ranking={mwhd.rankings.get(symbol.toUpperCase())} />
      <div className={css.commandGroup}><span>Time</span><label>Session <select value={tradingDay} onChange={(event) => update("day", event.target.value)}>{days.map((day) => <option key={day}>{day}</option>)}</select></label>{[1, 5, 15, 60].map((value) => <button key={value} aria-current={interval === value ? "page" : undefined} onClick={() => update("interval", String(value))}>{value === 60 ? "1h" : `${value}m`}</button>)}<button aria-pressed={horizontalView === "day"} onClick={() => { setHorizontalView("day"); setFitRequest((value) => value + 1); }}>Fit day</button></div>
      <div className={css.commandGroup}><span>Contract</span><label>CE <select aria-label="Selected CE strike" value={selectedCeStrike} disabled={points.length > 0} onChange={(event) => updateLegStrike("CE", event.target.value)}>{selectableCeStrikes.map((strike) => <option key={strike} value={strike}>{strike.toLocaleString("en-IN")}</option>)}</select></label><label>PE <select aria-label="Selected PE strike" value={selectedPeStrike} disabled={points.length > 0} onChange={(event) => updateLegStrike("PE", event.target.value)}>{selectablePeStrikes.map((strike) => <option key={strike} value={strike}>{strike.toLocaleString("en-IN")}</option>)}</select></label><button disabled={points.length > 0 || defaultStrike == null} onClick={selectBothAtm}>Both ATM</button><small>{expiry || "Expiry unavailable"}</small></div>
      <details className={css.commandMenu}><summary>Scale</summary><div><button aria-pressed={verticalView === "session" && !profileRangeExpanded} onClick={() => { setVerticalView("session"); setProfileRangeExpanded(false); setYLocked(false); }}>Session Y</button><button aria-pressed={profileRangeExpanded} disabled={!profileRows.length} onClick={() => { setVerticalView("session"); setProfileRangeExpanded(true); setYLocked(false); }}>All strikes Y</button><button aria-pressed={verticalView === "visible"} onClick={() => { setVerticalView("visible"); setProfileRangeExpanded(false); setYLocked(false); }}>Visible Y</button><button aria-pressed={verticalView === "manual"} onClick={() => { setVerticalView("manual"); setProfileRangeExpanded(false); setYLocked(false); }}>Manual Y</button><button aria-pressed={yLocked} onClick={() => setYLocked((value) => !value)}>{yLocked ? "Unlock Y" : "Lock Y"}</button><button onClick={() => { setHorizontalView("last30"); setFitRequest((value) => value + 1); }}>Last 30</button><button onClick={() => { setHorizontalView("last60"); setFitRequest((value) => value + 1); }}>Last 60</button></div></details>
      <details className={css.commandMenu}><summary>OI</summary><div><button aria-pressed={profileMode === "structure"} onClick={() => setProfileMode("structure")}>OI + ΔOI profile</button><button aria-pressed={profileMode === "current"} onClick={() => setProfileMode("current")}>Current OI</button><button aria-pressed={profileMode === "change"} onClick={() => setProfileMode("change")}>Change in OI</button><button onClick={() => { setAnalyticsTab("matrix"); document.getElementById("scalper-v2-analytics")?.scrollIntoView({ block: "nearest" }); }}>Strike matrix</button></div></details>
      <details className={css.commandMenu}><summary>Tools</summary><div><button aria-pressed={measureMode} onClick={() => { setMeasureMode(!measureMode); if (!measureMode) setRailTab("measure"); }}>Measure A–B</button><button onClick={drawingStore.undo} disabled={!drawingStore.canUndo}>Undo drawing</button><button onClick={drawingStore.redo} disabled={!drawingStore.canRedo}>Redo drawing</button><button onClick={() => { setRailOpen(true); setRailTab("objects"); }}>Drawings</button></div></details>
      <details className={css.commandMenu}><summary>More</summary><div><button aria-pressed={railOpen} onClick={() => setRailOpen(!railOpen)}>{railOpen ? "Hide inspector" : "Show inspector"}</button><button onClick={() => { const body = JSON.stringify({ version: "SCALPER_V2_WORKSTATION_V2", symbol, expiry, selectedCeStrike, selectedPeStrike, interval, asOf, tradingDay, inspectionMode, inspectionTime, horizontalView, priceMode, rankLevels: leaders, source: contextRows, chart: active.data, optionPriceHistory: optionPriceHistory.data ?? null, drawings: drawingStore.drawings, measurement }, null, 2); const url = URL.createObjectURL(new Blob([body], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `scalper-v2-${symbol}-${tradingDay || "current"}.json`; anchor.click(); URL.revokeObjectURL(url); }}>Export JSON</button><button onClick={() => { const url = URL.createObjectURL(new Blob([evidenceCsv(contextRows)], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `scalper-v2-chain-${symbol}-${tradingDay || "current"}.csv`; anchor.click(); URL.revokeObjectURL(url); }}>Chain CSV</button><button onClick={() => { setRailOpen(true); setRailTab("health"); }}>Data health</button></div></details>
    </header>
    <div className={css.statusBar}><strong>{state}</strong><span>{interval === 60 ? "1h" : `${interval}m`} · {tradingDay}</span><span>Signals {signalCounts.RETROSPECTIVE_ENTRY_REFERENCE ?? 0}</span><button className={errors.length ? css.statusIssue : undefined} onClick={() => { setRailOpen(true); setRailTab("health"); }}>Data health {errors.length ? `· ${errors.length} issues` : "· current"}</button></div>
    {active.error && <div className={css.warning} role="alert">The selected timeframe could not refresh. Cached timeframes remain available.</div>}
    <div className={css.workspace} style={!railOpen ? { gridTemplateColumns: "minmax(0,1fr)" } : undefined}>
      <div className={css.chartStage}>
        <nav className={css.drawingTools} aria-label="Chart drawing tools">
          {DRAWING_TOOLS.map((entry) => <button key={entry.tool} type="button" title={entry.label} aria-label={entry.label} aria-pressed={drawingTool === entry.tool} onClick={() => { setDrawingTool(entry.tool); setMeasureMode(false); }}>{entry.short}</button>)}
          <span title={`Drawing persistence ${drawingStore.saveState}`}>{drawingStore.saveState === "saved" ? "Saved" : drawingStore.saveState}</span>
        </nav>
        <div className={css.charts}>
          <ScalperV2Chart id="underlying" title={label} subtitle="Underlying · index points" bars={underlying?.bars ?? []} interval={interval} externalCrosshair={crosshair} externalRange={linkedRange} inspectionMode={inspectionMode} inspectionTime={inspectionTime} fitRequest={fitRequest} horizontalView={horizontalView} verticalView={verticalView} yLocked={yLocked} onCrosshair={handleCrosshair} onRangeChange={setLinkedRange} onTimeClick={selectTime} rankLevels={leaders} oiProfile={profileRows} profileMode={profileMode} profileLabel={deltaBasisLabel} profileRangeExpanded={profileRangeExpanded} maxPainStrikes={maxPain.candidates} signalEvents={signals} measurementTimes={points} selectedStrike={numeric(selectedCeStrike)} selectedPutStrike={numeric(selectedPeStrike)} hoveredStrike={hoveredStrike} drawingTool={drawingTool} drawings={drawingStore.drawings.filter((drawing) => drawing.paneRole === "underlying" && drawing.instrumentId === instrumentId("underlying"))} selectedDrawingId={drawingStore.selectedId} onDrawingCreate={createDrawing} onDrawingUpdate={drawingStore.upsert} onDrawingSelect={drawingStore.setSelectedId} />
          <ScalperV2Chart id="call" title={`CE ${Number(selectedCeStrike).toLocaleString("en-IN")}`} subtitle={String(call?.identity.tradingsymbol ?? "Exact call unavailable")} bars={call?.bars ?? []} interval={interval} externalCrosshair={crosshair} externalRange={linkedRange} inspectionMode={inspectionMode} inspectionTime={inspectionTime} fitRequest={fitRequest} horizontalView={horizontalView} verticalView={verticalView} yLocked={yLocked} onCrosshair={handleCrosshair} onRangeChange={setLinkedRange} onTimeClick={selectTime} signalEvents={callSignals} measurementTimes={points} drawingTool={drawingTool} drawings={drawingStore.drawings.filter((drawing) => drawing.paneRole === "call" && drawing.instrumentId === instrumentId("call"))} selectedDrawingId={drawingStore.selectedId} onDrawingCreate={createDrawing} onDrawingUpdate={drawingStore.upsert} onDrawingSelect={drawingStore.setSelectedId} />
          <ScalperV2Chart id="put" title={`PE ${Number(selectedPeStrike).toLocaleString("en-IN")}`} subtitle={String(put?.identity.tradingsymbol ?? "Exact put unavailable")} bars={put?.bars ?? []} interval={interval} externalCrosshair={crosshair} externalRange={linkedRange} inspectionMode={inspectionMode} inspectionTime={inspectionTime} fitRequest={fitRequest} horizontalView={horizontalView} verticalView={verticalView} yLocked={yLocked} onCrosshair={handleCrosshair} onRangeChange={setLinkedRange} onTimeClick={selectTime} signalEvents={putSignals} measurementTimes={points} drawingTool={drawingTool} drawings={drawingStore.drawings.filter((drawing) => drawing.paneRole === "put" && drawing.instrumentId === instrumentId("put"))} selectedDrawingId={drawingStore.selectedId} onDrawingCreate={createDrawing} onDrawingUpdate={drawingStore.upsert} onDrawingSelect={drawingStore.setSelectedId} />
        </div>
      </div>
      {railOpen && <aside className={css.rail} aria-label="Scalper V2 option chain and inspector">
        <header className={css.railHeader}><h2>{label} · CE {Number(selectedCeStrike).toLocaleString("en-IN")} / PE {Number(selectedPeStrike).toLocaleString("en-IN")}</h2><span className={css.identity}>{expiry} · <b>Selected independently</b>{selectedCeIsAtm && selectedPeIsAtm ? " · both ATM" : defaultStrike == null ? "" : ` · ATM ${defaultStrike.toLocaleString("en-IN")}`}</span></header>
        <div className={css.niftyQuote}><span>NIFTY</span><strong>{number(inspectedUnderlying)}</strong><b className={signClass(underlyingChange)}>{percent(underlyingChange)}</b></div>
        <div className={css.premiums}><div className={`${css.premium} ${css.call}`}><b>CE {Number(selectedCeStrike).toLocaleString("en-IN")}</b><strong>{price(inspectedRows[1]?.close ?? (inspectionMode === "latest" ? callLeg?.last_price : null))}</strong><small className={signClass(sessionReturn(call, inspectedRows[1]))}>Open {percent(sessionReturn(call, inspectedRows[1]))} · EMA {signed(selectedDistance(inspectedRows[1]))}</small><small>{inspectionMode === "latest" ? "Latest completed close" : inspectionMode === "locked" ? "Locked close" : "Cursor close"} · {inspectedTimeLabel(inspectedRows[1])}</small></div><div className={`${css.premium} ${css.put}`}><b>PE {Number(selectedPeStrike).toLocaleString("en-IN")}</b><strong>{price(inspectedRows[2]?.close ?? (inspectionMode === "latest" ? putLeg?.last_price : null))}</strong><small className={signClass(sessionReturn(put, inspectedRows[2]))}>Open {percent(sessionReturn(put, inspectedRows[2]))} · EMA {signed(selectedDistance(inspectedRows[2]))}</small><small>{inspectionMode === "latest" ? "Latest completed close" : inspectionMode === "locked" ? "Locked close" : "Cursor close"} · {inspectedTimeLabel(inspectedRows[2])}</small></div></div>
        <table className={css.pairMetrics} aria-label="Selected contracts snapshot metrics"><thead><tr><th>Latest snapshot</th><th className={css.callText}>CE {selectedCeStrike}</th><th className={css.putText}>PE {selectedPeStrike}</th></tr></thead><tbody>
          <tr><th>Open Interest</th><td>{compact(callProfile?.currentOi)}</td><td>{compact(putProfile?.currentOi)}</td></tr>
          <tr><th>Change in OI</th><td className={signClass(callProfile?.changeOi)}>{signed(callProfile?.changeOi)}</td><td className={signClass(putProfile?.changeOi)}>{signed(putProfile?.changeOi)}</td></tr>
          <tr><th>Change in OI %</th><td className={signClass(callProfile?.changeOi)}>{callProfile?.changeOi != null && callProfile.baselineOi ? percent(100 * callProfile.changeOi / callProfile.baselineOi) : "—"}</td><td className={signClass(putProfile?.changeOi)}>{putProfile?.changeOi != null && putProfile.baselineOi ? percent(100 * putProfile.changeOi / putProfile.baselineOi) : "—"}</td></tr>
          <tr><th>IV · %</th><td>{number(callLeg?.implied_volatility)}</td><td>{number(putLeg?.implied_volatility)}</td></tr>
          <tr><th>Bid–ask spread · ₹</th><td>{price(legSpread(callLeg))}</td><td>{price(legSpread(putLeg))}</td></tr>
        </tbody></table>
        {inspectionMode !== "latest" && <p className={css.scopeNotice}>Prices use the selected candle · OI, IV, PCR and Max Pain use the latest snapshot.</p>}
        <section className={css.structureSummary}><h3>Structure · latest snapshot</h3><div><span>OI PCR <b>{pcr == null ? "—" : pcr.toFixed(2)}</b></span><span>Max Pain <b>{maxPainValue == null ? "—" : maxPainValue.toLocaleString("en-IN")}</b></span><span>Distance <b className={signClass(inspectedUnderlying != null && maxPainValue != null ? inspectedUnderlying - maxPainValue : null)}>{signed(inspectedUnderlying != null && maxPainValue != null ? inspectedUnderlying - maxPainValue : null)} pts</b></span><span>Signal <b>{latestSignal ? `${latestSignal.direction} · ${latestSignal.state === "RETROSPECTIVE_ENTRY_REFERENCE" ? "entry reference" : "setup"}` : "None"}</b></span></div></section>
        <div className={css.leaders}>{leaders.filter((leader) => leader.rank <= 2).map((leader) => <div className={css.leader} key={`${leader.side}-${leader.rank}`}><span className={leader.side === "CE" ? css.callText : css.putText}>{leader.side}{leader.rank}</span><b>{leader.strike.toLocaleString("en-IN")}</b><small>OI {compact(leader.currentOi)} · Δ {signed(leader.changeOi)}</small></div>)}</div>
        <div className={css.inspectionModes} data-testid="v2-inspection-mode"><div><button aria-pressed={inspectionMode === "latest"} onClick={() => { setLockedTime(null); setHoverCrosshair(null); }}>Latest</button><button aria-pressed={inspectionMode === "hover"} disabled={!hoverCrosshair}>Cursor</button><button aria-pressed={inspectionMode === "locked"} disabled={!hoverCrosshair && lockedTime == null} onClick={() => setLockedTime((current) => current ?? hoverCrosshair?.time ?? null)}>Lock time</button></div><span data-testid="v2-cursor-time">{inspectionLabel}</span></div>
        <div className={css.tabs} role="tablist">{(["time", "chain", "profile", "levels", "rules", "measure", "objects", "health"] as const).map((tab) => <button key={tab} role="tab" aria-selected={railTab === tab} onClick={() => setRailTab(tab)}>{tab === "time" ? "Snapshot" : tab === "profile" ? "ΔOI profile" : tab[0].toUpperCase() + tab.slice(1)}</button>)}</div>
        <div className={css.railBody}>
          {railTab === "time" && <div data-testid="v2-at-time-grid"><Snapshot name={label} row={inspectedRows[0]} /><Snapshot name={`Selected CE ${selectedCeStrike}`} row={inspectedRows[1]} /><Snapshot name={`Selected PE ${selectedPeStrike}`} row={inspectedRows[2]} /></div>}
          {railTab === "chain" && <table className={css.chain} onMouseLeave={() => setHoveredStrike(null)}><thead><tr><th>CE OI</th><th>Select CE</th><th>Strike</th><th>Select PE</th><th>PE OI</th></tr></thead><tbody>{strikeRows.map((strike) => { const ce = rankSource.find((row) => side(row) === "CE" && numeric(row.strike) === strike), pe = rankSource.find((row) => side(row) === "PE" && numeric(row.strike) === strike); return <tr key={strike} data-ce-selected={String(strike) === selectedCeStrike || undefined} data-pe-selected={String(strike) === selectedPeStrike || undefined} onMouseEnter={() => setHoveredStrike(strike)}><td>{compact(ce?.open_interest)}</td><td><button disabled={points.length > 0 || !ce} aria-pressed={String(strike) === selectedCeStrike} onClick={() => updateLegStrike("CE", String(strike))}>{price(ce?.last_price)}{String(strike) === selectedCeStrike ? " · Selected" : ""}</button></td><th>{strike.toLocaleString("en-IN")}{strike === defaultStrike ? " · ATM" : ""}</th><td><button disabled={points.length > 0 || !pe} aria-pressed={String(strike) === selectedPeStrike} onClick={() => updateLegStrike("PE", String(strike))}>{price(pe?.last_price)}{String(strike) === selectedPeStrike ? " · Selected" : ""}</button></td><td>{compact(pe?.open_interest)}</td></tr>; })}</tbody></table>}
          {railTab === "profile" && <section className={css.profileEvidence} aria-label="Accessible strike change in open interest profile">
            <header><strong>Strike-aligned ΔOI</strong><span>{deltaBasisLabel}<br />{profileComparable}/{profileRows.length} comparable legs</span></header>
            <div className={css.profileLegend}><span><i className={css.ce} />CE blue</span><span><i className={css.pe} />PE yellow</span><span className={css.positive}>+ right</span><span className={css.negative}>− left</span></div>
            {profileModel.duplicates > 0 && <p role="alert">{profileModel.duplicates} duplicate strike-side row(s) excluded from the visual cohort.</p>}
            <table className={css.profileTable}><thead><tr><th>Leg</th><th>Strike</th><th>Current OI</th><th>Baseline OI</th><th>ΔOI</th></tr></thead><tbody>{profileRows.map((row) => <tr key={`${row.side}-${row.strike}`} onMouseEnter={() => setHoveredStrike(row.strike)} onMouseLeave={() => setHoveredStrike(null)}><td className={row.side === "CE" ? css.callText : css.putText}>{row.side}</td><td>{row.strike.toLocaleString("en-IN")}</td><td>{row.currentOi == null ? "—" : row.currentOi.toLocaleString("en-IN")}</td><td title={`${profileBaselineLabel(row.baselineKind)} · ${row.baselineAt ?? "time unavailable"}`}>{row.baselineOi == null ? "—" : row.baselineOi.toLocaleString("en-IN")}</td><td className={row.changeOi == null ? css.neutral : row.side === "CE" ? css.callText : css.putText} title={`${row.source} · ${row.unit} · current ${row.currentAt ?? "time unavailable"}`}>{signed(row.changeOi)}</td></tr>)}</tbody></table>
            <p>Bars use the underlying&apos;s native right-side price scale and one shared maximum of <strong>{formatOiAxisValue(deltaMaximum)}</strong>. Positive extends right and negative extends left from zero; blue is CE and yellow is PE. Missing baseline is dashed evidence, not zero.</p>
          </section>}
          {railTab === "levels" && <><p>Ranked from <strong>{metricLegs.length ? "the retained observed cohort" : "the nearest paired observed window"}</strong>. Off-session leaders remain here and are not promoted.</p>{leaders.map((leader) => <p key={`${leader.side}${leader.rank}`}><b>{leader.side}{leader.rank}</b> {leader.strike.toLocaleString("en-IN")} · OI {leader.currentOi.toLocaleString("en-IN")} · ΔOI {signed(leader.changeOi)}</p>)}</>}
          {railTab === "rules" && <><p><strong>{SCALPER_ENTRY_RULE}</strong></p><p>Entry references {signalCounts.RETROSPECTIVE_ENTRY_REFERENCE ?? 0} · waiting {signalCounts.WAIT_NEXT_OPEN ?? 0} · missing {signalCounts.NEXT_BAR_MISSING ?? 0} · failed {signalCounts.NEXT_OPEN_FAILED ?? 0}</p>{signals.slice(-20).map((signal) => <p key={signal.id}><b>{signal.direction}</b> · {signal.state.replaceAll("_", " ")} · {signal.setupTime}</p>)}</>}
          {railTab === "measure" && <><p><strong>A open → B close</strong> · illustrative, before costs/slippage, not booked P&amp;L.</p>{measurementContext && <p><strong>Locked evidence:</strong> {measurementContext.interval === 60 ? "1h" : `${measurementContext.interval}m`} · CE {measurementContext.ceStrike} / PE {measurementContext.peStrike} · {measurementContext.expiry}. Display timeframe changes do not rebind these values.</p>}<label>Quantity units <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label>A interval <select aria-label="Measurement A interval" value={points[0] ?? ""} onChange={(event) => selectMeasurementTime(0, event.target.value)}><option value="">Select exact candle</option>{measurementOptions.map((time) => <option key={`a-${time}`} value={time}>{time}</option>)}</select></label><label>B interval <select aria-label="Measurement B interval" value={points[1] ?? ""} onChange={(event) => selectMeasurementTime(1, event.target.value)}><option value="">Select exact candle</option>{measurementOptions.map((time) => <option key={`b-${time}`} value={time}>{time}</option>)}</select></label><p>{points[0] ? `A ${points[0]}` : "Click a chart candle or select A"}</p><p>{points[1] ? `B ${points[1]}` : "Then click a candle or select B"}</p>{measurement && <table className={css.metricGrid} data-testid="v2-measurement-pnl"><tbody><tr><th>Underlying points</th><td className={signClass(measurement.rows.find((row) => row.kind === "UNDERLYING")?.delta)}>{signed(measurement.rows.find((row) => row.kind === "UNDERLYING")?.delta)}</td></tr><tr><th>CE premium Δ</th><td className={signClass(measurement.rows.find((row) => row.kind === "CE")?.delta)}>{signed(measurement.rows.find((row) => row.kind === "CE")?.delta)}</td></tr><tr><th>PE premium Δ</th><td className={signClass(measurement.rows.find((row) => row.kind === "PE")?.delta)}>{signed(measurement.rows.find((row) => row.kind === "PE")?.delta)}</td></tr><tr><th>Combined premium Δ</th><td className={signClass(measurement.combined)}>{signed(measurement.combined)}</td></tr><tr><th>Illustrative P&amp;L</th><td className={signClass(measurement.pnl)}>{price(measurement.pnl)}</td></tr></tbody></table>}<button onClick={() => { setPoints([]); setMeasureMode(false); setMeasurementContext(null); }}>Clear A/B and unlock contracts</button></>}
          {railTab === "objects" && <section className={css.objectPanel} data-testid="v2-drawing-objects"><header><strong>Drawing objects</strong><span>{drawingStore.drawings.length} · {drawingStore.saveState}</span></header><div className={css.objectActions}><button type="button" data-testid="v2-clear-drawings" disabled={drawingStore.drawings.length === 0} onClick={drawingStore.clearAll}>Clear all drawings</button><small>Undo restores the cleared set.</small></div>{drawingStore.drawings.length === 0 ? <p>No saved drawings for {symbol}. Choose a tool and click its market anchors on any price pane.</p> : <ul>{drawingStore.drawings.map((drawing) => <li key={drawing.id} aria-current={drawing.id === drawingStore.selectedId}><button type="button" onClick={() => drawingStore.setSelectedId(drawing.id)}><b>{drawing.tool.replaceAll("_", " ")}</b><span>{drawing.paneRole} · {drawing.instrumentId}</span></button><div><button type="button" onClick={() => drawingStore.patch(drawing.id, { visible: !drawing.visible })}>{drawing.visible ? "Hide" : "Show"}</button><button type="button" onClick={() => drawingStore.patch(drawing.id, { locked: !drawing.locked })}>{drawing.locked ? "Unlock" : "Lock"}</button><button type="button" onClick={() => drawingStore.duplicate(drawing.id)}>Duplicate</button><button type="button" onClick={() => drawingStore.remove(drawing.id)}>Delete</button></div></li>)}</ul>}{selectedDrawing && <DrawingEditor key={`${selectedDrawing.id}:${selectedDrawing.updatedAt}`} drawing={selectedDrawing} onApply={(changes) => drawingStore.patch(selectedDrawing.id, changes)} />}</section>}
          {railTab === "health" && <><p><strong>{state}</strong> · {errors.length} source failures</p><p>Ranking: {metricLegs.length ? "Observed retained cohort" : "Nearest paired observed window; not full expiry"}</p><p>As-of {asOf}</p>{inspectionMode !== "latest" && <p><strong>Historical chain unavailable at this time.</strong> Price OHLC/EMA use the exact inspected candle; OI, PCR and payout remain separately labelled latest retained snapshot evidence.</p>}<p>OI units remain provider-native. No account position source is connected in this view; selected pair is not a holding.</p><p>Canvas screenshot export is not provided by V2. Complete source and measurement evidence is available through JSON; chain observations through CSV.</p>{active.data.limitations.map((item) => <p key={item}>{item}</p>)}</>}
        </div>
      </aside>}
    </div>
    <section id="scalper-v2-analytics" className={css.analytics} data-testid="v2-analytics-dock">
      <div className={css.structureRibbon} aria-label="Current option structure summary"><span><b>CE OI</b>{compact(oiTotals.ceOi)}</span><span><b>PE OI</b>{compact(oiTotals.peOi)}</span><span><b>PCR</b>{oiTotals.pcr == null ? "—" : oiTotals.pcr.toFixed(2)}</span><span className={signClass(oiTotals.ceDelta)}><b>CE ΔOI</b>{signed(oiTotals.ceDelta)}</span><span className={signClass(oiTotals.peDelta)}><b>PE ΔOI</b>{signed(oiTotals.peDelta)}</span><span><b>Max Pain</b>{maxPainValue?.toLocaleString("en-IN") ?? "—"}</span><span><b>CE1</b>{leaders.find((leader) => leader.side === "CE" && leader.rank === 1)?.strike.toLocaleString("en-IN") ?? "—"}</span><span><b>PE1</b>{leaders.find((leader) => leader.side === "PE" && leader.rank === 1)?.strike.toLocaleString("en-IN") ?? "—"}</span><span><b>Signal</b>{latestSignal?.direction ?? "—"}</span></div>
      <nav className={css.analyticsTabs} aria-label="Scalper analytics">{(["overview", "matrix", "oi", "strength", "total", "maxpain"] as const).map((tab) => <button key={tab} aria-selected={analyticsTab === tab} onClick={() => setAnalyticsTab(tab)}>{tab === "oi" ? "OI & ΔOI" : tab === "strength" ? "Price Strength" : tab === "total" ? "Total OI" : tab === "maxpain" ? "Max Pain" : tab[0].toUpperCase() + tab.slice(1)}</button>)}</nav>
      {(analyticsTab === "overview" || analyticsTab === "matrix") && <div className={css.matrixWrap} data-testid="v2-strike-matrix"><div className={css.matrixContext}><strong>Option Structure Matrix</strong><span>{inspectionMode === "latest" ? "Latest snapshot" : "Latest snapshot · price charts at selected time"}</span></div><table className={css.structureMatrix} onMouseLeave={() => setHoveredStrike(null)}><thead><tr><th>CE Price</th><th>CE Δ%</th><th>CE OI</th><th>CE ΔOI</th><th>CE Rank</th><th>Strike</th><th>PE Rank</th><th>PE ΔOI</th><th>PE OI</th><th>PE Δ%</th><th>PE Price</th></tr></thead><tbody>{structureRows.map((row) => <tr key={row.strike} onMouseEnter={() => setHoveredStrike(row.strike)} data-ce-selected={row.strike === Number(selectedCeStrike) || undefined} data-pe-selected={row.strike === Number(selectedPeStrike) || undefined}><td className={css.callText}>{price(row.ce.price)}</td><td className={signClass(row.ce.priceChangePct)}>{percent(row.ce.priceChangePct)}</td><td className={css.barCell}><i className={css.ceBar} style={{ width: `${100 * (row.ce.oi ?? 0) / structureOiMaximum}%` }} />{compact(row.ce.oi)}</td><td className={`${css.barCell} ${signClass(row.ce.changeOi) ?? ""}`}><i className={row.ce.changeOi != null && row.ce.changeOi < 0 ? css.negativeBar : css.positiveBar} style={{ width: `${100 * Math.abs(row.ce.changeOi ?? 0) / structureDeltaMaximum}%` }} />{signed(row.ce.changeOi)}</td><td>{row.ce.rank ? <b className={css.callRank}>CE{row.ce.rank}</b> : ""}</td><th>{row.strike.toLocaleString("en-IN")}{row.strike === defaultStrike ? <em>ATM</em> : null}{maxPain.candidates.includes(row.strike) ? <em className={css.maxPainBadge}>MAX</em> : null}{row.strike === nearestSpotStrike ? <span className={css.spotMarker}>NIFTY {number(spot)}</span> : null}</th><td>{row.pe.rank ? <b className={css.putRank}>PE{row.pe.rank}</b> : ""}</td><td className={`${css.barCell} ${signClass(row.pe.changeOi) ?? ""}`}><i className={row.pe.changeOi != null && row.pe.changeOi < 0 ? css.negativeBar : css.positiveBar} style={{ width: `${100 * Math.abs(row.pe.changeOi ?? 0) / structureDeltaMaximum}%` }} />{signed(row.pe.changeOi)}</td><td className={css.barCell}><i className={css.peBar} style={{ width: `${100 * (row.pe.oi ?? 0) / structureOiMaximum}%` }} />{compact(row.pe.oi)}</td><td className={signClass(row.pe.priceChangePct)}>{percent(row.pe.priceChangePct)}</td><td className={css.putText}>{price(row.pe.price)}</td></tr>)}</tbody></table></div>}
      {analyticsTab === "overview" && <div className={css.overviewKpis}><article><small>OI imbalance</small><b>{oiTotals.oiImbalance == null ? "—" : percent(100 * oiTotals.oiImbalance)}</b></article><article><small>ΔOI imbalance</small><b>{oiTotals.deltaImbalance == null ? "—" : percent(100 * oiTotals.deltaImbalance)}</b></article><article><small>Tracked strikes</small><b>{structureRows.length}</b></article><article><small>OI history</small><b>{cumulativeOiPoints.length} points</b></article></div>}
      {analyticsTab === "oi" && <div className={css.analyticsGrid}><article className={css.analyticCard}><h3>OI by strike</h3><Suspense fallback={<p>Loading chart…</p>}><Chart className={css.analyticChart} ariaLabel="Open interest by strike" axisExtentPolicy="native" option={analyticOptions[0]} activeCategoryIndex={hoveredStrikeIndex} onCategoryHover={(index) => setHoveredStrike(index == null ? null : strikeRows[index] ?? null)} /></Suspense></article><article id="scalper-v2-deltaoi" className={css.analyticCard} data-testid="v2-deltaoi-chart"><h3>Change in OI by strike</h3>{deltaState.state === "baseline_unavailable" || deltaState.state === "current_unavailable" ? <div className={css.stateCard} data-testid="v2-deltaoi-state"><strong>{deltaState.state === "baseline_unavailable" ? "Baseline unavailable" : "Current OI unavailable"}</strong><span>{deltaState.comparable}/{deltaState.total} comparable contracts</span></div> : <Suspense fallback={<p>Loading chart…</p>}><Chart className={css.deltaOiChart} ariaLabel="Change in OI by strike with adaptive signed scale" axisExtentPolicy="native" option={analyticOptions[1]} activeCategoryIndex={hoveredStrikeIndex} onCategoryHover={(index) => setHoveredStrike(index == null ? null : strikeRows[index] ?? null)} /></Suspense>}</article></div>}
      {analyticsTab === "strength" && <article className={css.dockPanel} data-testid="v2-normalized-option-price"><header className={css.dockControls}><h3>Option price strength</h3><label>Mode <select value={priceMode} onChange={(event) => setPriceMode(event.target.value as ScalperV2PriceMode)}><option value="return">Return from Open %</option><option value="indexed">Indexed to 100</option><option value="relative">Relative to ATM</option><option value="range">Range Normalised</option></select></label><label><input type="checkbox" checked={showAllPriceSeries} onChange={(event) => setShowAllPriceSeries(event.target.checked)} /> Show all strikes</label></header>{normalizedPriceModel.series.length ? <><Suspense fallback={<p>Loading chart…</p>}><Chart className={css.normalizedPriceChart} ariaLabel="Option price strength over time" axisExtentPolicy="native" option={normalizedPriceOption} /></Suspense><h3>All-strike return heatmap</h3><Suspense fallback={<p>Loading heatmap…</p>}><Chart className={css.heatmapChart} ariaLabel="Option return from open heatmap by time and strike" axisExtentPolicy="native" option={optionPriceHeatmap} /></Suspense></> : <div className={css.stateCard}><strong>Option price history unavailable</strong></div>}</article>}
      {analyticsTab === "total" && <article className={css.dockPanel} data-testid="v2-cumulative-oi-time"><h3>Total OI vs Time</h3><div className={css.overviewKpis}><article><small>CE Total OI</small><b>{compact(oiTotals.ceOi)}</b></article><article><small>PE Total OI</small><b>{compact(oiTotals.peOi)}</b></article><article><small>OI PCR</small><b>{oiTotals.pcr?.toFixed(2) ?? "—"}</b></article><article><small>Snapshot coverage</small><b>{cumulativeOiComplete}/{cumulativeOiPoints.length}</b><small>{cumulativeStrikeCounts.length ? `${cumulativeStrikeCounts.join("–")} strikes` : "Unavailable"}</small></article></div>{cumulativeOiPoints.length ? <Suspense fallback={<p>Loading chart…</p>}><Chart className={css.cumulativeOiChart} ariaLabel="Total CE and PE open interest over time" axisExtentPolicy="native" option={cumulativeOiOption} /></Suspense> : <div className={css.stateCard}><strong>OI history unavailable</strong></div>}</article>}
      {analyticsTab === "maxpain" && <article className={css.dockPanel}><div className={css.maxPainKpi}><span>Max Pain</span><strong>{maxPainValue?.toLocaleString("en-IN") ?? "—"}</strong><b>{inspectedUnderlying != null && maxPainValue != null ? `${signed(inspectedUnderlying - maxPainValue)} pts from NIFTY` : "Distance unavailable"}</b></div><Suspense fallback={<p>Loading chart…</p>}><Chart className={css.analyticChart} ariaLabel="Max pain payout distribution" axisExtentPolicy="native" option={analyticOptions[2]} activeCategoryIndex={hoveredPayoutIndex} onCategoryHover={(index) => setHoveredStrike(index == null ? null : maxPain.points[index]?.settlement ?? null)} /></Suspense></article>}
    </section>
    <details><summary>Indicator evidence</summary><p>Underlying RSI14 and MACD are calculated from retained completed bars before the selected day is sliced for display.</p><table className={css.snapshotGrid}><thead><tr><th>End</th><th>RSI14</th><th>MACD</th><th>Signal</th></tr></thead><tbody>{indicators.filter((row) => istDay(row.time) === tradingDay).slice(-20).map((row) => <tr key={row.time}><td>{row.time}</td><td>{row.rsi?.toFixed(2) ?? "—"}</td><td>{row.macd?.toFixed(4) ?? "—"}</td><td>{row.signal?.toFixed(4) ?? "—"}</td></tr>)}</tbody></table></details>
  </section>;
}
