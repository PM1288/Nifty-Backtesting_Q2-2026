import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { StockProfile } from "../../lib/stockProfiles";
import type { Quote, ScalperProgressionRow } from "../../lib/types";
import { StockLogo } from "../../components/stocks/StockProfileControls";
import type { ScalperProgressionCheck, ScalperProgressionDirection } from "./todayModel";
import {
  buildProgressionMatrixRows,
  directionalProgression,
  PROGRESSION_GATE_WEIGHTS,
  sortProgressionRows,
  type DirectionalProgression,
  type ProgressionMatrixRow,
  type ProgressionRouteSummary,
} from "./scalperProgressionMatrix";
import styles from "./Today.module.css";

const GATES: Array<{ id: ScalperProgressionCheck["id"]; label: string }> = [
  { id: "month-m1", label: "M−1" }, { id: "month-m2", label: "M−2" }, { id: "week", label: "W0" }, { id: "previous-week", label: "W−1" },
  { id: "today", label: "D0" }, { id: "hour", label: "1H" }, { id: "15m", label: "15m" }, { id: "5m", label: "5m" },
];
type CandidateFilter = "all" | "bull" | "bear" | "either";
const price = (value: number | null) => value == null ? "—" : value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const stateOf = (check: ScalperProgressionCheck | undefined) => !check || check.passed == null ? "pending" : check.passed ? "pass" : "fail";
const stateSymbol = (check: ScalperProgressionCheck | undefined) => !check || check.passed == null ? "—" : check.passed ? "✓" : "×";
const routeName = (route: ProgressionRouteSummary) => route.branch.id === "previous-month" ? "M−1" : "M−1 + M−2";
const comparisonSymbol = (direction: ScalperProgressionDirection) => direction === "bull" ? ">" : "<";

function DetailRoute({ route, direction }: { route: ProgressionRouteSummary; direction: ScalperProgressionDirection }) {
  const operator = comparisonSymbol(direction);
  return <section>
    <h3><span>{routeName(route)} route</span><b>{route.branch.depth}/{route.branch.checks.length} · W {route.weightedScore}/{route.maximumWeight} · {route.pass}✓ {route.fail}× {route.pending}…</b></h3>
    {route.branch.checks.map((check) => {
      const margin = check.left != null && check.right != null ? check.left - check.right : null;
      const marginPct = margin != null && check.right ? margin / check.right * 100 : null;
      return <div className={styles.progressionDrawerGate} data-state={stateOf(check)} key={check.id}>
        <b>{GATES.find((gate) => gate.id === check.id)?.label}</b><strong>{check.passed == null ? "PENDING" : check.passed ? "PASS" : "FAIL"}</strong>
        <span>{check.left == null ? "—" : price(check.left)} {operator} {check.right == null ? "—" : price(check.right)}</span>
        <em>{margin == null ? "Source value unavailable" : `${margin >= 0 ? "+" : "−"}₹${price(Math.abs(margin))}${marginPct == null ? "" : ` · ${marginPct >= 0 ? "+" : "−"}${Math.abs(marginPct).toFixed(2)}%`}`}</em>
        <small>{check.label} · weight {PROGRESSION_GATE_WEIGHTS[check.id]}</small>
      </div>;
    })}
  </section>;
}

