import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, BookOpen, Database, ShieldCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchNiftyOptionsSummary, type NiftyOptionsSummary, type NiftyOptionsSurface } from "../lib/api";
import { CompactEmptyState, DecisionHero, ErrorState, ExecutiveKpiStrip, LoadingSkeleton, MetricTile, ModuleStatusStrip } from "../design-system/WorkspacePrimitives";
import { LearnAboutThisAnalysis, PageHeader, RelatedJourney, SourceFreshness } from "../components/navigation/StrategicPrimitives";
import styles from "./NiftyWeeklyOptionsPage.module.css";

const VIEWS = ["command", "weekly", "monthly", "chain", "paper", "validation"] as const;
type View = typeof VIEWS[number];

function money(input: unknown) {
  if (input == null || input === "") return "—";
  const parsed = Number(input);
  return Number.isFinite(parsed) ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(parsed) : "—";
}
function n(input: unknown, digits = 2) {
  if (input == null || input === "") return "—";
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed.toFixed(Math.min(digits, 2)) : "—";
}
function pct(input: unknown) {
  if (input == null || input === "") return "—";
  const parsed = Number(input);
  return Number.isFinite(parsed) ? `${(Math.abs(parsed) <= 1 ? parsed * 100 : parsed).toFixed(2)}%` : "—";
}
function label(input: unknown) {
  return String(input ?? "—").replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
function compactInteger(input: unknown) {
  if (input == null || input === "") return "—";
  const parsed = Number(input);
  return Number.isFinite(parsed) ? new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 }).format(parsed) : "—";
}
function signedInteger(input: unknown) {
  if (input == null || input === "") return "—";
  const parsed = Number(input);
  return Number.isFinite(parsed) ? `${parsed > 0 ? "+" : ""}${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(parsed)}` : "—";
}

function SurfaceOverview({ surface, title }: { surface: NiftyOptionsSurface | null; title: string }) {
  if (!surface?.snapshot) return <CompactEmptyState kind="NO_DATA" title={`${title} chain has not been captured`} detail={surface?.expiryDate ? `The effective expiry is ${surface.expiryDate}. The collector is configured to archive this surface during the next valid NSE session; no weekly proxy is substituted.` : "No effective contract is available."} />;
  const snapshot = surface.snapshot;
  const oi = surface.oiAnalytics;
  return <div className={styles.surfaceStack}>
    <ExecutiveKpiStrip>
      <MetricTile label={`${surface.expiryRole} expiry`} value={snapshot.expiryDate} scope={`${snapshot.sessionsRemaining} trading sessions remaining`} definition="Effective-dated NIFTY expiry from the contract master." />
      <MetricTile label="NIFTY spot" value={n(snapshot.spot)} scope={`ATM ${n(snapshot.atmStrike, 0)}`} definition="Underlying value stored with this exact NSE option-chain snapshot." />
      <MetricTile label="Lot size" value={snapshot.lotSize} scope="SmartAPI NFO master" definition="Quantity comes from effective contract metadata, not a UI constant." />
      <MetricTile label="Two-sided coverage" value={`${snapshot.twoSidedLegCount}/${snapshot.totalLegCount}`} scope={`${snapshot.strikeCount} strikes`} tone={snapshot.twoSidedLegCount === snapshot.totalLegCount ? "positive" : "warning"} definition="Legs with a positive bid and ask." />
    </ExecutiveKpiStrip>
    {oi ? <section className={styles.oiPanel}>
      <header><div><span>POSITIONING</span><h2>OI walls and movement</h2><p>{label(oi.interpretation)} · ATM-window evidence, not full-chain PCR.</p></div><small>{oi.coverage.callLegs} CE + {oi.coverage.putLegs} PE</small></header>
      <div className={styles.oiGrid}>
        <div><span>Call OI</span><strong>{compactInteger(oi.totals.ceOi)}</strong><small>ΔOI {signedInteger(oi.totals.ceDayChange)}</small></div>
        <div><span>Put OI</span><strong>{compactInteger(oi.totals.peOi)}</strong><small>ΔOI {signedInteger(oi.totals.peDayChange)}</small></div>
        <div><span>Window PCR</span><strong>{n(oi.totals.pcr)}</strong><small>Displayed strikes only</small></div>
        <div><span>10-minute evidence</span><strong>{oi.comparison ? `${n(oi.comparison.actualMinutes)} min` : "—"}</strong><small>{oi.comparison ? `CE ${signedInteger(oi.comparison.ceOiChange)} · PE ${signedInteger(oi.comparison.peOiChange)}` : "No comparable snapshot"}</small></div>
      </div>
      <div className={styles.wallGrid}><div><span>Call wall</span><strong>{n(oi.walls.call?.strike, 0)}</strong><small>{compactInteger(oi.walls.call?.oi)} OI</small></div><div><span>Put wall</span><strong>{n(oi.walls.put?.strike, 0)}</strong><small>{compactInteger(oi.walls.put?.oi)} OI</small></div></div>
    </section> : null}
    <section className={styles.structures}><header><div><span>LONG-PREMIUM ROUTER</span><h2>Candidate structures</h2><p>Entry uses asks. Marks and exits use bids. Every opening leg is BUY.</p></div><small>Shadow only</small></header>
      <div className={styles.structureGrid}>{surface.structures.map((structure: any) => <article key={structure.structureType}><div><strong>{label(structure.structureType)}</strong><em><Ban size={14} /> No trade</em></div><dl>
        <div><dt>CE / PE</dt><dd>{n(structure.call?.strike, 0)} / {n(structure.put?.strike, 0)}</dd></div><div><dt>Ask / bid</dt><dd>{money(structure.combinedAsk)} / {money(structure.combinedBid)}</dd></div><div><dt>Premium risk</dt><dd>{money(structure.premiumRiskInr)}</dd></div><div><dt>Spread</dt><dd>{pct(structure.combinedSpreadPct)}</dd></div><div><dt>Forecast / implied</dt><dd>{n(structure.expectedMovePoints)} / {n(structure.impliedMovePoints)} pts</dd></div><div><dt>₹1,000 net bid</dt><dd>{money(structure.targetCombinedBid)}</dd></div>
      </dl><div className={styles.reasons}>{structure.hardGateFailures.map((reason: string) => <span key={reason}>{label(reason)}</span>)}</div></article>)}</div>
    </section>
  </div>;
}

