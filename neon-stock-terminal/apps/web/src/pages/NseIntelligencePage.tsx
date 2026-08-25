import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, Database, FileCheck2, RefreshCw } from "lucide-react";
import { CompactEmptyState, DecisionHero, ErrorState, ExecutiveKpiStrip, LoadingSkeleton, MetricTile } from "../design-system/WorkspacePrimitives";
import { StatusPill } from "../design-system/TradingPrimitives";
import { fetchNseIntelligence } from "../lib/api";
import styles from "./NseIntelligencePage.module.css";

const views = [
  { label: "Command Centre", to: "/institutional/nse-intelligence", key: "overview" },
  { label: "Sector Activity", to: "/institutional/nse-intelligence/sectors", key: "sectors" },
  { label: "F&O Positioning", to: "/institutional/nse-intelligence/fno", key: "fno" },
  { label: "Deals & Events", to: "/institutional/nse-intelligence/events", key: "events" },
  { label: "Reports & Health", to: "/institutional/nse-intelligence/reports", key: "reports" },
] as const;

function number(value: unknown, decimals = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : "—";
}

function date(value: string | null | undefined, includeTime = false) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", ...(includeTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}) });
}

function statusTone(value: string) {
  return ["LOADED", "REUSED", "READY", "SUCCESS", "SENT"].includes(value) ? "success" : ["PARTIAL", "DEGRADED", "PENDING", "RETRY"].includes(value) ? "warning" : "danger";
}

