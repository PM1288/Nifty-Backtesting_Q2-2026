import { useEffect, useId, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, CircleSlash2, Database, LoaderCircle, X } from "lucide-react";
import { qualitySummary, qualityTone, type ModuleQualityState, type QualityTone } from "./quality";
import styles from "./WorkspacePrimitives.module.css";

export type DecisionState = "APPROVED" | "BLOCKED" | "INCOMPLETE" | "DEVELOPING" | "NEUTRAL";

export function ModuleStatusStrip({ environment = "PAPER", quality, context }: { environment?: "PAPER" | "LIVE" | "REPLAY"; quality: ModuleQualityState; context?: ReactNode }) {
  return <section className={styles.statusStrip} aria-label="Workspace context and data quality">
    <strong className={styles.environment}>{environment}</strong>
    {context ? <span className={styles.context}>{context}</span> : null}
    <DataQualityBadge quality={quality} />
    {quality.dataThrough ? <time dateTime={quality.dataThrough}>Through {formatIst(quality.dataThrough)}</time> : null}
    {quality.source ? <span><Database size={14} aria-hidden="true" />{quality.source}</span> : null}
  </section>;
}

export function DataQualityBadge({ quality, compact = false }: { quality: ModuleQualityState; compact?: boolean }) {
  const tone = qualityTone(quality);
  const label = compact ? quality.readiness.replaceAll("_", " ") : qualitySummary(quality);
  return <span className={styles.qualityBadge} data-tone={tone} title={quality.message}>
    <span className={styles.stateMark} aria-hidden="true">{tone === "positive" ? "✓" : tone === "negative" ? "!" : tone === "warning" ? "△" : "—"}</span>
    {label}
  </span>;
}

export function DecisionHero({ eyebrow, title, state, reasons, action, evidence }: { eyebrow?: string; title: string; state: DecisionState; reasons?: ReactNode; action?: ReactNode; evidence?: ReactNode }) {
  return <section className={styles.decisionHero} data-state={state}>
    <div className={styles.heroCopy}>
      {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
      <div className={styles.heroTitleRow}><span className={styles.decisionMark} aria-hidden="true">{state === "APPROVED" ? "✓" : state === "BLOCKED" ? "×" : state === "INCOMPLETE" ? "?" : "·"}</span><h1>{title}</h1></div>
      {reasons ? <div className={styles.heroReasons}>{reasons}</div> : null}
      {evidence ? <div className={styles.heroEvidence}>{evidence}</div> : null}
    </div>
    {action ? <div className={styles.heroAction}>{action}</div> : null}
  </section>;
}

export function ExecutiveKpiStrip({ children }: { children: ReactNode }) {
  return <section className={styles.kpiStrip} aria-label="Executive metrics">{children}</section>;
}

export function MetricTile({ label, value, unit, scope, definition, tone = "neutral", drilldown }: { label: string; value: ReactNode; unit?: string; scope: string; definition?: string; tone?: QualityTone; drilldown?: ReactNode }) {
  return <article className={styles.metricTile} data-tone={tone} title={definition}>
    <span className={styles.metricLabel}>{label}</span>
    <strong className={styles.metricValue}>{value}{unit ? <small>{unit}</small> : null}</strong>
    <span className={styles.metricScope}>{scope}</span>
    {drilldown ? <div className={styles.metricDrilldown}>{drilldown}</div> : null}
  </article>;
}

export function CompactEmptyState({ kind, title, detail, lastSuccessfulAt, action }: { kind: "NO_DATA" | "NO_RESULT" | "FILTERED_OUT" | "STALE" | "INCOMPLETE" | "DISCONNECTED" | "PERMISSION_DENIED"; title: string; detail: string; lastSuccessfulAt?: string; action?: ReactNode }) {
  return <section className={styles.compactState} data-kind={kind} role="status">
    <CircleSlash2 aria-hidden="true" />
    <div><span className={styles.stateKind}>{kind.replaceAll("_", " ")}</span><h2>{title}</h2><p>{detail}</p>{lastSuccessfulAt ? <p>Last successful: <time dateTime={lastSuccessfulAt}>{formatIst(lastSuccessfulAt)}</time></p> : null}</div>
    {action ? <div className={styles.stateAction}>{action}</div> : null}
  </section>;
}

export function ErrorState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <section className={styles.compactState} data-kind="ERROR" role="alert"><AlertTriangle aria-hidden="true" /><div><span className={styles.stateKind}>ERROR</span><h2>{title}</h2><p>{detail}</p></div>{action ? <div className={styles.stateAction}>{action}</div> : null}</section>;
}

export function LoadingSkeleton({ label = "Loading workspace", rows = 3 }: { label?: string; rows?: number }) {
  return <section className={styles.loading} aria-busy="true" aria-label={label}><LoaderCircle aria-hidden="true" />{Array.from({ length: rows }, (_, index) => <span key={index} />)}</section>;
}

export function NarrativeEvidenceBlock({ title, statements }: { title?: string; statements: Array<{ id: string; text: string; evidenceLabel: string; onSelect?: () => void }> }) {
  return <section className={styles.narrative} aria-label={title ?? "Evidence-linked explanation"}>{title ? <h2>{title}</h2> : null}<ol>{statements.map((statement) => <li key={statement.id}><span>{statement.text}</span>{statement.onSelect ? <button type="button" onClick={statement.onSelect}>{statement.evidenceLabel}<ChevronRight size={14} aria-hidden="true" /></button> : <small>{statement.evidenceLabel}</small>}</li>)}</ol></section>;
}

export function DataQualitySummary({ modules }: { modules: ModuleQualityState[] }) {
  return <section className={styles.qualitySummary} aria-label="Module quality summary">{modules.map((module) => <div key={module.moduleId}><strong>{module.moduleId}</strong><DataQualityBadge quality={module} compact />{module.message ? <span>{module.message}</span> : null}</div>)}</section>;
}

export function ContextDrawer({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, open]);
  if (!open) return null;
  return <div className={styles.drawerBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby={titleId}><header><h2 id={titleId}>{title}</h2><button type="button" onClick={onClose} aria-label={`Close ${title}`}><X aria-hidden="true" /></button></header><div>{children}</div></aside></div>;
}

export function ReducedMotionController() {
  const [calm, setCalm] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(() => { document.documentElement.dataset.calmMode = calm ? "true" : "false"; return () => { delete document.documentElement.dataset.calmMode; }; }, [calm]);
  useEffect(() => { document.documentElement.dataset.pauseMotion = paused ? "true" : "false"; return () => { delete document.documentElement.dataset.pauseMotion; }; }, [paused]);
  return <div className={styles.motionControls} aria-label="Motion preferences"><button type="button" aria-pressed={calm} onClick={() => setCalm((value) => !value)}>Calm mode</button><button type="button" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>Pause motion</button></div>;
}

function formatIst(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(parsed);
}
