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
  return { direction, qualification: row.qualification, passedGateCount: row.passedGateCount, availableGateCount: row.availableGateCount, scoredConditionCount: row.scoredConditionCount, availableConditionCount: row.availableConditionCount, totalConditionCount: row.totalConditionCount, gates: row.gates, weaknessMonths: row.weaknessMonths, weaknessState: row.weaknessState };
}

const historyNewestLast = (result: ThreeMonthEvaluation) => [...result.weaknessMonths].reverse();

function GatePair({ gates, label }: { gates: ThreeMonthGate[]; label: string }) {
  return <td data-state={pairState(gates)} title={gates.map((gate) => `${gate.label}: ${glyph(gate)}`).join("\n")}><b>{gates.every((gate) => gate.state === "PASS") ? "✓" : gates.some((gate) => gate.state === "FAIL") ? "×" : "—"}</b><small>{label}</small></td>;
}

function DirectionTable({ rows, direction, onInspect }: { rows: ThreeMonthStrategyRow[]; direction: ThreeMonthDirection; onInspect: (value: { row: ThreeMonthStrategyRow; direction: ThreeMonthDirection }) => void }) {
  const ranked = useMemo(() => [...rows].sort((left, right) => {
    const a = evaluation(left, direction), b = evaluation(right, direction);
    return Number(b.qualification === "QUALIFIED") - Number(a.qualification === "QUALIFIED") || b.scoredConditionCount - a.scoredConditionCount || left.symbol.localeCompare(right.symbol);
  }).slice(0, 10), [direction, rows]);
  return <section className={styles.lane} data-direction={direction.toLowerCase()}>
    <header><strong>3MONTH {direction}</strong><span>{rows.filter((row) => evaluation(row, direction).qualification === "QUALIFIED").length} qualified · top 10</span></header>
    <div className={styles.viewport}><table><thead><tr><th>Stock</th><th className={styles.history}>M−3 OR M−2 OR M−1</th><th>M</th><th>W</th><th>D</th><th>1H</th><th>15m</th><th>5m</th><th>Score</th></tr></thead>
      <tbody>{ranked.map((row) => { const result = evaluation(row, direction); return <tr key={row.symbol} data-qualified={result.qualification === "QUALIFIED" || undefined} onClick={() => onInspect({ row, direction })}>
        <th><button type="button" aria-label={`Inspect ${row.symbol} ${direction} arithmetic`}>{row.symbol}</button></th>
        <td className={styles.history} data-state={result.weaknessState.toLowerCase()} title="M−3, M−2 and M−1 form one OR condition and contribute at most one score point"><span className={styles.orTicks}>{historyNewestLast(result).map((gate) => <i key={gate.id} data-state={state(gate)}>{gate.id.startsWith("M3") ? "M−3" : gate.id.startsWith("M2") ? "M−2" : "M−1"} {glyph(gate)}</i>)}</span><small>1 pt</small></td>
        <GatePair gates={result.gates.slice(0, 2)} label="2" /><GatePair gates={result.gates.slice(2, 4)} label="2" /><GatePair gates={result.gates.slice(4, 6)} label="2" />
        <GatePair gates={result.gates.slice(6, 8)} label="2" /><GatePair gates={result.gates.slice(8, 10)} label="2" />
        <GatePair gates={result.gates.slice(10, 12)} label="2" />
        <td className={styles.score} data-state={result.qualification.toLowerCase()} title={`${result.availableConditionCount} of ${result.totalConditionCount} scored conditions currently available`}>{result.scoredConditionCount}/{result.totalConditionCount}</td>
      </tr>; })}</tbody></table></div>
  </section>;
}

export function ThreeMonthSelectorBoard() {
  const query = useThreeMonthStrategy("completed", true);
  const [inspected, setInspected] = useState<{ row: ThreeMonthStrategyRow; direction: ThreeMonthDirection } | null>(null);
  const rows = query.data?.rows ?? [];
  return <section className={styles.board} data-testid="home-three-month-selector">
    <header className={styles.title}><div><strong>3MONTH REVERSAL SELECTOR</strong><small>M−3 OR M−2 OR M−1 = one point · all M/W/D/1H/15m/5m pairs remain mandatory</small></div><Link to="/strategy/three-month">Full evidence</Link></header>
    {query.isLoading && !rows.length ? <p>Loading 3Month evidence…</p> : query.isError && !rows.length ? <p role="alert">3Month evidence unavailable; missing values remain unavailable.</p> : <div className={styles.grid}><DirectionTable rows={rows} direction="BULL" onInspect={setInspected} /><DirectionTable rows={rows} direction="BEAR" onInspect={setInspected} /></div>}
    {inspected ? <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label={`${inspected.row.symbol} ${inspected.direction} 3Month arithmetic`}><button type="button" onClick={() => setInspected(null)} aria-label="Close 3Month arithmetic">×</button><h2>{inspected.row.symbol} · {inspected.direction}</h2><p>{evaluation(inspected.row, inspected.direction).qualification} · {evaluation(inspected.row, inspected.direction).scoredConditionCount}/{evaluation(inspected.row, inspected.direction).totalConditionCount} scored conditions</p><h3>M−3 OR M−2 OR M−1 · one scored group</h3><ul>{historyNewestLast(evaluation(inspected.row, inspected.direction)).map((gate) => <li key={gate.id} data-state={state(gate)}><b>{glyph(gate)} {gate.label}</b><span>{gate.left?.toFixed(2) ?? "—"} {gate.operator} {gate.right?.toFixed(2) ?? "—"}</span></li>)}</ul><h3>Mandatory M/W/D/1H/15m/5m conditions</h3><ol>{evaluation(inspected.row, inspected.direction).gates.map((gate) => <li key={gate.id} data-state={state(gate)}><b>{glyph(gate)} {gate.label}</b><span>{gate.left?.toFixed(2) ?? "—"} {gate.operator} {gate.right?.toFixed(2) ?? "—"}</span></li>)}</ol><Link to={`/analytics/stock/${encodeURIComponent(inspected.row.symbol)}`}>Open Stock 360</Link></aside> : null}
  </section>;
}
