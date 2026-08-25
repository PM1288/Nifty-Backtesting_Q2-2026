import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Ban, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchLongOptionsSummary, type LongOptionsSummary } from "../lib/api";
import {
  CompactEmptyState,
  DecisionHero,
  ErrorState,
  ExecutiveKpiStrip,
  LoadingSkeleton,
  MetricTile,
  ModuleStatusStrip,
} from "../design-system/WorkspacePrimitives";
import { LearnAboutThisAnalysis, PageHeader, RelatedJourney, SourceFreshness } from "../components/navigation/StrategicPrimitives";
import styles from "./LongOptionsPage.module.css";
import { matchesStockProfile, type StockProfileFilters, useProfileIndex } from "../lib/stockProfiles";
import { StockDistribution, StockIdentity, StockUniverseFilterBar } from "../components/stocks/StockProfileControls";

function n(input: unknown, digits = 2) {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "—";
}

function pct(input: unknown) {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? `${(parsed * (Math.abs(parsed) <= 1 ? 100 : 1)).toFixed(2)}%` : "—";
}

function money(input: unknown) {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(parsed) : "—";
}

function label(input: unknown) {
  return String(input ?? "—").replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export function LongOptionsPage() {
  const [data, setData] = useState<LongOptionsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState("ALL");
  const [selected, setSelected] = useState<Record<string, any> | null>(null);
  const [profileFilters, setProfileFilters] = useState<StockProfileFilters>({ universe: "FNO", capBucket: "ALL", sector: "ALL" });
  const profiles = useProfileIndex();

  useEffect(() => {
    let active = true;
    const load = () => fetchLongOptionsSummary().then((payload) => { if (active) { setData(payload); setError(null); } }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); }).finally(() => { if (active) setLoading(false); });
    load();
    const timer = window.setInterval(load, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selected]);

  const candidates = useMemo(() => (data?.candidates ?? []).filter((row) => (strategy === "ALL" || row.strategyType === strategy) && matchesStockProfile(profiles.bySymbol.get(String(row.underlying).toUpperCase()), profileFilters)), [data?.candidates, strategy, profileFilters, profiles.bySymbol]);

  if (loading) return <main className={styles.page}><LoadingSkeleton label="Loading Long Options strategy" rows={7} /></main>;
  if (error) return <main className={styles.page}><ErrorState title="Long Options could not be loaded" detail={error} /></main>;
  if (!data) return <main className={styles.page}><CompactEmptyState kind="NO_DATA" title="No Long Options evidence" detail="No current derivatives evaluation is available." /></main>;

  const ready = data.summary.readyStructures;
  const latestStatus = String(data.latestRun?.status ?? "NO_DATA");
  const qualityState = latestStatus === "COMPLETED" ? "READY" : latestStatus === "BLOCKED_DATA" ? "INCOMPLETE" : "DEGRADED";
  const best = candidates.slice().sort((a, b) => Number(b.adjustedScore ?? -1) - Number(a.adjustedScore ?? -1))[0];

  return <main className={styles.page}>
    <PageHeader
      breadcrumb={<><Link to="/strategy/oiis-live">Strategy</Link> / Long Options</>}
      title="Long-Only Options Router"
      context="Independent derivatives strategy · buy-to-open only · straddle and strangle PAPER · call and put shadow-disabled"
      quality={<SourceFreshness source="F&O volatility evidence + SmartAPI option chain" asOf={data.evidenceRun?.decision_as_of ?? data.generatedAt} state={qualityState} />}
    />

    <ModuleStatusStrip environment="PAPER" quality={{
      moduleId: "long-options",
      transport: "CONNECTED",
      freshness: qualityState === "READY" ? "CURRENT" : "STALE",
      readiness: qualityState as "READY" | "INCOMPLETE" | "DEGRADED",
      dataThrough: data.evidenceRun?.decision_as_of,
      source: "SmartAPI canonical PostgreSQL estate",
      message: "Opening SELL is prohibited. No live-order endpoint is connected.",
    }} context={<>Policy {data.strategyVersion} · fixed exit 15:10 IST · target ₹1,000 net after trading charges</>} />
    <StockUniverseFilterBar profiles={profiles.payload?.records ?? []} filters={profileFilters} onChange={setProfileFilters} count={candidates.length} />
    <StockDistribution profiles={candidates.map((row) => profiles.bySymbol.get(String(row.underlying).toUpperCase())).filter((item): item is NonNullable<typeof item> => Boolean(item))} />

    <DecisionHero
      eyebrow="CURRENT ROUTER DECISION"
      title={ready ? `${ready} long-premium structure${ready === 1 ? "" : "s"} pass every gate` : "NO TRADE — no structure passes every hard gate"}
      state={ready ? "APPROVED" : qualityState === "INCOMPLETE" ? "INCOMPLETE" : "BLOCKED"}
      reasons={<>{ready ? "Only fresh, coherent, two-sided ask/bid evidence can qualify." : "A weighted score cannot override stale quotes, one-sided markets, weak economics, liquidity, event or premium-risk gates."}</>}
      evidence={best ? <button type="button" onClick={() => setSelected(best)}>Inspect nearest structure <ArrowRight size={15} /></button> : undefined}
    />

    <ExecutiveKpiStrip>
      <MetricTile label="Full F&O universe" value={data.summary.fullFnoUniverse} scope={`${data.summary.premarketEvaluated} evaluated pre-market`} definition="Effective stock F&O universe requested by the source movement run; this is not the five-name live shortlist." />
      <MetricTile label="Pre-market shortlist" value={data.summary.premarketShortlist} scope={`${data.summary.liveEvaluated} names re-evaluated live`} definition="Movement ranker reduces the full universe before live option-chain evaluation." />
      <MetricTile label="Live shortlist" value={data.summary.liveShortlist} scope={`${data.summary.underlyings} with persisted structures`} definition="The package policy deliberately keeps only the top five live-confirmed movement candidates." />
      <MetricTile label="Option structures" value={data.summary.evaluatedStructures} scope={`${ready} READY · ${data.summary.rejectedStructures} rejected`} tone={ready ? "positive" : "warning"} definition="Straddles and strangles evaluated only for the live shortlist; failed evidence remains visible." />
    </ExecutiveKpiStrip>

    <section className={styles.router} aria-labelledby="router-title">
      <div><span>STRATEGY ROUTER</span><h2 id="router-title">Four routes, one safe default</h2><p>{data.summary.fullFnoUniverse} F&O stocks → {data.summary.premarketShortlist} pre-market movement names → {data.summary.liveShortlist} live-confirmed names → {data.summary.evaluatedStructures} option structures. Five is the governed live shortlist, not the total F&O universe.</p></div>
      <div className={styles.routeGrid}>
        <article><strong>ATM straddle</strong><em className={styles.paper}>PAPER</em><p>Buy CE + PE at the same forward-ATM strike.</p></article>
        <article><strong>Delta strangle</strong><em className={styles.paper}>PAPER</em><p>Buy liquid 25–35 delta wings at the same expiry.</p></article>
        <article><strong>Long call</strong><em className={styles.shadow}>SHADOW DISABLED</em><p>Calculated for audit; direction AUC has not passed promotion.</p></article>
        <article><strong>Long put</strong><em className={styles.shadow}>SHADOW DISABLED</em><p>Calculated for audit; no paper group may be created.</p></article>
      </div>
    </section>

    <section className={styles.surface} aria-labelledby="candidate-title">
      <header><div><span>EXECUTABLE EVIDENCE</span><h2 id="candidate-title">Current structures and hard gates</h2><p>Entry is valued at asks; monitoring and exit use bids. LTP and midpoint cannot trigger the ₹1,000 target.</p></div>
        <div className={styles.filters} aria-label="Filter strategy">
          {["ALL", "BUY_ATM_STRADDLE", "BUY_DELTA_STRANGLE"].map((item) => <button key={item} type="button" className={strategy === item ? styles.active : ""} onClick={() => setStrategy(item)}>{item === "ALL" ? "All" : label(item)}</button>)}
        </div>
      </header>
      {!candidates.length ? <CompactEmptyState kind="NO_RESULT" title="No structures in this evidence run" detail="The latest useful live run did not persist any structures for this filter." /> : <div className={styles.tableWrap}><table><thead><tr><th>Underlying / structure</th><th>Expiry / strikes</th><th>Executable market</th><th>Premium risk</th><th>Scores D/M/L/V/C</th><th>P(net ≥ ₹1,000)</th><th>Decision</th></tr></thead><tbody>{candidates.map((row) => <tr key={String(row.candidate_id)} tabIndex={0} onClick={() => setSelected(row)} onKeyDown={(event) => { if (event.key === "Enter") setSelected(row); }}>
        <td><StockIdentity symbol={row.underlying} profile={profiles.bySymbol.get(String(row.underlying).toUpperCase())} /><small>{label(row.strategyType)}</small></td>
        <td><strong>{String(row.expiry ?? "—").slice(0, 10)}</strong><small>CE {n(row.call_strike, 0)} · PE {n(row.put_strike, 0)} · lot {n(row.lot_size, 0)}</small></td>
        <td><strong>Ask {money(row.combined_entry_ask)}</strong><small>Bid {money(row.combined_mark_bid)} · spread {pct(row.combined_spread_pct)}</small></td>
        <td><strong>{money(row.premiumRiskInr)}</strong><small>Expected net {money(row.expectedNetAfterChargesInr)}</small></td>
        <td><strong>{n(row.dqs, 0)} / {n(row.mrs, 0)} / {n(row.lcs, 0)}</strong><small>{n(row.ves, 0)} / {n(row.cqs, 0)} · final {n(row.adjustedScore, 0)}</small></td>
        <td><strong>{pct(row.probabilityNetGe1000)}</strong><small>Model {row.targetProbabilityModel ?? "—"}</small></td>
        <td><span className={row.decision === "READY" ? styles.ready : styles.noTrade}>{row.decision === "READY" ? <ShieldCheck size={15} /> : <Ban size={15} />}{label(row.decision)}</span><small>{(row.hardGateFailures ?? []).length} gate reason(s)</small></td>
      </tr>)}</tbody></table></div>}
    </section>

    <section className={styles.failures} aria-labelledby="failures-title"><header><AlertTriangle /><div><span>FAIL-CLOSED EVIDENCE</span><h2 id="failures-title">Most frequent rejection reasons</h2></div></header><div>{data.rejectionDistribution.slice(0, 12).map((item) => <article key={item.reason}><strong>{label(item.reason)}</strong><span>{item.count}</span></article>)}</div></section>

    <RelatedJourney items={[
      { id: "options", title: "Options Intelligence", detail: "Inspect current stock-chain depth, IV and OI", to: "/options/intelligence", status: "Live evidence" },
      { id: "volatility", title: "F&O Volatility Signals", detail: "Review the source movement shortlist", to: "/options/volatility-signals", status: "Source layer" },
      { id: "futures", title: "Futures", detail: "Inspect basis, OI, liquidity and buildup", to: "/futures", status: "Context" },
      { id: "quality", title: "Data Quality", detail: "Investigate stale or incomplete option evidence", to: "/analytics/system/quality", status: qualityState },
    ]} />

    <LearnAboutThisAnalysis sections={[
      { id: "read", title: "How to read this page", content: <p>READY means every configured data, ranking, live-confirmation, liquidity, value and risk gate passed for PAPER evaluation. NO TRADE is the safe default.</p> },
      { id: "methodology", title: "Methodology and calculation rules", content: <p>DQS protects data integrity; MRS ranks expected movement; LCS confirms the opening session; VES tests option economics; CQS tests exact-contract executability. Entry uses asks and exits use bids.</p> },
      { id: "definitions", title: "Definitions", content: <p>A straddle buys CE and PE at one strike. A strangle buys separate OTM CE and PE strikes. Every opening leg is BUY and every close is SELL.</p> },
      { id: "sources", title: "Data sources and freshness", content: <p>Movement evidence comes from the existing F&O volatility run. Contract evidence comes from the SmartAPI option-chain archive and effective derivative token plan. OIIS and Rolling Monthly are not queried.</p> },
      { id: "limitations", title: "Limitations and assumptions", content: <p>Historical depth and expired chains before capture began cannot be reconstructed. Directional calls and puts remain disabled because recent direction AUC was approximately 0.52. The target probability is an approximation until a calibrated long-options scenario registry is persisted.</p> },
      { id: "version", title: "Formula and policy version", content: <p>LONG_ONLY_OPTIONS_ROUTER v2.0.0 · PAPER/SHADOW/REPLAY only · no automatic live broker orders.</p> },
    ]} />

    {selected ? <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="long-option-detail-title"><button className={styles.close} type="button" onClick={() => setSelected(null)} aria-label="Close detail">×</button><span>{selected.enabledState}</span><h2 id="long-option-detail-title">{selected.underlying} · {label(selected.strategyType)}</h2><p>{String(selected.expiry ?? "—").slice(0, 10)} · CE {n(selected.call_strike, 0)} / PE {n(selected.put_strike, 0)} · lot {n(selected.lot_size, 0)}</p><div className={styles.detailGrid}><dl><dt>Entry asks</dt><dd>CE {money(selected.call_ask)} · PE {money(selected.put_ask)}</dd><dt>Exit marks</dt><dd>CE {money(selected.call_bid)} · PE {money(selected.put_bid)}</dd><dt>Combined spread</dt><dd>{pct(selected.combined_spread_pct)}</dd><dt>Quote age</dt><dd>{n(selected.quote_age_seconds, 0)} seconds</dd></dl><dl><dt>Premium risk</dt><dd>{money(selected.premiumRiskInr)}</dd><dt>Expected net</dt><dd>{money(selected.expectedNetAfterChargesInr)}</dd><dt>P(net ≥ ₹1,000)</dt><dd>{pct(selected.probabilityNetGe1000)}</dd><dt>Final score</dt><dd>{n(selected.adjustedScore, 2)}</dd></dl></div><h3>Hard-gate evidence</h3><ul>{(selected.hardGateFailures ?? []).map((reason: string) => <li key={reason}>{label(reason)}</li>)}</ul><p className={styles.safety}><ShieldCheck size={16} /> PAPER only · opening BUY · closing SELL · no live-order connection</p><Link to={`/options/intelligence?symbol=${encodeURIComponent(selected.underlying)}`}>Open underlying option evidence <ArrowRight size={15} /></Link></aside></div> : null}
  </main>;
}
