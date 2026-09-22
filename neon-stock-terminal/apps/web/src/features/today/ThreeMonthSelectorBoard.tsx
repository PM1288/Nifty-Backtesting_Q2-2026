import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useThreeMonthStrategy } from "../../lib/hooks";
import type { ThreeMonthDirection, ThreeMonthEvaluation, ThreeMonthGate, ThreeMonthStrategyRow } from "../../lib/types";
import styles from "./ThreeMonthSelectorBoard.module.css";

const glyph = (gate: ThreeMonthGate | undefined) => gate?.state === "PASS" ? "✓" : gate?.state === "FAIL" ? "×" : gate?.state === "SKIPPED" ? "↷" : "—";
const state = (gate: ThreeMonthGate | undefined) => gate?.state.toLowerCase() ?? "unavailable";
const pairState = (gates: ThreeMonthGate[]) => gates.some((gate) => gate.state === "FAIL") ? "fail" : gates.every((gate) => gate.state === "PASS") ? "pass" : "unavailable";

function evaluation(row: ThreeMonthStrategyRow, direction: ThreeMonthDirection): ThreeMonthEvaluation {
  if (direction === "BULL" && row.bull) return row.bull;
  if (direction === "BEAR" && row.bear) return row.bear;
  return { direction, qualification: row.qualification, passedGateCount: row.passedGateCount, availableGateCount: row.availableGateCount, gates: row.gates, weaknessMonths: row.weaknessMonths, weaknessState: row.weaknessState };
}

function GatePair({ gates, label }: { gates: ThreeMonthGate[]; label: string }) {
  return <td data-state={pairState(gates)} title={gates.map((gate) => `${gate.label}: ${glyph(gate)}`).join("\n")}><b>{gates.every((gate) => gate.state === "PASS") ? "✓" : gates.some((gate) => gate.state === "FAIL") ? "×" : "—"}</b><small>{label}</small></td>;
}

function DirectionTable({ rows, direction, onInspect }: { rows: ThreeMonthStrategyRow[]; direction: ThreeMonthDirection; onInspect: (value: { row: ThreeMonthStrategyRow; direction: ThreeMonthDirection }) => void }) {
  const ranked = useMemo(() => [...rows].sort((left, right) => {
    const a = evaluation(left, direction), b = evaluation(right, direction);
    return Number(b.qualification === "QUALIFIED") - Number(a.qualification === "QUALIFIED") || b.passedGateCount - a.passedGateCount || left.symbol.localeCompare(right.symbol);
  }).slice(0, 10), [direction, rows]);
  return <section className={styles.lane} data-direction={direction.toLowerCase()}>
    <header><strong>3MONTH {direction}</strong><span>{rows.filter((row) => evaluation(row, direction).qualification === "QUALIFIED").length} qualified · top 10</span></header>
    <div className={styles.viewport}><table><thead><tr><th>Stock</th><th>M</th><th>W</th><th>D</th><th className={styles.history}>Prior-month reversal · ANY 1</th><th>1H</th><th>15m</th><th>Score</th></tr></thead>
      <tbody>{ranked.map((row) => { const result = evaluation(row, direction); return <tr key={row.symbol} data-qualified={result.qualification === "QUALIFIED" || undefined} onClick={() => onInspect({ row, direction })}>
        <th><button type="button" aria-label={`Inspect ${row.symbol} ${direction} arithmetic`}>{row.symbol}</button></th>
        <GatePair gates={result.gates.slice(0, 2)} label="2" /><GatePair gates={result.gates.slice(2, 4)} label="2" /><GatePair gates={result.gates.slice(4, 6)} label="2" />
        <td className={styles.history} data-state={result.weaknessState.toLowerCase()} title="M−1, M−2 and M−3 are OR conditions; any one passing satisfies this group"><span className={styles.orTicks}>{result.weaknessMonths.map((gate, index) => <i key={gate.id} data-state={state(gate)}>M−{index + 1} {glyph(gate)}</i>)}</span><small>ANY</small></td>
        <GatePair gates={result.gates.slice(6, 8)} label="2" /><GatePair gates={result.gates.slice(8, 10)} label="2" />
        <td className={styles.score} data-state={result.qualification.toLowerCase()}>{result.passedGateCount}/10</td>
      </tr>; })}</tbody></table></div>
  </section>;
}

export function ThreeMonthSelectorBoard() {
  const query = useThreeMonthStrategy("completed", true);
  const [inspected, setInspected] = useState<{ row: ThreeMonthStrategyRow; direction: ThreeMonthDirection } | null>(null);
  const rows = query.data?.rows ?? [];
  return <section className={styles.board} data-testid="home-three-month-selector">
    <header className={styles.title}><div><strong>3MONTH REVERSAL SELECTOR</strong><small>All M/W/D/1H/15m pairs are mandatory · M−1/M−2/M−3 is one OR group</small></div><Link to="/strategy/three-month">Full evidence</Link></header>
    {query.isLoading && !rows.length ? <p>Loading 3Month evidence…</p> : query.isError && !rows.length ? <p role="alert">3Month evidence unavailable; missing values remain unavailable.</p> : <div className={styles.grid}><DirectionTable rows={rows} direction="BULL" onInspect={setInspected} /><DirectionTable rows={rows} direction="BEAR" onInspect={setInspected} /></div>}
    {inspected ? <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label={`${inspected.row.symbol} ${inspected.direction} 3Month arithmetic`}><button type="button" onClick={() => setInspected(null)} aria-label="Close 3Month arithmetic">×</button><h2>{inspected.row.symbol} · {inspected.direction}</h2><p>{evaluation(inspected.row, inspected.direction).qualification} · {evaluation(inspected.row, inspected.direction).passedGateCount}/10 mandatory gates</p><ol>{evaluation(inspected.row, inspected.direction).gates.map((gate) => <li key={gate.id} data-state={state(gate)}><b>{glyph(gate)} {gate.label}</b><span>{gate.left?.toFixed(2) ?? "—"} {gate.operator} {gate.right?.toFixed(2) ?? "—"}</span></li>)}</ol><h3>Prior-month reversal · any one</h3><ul>{evaluation(inspected.row, inspected.direction).weaknessMonths.map((gate) => <li key={gate.id} data-state={state(gate)}><b>{glyph(gate)} {gate.label}</b><span>{gate.left?.toFixed(2) ?? "—"} {gate.operator} {gate.right?.toFixed(2) ?? "—"}</span></li>)}</ul><Link to={`/analytics/stock/${encodeURIComponent(inspected.row.symbol)}`}>Open Stock 360</Link></aside> : null}
  </section>;
}
