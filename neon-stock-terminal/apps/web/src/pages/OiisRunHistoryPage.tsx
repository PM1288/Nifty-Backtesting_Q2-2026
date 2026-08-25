import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchOiisRunHistory, type OiisRunHistory } from "../lib/api";
import styles from "./OiisRunHistoryPage.module.css";

function ist(value: unknown) {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function n(value: unknown, digits = 2) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "—";
}

function delta(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return `${parsed > 0 ? "+" : ""}${parsed.toFixed(2)}`;
}

function label(value: unknown) {
  return String(value ?? "—").toLowerCase().replaceAll("_", " ").replace(/(^|\s)\S/g, (item) => item.toUpperCase());
}

export function OiisRunHistoryPage() {
  const [data, setData] = useState<OiisRunHistory | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [onlyChanged, setOnlyChanged] = useState(true);

  useEffect(() => {
    let active = true;
    const load = () => fetchOiisRunHistory(undefined, 24)
      .then((value) => { if (active) { setData(value); setError(""); } })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : String(caught)); });
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const runs = useMemo(() => data?.runs ?? [], [data]);

  return <div className={styles.page}>
    <header className={styles.header}>
      <div>
        <span>OIIS lab · Paper only</span>
        <h1>30-minute run history</h1>
        <p>Each row preserves the market-data cutoff, actual execution time, change from the preceding run and the resulting paper-trade decision.</p>
      </div>
      <Link to="/strategy/oiis-live">Back to daily selection</Link>
    </header>

    <section className={styles.policy}>
      <div><span>Schedule</span><strong>{data?.scheduleIst.join(" · ") ?? "09:30–15:00"} IST</strong></div>
      <div><span>Quality rule</span><strong>{data?.qualityFormula ?? "OFactor + XFactor + Data Quality"} &gt; {data?.thresholdExclusive ?? 185}</strong></div>
      <div><span>Action</span><strong>Top qualifying candidate · one paper trade per symbol/day</strong></div>
    </section>

    {error && <div className={styles.error}>{error}</div>}

    <div className={styles.toolbar}>
      <strong>{runs.length} completed runs</strong>
      <label><input type="checkbox" checked={onlyChanged} onChange={(event) => setOnlyChanged(event.target.checked)} /> Show meaningful changes only</label>
    </div>

    <section className={styles.runs}>
      {runs.map((run) => {
        const id = String(run.run_id);
        const changes = (run.changes ?? []).filter((change: Record<string, any>) => !onlyChanged || change.change_kind !== "UNCHANGED" || change.auto_paper_selected);
        return <article className={styles.run} key={id}>
          <button className={styles.runSummary} onClick={() => setExpanded(expanded === id ? null : id)} aria-expanded={expanded === id}>
            <span><small>Run slot</small><strong>{label(run.run_slot)}</strong></span>
            <span><small>Data cutoff</small><strong>{ist(run.decision_as_of)}</strong></span>
            <span><small>Executed</small><strong>{ist(run.execution_timestamp)}</strong></span>
            <span><small>Universe</small><strong>{run.evaluated_symbols ?? 0} stocks</strong></span>
            <span><small>Top candidate</small><strong>{run.auto_paper_symbol ?? "No qualifying stock"}</strong></span>
            <span><small>Quality sum</small><strong>{n(run.auto_paper_quality_score)}</strong></span>
            <span data-status={run.auto_paper_status}><small>Paper action</small><strong>{label(run.auto_paper_status)}</strong></span>
            <b>{expanded === id ? "−" : "+"}</b>
          </button>
          {expanded === id && <div className={styles.detail}>
            <p>Completed {ist(run.completed_at)} · previous run {run.previous_run_id ?? "none"} · paper group {run.paper_trade_group_id ?? "none"}</p>
            <div className={styles.tableWrap}><table>
              <thead><tr><th>Stock</th><th>Direction</th><th>OFactor</th><th>XFactor</th><th>Data quality</th><th>Quality sum</th><th>Rank</th><th>Change</th><th>Paper</th></tr></thead>
              <tbody>{changes.map((change: Record<string, any>) => <tr key={change.symbol} data-selected={change.auto_paper_selected ? "true" : "false"}>
                <td><Link to={`/analytics/stock/${encodeURIComponent(change.symbol)}`}>{change.symbol}</Link></td>
                <td>{change.previous_direction ? `${change.previous_direction} → ` : ""}<strong>{change.direction}</strong></td>
                <td>{n(change.ofactor)} <small>{delta(change.ofactor_delta)}</small></td>
                <td>{n(change.xfactor)} <small>{delta(change.xfactor_delta)}</small></td>
                <td>{n(change.data_quality)} <small>{delta(change.data_quality_delta)}</small></td>
                <td><strong>{n(change.quality_score)}</strong> <small>{delta(change.quality_score_delta)}</small></td>
                <td>{change.previous_opportunity_rank ?? "—"} → {change.opportunity_rank ?? "—"}</td>
                <td>{label(change.change_kind)}{change.crossed_above_threshold ? " · crossed 185" : ""}</td>
                <td>{change.auto_paper_selected ? label(change.entry_status ?? run.auto_paper_status) : "—"}</td>
              </tr>)}</tbody>
            </table></div>
            {!changes.length && <p>No material score, rank or direction change from the preceding run.</p>}
          </div>}
        </article>;
      })}
      {!runs.length && !error && <div className={styles.empty}>Waiting for the first completed OIIS run.</div>}
    </section>
  </div>;
}
