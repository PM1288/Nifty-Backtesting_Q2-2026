import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchThreeMonthReportEvidence } from "../lib/api";
import { formatDateIST } from "../lib/format";
import { useThreeMonthStrategy } from "../lib/hooks";
import type { ThreeMonthDirection, ThreeMonthEvaluation, ThreeMonthGate, ThreeMonthGateState, ThreeMonthIntradayMode, ThreeMonthReportDirectionSummary, ThreeMonthReportTrade, ThreeMonthStrategyRow } from "../lib/types";
import styles from "./ThreeMonthStrategyPage.module.css";

const GATE_GROUPS = ["Monthly", "Weekly", "Daily", "1 Hour", "15 Minute"] as const;
const SHORT_LABELS = ["C {op} O", "C {op} previous O", "C {op} O", "C {op} previous O", "C {op} previous-day O", "C {op} O", "C {op} O", "C {op} previous O", "C {op} O", "C {op} previous O"];

function evaluation(row: ThreeMonthStrategyRow, direction: ThreeMonthDirection): ThreeMonthEvaluation {
  if (direction === "BULL" && row.bull) return row.bull;
  if (direction === "BEAR" && row.bear) return row.bear;
  return { direction, qualification: row.qualification, passedGateCount: row.passedGateCount, availableGateCount: row.availableGateCount, scoredConditionCount: row.scoredConditionCount, availableConditionCount: row.availableConditionCount, totalConditionCount: row.totalConditionCount, gates: row.gates, weaknessMonths: row.weaknessMonths, weaknessState: row.weaknessState };
}

const historyNewestLast = (result: ThreeMonthEvaluation) => [...result.weaknessMonths].reverse();

