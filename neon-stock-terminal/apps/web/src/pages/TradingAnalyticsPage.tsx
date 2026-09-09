import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useMemo,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { getJson } from "../lib/api";
import type { EChartsOption } from "echarts";
import styles from "./TradingAnalyticsPage.module.css";
import { TradingAnalyticsScalper } from "./TradingAnalyticsScalper";
import { evidenceCsv } from "../lib/tradingAnalyticsExport";
import {
  analyticsTabs,
  analyticsMainView,
} from "../lib/tradingAnalyticsNavigation";
import { TradingAnalyticsDrawer } from "./TradingAnalyticsDrawer";
import { TradingAnalyticsMorning } from "./TradingAnalyticsMorning";
import { TradingAnalyticsStructure } from "./TradingAnalyticsStructure";
import { TradingAnalyticsCash, type CashHistory } from "./TradingAnalyticsCash";
import { TradingAnalyticsTradeLog } from "./TradingAnalyticsTradeLog";
import { evidenceValueAxis } from "../lib/tradingAnalyticsChartView";

const Chart = lazy(async () => ({
  default: (await import("../components/visual/EChartSurface")).EChartSurface,
}));
const TimeframeMatrix = lazy(async () => ({
  default: (await import("./TradingAnalyticsTimeframeMatrix")).TradingAnalyticsTimeframeMatrix,
}));
type Row = Record<string, unknown>;
const InspectContext = createContext<(row: Row) => void>(() => {});
type Payload = {
  underlying: {symbol:string;label:string;kind:string};
  universe: {symbol:string;label:string;kind:string}[];
  version: string;
  asOf: string;
  reportDate: string;
  availableDates: string[];
  state: string;
  evidenceId: string;
  activity: Row[];
  participants: Row[];
  issues: Row[];
  errors: Row[];
  candles: Row[];
  cashHistory?: CashHistory;
  resistance?: Row[];
  periods?: { weekly: Row[]; monthly: Row[] };
  smartapi: {
    source: string;
    asOf: string;
    expiry: string | null;
    expiries: string[];
    legs: Row[];
    strikes: number[];
    spot: Row | null;
    shortfall: number;
    note: string;
    metrics: { oiPcr: number | null; volumePcr: number | null; indicativeMaxPainStrikes?:number[];maxPainState?:string;maxPainScope?:string;source?:string;strikes?:number[];collectedAt?:string|null };
    oiAnalytics?: {
      baselinePreference: string[];
      fixedCohort: {
        id: string;
        state: string;
        ce: Row;
        pe: Row;
      };
      profile: Row[];
    };
  };
  policies: Row[];
  limitations: string[];
  morning: {
    matrix: string;
    cash: Row[];
    cashNet: number | null;
    cashSign: string | null;
    knowledgeState: string;
    reportLagDays: number;
  };
  chain: {
    snapshot: Row | null;
    previousSnapshot: Row | null;
    expiries: string[];
    legs: Row[];
    strikes: number[];
    shortfall: number;
    metrics: {
      oiPcr: number | null;
      volumePcr: number | null;
      maxPainStrikes: number[];
      normalizationState: string;
    };
    ageSeconds: number | null;
    state: string;
    scope: string;
    archivedLegCount: number;
  };
};
const tabs = {
  morning: "Morning Brief",
  activity: "FII Activity",
  participants: "Participant OI",
  options: "Option Snapshots",
  smartapi: "SmartAPI OI & Quotes",
  scalper: "Scalper / Exact Contracts",
  "trade-log": "Scalper Trade Log",
  matrix: "1m / 5m / 15m Matrix",
  structure: "Price & EMA",
  replay: "History / Replay",
  health: "Policy & Data Health",
  stock: "Stock Activity",
} as const;
type Tab = keyof typeof tabs;
export function display(v: unknown) {
  if (v == null || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "number")
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 8 }).format(
      v,
    );
  return String(v);
}
function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Table({
  rows,
  columns,
  label,
}: {
  rows: Row[];
  columns: [string, string][];
  label: string;
}) {
  const inspect = useContext(InspectContext);
  return (
    <div
      className={styles.tableWrap}
      tabIndex={0}
      role="region"
      aria-label={`${label} scroll area`}
    >
      <table aria-label={label}>
        <thead>
          <tr>
            {columns.map(([k, l]) => (
              <th key={k}>{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map(([k], col) => (
                <td
                  key={k}
                  title={display(r[k])}
                  className={
                    k.startsWith("net_") || k === "options_proxy"
                      ? r[k] == null
                        ? styles.missing
                        : Number(r[k]) < 0
                          ? styles.negative
                          : Number(r[k]) > 0
                            ? styles.positive
                            : ""
                      : ""
                  }
                >
                  {col === 0 ||
                  k.startsWith("net_") ||
                  k === "options_proxy" ? (
                    <button
                      className={styles.metricButton}
                      onClick={() => inspect(r)}
                    >
                      {display(r[k])}
                    </button>
                  ) : (
                    display(r[k])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p>No observations available for this source and as-of time.</p>
      )}
    </div>
  );
}
function Plot({ option, label }: { option: EChartsOption; label: string }) {
  return (
    <section className={styles.plot} aria-label={label}>
      <Suspense fallback={<p>Loading chart…</p>}>
        <Chart className={styles.chart} ariaLabel={label} option={option} />
      </Suspense>
    </section>
  );
}
function OiChart({ legs, pcr }: { legs: Row[]; pcr: number | null }) {
  const [metric,setMetric]=useState("composite");
  const metrics: Record<string,string> = {composite:"Baseline/current OI composition",baseline_change:"Qualified baseline ΔOI",open_interest:"Current OI · provider-native",previous_snapshot_delta:"Prior snapshot ΔOI · provider-native",change_in_oi:"Provider day ΔOI · provider-native",delta:"Option Delta · Greek"};
  const strikes=[...new Set(legs.map(l=>Number(l.strike)))].sort((a,b)=>a-b);
  const layer=(leg:Row|undefined,key:string)=> {
    const layers=leg?.oi_layers as Row|undefined;
    return layers?.[key] == null ? null : Number(layers[key]);
  };
  const compositeSeries = ["CE","PE"].flatMap((side,sideIndex)=>
    ["retained","added","removed","current"].map((part)=>({
      name: side + " " + (part === "current" ? "current only" : part),
      type:"bar" as const,
      stack:side,
      barMaxWidth:24,
      data:strikes.map(strike=>{
        const leg=legs.find(row=>Number(row.strike)===strike&&row.option_type===side);
        const state=(leg?.oi_layers as Row|undefined)?.state;
        if(part==="current") return state==="CURRENT_ONLY_BASELINE_UNAVAILABLE" ? Number(leg?.open_interest) : 0;
        return state==="COMPARABLE" ? layer(leg,part) : 0;
      }),
      itemStyle:{
        color:part==="removed"?"#ffffff":sideIndex?"#087a55":"#c93346",
        borderColor:sideIndex?"#087a55":"#c93346",
        borderWidth:part==="removed"?2:0,
        opacity:part==="added"?0.62:1,
      },
    }))
  );
  const option = useMemo<EChartsOption>(
    () => ({
      animation: false,
      tooltip: { trigger: "axis" },
      legend: { data: ["CE", "PE"] },
      grid: { left: 28, right: 28, top: 65, bottom: 55, containLabel: true },
      xAxis: {
        type: "category",
        name: "Strike",
        data: strikes.map(String),
      },
      yAxis: { ...evidenceValueAxis, type: "value", min:["composite","open_interest"].includes(metric)?0:undefined, name: metric==="delta"?"Option Delta":metric==="baseline_change"?"Signed ΔOI":"Source OI" },
      series: metric==="composite" ? compositeSeries : ["CE", "PE"].map((t, i) => ({
        name: t,
        type: "bar",
        data: strikes.map(s=>{const l=legs.find(l=>Number(l.strike)===s&&l.option_type===t);return metric==="baseline_change"?layer(l,"change"):l?.[metric]==null?null:Number(l[metric]);}),
        itemStyle: { color: i ? "#087a55" : "#c93346" },
        markLine:metric==="baseline_change"?{silent:true,symbol:"none",data:[{yAxis:0}],label:{show:false}}:undefined,
      })),
    }),
    [legs,metric,strikes],
  );
  return (
    <section className={styles.oiPcrChart} aria-label="OI and PCR chart">
      <div className={styles.toolbar}>
        <h3>OI &amp; PCR · chart by strike</h3>
        <span>Window OI PCR <strong>{display(pcr)}</strong></span>
        <label>OI chart measure <select value={metric} onChange={e=>setMetric(e.target.value)}>{Object.entries(metrics).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
      </div>
      {!legs.some(l=>metric==="composite"?l.open_interest!=null:metric==="baseline_change"?layer(l,"change")!=null:l[metric]!=null)&&<p className={styles.warning}>Unavailable: {metrics[metric]}. No zero values are synthesized.</p>}
      <Plot
        label={`${metrics[metric]} by strike; retained display window only`}
        option={option}
      />
    </section>
  );
}
const activityColumns: [string, string][] = [
  ["fii_derivatives", "Product"],
  ["family_total", "Family total"],
  ["buy_contracts", "Buy contracts"],
  ["sell_contracts", "Sell contracts"],
  ["net_contracts", "Net contracts"],
  ["buy_value_in_cr", "Buy ₹ crore"],
  ["sell_value_in_cr", "Sell ₹ crore"],
  ["net_crore", "Net ₹ crore"],
  ["open_contracts", "EOD OI contracts"],
  ["open_contracts_value_in_cr", "EOD ₹ crore"],
  ["legacy_sign", "Legacy sign"],
  ["canonical_sign", "Canonical sign"],
  ["loaded_at", "Known / loaded at"],
  ["source_file", "Source"],
];
const peopleColumns: [string, string][] = [
  ["client_type", "Participant"],
  ["future_index_long", "Index fut long"],
  ["future_index_short", "Index fut short"],
  ["net_futures", "Net fut contracts"],
  ["futures_long_pct", "Futures long %"],
  ["net_calls", "Net calls"],
  ["net_puts", "Net puts"],
  ["options_proxy", "Options count proxy"],
  ["previous_trade_date", "Previous report"],
  ["delta_net_futures", "Δ net futures"],
  ["delta_options_proxy", "Δ options proxy"],
  ["futures_long_pct_change_pp", "Δ futures long pp"],
  ["comparison_state", "Comparison state"],
  ["legacy_options_label", "Legacy >50 contracts"],
  ["legacy_futures_label", "Legacy >50%"],
  ["total_long_contracts", "Reported total long"],
  ["total_short_contracts", "Reported total short"],
];
const optionColumns: [string, string][] = [
  ["instrument_identifier", "Exact contract"],
  ["strike", "Strike"],
  ["option_type", "Right"],
  ["last_price", "LTP ₹"],
  ["bid_price", "Bid ₹"],
  ["bid_qty", "Bid qty"],
  ["ask_price", "Ask ₹"],
  ["ask_qty", "Ask qty"],
  ["total_traded_volume", "Volume (source)"],
  ["open_interest", "OI (source)"],
  ["baseline_kind", "Comparison baseline"],
  ["baseline_open_interest", "Baseline OI"],
  ["oi_layers", "Retained / added / reduced"],
  ["change_in_oi", "Provider day ΔOI"],
  ["previous_snapshot_delta", "Prior snapshot ΔOI"],
  ["implied_volatility", "IV (source)"],
  ["delta", "Delta"],
  ["gamma", "Gamma"],
  ["theta", "Theta"],
  ["vega", "Vega"],
];

export function TradingAnalyticsPage() {
  const [drawer, setDrawer] = useState<
    "health" | "source" | "condition" | null
  >(null);
  const [inspected, setInspected] = useState<Row | null>(null);
  const [params, setParams] = useSearchParams();
  const tab: Tab =
    params.get("view") === "oi"
      ? "smartapi"
      : Object.hasOwn(tabs, params.get("view") ?? "")
        ? (params.get("view") as Tab)
        : "morning";
  const [replayInput, setReplayInput] = useState(params.get("asOf") ?? "");
  const main = analyticsMainView(tab);
  const query = new URLSearchParams();
  for (const k of ["symbol", "date", "expiry", "asOf", "dailyLookback", "weeklyLookback"])
    if (params.get(k)) query.set(k, params.get(k)!);
  const q = useQuery({
    queryKey: ["trading-analytics", query.toString()],
    queryFn: () => getJson<Payload>(`/v1/trading-analytics?${query}`),
    staleTime: 30000,
    refetchInterval: main === "morning" ? 60000 : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const change = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next);
  };
  const d = q.data;
  const inspect = (row: Row) => {
    setInspected(row);
    setDrawer("source");
  };
  if (import.meta.env.VITE_TRADING_ANALYTICS_ENABLED === "false")
    return (
      <section>
        Trading Analytics is disabled.{" "}
        <Link to="/strategy/nifty-options">NIFTY Options</Link>
      </section>
    );
  return (
    <InspectContext.Provider value={inspect}>
      <section className={styles.page} data-view={tab} aria-label="Trading Analytics workspace">
        <header className={styles.toolbar}>
          <h1>Trading Analytics</h1>
          <span>READ-ONLY · Research</span>
          <Link to="/strategy/nifty-options">NIFTY strategy</Link>
          <button onClick={() => setDrawer("health")} title="Data health">Health</button>
          <button onClick={() => setDrawer("source")} title="Source and formula">Formula</button>
          <button onClick={() => setDrawer("condition")}>
            Conditions
          </button>
          <button disabled={q.isFetching} onClick={() => void q.refetch()}>
            {q.isFetching ? "Refreshing…" : "Refresh"}
          </button>
          {d && (
            <>
              <label>Symbol <select aria-label="Analytics underlying" value={d.underlying.symbol} onChange={e=>{
                const next=new URLSearchParams(params); next.set('symbol',e.target.value);
                for(const k of ['expiry','strike','pin','day']) next.delete(k);
                setInspected(null);setDrawer(null);setParams(next);
              }}>
                {d.universe.length ? d.universe.map(u=><option key={u.symbol} value={u.symbol}>{u.symbol} · {u.kind}</option>) : <option value={d.underlying.symbol}>{d.underlying.label}</option>}
              </select></label>
              <label>Chain <select aria-label="Selected underlying expiry" value={d.smartapi.expiry??''} onChange={e=>{
                const next=new URLSearchParams(params);next.set('expiry',e.target.value);next.delete('strike');next.delete('pin');setParams(next);
              }}><option value="">Unavailable / automatic</option>{d.smartapi.expiries.map(e=><option key={e} value={e}>{e}</option>)}</select></label>
              <label>
                Report{" "}
                <select
                  value={d.reportDate}
                  onChange={(e) => change("date", e.target.value)}
                >
                  {d.availableDates.map((date) => (
                    <option key={date}>{date}</option>
                  ))}
                </select>
              </label>
              <button
                onClick={() =>
                  download(
                    `trading-analytics-${d.reportDate}.json`,
                    JSON.stringify(d, null, 2),
                    "application/json",
                  )
                }
              >
                Export JSON
              </button>
            </>
          )}
        </header>
        <nav className={styles.tabs} aria-label="Trading analytics lenses">
          {Object.entries(analyticsTabs).map(([id, label]) => (
            <button
              key={id}
              aria-current={main === id ? "page" : undefined}
              onClick={() => change("view", id === "oi" ? "smartapi" : id)}
            >
              {label}
            </button>
          ))}
        </nav>
        {d && (
          <p className={styles.context}>
            Underlying: {d.underlying.label} · Report {d.reportDate} · Analysis / as-of{" "}
            {d.asOf} · Aggregate report scope: all index derivatives ·{" "}
            {params.get("asOf")
              ? "Retained-source inspection"
              : "Current retained evidence"}
          </p>
        )}
        {d && <section className={styles.kpis} tabIndex={0} aria-label="Selected underlying option metrics">
          <span>{d.underlying.symbol} · {d.smartapi.expiry ?? 'Expiry unavailable'} · {d.smartapi.metrics.source??d.smartapi.source} · {d.smartapi.metrics.strikes?.length??0} paired strikes{d.smartapi.metrics.collectedAt?` · Captured ${d.smartapi.metrics.collectedAt}`:''}</span>
          <span>OI PCR <strong>{display(d.smartapi.metrics.oiPcr)}</strong></span>
          <span>Volume PCR <strong>{display(d.smartapi.metrics.volumePcr)}</strong></span>
          <span>Indicative window max pain <strong>{d.smartapi.metrics.indicativeMaxPainStrikes?.join(', ') || '—'}</strong></span>
          <span title={d.smartapi.metrics.maxPainScope}>{d.smartapi.metrics.maxPainState?.replaceAll('_',' ')} · Not full-chain · As-of {d.asOf}</span>
        </section>}
        {main === "morning" && (
          <nav className={styles.toolbar} aria-label="Morning detail tabs">
            {[
              ["morning", "Overview"],
              ["activity", "FII Activity"],
              ["participants", "Participant OI"],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => change("view", id)}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
        {main === "oi" && (
          <nav className={styles.toolbar} aria-label="OI provider views">
            {[
              ["smartapi", "SmartAPI OI & Quotes"],
              ["options", "NSE option snapshots"],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => change("view", id)}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
        {d && !["scalper", "trade-log", "matrix", "replay", "stock"].includes(tab) && (
          <button
            onClick={() => {
              const rows =
                tab === "smartapi"
                  ? d.smartapi.legs
                  : tab === "options"
                    ? d.chain.legs
                    : tab === "participants"
                      ? d.participants
                      : tab === "structure"
                        ? d.candles
                        : tab === "health"
                          ? d.issues
                          : d.activity;
              download(
                `trading-analytics-${tab}-${d.reportDate}.csv`,
                evidenceCsv(rows),
                "text/csv;charset=utf-8",
              );
            }}
          >
            Export source rows CSV
          </button>
        )}
        {q.error && (
          <section role="alert" className={styles.warning}>
            Could not refresh evidence.{" "}
            {q.error instanceof Error ? q.error.message : "Request failed"}{" "}
            <button onClick={() => void q.refetch()}>Retry</button>
          </section>
        )}
        {!d ? (
          <p role="status">
            {q.isLoading
              ? "Loading retained research evidence…"
              : "No evidence response."}
          </p>
        ) : (
          <>
            <section className={styles.warning}>
              <strong>{d.state}</strong> · No paper or broker orders. Report{" "}
              {d.reportDate} ({d.morning.reportLagDays} calendar days old) · NSE
              chain {d.chain.state} · {d.issues.length} reconciliation issues ·{" "}
              {d.errors.length} source query failures.{" "}
              <button onClick={() => setDrawer("health")}>
                Inspect blockers
              </button>
              {" · "}
              <button onClick={() => change("view", "smartapi")}>
                SmartAPI OI & Quotes (
                {d.smartapi.legs.filter((r) => r.open_interest != null).length}{" "}
                OI observations)
              </button>
            </section>
            {tab === "smartapi" && (
              <>
                <div className={styles.toolbar}>
                  <h2>{d.underlying.symbol} SmartAPI OI & Quotes</h2>
                  <label>
                    Expiry{" "}
                    <select
                      value={d.smartapi.expiry ?? ""}
                      onChange={(e) => change("expiry", e.target.value)}
                    >
                      {d.smartapi.expiries.map((e) => (
                        <option key={e}>{e}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <p>{d.smartapi.note}</p>
                <div className={styles.kpis}>
                  <span>
                    Paired strikes{" "}
                    <strong>{d.smartapi.strikes.length}/10</strong>
                  </span>
                  <span>
                    OI available{" "}
                    <strong>
                      {
                        d.smartapi.legs.filter((r) => r.open_interest != null)
                          .length
                      }
                      /{d.smartapi.legs.length}
                    </strong>
                  </span>
                  <span>
                    Window OI PCR{" "}
                    <strong>{display(d.smartapi.metrics.oiPcr)}</strong>
                  </span>
                  <span>
                    Window volume PCR{" "}
                    <strong>{display(d.smartapi.metrics.volumePcr)}</strong>
                  </span>
                  <span>
                    Fixed-cohort CE ΔOI{" "}
                    <strong>{display(d.smartapi.oiAnalytics?.fixedCohort.ce.change)}</strong>
                  </span>
                  <span>
                    Fixed-cohort PE ΔOI{" "}
                    <strong>{display(d.smartapi.oiAnalytics?.fixedCohort.pe.change)}</strong>
                  </span>
                </div>
                {d.smartapi.legs.length > 0 && (
                  <OiChart legs={d.smartapi.legs} pcr={d.smartapi.metrics.oiPcr} />
                )}
                <h3>Exact-option OI &amp; quote table</h3>
                <Table
                  label="SmartAPI exact-contract OI and quotes"
                  rows={d.smartapi.legs}
                  columns={[
                    ...optionColumns,
                    ["baseline_kind", "OI baseline"],
                    ["baseline_open_interest", "Baseline OI"],
                    ["baseline_collected_at", "Baseline collected UTC"],
                    ["oi_layers", "Retained / added / removed / change"],
                    ["previous_open_interest", "Prior quote OI"],
                    ["previous_collected_at", "Prior quote collected UTC"],
                    ["previous_exchange_feed_at", "Prior exchange time UTC"],
                    ["greeks_collected_at", "Greeks collected UTC"],
                    ["greeks_state", "Greeks availability"],
                    ["lotsize", "Master lot size"],
                    ["quote_state", "Market data state"],
                    ["exchange_feed_at", "Exchange time UTC"],
                    ["collected_at", "Collected UTC"],
                    ["day_open", "Open ₹"],
                    ["day_high", "High ₹"],
                    ["day_low", "Low ₹"],
                    ["total_buy_qty", "Total buy qty"],
                    ["total_sell_qty", "Total sell qty"],
                  ]}
                />
                <p>
                  Provider-day ΔOI and participant positions are different data.
                  No missing ΔOI is inferred as zero. Raw bid/ask depth and all
                  source fields remain in Full evidence JSON and this tab’s CSV.
                </p>
              </>
            )}
            {tab === "morning" && (
              <>
                <TradingAnalyticsCash data={d.cashHistory} onInspect={inspect} />
                <TradingAnalyticsMorning
                  activity={d.activity}
                  participants={d.participants}
                  morning={d.morning}
                  smartapi={d.smartapi}
                  onInspect={inspect}
                  onStructure={() => change("view", "structure")}
                />
                <details>
                  <summary>Full summary evidence and journey</summary>
                  <div className={styles.journey}>
                    {[
                      "1 Previous-session activity",
                      "2 Outstanding positions",
                      "3 Underlying price",
                      "4 Exact option confirmation",
                      "5 OI context",
                      "6 Research evidence",
                    ].map((v, i) => (
                      <button
                        key={v}
                        onClick={() =>
                          change(
                            "view",
                            (
                              [
                                "activity",
                                "participants",
                                "structure",
                                "options",
                                "options",
                                "health",
                              ] as Tab[]
                            )[i],
                          )
                        }
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <section>
                    <h2>Morning hypothesis: {d.morning.matrix}</h2>
                    <p>
                      Cash plus aggregate INDEX FUTURES and INDEX OPTIONS.
                      Same-day activity is not outstanding positions; an
                      improving proxy is not entry authorization.
                    </p>
                    <p>
                      {d.morning.knowledgeState.replaceAll("_", " ")} · Missing
                      cash or unmapped sign combinations remain explicit.
                    </p>
                  </section>
                  <Table
                    label="Activity summary"
                    rows={d.activity.filter((r) =>
                      [
                        "INDEX FUTURES",
                        "INDEX OPTIONS",
                        "STOCK FUTURES",
                        "STOCK OPTIONS",
                      ].includes(String(r.fii_derivatives)),
                    )}
                    columns={activityColumns.slice(0, 9)}
                  />
                  <Table
                    label="Participant positioning summary"
                    rows={d.participants.filter(
                      (p) => p.client_type !== "TOTAL",
                    )}
                    columns={peopleColumns.slice(0, 8)}
                  />
                </details>
              </>
            )}
            {tab === "activity" && (
              <>
                <h2>Daily FII derivatives activity</h2>
                <p>
                  ₹ crore values: options strike × quantity, NOT premium flow.
                  Family totals and component products are alternate aggregation
                  levels.
                </p>
                <Table
                  label="Full FII activity"
                  rows={d.activity}
                  columns={activityColumns}
                />
                <Plot
                  label="Net reported activity in INR crore, family totals only"
                  option={{
                    animation: false,
                    tooltip: { trigger: "axis" },
                    xAxis: {
                      type: "category",
                      data: d.activity
                        .filter((r) =>
                          [
                            "INDEX FUTURES",
                            "INDEX OPTIONS",
                            "STOCK FUTURES",
                            "STOCK OPTIONS",
                          ].includes(String(r.fii_derivatives)),
                        )
                        .map((r) => String(r.fii_derivatives)),
                    },
                    grid: { left: 28, right: 28, top: 55, bottom: 55, containLabel: true },
                    yAxis: { ...evidenceValueAxis, type: "value", name: "₹ crore" },
                    series: [
                      {
                        type: "bar",
                        data: d.activity
                          .filter((r) =>
                            [
                              "INDEX FUTURES",
                              "INDEX OPTIONS",
                              "STOCK FUTURES",
                              "STOCK OPTIONS",
                            ].includes(String(r.fii_derivatives)),
                          )
                          .map((r) =>
                            r.net_crore == null ? null : Number(r.net_crore),
                          ),
                      },
                    ],
                  }}
                />
              </>
            )}
            {tab === "participants" && (
              <>
                <h2>Outstanding participant positions</h2>
                <p>
                  Client is the reported class, not verified retail. TOTAL is a
                  reconciliation row, not a fifth participant. Changes need a
                  verified preceding-session report.
                </p>
                <Table
                  label="Participant derived metrics"
                  rows={d.participants}
                  columns={peopleColumns}
                />
                <details>
                  <summary>Full source positions and provenance</summary>
                  <Table
                    label="All participant source fields"
                    rows={d.participants}
                    columns={[
                      ...new Set(d.participants.flatMap((r) => Object.keys(r))),
                    ].map((k) => [k, k])}
                  />
                </details>
                <Plot
                  label="Participant net index futures contracts"
                  option={{
                    animation: false,
                    xAxis: {
                      type: "category",
                      data: d.participants
                        .filter((r) => r.client_type !== "TOTAL")
                        .map((r) => String(r.client_type)),
                    },
                    grid: { left: 28, right: 28, top: 55, bottom: 55, containLabel: true },
                    yAxis: { ...evidenceValueAxis, type: "value", name: "Contracts" },
                    tooltip: { trigger: "axis" },
                    series: [
                      {
                        type: "bar",
                        data: d.participants
                          .filter((r) => r.client_type !== "TOTAL")
                          .map((r) =>
                            r.net_futures == null
                              ? null
                              : Number(r.net_futures),
                          ),
                      },
                    ],
                  }}
                />
              </>
            )}
            {tab === "options" && (
              <>
                <div className={styles.toolbar}>
                  <h2>{d.underlying.symbol} option evidence</h2>
                  <label>
                    Expiry{" "}
                    <select
                      value={String(d.chain.snapshot?.expiry_date ?? "")}
                      onChange={(e) => change("expiry", e.target.value)}
                    >
                      {d.chain.expiries.map((e) => (
                        <option key={e}>{e}</option>
                      ))}
                    </select>
                  </label>
                  <span>
                    {d.chain.strikes.length}/10 paired strikes ·{" "}
                    {d.chain.archivedLegCount} archived legs
                  </span>
                </div>
                <p>
                  Provider: {display(d.chain.snapshot?.source)} · Snapshot{" "}
                  {display(d.chain.snapshot?.captured_at)} · Baseline{" "}
                  {display(d.chain.previousSnapshot?.captured_at)}. OI is the
                  provider-reported value; normalized units await verification.
                </p>
                <div className={styles.kpis}>
                  <span>
                    Window OI PCR{" "}
                    <strong>{display(d.chain.metrics.oiPcr)}</strong>
                  </span>
                  <span>
                    Window volume PCR{" "}
                    <strong>{display(d.chain.metrics.volumePcr)}</strong>
                  </span>
                  <span>
                    Max pain{" "}
                    <strong>
                      {d.chain.metrics.maxPainStrikes.join(", ") || "—"}
                    </strong>
                  </span>
                  <span>
                    Missing pairs <strong>{d.chain.shortfall}</strong>
                  </span>
                </div>
                <p>
                  {d.chain.metrics.normalizationState.replaceAll("_", " ")}.
                  This window is not the full exchange chain.
                </p>
                {d.chain.legs.length > 0 && <OiChart legs={d.chain.legs} pcr={d.chain.metrics.oiPcr} />}
                <h3>Exact-option snapshot table</h3>
                <Table
                  label={`${d.underlying.symbol} ten CE and ten PE contract evidence`}
                  rows={d.chain.legs}
                  columns={optionColumns}
                />
              </>
            )}
            {tab === "structure" && (
              <>
                <TradingAnalyticsStructure
                  key={d.underlying.symbol}
                  symbol={d.underlying.symbol}
                  asOf={d.asOf}
                  candles={d.candles}
                  periods={d.periods}
                  levels={d.resistance}
                />
                <details>
                  <summary>Full daily evidence and original table</summary>
                  <h2>{d.underlying.symbol} completed daily candles and own-series EMA9</h2>
                  <p>
                    SMA of first nine retained closes seeds EMA9; warm-up
                    remains blank. Range and body fractions are descriptive
                    previews. Daily/weekly level policies remain unapproved. The
                    Scalper lens shows synchronized exact-option intraday panes
                    and their coverage.
                  </p>
                  <details>
                    <summary>Accessible candle data / exact values</summary>
                    <Table
                      label="Daily OHLC and EMA source"
                      rows={d.candles}
                      columns={[
                        ["date", "Date"],
                        ["open", "Open"],
                        ["high", "High"],
                        ["low", "Low"],
                        ["close", "Close"],
                        ["ema9", "EMA9"],
                        ["fraction", "Above / below fractions"],
                        ["source", "Source"],
                        ["created_at", "Recorded at"],
                      ]}
                    />
                  </details>
                </details>
              </>
            )}
            {tab === "stock" && (
              <section className={styles.plot}>
                <h2>Stock Activity</h2>
                <p>
                  {d.underlying.kind==='INDEX' ? 'Share volume and delivery are not applicable to this index.' : `${d.underlying.symbol}: retained daily volume is available in the full evidence export. Phase-comparable turnover and delivery remain unavailable.`}
                </p>
                <div className={styles.kpis}>
                  <span>
                    15-minute turnover <strong>Not applicable</strong>
                  </span>
                  <span>
                    30-session baseline <strong>Unavailable</strong>
                  </span>
                  <span>
                    Previous-session delivery · EOD{" "}
                    <strong>Not applicable</strong>
                  </span>
                </div>
                <p>
                  The stock-specific phase-comparable turnover and delivery
                  provider is not connected to this workspace. Existing stock
                  research remains available.
                </p>
                <Link to="/analytics/leadership">
                  Select stock in canonical stock research
                </Link>
              </section>
            )}
            {tab === "replay" && (
              <>
                <h2>Retained-source as-of inspection</h2>
                <div className={styles.kpis}>
                  <span>
                    Report rows <strong>{d.activity.length}</strong>
                  </span>
                  <span>
                    Daily candles <strong>{d.candles.length}</strong>
                  </span>
                  <span>
                    Exact option minute coverage{" "}
                    <strong>Inspect Scalper</strong>
                  </span>
                  <span>
                    Publication / original revisions <strong>Unverified</strong>
                  </span>
                </div>
                <p>
                  Coverage first: original-knowledge playback is unavailable.
                  The control below inspects retained data, not a proven
                  original/revised replay.
                </p>
                <button
                  disabled
                  title="Immutable publication revisions and playback coverage are not proven"
                >
                  Play — unavailable
                </button>
                <p>
                  This is not a trading-profit backtest. Unknown historical
                  publication revisions, expired-contract gaps and mutable
                  source bars restrict point-in-time claims.
                </p>
                <label>
                  ISO as-of timestamp{" "}
                  <input
                    value={replayInput}
                    placeholder="2026-09-07T06:00:00+05:30"
                    onChange={(e) => setReplayInput(e.target.value)}
                  />
                </label>
                <button onClick={() => change("asOf", replayInput)}>
                  Load as-of
                </button>
                <button
                  onClick={() => {
                    setReplayInput("");
                    change("asOf", "");
                  }}
                >
                  Return to current
                </button>
                <p>
                  Evaluated {d.asOf}. Source event/recorded timestamps are
                  filtered before calculation; this does not prove missing
                  historical publication time.
                </p>
                <details>
                  <summary>Complete immutable export candidate</summary>
                  <pre tabIndex={0}>{JSON.stringify(d, null, 2)}</pre>
                </details>
              </>
            )}
            {tab === "scalper" && (
              <TradingAnalyticsScalper
                key={d.underlying.symbol}
                symbol={d.underlying.symbol}
                label={d.underlying.label}
                asOf={d.asOf}
                expiry={String(
                  d.smartapi.expiry ?? d.chain.snapshot?.expiry_date ?? "",
                )}
                strikes={
                  d.smartapi.strikes.length
                    ? d.smartapi.strikes
                    : d.chain.strikes
                }
                legs={d.smartapi.legs}
                resistance={d.resistance}
                maxPainStrikes={d.smartapi.metrics.indicativeMaxPainStrikes ?? []}
                spot={
                  d.smartapi.spot?.ltp == null
                    ? null
                    : Number(d.smartapi.spot.ltp)
                }
              />
            )}
            {tab === "trade-log" && <TradingAnalyticsTradeLog />}
            {tab === "matrix" && (
              <Suspense fallback={<p role="status">Loading synchronized timeframe matrix…</p>}>
                <TimeframeMatrix
                  key={d.underlying.symbol}
                  symbol={d.underlying.symbol}
                  label={d.underlying.label}
                  asOf={d.asOf}
                  expiry={String(d.smartapi.expiry ?? d.chain.snapshot?.expiry_date ?? "")}
                  strikes={d.smartapi.strikes.length ? d.smartapi.strikes : d.chain.strikes}
                  spot={d.smartapi.spot?.ltp == null ? null : Number(d.smartapi.spot.ltp)}
                />
              </Suspense>
            )}
            {(drawer === "health" || (tab === "health" && drawer == null)) && (
              <TradingAnalyticsDrawer
                title="Data Health"
                onClose={() => {
                  setDrawer(null);
                  if (tab === "health") change("view", "morning");
                }}
              >
                <h2>Source reconciliation and approval gates</h2>
                <Table
                  label="Reconciliation issues"
                  rows={d.issues}
                  columns={[
                    ["code", "Check"],
                    ["unit", "Unit"],
                    ["reported", "Reported"],
                    ["calculated", "Reconstructed"],
                    ["difference", "Difference"],
                  ]}
                />
                <Table
                  label="Source query failures"
                  rows={d.errors}
                  columns={[
                    ["source", "Source"],
                    ["state", "State"],
                  ]}
                />
                <Table
                  label="Policy register"
                  rows={d.policies}
                  columns={[
                    ["id", "Policy"],
                    ["state", "State"],
                    ["reason", "Reason"],
                  ]}
                />
                <ul>
                  {d.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                <p>
                  Formula {d.version} · Evidence digest {d.evidenceId}
                </p>
              </TradingAnalyticsDrawer>
            )}
          </>
        )}
        {d && (drawer === "source" || drawer === "condition") && (
          <TradingAnalyticsDrawer
            title={
              drawer === "source" ? "Source / Formula" : "Condition Evidence"
            }
            onClose={() => setDrawer(null)}
          >
            <p>
              Formula {d.version} · Report {d.reportDate} · As-of {d.asOf}
            </p>
            <p>Evidence digest: {d.evidenceId}</p>
            {drawer === "source" && inspected?.strike != null && (
              <button
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set("view", "scalper");
                  next.set("strike", String(inspected.strike));
                  next.set("pin", "true");
                  const expiry =
                    inspected.expiry ??
                    inspected.expiry_date ??
                    (tab === "options"
                      ? d.chain.snapshot?.expiry_date
                      : d.smartapi.expiry);
                  if (expiry) next.set("expiry", String(expiry).slice(0, 10));
                  setParams(next);
                  setDrawer(null);
                }}
              >
                Open exact pair in Scalper
              </button>
            )}
            {drawer === "source" ? (
              <>
                <p>
                  Net activity = buy − sell. Net calls / puts = respective long
                  − short. Options proxy = net calls − net puts. Futures long %
                  = 100 × index futures long / (long + short). OI PCR = sum PE /
                  sum CE within named provider window.
                </p>
                <p>
                  Money: reported ₹ crore, not option premium cash flow.
                  Participant quantities: contracts. Per-contract OI:
                  provider-native until units verified. Baselines not present in
                  payload remain unavailable.
                </p>
                <pre tabIndex={0}>
                  {JSON.stringify(
                    inspected ?? {
                      activity: d.activity,
                      participants: d.participants,
                    },
                    null,
                    2,
                  )}
                </pre>
              </>
            ) : (
              <>
                <p>
                  POLICY INCOMPLETE · No confirmed or paper-eligible
                  instruction. Forming/incomplete candles do not confirm the EMA
                  rule.
                </p>
                <pre tabIndex={0}>
                  {JSON.stringify(
                    {
                      morning: d.morning,
                      policies: d.policies,
                      limitations: d.limitations,
                    },
                    null,
                    2,
                  )}
                </pre>
              </>
            )}
            <details>
              <summary>Reconciliation and source issues</summary>
              <pre tabIndex={0}>
                {JSON.stringify(
                  { issues: d.issues, errors: d.errors },
                  null,
                  2,
                )}
              </pre>
            </details>
          </TradingAnalyticsDrawer>
        )}
      </section>
    </InspectContext.Provider>
  );
}
