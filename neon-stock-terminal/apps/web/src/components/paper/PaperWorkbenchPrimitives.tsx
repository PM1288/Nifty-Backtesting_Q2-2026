import type { ReactNode } from "react";
import {
  PAPER_METRIC_DEFINITIONS,
  PAPER_WORKBENCH_SECTIONS,
  type PaperAccountingClass,
  type PaperMetricDefinition,
  type PaperWorkbenchContext,
  type PaperWorkbenchSection,
} from "../../lib/paperWorkbench";
import styles from "./PaperWorkbenchPrimitives.module.css";

const money = (value: unknown) => value == null || !Number.isFinite(Number(value))
  ? "—"
  : `${Number(value) < 0 ? "−" : ""}₹${Math.abs(Number(value)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function AccountingClassBadge({ value }: { value: PaperAccountingClass }) {
  return <span className={styles.accountingBadge} data-accounting={value}>{value.replace("_", " ")}</span>;
}

export function MetricDefinitionPopover({ definition }: { definition: PaperMetricDefinition }) {
  return (
    <details className={styles.definitionPopover}>
      <summary aria-label={`Define ${definition.label}`}>i</summary>
      <div>
        <header><strong>{definition.label}</strong><AccountingClassBadge value={definition.accountingClass} /></header>
        <p>{definition.plainLanguageMeaning}</p>
        {definition.formula ? <dl><dt>Formula</dt><dd>{definition.formula}</dd></dl> : null}
        <dl><dt>Source</dt><dd>{definition.dataSource}</dd></dl>
        <dl><dt>Time basis</dt><dd>{definition.timeBasis ?? "Not applicable"}</dd></dl>
        <dl><dt>Capital basis</dt><dd>{definition.capitalBasis ?? "Not applicable"}</dd></dl>
        <dl><dt>Cost basis</dt><dd>{definition.costBasis.replace("_", " ")}</dd></dl>
        {definition.eligibilityRule ? <dl><dt>Eligibility</dt><dd>{definition.eligibilityRule}</dd></dl> : null}
        {definition.caveats?.map((caveat) => <small key={caveat}>Limit: {caveat}</small>)}
      </div>
    </details>
  );
}

export function WorkbenchMetric({ definition, value, detail, asOf, tone = "neutral", onInspect }: { definition: PaperMetricDefinition; value: ReactNode; detail: ReactNode; asOf: string; tone?: "positive" | "negative" | "warning" | "neutral"; onInspect?: () => void }) {
  return (
    <article className={styles.workbenchMetric} data-tone={tone}>
      <header><span>{definition.label}</span><MetricDefinitionPopover definition={definition} /></header>
      <AccountingClassBadge value={definition.accountingClass} />
      <strong>{value}</strong>
      <p>{detail}</p>
      <footer><small>As of {asOf} IST · {definition.costBasis.toLowerCase()}</small>{onInspect ? <button type="button" onClick={onInspect}>Trace</button> : null}</footer>
    </article>
  );
}

export function PaperWorkbenchHeader({ tradeCount, openCount, trackCount, incidentCount, asOf, version, onAdd, onExport, onSave, calm, onCalm }: { tradeCount: number; openCount: number; trackCount: number; incidentCount: number; asOf: string; version: string; onAdd: () => void; onExport: () => void; onSave: () => void; calm: boolean; onCalm: () => void }) {
  return (
    <header className={styles.workbenchHeader}>
      <div>
        <span className={styles.paperBoundary}>PAPER / HYPOTHETICAL · NO BROKER ORDER</span>
        <h1>Paper Trading Evidence Workbench</h1>
        <p>Reconcile booked execution, open marks, observed paths, counterfactuals and capital simulations without mixing their accounting meaning.</p>
      </div>
      <div className={styles.headerFacts}>
        <span><b>{tradeCount}</b> trades</span><span><b>{openCount}</b> open positions</span><span><b>{trackCount}</b> analytical tracks</span><span data-warning={incidentCount > 0}><b>{incidentCount}</b> incidents</span>
        <small>Ledger {asOf} IST · policy {version}</small>
      </div>
      <div className={styles.headerActions}>
        <button type="button" onClick={onCalm}>{calm ? "Motion paused" : "Calm motion"}</button>
        <button type="button" onClick={onSave}>Save view</button>
        <button type="button" onClick={onExport}>Export view</button>
        <button type="button" className={styles.primaryAction} onClick={onAdd}>＋ Add paper trade</button>
      </div>
    </header>
  );
}

export function PaperWorkbenchSubnav({ active, counts, onSelect }: { active: PaperWorkbenchSection; counts: Partial<Record<PaperWorkbenchSection, string>>; onSelect: (section: PaperWorkbenchSection) => void }) {
  return (
    <nav className={styles.subnav} aria-label="Paper Trading workbench sections">
      {PAPER_WORKBENCH_SECTIONS.map((section) => <button key={section.id} type="button" data-active={active === section.id} aria-current={active === section.id ? "page" : undefined} onClick={() => onSelect(section.id)}><span>{section.label}</span>{counts[section.id] ? <small>{counts[section.id]}</small> : null}</button>)}
    </nav>
  );
}

export function AnalysisContextBar({ context, strategyOptions, appliedCount, asOf, classificationFilters, onChange, onClear, onLoadSaved, onCopy, onExport }: { context: PaperWorkbenchContext; strategyOptions: string[]; appliedCount: number; asOf: string; classificationFilters?: ReactNode; onChange: <K extends keyof PaperWorkbenchContext>(key: K, value: PaperWorkbenchContext[K]) => void; onClear: () => void; onLoadSaved: () => void; onCopy: () => void; onExport: () => void }) {
  return (
    <section className={styles.contextBar} aria-label="Analysis context">
      <div className={styles.contextTitle}><span>ANALYSIS CONTEXT</span><strong>{appliedCount ? `${appliedCount} filters applied` : "All canonical paper evidence"}</strong><small>As of {asOf} IST</small></div>
      <label><span>Period</span><select value={context.period} onChange={(event) => onChange("period", event.target.value as PaperWorkbenchContext["period"])}><option>7D</option><option>30D</option><option>90D</option><option>ALL</option></select></label>
      <label><span>Strategy</span><select value={context.strategy} onChange={(event) => onChange("strategy", event.target.value)}><option value="ALL">All strategies</option>{strategyOptions.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
      <label><span>Status</span><select value={context.status} onChange={(event) => onChange("status", event.target.value)}><option value="ALL">All status</option><option value="OPEN">Open actual</option><option value="CLOSED">Closed/booked</option><option value="ATTENTION">Needs attention</option><option value="DEVELOPING">Developing</option></select></label>
      <label><span>Direction</span><select value={context.direction} onChange={(event) => onChange("direction", event.target.value as PaperWorkbenchContext["direction"])}><option value="ALL">Long + short</option><option value="BUY">Long</option><option value="SELL">Short</option></select></label>
      <label><span>Horizon</span><select value={context.horizon} onChange={(event) => onChange("horizon", event.target.value as PaperWorkbenchContext["horizon"])}><option>Intraday</option><option>5D</option><option>30D</option></select></label>
      <label><span>Accounting</span><select value={context.accounting} onChange={(event) => onChange("accounting", event.target.value as PaperWorkbenchContext["accounting"])}><option value="ALL">All classes</option><option value="BOOKED">Booked</option><option value="OPEN_ACTUAL">Open actual</option><option value="OBSERVED">Observed</option><option value="HYPOTHETICAL">Hypothetical</option><option value="SIMULATED">Simulated</option><option value="DATA_QUALITY">Data quality</option></select></label>
      <label><span>Capital</span><select value={context.capital} onChange={(event) => onChange("capital", event.target.value as PaperWorkbenchContext["capital"])}><option value="ALL">All bases</option><option value="FNO_QTY">F&amp;O quantity</option><option value="FIXED_2L">Fixed ₹2L</option><option value="FIXED_10L">Fixed ₹10L</option></select></label>
      <label><span>Costs</span><select value={context.basis} onChange={(event) => onChange("basis", event.target.value as PaperWorkbenchContext["basis"])}><option value="ALL">Gross + net</option><option value="GROSS">Gross</option><option value="NET">Net</option></select></label>
      {classificationFilters}
      <div className={styles.contextActions}><button type="button" onClick={onClear}>Clear</button><button type="button" onClick={onLoadSaved}>Load saved</button><button type="button" onClick={onCopy}>Copy link</button><button type="button" onClick={onExport}>Export</button><MetricDefinitionPopover definition={PAPER_METRIC_DEFINITIONS.dataFreshness} /></div>
    </section>
  );
}

export function AccountingLaneOverview({ summary, tradeCount, asOf, accounting = "ALL", onTrace, onNavigate }: { summary: Record<string, unknown>; tradeCount: number; asOf: string; accounting?: PaperAccountingClass | "ALL"; onTrace: (definition: PaperMetricDefinition, value: unknown, inputs: Record<string, unknown>) => void; onNavigate: (section: PaperWorkbenchSection) => void }) {
  const formatAsOf = new Date(asOf).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const lanes = [
    { definition: PAPER_METRIC_DEFINITIONS.bookedRealisedNet, value: summary.realised_pnl, detail: `${summary.closed_groups ?? 0} closed trade groups`, tone: Number(summary.realised_pnl) >= 0 ? "positive" : "negative", section: "trade-evidence" as const },
    { definition: PAPER_METRIC_DEFINITIONS.openUnrealisedGross, value: summary.unrealised_pnl, detail: `${summary.open_positions ?? 0} positions remain open`, tone: Number(summary.unrealised_pnl) >= 0 ? "positive" : "negative", section: "trade-evidence" as const },
    { definition: PAPER_METRIC_DEFINITIONS.mfe30d, value: summary.analytical_upside, detail: `Maximum favourable value across ${tradeCount} paths`, tone: "positive", section: "reward-pain" as const },
    { definition: PAPER_METRIC_DEFINITIONS.neverClosedCarry, value: summary.never_closed_carry ?? null, detail: "Inspect per-trade counterfactuals; never combined with booked accounting", tone: "warning", section: "trade-evidence" as const },
    { definition: PAPER_METRIC_DEFINITIONS.fixed10lSimulation, value: null, detail: "Four allocation levels for each isolated entry-strategy ledger", tone: "neutral", section: "capital-recycling" as const },
    { definition: PAPER_METRIC_DEFINITIONS.dataFreshness, value: summary.open_data_incidents ?? 0, detail: `${summary.mature_trade_count ?? 0}/${tradeCount} five-session mature`, tone: Number(summary.open_data_incidents) > 0 ? "negative" : "neutral", section: "methodology-audit" as const },
  ];
  const visibleLanes = accounting === "ALL" ? lanes : lanes.filter((lane) => lane.definition.accountingClass === accounting);
  return <section className={styles.accountingLanes} aria-label="Accounting lane summary">{visibleLanes.length ? visibleLanes.map((lane) => <WorkbenchMetric key={lane.definition.id} definition={lane.definition} value={lane.value == null ? "Inspect evidence" : lane.definition.unit === "INR" ? money(lane.value) : String(lane.value)} detail={lane.detail} asOf={formatAsOf} tone={lane.tone as "positive" | "negative" | "warning" | "neutral"} onInspect={() => lane.value == null ? onNavigate(lane.section) : onTrace(lane.definition, lane.value, summary)} />) : <div className={styles.noAccountingLane}>No overview lane uses this accounting class. Open the matching workbench section for its detailed evidence.</div>}</section>;
}

export function CalculationTraceDrawer({ trace, onClose }: { trace: { definition: PaperMetricDefinition; value: unknown; inputs: Record<string, unknown>; asOf: string } | null; onClose: () => void }) {
  if (!trace) return null;
  const sourceEntries = trace.definition.sourceFields.map((field) => [field, trace.inputs[field] ?? "Source field is available at trade level"] as const);
  return <div className={styles.traceBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className={styles.traceDrawer} role="dialog" aria-modal="true" aria-label={`${trace.definition.label} calculation trace`}><header><div><span>CALCULATION TRACE</span><h2>{trace.definition.label}</h2></div><button type="button" onClick={onClose} aria-label="Close calculation trace">×</button></header><AccountingClassBadge value={trace.definition.accountingClass} /><section><span>Displayed value</span><strong>{trace.definition.unit === "INR" ? money(trace.value) : String(trace.value ?? "—")}</strong><small>As of {trace.asOf} · precision {trace.definition.precision ?? "source-defined"}</small></section><dl><dt>Plain-language meaning</dt><dd>{trace.definition.plainLanguageMeaning}</dd><dt>Formula</dt><dd>{trace.definition.formula ?? "Direct canonical source value"}</dd><dt>Source</dt><dd>{trace.definition.dataSource}</dd><dt>Time basis</dt><dd>{trace.definition.timeBasis ?? "Not applicable"}</dd><dt>Capital basis</dt><dd>{trace.definition.capitalBasis ?? "Not applicable"}</dd><dt>Cost basis</dt><dd>{trace.definition.costBasis}</dd></dl><h3>Source inputs</h3><div className={styles.traceInputs}>{sourceEntries.map(([key, value]) => <div key={key}><span>{key}</span><code>{typeof value === "object" ? JSON.stringify(value) : String(value ?? "missing")}</code></div>)}</div>{trace.definition.caveats?.map((item) => <p key={item} className={styles.traceWarning}>Limit: {item}</p>)}</aside></div>;
}