function ChainTable({ surface }: { surface: NiftyOptionsSurface | null }) {
  if (!surface?.snapshot) return <CompactEmptyState kind="NO_DATA" title={`${surface?.expiryRole ?? "Selected"} chain unavailable`} detail="No static or synthetic strike values are shown." />;
  return <section className={styles.ladder}><header><div><span>{surface.expiryRole} CHAIN & SURFACE</span><h2>Strike evidence around ATM</h2><p>Bid, ask, IV, delta, volume, OI and OI change share one snapshot cohort.</p></div><ShieldCheck /></header><div className={styles.tableWrap}><table><thead><tr><th>CE OI / ΔOI / volume</th><th>CE bid–ask</th><th>CE IV / delta</th><th>Strike</th><th>PE IV / delta</th><th>PE bid–ask</th><th>PE OI / ΔOI / volume</th></tr></thead><tbody>{(surface.strikeLadder ?? []).map((row: any) => <tr key={row.strike} data-atm={row.atm}><td>{compactInteger(row.call?.oi)} / {signedInteger(row.call?.changeOi)} / {compactInteger(row.call?.volume)}</td><td>{money(row.call?.bid)} – {money(row.call?.ask)}</td><td>{n(row.call?.iv)} / {n(row.call?.delta)}</td><th>{n(row.strike, 0)}{row.atm ? <small> ATM</small> : null}</th><td>{n(row.put?.iv)} / {n(row.put?.delta)}</td><td>{money(row.put?.bid)} – {money(row.put?.ask)}</td><td>{compactInteger(row.put?.oi)} / {signedInteger(row.put?.changeOi)} / {compactInteger(row.put?.volume)}</td></tr>)}</tbody></table></div></section>;
}