function ProgressionDrawer({ row, generatedAt, onClose }: { row: ProgressionMatrixRow; generatedAt: string | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const listener = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [onClose]);
  const bull = directionalProgression(row, "bull");
  const bear = directionalProgression(row, "bear");
  return <>
    <button type="button" className={styles.progressionDrawerBackdrop} aria-label="Close progression details" onClick={onClose} />
    <aside className={styles.progressionDrawer} role="dialog" aria-modal="true" aria-label={`${row.stock.symbol} MWHD evidence`}>
      <header><div><strong>{row.stock.symbol}</strong><small>{row.stock.name} · ₹{price(row.stock.last ?? row.source.currentValue)}</small></div><button ref={closeRef} type="button" onClick={onClose} aria-label="Close"><X size={17} /></button></header>
      <div className={styles.progressionDualRank}><span data-direction="bull">MWHD-BULL <b>#{bull.rank}</b> · W {bull.best.weightedScore}/{bull.best.maximumWeight}</span><span data-direction="bear">MWHD-BEAR <b>#{bear.rank}</b> · W {bear.best.weightedScore}/{bear.best.maximumWeight}</span></div>
      <div className={styles.progressionLogic}><b>Audited inverse logic</b><span>BULL uses actual &gt; reference. BEAR uses the same source observations, gate order and weights with actual &lt; reference. M−2 requires M−1 and M−2 monthly sufficiency before lower-timeframe confirmation.</span></div>
      <h2 className={styles.progressionDirectionTitle} data-direction="bull">MWHD-BULL arithmetic</h2>
      {bull.routes.map((route) => <DetailRoute key={`bull-${route.branch.id}`} route={route} direction="bull" />)}
      <h2 className={styles.progressionDirectionTitle} data-direction="bear">MWHD-BEAR arithmetic</h2>
      {bear.routes.map((route) => <DetailRoute key={`bear-${route.branch.id}`} route={route} direction="bear" />)}
      <dl><div><dt>Evaluation timestamp</dt><dd>{row.source.observedAt ? new Date(row.source.observedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Unavailable"}</dd></div><div><dt>Response generated</dt><dd>{generatedAt ? new Date(generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Unavailable"}</dd></div></dl>
      <footer><Link to={`/analytics/stock/${encodeURIComponent(row.stock.symbol)}`}>Open Stock 360 <ExternalLink size={13} /></Link></footer>
    </aside>
  </>;
}

function gateFor(summary: DirectionalProgression, gateId: ScalperProgressionCheck["id"]) {
  const route = gateId === "month-m2" ? summary.routes[1] : summary.best;
  return route.branch.checks.find((check) => check.id === gateId);
}

function RankBoard({ direction, rows, profiles, onSelect, onOpenStock }: {
  direction: ScalperProgressionDirection; rows: ProgressionMatrixRow[]; profiles: Map<string, StockProfile>;
  onSelect: (symbol: string) => void; onOpenStock: (stock: Quote, target: HTMLElement) => void;
}) {
  const label = direction === "bull" ? "MWHD-BULL RANK" : "MWHD-BEAR RANK";
  return <section className={styles.progressionRankBoard} data-direction={direction} aria-label={label}>
    <header><strong>{label}</strong><span>{rows.filter((row) => directionalProgression(row, direction).complete).length} ready</span></header>
    <div className={styles.progressionRankScroller}>
      <table>
        <thead><tr><th>Rank</th><th>Stock</th><th>W Score</th>{GATES.map((gate) => <th key={gate.id}>{gate.label}</th>)}</tr></thead>
        <tbody>{rows.map((row) => {
          const summary = directionalProgression(row, direction);
          return <tr key={row.stock.symbol} data-progression-symbol={row.stock.symbol} data-direction={direction} data-candidate={summary.complete ? "true" : "false"} onClick={() => onSelect(row.stock.symbol)}>
            <td><b>#{summary.rank}</b></td>
            <th scope="row"><button type="button" title={`${row.stock.symbol}: ${label} ${summary.rank}; select the row for complete arithmetic`} onClick={(event) => { event.stopPropagation(); onOpenStock(row.stock, event.currentTarget); }}><StockLogo symbol={row.stock.symbol} profile={profiles.get(row.stock.symbol)} size={16} /><span><b>{row.stock.symbol}</b><small>B{row.rank} · S{row.bearRank}</small></span></button></th>
            <td className={styles.progressionCompactScore} title={`${summary.best.pass} passed, ${summary.best.fail} failed, ${summary.best.pending} pending`}><b>{summary.best.weightedScore}/{summary.best.maximumWeight}</b><small>{summary.best.pass}✓ {summary.best.fail}× {summary.best.pending}…</small></td>
            {GATES.map((gate) => {
              const check = gateFor(summary, gate.id);
              return <td className={styles.progressionTick} data-state={stateOf(check)} key={gate.id} title={check?.label ?? `${gate.label} is not part of the selected best route`}><button type="button" aria-label={`${gate.label}: ${stateOf(check)}. Select for arithmetic.`} onClick={() => onSelect(row.stock.symbol)}>{stateSymbol(check)}</button></td>;
            })}
          </tr>;
        })}</tbody>
      </table>
    </div>
  </section>;
}

export function ScalperProgressionMatrix({ stocks, rows, generatedAt, isLoading, hasError, profiles, onOpenStock }: {
  stocks: Quote[]; rows: ScalperProgressionRow[]; generatedAt: string | null; isLoading: boolean; hasError: boolean;
  profiles: Map<string, StockProfile>; onOpenStock: (stock: Quote, target: HTMLElement) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CandidateFilter>("all");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const allRows = useMemo(() => buildProgressionMatrixRows(stocks, rows), [stocks, rows]);
  const filtered = useMemo(() => allRows.filter((row) => {
    if (search.trim() && !`${row.stock.symbol} ${row.stock.name}`.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (filter === "bull") return row.allGreen;
    if (filter === "bear") return row.bearAllRed;
    if (filter === "either") return row.allGreen || row.bearAllRed;
    return true;
  }), [allRows, filter, search]);
  const selected = allRows.find((row) => row.stock.symbol === selectedSymbol) ?? null;
  const closeDrawer = useCallback(() => setSelectedSymbol(null), []);
  const bullRows = useMemo(() => sortProgressionRows(filtered, "bull"), [filtered]);
  const bearRows = useMemo(() => sortProgressionRows(filtered, "bear"), [filtered]);

  const exportCsv = () => {
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const directions = ["bull", "bear"] as const;
    const columns = ["Stock", "LTP", "MWHD-BULL rank", "BULL route", "BULL weighted", "MWHD-BEAR rank", "BEAR route", "BEAR weighted", ...directions.flatMap((direction) => GATES.map((gate) => `${direction.toUpperCase()} ${gate.label} evidence`)), "Observed at"];
    const lines = [columns.map(quote).join(","), ...allRows.map((row) => {
      const bull = directionalProgression(row, "bull"), bear = directionalProgression(row, "bear");
      const values = [row.stock.symbol, row.stock.last, bull.rank, routeName(bull.best), `${bull.best.weightedScore}/${bull.best.maximumWeight}`, bear.rank, routeName(bear.best), `${bear.best.weightedScore}/${bear.best.maximumWeight}`, ...([bull, bear] as const).flatMap((summary) => GATES.map((gate) => {
        const check = gateFor(summary, gate.id);
        return `${stateOf(check).toUpperCase()} | actual=${check?.left ?? ""} | operator=${comparisonSymbol(summary.direction)} | reference=${check?.right ?? ""}`;
      })), row.source.observedAt ?? ""];
      return values.map(quote).join(",");
    })];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = href; anchor.download = "mwhd-bull-bear-ranks.csv"; anchor.click(); URL.revokeObjectURL(href);
  };

  const bullReady = allRows.filter((row) => row.allGreen).length;
  const bearReady = allRows.filter((row) => row.bearAllRed).length;
  return <section className={styles.progressionMatrix} data-testid="today-scalper-progression" aria-label="MWHD Bull and Bear progression rankings">
    <header><div><strong>SCALPER PROGRESSION · MWHD RANK</strong><small>Tick-only candidate board · intraday confirmations carry more weight · select a stock for exact arithmetic</small></div><span>{isLoading ? "Loading levels…" : hasError ? "Levels unavailable" : `${bullReady} bull · ${bearReady} bear · ${allRows.length} stocks`}</span></header>
    <div className={styles.progressionToolbar}>
      <label>Stock <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" aria-label="Search progression stocks" /></label>
      <div className={styles.progressionFilters} aria-label="Candidate filters">{([['all', 'All'], ['bull', 'Bull ready'], ['bear', 'Bear ready'], ['either', 'Either ready']] as Array<[CandidateFilter, string]>).map(([id, label]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div>
      <span className={styles.progressionFormula}><b>BULL</b> actual &gt; reference <i>·</i> <b>BEAR</b> actual &lt; reference <i>·</i> same M−1/M−2 sufficiency and MWHD weights</span>
      <button type="button" className={styles.progressionExport} onClick={exportCsv}><Download size={13} /> Full evidence CSV</button>
    </div>
    <div className={styles.progressionRankBoards}>
      <RankBoard direction="bull" rows={bullRows} profiles={profiles} onSelect={setSelectedSymbol} onOpenStock={onOpenStock} />
      <RankBoard direction="bear" rows={bearRows} profiles={profiles} onSelect={setSelectedSymbol} onOpenStock={onOpenStock} />
    </div>
    {!filtered.length && <div className={styles.progressionEmpty}>No stocks match this filter.</div>}
    {selected && <ProgressionDrawer row={selected} generatedAt={generatedAt} onClose={closeDrawer} />}
  </section>;
}
