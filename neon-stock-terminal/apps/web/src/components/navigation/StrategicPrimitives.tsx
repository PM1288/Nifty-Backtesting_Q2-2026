import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Database, ExternalLink } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { safeReturnPath } from "../../interaction/navigationContext";
import styles from "./StrategicPrimitives.module.css";

export function PageHeader({ breadcrumb, title, context, actions, quality }: { breadcrumb: ReactNode; title: string; context: ReactNode; actions?: ReactNode; quality?: ReactNode }) {
  return <header className={styles.pageHeader}>
    <div className={styles.pageCopy}><div className={styles.breadcrumb}>{breadcrumb}</div><h1>{title}</h1><p>{context}</p>{quality ? <div className={styles.quality}>{quality}</div> : null}</div>
    {actions ? <div className={styles.actions}>{actions}</div> : null}
  </header>;
}

export type JourneyItem = { id: string; title: string; detail: string; to: string; status?: string; actionLabel?: string };

export function RelatedJourney({ title = "Continue this investigation", items }: { title?: string; items: JourneyItem[] }) {
  if (!items.length) return null;
  return <section className={styles.related} aria-labelledby="related-journey-title"><header><span>NEXT RELEVANT EVIDENCE</span><h2 id="related-journey-title">{title}</h2></header><div>{items.slice(0, 4).map((item) => <Link key={item.id} to={item.to}><span><strong>{item.title}</strong><small>{item.detail}</small>{item.status ? <em>{item.status}</em> : null}</span><span>{item.actionLabel ?? "Open"}<ArrowRight size={15} aria-hidden="true" /></span></Link>)}</div></section>;
}

export type LearnSection = { id: "read" | "methodology" | "definitions" | "sources" | "limitations" | "related" | "version"; title: string; content: ReactNode };

export function LearnAboutThisAnalysis({ sections }: { sections: LearnSection[] }) {
  const location = useLocation();
  const refs = useRef<Record<string, HTMLDetailsElement | null>>({});
  useEffect(() => {
    const requested = new URLSearchParams(location.search).get("learn") || location.hash.replace(/^#/, "");
    if (!requested) return;
    const target = refs.current[requested];
    if (target) { target.open = true; window.requestAnimationFrame(() => target.scrollIntoView({ block: "start" })); }
  }, [location.hash, location.search]);
  return <section className={styles.learn} aria-labelledby="learn-title"><header><BookOpen aria-hidden="true" /><div><span>REFERENCE</span><h2 id="learn-title">Learn about this analysis</h2><p>Stable methodology and definitions are kept here so current evidence remains prominent.</p></div></header><div>{sections.map((section) => <details id={section.id} key={section.id} ref={(node) => { refs.current[section.id] = node; }}><summary>{section.title}</summary><div>{section.content}</div></details>)}</div></section>;
}

export function ReturnToSource({ fallback = "/" }: { fallback?: string }) {
  const location = useLocation();
  const returnTo = safeReturnPath(new URLSearchParams(location.search).get("returnTo")) ?? fallback;
  return <Link className={styles.returnLink} to={returnTo}><ArrowLeft size={15} aria-hidden="true" />Back to previous evidence</Link>;
}

export function SourceFreshness({ source, asOf, state }: { source: string; asOf?: string | null; state?: string }) {
  return <span className={styles.source}><Database size={14} aria-hidden="true" />{source}{asOf ? <> · <time dateTime={asOf}>{new Date(asOf).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time></> : null}{state ? <> · {state}</> : null}</span>;
}

export function ExternalEvidenceLink({ href, children }: { href: string; children: ReactNode }) {
  return <a className={styles.external} href={href} target="_blank" rel="noreferrer">{children}<ExternalLink size={14} aria-hidden="true" /></a>;
}
