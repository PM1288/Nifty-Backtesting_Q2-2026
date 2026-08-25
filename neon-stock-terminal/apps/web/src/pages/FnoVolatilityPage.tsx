import { useEffect, useMemo, useState } from "react";
import { fetchFnoVolatilityDashboard, type FnoVolatilityDashboard } from "../lib/api";
import styles from "./FnoVolatilityPage.module.css";

function num(value: unknown, digits = 2) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "—";
}

function pct(value: unknown, digits = 2) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${(parsed * 100).toFixed(digits)}%` : "—";
}

function label(value: unknown) {
  return String(value ?? "Not available").replaceAll("_", " ");
}

export function FnoVolatilityPage() {
  const [data, setData] = useState<FnoVolatilityDashboard | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    const load = () => fetchFnoVolatilityDashboard()
      .then((value) => { if (active) { setData(value); setError(""); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const premarket = useMemo(() => (data?.premarket ?? []).filter((row) =>
    !query || String(row.underlying).toLowerCase().includes(query.toLowerCase())), [data, query]);
  const signals = (data?.live ?? []).filter((row) => row.signal_id);
  const actionable = signals.filter((row) => row.decision !== "NO_TRADE");

  if (error) return <div className={styles.page}><div className={styles.error}>Unable to load F&amp;O signals: {error}</div></div>;
  if (!data) return <div className={styles.page}><div className={styles.loading}>Loading live option-value evidence…</div></div>;

  return (
    <div className={styles.page}>
      <section className={styles.header}>
        <div>
          <span>Paper research · two-gate volatility selection</span>
          <h1>F&amp;O Straddle &amp; Strangle Signals</h1>
          <p>Daily movement shortlist first; fresh option value, IV, liquidity and scenario P&amp;L decide the trade.</p>
        </div>
        <strong>{actionable.length ? `${actionable.length} actionable` : "NO TRADE"}</strong>
      </section>

      <section className={styles.metrics}>
        <article><span>F&amp;O underlyings</span><b>{data.universe?.total ?? 0}</b><small>{data.universe?.complete ?? 0} contract-complete</small></article>
        <article><span>Active option contracts</span><b>{data.universe?.option_contracts ?? 0}</b><small>CE {data.universe?.call_contracts ?? 0} · PE {data.universe?.put_contracts ?? 0}</small></article>
        <article><span>Pre-market shortlist</span><b>{data.premarketRun?.shortlisted_underlyings ?? 0}</b><small>from {data.premarketRun?.evaluated_underlyings ?? 0} evaluated</small></article>
        <article><span>Live value gate</span><b>{signals.length}</b><small>{actionable.length} passed every gate</small></article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><h2>Live option-value decisions</h2><p>Entry uses CE ask + PE ask. Valuation and exit evidence use bids. Missing or stale quotes fail closed.</p></div><span>{label(data.liveRun?.status)}</span></div>
        {signals.length ? <div className={styles.tableWrap}><table><thead><tr><th>Rank / stock</th><th>Decision</th><th>Structure</th><th>Forecast move</th><th>Premium / edge</th><th>Expected return</th><th>Profit probability</th><th>IV</th><th>Quote quality</th></tr></thead><tbody>
          {signals.map((row) => <tr key={String(row.signal_id)}>
            <td><b>#{row.movement_rank} {row.underlying}</b><small>Live score {num(row.move_score_live, 1)}</small></td>
            <td><strong data-decision={row.decision}>{label(row.decision)}</strong><small>{label(row.confidence)}</small></td>
            <td>{label(row.structure_type)}<small>{row.call_symbol ?? "—"} + {row.put_symbol ?? "—"}</small></td>
            <td>P50 {pct(row.predicted_abs_move_p50)}<small>P75 {pct(row.predicted_abs_move_p75)} · entropy {num(row.direction_entropy, 3)}</small></td>
            <td>{num(row.combined_entry_ask)}<small>implied {pct(row.implied_move_pct)} · ratio {num(row.forecast_implied_ratio)}</small></td>
            <td>{pct(row.expected_return_pct)}<small>P10 {pct(row.pnl_p10)} · P90 {pct(row.pnl_p90)}</small></td>
            <td>{pct(row.probability_profit)}<small>ES95 {pct(row.expected_shortfall_95)}</small></td>
            <td>CE {pct(row.call_iv)}<small>PE {pct(row.put_iv)} · Δ {pct(row.predicted_iv_change)}</small></td>
            <td>{label(row.data_status)}<small>{row.quote_age_seconds == null ? "no source quote" : `${row.quote_age_seconds}s old`}</small></td>
          </tr>)}
        </tbody></table></div> : <div className={styles.empty}>The live gate has no valid post-open evaluation yet. Pre-market ranking remains visible below.</div>}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><h2>All F&amp;O movement candidates</h2><p>Uses the last completed daily session only. Every active stock-option underlying is retained, including rejected rows.</p></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter symbol" /></div>
        <div className={styles.tableWrap}><table><thead><tr><th>Rank / stock</th><th>Stage A score</th><th>Predicted moves</th><th>Top-quintile probability</th><th>Direction uncertainty</th><th>ATR / BB width</th><th>Volume / ADX</th><th>Contracts</th><th>Status</th></tr></thead><tbody>
          {premarket.map((row) => <tr key={String(row.underlying)}>
            <td><b>{row.movement_rank ? `#${row.movement_rank}` : "—"} {row.underlying}</b><small>{row.shortlisted ? "PRE-MARKET SHORTLIST" : "MONITORED"}</small></td>
            <td>{num(row.move_score_pre, 1)}</td>
            <td>P50 {pct(row.predicted_abs_move_p50)}<small>P75 {pct(row.predicted_abs_move_p75)} · P90 {pct(row.predicted_abs_move_p90)}</small></td>
            <td>{pct(row.probability_top_quintile)}</td>
            <td>{num(row.direction_entropy, 3)}<small>P(up) {pct(row.probability_up)}</small></td>
            <td>{pct(row.features?.atr_14_pct)}<small>BB {pct(row.features?.bb_width_pct)}</small></td>
            <td>{num(row.features?.volume_vs_sma20)}×<small>ADX {num(row.features?.adx_14)}</small></td>
            <td>{row.active_option_contracts ?? 0}<small>CE {row.active_call_contracts ?? 0} · PE {row.active_put_contracts ?? 0}</small></td>
            <td>{label(row.universe_data_status)}<small>{label(row.feature_availability?.india_vix)}</small></td>
          </tr>)}
        </tbody></table></div>
      </section>
    </div>
  );
}
