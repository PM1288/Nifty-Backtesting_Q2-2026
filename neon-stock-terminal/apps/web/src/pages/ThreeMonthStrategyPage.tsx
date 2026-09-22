import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDateIST } from "../lib/format";
import { useThreeMonthStrategy } from "../lib/hooks";
import type { ThreeMonthDirection, ThreeMonthEvaluation, ThreeMonthGate, ThreeMonthGateState, ThreeMonthIntradayMode, ThreeMonthStrategyRow } from "../lib/types";
import styles from "./ThreeMonthStrategyPage.module.css";

const GATE_GROUPS = ["Monthly", "Weekly", "Daily", "1 Hour", "15 Minute"] as const;
const SHORT_LABELS = ["C {op} O", "C {op} previous O", "C {op} O", "C {op} previous O", "C {op} previous-day O", "C {op} O", "C {op} O", "C {op} previous O", "C {op} O", "C {op} previous O"];

function evaluation(row: ThreeMonthStrategyRow, direction: ThreeMonthDirection): ThreeMonthEvaluation {
  if (direction === "BULL" && row.bull) return row.bull;
  if (direction === "BEAR" && row.bear) return row.bear;
  return { direction, qualification: row.qualification, passedGateCount: row.passedGateCount, availableGateCount: row.availableGateCount, gates: row.gates, weaknessMonths: row.weaknessMonths, weaknessState: row.weaknessState };
}

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
  const header = ["symbol", "company", "sector", "session_date", "direction", "intraday_mode", "qualification", "passed", "available", "history_any_one_state", ...SHORT_LABELS.flatMap((_, index) => [`gate_${index + 1}_state`, `gate_${index + 1}_left`, `gate_${index + 1}_right`]), "M1_state", "M2_state", "M3_state"];
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = rows.map((row) => {
    const result = evaluation(row, direction);
    return [row.symbol, row.companyName, row.sector, row.sessionDate, direction, mode, result.qualification, result.passedGateCount, result.availableGateCount, result.weaknessState,
      ...result.gates.flatMap((gate) => [gate.state, gate.left, gate.right]),
      ...result.weaknessMonths.map((gate) => gate.state),
    ].map(quote).join(",");
  });
  const blob = new Blob([[header.map(quote).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `three-month-strategy-${direction.toLowerCase()}-${mode}.csv`; link.click(); URL.revokeObjectURL(url);
}

export function ThreeMonthStrategyPage() {
  const [mode, setMode] = useState<ThreeMonthIntradayMode>("completed");
  const [direction, setDirection] = useState<ThreeMonthDirection>("BULL");
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const query = useThreeMonthStrategy(mode);
  const rows = query.data?.rows ?? [];
  const visible = useMemo(() => {
    const needle = search.trim().toUpperCase();
    return rows.filter((row) => (status === "ALL" || evaluation(row, direction).qualification === status) && (!needle || `${row.symbol} ${row.companyName ?? ""} ${row.sector ?? ""}`.toUpperCase().includes(needle)));
  }, [direction, rows, search, status]);
  const selectedRow = rows.find((row) => row.symbol === selected) ?? null;
  const selectedResult = selectedRow ? evaluation(selectedRow, direction) : null;

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
        <table><thead><tr><th rowSpan={2} className={styles.sticky}>Stock</th><th rowSpan={2}>Result</th><th rowSpan={2}>Score</th>{GATE_GROUPS.map((group) => <th colSpan={2} key={group}>{group}</th>)}<th colSpan={3}>Previous {direction === "BULL" ? "weakness" : "strength"} (ANY 1)</th></tr><tr>{SHORT_LABELS.map((label, index) => <th key={index}>{label.replace("{op}", direction === "BULL" ? ">" : "<")}</th>)}<th>M−1</th><th>M−2</th><th>M−3</th></tr></thead>
          <tbody>{visible.map((row) => { const result = evaluation(row, direction); const rowDetails = `${row.symbol} · ${row.companyName || "Company unavailable"} · ${row.sector || "Sector unavailable"} · ${result.qualification} · ${result.passedGateCount}/${result.availableGateCount} ${direction.toLowerCase()} gates · click for exact arithmetic`; return <tr key={row.symbol} onClick={() => setSelected(row.symbol)} className={selected === row.symbol ? styles.selected : undefined} title={rowDetails} aria-label={rowDetails}>
            <td className={styles.sticky}><Link to={`/analytics/stock/${encodeURIComponent(row.symbol)}`} onClick={(event) => event.stopPropagation()} title={`${row.companyName || row.symbol} · ${row.sector || "Sector unavailable"}`} aria-label={`${row.symbol}: ${row.companyName || "company unavailable"}, ${row.sector || "sector unavailable"}. Open Stock 360`}>{row.symbol}</Link></td>
            <td><span className={`${styles.result} ${styles[result.qualification.toLowerCase()]}`}>{result.qualification}</span></td><td className={styles.score}>{result.passedGateCount}/{result.availableGateCount}</td>
            {result.gates.map((gate) => <td key={`${row.symbol}-${gate.id}`} className={`${styles.gate} ${gateClass(gate.state)}`} title={arithmetic(gate)}><b>{stateGlyph(gate.state)}</b>{gate.forming ? <sup>F</sup> : null}</td>)}
            {result.weaknessMonths.map((gate) => <td key={`${row.symbol}-${gate.id}`} className={`${styles.gate} ${gateClass(gate.state)}`} title={arithmetic(gate)}><b>{stateGlyph(gate.state)}</b></td>)}
          </tr>; })}</tbody></table>
        {!visible.length ? <div className={styles.state}>No stocks match these filters.</div> : null}
      </div> : null}
    </section>

    {selectedRow && selectedResult ? <aside className={styles.drawer} aria-label={`${selectedRow.symbol} ${direction} strategy arithmetic`}><button className={styles.close} onClick={() => setSelected(null)} aria-label="Close details">×</button><h2>{selectedRow.symbol} · {direction}</h2><p>{selectedRow.companyName} · {selectedRow.sector || "Sector unavailable"}</p><div className={styles.drawerSummary}><strong>{selectedResult.qualification}</strong><span>{selectedResult.passedGateCount}/{selectedResult.availableGateCount} {direction.toLowerCase()} gates</span></div><h3>Exact gate arithmetic</h3><ol>{selectedResult.gates.map((gate) => <li key={gate.id} className={gateClass(gate.state)}><b>{stateGlyph(gate.state)} {gate.label}</b><span>{gate.left == null ? "—" : gate.left.toFixed(2)} {gate.operator} {gate.right == null ? "—" : gate.right.toFixed(2)}{gate.forming ? " · forming" : ""}</span></li>)}</ol><h3>Historical {direction === "BULL" ? "weakness" : "strength"} (one must pass)</h3><ul>{selectedResult.weaknessMonths.map((gate) => <li key={gate.id} className={gateClass(gate.state)}><b>{stateGlyph(gate.state)} {gate.label}</b><span>{gate.left == null ? "—" : gate.left.toFixed(2)} {gate.operator} {gate.right == null ? "—" : gate.right.toFixed(2)}</span></li>)}</ul><p className={styles.disclosure}>This is a screening result, not an entry, exit, stop, target or position-size recommendation.</p></aside> : null}
  </main>;
}
