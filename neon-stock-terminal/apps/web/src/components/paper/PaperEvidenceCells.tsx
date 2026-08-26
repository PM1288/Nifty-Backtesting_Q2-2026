import type { CSSProperties, ReactNode } from "react";
import styles from "./PaperEvidenceCells.module.css";

export type EvidenceCellTone = "neutral" | "positive" | "negative" | "warning" | "info";
export type EvidenceCellAlign = "left" | "center" | "right";

export type EvidenceCellSlots = {
  primary: ReactNode;
  secondary?: ReactNode;
  detail?: ReactNode;
  supporting?: ReactNode;
  metadata?: ReactNode;
  title?: string;
};

type EvidenceCellProps = EvidenceCellSlots & {
  kind: string;
  align?: EvidenceCellAlign;
  tone?: EvidenceCellTone;
  groupStart?: boolean;
  sticky?: "left" | "right";
  stickyOffset?: number;
  state?: string;
};

const join = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(" ");

function Slot({ children, level }: { children?: ReactNode; level: "primary" | "secondary" | "detail" | "supporting" | "metadata" }) {
  return <div className={styles[level]} data-slot={level} aria-hidden={children == null ? "true" : undefined}>{children ?? ""}</div>;
}

function EvidenceCell({
  kind,
  align = "left",
  tone = "neutral",
  groupStart,
  sticky,
  stickyOffset,
  state,
  title,
  primary,
  secondary,
  detail,
  supporting,
  metadata,
}: EvidenceCellProps) {
  return (
    <td
      className={join(styles.shell, styles[kind], groupStart && styles.groupStart, sticky && styles.sticky)}
      data-cell-kind={kind}
      data-cell-align={align}
      data-cell-tone={tone}
      data-cell-state={state}
      data-sticky={sticky}
      style={stickyOffset == null ? undefined : { "--evidence-sticky-offset": `${stickyOffset}px` } as CSSProperties}
      title={title}
    >
      <div className={styles.grid}>
        <Slot level="primary">{primary}</Slot>
        <Slot level="secondary">{secondary}</Slot>
        <Slot level="detail">{detail}</Slot>
        <Slot level="supporting">{supporting}</Slot>
        <Slot level="metadata">{metadata}</Slot>
      </div>
    </td>
  );
}

export function TradeIdentityCell(props: EvidenceCellSlots) {
  return <EvidenceCell {...props} kind="trade" align="left" sticky="left" stickyOffset={0} groupStart />;
}

export function DirectionCell(props: EvidenceCellSlots & { direction: "LONG" | "SHORT" }) {
  return <EvidenceCell {...props} kind="direction" align="center" sticky="left" stickyOffset={220} state={props.direction.toLowerCase()} />;
}

export function StrategyCell(props: EvidenceCellSlots) {
  return <EvidenceCell {...props} kind="strategy" align="left" sticky="left" stickyOffset={320} />;
}

export function CapitalCell(props: EvidenceCellSlots & { groupStart?: boolean }) {
  return <EvidenceCell {...props} kind="capital" align="right" tone="info" />;
}

export function EconomicsCell(props: EvidenceCellSlots & { tone?: EvidenceCellTone }) {
  return <EvidenceCell {...props} kind="economics" align="right" />;
}

export function TargetOutcomeCell(props: EvidenceCellSlots & { state: "HIT" | "FAILED" | "OPEN"; groupStart?: boolean }) {
  const tone = props.state === "HIT" ? "positive" : props.state === "FAILED" ? "negative" : "warning";
  return <EvidenceCell {...props} kind="target" align="center" tone={tone} state={props.state.toLowerCase()} />;
}

export function HorizonCell(props: EvidenceCellSlots & { tone?: EvidenceCellTone; state: string; groupStart?: boolean }) {
  return <EvidenceCell {...props} kind="horizon" align="left" tone={props.tone ?? "info"} />;
}

export function TimeInTradeCell(props: EvidenceCellSlots) {
  return <EvidenceCell {...props} kind="time" align="left" />;
}

export function RewardPainCell(props: EvidenceCellSlots & { tone: "positive" | "negative"; groupStart?: boolean }) {
  return <EvidenceCell {...props} kind="rewardPain" align="right" />;
}

export function CarryCell(props: EvidenceCellSlots & { tone?: EvidenceCellTone }) {
  return <EvidenceCell {...props} kind="carry" align="right" />;
}

export function QualityCell(props: EvidenceCellSlots & { tone?: EvidenceCellTone; grade?: string; groupStart?: boolean }) {
  return <EvidenceCell {...props} kind="quality" align="left" state={props.grade} />;
}

export function CommentsCell(props: EvidenceCellSlots) {
  return <EvidenceCell {...props} kind="comments" align="left" />;
}

export function ActionCell({ children }: { children: ReactNode }) {
  return <EvidenceCell kind="action" align="center" sticky="right" stickyOffset={0} primary={children} />;
}
