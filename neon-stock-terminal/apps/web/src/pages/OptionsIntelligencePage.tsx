import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { EChartSurface } from "../components/visual/EChartSurface";
import {
  fetchOptionsIntelligenceDetail,
  fetchOptionsIntelligenceSummary,
  type OptionsIntelligenceDetail,
  type OptionsIntelligenceSummary
} from "../lib/api";
import styles from "./OptionsIntelligencePage.module.css";

function n(value: unknown, digits = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "—";
}

function pct(value: unknown, digits = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${(parsed * 100).toFixed(digits)}%` : "—";
}

function money(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `₹${parsed.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—";
}

function compact(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(parsed);
}

function ist(value: unknown) {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium"
  }).format(parsed);
}

function label(value: unknown) {
  return String(value ?? "Unavailable").toLowerCase().replaceAll("_", " ").replace(/(^|\s)\S/g, (part) => part.toUpperCase());
}

function scoreTone(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "missing";
  if (parsed >= 72) return "pass";
  if (parsed >= 60) return "watch";
  return "fail";
}

function decisionTone(value: unknown) {
  const text = String(value ?? "");
  if (text.startsWith("BUY")) return "pass";
  if (text === "WATCH" || text === "MONITOR") return "watch";
  return "fail";
}

function ScoreBar({ label: title, value, threshold }: { label: string; value: unknown; threshold: number }) {
  const parsed = Number(value);
  const width = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
  return <div className={styles.scoreBar} data-tone={scoreTone(value)}>
    <div><span>{title}</span><strong>{Number.isFinite(parsed) ? parsed.toFixed(1) : "Not calculated"}</strong></div>
    <div className={styles.track}><i style={{ width: `${width}%` }} /><b style={{ left: `${threshold}%` }} /></div>
    <small>Gate {threshold}</small>
  </div>;
}

