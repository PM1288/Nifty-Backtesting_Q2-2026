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
import { oiComparisonState } from "../lib/scalperV2Geometry";
import {
  ScalperV2Chart,
  type ScalperV2Crosshair,
  type ScalperV2HorizontalView,
  type ScalperV2InspectionMode,
  type ScalperV2TimeRange,
  type ScalperV2VerticalView,
} from "./scalper-v2/ScalperV2Chart";
import css from "./scalper-v2/ScalperV2.module.css";

const Chart = lazy(async () => ({ default: (await import("../components/visual/EChartSurface")).EChartSurface }));
type Row = Record<string, unknown>;
type ChartPane = { identity: Row; bars: Row[]; coverage: Row[]; sourceMinuteCount: number; oiHistory: Row[] };
type ChartPayload = { panes: ChartPane[]; availableContracts: Array<{ expiry: string; strike: number; ce_contracts: number; pe_contracts: number }>; limitations: string[]; interval: number; asOf: string };
type RailTab = "time" | "chain" | "levels" | "rules" | "measure" | "health";

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
const chartQuery = (symbol: string, asOf: string, expiry: string, strike: string, interval: number) => {
  const query = new URLSearchParams({ symbol, asOf, interval: String(interval), historyDays: "3" });
  if (expiry && strike) { query.set("expiry", expiry); query.set("strike", strike); }
  return query;
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

export function TradingAnalyticsScalperV2({ symbol, label, asOf, expiry, strikes, spot, legs, metricLegs = [], state, errors = [] }: {
  symbol: string; label: string; asOf: string; expiry: string; strikes: number[]; spot: number | null;
  legs: Row[]; metricLegs?: Row[]; state: string; errors?: Row[];
}) {
  const [params, setParams] = useSearchParams(), client = useQueryClient();
  const interval = [1, 5, 15, 60].includes(Number(params.get("interval"))) ? Number(params.get("interval")) : 5;
  const defaultStrike = [...strikes].sort((a, b) => Math.abs(a - Number(spot ?? a)) - Math.abs(b - Number(spot ?? b)) || a - b)[0];
  const selectedStrike = params.get("strike") ?? String(defaultStrike ?? "");
  const query = chartQuery(symbol, asOf, expiry, selectedStrike, interval);
  const active = useQuery({ queryKey: chartKey(query), queryFn: () => getJson<ChartPayload>(`/v1/trading-analytics/charts?${query}`), staleTime: 30_000, retry: 1 });
  useEffect(() => {
    if (!active.data) return;
    for (const backgroundInterval of [1, 5, 15, 60]) {
      if (backgroundInterval === interval) continue;
      const background = chartQuery(symbol, asOf, expiry, selectedStrike, backgroundInterval);
      void client.prefetchQuery({ queryKey: chartKey(background), queryFn: () => getJson<ChartPayload>(`/v1/trading-analytics/charts?${background}`), staleTime: 30_000 });
    }
  }, [active.data, asOf, client, expiry, interval, selectedStrike, symbol]);

  const [hoverCrosshair, setHoverCrosshair] = useState<ScalperV2Crosshair>(null);
  const [lockedTime, setLockedTime] = useState<number | null>(null);
  const [linkedRange, setLinkedRange] = useState<ScalperV2TimeRange>(null);
  const [hoveredStrike, setHoveredStrike] = useState<number | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [horizontalView, setHorizontalView] = useState<ScalperV2HorizontalView>("day");
  const [verticalView, setVerticalView] = useState<ScalperV2VerticalView>("session"), [yLocked, setYLocked] = useState(false);
  const [railOpen, setRailOpen] = useState(true), [railTab, setRailTab] = useState<RailTab>("time");
  const [measureMode, setMeasureMode] = useState(false), [points, setPoints] = useState<string[]>([]), [quantity, setQuantity] = useState("65");
  const [measurementContext, setMeasurementContext] = useState<{ panes: ChartPane[]; interval: number; symbol: string; expiry: string; strike: string } | null>(null);
  const inspectionMode: ScalperV2InspectionMode = lockedTime != null ? "locked" : hoverCrosshair ? "hover" : "latest";
  const inspectionTime = lockedTime ?? hoverCrosshair?.time ?? null;
  const crosshair = lockedTime == null ? hoverCrosshair : { time: lockedTime, source: "locked", sequence: lockedTime };

  useEffect(() => {
    const clear = (event: KeyboardEvent) => { if (event.key === "Escape") { setLockedTime(null); setHoverCrosshair(null); } };
    window.addEventListener("keydown", clear); return () => window.removeEventListener("keydown", clear);
  }, []);
  useEffect(() => { setFitRequest((value) => value + 1); setVerticalView("session"); setYLocked(false); setLockedTime(null); setHoverCrosshair(null); }, [symbol, expiry, selectedStrike, interval, params.get("day")]);

  const rawPanes = active.data?.panes ?? [];
  const days = useMemo(() => [...new Set((rawPanes[0]?.bars ?? []).map((row) => istDay(row.end)).filter(Boolean))].sort().reverse(), [rawPanes]);
  const tradingDay = params.get("day") && days.includes(params.get("day")!) ? params.get("day")! : (days[0] ?? "");
  const panes = useMemo(() => rawPanes.map((pane) => ({ ...pane, bars: dayRows(pane.bars, tradingDay, "end"), oiHistory: dayRows(pane.oiHistory, tradingDay, "event_time") })), [rawPanes, tradingDay]);
  const underlying = panes.find((pane) => chartSide(pane) === "UNDERLYING"), call = panes.find((pane) => chartSide(pane) === "CE"), put = panes.find((pane) => chartSide(pane) === "PE");
  const rawUnderlying = rawPanes.find((pane) => chartSide(pane) === "UNDERLYING");
  const selectedLegs = legs.filter((leg) => String(leg.strike) === selectedStrike), callLeg = selectedLegs.find((leg) => side(leg) === "CE"), putLeg = selectedLegs.find((leg) => side(leg) === "PE");
  const selectedIsAtm = defaultStrike != null && Number(selectedStrike) === defaultStrike;
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
  const latestRows = [underlying, call, put].map((pane) => latest(pane?.bars ?? []));
  const measurementOptions = useMemo(() => {
    const sets = [underlying, call, put].map((pane) => new Set((pane?.bars ?? []).filter((row) => row.closed === true).map((row) => String(row.end))));
    return [...(sets[0] ?? new Set<string>())].filter((time) => sets.slice(1).every((values) => values.has(time))).sort();
  }, [call, put, underlying]);
  const contextRows = useMemo(() => rankSource.map((row) => ({ ...row, ranking_scope: metricLegs.length ? "Observed retained cohort" : "Nearest paired observed window", analysis_as_of: asOf })), [asOf, metricLegs.length, rankSource]);
  const strikeRows = useMemo(() => [...new Set(rankSource.map((row) => numeric(row.strike)).filter((value): value is number => value != null))].sort((a, b) => a - b), [rankSource]);
  const nearestSpotStrike = spot == null || strikeRows.length === 0 ? null : [...strikeRows].sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot))[0];
  const profileRows = useMemo(() => rankSource.flatMap((row) => {
    const strike = numeric(row.strike), currentOi = numeric(row.open_interest), optionSide = side(row);
    return strike != null && currentOi != null && currentOi >= 0 && (optionSide === "CE" || optionSide === "PE") ? [{ side: optionSide as "CE" | "PE", strike, currentOi }] : [];
  }), [rankSource]);
  const { ceCurrent, peCurrent, ceChanges, peChanges } = useMemo(() => {
    const currentSeries = (wanted: "CE" | "PE") => strikeRows.map((strike) => numeric(rankSource.find((row) => side(row) === wanted && numeric(row.strike) === strike)?.open_interest));
    const changeSeries = (wanted: "CE" | "PE") => strikeRows.map((strike) => {
      const row = rankSource.find((candidate) => side(candidate) === wanted && numeric(candidate.strike) === strike);
      return numeric((row?.oi_layers as Row | undefined)?.change);
    });
    return { ceCurrent: currentSeries("CE"), peCurrent: currentSeries("PE"), ceChanges: changeSeries("CE"), peChanges: changeSeries("PE") };
  }, [rankSource, strikeRows]);
  const deltaState = useMemo(() => oiComparisonState([...ceCurrent, ...peCurrent], [...ceChanges, ...peChanges].map((value, index) => value == null ? null : (index < ceCurrent.length ? ceCurrent[index] : peCurrent[index - ceCurrent.length])! - value)), [ceChanges, ceCurrent, peChanges, peCurrent]);
  const analyticOptions = useMemo<EChartsOption[]>(() => [
    { tooltip: { trigger: "axis" }, legend: { data: ["CE OI", "PE OI"], top: 2, left: 86 }, grid: { left: 72, right: 20, top: 38, bottom: 48 }, xAxis: { type: "category", data: strikeRows, name: "Strike", nameGap: 30 }, yAxis: { type: "value", min: 0, axisLine: { show: true }, axisTick: { show: true }, axisLabel: { formatter: formatOiAxisValue, margin: 9 }, splitNumber: 5 }, series: [{ name: "CE OI", type: "bar", data: ceCurrent, itemStyle: { color: "#2563eb" }, markLine: nearestSpotStrike == null ? undefined : { silent: true, symbol: "none", lineStyle: { color: "#0f766e", type: "dashed" }, label: { formatter: `Nearest ${nearestSpotStrike}\nspot ${number(spot)}` }, data: [{ xAxis: nearestSpotStrike }] } }, { name: "PE OI", type: "bar", data: peCurrent, itemStyle: { color: "#eab308" } }] },
    { tooltip: { trigger: "axis" }, legend: { data: ["CE ΔOI", "PE ΔOI"], top: 2, left: 86 }, grid: { left: 72, right: 20, top: 38, bottom: 48 }, xAxis: { type: "category", data: strikeRows, name: "Strike", nameGap: 30 }, yAxis: { type: "value", axisLine: { show: true }, axisTick: { show: true }, axisLabel: { formatter: formatOiAxisValue, margin: 9 }, splitNumber: 5 }, series: [{ name: "CE ΔOI", type: "bar", data: ceChanges.map((value) => ({ value, itemStyle: { color: value != null && value < 0 ? "#c6283d" : "#117a40", borderColor: "#2563eb", borderWidth: 1 } })), markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: "#64748b", width: 1 }, data: [{ yAxis: 0 }] } }, { name: "PE ΔOI", type: "bar", data: peChanges.map((value) => ({ value, itemStyle: { color: value != null && value < 0 ? "#c6283d" : "#117a40", borderColor: "#eab308", borderWidth: 1 } })) }] },
    { tooltip: { trigger: "axis" }, legend: { data: ["Call payout", "Put payout", "Combined"] }, grid: { left: 72, right: 20, top: 42, bottom: 52 }, xAxis: { type: "category", data: maxPain.points.map((point) => point.settlement) }, yAxis: { type: "value", name: "Common-unit payout" }, series: [{ name: "Call payout", type: "line", data: maxPain.points.map((point) => point.callPayout), lineStyle: { color: "#2563eb" }, markLine: nearestSpotStrike == null ? undefined : { silent: true, symbol: "none", lineStyle: { color: "#0f766e", type: "dashed" }, label: { formatter: `Nearest ${nearestSpotStrike}\nspot ${number(spot)}` }, data: [{ xAxis: nearestSpotStrike }] } }, { name: "Put payout", type: "line", data: maxPain.points.map((point) => point.putPayout), lineStyle: { color: "#eab308" } }, { name: "Combined", type: "line", data: maxPain.points.map((point) => point.totalPayout), lineStyle: { color: "#14243a", width: 3 } }] },
  ], [ceChanges, ceCurrent, maxPain.points, nearestSpotStrike, peChanges, peCurrent, spot, strikeRows]);

  const selectTime = (time: string) => {
    const seconds = Math.floor(Date.parse(time) / 1000);
    if (!measureMode) { setLockedTime(seconds); setRailTab("time"); return; }
    setPoints((current) => {
      if (current.length !== 1) {
        setMeasurementContext({ panes, interval, symbol, expiry, strike: selectedStrike });
        return [time];
      }
      return [current[0], time].sort();
    });
    if (points.length === 1) setMeasureMode(false);
  };
  const selectMeasurementTime = (index: 0 | 1, time: string) => {
    if (!time) return;
    if (!measurementContext) setMeasurementContext({ panes, interval, symbol, expiry, strike: selectedStrike });
    setPoints((current) => {
      const next = [...current]; next[index] = time;
      return next.filter(Boolean).sort();
    });
  };
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next); };
  const handleCrosshair = (value: ScalperV2Crosshair) => { if (lockedTime == null) setHoverCrosshair(value); };
  const inspectionLabel = inspectionMode === "latest" ? "Latest completed candles" : `${inspectionMode === "locked" ? "Locked" : "At cursor"} · ${inspectionTime == null ? "—" : new Date(inspectionTime * 1000).toISOString()}`;
  const signalCounts = useMemo(() => Object.fromEntries(["WAIT_NEXT_OPEN", "NEXT_BAR_MISSING", "NEXT_OPEN_FAILED", "RETROSPECTIVE_ENTRY_REFERENCE"].map((key) => [key, signals.filter((signal) => signal.state === key).length])), [signals]);
  const hoveredStrikeIndex = hoveredStrike == null ? null : strikeRows.indexOf(hoveredStrike);
  const hoveredPayoutIndex = hoveredStrike == null ? null : maxPain.points.findIndex((point) => point.settlement === hoveredStrike);

  if (!active.data) return <section className={css.loading} role="status">{active.isLoading ? `Loading ${label} ${interval}m first…` : "Exact chart context unavailable."}</section>;
  return <section className={css.page} data-testid="scalper-v2">
    <header className={css.commandBar}>
      <strong>Scalper V2</strong>
      <label>Session <select value={tradingDay} onChange={(event) => update("day", event.target.value)}>{days.map((day) => <option key={day}>{day}</option>)}</select></label>
      <label>Pair <select value={selectedStrike} disabled={points.length > 0} title={points.length ? "Clear the locked measurement before changing pair" : undefined} onChange={(event) => update("strike", event.target.value)}>{strikes.map((strike) => <option key={strike} value={strike}>{strike.toLocaleString("en-IN")}</option>)}</select></label>
      <span>{expiry || "Expiry unavailable"}</span>
      {[1, 5, 15, 60].map((value) => <button key={value} aria-current={interval === value ? "page" : undefined} onClick={() => update("interval", String(value))}>{value === 60 ? "1h" : `${value}m`}</button>)}
      <button aria-pressed={horizontalView === "day"} onClick={() => { setHorizontalView("day"); setFitRequest((value) => value + 1); }}>Fit day</button>
      <button aria-pressed={horizontalView === "last30"} onClick={() => { setHorizontalView("last30"); setFitRequest((value) => value + 1); }}>Last 30</button>
      <button aria-pressed={horizontalView === "last60"} onClick={() => { setHorizontalView("last60"); setFitRequest((value) => value + 1); }}>Last 60</button>
      <button aria-pressed={verticalView === "session"} onClick={() => { setVerticalView("session"); setYLocked(false); }}>Session Y</button>
      <button aria-pressed={verticalView === "visible"} onClick={() => { setVerticalView("visible"); setYLocked(false); }}>Visible Y</button>
      <button aria-pressed={verticalView === "manual"} onClick={() => { setVerticalView("manual"); setYLocked(false); }}>Manual Y</button>
      <button aria-pressed={yLocked} onClick={() => setYLocked((value) => !value)}>{yLocked ? "Unlock Y" : "Lock Y"}</button>
      <button aria-pressed={measureMode} onClick={() => { setMeasureMode(!measureMode); if (!measureMode) setRailTab("measure"); }}>Measure A–B</button>
      <button aria-pressed={railOpen} onClick={() => setRailOpen(!railOpen)}>{railOpen ? "Hide rail" : "Show rail"}</button>
      <button onClick={() => { const body = JSON.stringify({ version: "SCALPER_V2_UI_V1_1", symbol, expiry, selectedStrike, interval, asOf, tradingDay, inspectionMode, inspectionTime, horizontalView, rankingScope: metricLegs.length ? "OBSERVED_RETAINED_COHORT" : "NEAREST_PAIRED_OBSERVED_WINDOW", rankLevels: leaders, source: contextRows, chart: active.data, measurement, measurementContext: measurementContext ? { interval: measurementContext.interval, symbol: measurementContext.symbol, expiry: measurementContext.expiry, strike: measurementContext.strike } : null }, null, 2); const url = URL.createObjectURL(new Blob([body], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `scalper-v2-${symbol}-${tradingDay || "current"}.json`; anchor.click(); URL.revokeObjectURL(url); }}>Export JSON</button>
      <button onClick={() => { const url = URL.createObjectURL(new Blob([evidenceCsv(contextRows)], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `scalper-v2-chain-${symbol}-${tradingDay || "current"}.csv`; anchor.click(); URL.revokeObjectURL(url); }}>Chain CSV</button>
    </header>
    <div className={css.statusBar}><strong>{state}</strong> · Read-only research · {errors.length} source failures · active {interval}m loaded first · background timeframe cache is opportunistic · V7 signals: entry references {signalCounts.RETROSPECTIVE_ENTRY_REFERENCE ?? 0}</div>
    {active.error && <div className={css.warning} role="alert">The selected timeframe could not refresh. Cached timeframes remain available.</div>}
    <div className={css.workspace} style={!railOpen ? { gridTemplateColumns: "minmax(0,1fr)" } : undefined}>
      <div className={css.charts}>
        <ScalperV2Chart id="underlying" title={label} subtitle="Underlying · index points" bars={underlying?.bars ?? []} interval={interval} externalCrosshair={crosshair} externalRange={linkedRange} inspectionMode={inspectionMode} inspectionTime={inspectionTime} fitRequest={fitRequest} horizontalView={horizontalView} verticalView={verticalView} yLocked={yLocked} onCrosshair={handleCrosshair} onRangeChange={setLinkedRange} onTimeClick={selectTime} rankLevels={leaders} oiProfile={profileRows} signalEvents={signals} measurementTimes={points} selectedStrike={numeric(selectedStrike)} hoveredStrike={hoveredStrike} />
        <ScalperV2Chart id="call" title={`CE ${Number(selectedStrike).toLocaleString("en-IN")}`} subtitle={String(call?.identity.tradingsymbol ?? "Exact call unavailable")} bars={call?.bars ?? []} interval={interval} externalCrosshair={crosshair} externalRange={linkedRange} inspectionMode={inspectionMode} inspectionTime={inspectionTime} fitRequest={fitRequest} horizontalView={horizontalView} verticalView={verticalView} yLocked={yLocked} onCrosshair={handleCrosshair} onRangeChange={setLinkedRange} onTimeClick={selectTime} signalEvents={callSignals} measurementTimes={points} />
        <ScalperV2Chart id="put" title={`PE ${Number(selectedStrike).toLocaleString("en-IN")}`} subtitle={String(put?.identity.tradingsymbol ?? "Exact put unavailable")} bars={put?.bars ?? []} interval={interval} externalCrosshair={crosshair} externalRange={linkedRange} inspectionMode={inspectionMode} inspectionTime={inspectionTime} fitRequest={fitRequest} horizontalView={horizontalView} verticalView={verticalView} yLocked={yLocked} onCrosshair={handleCrosshair} onRangeChange={setLinkedRange} onTimeClick={selectTime} signalEvents={putSignals} measurementTimes={points} />
      </div>
      {railOpen && <aside className={css.rail} aria-label="Scalper V2 option chain and inspector">
        <header className={css.railHeader}><h2>{label} · {Number(selectedStrike).toLocaleString("en-IN")} pair</h2><span className={css.identity}>{expiry} · <b>Selected</b>{selectedIsAtm ? " · ATM" : defaultStrike == null ? "" : ` · ATM ${defaultStrike.toLocaleString("en-IN")}`}</span></header>
        <div className={css.premiums}><div className={`${css.premium} ${css.call}`}><b>CE · exact contract</b><strong>{price(inspectedRows[1]?.close ?? (inspectionMode === "latest" ? callLeg?.last_price : null))}</strong><small>{inspectionMode === "latest" ? "Completed close / retained quote" : inspectionLabel}</small></div><div className={`${css.premium} ${css.put}`}><b>PE · exact contract</b><strong>{price(inspectedRows[2]?.close ?? (inspectionMode === "latest" ? putLeg?.last_price : null))}</strong><small>{inspectionMode === "latest" ? "Completed close / retained quote" : inspectionLabel}</small></div></div>
        <table className={css.pairMetrics} aria-label="Selected pair latest snapshot metrics"><thead><tr><th>Latest snapshot metric</th><th className={css.callText}>CE</th><th className={css.putText}>PE</th></tr></thead><tbody>
          <tr><th>Open interest · provider units</th><td>{compact(callLeg?.open_interest)}</td><td>{compact(putLeg?.open_interest)}</td></tr>
          <tr><th>Snapshot ΔOI · retained baseline</th><td className={signClass(legChangeOi(callLeg))}>{signed(legChangeOi(callLeg))}</td><td className={signClass(legChangeOi(putLeg))}>{signed(legChangeOi(putLeg))}</td></tr>
          <tr><th>IV · %</th><td>{number(callLeg?.implied_volatility)}</td><td>{number(putLeg?.implied_volatility)}</td></tr>
          <tr><th>Bid–ask spread · ₹</th><td>{price(legSpread(callLeg))}</td><td>{price(legSpread(putLeg))}</td></tr>
        </tbody></table>
        <div className={css.leaders}>{leaders.map((leader) => <div className={css.leader} key={`${leader.side}-${leader.rank}`}><span className={leader.side === "CE" ? css.callText : css.putText}>{leader.side}{leader.rank}</span><b>{leader.strike.toLocaleString("en-IN")}</b><small>OI {compact(leader.currentOi)}{leader.tiedOi ? " · tie" : ""}</small></div>)}</div>
        <div className={css.inspectionModes} data-testid="v2-inspection-mode"><div><button aria-pressed={inspectionMode === "latest"} onClick={() => { setLockedTime(null); setHoverCrosshair(null); }}>Latest</button><button aria-pressed={inspectionMode === "hover"} disabled={!hoverCrosshair}>Cursor</button><button aria-pressed={inspectionMode === "locked"} disabled={!hoverCrosshair && lockedTime == null} onClick={() => setLockedTime((current) => current ?? hoverCrosshair?.time ?? null)}>Lock time</button></div><span data-testid="v2-cursor-time">{inspectionLabel}</span></div>
        <div className={css.tabs} role="tablist">{(["time", "chain", "levels", "rules", "measure", "health"] as const).map((tab) => <button key={tab} role="tab" aria-selected={railTab === tab} onClick={() => setRailTab(tab)}>{tab === "time" ? "Snapshot" : tab[0].toUpperCase() + tab.slice(1)}</button>)}</div>
        <div className={css.railBody}>
          {railTab === "time" && <div data-testid="v2-at-time-grid"><Snapshot name={label} row={inspectedRows[0]} /><Snapshot name="Selected CE" row={inspectedRows[1]} /><Snapshot name="Selected PE" row={inspectedRows[2]} /></div>}
          {railTab === "chain" && <table className={css.chain} onMouseLeave={() => setHoveredStrike(null)}><thead><tr><th>CE OI</th><th>CE ₹</th><th>Strike</th><th>PE ₹</th><th>PE OI</th></tr></thead><tbody>{strikeRows.map((strike) => { const ce = rankSource.find((row) => side(row) === "CE" && numeric(row.strike) === strike), pe = rankSource.find((row) => side(row) === "PE" && numeric(row.strike) === strike); return <tr key={strike} aria-current={String(strike) === selectedStrike} onMouseEnter={() => setHoveredStrike(strike)}><td>{compact(ce?.open_interest)}</td><td>{price(ce?.last_price)}</td><td><button disabled={points.length > 0} onClick={() => update("strike", String(strike))}>{strike.toLocaleString("en-IN")}</button></td><td>{price(pe?.last_price)}</td><td>{compact(pe?.open_interest)}</td></tr>; })}</tbody></table>}
          {railTab === "levels" && <><p>Ranked from <strong>{metricLegs.length ? "the retained observed cohort" : "the nearest paired observed window"}</strong>. Off-session leaders remain here and are not promoted.</p>{leaders.map((leader) => <p key={`${leader.side}${leader.rank}`}><b>{leader.side}{leader.rank}</b> {leader.strike.toLocaleString("en-IN")} · OI {leader.currentOi.toLocaleString("en-IN")} · ΔOI {signed(leader.changeOi)}</p>)}</>}
          {railTab === "rules" && <><p><strong>{SCALPER_ENTRY_RULE}</strong></p><p>Entry references {signalCounts.RETROSPECTIVE_ENTRY_REFERENCE ?? 0} · waiting {signalCounts.WAIT_NEXT_OPEN ?? 0} · missing {signalCounts.NEXT_BAR_MISSING ?? 0} · failed {signalCounts.NEXT_OPEN_FAILED ?? 0}</p>{signals.slice(-20).map((signal) => <p key={signal.id}><b>{signal.direction}</b> · {signal.state.replaceAll("_", " ")} · {signal.setupTime}</p>)}</>}
          {railTab === "measure" && <><p><strong>A open → B close</strong> · illustrative, before costs/slippage, not booked P&amp;L.</p>{measurementContext && <p><strong>Locked evidence:</strong> {measurementContext.interval === 60 ? "1h" : `${measurementContext.interval}m`} · {measurementContext.strike} · {measurementContext.expiry}. Display timeframe changes do not rebind these values.</p>}<label>Quantity units <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label>A interval <select aria-label="Measurement A interval" value={points[0] ?? ""} onChange={(event) => selectMeasurementTime(0, event.target.value)}><option value="">Select exact candle</option>{measurementOptions.map((time) => <option key={`a-${time}`} value={time}>{time}</option>)}</select></label><label>B interval <select aria-label="Measurement B interval" value={points[1] ?? ""} onChange={(event) => selectMeasurementTime(1, event.target.value)}><option value="">Select exact candle</option>{measurementOptions.map((time) => <option key={`b-${time}`} value={time}>{time}</option>)}</select></label><p>{points[0] ? `A ${points[0]}` : "Click a chart candle or select A"}</p><p>{points[1] ? `B ${points[1]}` : "Then click a candle or select B"}</p>{measurement && <table className={css.metricGrid} data-testid="v2-measurement-pnl"><tbody><tr><th>Underlying points</th><td className={signClass(measurement.rows.find((row) => row.kind === "UNDERLYING")?.delta)}>{signed(measurement.rows.find((row) => row.kind === "UNDERLYING")?.delta)}</td></tr><tr><th>CE premium Δ</th><td className={signClass(measurement.rows.find((row) => row.kind === "CE")?.delta)}>{signed(measurement.rows.find((row) => row.kind === "CE")?.delta)}</td></tr><tr><th>PE premium Δ</th><td className={signClass(measurement.rows.find((row) => row.kind === "PE")?.delta)}>{signed(measurement.rows.find((row) => row.kind === "PE")?.delta)}</td></tr><tr><th>Combined premium Δ</th><td className={signClass(measurement.combined)}>{signed(measurement.combined)}</td></tr><tr><th>Illustrative P&amp;L</th><td className={signClass(measurement.pnl)}>{price(measurement.pnl)}</td></tr></tbody></table>}<button onClick={() => { setPoints([]); setMeasureMode(false); setMeasurementContext(null); }}>Clear A/B and unlock pair</button></>}
          {railTab === "health" && <><p><strong>{state}</strong> · {errors.length} source failures</p><p>Ranking: {metricLegs.length ? "Observed retained cohort" : "Nearest paired observed window; not full expiry"}</p><p>As-of {asOf}</p>{inspectionMode !== "latest" && <p><strong>Historical chain unavailable at this time.</strong> Price OHLC/EMA use the exact inspected candle; OI, PCR and payout remain separately labelled latest retained snapshot evidence.</p>}<p>OI units remain provider-native. No account position source is connected in this view; selected pair is not a holding.</p><p>Canvas screenshot export is not provided by V2. Complete source and measurement evidence is available through JSON; chain observations through CSV.</p>{active.data.limitations.map((item) => <p key={item}>{item}</p>)}</>}
        </div>
      </aside>}
    </div>
    <section className={css.analytics}><header className={css.analyticsHeader}><h2>Option analytics · latest retained snapshot</h2><span>{inspectionMode !== "latest" ? "Historical chain unavailable at inspected time · " : ""}PCR {pcr == null ? "unavailable" : pcr.toFixed(2)} · Max pain {maxPain.candidates.join(", ") || "unavailable"}</span></header>
      <div className={css.analyticsGrid}>
        <article className={css.analyticCard}><h3>OI by strike</h3><p>Current provider-native OI; zero-based · {spot == null || nearestSpotStrike == null ? "spot guide unavailable" : `spot ${number(spot)} · nearest strike ${nearestSpotStrike.toLocaleString("en-IN")}`}</p><div className={css.axisContext} data-testid="v2-oi-axis-context"><span><b>Y</b> Open interest · provider units</span><span><b>X</b> Strike</span></div><Suspense fallback={<p>Loading chart…</p>}><Chart className={css.analyticChart} ariaLabel="OI by strike; Y axis open interest in provider units; X axis strike" axisExtentPolicy="native" option={analyticOptions[0]} activeCategoryIndex={hoveredStrikeIndex} onCategoryHover={(index) => setHoveredStrike(index == null ? null : strikeRows[index] ?? null)} /></Suspense></article>
        <article className={css.analyticCard}><h3>Change in OI by strike</h3><p>Signed change against each row&apos;s retained baseline</p><div className={css.axisContext} data-testid="v2-deltaoi-axis-context"><span><b>Y</b> Signed ΔOI · provider units</span><span><b>X</b> Strike</span></div>{deltaState.state === "baseline_unavailable" || deltaState.state === "current_unavailable" ? <div className={css.stateCard} data-testid="v2-deltaoi-state"><div><strong>{deltaState.state === "baseline_unavailable" ? "Baseline unavailable" : "Current OI unavailable"}</strong><span>{deltaState.comparable}/{deltaState.total} comparable contracts · missing is not zero</span><small>No ΔOI bars are drawn until a comparable baseline exists.</small></div></div> : <><p data-testid="v2-deltaoi-state">{deltaState.state === "partial" ? `Partial coverage · ${deltaState.comparable}/${deltaState.total} comparable` : `Comparable · ${deltaState.comparable}/${deltaState.total}`}</p><Suspense fallback={<p>Loading chart…</p>}><Chart className={css.analyticChart} ariaLabel="Change in OI by strike; Y axis signed change in provider units; X axis strike" axisExtentPolicy="native" option={analyticOptions[1]} activeCategoryIndex={hoveredStrikeIndex} onCategoryHover={(index) => setHoveredStrike(index == null ? null : strikeRows[index] ?? null)} /></Suspense></>}</article>
        <article className={css.analyticCard}><h3>PCR context</h3><p>Observed-scope OI PCR · snapshot, not an intraday trend</p><div className={css.stateCard}><div><strong className={css.pcrValue}>{pcr == null ? "—" : pcr.toFixed(2)}</strong><span>{tradingDay || "Current observation"} · {pcr == null ? "eligible CE/PE cohort unavailable" : "one retained snapshot"}</span></div></div></article>
        <article className={css.analyticCard}><h3>Max-pain payout distribution</h3><p>Common-unit estimate; hypothetical settlement, not a forecast · {spot == null || nearestSpotStrike == null ? "spot guide unavailable" : `spot ${number(spot)} · nearest settlement strike ${nearestSpotStrike.toLocaleString("en-IN")}`}</p><Suspense fallback={<p>Loading chart…</p>}><Chart className={css.analyticChart} ariaLabel="Max-pain payout distribution" axisExtentPolicy="native" option={analyticOptions[2]} activeCategoryIndex={hoveredPayoutIndex} onCategoryHover={(index) => setHoveredStrike(index == null ? null : maxPain.points[index]?.settlement ?? null)} /></Suspense></article>
      </div>
    </section>
    <details><summary>Indicator evidence</summary><p>Underlying RSI14 and MACD are calculated from retained completed bars before the selected day is sliced for display.</p><table className={css.snapshotGrid}><thead><tr><th>End</th><th>RSI14</th><th>MACD</th><th>Signal</th></tr></thead><tbody>{indicators.filter((row) => istDay(row.time) === tradingDay).slice(-20).map((row) => <tr key={row.time}><td>{row.time}</td><td>{row.rsi?.toFixed(2) ?? "—"}</td><td>{row.macd?.toFixed(4) ?? "—"}</td><td>{row.signal?.toFixed(4) ?? "—"}</td></tr>)}</tbody></table></details>
  </section>;
}
