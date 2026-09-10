import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import type { EChartsOption } from "echarts";
import { getJson } from "../lib/api";
import { evidenceCsv } from "../lib/tradingAnalyticsExport";
import { dayRows, istDay } from "../lib/tradingAnalyticsChartView";
import { measurePanes, scalperIndicators } from "../lib/scalperMeasurement";
import { SCALPER_ENTRY_RULE, scalperPairedBody70Signals } from "../lib/scalperSignals";
import { formatOiAxisValue, maxPainDistribution, oiPcr, rankCurrentOi } from "../lib/scalperV2";
import { scalperV2HorizontalDeltaOiOption } from "../lib/scalperV2Analytics";
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
type ChartPayload = { panes: ChartPane[]; availableContracts: AvailableScalperContract[]; limitations: string[]; interval: number; asOf: string };
type RailTab = "time" | "chain" | "profile" | "levels" | "rules" | "measure" | "objects" | "health";

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
const legChangeOi = (row: Row | undefined) => numeric((row?.oi_layers as Row | undefined)?.change ?? row?.changeOi);
const legSpread = (row: Row | undefined) => {
  const bid = numeric(row?.bid_price), ask = numeric(row?.ask_price);
  return bid == null || ask == null ? null : ask - bid;
};

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
  const selectedDayParam = params.get("day");
  const interval = [1, 5, 15, 60].includes(Number(params.get("interval"))) ? Number(params.get("interval")) : 5;
  const defaultStrike = nearestScalperStrike(strikes, spot);
  const { ceStrike: selectedCeStrike, peStrike: selectedPeStrike } = scalperLegSelection(params, defaultStrike);
  const query = chartQuery(symbol, asOf, expiry, selectedCeStrike, selectedPeStrike, interval);
  const active = useQuery({ queryKey: chartKey(query), queryFn: () => getJson<ChartPayload>(`/v1/trading-analytics/charts?${query}`), staleTime: 30_000, retry: 1 });
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
  const [profileMode, setProfileMode] = useState<"current" | "change">("change");
  const [profileRangeExpanded, setProfileRangeExpanded] = useState(false);
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
  const profileComparable = profileRows.filter((row) => row.state === "comparable").length;
  const analyticOptions = useMemo<EChartsOption[]>(() => [
    { tooltip: { trigger: "axis" }, legend: { data: ["CE OI", "PE OI"], top: 2, left: 86 }, grid: { left: 72, right: 20, top: 38, bottom: 48 }, xAxis: { type: "category", data: strikeRows, name: "Strike", nameGap: 30 }, yAxis: { type: "value", min: 0, axisLine: { show: true }, axisTick: { show: true }, axisLabel: { formatter: formatOiAxisValue, margin: 9 }, splitNumber: 5 }, series: [{ name: "CE OI", type: "bar", data: ceCurrent, itemStyle: { color: "#2563eb" }, markLine: nearestSpotStrike == null ? undefined : { silent: true, symbol: "none", lineStyle: { color: "#0f766e", type: "dashed" }, label: { formatter: `Nearest ${nearestSpotStrike}\nspot ${number(spot)}` }, data: [{ xAxis: nearestSpotStrike }] } }, { name: "PE OI", type: "bar", data: peCurrent, itemStyle: { color: "#eab308" } }] },
    scalperV2HorizontalDeltaOiOption(strikeRows, ceChanges, peChanges),
    { tooltip: { trigger: "axis" }, legend: { data: ["Call payout", "Put payout", "Combined"] }, grid: { left: 72, right: 20, top: 42, bottom: 52 }, xAxis: { type: "category", data: maxPain.points.map((point) => point.settlement) }, yAxis: { type: "value", name: "Common-unit payout" }, series: [{ name: "Call payout", type: "line", data: maxPain.points.map((point) => point.callPayout), lineStyle: { color: "#2563eb" }, markLine: nearestSpotStrike == null ? undefined : { silent: true, symbol: "none", lineStyle: { color: "#0f766e", type: "dashed" }, label: { formatter: `Nearest ${nearestSpotStrike}\nspot ${number(spot)}` }, data: [{ xAxis: nearestSpotStrike }] } }, { name: "Put payout", type: "line", data: maxPain.points.map((point) => point.putPayout), lineStyle: { color: "#eab308" } }, { name: "Combined", type: "line", data: maxPain.points.map((point) => point.totalPayout), lineStyle: { color: "#14243a", width: 3 } }] },
  ], [ceChanges, ceCurrent, maxPain.points, nearestSpotStrike, peChanges, peCurrent, spot, strikeRows]);

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

  if (!active.data) return <section className={css.loading} role="status">{active.isLoading ? `Loading ${label} ${interval}m first…` : "Exact chart context unavailable."}</section>;
  return <section className={css.page} data-testid="scalper-v2">
    <header className={css.commandBar}>
      <strong>Scalper V2</strong>
      <label>Session <select value={tradingDay} onChange={(event) => update("day", event.target.value)}>{days.map((day) => <option key={day}>{day}</option>)}</select></label>
      <label>CE strike <select aria-label="Selected CE strike" value={selectedCeStrike} disabled={points.length > 0} title={points.length ? "Clear the locked measurement before changing either contract" : undefined} onChange={(event) => updateLegStrike("CE", event.target.value)}>{selectableCeStrikes.map((strike) => <option key={strike} value={strike}>{strike.toLocaleString("en-IN")}</option>)}</select></label>
      <label>PE strike <select aria-label="Selected PE strike" value={selectedPeStrike} disabled={points.length > 0} title={points.length ? "Clear the locked measurement before changing either contract" : undefined} onChange={(event) => updateLegStrike("PE", event.target.value)}>{selectablePeStrikes.map((strike) => <option key={strike} value={strike}>{strike.toLocaleString("en-IN")}</option>)}</select></label>
      <button disabled={points.length > 0 || defaultStrike == null} onClick={selectBothAtm}>Both ATM</button>
      <span>{expiry || "Expiry unavailable"}</span>
      {[1, 5, 15, 60].map((value) => <button key={value} aria-current={interval === value ? "page" : undefined} onClick={() => update("interval", String(value))}>{value === 60 ? "1h" : `${value}m`}</button>)}
      <button aria-pressed={horizontalView === "day"} onClick={() => { setHorizontalView("day"); setFitRequest((value) => value + 1); }}>Fit day</button>
      <button aria-pressed={horizontalView === "last30"} onClick={() => { setHorizontalView("last30"); setFitRequest((value) => value + 1); }}>Last 30</button>
      <button aria-pressed={horizontalView === "last60"} onClick={() => { setHorizontalView("last60"); setFitRequest((value) => value + 1); }}>Last 60</button>
      <button aria-pressed={verticalView === "session" && !profileRangeExpanded} onClick={() => { setVerticalView("session"); setProfileRangeExpanded(false); setYLocked(false); }}>Session Y</button>
      <button aria-pressed={profileRangeExpanded} disabled={profileRows.length === 0} onClick={() => { setVerticalView("session"); setProfileRangeExpanded(true); setYLocked(false); }}>All strikes Y</button>
      <button aria-pressed={verticalView === "visible"} onClick={() => { setVerticalView("visible"); setProfileRangeExpanded(false); setYLocked(false); }}>Visible Y</button>
      <button aria-pressed={verticalView === "manual"} onClick={() => { setVerticalView("manual"); setProfileRangeExpanded(false); setYLocked(false); }}>Manual Y</button>
      <button aria-pressed={yLocked} onClick={() => setYLocked((value) => !value)}>{yLocked ? "Unlock Y" : "Lock Y"}</button>
      <button aria-pressed={profileMode === "current"} onClick={() => setProfileMode("current")}>Profile OI</button>
      <button aria-pressed={profileMode === "change"} onClick={() => setProfileMode("change")}>Profile ΔOI</button>
      <button aria-pressed={measureMode} onClick={() => { setMeasureMode(!measureMode); if (!measureMode) setRailTab("measure"); }}>Measure A–B</button>
      <button onClick={drawingStore.undo} disabled={!drawingStore.canUndo}>Undo drawing</button>
      <button onClick={drawingStore.redo} disabled={!drawingStore.canRedo}>Redo drawing</button>
      <button aria-pressed={railOpen} onClick={() => setRailOpen(!railOpen)}>{railOpen ? "Hide rail" : "Show rail"}</button>
      <button onClick={() => { const body = JSON.stringify({ version: "SCALPER_V2_WORKSTATION_V1", symbol, expiry, selectedCeStrike, selectedPeStrike, interval, asOf, tradingDay, inspectionMode, inspectionTime, horizontalView, rankingScope: metricLegs.length ? "OBSERVED_RETAINED_COHORT" : "NEAREST_PAIRED_OBSERVED_WINDOW", rankLevels: leaders, source: contextRows, chart: active.data, drawings: drawingStore.drawings, drawingPersistence: "local_workspace_recovery", measurement, measurementContext: measurementContext ? { interval: measurementContext.interval, symbol: measurementContext.symbol, expiry: measurementContext.expiry, ceStrike: measurementContext.ceStrike, peStrike: measurementContext.peStrike } : null }, null, 2); const url = URL.createObjectURL(new Blob([body], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `scalper-v2-${symbol}-${tradingDay || "current"}.json`; anchor.click(); URL.revokeObjectURL(url); }}>Export JSON</button>
      <button onClick={() => { const url = URL.createObjectURL(new Blob([evidenceCsv(contextRows)], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `scalper-v2-chain-${symbol}-${tradingDay || "current"}.csv`; anchor.click(); URL.revokeObjectURL(url); }}>Chain CSV</button>
    </header>
    <div className={css.statusBar}><strong>{state}</strong> · Read-only research · {errors.length} source failures · active {interval}m loaded first · background timeframe cache is opportunistic · V7 signals: entry references {signalCounts.RETROSPECTIVE_ENTRY_REFERENCE ?? 0}</div>
    {active.error && <div className={css.warning} role="alert">The selected timeframe could not refresh. Cached timeframes remain available.</div>}
    <div className={css.workspace} style={!railOpen ? { gridTemplateColumns: "minmax(0,1fr)" } : undefined}>
      <div className={css.chartStage}>
        <nav className={css.drawingTools} aria-label="Chart drawing tools">
          {DRAWING_TOOLS.map((entry) => <button key={entry.tool} type="button" title={entry.label} aria-label={entry.label} aria-pressed={drawingTool === entry.tool} onClick={() => { setDrawingTool(entry.tool); setMeasureMode(false); }}>{entry.short}</button>)}
          <span title={`Drawing persistence ${drawingStore.saveState}`}>{drawingStore.saveState === "saved" ? "Saved" : drawingStore.saveState}</span>
        </nav>
        <div className={css.charts}>
          <ScalperV2Chart id="underlying" title={label} subtitle="Underlying · index points" bars={underlying?.bars ?? []} interval={interval} externalCrosshair={crosshair} externalRange={linkedRange} inspectionMode={inspectionMode} inspectionTime={inspectionTime} fitRequest={fitRequest} horizontalView={horizontalView} verticalView={verticalView} yLocked={yLocked} onCrosshair={handleCrosshair} onRangeChange={setLinkedRange} onTimeClick={selectTime} rankLevels={leaders} oiProfile={profileRows} profileMode={profileMode} profileLabel={deltaBasisLabel} profileRangeExpanded={profileRangeExpanded} signalEvents={signals} measurementTimes={points} selectedStrike={numeric(selectedCeStrike)} selectedPutStrike={numeric(selectedPeStrike)} hoveredStrike={hoveredStrike} drawingTool={drawingTool} drawings={drawingStore.drawings.filter((drawing) => drawing.paneRole === "underlying" && drawing.instrumentId === instrumentId("underlying"))} selectedDrawingId={drawingStore.selectedId} onDrawingCreate={createDrawing} onDrawingUpdate={drawingStore.upsert} onDrawingSelect={drawingStore.setSelectedId} />
          <ScalperV2Chart id="call" title={`CE ${Number(selectedCeStrike).toLocaleString("en-IN")}`} subtitle={String(call?.identity.tradingsymbol ?? "Exact call unavailable")} bars={call?.bars ?? []} interval={interval} externalCrosshair={crosshair} externalRange={linkedRange} inspectionMode={inspectionMode} inspectionTime={inspectionTime} fitRequest={fitRequest} horizontalView={horizontalView} verticalView={verticalView} yLocked={yLocked} onCrosshair={handleCrosshair} onRangeChange={setLinkedRange} onTimeClick={selectTime} signalEvents={callSignals} measurementTimes={points} drawingTool={drawingTool} drawings={drawingStore.drawings.filter((drawing) => drawing.paneRole === "call" && drawing.instrumentId === instrumentId("call"))} selectedDrawingId={drawingStore.selectedId} onDrawingCreate={createDrawing} onDrawingUpdate={drawingStore.upsert} onDrawingSelect={drawingStore.setSelectedId} />
          <ScalperV2Chart id="put" title={`PE ${Number(selectedPeStrike).toLocaleString("en-IN")}`} subtitle={String(put?.identity.tradingsymbol ?? "Exact put unavailable")} bars={put?.bars ?? []} interval={interval} externalCrosshair={crosshair} externalRange={linkedRange} inspectionMode={inspectionMode} inspectionTime={inspectionTime} fitRequest={fitRequest} horizontalView={horizontalView} verticalView={verticalView} yLocked={yLocked} onCrosshair={handleCrosshair} onRangeChange={setLinkedRange} onTimeClick={selectTime} signalEvents={putSignals} measurementTimes={points} drawingTool={drawingTool} drawings={drawingStore.drawings.filter((drawing) => drawing.paneRole === "put" && drawing.instrumentId === instrumentId("put"))} selectedDrawingId={drawingStore.selectedId} onDrawingCreate={createDrawing} onDrawingUpdate={drawingStore.upsert} onDrawingSelect={drawingStore.setSelectedId} />
        </div>
      </div>
      {railOpen && <aside className={css.rail} aria-label="Scalper V2 option chain and inspector">
        <header className={css.railHeader}><h2>{label} · CE {Number(selectedCeStrike).toLocaleString("en-IN")} / PE {Number(selectedPeStrike).toLocaleString("en-IN")}</h2><span className={css.identity}>{expiry} · <b>Selected independently</b>{selectedCeIsAtm && selectedPeIsAtm ? " · both ATM" : defaultStrike == null ? "" : ` · ATM ${defaultStrike.toLocaleString("en-IN")}`}</span></header>
        <div className={css.premiums}><div className={`${css.premium} ${css.call}`}><b>CE {Number(selectedCeStrike).toLocaleString("en-IN")} · exact</b><strong>{price(inspectedRows[1]?.close ?? (inspectionMode === "latest" ? callLeg?.last_price : null))}</strong><small>{inspectionMode === "latest" ? "Completed close / retained quote" : inspectionLabel}</small></div><div className={`${css.premium} ${css.put}`}><b>PE {Number(selectedPeStrike).toLocaleString("en-IN")} · exact</b><strong>{price(inspectedRows[2]?.close ?? (inspectionMode === "latest" ? putLeg?.last_price : null))}</strong><small>{inspectionMode === "latest" ? "Completed close / retained quote" : inspectionLabel}</small></div></div>
        <table className={css.pairMetrics} aria-label="Selected contracts latest snapshot metrics"><thead><tr><th>Latest snapshot metric</th><th className={css.callText}>CE {selectedCeStrike}</th><th className={css.putText}>PE {selectedPeStrike}</th></tr></thead><tbody>
          <tr><th>Open interest · provider units</th><td>{compact(callLeg?.open_interest)}</td><td>{compact(putLeg?.open_interest)}</td></tr>
          <tr><th>{deltaBasisLabel}</th><td className={signClass(legChangeOi(callLeg))}>{signed(legChangeOi(callLeg))}</td><td className={signClass(legChangeOi(putLeg))}>{signed(legChangeOi(putLeg))}</td></tr>
          <tr><th>IV · %</th><td>{number(callLeg?.implied_volatility)}</td><td>{number(putLeg?.implied_volatility)}</td></tr>
          <tr><th>Bid–ask spread · ₹</th><td>{price(legSpread(callLeg))}</td><td>{price(legSpread(putLeg))}</td></tr>
        </tbody></table>
        <div className={css.leaders}>{leaders.map((leader) => <div className={css.leader} key={`${leader.side}-${leader.rank}`}><span className={leader.side === "CE" ? css.callText : css.putText}>{leader.side}{leader.rank}</span><b>{leader.strike.toLocaleString("en-IN")}</b><small>OI {compact(leader.currentOi)}{leader.tiedOi ? " · tie" : ""}</small></div>)}</div>
        <div className={css.inspectionModes} data-testid="v2-inspection-mode"><div><button aria-pressed={inspectionMode === "latest"} onClick={() => { setLockedTime(null); setHoverCrosshair(null); }}>Latest</button><button aria-pressed={inspectionMode === "hover"} disabled={!hoverCrosshair}>Cursor</button><button aria-pressed={inspectionMode === "locked"} disabled={!hoverCrosshair && lockedTime == null} onClick={() => setLockedTime((current) => current ?? hoverCrosshair?.time ?? null)}>Lock time</button></div><span data-testid="v2-cursor-time">{inspectionLabel}</span></div>
        <div className={css.tabs} role="tablist">{(["time", "chain", "profile", "levels", "rules", "measure", "objects", "health"] as const).map((tab) => <button key={tab} role="tab" aria-selected={railTab === tab} onClick={() => setRailTab(tab)}>{tab === "time" ? "Snapshot" : tab === "profile" ? "ΔOI profile" : tab[0].toUpperCase() + tab.slice(1)}</button>)}</div>
        <div className={css.railBody}>
          {railTab === "time" && <div data-testid="v2-at-time-grid"><Snapshot name={label} row={inspectedRows[0]} /><Snapshot name={`Selected CE ${selectedCeStrike}`} row={inspectedRows[1]} /><Snapshot name={`Selected PE ${selectedPeStrike}`} row={inspectedRows[2]} /></div>}
          {railTab === "chain" && <table className={css.chain} onMouseLeave={() => setHoveredStrike(null)}><thead><tr><th>CE OI</th><th>Select CE</th><th>Strike</th><th>Select PE</th><th>PE OI</th></tr></thead><tbody>{strikeRows.map((strike) => { const ce = rankSource.find((row) => side(row) === "CE" && numeric(row.strike) === strike), pe = rankSource.find((row) => side(row) === "PE" && numeric(row.strike) === strike); return <tr key={strike} data-ce-selected={String(strike) === selectedCeStrike || undefined} data-pe-selected={String(strike) === selectedPeStrike || undefined} onMouseEnter={() => setHoveredStrike(strike)}><td>{compact(ce?.open_interest)}</td><td><button disabled={points.length > 0 || !ce} aria-pressed={String(strike) === selectedCeStrike} onClick={() => updateLegStrike("CE", String(strike))}>{price(ce?.last_price)}{String(strike) === selectedCeStrike ? " · Selected" : ""}</button></td><th>{strike.toLocaleString("en-IN")}{strike === defaultStrike ? " · ATM" : ""}</th><td><button disabled={points.length > 0 || !pe} aria-pressed={String(strike) === selectedPeStrike} onClick={() => updateLegStrike("PE", String(strike))}>{price(pe?.last_price)}{String(strike) === selectedPeStrike ? " · Selected" : ""}</button></td><td>{compact(pe?.open_interest)}</td></tr>; })}</tbody></table>}
          {railTab === "profile" && <section className={css.profileEvidence} aria-label="Accessible strike change in open interest profile">
            <header><strong>Strike-aligned ΔOI</strong><span>{deltaBasisLabel}<br />{profileComparable}/{profileRows.length} comparable legs</span></header>
            <div className={css.profileLegend}><span><i className={css.ce} />CE solid outline</span><span><i className={css.pe} />PE dashed outline</span><span className={css.positive}>+ increase</span><span className={css.negative}>− decrease</span></div>
            {profileModel.duplicates > 0 && <p role="alert">{profileModel.duplicates} duplicate strike-side row(s) excluded from the visual cohort.</p>}
            <table className={css.profileTable}><thead><tr><th>Leg</th><th>Strike</th><th>Current OI</th><th>Baseline OI</th><th>ΔOI</th></tr></thead><tbody>{profileRows.map((row) => <tr key={`${row.side}-${row.strike}`} onMouseEnter={() => setHoveredStrike(row.strike)} onMouseLeave={() => setHoveredStrike(null)}><td className={row.side === "CE" ? css.callText : css.putText}>{row.side}</td><td>{row.strike.toLocaleString("en-IN")}</td><td>{row.currentOi == null ? "—" : row.currentOi.toLocaleString("en-IN")}</td><td title={`${profileBaselineLabel(row.baselineKind)} · ${row.baselineAt ?? "time unavailable"}`}>{row.baselineOi == null ? "—" : row.baselineOi.toLocaleString("en-IN")}</td><td className={row.changeOi == null ? css.neutral : signClass(row.changeOi)} title={`${row.source} · ${row.unit} · current ${row.currentAt ?? "time unavailable"}`}>{signed(row.changeOi)}</td></tr>)}</tbody></table>
            <p>Bars use the underlying&apos;s native right-side price scale. Length is absolute ΔOI under one shared cohort maximum; green/red is sign, blue/yellow outline is CE/PE identity. Missing baseline is dashed evidence, not zero.</p>
          </section>}
          {railTab === "levels" && <><p>Ranked from <strong>{metricLegs.length ? "the retained observed cohort" : "the nearest paired observed window"}</strong>. Off-session leaders remain here and are not promoted.</p>{leaders.map((leader) => <p key={`${leader.side}${leader.rank}`}><b>{leader.side}{leader.rank}</b> {leader.strike.toLocaleString("en-IN")} · OI {leader.currentOi.toLocaleString("en-IN")} · ΔOI {signed(leader.changeOi)}</p>)}</>}
          {railTab === "rules" && <><p><strong>{SCALPER_ENTRY_RULE}</strong></p><p>Entry references {signalCounts.RETROSPECTIVE_ENTRY_REFERENCE ?? 0} · waiting {signalCounts.WAIT_NEXT_OPEN ?? 0} · missing {signalCounts.NEXT_BAR_MISSING ?? 0} · failed {signalCounts.NEXT_OPEN_FAILED ?? 0}</p>{signals.slice(-20).map((signal) => <p key={signal.id}><b>{signal.direction}</b> · {signal.state.replaceAll("_", " ")} · {signal.setupTime}</p>)}</>}
          {railTab === "measure" && <><p><strong>A open → B close</strong> · illustrative, before costs/slippage, not booked P&amp;L.</p>{measurementContext && <p><strong>Locked evidence:</strong> {measurementContext.interval === 60 ? "1h" : `${measurementContext.interval}m`} · CE {measurementContext.ceStrike} / PE {measurementContext.peStrike} · {measurementContext.expiry}. Display timeframe changes do not rebind these values.</p>}<label>Quantity units <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label>A interval <select aria-label="Measurement A interval" value={points[0] ?? ""} onChange={(event) => selectMeasurementTime(0, event.target.value)}><option value="">Select exact candle</option>{measurementOptions.map((time) => <option key={`a-${time}`} value={time}>{time}</option>)}</select></label><label>B interval <select aria-label="Measurement B interval" value={points[1] ?? ""} onChange={(event) => selectMeasurementTime(1, event.target.value)}><option value="">Select exact candle</option>{measurementOptions.map((time) => <option key={`b-${time}`} value={time}>{time}</option>)}</select></label><p>{points[0] ? `A ${points[0]}` : "Click a chart candle or select A"}</p><p>{points[1] ? `B ${points[1]}` : "Then click a candle or select B"}</p>{measurement && <table className={css.metricGrid} data-testid="v2-measurement-pnl"><tbody><tr><th>Underlying points</th><td className={signClass(measurement.rows.find((row) => row.kind === "UNDERLYING")?.delta)}>{signed(measurement.rows.find((row) => row.kind === "UNDERLYING")?.delta)}</td></tr><tr><th>CE premium Δ</th><td className={signClass(measurement.rows.find((row) => row.kind === "CE")?.delta)}>{signed(measurement.rows.find((row) => row.kind === "CE")?.delta)}</td></tr><tr><th>PE premium Δ</th><td className={signClass(measurement.rows.find((row) => row.kind === "PE")?.delta)}>{signed(measurement.rows.find((row) => row.kind === "PE")?.delta)}</td></tr><tr><th>Combined premium Δ</th><td className={signClass(measurement.combined)}>{signed(measurement.combined)}</td></tr><tr><th>Illustrative P&amp;L</th><td className={signClass(measurement.pnl)}>{price(measurement.pnl)}</td></tr></tbody></table>}<button onClick={() => { setPoints([]); setMeasureMode(false); setMeasurementContext(null); }}>Clear A/B and unlock contracts</button></>}
          {railTab === "objects" && <section className={css.objectPanel} data-testid="v2-drawing-objects"><header><strong>Drawing objects</strong><span>{drawingStore.drawings.length} · {drawingStore.saveState}</span></header>{drawingStore.drawings.length === 0 ? <p>No saved drawings for {symbol}. Choose a tool and click its market anchors on any price pane.</p> : <ul>{drawingStore.drawings.map((drawing) => <li key={drawing.id} aria-current={drawing.id === drawingStore.selectedId}><button type="button" onClick={() => drawingStore.setSelectedId(drawing.id)}><b>{drawing.tool.replaceAll("_", " ")}</b><span>{drawing.paneRole} · {drawing.instrumentId}</span></button><div><button type="button" onClick={() => drawingStore.patch(drawing.id, { visible: !drawing.visible })}>{drawing.visible ? "Hide" : "Show"}</button><button type="button" onClick={() => drawingStore.patch(drawing.id, { locked: !drawing.locked })}>{drawing.locked ? "Unlock" : "Lock"}</button><button type="button" onClick={() => drawingStore.duplicate(drawing.id)}>Duplicate</button><button type="button" onClick={() => drawingStore.remove(drawing.id)}>Delete</button></div></li>)}</ul>}{selectedDrawing && <DrawingEditor key={`${selectedDrawing.id}:${selectedDrawing.updatedAt}`} drawing={selectedDrawing} onApply={(changes) => drawingStore.patch(selectedDrawing.id, changes)} />}</section>}
          {railTab === "health" && <><p><strong>{state}</strong> · {errors.length} source failures</p><p>Ranking: {metricLegs.length ? "Observed retained cohort" : "Nearest paired observed window; not full expiry"}</p><p>As-of {asOf}</p>{inspectionMode !== "latest" && <p><strong>Historical chain unavailable at this time.</strong> Price OHLC/EMA use the exact inspected candle; OI, PCR and payout remain separately labelled latest retained snapshot evidence.</p>}<p>OI units remain provider-native. No account position source is connected in this view; selected pair is not a holding.</p><p>Canvas screenshot export is not provided by V2. Complete source and measurement evidence is available through JSON; chain observations through CSV.</p>{active.data.limitations.map((item) => <p key={item}>{item}</p>)}</>}
        </div>
      </aside>}
    </div>
    <section className={css.analytics}><header className={css.analyticsHeader}><h2>Option analytics · latest retained snapshot</h2><span>{inspectionMode !== "latest" ? "Historical chain unavailable at inspected time · " : ""}PCR {pcr == null ? "unavailable" : pcr.toFixed(2)} · Max pain {maxPain.candidates.join(", ") || "unavailable"}</span></header>
      <div className={css.analyticsGrid}>
        <article className={css.analyticCard}><h3>OI by strike</h3><p>Current provider-native OI; zero-based · {spot == null || nearestSpotStrike == null ? "spot guide unavailable" : `spot ${number(spot)} · nearest strike ${nearestSpotStrike.toLocaleString("en-IN")}`}</p><div className={css.axisContext} data-testid="v2-oi-axis-context"><span><b>Y</b> Open interest · provider units</span><span><b>X</b> Strike</span></div><Suspense fallback={<p>Loading chart…</p>}><Chart className={css.analyticChart} ariaLabel="OI by strike; Y axis open interest in provider units; X axis strike" axisExtentPolicy="native" option={analyticOptions[0]} activeCategoryIndex={hoveredStrikeIndex} onCategoryHover={(index) => setHoveredStrike(index == null ? null : strikeRows[index] ?? null)} /></Suspense></article>
        <article className={css.analyticCard} data-deltaoi-orientation="horizontal"><h3>Change in OI by strike</h3><p>Horizontal CE/PE bars · {deltaBasisLabel}</p><div className={css.axisContext} data-testid="v2-deltaoi-axis-context"><span><b>Y · right</b> Strike</span><span><b>X</b> Signed ΔOI · provider units</span></div>{deltaState.state === "baseline_unavailable" || deltaState.state === "current_unavailable" ? <div className={css.stateCard} data-testid="v2-deltaoi-state"><div><strong>{deltaState.state === "baseline_unavailable" ? "Baseline unavailable" : "Current OI unavailable"}</strong><span>{deltaState.comparable}/{deltaState.total} comparable contracts · missing is not zero</span><small>Horizontal ΔOI bars appear when a comparable baseline exists.</small></div></div> : <><p data-testid="v2-deltaoi-state">{deltaState.state === "partial" ? `Partial coverage · ${deltaState.comparable}/${deltaState.total} comparable` : `Comparable · ${deltaState.comparable}/${deltaState.total}`}</p><Suspense fallback={<p>Loading chart…</p>}><Chart className={css.analyticChart} ariaLabel="Change in OI by strike; horizontal bars; right Y axis strike; X axis signed change in provider units" axisExtentPolicy="native" option={analyticOptions[1]} activeCategoryIndex={hoveredStrikeIndex} onCategoryHover={(index) => setHoveredStrike(index == null ? null : strikeRows[index] ?? null)} /></Suspense></>}</article>
        <article className={css.analyticCard}><h3>PCR context</h3><p>Observed-scope OI PCR · snapshot, not an intraday trend</p><div className={css.stateCard}><div><strong className={css.pcrValue}>{pcr == null ? "—" : pcr.toFixed(2)}</strong><span>{tradingDay || "Current observation"} · {pcr == null ? "eligible CE/PE cohort unavailable" : "one retained snapshot"}</span></div></div></article>
        <article className={css.analyticCard}><h3>Max-pain payout distribution</h3><p>Common-unit estimate; hypothetical settlement, not a forecast · {spot == null || nearestSpotStrike == null ? "spot guide unavailable" : `spot ${number(spot)} · nearest settlement strike ${nearestSpotStrike.toLocaleString("en-IN")}`}</p><Suspense fallback={<p>Loading chart…</p>}><Chart className={css.analyticChart} ariaLabel="Max-pain payout distribution" axisExtentPolicy="native" option={analyticOptions[2]} activeCategoryIndex={hoveredPayoutIndex} onCategoryHover={(index) => setHoveredStrike(index == null ? null : maxPain.points[index]?.settlement ?? null)} /></Suspense></article>
      </div>
    </section>
    <details><summary>Indicator evidence</summary><p>Underlying RSI14 and MACD are calculated from retained completed bars before the selected day is sliced for display.</p><table className={css.snapshotGrid}><thead><tr><th>End</th><th>RSI14</th><th>MACD</th><th>Signal</th></tr></thead><tbody>{indicators.filter((row) => istDay(row.time) === tradingDay).slice(-20).map((row) => <tr key={row.time}><td>{row.time}</td><td>{row.rsi?.toFixed(2) ?? "—"}</td><td>{row.macd?.toFixed(4) ?? "—"}</td><td>{row.signal?.toFixed(4) ?? "—"}</td></tr>)}</tbody></table></details>
  </section>;
}
