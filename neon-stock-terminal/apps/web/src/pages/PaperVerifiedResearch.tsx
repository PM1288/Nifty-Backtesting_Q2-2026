import { useEffect, useRef, useState } from "react";
import { researchCsv, researchExcel, researchMarkdown } from "../lib/paperResearchExport";
import styles from "./PaperVerifiedResearch.module.css";
type Row = Record<string, any>;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const format = (value: unknown) => value == null ? "—" : Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const money = (value: unknown) => value == null ? "—" : `₹${format(value)}`;
const sign = (value: number) => value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
const time = (value: unknown) => value ? new Date(String(value)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "—";
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PaperVerifiedResearch({ onSelect }: { onSelect: (trade: Row) => void }) {
  const [report, setReport] = useState<Row | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [cohort, setCohort] = useState("ALL_OIIS"), [allocation, setAllocation] = useState(200000);
  const [fees, setFees] = useState(0), [slip, setSlip] = useState(0), [oneIssuer, setOneIssuer] = useState(false);
  const [asOf, setAsOf] = useState(""), [selected, setSelected] = useState<Row | null>(null);
  const controller = useRef<AbortController>();
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const run = async () => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setLoading(true); setError("");
    const params = new URLSearchParams({ feesBps: String(fees), slippageBps: String(slip), oneIssuer: String(oneIssuer) });
    if (asOf) params.set("asOf", `${asOf}T10:00:00.000Z`);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/workspace/paper-trading/research?${params}`, { credentials: "include", signal: request.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      if (!request.signal.aborted) { setReport(payload); setSelected(null); }
    } catch (reason) { if (!request.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (!request.signal.aborted) setLoading(false); }
  };
  const scenario = report?.cohorts.find((item: Row) => item.id === cohort)?.scenarios.find((item: Row) => item.allocation === allocation);
  const open = scenario?.positions.filter((item: Row) => item.remaining > 0) ?? [];
  const equity = scenario?.equity_events ?? [];
  const startAt = equity.length ? Date.parse(equity[0].at) : 0;
  const endAt = equity.length ? Date.parse(equity.at(-1).at) : 1;
  const low = Math.min(400000, ...equity.map((item: Row) => item.equity)), high = Math.max(400001, ...equity.map((item: Row) => item.equity));
  const filename = `OIIS-verified-${report?.as_of?.slice(0, 10)}`;
  const parametersChanged = report && (report.parameters.fees_bps !== fees || report.parameters.slippage_bps !== slip || report.parameters.one_issuer !== oneIssuer || asOf && report.as_of !== `${asOf}T10:00:00.000Z`);
  return <section className={styles.root} data-testid="paper-verified-research">
    <header><div><h2>Verified evidence &amp; ₹4 lakh replay</h2><p>Recorded fills release capital. Target touches do not. Research only; no orders or ledger changes.</p></div>
      <button type="button" onClick={run} disabled={loading}>{loading ? "Replaying retained evidence…" : "Run verified replay"}</button></header>
    <div className={styles.controls}>
      <label>As of close (optional)<input type="date" min="2026-01-01" max={new Date().toISOString().slice(0, 10)} value={asOf} onChange={(event) => setAsOf(event.target.value)} /></label>
      <label>Estimated fees per fill<select value={fees} onChange={(event) => setFees(Number(event.target.value))}>{[0, 5, 10, 20].map((value) => <option key={value} value={value}>{value} bps</option>)}</select></label>
      <label>Spread/slippage per fill<select value={slip} onChange={(event) => setSlip(Number(event.target.value))}>{[0, 5, 10, 20].map((value) => <option key={value} value={value}>{value} bps</option>)}</select></label>
      <label><input type="checkbox" checked={oneIssuer} onChange={(event) => setOneIssuer(event.target.checked)} />One active stock · research challenger</label>
    </div>
    {parametersChanged ? <p role="status">Controls changed. Displayed results still use the last run; press Run to recalculate.</p> : null}
    {error ? <p role="alert">Replay unavailable: {error}. Previous results, if any, remain unchanged.</p> : null}
    {!report ? <p>Run to reconstruct S0–S4/S0–S29 coverage, compare monthly membership and replay actual closing fills with ₹1 lakh/₹2 lakh allocations.</p> : <>
      <div className={styles.controls}><label>Cohort<select value={cohort} onChange={(event) => setCohort(event.target.value)}>{report.cohorts.map((item: Row) => <option key={item.id} value={item.id}>{item.label} · {item.source_count}</option>)}</select></label>
        <label>Allocation<select value={allocation} onChange={(event) => setAllocation(Number(event.target.value))}><option value={100000}>₹1 lakh</option><option value={200000}>₹2 lakh</option></select></label>
        <span>Evidence cutoff {time(report.as_of)}</span>
        <button onClick={() => download(JSON.stringify(report, null, 2), `${filename}.json`, "application/json")}>Full JSON</button>
        <button onClick={() => download(researchCsv(report), `${filename}.csv`, "text/csv")}>Horizons CSV</button>
        <button onClick={() => download(researchCsv(report, "Replay positions"), `${filename}-positions.csv`, "text/csv")}>Replay CSV</button>
        <button onClick={() => download(researchCsv(report, "Equity events"), `${filename}-equity.csv`, "text/csv")}>Equity CSV</button>
        <button onClick={() => download(researchCsv(report, "Source records"), `${filename}-source.csv`, "text/csv")}>Full source CSV</button>
        <button onClick={() => download(researchExcel(report), `${filename}.xml`, "application/vnd.ms-excel")}>Excel workbook (.xml)</button>
        <button onClick={() => download(researchMarkdown(report), `${filename}.md`, "text/markdown")}>Audit Markdown</button></div>
      <div className={styles.kpis}>{[["Ending equity", scenario.ending_equity], ["Free capital", scenario.ending_cash], ["Realised gross", scenario.realised_gross], ["Open marked gross", scenario.open_marked_gross], ["Estimated friction", scenario.estimated_costs], ["Sampled drawdown", scenario.max_sampled_drawdown]].map(([label, value]) => <article key={label}><span>{label}</span><strong data-sign={sign(value as number)}>{money(value)}</strong></article>)}</div>
      <p>{scenario.taken} taken · {scenario.skipped} skipped · {scenario.open_positions} still open · {scenario.unmarked_open_positions} without a usable session mark · Return {format(scenario.return_pct)}%. Unmarked capital stays at entry value. Zero-cost results are gross, not achievable net returns. Cash-short feasibility is unverified.</p>
      <details><summary>Compare all cohorts and both allocations</summary><div className={styles.table}><table><thead><tr><th>Cohort</th><th>Allocation</th><th>Taken</th><th>Skipped</th><th>Ending equity</th><th>Return</th></tr></thead><tbody>{report.cohorts.flatMap((item: Row) => item.scenarios.map((model: Row) => <tr key={`${item.id}-${model.allocation}`}><th>{item.label}</th><td>{money(model.allocation)}</td><td>{model.taken}</td><td>{model.skipped}</td><td>{money(model.ending_equity)}</td><td data-sign={sign(model.return_pct)}>{format(model.return_pct)}%</td></tr>))}</tbody></table></div></details>
      <svg viewBox="0 0 900 150" role="img" aria-label="Recorded fill and session mark equity curve" className={styles.curve}><text x="8" y="16">{money(high)}</text><text x="8" y="124">{money(low)}</text><text x="120" y="145">{equity.length ? time(equity[0].at) : "No eligible entries"}</text><text x="885" y="145" textAnchor="end">{equity.length ? time(equity.at(-1).at) : ""}</text><polyline fill="none" stroke="#2563eb" strokeWidth="2" points={equity.map((item: Row) => `${120 + (Date.parse(item.at) - startAt) / Math.max(1, endAt - startAt) * 765},${115 - (item.equity - low) / (high - low) * 100}`).join(" ")} /></svg>
      <details><summary>Capital lock and repeated exposure · {open.length} open</summary><div className={styles.table}><table><thead><tr><th>Stock</th><th>Entry</th><th>Capital locked</th><th>Remaining units</th><th>Mark time</th><th>Short feasibility</th></tr></thead><tbody>{open.map((item: Row) => <tr key={item.trade_leg_id}><td>{item.symbol}</td><td>{time(item.entry_at)}</td><td>{money(item.remaining * item.entry_price)}</td><td>{format(item.remaining)}</td><td>{time(item.mark_at)}</td><td>{item.short_feasibility.replaceAll("_", " ")}</td></tr>)}</tbody></table></div></details>
      <h3>Verified horizons · raw outcomes preserved</h3><div className={styles.table}><table><thead><tr><th>Stock</th><th>Entry</th><th>5-session state</th><th>Coverage</th><th>30-session state</th><th>Monthly retrospective</th><th>Recorded before entry</th><th>Journey</th></tr></thead><tbody>{report.source.map((trade: Row) => <tr key={trade.trade_leg_id} onClick={() => setSelected(trade)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" && event.target === event.currentTarget) setSelected(trade); }}><th>{trade.symbol}</th><td>{time(trade.opened_at)}</td><td>{trade.verified.horizons[0].status}</td><td>{trade.verified.horizons[0].valid_bars}/{trade.verified.horizons[0].expected_bars}</td><td>{trade.verified.horizons[1].status}</td><td>{trade.monthly.reason.replaceAll("_", " ")}</td><td>{trade.monthly_known.reason.replaceAll("_", " ")}</td><td><button onClick={(event) => { event.stopPropagation(); setSelected(null); onSelect(trade); }}>Orders &amp; fills</button></td></tr>)}</tbody></table></div>
      <h3>Independent target opportunities · not executed profits</h3><div className={styles.table}><table><thead><tr><th>Window</th><th>Target</th><th>Hit</th><th>Miss</th><th>Censored</th><th>Invalid</th><th>Disputed</th><th>Mean minutes to touch</th></tr></thead><tbody>{report.target_comparison.map((item: Row) => <tr key={`${item.lifecycle}-${item.target_pct}`}><th>{item.lifecycle}</th><td>{format(item.target_pct * 100)}%</td><td>{item.hit}</td><td>{item.miss}</td><td>{item.censored}</td><td>{item.invalid}</td><td>{item.disputed}</td><td>{format(item.average_minutes_to_hit)}</td></tr>)}</tbody></table></div>
      <details><summary>Admission decisions and capital skips</summary><div className={styles.table}><table><thead><tr><th>Stock</th><th>Time</th><th>Decision</th></tr></thead><tbody>{scenario.decisions.map((item: Row) => <tr key={item.trade_leg_id}><th>{item.symbol}</th><td>{time(item.at)}</td><td>{item.reason.replaceAll("_", " ")}</td></tr>)}</tbody></table></div></details>
      <details><summary>Assumed target exits · independent research comparisons</summary><p>These are hypothetical fills after the first retained touch bar ends, not recorded profits or proof of fillability. Missing earlier bars can hide earlier touches. No stop or forced exit is added. Never sum these alternatives.</p><div className={styles.table}><table><thead><tr><th>Window</th><th>Target</th><th>Taken</th><th>Ending model equity</th><th>Estimated-cost return</th><th>Still open</th></tr></thead><tbody>{report.cohorts.find((item: Row) => item.id === cohort).shadow_targets.map((target: Row) => { const model = target.scenarios.find((item: Row) => item.allocation === allocation); return <tr key={`${target.lifecycle}-${target.target_pct}`}><th>{target.lifecycle}</th><td>{format(target.target_pct * 100)}%</td><td>{model.taken}</td><td>{money(model.ending_equity)}</td><td>{format(model.return_pct)}%</td><td>{model.open_positions}</td></tr>; })}</tbody></table></div></details>
      <details><summary>Formula, calendar and execution limitations</summary><ul>{report.limitations.map((item: string) => <li key={item}>{item}</li>)}</ul></details>
    </>}
    {selected ? <aside className={styles.drawer} aria-label={`${selected.symbol} verified evidence`}><button autoFocus onClick={() => setSelected(null)}>Close evidence</button><h3>{selected.symbol}</h3><p>{time(selected.opened_at)} · {selected.side}</p><button onClick={() => { onSelect(selected); setSelected(null); }}>Open canonical trade journey</button><pre>{JSON.stringify({ verified: selected.verified, monthly: selected.monthly, known: selected.monthly_known, fills: selected.fills, accounting: selected.accounting }, null, 2)}</pre></aside> : null}
  </section>;
}