export function OptionsIntelligencePage() {
  const [summary, setSummary] = useState<OptionsIntelligenceSummary | null>(null);
  const [detail, setDetail] = useState<OptionsIntelligenceDetail | null>(null);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [onlyLive, setOnlyLive] = useState(true);
  const [frozen, setFrozen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = () => fetchOptionsIntelligenceSummary().then((value) => {
      if (!active) return;
      setSummary(value);
      setError("");
      setSelected((current) => current || String(value.candidates.find((row) => row.candidate_id)?.underlying ?? value.candidates[0]?.underlying ?? ""));
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : String(reason)));
    void load();
    if (frozen) return () => { active = false; };
    const timer = window.setInterval(load, 20_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [frozen]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    const load = () => fetchOptionsIntelligenceDetail(selected).then((value) => {
      if (active) { setDetail(value); setError(""); }
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : String(reason)));
    void load();
    if (frozen) return () => { active = false; };
    const timer = window.setInterval(load, 20_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selected, frozen]);

  const rows = useMemo(() => (summary?.candidates ?? []).filter((row) => {
    if (onlyLive && !row.shortlisted && !row.signal_id) return false;
    return !query || String(row.underlying).toLowerCase().includes(query.toLowerCase());
  }), [summary, onlyLive, query]);
  const prediction = detail?.prediction;
  const chain = detail?.chain ?? [];
  const calls = chain.filter((row) => row.right === "CE");
  const puts = chain.filter((row) => row.right === "PE");
  const strikes = [...new Set(chain.map((row) => Number(row.strike)))].sort((a, b) => a - b);
  const selectedStructure = prediction?.candidate_id ? `${money(prediction.put_strike)} PE + ${money(prediction.call_strike)} CE` : "No executable structure selected";

  const historyOption = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: "axis" },
    legend: { data: ["Spot", "Near future"] },
    grid: { top: 42, left: 48, right: 22, bottom: 45 },
    xAxis: { type: "category", data: (detail?.history ?? []).map((row) => ist(row.snapshot_ts).split(", ").at(-1) ?? "") },
    yAxis: { type: "value", scale: true },
    series: [
      { name: "Spot", type: "line", showSymbol: false, smooth: true, data: (detail?.history ?? []).map((row) => Number(row.spot_price) || null), lineStyle: { color: "#0b8f68", width: 2 }, areaStyle: { color: "rgba(11,143,104,.08)" } },
      { name: "Near future", type: "line", showSymbol: false, data: (detail?.history ?? []).map((row) => Number(row.futures_price) || null), lineStyle: { color: "#6658d3", width: 2 } }
    ]
  }), [detail]);

  const chainOption = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: "axis" },
    legend: { data: ["Call OI", "Put OI", "Call volume", "Put volume"] },
    grid: { top: 54, left: 60, right: 24, bottom: 52 },
    xAxis: { type: "category", data: strikes.map(String), name: "Strike" },
    yAxis: { type: "value", name: "Contracts" },
    series: [
      { name: "Call OI", type: "bar", data: strikes.map((strike) => Number(calls.find((row) => Number(row.strike) === strike)?.oi) || 0), itemStyle: { color: "#3f7cff" } },
      { name: "Put OI", type: "bar", data: strikes.map((strike) => -(Number(puts.find((row) => Number(row.strike) === strike)?.oi) || 0)), itemStyle: { color: "#8b5cf6" } },
      { name: "Call volume", type: "line", data: strikes.map((strike) => Number(calls.find((row) => Number(row.strike) === strike)?.volume) || 0), lineStyle: { color: "#0b8f68" }, showSymbol: false },
      { name: "Put volume", type: "line", data: strikes.map((strike) => -(Number(puts.find((row) => Number(row.strike) === strike)?.volume) || 0)), lineStyle: { color: "#d97706" }, showSymbol: false }
    ]
  }), [calls, puts, strikes]);

  const maxRejection = Math.max(1, ...(summary?.rejectionDistribution ?? []).map((row) => row.count));
  const chainAge = summary?.chainHealth?.snapshot_age_seconds != null
    ? Number(summary.chainHealth.snapshot_age_seconds)
    : summary?.chainHealth?.snapshot_ts
      ? Math.max(0, Math.round((Date.now() - new Date(summary.chainHealth.snapshot_ts).getTime()) / 1000))
      : null;
  const chainWatchHealthy = summary?.chainHealth?.watch_status === "HEALTHY";

  return <div className={styles.page}>
    <header className={styles.hero}>
      <div>
        <span>Long-volatility opportunity radar · Paper research only</span>
        <h1>Options Intelligence</h1>
        <p>Ranks the full stock F&amp;O universe, verifies live movement, then tests whether executable CE + PE premium is cheap enough to buy.</p>
      </div>
      <div className={styles.heroActions}>
        <span data-tone={chainWatchHealthy ? "pass" : "fail"}>{chainAge == null ? "Chain unavailable" : chainWatchHealthy ? `Archive healthy · ${chainAge}s old` : `Recovery watch active · ${chainAge}s old`}</span>
        <button onClick={() => setFrozen((value) => !value)}>{frozen ? "Resume live view" : "Freeze view"}</button>
      </div>
    </header>

    {error && <div className={styles.error}>Live data error: {error}</div>}

    <section className={styles.pulse}>
      <div className={styles.pulseLead}>
        <span>Current system verdict</span>
        <strong data-tone={(summary?.funnel.tradeReady ?? 0) > 0 ? "pass" : "watch"}>{(summary?.funnel.tradeReady ?? 0) > 0 ? `${summary?.funnel.tradeReady} trade-ready structures` : "NO TRADE"}</strong>
        <p>{(summary?.funnel.tradeReady ?? 0) > 0 ? "At least one structure passed every movement, value, liquidity and data gate." : "Movement candidates exist, but no tested structure has cleared every non-compensable gate."}</p>
      </div>
      <div className={styles.funnel} tabIndex={0} role="region" aria-label="Qualification funnel">
        {[["F&O universe", summary?.funnel.universe], ["Pre-market", summary?.funnel.premarketShortlist], ["Live confirmed", summary?.funnel.liveConfirmed], ["Structures", summary?.funnel.structuresTested], ["Trade ready", summary?.funnel.tradeReady]].map(([title, value], index) => <div key={String(title)}><small>0{index + 1}</small><b>{value ?? 0}</b><span>{title}</span></div>)}
      </div>
      <div className={styles.health}>
        <span>Decision-time data</span>
        <strong>{summary?.liveRun?.status ? label(summary.liveRun.status) : "Awaiting live run"}</strong>
        <small>Decision: {ist(summary?.liveRun?.decision_as_of)}</small>
        <small>Latest chain: {ist(summary?.chainHealth?.snapshot_ts)}</small>
        <small>{summary?.chainHealth?.fresh_contracts ?? 0} fresh · {summary?.chainHealth?.two_sided_contracts ?? 0} / {summary?.chainHealth?.contract_count ?? 0} two-sided contracts</small>
        {!chainWatchHealthy && <small>Collector retries are bounded and use cached SmartAPI data; no extra broker request loop.</small>}
      </div>
    </section>

    <section className={styles.kpis}>
      <article><span>Passing structures</span><strong>{summary?.funnel.tradeReady ?? 0}</strong><small>of {summary?.funnel.structuresTested ?? 0} final structures tested</small></article>
      <article><span>Strongest live score</span><strong>{n(Math.max(0, ...(summary?.candidates ?? []).map((row) => Number(row.liveConfirmationScore) || 0)))}</strong><small>movement confirmation, not trade permission</small></article>
      <article><span>Best forecast / implied</span><strong>{n(Math.max(0, ...(summary?.candidates ?? []).map((row) => Number(row.forecast_implied_ratio) || 0)), 2)}×</strong><small>hard gate {n(summary?.policy.forecastImpliedMinimum, 2)}×</small></article>
      <article><span>Primary rejection</span><strong>{label(summary?.rejectionDistribution[0]?.reason ?? "No rejection")}</strong><small>{summary?.rejectionDistribution[0]?.count ?? 0} evaluated names</small></article>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <div><h2>Live F&amp;O opportunity ranking</h2><p>Underlying movement rank comes first. An option recommendation appears only after structure economics and quote quality pass.</p></div>
        <div className={styles.filters}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter symbol" /><label><input type="checkbox" checked={onlyLive} onChange={(event) => setOnlyLive(event.target.checked)} /> Live shortlist</label></div>
      </div>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Volatility signal ranking"><table className={styles.ranking}>
        <thead><tr><th>Rank / underlying</th><th>Decision</th><th>MRS / LCS</th><th>Final readiness</th><th>Forecast vs implied</th><th>Structure</th><th>Expected P&amp;L</th><th>Contract quality</th><th>Why</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.underlying} data-selected={selected === row.underlying} onClick={() => setSelected(String(row.underlying))}>
          <td><b>#{row.movement_rank ?? "—"} {row.underlying}</b><small>{money(row.spot_price)} · {row.contract_count ?? 0} contracts</small></td>
          <td><strong data-tone={decisionTone(row.decision)}>{label(row.decision)}</strong><small>{label(row.confidence ?? row.data_status)}</small></td>
          <td>{n(row.movementReadinessScore)} / {n(row.liveConfirmationScore)}<small>minimum 55 / 60</small></td>
          <td><b data-tone={scoreTone(row.adjustedFinalReadinessScore)}>{n(row.adjustedFinalReadinessScore)}</b><small>gate 72</small></td>
          <td>{n(row.forecast_implied_ratio, 2)}×<small>P75 {pct(row.predicted_abs_move_p75)} · implied {pct(row.implied_move_pct)}</small></td>
          <td>{label(row.structure_type ?? "Not tested")}<small>{row.call_strike && row.put_strike ? `${row.put_strike} PE + ${row.call_strike} CE` : "Outside live top five"}</small></td>
          <td>{pct(row.expected_return_pct)}<small>PoP {pct(row.probability_profit)}</small></td>
          <td><b data-tone={scoreTone(row.contractQualityScore)}>{n(row.contractQualityScore)}</b><small>DQS {n(row.dataQualityScore)} · spread {pct(row.combined_spread_pct ?? row.average_spread_pct)}</small></td>
          <td><span className={styles.reason}>{label(row.hardGateFailures?.[0] ?? (row.candidate_id ? "All gates pass" : "Not in option test set"))}</span></td>
        </tr>)}</tbody>
      </table></div>
    </section>

    {detail && prediction && <>
      <section className={styles.stockHero}>
        <div>
          <span>Selected underlying · actual SmartAPI archive</span>
          <h2>{detail.symbol} <b>{money(chain[0]?.spot_price ?? prediction.spot_price)}</b></h2>
          <p>Decision fixed at {ist(prediction.decision_as_of)} · current chain captured {ist(detail.currentSnapshot.snapshot_ts)}. Current monitoring never rewrites the original signal.</p>
        </div>
        <div className={styles.stockDecision} data-tone={decisionTone(prediction.decision)}>
          <span>Model decision</span><strong>{label(prediction.decision ?? "Watch")}</strong><b>{selectedStructure}</b><small>{label(prediction.hardGateFailures?.[0] ?? "All gates pass")}</small>
        </div>
      </section>

      <section className={styles.twoCol}>
        <article className={styles.panel}><div className={styles.panelHead}><div><h2>Stock and future since the opening window</h2><p>Live monitoring snapshots from the archived chain.</p></div></div><EChartSurface className={styles.chart} ariaLabel={`${detail.symbol} spot and future history`} option={historyOption} /></article>
        <article className={styles.panel}>
          <div className={styles.panelHead}><div><h2>Decision anatomy</h2><p>Every score is bounded to 0–100; hard failures cannot be offset by a higher total.</p></div></div>
          <div className={styles.scoreStack}>
            <ScoreBar label="Movement readiness (MRS)" value={prediction.movementReadinessScore} threshold={55} />
            <ScoreBar label="Live confirmation (LCS)" value={prediction.liveConfirmationScore} threshold={60} />
            <ScoreBar label="Volatility value edge (VES)" value={prediction.valueEdgeScore} threshold={65} />
            <ScoreBar label="Contract quality (CQS)" value={prediction.contractQualityScore} threshold={70} />
            <ScoreBar label="Data quality (DQS)" value={prediction.dataQualityScore} threshold={80} />
            <ScoreBar label="Adjusted final readiness" value={prediction.adjustedFinalReadinessScore} threshold={72} />
          </div>
        </article>
      </section>

      <section className={styles.economics}>
        {[['Combined executable ask', money(prediction.combined_entry_ask), 'CE ask + PE ask'], ['Combined current bid', money(prediction.combined_mark_bid), 'Executable valuation'], ['Forecast / implied', `${n(prediction.forecast_implied_ratio, 2)}×`, `Gate ${n(detail.policy.forecastImpliedMinimum, 2)}×`], ['Expected net return', pct(prediction.expected_return_pct), 'Costs and slippage included'], ['Probability of profit', pct(prediction.probability_profit), `Gate ${pct(detail.policy.probabilityProfitMinimum)}`], ['P10 / P50 / P90', `${pct(prediction.pnl_p10)} / ${pct(prediction.pnl_p50)} / ${pct(prediction.pnl_p90)}`, '5,000 scenario distribution']].map(([title, value, note]) => <article key={title}><span>{title}</span><strong>{value}</strong><small>{note}</small></article>)}
      </section>

      <section className={styles.twoColWide}>
        <article className={styles.panel}><div className={styles.panelHead}><div><h2>Graphical option chain</h2><p>Calls above zero, puts below zero. OI change is derived against an earlier stored snapshot.</p></div></div><EChartSurface className={styles.chainChart} ariaLabel={`${detail.symbol} option chain open interest and volume`} option={chainOption} /></article>
        <article className={styles.panel}>
          <div className={styles.panelHead}><div><h2>Selected structure</h2><p>Executable quotes and modelled distribution at the immutable decision time.</p></div></div>
          {prediction.candidate_id ? <div className={styles.structure}>
            <strong>{label(prediction.structure_type)}</strong><h3>{selectedStructure}</h3>
            <div><span>Put ask<b>{money(prediction.put_ask)}</b></span><span>Call ask<b>{money(prediction.call_ask)}</b></span><span>Spread<b>{pct(prediction.combined_spread_pct)}</b></span><span>Premium at risk<b>{money(prediction.combined_entry_ask)}</b></span></div>
            <p>IV proxy: CE {pct(prediction.call_iv)} · PE {pct(prediction.put_iv)} · expected IV change {pct(prediction.predicted_iv_change)}.</p>
          </div> : <div className={styles.empty}>This stock was not among the five live names sent to option-structure evaluation. No premium or P&amp;L has been invented.</div>}
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><h2>Detailed current option chain</h2><p>{chain.length} actual contracts · expiry {chain[0]?.expiry ?? "unavailable"} · snapshot {ist(detail.currentSnapshot.snapshot_ts)}</p></div></div>
        <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Option chain"><table className={styles.chainTable}>
          <thead><tr><th>Type</th><th>Strike</th><th>Bid</th><th>Ask</th><th>Spread</th><th>Volume</th><th>OI</th><th>ΔOI (stored)</th><th>IV</th><th>Delta</th><th>Gamma</th><th>Theta</th><th>Vega</th><th>Depth imbalance</th><th>Quality</th></tr></thead>
          <tbody>{chain.map((row) => <tr key={row.symbol_token} data-selected={row.isSelectedCall || row.isSelectedPut}>
            <td><b data-side={row.right}>{row.right}</b></td><td>{n(row.strike, 2)}</td><td>{money(row.bid)}</td><td>{money(row.ask)}</td><td>{pct(row.spread_pct)}</td><td>{compact(row.volume)}</td><td>{compact(row.oi)}</td><td>{row.oiChange == null ? "—" : `${row.oiChange > 0 ? "+" : ""}${compact(row.oiChange)}`}</td><td>{pct(row.local_iv ?? row.broker_iv)}</td><td>{n(row.local_delta ?? row.broker_delta, 3)}</td><td>{n(row.local_gamma ?? row.broker_gamma, 4)}</td><td>{n(row.local_theta ?? row.broker_theta, 3)}</td><td>{n(row.local_vega ?? row.broker_vega, 3)}</td><td>{n(row.depth_imbalance, 3)}</td><td>{label(row.data_quality_status)}</td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <section className={styles.auditGrid}>
        <article className={styles.panel}><h2>Why this decision</h2><div className={styles.reasons}>{(prediction.hardGateFailures?.length ? prediction.hardGateFailures : ["ALL_HARD_GATES_PASS"]).map((reason: string) => <span key={reason} data-tone={reason === "ALL_HARD_GATES_PASS" ? "pass" : "fail"}>{label(reason)}</span>)}</div></article>
        <article className={styles.panel}><h2>Data provenance</h2>{Object.entries(detail.provenance).map(([key, value]) => <p key={key}><span>{label(key)}</span><b>{key.toLowerCase().includes("asof") ? ist(value) : String(value ?? "—")}</b></p>)}</article>
        <article className={styles.panel}><h2>Rejection pressure</h2>{(summary?.rejectionDistribution ?? []).slice(0, 6).map((row) => <div className={styles.reject} key={row.reason}><span>{label(row.reason)}</span><b>{row.count}</b><i style={{ width: `${row.count / maxRejection * 100}%` }} /></div>)}</article>
      </section>
    </>}
  </div>;
}
