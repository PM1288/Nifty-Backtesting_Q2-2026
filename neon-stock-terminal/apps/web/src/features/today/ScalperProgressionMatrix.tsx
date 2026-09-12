import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { StockProfile } from "../../lib/stockProfiles";
import type { Quote, ScalperProgressionRow } from "../../lib/types";
import { StockLogo } from "../../components/stocks/StockProfileControls";
import type { ScalperProgressionCheck } from "./todayModel";
import {
  buildProgressionMatrixRows,
  progressionRowMatches,
  type ProgressionFilter,
  type ProgressionMatrixRow,
  type ProgressionRouteSummary,
} from "./scalperProgressionMatrix";
import styles from "./Today.module.css";

const GATES: Array<{ id: ScalperProgressionCheck["id"]; label: string }> = [
  { id: "month", label: "M" }, { id: "week", label: "W0" }, { id: "previous-week", label: "W−1" },
  { id: "today", label: "D0" }, { id: "hour", label: "1H" }, { id: "15m", label: "15m" }, { id: "5m", label: "5m" },
];
const FILTERS: Array<{ id: ProgressionFilter; label: string }> = [
  { id: "all", label: "All" }, { id: "7", label: "7/7" }, { id: "6", label: "6/7" },
  { id: "5plus", label: "5+/7" }, { id: "m1", label: "M−1 best" }, { id: "m2", label: "M−2 best" },
  { id: "waiting", label: "Waiting intraday" }, { id: "failure", label: "Has failure" },
];
const PREFERENCE_KEY = "n50.today.scalper-progression-matrix.v1";
type Density = "comfortable" | "compact" | "ultra";
type RouteView = "both" | "m1" | "m2";
type Preferences = { density: Density; routeView: RouteView; gates: ScalperProgressionCheck["id"][] };

function readPreferences(): Preferences {
  const fallback: Preferences = { density: "compact", routeView: "both", gates: GATES.map((gate) => gate.id) };
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFERENCE_KEY) ?? "null") as Partial<Preferences> | null;
    const density = parsed?.density === "comfortable" || parsed?.density === "ultra" ? parsed.density : "compact";
    const routeView = parsed?.routeView === "m1" || parsed?.routeView === "m2" ? parsed.routeView : "both";
    const allowed = new Set(GATES.map((gate) => gate.id));
    const gates = Array.isArray(parsed?.gates) ? parsed.gates.filter((gate): gate is ScalperProgressionCheck["id"] => allowed.has(gate)) : fallback.gates;
    return { density, routeView, gates: gates.length ? gates : fallback.gates };
  } catch {
    return fallback;
  }
}

const price = (value: number | null) => value == null ? "—" : value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const stateOf = (check: ScalperProgressionCheck) => check.passed == null ? "pending" : check.passed ? "pass" : "fail";
const stateSymbol = (check: ScalperProgressionCheck) => check.passed == null ? "—" : check.passed ? "✓" : "×";
const routeName = (route: ProgressionRouteSummary) => route.branch.id === "previous-month" ? "M−1" : "M−2";

function detailText(check: ScalperProgressionCheck): string {
  if (check.left == null || check.right == null) return `${check.label}\nPending — actual or reference is unavailable`;
  const margin = check.left - check.right;
  const percent = check.right === 0 ? null : margin / check.right * 100;
  return `${check.label}\nActual ₹${price(check.left)}\nReference ₹${price(check.right)}\nMargin ${margin >= 0 ? "+" : "−"}₹${price(Math.abs(margin))}${percent == null ? "" : ` / ${percent >= 0 ? "+" : "−"}${Math.abs(percent).toFixed(2)}%`}\nCondition: Actual > Reference`;
}

function GateCell({ check, ultra, onInspect }: { check: ScalperProgressionCheck; ultra: boolean; onInspect: () => void }) {
  return <td className={styles.progressionGate} data-state={stateOf(check)}>
    <button type="button" title={detailText(check)} aria-label={detailText(check).replaceAll("\n", "; ")} onClick={onInspect}>
      <b>{stateSymbol(check)}</b>{!ultra && <span>{check.right == null ? "waiting" : price(check.right)}</span>}
    </button>
  </td>;
}

function ScoreCell({ route }: { route: ProgressionRouteSummary }) {
  return <td className={styles.progressionScore} data-complete={route.complete ? "true" : "false"} title={`${route.pass} passed, ${route.fail} failed, ${route.pending} pending; contiguous progression ${route.branch.depth} of 7`}>
    <b>{route.branch.depth}/7</b><span>{route.pass}✓ {route.fail}× {route.pending}…</span>
  </td>;
}

function ProgressStrip({ route }: { route: ProgressionRouteSummary }) {
  return <span className={styles.progressionStages} aria-label={`${routeName(route)} progression: ${route.pass} passed, ${route.fail} failed, ${route.pending} pending`}>
    {route.branch.checks.map((check) => <i key={check.id} data-state={stateOf(check)} title={`${GATES.find((gate) => gate.id === check.id)?.label}: ${stateOf(check)}`} />)}
  </span>;
}

