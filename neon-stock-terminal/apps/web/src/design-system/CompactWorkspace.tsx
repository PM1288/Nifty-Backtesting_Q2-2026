import { useId, type ReactNode } from "react";
import { Info, MoreHorizontal } from "lucide-react";
import styles from "./CompactWorkspace.module.css";

export type CompactLens = { id: string; label: string; count?: string; disabled?: boolean };

export function LensNavigationBar({ lenses, active, onSelect, leading, actions }: { lenses: CompactLens[]; active: string; onSelect: (id: string) => void; leading?: ReactNode; actions?: ReactNode }) {
  return <nav className={styles.lensBar} aria-label="Workspace lenses">
    {leading ? <div className={styles.leading}>{leading}</div> : null}
    <div className={styles.lenses} role="tablist">{lenses.map((lens) => <button key={lens.id} type="button" role="tab" aria-selected={active === lens.id} disabled={lens.disabled} data-active={active === lens.id ? "true" : "false"} onClick={() => onSelect(lens.id)}><span>{lens.label}</span>{lens.count ? <small>{lens.count}</small> : null}</button>)}</div>
    {actions ? <div className={styles.actions}>{actions}</div> : null}
  </nav>;
}

export function UnifiedContextBar({ count, children, actions, overflow }: { count: ReactNode; children: ReactNode; actions?: ReactNode; overflow?: ReactNode }) {
  return <section className={styles.contextBar} aria-label="Analysis context"><strong className={styles.count}>{count}</strong><div className={styles.controls}>{children}</div>{overflow ? <details className={styles.overflow}><summary aria-label="More filters"><MoreHorizontal size={15} aria-hidden="true" /></summary><div>{overflow}</div></details> : null}{actions ? <div className={styles.actions}>{actions}</div> : null}</section>;
}

export function CompactStatusBand({ state, title, reason, metadata, action, info }: { state: "positive" | "negative" | "warning" | "neutral"; title: string; reason: ReactNode; metadata?: ReactNode; action?: ReactNode; info?: ReactNode }) {
  return <section className={styles.statusBand} data-tone={state} role={state === "negative" ? "alert" : "status"}><i aria-hidden="true" /><strong>{title}</strong><span>{reason}</span>{metadata ? <small>{metadata}</small> : null}{info ? <InfoPanel label={`About ${title}`}>{info}</InfoPanel> : null}{action ? <div className={styles.actions}>{action}</div> : null}</section>;
}

export function KpiStrip({ label = "Key metrics", children }: { label?: string; children: ReactNode }) {
  return <section className={styles.kpiStrip} aria-label={label} tabIndex={0}>{children}</section>;
}

export function KpiCell({ label, value, basis, delta, info }: { label: string; value: ReactNode; basis?: ReactNode; delta?: ReactNode; info?: ReactNode }) {
  return <article className={styles.kpiCell}><header><span>{label}</span>{info ? <InfoPanel label={`Define ${label}`}>{info}</InfoPanel> : null}</header><strong>{value}</strong>{delta ? <em>{delta}</em> : null}{basis ? <small>{basis}</small> : null}</article>;
}

export function InfoPanel({ label, children }: { label: string; children: ReactNode }) {
  const titleId = useId();
  return <details className={styles.infoPanel}><summary aria-label={label}><Info size={13} aria-hidden="true" /></summary><div role="note" aria-labelledby={titleId}><strong id={titleId}>{label}</strong>{children}</div></details>;
}
