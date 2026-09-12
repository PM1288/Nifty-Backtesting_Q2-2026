import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import type { EChartsOption } from "echarts";
import { EChartSurface } from "../components/visual/EChartSurface";
import { fetchFuturesVolatilityBacktest, fetchFuturesVolatilityScreener, type FuturesVolatilityBacktest, type FuturesVolatilityRow, type FuturesVolatilityScreener } from "../lib/api";
import styles from "./FuturesVolatilityPage.module.css";

const exact = (value: string | null) => value ?? "—";
const number = (value: string | null, digits = 2) => value == null ? "—" : Number(value).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = (value: string | null) => value == null ? "—" : `${Number(value) >= 0 ? "+" : ""}${number(value)}%`;
const volPct = (value: string | null) => value == null ? "—" : `${number(String(Number(value) * 100), 4)}%`;
const tone = (value: string | null) => value == null || Number(value) === 0 ? "neutral" : Number(value) > 0 ? "positive" : "negative";
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const today = new Date();
const defaultBacktestTo = isoDate(today);
const defaultBacktestFrom = isoDate(new Date(today.getTime() - 59 * 86_400_000));

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}
const exactNumericText = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
function csvCell(value: unknown) {
  const raw = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  // Preserve signed exact decimal evidence while preventing spreadsheet formula execution in text fields.
  const text = /^[=+\-@]/.test(raw) && !exactNumericText.test(raw) ? `'${raw}` : raw;
  return `"${text.replaceAll('"', '""')}"`;
}
function exportCsv(rows: FuturesVolatilityRow[]) {
  const columns = rows.length ? Object.keys(rows[0]) as Array<keyof FuturesVolatilityRow> : [];
  return [columns.map(csvCell).join(","), ...rows.map(row => columns.map(column => csvCell(row[column])).join(","))].join("\n");
}