function BreadthTrend({ rows }: { rows: Array<{ tradeDate: string; breadthPct: number | null }> }) {
  if (!rows.length) return <CompactEmptyState kind="NO_DATA" title="Breadth history unavailable" detail="No official cash-market observations are available for the trend." />;
  return <div className={styles.trend} role="img" aria-label="Official advance minus decline breadth trend">
    {rows.map((row) => {
      const value = Number(row.breadthPct ?? 0);
      const height = Math.max(5, Math.min(100, Math.abs(value)));
      return <div key={row.tradeDate} className={styles.trendColumn} title={`${date(row.tradeDate)} · ${number(value, 2)}%`}>
        <span className={styles.trendValue}>{number(value, 0)}</span>
        <span className={styles.trendBar} data-direction={value >= 0 ? "positive" : "negative"} style={{ height: `${height}%` }} />
        <time dateTime={row.tradeDate}>{new Date(row.tradeDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</time>
      </div>;
    })}
  </div>;
}

function Reports({ data }: { data: Awaited<ReturnType<typeof fetchNseIntelligence>> }) {
  return <section className={styles.section}>
    <div className={styles.sectionHeading}><div><span>Source control</span><h2>Reports &amp; Health</h2><p>Scheduler health and dataset readiness are separate. A partial job does not erase successfully loaded core cash data.</p></div></div>
    <div className={styles.runTimeline}>
      <div><CalendarClock /><span>Scheduled</span><strong>{date(data.ingestion?.scheduledFor, true)}</strong></div>
      <div><RefreshCw /><span>Started</span><strong>{date(data.ingestion?.startedAt, true)}</strong></div>
      <div><FileCheck2 /><span>Finished</span><strong>{date(data.ingestion?.finishedAt, true)}</strong></div>
      <div><Database /><span>Notification</span><strong>{data.ingestion?.notification.status ?? "—"}</strong></div>
    </div>
    <div className={styles.tableWrap}>
      <table>
        <thead><tr><th>Report</th><th>Scope</th><th>Status</th><th>Source date</th><th>Rows</th><th>Loaded</th><th>Reason</th></tr></thead>
        <tbody>{data.reports.map((row) => <tr key={row.reportId}>
          <th scope="row"><strong>{row.report}</strong><small>{row.fileName}</small></th>
          <td>{row.priority}</td><td><StatusPill tone={statusTone(row.status)}>{row.status}</StatusPill></td>
          <td>{date(row.sourceDate)}</td><td>{number(row.rows)}</td><td>{date(row.loadedAt, true)}</td><td>{row.message || "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}

export function NseIntelligencePage() {
  const location = useLocation();
  const query = useQuery({ queryKey: ["nse-intelligence"], queryFn: fetchNseIntelligence, refetchInterval: 60_000 });
  const active = location.pathname.endsWith("/reports") ? "reports" : location.pathname.endsWith("/events") ? "events" : location.pathname.endsWith("/sectors") ? "sectors" : location.pathname.endsWith("/fno") ? "fno" : "overview";
  const data = query.data;
  const movers = useMemo(() => ({ gainers: data?.movers.filter((row) => row.direction === "GAINER").slice(0, 5) ?? [], losers: data?.movers.filter((row) => row.direction === "LOSER").sort((a, b) => Number(a.changePct) - Number(b.changePct)).slice(0, 5) ?? [] }), [data?.movers]);

  if (query.isLoading) return <main className={styles.page}><LoadingSkeleton label="Loading NSE Intelligence" rows={5} /></main>;
  if (query.isError || !data) return <main className={styles.page}><ErrorState title="NSE Intelligence is unavailable" detail={query.error instanceof Error ? query.error.message : "The canonical NSE data service could not be read."} action={<button type="button" onClick={() => query.refetch()}>Retry</button>} /></main>;

  const market = data.market;
  const declineShare = market?.securities ? 100 * market.decliners / market.securities : null;
  const heroState = data.quality.readiness === "READY" ? "APPROVED" : data.quality.readiness === "NO_DATA" ? "INCOMPLETE" : "BLOCKED";
  const heroTitle = !market ? "Official cash-market intelligence is unavailable" : market.decliners > market.advancers ? "Official breadth was negative; core cash data is usable with ancillary gaps" : "Official breadth was positive; verify ancillary report gaps before deeper analysis";

  return <main className={styles.page}>
    <header className={styles.pageHeader}>
      <div><span>Data &amp; Operations / Nifty Reports</span><h1>NSE Intelligence</h1><p>Daily official bhavcopy evidence, normalized events and ingestion health—without synthetic widgets.</p></div>
      <button type="button" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={query.isFetching ? styles.spinning : ""} />Refresh</button>
    </header>
    <nav className={styles.viewNav} aria-label="NSE Intelligence views">{views.map((view) => <Link key={view.key} to={view.to} aria-current={active === view.key ? "page" : undefined}>{view.label}</Link>)}</nav>

    <section className={styles.ingestionBanner} data-readiness={data.quality.readiness}>
      <div><strong>{data.quality.readiness}</strong><span>Official source date {date(data.tradeDate)}</span></div>
      <dl><div><dt>Daily job</dt><dd>{data.quality.jobStatus}</dd></div><div><dt>Core ready</dt><dd>{data.quality.availableInputs}/{data.quality.requiredInputs}</dd></div><div><dt>All reports</dt><dd>{data.quality.allAvailableInputs}/{data.quality.allExpectedInputs}</dd></div><div><dt>Rows loaded</dt><dd>{number(data.ingestion?.rowsLoaded)}</dd></div></dl>
      <Link to="/institutional/nse-intelligence/reports">Inspect report health →</Link>
    </section>

    {active === "reports" ? <Reports data={data} /> : active === "sectors" || active === "fno" ? <>
      <CompactEmptyState kind="INCOMPLETE" title={`${active === "sectors" ? "Sector Activity" : "Stock-level F&O Positioning"} is blocked`} detail={data.unavailableModules.find((row) => row.module.startsWith(active === "sectors" ? "Sector" : "Stock-level"))?.reason ?? "Required official inputs are incomplete."} action={<Link to="/institutional/nse-intelligence/reports">View missing sources</Link>} />
      <Reports data={data} />
    </> : active === "events" ? <section className={styles.section}>
      <div className={styles.sectionHeading}><div><span>Normalized official records</span><h2>Deals &amp; Events</h2><p>Only ingested records are shown. Unavailable bulk, block, short-selling and surveillance feeds are not rendered as zero.</p></div></div>
      {data.events.length ? <div className={styles.eventList}>{data.events.map((event, index) => <article key={`${event.reportDate}-${event.eventType}-${index}`}><time>{date(event.reportDate)}</time><div><strong>{event.symbol || event.eventType.replaceAll("_", " ")}</strong><p>{event.headline || event.detail}</p><small>{event.sourceFile || "Normalized NSE report"}</small></div></article>)}</div> : <CompactEmptyState kind="NO_DATA" title="No normalized events available" detail="No event record was returned for the current source window." />}
    </section> : <>
      <DecisionHero eyebrow={`Official EOD · ${date(data.tradeDate)}`} title={heroTitle} state={heroState} reasons={<p>{market ? `${number(market.decliners)} decliners versus ${number(market.advancers)} advancers across ${number(market.securities)} EQ-series securities.` : "The official cash bhavcopy is missing."}</p>} evidence={<span>{data.quality.allAvailableInputs}/{data.quality.allExpectedInputs} enabled reports loaded · Feature version {data.featureVersion}</span>} action={<Link to="/institutional/nse-intelligence/reports">Why degraded?</Link>} />
      <ExecutiveKpiStrip>
        <MetricTile label="Advancers" value={number(market?.advancers)} scope={`of ${number(market?.securities)} securities`} tone="positive" />
        <MetricTile label="Decliners" value={number(market?.decliners)} scope={declineShare == null ? "Coverage unavailable" : `${number(declineShare, 2)}% of universe`} tone="negative" />
        <MetricTile label="Traded value" value={market?.totalValue == null ? "—" : `₹${number(Number(market.totalValue) / 10_000_000, 2)}`} unit=" Cr" scope="Official EQ-series aggregate" />
        <MetricTile label="Report coverage" value={`${data.quality.allAvailableInputs}/${data.quality.allExpectedInputs}`} scope={`${data.quality.missingReportCount} unavailable`} tone={data.quality.missingReportCount ? "warning" : "positive"} />
      </ExecutiveKpiStrip>
      <section className={styles.section}><div className={styles.sectionHeading}><div><span>Participation trend</span><h2>Advance minus decline breadth</h2><p>Percentage of the official EQ-series universe; missing sessions are not interpolated.</p></div></div><BreadthTrend rows={data.breadthTrend} /></section>
      <section className={styles.twoColumn}>
        {(["gainers", "losers"] as const).map((key) => <section className={styles.section} key={key}><div className={styles.sectionHeading}><div><span>Official close vs previous close</span><h2>{key === "gainers" ? "Top gainers" : "Top losers"}</h2></div></div><ol className={styles.movers}>{movers[key].map((row) => <li key={row.symbol}><Link to={`/analytics/stock/${encodeURIComponent(row.symbol)}?source=nse-intelligence&asOf=${row.tradeDate}`}><span>{key === "gainers" ? <ArrowUpRight /> : <ArrowDownRight />}<strong>{row.symbol}</strong><small>{row.name}</small></span><span><b>{number(row.changePct, 2)}%</b><small>₹{number(row.close, 2)}</small></span></Link></li>)}</ol></section>)}
      </section>
      {data.unavailableModules.length ? <section className={styles.limitations}><AlertTriangle /><div><h2>Unavailable analysis is intentionally hidden</h2>{data.unavailableModules.map((row) => <p key={row.module}><strong>{row.module}:</strong> {row.reason}</p>)}</div></section> : null}
    </>}
  </main>;
}