function ProgressionDrawer({ row, generatedAt, onClose }: { row: ProgressionMatrixRow; generatedAt: string | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const listener = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [onClose]);
  return <>
    <button type="button" className={styles.progressionDrawerBackdrop} aria-label="Close progression details" onClick={onClose} />
    <aside className={styles.progressionDrawer} role="dialog" aria-modal="true" aria-label={`${row.stock.symbol} progression evidence`}>
      <header><div><strong>{row.stock.symbol}</strong><small>{row.stock.name} · {row.stock.symbol}-EQ</small></div><button ref={closeRef} type="button" onClick={onClose} aria-label="Close"><X size={17} /></button></header>
      <div className={styles.progressionDrawerPrice}>₹{price(row.stock.last ?? row.source.currentValue)}</div>
      {row.routes.map((route) => <section key={route.branch.id}>
        <h3><span>{routeName(route)} CLOSE</span><b>{route.branch.depth}/7 · {route.pass}✓ {route.fail}× {route.pending}…</b></h3>
        {route.branch.checks.map((check) => {
          const margin = check.left != null && check.right != null ? check.left - check.right : null;
          const marginPct = margin != null && check.right ? margin / check.right * 100 : null;
          return <div className={styles.progressionDrawerGate} data-state={stateOf(check)} key={check.id}>
            <b>{GATES.find((gate) => gate.id === check.id)?.label}</b><strong>{check.passed == null ? "PENDING" : check.passed ? "PASS" : "FAIL"}</strong>
            <span>{check.left == null ? "—" : price(check.left)} &gt; {check.right == null ? "—" : price(check.right)}</span>
            <em>{margin == null ? "Source value unavailable" : `${margin >= 0 ? "+" : "−"}₹${price(Math.abs(margin))}${marginPct == null ? "" : ` · ${marginPct >= 0 ? "+" : "−"}${Math.abs(marginPct).toFixed(2)}%`}`}</em>
            <small>{check.label}</small>
          </div>;
        })}
      </section>)}
      <dl><div><dt>Evaluation timestamp</dt><dd>{row.source.observedAt ? new Date(row.source.observedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Unavailable"}</dd></div><div><dt>Response generated</dt><dd>{generatedAt ? new Date(generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Unavailable"}</dd></div><div><dt>Reference dates</dt><dd>Not supplied by the current summary response; exact values retained above.</dd></div></dl>
      <footer><Link to={`/analytics/stock/${encodeURIComponent(row.stock.symbol)}`}>Open Stock 360 <ExternalLink size={13} /></Link></footer>
    </aside>
  </>;
}

export function ScalperProgressionMatrix({ stocks, rows, generatedAt, isLoading, hasError, profiles, onOpenStock }: {
  stocks: Quote[];
  rows: ScalperProgressionRow[];
  generatedAt: string | null;
  isLoading: boolean;
  hasError: boolean;
  profiles: Map<string, StockProfile>;
  onOpenStock: (stock: Quote, target: HTMLElement) => void;
}) {
  const [filter, setFilter] = useState<ProgressionFilter>("all");
  const [search, setSearch] = useState("");
  const [preferences, setPreferences] = useState(readPreferences);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const allRows = useMemo(() => buildProgressionMatrixRows(stocks, rows), [stocks, rows]);
  const counts = useMemo(() => new Map(FILTERS.map((item) => [item.id, allRows.filter((row) => progressionRowMatches(row, item.id)).length])), [allRows]);
  const visibleRows = useMemo(() => allRows.filter((row) => progressionRowMatches(row, filter) && (!search.trim() || `${row.stock.symbol} ${row.stock.name}`.toLowerCase().includes(search.trim().toLowerCase()))), [allRows, filter, search]);
  const selected = allRows.find((row) => row.stock.symbol === selectedSymbol) ?? null;
  const visibleGates = GATES.filter((gate) => preferences.gates.includes(gate.id));
  const visibleRoutes = preferences.routeView === "both" ? [0, 1] : preferences.routeView === "m1" ? [0] : [1];

  useEffect(() => { try { localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preferences)); } catch { /* Preferences remain session-local. */ } }, [preferences]);
  const closeDrawer = useCallback(() => setSelectedSymbol(null), []);

  const exportCsv = () => {
    const columns = ["Stock", "LTP", ...visibleRoutes.flatMap((routeIndex) => [`${routeIndex ? "M-2" : "M-1"} depth`, ...visibleGates.map((gate) => `${routeIndex ? "M-2" : "M-1"} ${gate.label}`)]), "Best route", "Observed at"];
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const lines = [columns.map(quote).join(","), ...visibleRows.map((row) => {
      const values = [row.stock.symbol, row.stock.last, ...visibleRoutes.flatMap((routeIndex) => {
        const route = row.routes[routeIndex];
        return [route.branch.depth, ...visibleGates.map((gate) => {
          const check = route.branch.checks.find((candidate) => candidate.id === gate.id)!;
          return `${stateOf(check).toUpperCase()} | actual=${check.left ?? ""} | reference=${check.right ?? ""}`;
        })];
      }), routeName(row.best), row.source.observedAt ?? ""];
      return values.map(quote).join(",");
    })];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = href; anchor.download = "scalper-progression.csv"; anchor.click();
    URL.revokeObjectURL(href);
  };

  return <section className={styles.progressionMatrix} data-density={preferences.density} data-testid="today-scalper-progression" aria-label="Scalper progression to Monthly Open">
    <header><div><strong>SCALPER PROGRESSION · MONTHLY OPEN</strong><small>One stock per row · strongest progression first · select a row for complete arithmetic</small></div><span>{isLoading ? "Loading levels…" : hasError ? "Levels unavailable" : `${counts.get("7") ?? 0}/${allRows.length} fully qualified`}</span></header>
    <div className={styles.progressionToolbar}>
      <label>Stock <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" aria-label="Search progression stocks" /></label>
      <div className={styles.progressionFilters} aria-label="Progression filters">{FILTERS.map((item) => <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label} <b>{counts.get(item.id) ?? 0}</b></button>)}</div>
      <label>Density <select value={preferences.density} onChange={(event) => setPreferences((current) => ({ ...current, density: event.target.value as Density }))}><option value="comfortable">Comfortable</option><option value="compact">Compact</option><option value="ultra">Ultra Compact</option></select></label>
      <label>Routes <select value={preferences.routeView} onChange={(event) => setPreferences((current) => ({ ...current, routeView: event.target.value as RouteView }))}><option value="both">M−1 + M−2</option><option value="m1">M−1 only</option><option value="m2">M−2 only</option></select></label>
      <details className={styles.progressionColumns}><summary>Columns</summary><div>{GATES.map((gate) => <label key={gate.id}><input type="checkbox" checked={preferences.gates.includes(gate.id)} onChange={() => setPreferences((current) => ({ ...current, gates: current.gates.includes(gate.id) ? current.gates.filter((id) => id !== gate.id) : [...current.gates, gate.id] }))} /> {gate.label}</label>)}</div></details>
      <button type="button" className={styles.progressionExport} onClick={exportCsv}><Download size={13} /> CSV</button>
    </div>
    <div className={styles.progressionMatrixScroller} tabIndex={0} aria-label="Horizontally scrollable progression matrix">
      <table className={styles.progressionMatrixTable}>
        <thead><tr><th rowSpan={2} className={styles.progressionStickyStock}>Stock</th><th rowSpan={2} className={styles.progressionStickyLtp}>LTP</th><th rowSpan={2}>Progress</th>{visibleRoutes.map((routeIndex) => <th key={routeIndex} colSpan={visibleGates.length + 1}>{routeIndex === 0 ? "M−1 CLOSE" : "M−2 CLOSE"}</th>)}<th rowSpan={2} className={styles.progressionStickyBest}>Best</th></tr>
        <tr>{visibleRoutes.flatMap((routeIndex) => [<th key={`${routeIndex}-score`}>Score</th>, ...visibleGates.map((gate) => <th key={`${routeIndex}-${gate.id}`}>{gate.label}</th>)])}</tr></thead>
        <tbody>{visibleRows.map((row) => <tr key={row.stock.symbol} data-progression-symbol={row.stock.symbol} data-qualified={row.allGreen ? "true" : "false"} onClick={() => setSelectedSymbol(row.stock.symbol)}>
          <th scope="row" className={styles.progressionStickyStock}><button type="button" onClick={(event) => { event.stopPropagation(); onOpenStock(row.stock, event.currentTarget); }}><StockLogo symbol={row.stock.symbol} profile={profiles.get(row.stock.symbol)} size={17} /><span><b>{row.stock.symbol}</b><small>{row.stock.symbol}-EQ</small></span></button></th>
          <td className={styles.progressionStickyLtp}>₹{price(row.stock.last ?? row.source.currentValue)}</td>
          <td><ProgressStrip route={row.best} /></td>
          {visibleRoutes.flatMap((routeIndex) => {
            const route = row.routes[routeIndex];
            return [<ScoreCell key={`${routeIndex}-score`} route={route} />, ...visibleGates.map((gate) => <GateCell key={`${routeIndex}-${gate.id}`} check={route.branch.checks.find((check) => check.id === gate.id)!} ultra={preferences.density === "ultra"} onInspect={() => setSelectedSymbol(row.stock.symbol)} />)];
          })}
          <td className={styles.progressionStickyBest}><b data-complete={row.best.complete ? "true" : "false"}>{routeName(row.best)}</b><small>{row.best.complete ? "READY" : `${row.best.branch.depth}/7`}</small></td>
        </tr>)}</tbody>
      </table>
    </div>
    {!visibleRows.length && <div className={styles.progressionEmpty}>No stocks match this filter.</div>}
    {selected && <ProgressionDrawer row={selected} generatedAt={generatedAt} onClose={closeDrawer} />}
  </section>;
}