export function FuturesVolatilityPage() {
  const [data, setData] = useState<FuturesVolatilityScreener | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"stocks" | "indices" | "all">("stocks");
  const [matchesOnly, setMatchesOnly] = useState(true);
  const [selected, setSelected] = useState<FuturesVolatilityRow | null>(null);
  const [backtest, setBacktest] = useState<FuturesVolatilityBacktest | null>(null);
  const [backtestFrom, setBacktestFrom] = useState(defaultBacktestFrom);
  const [backtestTo, setBacktestTo] = useState(defaultBacktestTo);
  const [backtestError, setBacktestError] = useState("");
  const [backtestLoading, setBacktestLoading] = useState(false);
  const load = () => fetchFuturesVolatilityScreener({ scope, matchesOnly }).then(value => { setData(value); setSelected(current => value.rows.find(row => row.symbol === current?.symbol) ?? value.rows[0] ?? null); setError(""); }).catch(reason => setError(reason instanceof Error ? reason.message : String(reason)));
  useEffect(() => { void load(); }, [scope, matchesOnly]);
  const rows = useMemo(() => (data?.rows ?? []).filter(row => !query || row.symbol.toLowerCase().includes(query.toLowerCase())), [data, query]);
  const run = data?.run ?? {};
  const historicalRows = backtest?.observations ?? [];
  const scatterOption = useMemo<EChartsOption>(() => ({
    animation: false,
    grid: { left: 24, right: 24, top: 28, bottom: 28, containLabel: true },
    tooltip: {
      trigger: "item",
      formatter: (raw: unknown) => {
        const point = raw as { data?: { name?: string; value?: number[]; reportDate?: string; targetSession?: string } };
        const item = point.data;
        return item?.value
          ? `<b>${item.name ?? "Stock"}</b><br/>Report ${item.reportDate ?? "—"} → ${item.targetSession ?? "—"}<br/>Δ volatility ${item.value[0]?.toFixed(4)} bp<br/>Next-session open→close ${item.value[1]?.toFixed(2)}%`
          : "Unavailable";
      },
    },
    xAxis: { type: "value", name: "Reported futures daily-volatility delta (bp)", nameLocation: "middle", nameGap: 30, axisLabel: { formatter: "{value} bp" }, splitLine: { lineStyle: { color: "#e6edf4" } } },
    yAxis: { type: "value", name: "Next-session underlying open→close (%)", nameLocation: "middle", nameGap: 48, axisLabel: { formatter: "{value}%" }, splitLine: { lineStyle: { color: "#e6edf4" } } },
    series: [{
      name: "Matched observations",
      type: "scatter",
      symbolSize: 10,
      data: historicalRows.map(row => ({
        name: row.symbol,
        reportDate: row.reportDate,
        targetSession: row.targetSession,
        value: [Number(row.deltaBasisPoints), Number(row.openCloseChangePct)],
        itemStyle: { color: Number(row.openCloseChangePct) >= 0 ? "#117a40" : "#c6283d" },
      })),
      markLine: { silent: true, symbol: "none", lineStyle: { type: "dashed", color: "#64748b" }, data: [{ yAxis: 0 }] },
    }],
  }), [historicalRows]);
  const awaitingNextSession = Boolean(data && data.counts.priceCovered === 0 && data.rows.some(row => row.outcomeState === "AWAITING_SESSION"));
  const loadBacktest = () => {
    setBacktestLoading(true); setBacktestError("");
    fetchFuturesVolatilityBacktest(backtestFrom, backtestTo)
      .then(setBacktest)
      .catch(reason => setBacktestError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setBacktestLoading(false));
  };
  useEffect(() => {
    if (!backtestFrom || !backtestTo) return;
    const timer = window.setTimeout(loadBacktest, 200);
    return () => window.clearTimeout(timer);
  }, [backtestFrom, backtestTo]);
  return <main className={styles.page} data-testid="futures-volatility-page">
    <header className={styles.hero}><div><span>Read-only NSE report evidence</span><h1>Futures Volatility Screener</h1><p>Reported physical FOVOLT futures daily volatility: current K minus previous J, strictly greater than 0.0001.</p></div><div className={styles.actions}><button onClick={load}><RefreshCw size={15}/>Refresh</button><button disabled={!data} onClick={() => data && download("futures-volatility-screener.json", JSON.stringify(data, null, 2), "application/json")}><Download size={15}/>JSON</button><button disabled={!rows.length} onClick={() => download("futures-volatility-screener.csv", exportCsv(rows), "text/csv;charset=utf-8")}><Download size={15}/>CSV</button></div></header>
    {error ? <div className={styles.error}>FOVOLT evidence unavailable: {error}</div> : null}
    <section className={styles.context}><strong>Report {String(run.report_date ?? "not ready")} → Evaluation {String(run.analysis_session ?? "unresolved")}</strong><span>Rule {data?.ruleVersion ?? "FOVOLT_FUT_DAILY_DELTA_GT_0001_V1"}</span><span>Threshold &gt; 1.0000 bp</span><span>{String(run.timing_mode ?? "Source timing unavailable")}</span></section>
    {awaitingNextSession ? <section className={styles.pendingOutcome} role="status"><strong>Report values are available.</strong><span>Price and outcome columns are intentionally unavailable because evaluation session {String(run.analysis_session ?? "T")} has not completed. Use Historical evaluation below for completed prior reports.</span></section> : null}
    <section className={styles.metrics}><article><span>Qualifying rows</span><b>{data?.counts.matched ?? "—"}</b></article><article><span>Source rows</span><b>{data?.counts.sourceRows ?? "—"}</b></article><article><span>Displayed</span><b>{rows.length}</b></article><article><span>Final outcomes</span><b>{data?.counts.priceCovered ?? "—"}</b></article></section>
    <section className={styles.panel}><div className={styles.filters}><input aria-label="Filter symbol" placeholder="Filter symbol" value={query} onChange={event => setQuery(event.target.value)} /><select value={scope} onChange={event => setScope(event.target.value as typeof scope)}><option value="stocks">Stocks</option><option value="indices">Indices</option><option value="all">All report rows</option></select><label><input type="checkbox" checked={matchesOnly} onChange={event => setMatchesOnly(event.target.checked)} /> Matches only</label></div>
      {data?.readiness === "REPORT_NOT_READY" ? <div className={styles.empty}>Report not ready. No zero-match claim has been made.</div> : <div className={styles.tableWrap}><table><thead><tr><th rowSpan={2}>Rank / stock</th><th colSpan={3}>Selection from report R</th><th colSpan={5}>Prices on session T</th><th colSpan={3}>Outcomes on T</th><th rowSpan={2}>Status</th></tr><tr><th>Δ vol bp</th><th>Previous vol</th><th>Current vol</th><th>Prev close</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Open→Close</th><th>Prev close→Close</th><th>Range</th></tr></thead><tbody>{rows.map(row => <tr key={`${row.sourceRevisionId}:${row.sourceCsvLine}`} data-selected={selected?.symbol === row.symbol} onClick={() => setSelected(row)}><td><b>#{row.matchRank ?? row.rankInValidReport ?? "—"} {row.symbol}</b><small>{row.qualifies ? "Matched" : row.screenState}</small></td><td className={styles.delta} data-tone={tone(row.deltaBasisPoints)}>{number(row.deltaBasisPoints, 4)}</td><td>{volPct(row.previousFuturesDailyVol)}</td><td>{volPct(row.currentFuturesDailyVol)}</td><td>{number(row.targetPreviousClose)}</td><td>{number(row.targetOpen)}</td><td>{number(row.targetHigh)}</td><td>{number(row.targetLow)}</td><td>{number(row.targetClose)}</td><td data-tone={tone(row.openCloseChangePct)}>{pct(row.openCloseChangePct)}</td><td data-tone={tone(row.previousCloseChangePct)}>{pct(row.previousCloseChangePct)}</td><td>{row.lowHighRangePct == null ? "—" : `${number(row.lowHighRangePct)}%`}</td><td>{row.outcomeState.replaceAll("_", " ")}</td></tr>)}</tbody></table></div>}
    </section>
    <section className={styles.backtest} data-testid="futures-volatility-backtest"><header><div><span>Historical evaluation · stored evidence</span><h2>Fixed-rule next-session study</h2><p>Loaded automatically from PostgreSQL · archive timing assumed · screen outcomes only, not executable strategy returns.</p></div><div className={styles.backtestControls}><label>From<input type="date" value={backtestFrom} onChange={event => setBacktestFrom(event.target.value)} /></label><label>To<input type="date" value={backtestTo} onChange={event => setBacktestTo(event.target.value)} /></label></div></header>
      {backtestError ? <div className={styles.error}>Historical evaluation unavailable: {backtestError}</div> : null}
      {backtest ? <><div className={styles.backtestMetrics}><article><span>Reports / verified</span><b>{backtest.counts.downloadedReports} / {backtest.counts.calendarVerifiedReports}</b></article><article><span>Covered sessions</span><b>{backtest.counts.independentCoveredSessions}</b></article><article><span>Matched observations</span><b>{backtest.matched.observations}</b></article><article><span>Benchmark observations</span><b>{backtest.nonmatched.observations}</b></article></div><div className={styles.comparison}><div><span>Mean absolute open→close</span><b>{backtest.matched.meanAbsoluteOpenClosePct == null ? "—" : `${number(String(backtest.matched.meanAbsoluteOpenClosePct))}%`}</b><small>Matched</small></div><div><span>Same-report benchmark</span><b>{backtest.nonmatched.meanAbsoluteOpenClosePct == null ? "—" : `${number(String(backtest.nonmatched.meanAbsoluteOpenClosePct))}%`}</b><small>Nonmatches with complete target prices</small></div><div><span>Matched minus benchmark</span><b data-tone={tone(backtest.difference.meanAbsoluteOpenClosePct == null ? null : String(backtest.difference.meanAbsoluteOpenClosePct))}>{backtest.difference.meanAbsoluteOpenClosePct == null ? "—" : `${backtest.difference.meanAbsoluteOpenClosePct >= 0 ? "+" : ""}${number(String(backtest.difference.meanAbsoluteOpenClosePct))} pp`}</b><small>Descriptive difference</small></div></div><p className={styles.clusterSummary}>Date-cluster check: matched absolute movement was higher on <strong>{backtest.dayClusterSummary.matchedHigherAbsoluteMovementDays} of {backtest.dayClusterSummary.daysCompared}</strong> comparable sessions.</p>
        <section className={styles.historicalDetail} data-testid="futures-volatility-historical-detail"><header><div><span>Last 60 calendar days</span><h3>Volatility delta versus next-session underlying move</h3><p>Each dot and table row is one matched stock with complete next-session OHLC. Y uses open→close percentage; green is positive and red is negative.</p></div><b>{historicalRows.length} observations</b></header>{historicalRows.length ? <><EChartSurface appearance="light" ariaLabel="Futures volatility delta versus next-session underlying open-to-close percentage scatter plot" className={styles.scatterChart} option={scatterOption} /><div className={styles.historicalTable}><table><thead><tr><th>Report</th><th>Next session</th><th>Stock</th><th>Δ vol bp</th><th>Previous vol</th><th>Current vol</th><th>Open</th><th>Close</th><th>Open→Close</th><th>Prev close→Close</th><th>Day range</th></tr></thead><tbody>{historicalRows.map(row => <tr key={`${row.reportDate}:${row.symbol}`}><td>{row.reportDate}</td><td>{row.targetSession}</td><td><b>{row.symbol}</b></td><td>{number(row.deltaBasisPoints, 4)}</td><td>{volPct(row.previousFuturesDailyVol)}</td><td>{volPct(row.currentFuturesDailyVol)}</td><td>{number(row.targetOpen)}</td><td>{number(row.targetClose)}</td><td data-tone={tone(row.openCloseChangePct)}>{pct(row.openCloseChangePct)}</td><td data-tone={tone(row.previousCloseChangePct)}>{pct(row.previousCloseChangePct)}</td><td>{number(row.lowHighRangePct)}%</td></tr>)}</tbody></table></div></> : <p className={styles.backtestEmpty}>No matched observations have complete next-session OHLC in this range.</p>}</section>
        <details><summary>Coverage and limitations</summary><ul>{backtest.limitations.map(item => <li key={item}>{item}</li>)}</ul></details></> : <p className={styles.backtestEmpty}>{backtestLoading ? "Loading stored historical evaluation…" : "No stored FOVOLT evaluation evidence is available for this range."}</p>}
    </section>
    {selected ? <section className={styles.inspector}><header><div><span>Selected source row</span><h2>{selected.symbol}</h2></div><strong>{selected.qualifies ? "MATCHED" : selected.screenState}</strong></header><div className={styles.inspectorGrid}><div><span>Exact delta raw</span><b>{exact(selected.deltaRaw)}</b></div><div><span>Exact delta bp</span><b>{exact(selected.deltaBasisPoints)}</b></div><div><span>Source revision</span><code>{selected.sourceRevisionId}</code></div><div><span>Mapping</span><b>{selected.mappingState.replaceAll("_", " ")}</b></div><div><span>Report underlying close</span><b>{exact(selected.reportUnderlyingClose)}</b></div><div><span>Report futures close</span><b>{exact(selected.reportFuturesClose)}</b></div></div><details><summary>All 16 physical source fields</summary><pre>{JSON.stringify(selected.rawFields, null, 2)}</pre></details></section> : null}
  </main>;
}