export function NiftyWeeklyOptionsPage() {
  const [data, setData] = useState<NiftyOptionsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const view = VIEWS.includes(params.get("view") as View) ? params.get("view") as View : "command";
  const [chainRole, setChainRole] = useState<"W0" | "M0">("W0");
  useEffect(() => { let active = true; const load = () => fetchNiftyOptionsSummary().then((value) => { if (active) { setData(value); setError(null); } }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); }).finally(() => { if (active) setLoading(false); }); load(); const timer = window.setInterval(load, 30_000); return () => { active = false; window.clearInterval(timer); }; }, []);
  const latest = useMemo(() => [data?.weekly?.snapshot, data?.monthly?.snapshot].filter(Boolean).map((item) => item!.capturedAt).sort().at(-1) ?? null, [data]);
  if (loading) return <main className={styles.page}><LoadingSkeleton label="Loading NIFTY Options command centre" rows={8} /></main>;
  if (error || !data) return <main className={styles.page}><ErrorState title="NIFTY Options could not be loaded" detail={error ?? "No response"} /></main>;
  const quality = data.state === "NO_TRADE" ? "DEGRADED" : "INCOMPLETE";
  const selectedSurface = chainRole === "W0" ? data.weekly : data.monthly;
  return <main className={styles.page}>
    <PageHeader breadcrumb={<><Link to="/strategy/oiis-live">Strategy</Link> / NIFTY Options</>} title="NIFTY Weekly & Monthly Options" context="Independent NIFTY long-premium research · W0 and M0 · SHADOW_NO_TRADE · no live or paper order path" quality={<SourceFreshness source="NSE watcher + SmartAPI contract master" asOf={latest} state={quality} />} />
    <ModuleStatusStrip environment="PAPER" quality={{ moduleId: "nifty-options", transport: "CONNECTED", freshness: latest ? "DELAYED" : "UNKNOWN", readiness: quality, dataThrough: latest ?? undefined, source: "NSE W0/M0 chain + SmartAPI instruments", message: "Opening SELL, option writing, paper submission and live orders are disabled." }} context={<>W0 {data.expiryRegistry.W0 ?? "—"} · M0 {data.expiryRegistry.M0 ?? "—"} · Policy {data.strategyVersion}</>} />
    <nav className={styles.tabs} aria-label="NIFTY Options views">{VIEWS.map((item) => <button key={item} type="button" data-active={view === item} onClick={() => setParams(item === "command" ? {} : { view: item })}>{({ command: "Command Centre", weekly: "Weekly", monthly: "Monthly", chain: "Chain & Surface", paper: "Paper Book", validation: "Validation & Health" } as const)[item]}</button>)}</nav>

    {view === "command" ? <>
      <DecisionHero eyebrow="NIFTY OPTIONS ROUTER" title={data.state === "NO_DATA" ? "INCOMPLETE — no captured NIFTY chain" : "NO TRADE — evidence is visible, authorisation is blocked"} state="BLOCKED" reasons={<>The W0 and M0 surfaces are evaluated independently. Target-hit probability and final readiness scores are not calibrated, so no descriptive proxy can authorise a trade.</>} />
      <ExecutiveKpiStrip><MetricTile label="Weekly W0" value={data.expiryRegistry.W0 ?? "—"} scope={data.weekly.snapshot ? `${data.weekly.snapshot.strikeCount} strikes captured` : "Collection pending"} /><MetricTile label="Monthly M0" value={data.expiryRegistry.M0 ?? "—"} scope={data.monthly?.snapshot ? `${data.monthly.snapshot.strikeCount} strikes captured` : "Independent surface missing"} tone={data.monthly?.snapshot ? "positive" : "warning"} /><MetricTile label="NIFTY lot" value={data.expiryRegistry.contracts[0]?.lotSize ?? "—"} scope="Effective SmartAPI master" /><MetricTile label="Calibration" value="Not calibrated" scope="Scores intentionally unavailable" tone="warning" /></ExecutiveKpiStrip>
      <section className={styles.commandGrid}><article><span>W0 WEEKLY</span><h2>{data.weekly.snapshot ? "Chain available" : "No chain"}</h2><p>{data.weekly.snapshot ? `${data.weekly.snapshot.strikeCount} strikes · ${data.weekly.snapshot.twoSidedLegCount}/${data.weekly.snapshot.totalLegCount} two-sided legs.` : "Collector has not retained the current weekly surface."}</p><button onClick={() => setParams({ view: "weekly" })}>Inspect weekly</button></article><article><span>M0 MONTHLY</span><h2>{data.monthly?.snapshot ? "Chain available" : "Collection gap"}</h2><p>{data.monthly?.snapshot ? `${data.monthly.snapshot.strikeCount} strikes · ${data.monthly.snapshot.twoSidedLegCount}/${data.monthly.snapshot.totalLegCount} two-sided legs.` : "The front-month contract exists, but a canonical NSE monthly snapshot has not yet been captured."}</p><button onClick={() => setParams({ view: "monthly" })}>Inspect monthly</button></article></section>
      <section className={styles.scorePanel}><header><div><span>DECISION FUNNEL</span><h2>Scores remain unavailable until calibration</h2></div><Ban /></header><div className={styles.scoreGrid}>{["DQS", "MRS", "LCS", "DES", "VES", "CQS", "ECS", "TFS", "FRS"].map((score) => <div key={score}><span>{score}</span><strong>—</strong><small>Not calibrated</small></div>)}</div><p>{data.scorecard.reason}</p></section>
    </> : null}
    {view === "weekly" ? <SurfaceOverview surface={data.weekly} title="Weekly W0" /> : null}
    {view === "monthly" ? <SurfaceOverview surface={data.monthly} title="Monthly M0" /> : null}
    {view === "chain" ? <><div className={styles.roleToggle}><button data-active={chainRole === "W0"} onClick={() => setChainRole("W0")}>W0 · {data.expiryRegistry.W0 ?? "—"}</button><button data-active={chainRole === "M0"} onClick={() => setChainRole("M0")}>M0 · {data.expiryRegistry.M0 ?? "—"}</button></div><ChainTable surface={selectedSurface} /></> : null}
    {view === "paper" ? <section className={styles.statePanel}><BookOpen /><div><span>PAPER BOOK</span><h2>No NIFTY option paper groups</h2><p>{data.paperBook.message}</p><strong>{label(data.paperBook.state)}</strong></div></section> : null}
    {view === "validation" ? <><section className={styles.validationGrid}><div><span>Retained snapshots</span><strong>{data.validation.snapshotCount.toLocaleString("en-IN")}</strong><small>Need point-in-time W0/M0 history</small></div><div><span>Observed expiries</span><strong>{data.validation.expiryCycles}</strong><small>Minimum 12 weekly + 6 monthly cycles</small></div><div><span>History start</span><strong>{data.validation.firstCapturedAt ? new Date(data.validation.firstCapturedAt).toLocaleDateString("en-IN") : "—"}</strong><small>{label(data.validation.state)}</small></div><div><span>Evaluated structures</span><strong>—</strong><small>Minimum {data.validation.minimumEvaluatedStructures}</small></div></section><section className={styles.sources}><header><Database /><div><span>PROVIDER MATRIX</span><h2>Authority, wiring and freshness</h2></div></header>{data.sources.map((source) => <div key={source.id}><strong>{label(source.id)}</strong><p>{source.role}</p><span data-status={source.status}>{label(source.status)}</span><small>{source.dataAsOf ? new Date(source.dataAsOf).toLocaleString("en-IN") : "No source timestamp"}</small></div>)}</section></> : null}

    <section className={styles.warning}><AlertTriangle /><p><strong>Safety boundary:</strong> all opening legs are BUY and all closing legs are SELL-to-close. The dashboard never writes to Paper Trading or a live broker. Missing monthly history, execution-depth evidence and calibration remain visible blockers.</p></section>
    <RelatedJourney items={[{ id: "overview", title: "Options Overview", detail: "Inspect general NIFTY option structure", to: "/options/intelligence", status: "Derivatives context" }, { id: "futures", title: "NIFTY Futures", detail: "Review basis, OI and price context", to: "/futures", status: "Market context" }, { id: "quality", title: "Data Quality", detail: "Inspect chain collection and freshness issues", to: "/analytics/system/quality", status: quality }]} />
    <LearnAboutThisAnalysis sections={[{ id: "read", title: "How to read this strategy", content: <p>W0 is the nearest weekly expiry. M0 is the last expiry in the front available contract month. When both resolve to the same physical expiry the system uses one surface and does not double count it.</p> }, { id: "methodology", title: "Methodology and target", content: <p>Structures are long-premium only. Entry economics use executable asks; marks and exits use executable bids. The displayed target is ₹1,000 net after estimated full round-trip charges, not a guaranteed return.</p> }, { id: "sources", title: "Data sources and freshness", content: <p>NSE watcher data is canonical for the focused chain. SmartAPI supplies effective contract identity and lot size. Exact selected-leg SmartAPI quote and depth revalidation is required before future paper promotion.</p> }, { id: "limitations", title: "Limitations and promotion gates", content: <p>The module remains SHADOW_NO_TRADE until at least 60 forward sessions, 12 weekly cycles, 6 monthly cycles, 500 evaluated structures and probability calibration are complete. Unavailable values remain shown as —.</p> }]} />
  </main>;
}
