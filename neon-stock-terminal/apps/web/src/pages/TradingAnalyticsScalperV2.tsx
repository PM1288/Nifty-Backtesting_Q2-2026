import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import type { EChartsOption } from "echarts";
import { getJson } from "../lib/api";
import { evidenceCsv } from "../lib/tradingAnalyticsExport";
import { dayRows, istDay } from "../lib/tradingAnalyticsChartView";
import { measurePanes, scalperIndicators } from "../lib/scalperMeasurement";
import { SCALPER_ENTRY_RULE, scalperPairedBody70Signals } from "../lib/scalperSignals";
import { maxPainDistribution, oiPcr, rankCurrentOi } from "../lib/scalperV2";
import { ScalperV2Chart, type ScalperV2Crosshair } from "./scalper-v2/ScalperV2Chart";
import css from "./scalper-v2/ScalperV2.module.css";

const Chart = lazy(async () => ({ default: (await import("../components/visual/EChartSurface")).EChartSurface }));
type Row = Record<string, unknown>;
type ChartPayload = {
  panes: { identity: Row; bars: Row[]; coverage: Row[]; sourceMinuteCount: number; oiHistory: Row[] }[];
  availableContracts: Array<{ expiry: string; strike: number; ce_contracts: number; pe_contracts: number }>;
  limitations: string[];
  interval: number;
  asOf: string;
};
const numeric = (value: unknown) => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const compact = (value: unknown) => numeric(value) == null ? "—" : new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 }).format(Number(value));
const price = (value: unknown) => numeric(value) == null ? "—" : `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (value: unknown) => numeric(value) == null ? "—" : `${Number(value) > 0 ? "+" : ""}${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const side = (row: Row) => String(row.option_type ?? "").toUpperCase();
const chartSide = (pane: ChartPayload["panes"][number]) => {
  const symbol = String(pane.identity.tradingsymbol ?? "").toUpperCase();
  return symbol.endsWith("CE") ? "CE" : symbol.endsWith("PE") ? "PE" : "UNDERLYING";
};
const latest = (rows: Row[]) => rows.filter((row) => row.closed === true).at(-1);
const chartQuery = (symbol: string, asOf: string, expiry: string, strike: string, interval: number) => {
  const query = new URLSearchParams({ symbol, asOf, interval: String(interval), historyDays: "3" });
  if (expiry && strike) { query.set("expiry", expiry); query.set("strike", strike); }
  return query;
};
const chartKey = (query: URLSearchParams) => ["trading-analytics-charts", query.toString()] as const;

export function TradingAnalyticsScalperV2({ symbol, label, asOf, expiry, strikes, spot, legs, metricLegs = [], state, errors = [] }: {
  symbol: string; label: string; asOf: string; expiry: string; strikes: number[]; spot: number | null;
  legs: Row[]; metricLegs?: Row[]; state: string; errors?: Row[];
}) {
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const interval = [1, 5, 15, 60].includes(Number(params.get("interval"))) ? Number(params.get("interval")) : 5;
  const defaultStrike = [...strikes].sort((a, b) => Math.abs(a - Number(spot ?? a)) - Math.abs(b - Number(spot ?? b)) || a - b)[0];
  const selectedStrike = params.get("strike") ?? String(defaultStrike ?? "");
  const query = chartQuery(symbol, asOf, expiry, selectedStrike, interval);
  const active = useQuery({
    queryKey: chartKey(query), queryFn: () => getJson<ChartPayload>(`/v1/trading-analytics/charts?${query}`),
    staleTime: 30_000, retry: 1,
  });
  useEffect(() => {
    if (!active.data) return;
    for (const backgroundInterval of [1, 5, 15, 60]) {
      if (backgroundInterval === interval) continue;
      const background = chartQuery(symbol, asOf, expiry, selectedStrike, backgroundInterval);
      void client.prefetchQuery({ queryKey: chartKey(background), queryFn: () => getJson<ChartPayload>(`/v1/trading-analytics/charts?${background}`), staleTime: 30_000 });
    }
  }, [active.data, asOf, client, expiry, interval, selectedStrike, symbol]);
  const [crosshair, setCrosshair] = useState<ScalperV2Crosshair>(null);
  const [railOpen, setRailOpen] = useState(true);
  const [railTab, setRailTab] = useState<"time" | "chain" | "levels" | "rules" | "measure" | "health">("time");
  const [measureMode, setMeasureMode] = useState(false);
  const [points, setPoints] = useState<string[]>([]);
  const [quantity, setQuantity] = useState("65");
  const rawPanes = active.data?.panes ?? [];
  const days = [...new Set((rawPanes[0]?.bars ?? []).map((row) => istDay(row.end)).filter(Boolean))].sort().reverse();
  const tradingDay = params.get("day") && days.includes(params.get("day")!) ? params.get("day")! : (days[0] ?? "");
  const panes = useMemo(() => rawPanes.map((pane) => ({ ...pane, bars: dayRows(pane.bars, tradingDay, "end"), oiHistory: dayRows(pane.oiHistory, tradingDay, "event_time") })), [rawPanes, tradingDay]);
  const underlying = panes.find((pane) => chartSide(pane) === "UNDERLYING");
  const call = panes.find((pane) => chartSide(pane) === "CE");
  const put = panes.find((pane) => chartSide(pane) === "PE");
  const selectedLegs = legs.filter((leg) => String(leg.strike) === selectedStrike);
  const callLeg = selectedLegs.find((leg) => side(leg) === "CE");
  const putLeg = selectedLegs.find((leg) => side(leg) === "PE");
  const rankSource = metricLegs.length ? metricLegs : legs;
  const leaders = useMemo(() => rankCurrentOi(rankSource), [rankSource]);
  const maxPain = useMemo(() => maxPainDistribution(rankSource), [rankSource]);
  const pcr = useMemo(() => oiPcr(rankSource), [rankSource]);
  const indicators = useMemo(() => scalperIndicators(underlying?.bars ?? []), [underlying]);
  const signals = useMemo(() => scalperPairedBody70Signals(panes, interval), [panes, interval]);
  const measurement = points.length === 2 ? measurePanes(panes, points[0], points[1], Number(quantity)) : null;
  const selectTime = (time: string) => {
    if (!measureMode) return;
    setPoints((current) => current.length === 1 ? [current[0], time].sort() : [time]);
    if (points.length === 1) setMeasureMode(false);
  };
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next); };
  const latestRows = [underlying, call, put].map((pane) => latest(pane?.bars ?? []));
  const contextRows = rankSource.map((row) => ({ ...row, ranking_scope: metricLegs.length ? "Observed retained cohort" : "Nearest paired observed window", analysis_as_of: asOf }));

  const strikeRows = [...new Set(rankSource.map((row) => numeric(row.strike)).filter((value): value is number => value != null))].sort((a, b) => a - b);
  const currentSeries = (wanted: "CE" | "PE") => strikeRows.map((strike) => numeric(rankSource.find((row) => side(row) === wanted && numeric(row.strike) === strike)?.open_interest));
  const changeSeries = (wanted: "CE" | "PE") => strikeRows.map((strike) => {
    const row = rankSource.find((candidate) => side(candidate) === wanted && numeric(candidate.strike) === strike);
    return numeric((row?.oi_layers as Row | undefined)?.change);
  });
  const analyticOptions: EChartsOption[] = [
    { tooltip: { trigger: "axis" }, legend: { data: ["CE OI", "PE OI"] }, grid: { left: 62, right: 20, top: 42, bottom: 52 }, xAxis: { type: "category", data: strikeRows }, yAxis: { type: "value", min: 0, name: "Provider OI" }, series: [{ name: "CE OI", type: "bar", data: currentSeries("CE"), itemStyle: { color: "#2563eb" } }, { name: "PE OI", type: "bar", data: currentSeries("PE"), itemStyle: { color: "#eab308" } }] },
    { tooltip: { trigger: "axis" }, legend: { data: ["CE ΔOI", "PE ΔOI"] }, grid: { left: 62, right: 20, top: 42, bottom: 52 }, xAxis: { type: "category", data: strikeRows }, yAxis: { type: "value", name: "ΔOI vs baseline" }, series: [{ name: "CE ΔOI", type: "bar", data: changeSeries("CE").map((value) => ({ value, itemStyle: { color: value != null && value < 0 ? "#c6283d" : "#117a40", borderColor: "#2563eb", borderWidth: 1 } })) }, { name: "PE ΔOI", type: "bar", data: changeSeries("PE").map((value) => ({ value, itemStyle: { color: value != null && value < 0 ? "#c6283d" : "#117a40", borderColor: "#eab308", borderWidth: 1 } })) }] },
    { tooltip: { trigger: "axis" }, grid: { left: 55, right: 18, top: 32, bottom: 45 }, xAxis: { type: "category", data: [tradingDay || "Current"] }, yAxis: { type: "value", name: "OI PCR", min: 0 }, series: [{ name: "Observed-scope OI PCR", type: "bar", data: [pcr], itemStyle: { color: "#6651d9" }, label: { show: true, position: "top", formatter: pcr == null ? "Unavailable" : pcr.toFixed(2) } }] },
    { tooltip: { trigger: "axis" }, legend: { data: ["Call payout", "Put payout", "Combined"] }, grid: { left: 72, right: 20, top: 42, bottom: 52 }, xAxis: { type: "category", data: maxPain.points.map((point) => point.settlement) }, yAxis: { type: "value", name: "Common-unit payout" }, series: [{ name: "Call payout", type: "line", data: maxPain.points.map((point) => point.callPayout), lineStyle: { color: "#2563eb" } }, { name: "Put payout", type: "line", data: maxPain.points.map((point) => point.putPayout), lineStyle: { color: "#eab308" } }, { name: "Combined", type: "line", data: maxPain.points.map((point) => point.totalPayout), lineStyle: { color: "#14243a", width: 3 } }] },
  ];

  if (!active.data) return <section className={css.loading} role="status">{active.isLoading ? `Loading ${label} ${interval}m first…` : "Exact chart context unavailable."}</section>;
  return <section className={css.page} data-testid="scalper-v2">
    <header className={css.commandBar}>
      <strong>Scalper V2</strong>
      <label>Session <select value={tradingDay} onChange={(event) => update("day", event.target.value)}>{days.map((day) => <option key={day}>{day}</option>)}</select></label>
      <label>Pair <select value={selectedStrike} onChange={(event) => { update("strike", event.target.value); setPoints([]); }}>{strikes.map((strike) => <option key={strike} value={strike}>{strike.toLocaleString("en-IN")}</option>)}</select></label>
      <span>{expiry || "Expiry unavailable"}</span>
      {[1, 5, 15, 60].map((value) => <button key={value} aria-current={interval === value ? "page" : undefined} onClick={() => update("interval", String(value))}>{value === 60 ? "1h" : `${value}m`}</button>)}
      <button aria-pressed={measureMode} onClick={() => { setMeasureMode(!measureMode); if (!measureMode) setRailTab("measure"); }}>Measure A–B</button>
      <button aria-pressed={railOpen} onClick={() => setRailOpen(!railOpen)}>{railOpen ? "Hide rail" : "Show rail"}</button>
      <button onClick={() => { const body = JSON.stringify({ version: "SCALPER_V2_UI_V1", symbol, expiry, selectedStrike, interval, asOf, rankingScope: metricLegs.length ? "OBSERVED_RETAINED_COHORT" : "NEAREST_PAIRED_OBSERVED_WINDOW", rankLevels: leaders, source: contextRows, chart: active.data }, null, 2); const url = URL.createObjectURL(new Blob([body], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `scalper-v2-${symbol}-${tradingDay || "current"}.json`; anchor.click(); URL.revokeObjectURL(url); }}>Export JSON</button>
      <button onClick={() => { const url = URL.createObjectURL(new Blob([evidenceCsv(contextRows)], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `scalper-v2-chain-${symbol}-${tradingDay || "current"}.csv`; anchor.click(); URL.revokeObjectURL(url); }}>Chain CSV</button>
    </header>
    <div className={css.statusBar}><strong>{state}</strong> · Read-only research · {errors.length} source failures · active {interval}m loaded first · 1m/5m/15m/1h cached after first paint · V7 signals {signals.length}</div>
    {active.error && <div className={css.warning} role="alert">The selected timeframe could not refresh. Cached timeframes remain available.</div>}
    <div className={css.workspace} style={!railOpen ? { gridTemplateColumns: "minmax(0,1fr)" } : undefined}>
      <div className={css.charts}>
        <ScalperV2Chart id="underlying" title={label} subtitle="Underlying · index points" bars={underlying?.bars ?? []} interval={interval} height={500} externalCrosshair={crosshair} onCrosshair={setCrosshair} onTimeClick={selectTime} rankLevels={leaders} oiProfile={rankSource.flatMap((row) => { const strike = numeric(row.strike), currentOi = numeric(row.open_interest), optionSide = side(row); return strike != null && currentOi != null && currentOi >= 0 && (optionSide === "CE" || optionSide === "PE") ? [{ side: optionSide as "CE" | "PE", strike, currentOi }] : []; })} />
        <ScalperV2Chart id="call" title={`CE ${Number(selectedStrike).toLocaleString("en-IN")}`} subtitle={String(call?.identity.tradingsymbol ?? "Exact call unavailable")} bars={call?.bars ?? []} interval={interval} height={224} externalCrosshair={crosshair} onCrosshair={setCrosshair} onTimeClick={selectTime} />
        <ScalperV2Chart id="put" title={`PE ${Number(selectedStrike).toLocaleString("en-IN")}`} subtitle={String(put?.identity.tradingsymbol ?? "Exact put unavailable")} bars={put?.bars ?? []} interval={interval} height={224} externalCrosshair={crosshair} onCrosshair={setCrosshair} onTimeClick={selectTime} />
      </div>
      {railOpen && <aside className={css.rail} aria-label="Scalper V2 option chain and inspector">
        <header className={css.railHeader}><h2>{label} · {Number(selectedStrike).toLocaleString("en-IN")} pair</h2><span className={css.identity}>{expiry}</span></header>
        <div className={css.premiums}><div className={`${css.premium} ${css.call}`}><b>CE · exact contract</b><strong>{price(latestRows[1]?.close ?? callLeg?.last_price)}</strong><small>Completed close / retained quote</small></div><div className={`${css.premium} ${css.put}`}><b>PE · exact contract</b><strong>{price(latestRows[2]?.close ?? putLeg?.last_price)}</strong><small>Completed close / retained quote</small></div></div>
        <div className={css.leaders}>{leaders.map((leader) => <div className={css.leader} key={`${leader.side}-${leader.rank}`}><span className={leader.side === "CE" ? css.callText : css.putText}>{leader.side}{leader.rank}</span><b>{leader.strike.toLocaleString("en-IN")}</b><small>OI {compact(leader.currentOi)}{leader.tiedOi ? " · tie" : ""}</small></div>)}</div>
        <div className={css.tabs} role="tablist">{(["time", "chain", "levels", "rules", "measure", "health"] as const).map((tab) => <button key={tab} role="tab" aria-selected={railTab === tab} onClick={() => setRailTab(tab)}>{tab === "time" ? "At time" : tab[0].toUpperCase() + tab.slice(1)}</button>)}</div>
        <div className={css.railBody}>
          {railTab === "time" && <table className={css.snapshotGrid}><thead><tr><th>Instrument</th><th>Open</th><th>Close</th><th>EMA9</th></tr></thead><tbody>{[[label, latestRows[0]], ["CE", latestRows[1]], ["PE", latestRows[2]]].map(([name, row]) => <tr key={String(name)}><th>{String(name)}</th><td>{numeric((row as Row | undefined)?.open)?.toFixed(2) ?? "—"}</td><td>{numeric((row as Row | undefined)?.close)?.toFixed(2) ?? "—"}</td><td>{numeric((row as Row | undefined)?.ema9)?.toFixed(2) ?? "—"}</td></tr>)}</tbody></table>}
          {railTab === "chain" && <table className={css.chain}><thead><tr><th>CE OI</th><th>CE LTP</th><th>Strike</th><th>PE LTP</th><th>PE OI</th></tr></thead><tbody>{strikeRows.map((strike) => { const ce = rankSource.find((row) => side(row) === "CE" && numeric(row.strike) === strike), pe = rankSource.find((row) => side(row) === "PE" && numeric(row.strike) === strike); return <tr key={strike} aria-current={String(strike) === selectedStrike}><td>{compact(ce?.open_interest)}</td><td>{price(ce?.last_price)}</td><td><button onClick={() => update("strike", String(strike))}>{strike.toLocaleString("en-IN")}</button></td><td>{price(pe?.last_price)}</td><td>{compact(pe?.open_interest)}</td></tr>; })}</tbody></table>}
          {railTab === "levels" && <><p>OI leaders are ranked from <strong>{metricLegs.length ? "the retained observed cohort" : "the nearest paired observed window"}</strong>; they do not change the selected pair.</p>{leaders.map((leader) => <p key={`${leader.side}${leader.rank}`}><b>{leader.side}{leader.rank}</b> {leader.strike.toLocaleString("en-IN")} · OI {leader.currentOi.toLocaleString("en-IN")} · ΔOI {signed(leader.changeOi)}</p>)}</>}
          {railTab === "rules" && <><p><strong>{SCALPER_ENTRY_RULE}</strong></p><p>Canonical V7 results are reused. Setup, waiting, missing next bar, failed gate and retrospective entry reference remain distinct.</p>{signals.slice(-20).map((signal) => <p key={signal.id}><b>{signal.direction}</b> · {signal.state.replaceAll("_", " ")} · {signal.setupTime}</p>)}</>}
          {railTab === "measure" && <><p><strong>A open → B close</strong> · illustrative, before costs/slippage, not booked P&amp;L.</p><label>Quantity units <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><p>{points[0] ? `A ${points[0]}` : "Click a chart candle to choose A"}</p><p>{points[1] ? `B ${points[1]}` : "Then click a candle to choose B"}</p>{measurement && <table className={css.metricGrid}><tbody><tr><th>Underlying points</th><td>{signed(measurement.rows.find((row) => row.kind === "UNDERLYING")?.delta)}</td></tr><tr><th>CE premium Δ</th><td>{signed(measurement.rows.find((row) => row.kind === "CE")?.delta)}</td></tr><tr><th>PE premium Δ</th><td>{signed(measurement.rows.find((row) => row.kind === "PE")?.delta)}</td></tr><tr><th>Combined premium Δ</th><td>{signed(measurement.combined)}</td></tr><tr><th>Illustrative P&amp;L</th><td>{price(measurement.pnl)}</td></tr></tbody></table>}<button onClick={() => { setPoints([]); setMeasureMode(false); }}>Clear A/B</button></>}
          {railTab === "health" && <><p><strong>{state}</strong> · {errors.length} source failures</p><p>Ranking: {metricLegs.length ? "Observed retained cohort" : "Nearest paired observed window; not full expiry"}</p><p>As-of {asOf}</p><p>OI units remain provider-native and are not represented as verified rupee exposure.</p>{active.data.limitations.map((item) => <p key={item}>{item}</p>)}</>}
        </div>
      </aside>}
    </div>
    <section className={css.analytics}>
      <header className={css.analyticsHeader}><h2>Option analytics · same expiry and observation scope</h2><span>PCR {pcr == null ? "unavailable" : pcr.toFixed(2)} · Max pain {maxPain.candidates.join(", ") || "unavailable"}</span></header>
      <div className={css.analyticsGrid}>{[
        ["OI by strike", "Current provider-native OI; zero-based", analyticOptions[0]],
        ["Change in OI by strike", "Signed change against each row's named retained baseline", analyticOptions[1]],
        ["PCR context", "Observed-scope OI PCR on an independent ratio scale", analyticOptions[2]],
        ["Max-pain payout distribution", "Common-unit estimate; combined minimum, not a forecast", analyticOptions[3]],
      ].map(([title, note, option]) => <article className={css.analyticCard} key={String(title)}><h3>{String(title)}</h3><p>{String(note)}</p><Suspense fallback={<p>Loading chart…</p>}><Chart className={css.analyticChart} ariaLabel={String(title)} axisExtentPolicy="native" option={option as EChartsOption} /></Suspense></article>)}</div>
    </section>
    <details><summary>Indicator evidence</summary><p>Underlying RSI14 and MACD are calculated from retained completed bars with warm-up; changing the visible timeframe does not fabricate data.</p><table className={css.snapshotGrid}><thead><tr><th>End</th><th>RSI14</th><th>MACD</th><th>Signal</th></tr></thead><tbody>{indicators.slice(-20).map((row) => <tr key={row.time}><td>{row.time}</td><td>{row.rsi?.toFixed(2) ?? "—"}</td><td>{row.macd?.toFixed(4) ?? "—"}</td><td>{row.signal?.toFixed(4) ?? "—"}</td></tr>)}</tbody></table></details>
  </section>;
}
