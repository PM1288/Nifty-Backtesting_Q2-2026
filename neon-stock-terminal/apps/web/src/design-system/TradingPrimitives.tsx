import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDot, Clock3, Database, ShieldCheck, UserRound } from "lucide-react";
import styles from "./TradingPrimitives.module.css";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const statusIcons = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
  info: CircleDot,
  neutral: CircleDot
};

export function StatusPill({ tone = "neutral", children }: { tone?: StatusTone; children: ReactNode }) {
  const Icon = statusIcons[tone];
  return (
    <span className={styles.statusPill} data-tone={tone}>
      <Icon size={13} aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

export function EnvironmentBadge({ value = "PAPER" }: { value?: "PAPER" | "LIVE" }) {
  return (
    <span className={styles.environmentBadge} data-environment={value.toLowerCase()}>
      <ShieldCheck size={14} aria-hidden="true" />
      {value}
    </span>
  );
}

export function FeedFreshnessBadge({
  state,
  label
}: {
  state: "loading" | "current" | "stale" | "unavailable" | "error";
  label?: string;
}) {
  const defaults = {
    loading: "Checking feed",
    current: "Feed current",
    stale: "Feed stale",
    unavailable: "Feed unavailable",
    error: "Feed error"
  };
  const tone: StatusTone = state === "current" ? "success" : state === "loading" ? "info" : state === "stale" ? "warning" : "danger";
  return <StatusPill tone={tone}>{label ?? defaults[state]}</StatusPill>;
}

export function ContextIdentityStrip({
  page,
  dataAsOf,
  feedState,
  signedIn
}: {
  page: string;
  dataAsOf?: string | null;
  feedState: "loading" | "current" | "stale" | "unavailable" | "error";
  signedIn: boolean;
}) {
  return (
    <section className={styles.contextStrip} aria-label="Workspace identity and data status">
      <div className={styles.contextPrimary}>
        <EnvironmentBadge />
        <span className={styles.contextPage}>{page}</span>
      </div>
      <div className={styles.contextMeta}>
        <span className={styles.contextItem}>
          <Database size={14} aria-hidden="true" />
          {dataAsOf ? <time dateTime={dataAsOf}>Data {formatContextTime(dataAsOf)}</time> : <span>Data time unavailable</span>}
        </span>
        <FeedFreshnessBadge state={feedState} />
        <span className={styles.contextItem}>
          <UserRound size={14} aria-hidden="true" />
          {signedIn ? "Authenticated" : "Guest / read only"}
        </span>
      </div>
    </section>
  );
}

export function ValidationGateStrip({
  state,
  children
}: {
  state: "validated" | "conditional" | "research" | "blocked";
  children: ReactNode;
}) {
  const tone: StatusTone = state === "validated" ? "success" : state === "blocked" ? "danger" : state === "conditional" ? "warning" : "info";
  return (
    <section className={styles.validationStrip} data-tone={tone}>
      <StatusPill tone={tone}>{state.toUpperCase()}</StatusPill>
      <div>{children}</div>
    </section>
  );
}

export function FailurePanel({
  title,
  detail,
  action
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <section className={styles.failurePanel} role="status">
      <AlertTriangle size={20} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      {action ? <div className={styles.failureAction}>{action}</div> : null}
    </section>
  );
}

function formatContextTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(parsed);
}

export function DataAge({ children }: { children: ReactNode }) {
  return (
    <span className={styles.contextItem}>
      <Clock3 size={14} aria-hidden="true" />
      {children}
    </span>
  );
}