function stateGlyph(state: ThreeMonthGateState) {
  if (state === "PASS") return "✓";
  if (state === "FAIL") return "×";
  if (state === "SKIPPED") return "↷";
  return "—";
}
function gateClass(state: ThreeMonthGateState) {
  if (state === "PASS") return styles.pass;
  if (state === "FAIL") return styles.fail;
  if (state === "SKIPPED") return styles.skipped;
  return styles.unavailable;
}
function arithmetic(gate: ThreeMonthGate) {
  const left = gate.left == null ? "unavailable" : gate.left.toFixed(2);
  const right = gate.right == null ? "unavailable" : gate.right.toFixed(2);
  return `${gate.label}: ${left} ${gate.operator} ${right} · ${gate.state}${gate.forming ? " · forming/current period" : ""}`;
}
function downloadCsv(rows: ThreeMonthStrategyRow[], mode: ThreeMonthIntradayMode, direction: ThreeMonthDirection) {
  const header = ["symbol", "company", "sector", "session_date", "direction", "intraday_mode", "qualification", "score_passed", "score_available", "score_total", "mandatory_gates_passed", "history_or_group_state", ...SHORT_LABELS.flatMap((_, index) => [`gate_${index + 1}_state`, `gate_${index + 1}_left`, `gate_${index + 1}_right`]), "M3_state", "M2_state", "M1_state"];
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = rows.map((row) => {
    const result = evaluation(row, direction);
    return [row.symbol, row.companyName, row.sector, row.sessionDate, direction, mode, result.qualification, result.scoredConditionCount, result.availableConditionCount, result.totalConditionCount, result.passedGateCount, result.weaknessState,
      ...result.gates.flatMap((gate) => [gate.state, gate.left, gate.right]),
      ...historyNewestLast(result).map((gate) => gate.state),
    ].map(quote).join(",");
  });
  const blob = new Blob([[header.map(quote).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `three-month-strategy-${direction.toLowerCase()}-${mode}.csv`; link.click(); URL.revokeObjectURL(url);
}

const reportMetric = (value: number | null | undefined, suffix = "%") => value == null ? "—" : `${value.toFixed(2)}${suffix}`;
const reportPrice = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const reportGate = (values: string[], index: number) => values[index]?.endsWith(":PASS") === true;

function ReportSummaryRow({ summary }: { summary: ThreeMonthReportDirectionSummary }) {
  return <tr><td><b className={summary.direction === "BULL" ? styles.bullText : styles.bearText}>{summary.direction}</b></td><td>{summary.count.toLocaleString("en-IN")}</td><td>{reportMetric(summary.average1)}</td><td>{reportMetric(summary.average5)}</td><td>{reportMetric(summary.average15)}</td><td>{reportMetric(summary.maximum15)}</td><td>{reportMetric(summary.minimum15)}</td><td>{reportMetric(summary.drawdown15)}</td></tr>;
}

function EvidenceCell({ left, operator, right, passed }: { left: number | null | undefined; operator: ">" | "<"; right: number | null | undefined; passed: boolean }) {
  return <td className={passed ? styles.evidencePass : styles.evidenceFail}><span>{reportPrice(left)} {operator} {reportPrice(right)}</span><b>{passed ? "✓" : "×"}</b></td>;
}

function TradeEvidenceRow({ trade }: { trade: ThreeMonthReportTrade }) {
  const op = trade.direction === "BULL" ? ">" : "<";
  const historyOp = trade.direction === "BULL" ? "<" : ">";
  const r = trade.references;
  const history = [0, 1, 2].map((index) => reportGate(trade.historyPass, index));
  return <tr>
    <td><b>{trade.signalDate}</b><small className={trade.direction === "BULL" ? styles.bullText : styles.bearText}>{trade.direction}</small></td>
    <td>{reportPrice(trade.signalOpen)}<small>look-ahead</small></td>
    <td>{trade.causalEntryDate ?? "—"}<small>{reportPrice(trade.causalEntryOpen)}</small></td>
    <td>{reportMetric(trade.causalReturn1)}</td><td>{reportMetric(trade.causalReturn5)}</td><td>{reportMetric(trade.causalReturn15)}</td><td>{reportMetric(trade.causalDrawdown15)}</td>
    <EvidenceCell left={r.monthClose} operator={op} right={r.monthOpen} passed={reportGate(trade.mandatoryGates, 0)} />
    <EvidenceCell left={r.monthClose} operator={op} right={r.previousMonthOpen} passed={reportGate(trade.mandatoryGates, 1)} />
    <EvidenceCell left={r.weekClose} operator={op} right={r.weekOpen} passed={reportGate(trade.mandatoryGates, 2)} />
    <EvidenceCell left={r.weekClose} operator={op} right={r.previousWeekOpen} passed={reportGate(trade.mandatoryGates, 3)} />
    <EvidenceCell left={r.dayClose} operator={op} right={r.dayOpen} passed={reportGate(trade.mandatoryGates, 5)} />
    <EvidenceCell left={r.dayClose} operator={op} right={r.previousDayOpen} passed={reportGate(trade.mandatoryGates, 4)} />
    <EvidenceCell left={r.previousMonthClose} operator={historyOp} right={r.previousMonthOpen} passed={history[0]} />
    <EvidenceCell left={r.twoMonthsAgoClose} operator={historyOp} right={r.twoMonthsAgoOpen} passed={history[1]} />
    <EvidenceCell left={r.threeMonthsAgoClose} operator={historyOp} right={r.threeMonthsAgoOpen} passed={history[2]} />
    <td className={history.some(Boolean) ? styles.evidencePass : styles.evidenceFail}><b>{history.some(Boolean) ? "✓" : "×"}</b><small>{history.map((passed, index) => `M−${index + 1}${passed ? "✓" : "×"}`).join(" ")}</small></td>
  </tr>;
}

export function ThreeMonthStrategyPage() {
  const [mode, setMode] = useState<ThreeMonthIntradayMode>("completed");
  const [direction, setDirection] = useState<ThreeMonthDirection>("BULL");
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [reportSymbol, setReportSymbol] = useState<string | null>(null);
  const query = useThreeMonthStrategy(mode);
  const reportQuery = useQuery({ queryKey: ["three-month-report-evidence", "stocks"], queryFn: () => fetchThreeMonthReportEvidence(), staleTime: 60_000 });
  const reportDetailQuery = useQuery({ queryKey: ["three-month-report-evidence", reportSymbol], queryFn: () => fetchThreeMonthReportEvidence(reportSymbol ?? undefined), enabled: Boolean(reportSymbol), staleTime: 60_000 });
  const rows = query.data?.rows ?? [];
  const visible = useMemo(() => {
    const needle = search.trim().toUpperCase();
    return rows.filter((row) => (status === "ALL" || evaluation(row, direction).qualification === status) && (!needle || `${row.symbol} ${row.companyName ?? ""} ${row.sector ?? ""}`.toUpperCase().includes(needle)));
  }, [direction, rows, search, status]);
  const selectedRow = rows.find((row) => row.symbol === selected) ?? null;
  const selectedResult = selectedRow ? evaluation(selectedRow, direction) : null;
  const reportOverview = reportQuery.data && "stocks" in reportQuery.data ? reportQuery.data : null;
  const reportDetail = reportDetailQuery.data && "trades" in reportDetailQuery.data ? reportDetailQuery.data : null;

  return <main className={styles.page} data-testid="three-month-strategy">
    <section className={styles.hero}>
      <div><span className={styles.eyebrow}>NIFTY 500 · READ-ONLY SCREEN</span><h1>3Month Strategy</h1><p>BULL: recent monthly weakness followed by simultaneous strength. BEAR: the exact inverse—recent monthly strength followed by simultaneous weakness.</p></div>
      <div className={styles.actions}>
        <Link to="/strategy/monthly">Monthly Strategy</Link>
        <button type="button" onClick={() => downloadCsv(visible, mode, direction)} disabled={!visible.length}>Download CSV</button>
      </div>
    </section>

    <section className={styles.summary} aria-label="Strategy summary">
      {[['Profile coverage', query.data ? `${query.data.counts.universe}/${query.data.counts.expectedUniverse}` : '—'], ['Bull qualified', query.data?.counts.bullQualified ?? query.data?.counts.qualified], ['Bear qualified', query.data?.counts.bearQualified], ['Intraday evaluated', query.data?.counts.intradayEvaluated]].map(([label, value]) => <div className={styles.metric} key={String(label)}><span>{label}</span><strong>{value ?? '—'}</strong></div>)}
    </section>

    <section className={styles.controls}>
      <fieldset><legend>Direction</legend><label><input type="radio" checked={direction === "BULL"} onChange={() => setDirection("BULL")} /> Bull</label><label><input type="radio" checked={direction === "BEAR"} onChange={() => setDirection("BEAR")} /> Bear</label></fieldset>
      <fieldset><legend>Intraday candle policy</legend><label><input type="radio" checked={mode === "completed"} onChange={() => setMode("completed")} /> Completed candles</label><label><input type="radio" checked={mode === "forming"} onChange={() => setMode("forming")} /> Include forming candle</label></fieldset>
      <label>Find stock<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Symbol, company or sector" /></label>
      <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All</option><option value="QUALIFIED">Qualified</option><option value="REJECTED">Rejected</option><option value="INCOMPLETE">Incomplete</option></select></label>
      <p>{mode === "completed" ? "Intraday gates use only complete, gap-free session candles." : "Current 1H and 15m candles may reverse before close and are marked forming."}</p>
    </section>

    <section className={styles.tableCard}>
      <div className={styles.meta}><span>Session <strong>{query.data?.sessionDate ?? "—"}</strong></span><span>Visible <strong>{visible.length}</strong></span><span>Membership coverage <strong>{query.data ? `${query.data.counts.membershipCoveragePct}%` : "—"}</strong></span><span>Generated <strong>{formatDateIST(query.data?.generatedAt, { includeTime: true })}</strong></span></div>
      {query.isLoading ? <div className={styles.state}>Loading NIFTY 500 evidence…</div> : null}
      {query.isError ? <div className={`${styles.state} ${styles.error}`}>The strategy evidence could not be loaded. Missing values were not replaced with zero.</div> : null}
      {!query.isLoading && !query.isError ? <div className={styles.viewport}>
        <table><thead><tr><th rowSpan={2} className={styles.sticky}>Stock</th><th rowSpan={2}>Result</th><th rowSpan={2}>Score</th><th colSpan={3}>Previous {direction === "BULL" ? "weakness" : "strength"} · one OR group</th>{GATE_GROUPS.map((group) => <th colSpan={2} key={group}>{group}</th>)}</tr><tr><th>M−3</th><th>M−2</th><th>M−1</th>{SHORT_LABELS.map((label, index) => <th key={index}>{label.replace("{op}", direction === "BULL" ? ">" : "<")}</th>)}</tr></thead>
          <tbody>{visible.map((row) => { const result = evaluation(row, direction); const rowDetails = `${row.symbol} · ${row.companyName || "Company unavailable"} · ${row.sector || "Sector unavailable"} · ${result.qualification} · ${result.scoredConditionCount}/${result.totalConditionCount} scored conditions · click for exact arithmetic`; return <tr key={row.symbol} onClick={() => setSelected(row.symbol)} className={selected === row.symbol ? styles.selected : undefined} title={rowDetails} aria-label={rowDetails}>
            <td className={styles.sticky}><Link to={`/analytics/stock/${encodeURIComponent(row.symbol)}`} onClick={(event) => event.stopPropagation()} title={`${row.companyName || row.symbol} · ${row.sector || "Sector unavailable"}`} aria-label={`${row.symbol}: ${row.companyName || "company unavailable"}, ${row.sector || "sector unavailable"}. Open Stock 360`}>{row.symbol}</Link></td>
            <td><span className={`${styles.result} ${styles[result.qualification.toLowerCase()]}`}>{result.qualification}</span></td><td className={styles.score} title={`${result.availableConditionCount}/${result.totalConditionCount} conditions available`}>{result.scoredConditionCount}/{result.totalConditionCount}</td>
            {historyNewestLast(result).map((gate) => <td key={`${row.symbol}-${gate.id}`} className={`${styles.gate} ${gateClass(gate.state)}`} title={arithmetic(gate)}><b>{stateGlyph(gate.state)}</b></td>)}
            {result.gates.map((gate) => <td key={`${row.symbol}-${gate.id}`} className={`${styles.gate} ${gateClass(gate.state)}`} title={arithmetic(gate)}><b>{stateGlyph(gate.state)}</b>{gate.forming ? <sup>F</sup> : null}</td>)}
          </tr>; })}</tbody></table>
        {!visible.length ? <div className={styles.state}>No stocks match these filters.</div> : null}
      </div> : null}
    </section>

    <section className={styles.reportCard} data-testid="three-month-stock-history">
      <header className={styles.reportHeader}><div><span className={styles.eyebrow}>12-MONTH DAILY BACKTEST · STOCK-WISE</span><h2>Historical performance by stock</h2><p>Summary uses causal next-trading-day entry. Select a stock to inspect every entry and its exact M−1/M−2/M−3 and Month/Week/Day qualification arithmetic.</p></div><Link to="/backtesting/reports">PDF and complete CSV</Link></header>
      {reportQuery.isLoading ? <div className={styles.state}>Loading stock-wise backtest summary…</div> : null}
      {reportQuery.isError ? <div className={`${styles.state} ${styles.error}`}>Stock-wise historical evidence is unavailable. The live screener above remains independent.</div> : null}
      {reportOverview ? <>
        <div className={styles.reportMeta}><span>{reportOverview.report.evaluationStart ?? "—"} → {reportOverview.report.dataEnd ?? "—"}</span><span><b>{reportOverview.report.symbols?.toLocaleString("en-IN") ?? reportOverview.stocks.length}</b> stocks</span><span><b>{reportOverview.report.signals?.toLocaleString("en-IN") ?? "—"}</b> signals</span><span>{reportOverview.reportId}</span></div>
        {reportOverview.report.summary?.length ? <div className={styles.overallSummary}><h3>Overall summary</h3><table><thead><tr><th>Direction</th><th>Entry basis</th><th>Signals</th><th>Avg 1D</th><th>Avg 5D</th><th>Avg 15D</th><th>Max 15D</th><th>Min 15D</th><th>Worst drawdown</th></tr></thead><tbody>{reportOverview.report.summary.map((summary) => <tr key={`${summary.direction}-${summary.basis}`}><td><b className={summary.direction === "BULL" ? styles.bullText : styles.bearText}>{summary.direction}</b></td><td>{summary.basis === "causal" ? "Next-day open · causal" : "Signal-day open · look-ahead"}</td><td>{summary.count.toLocaleString("en-IN")}</td><td>{reportMetric(summary.average1)}</td><td>{reportMetric(summary.average5)}</td><td>{reportMetric(summary.average15)}</td><td>{reportMetric(summary.maximum15)}</td><td>{reportMetric(summary.minimum15)}</td><td>{reportMetric(summary.drawdown15)}</td></tr>)}</tbody></table></div> : null}
        <div className={styles.reportOverview}><table><thead><tr><th rowSpan={2}>Stock</th><th rowSpan={2}>All signals</th><th colSpan={7}>Bull · causal next-day entry</th><th colSpan={7}>Bear · causal next-day entry</th></tr><tr>{["Signals","Avg 1D","Avg 5D","Avg 15D","Max 15D","Min 15D","Worst DD","Signals","Avg 1D","Avg 5D","Avg 15D","Max 15D","Min 15D","Worst DD"].map((label, index) => <th key={`${label}-${index}`}>{label}</th>)}</tr></thead><tbody>{reportOverview.stocks.map((stock) => <tr key={stock.symbol} data-testid={`three-month-report-stock-${stock.symbol}`} className={reportSymbol === stock.symbol ? styles.selected : undefined} onClick={() => setReportSymbol(stock.symbol)}><td><b>{stock.symbol}</b></td><td>{stock.totalSignals}</td>{[stock.bull, stock.bear].flatMap((summary) => [summary.count, reportMetric(summary.average1), reportMetric(summary.average5), reportMetric(summary.average15), reportMetric(summary.maximum15), reportMetric(summary.minimum15), reportMetric(summary.drawdown15)]).map((value, index) => <td key={index}>{value}</td>)}</tr>)}</tbody></table></div>
      </> : null}
      {reportSymbol ? <section className={styles.stockEvidence} data-testid="three-month-report-stock-evidence" aria-live="polite">
        <header><div><h3>{reportSymbol} · historical entries and conditions</h3><p>Signal-day open is shown only as the requested look-ahead scenario. Outcomes use the causal next-trading-day open.</p></div><button type="button" onClick={() => setReportSymbol(null)}>Close</button></header>
        {reportDetailQuery.isLoading ? <div className={styles.state}>Loading {reportSymbol} trade evidence…</div> : null}
        {reportDetailQuery.isError ? <div className={`${styles.state} ${styles.error}`}>Trade evidence for {reportSymbol} could not be loaded.</div> : null}
        {reportDetail ? <><div className={styles.stockSummary}><table><thead><tr><th>Direction</th><th>Signals</th><th>Avg 1D</th><th>Avg 5D</th><th>Avg 15D</th><th>Max 15D</th><th>Min 15D</th><th>Worst drawdown</th></tr></thead><tbody><ReportSummaryRow summary={reportDetail.stock.bull} /><ReportSummaryRow summary={reportDetail.stock.bear} /></tbody></table></div><div className={styles.tradeViewport}><table><thead><tr><th>Signal</th><th>Signal open</th><th>Causal entry</th><th>1D</th><th>5D</th><th>15D</th><th>15D DD</th><th>M C vs M O</th><th>M C vs M−1 O</th><th>W C vs W O</th><th>W C vs W−1 O</th><th>D C vs D O</th><th>D C vs D−1 O</th><th>M−1 C vs O</th><th>M−2 C vs O</th><th>M−3 C vs O</th><th>ANY-1 OR</th></tr></thead><tbody>{reportDetail.trades.map((trade) => <TradeEvidenceRow key={`${trade.signalDate}-${trade.direction}`} trade={trade} />)}</tbody></table></div></> : null}
      </section> : null}
    </section>

    {selectedRow && selectedResult ? <aside className={styles.drawer} aria-label={`${selectedRow.symbol} ${direction} strategy arithmetic`}><button className={styles.close} onClick={() => setSelected(null)} aria-label="Close details">×</button><h2>{selectedRow.symbol} · {direction}</h2><p>{selectedRow.companyName} · {selectedRow.sector || "Sector unavailable"}</p><div className={styles.drawerSummary}><strong>{selectedResult.qualification}</strong><span>{selectedResult.scoredConditionCount}/{selectedResult.totalConditionCount} scored conditions</span></div><h3>Historical {direction === "BULL" ? "weakness" : "strength"} · M−3 OR M−2 OR M−1 · one point</h3><ul>{historyNewestLast(selectedResult).map((gate) => <li key={gate.id} className={gateClass(gate.state)}><b>{stateGlyph(gate.state)} {gate.label}</b><span>{gate.left == null ? "—" : gate.left.toFixed(2)} {gate.operator} {gate.right == null ? "—" : gate.right.toFixed(2)}</span></li>)}</ul><h3>Mandatory M/W/D/1H/15m arithmetic</h3><ol>{selectedResult.gates.map((gate) => <li key={gate.id} className={gateClass(gate.state)}><b>{stateGlyph(gate.state)} {gate.label}</b><span>{gate.left == null ? "—" : gate.left.toFixed(2)} {gate.operator} {gate.right == null ? "—" : gate.right.toFixed(2)}{gate.forming ? " · forming" : ""}</span></li>)}</ol><p className={styles.disclosure}>This is a screening result, not an entry, exit, stop, target or position-size recommendation.</p></aside> : null}
  </main>;
}
