import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDateIST } from "../lib/format";
import { useThreeMonthStrategy } from "../lib/hooks";
import type { ThreeMonthGate, ThreeMonthGateState, ThreeMonthIntradayMode, ThreeMonthStrategyRow } from "../lib/types";
import styles from "./ThreeMonthStrategyPage.module.css";

const GATE_GROUPS = [
  { label: "Monthly", ids: ["M0_CLOSE_GT_OPEN", "M0_CLOSE_GT_M1_OPEN"] },
  { label: "Weekly", ids: ["W0_CLOSE_GT_OPEN", "W0_CLOSE_GT_W1_OPEN"] },
  { label: "Daily", ids: ["D0_CLOSE_GT_D1_OPEN", "D0_CLOSE_GT_OPEN"] },
  { label: "1 Hour", ids: ["H0_CLOSE_GT_OPEN", "H0_CLOSE_GT_H1_OPEN"] },
  { label: "15 Minute", ids: ["M15_CLOSE_GT_OPEN", "M15_CLOSE_GT_PREVIOUS_OPEN"] },
] as const;
const SHORT_LABELS: Record<string, string> = {
  M0_CLOSE_GT_OPEN: "C > O", M0_CLOSE_GT_M1_OPEN: "C > M−1 O",
  W0_CLOSE_GT_OPEN: "C > O", W0_CLOSE_GT_W1_OPEN: "C > W−1 O",
  D0_CLOSE_GT_D1_OPEN: "C > D−1 O", D0_CLOSE_GT_OPEN: "C > O",
  H0_CLOSE_GT_OPEN: "C > O", H0_CLOSE_GT_H1_OPEN: "C > prev O",
  M15_CLOSE_GT_OPEN: "C > O", M15_CLOSE_GT_PREVIOUS_OPEN: "C > prev O",
};

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
function downloadCsv(rows: ThreeMonthStrategyRow[], mode: ThreeMonthIntradayMode) {
  const ids = GATE_GROUPS.flatMap((group) => [...group.ids]);
  const header = ["symbol", "company", "sector", "session_date", "intraday_mode", "qualification", "passed", "available", "weakness_state", ...ids.flatMap((id) => [`${id}_state`, `${id}_left`, `${id}_right`]), "M1_RED", "M2_RED", "M3_RED"];
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = rows.map((row) => {
    const map = new Map(row.gates.map((gate) => [gate.id, gate]));
    return [row.symbol, row.companyName, row.sector, row.sessionDate, mode, row.qualification, row.passedGateCount, row.availableGateCount, row.weaknessState,
      ...ids.flatMap((id) => { const gate = map.get(id); return [gate?.state, gate?.left, gate?.right]; }),
      ...row.weaknessMonths.map((gate) => gate.state),
    ].map(quote).join(",");
  });
  const blob = new Blob([[header.map(quote).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `three-month-strategy-${mode}.csv`; link.click(); URL.revokeObjectURL(url);
}

export function ThreeMonthStrategyPage() {
  const [mode, setMode] = useState<ThreeMonthIntradayMode>("completed");
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const query = useThreeMonthStrategy(mode);
  const rows = query.data?.rows ?? [];
  const visible = useMemo(() => {
    const needle = search.trim().toUpperCase();
    return rows.filter((row) => (status === "ALL" || row.qualification === status) && (!needle || `${row.symbol} ${row.companyName ?? ""} ${row.sector ?? ""}`.toUpperCase().includes(needle)));
  }, [rows, search, status]);
  const selectedRow = rows.find((row) => row.symbol === selected) ?? null;

  return <main className={styles.page} data-testid="three-month-strategy">
    <section className={styles.hero}>
      <div><span className={styles.eyebrow}>NIFTY 500 · READ-ONLY SCREEN</span><h1>3Month Strategy</h1><p>Recent monthly weakness followed by simultaneous bullish confirmation across Month, Week, Day, 1 Hour and 15 Minutes.</p></div>
      <div className={styles.actions}>
        <Link to="/strategy/monthly">Monthly Strategy</Link>
        <button type="button" onClick={() => downloadCsv(visible, mode)} disabled={!visible.length}>Download CSV</button>
      </div>
    </section>

    <section className={styles.summary} aria-label="Strategy summary">
      {[['Profile coverage', query.data ? `${query.data.counts.universe}/${query.data.counts.expectedUniverse}` : '—'], ['Qualified', query.data?.counts.qualified], ['Rejected', query.data?.counts.rejected], ['Incomplete', query.data?.counts.incomplete], ['Intraday evaluated', query.data?.counts.intradayEvaluated]].map(([label, value]) => <div className={styles.metric} key={String(label)}><span>{label}</span><strong>{value ?? '—'}</strong></div>)}
    </section>

    <section className={styles.controls}>
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
        <table><thead><tr><th rowSpan={2} className={styles.sticky}>Stock</th><th rowSpan={2}>Result</th><th rowSpan={2}>Score</th>{GATE_GROUPS.map((group) => <th colSpan={2} key={group.label}>{group.label}</th>)}<th colSpan={3}>Previous weakness (ANY 1)</th></tr><tr>{GATE_GROUPS.flatMap((group) => group.ids.map((id) => <th key={id}>{SHORT_LABELS[id]}</th>))}<th>M−1</th><th>M−2</th><th>M−3</th></tr></thead>
          <tbody>{visible.map((row) => { const gateMap = new Map(row.gates.map((gate) => [gate.id, gate])); const rowDetails = `${row.symbol} · ${row.companyName || "Company unavailable"} · ${row.sector || "Sector unavailable"} · ${row.qualification} · ${row.passedGateCount}/${row.availableGateCount} bullish gates · click for exact arithmetic`; return <tr key={row.symbol} onClick={() => setSelected(row.symbol)} className={selected === row.symbol ? styles.selected : undefined} title={rowDetails} aria-label={rowDetails}>
            <td className={styles.sticky}><Link to={`/analytics/stock/${encodeURIComponent(row.symbol)}`} onClick={(event) => event.stopPropagation()} title={`${row.companyName || row.symbol} · ${row.sector || "Sector unavailable"}`} aria-label={`${row.symbol}: ${row.companyName || "company unavailable"}, ${row.sector || "sector unavailable"}. Open Stock 360`}>{row.symbol}</Link></td>
            <td><span className={`${styles.result} ${styles[row.qualification.toLowerCase()]}`}>{row.qualification}</span></td><td className={styles.score}>{row.passedGateCount}/{row.availableGateCount}</td>
            {GATE_GROUPS.flatMap((group) => group.ids.map((id) => { const gate = gateMap.get(id)!; return <td key={`${row.symbol}-${id}`} className={`${styles.gate} ${gateClass(gate.state)}`} title={arithmetic(gate)}><b>{stateGlyph(gate.state)}</b>{gate.forming ? <sup>F</sup> : null}</td>; }))}
            {row.weaknessMonths.map((gate) => <td key={`${row.symbol}-${gate.id}`} className={`${styles.gate} ${gateClass(gate.state)}`} title={arithmetic(gate)}><b>{stateGlyph(gate.state)}</b></td>)}
          </tr>; })}</tbody></table>
        {!visible.length ? <div className={styles.state}>No stocks match these filters.</div> : null}
      </div> : null}
    </section>

    {selectedRow ? <aside className={styles.drawer} aria-label={`${selectedRow.symbol} strategy arithmetic`}><button className={styles.close} onClick={() => setSelected(null)} aria-label="Close details">×</button><h2>{selectedRow.symbol}</h2><p>{selectedRow.companyName} · {selectedRow.sector || "Sector unavailable"}</p><div className={styles.drawerSummary}><strong>{selectedRow.qualification}</strong><span>{selectedRow.passedGateCount}/{selectedRow.availableGateCount} bullish gates</span></div><h3>Exact gate arithmetic</h3><ol>{selectedRow.gates.map((gate) => <li key={gate.id} className={gateClass(gate.state)}><b>{stateGlyph(gate.state)} {gate.label}</b><span>{gate.left == null ? "—" : gate.left.toFixed(2)} {gate.operator} {gate.right == null ? "—" : gate.right.toFixed(2)}{gate.forming ? " · forming" : ""}</span></li>)}</ol><h3>Historical weakness (one must pass)</h3><ul>{selectedRow.weaknessMonths.map((gate) => <li key={gate.id} className={gateClass(gate.state)}><b>{stateGlyph(gate.state)} {gate.label}</b><span>{gate.left == null ? "—" : gate.left.toFixed(2)} &lt; {gate.right == null ? "—" : gate.right.toFixed(2)}</span></li>)}</ul><p className={styles.disclosure}>This is a screening result, not an entry, exit, stop, target or position-size recommendation.</p></aside> : null}
  </main>;
}
