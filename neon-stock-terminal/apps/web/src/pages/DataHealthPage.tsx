import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getJson } from "../lib/api";
import styles from "./DataHealthPage.module.css";

type Instrument = { exchange: string; symbol_token: string; tradingsymbol: string; underlying: string; kind: string; expiry: string | null; right: string | null; strike: number | null; streaming: boolean; last_seen_ts: string | null; updated_at: string | null; last_source: string | null; price: number | null; oi: string | null; volume: string | null; state: string };
type Health = { generatedAt: string; marketOpen: boolean; scope: string; session: { trade_date: string; market_open_ts: string; market_close_ts: string } | null; instruments: Instrument[]; days: { day: string; is_trading_day: boolean; attempted: number; parsed: number; archived: number; unavailable: number; retry_issues: number; bytes: number | null }[]; requests: { name: string; requests: number; failed: number; throttled: number; latency_ms: number; last_at: string }[] };
const good = (state: string) => ["RECENT", "OBSERVED_SESSION"].includes(state);
const labels: Record<string, string> = { RECENT: "Recent", OBSERVED_SESSION: "Seen since session open", MISSING: "Never observed", OLDER_SESSION: "Older session", STALE: "Delayed", UNKNOWN_SESSION: "Calendar unavailable", INVALID_TIME: "Invalid timestamp" };
const time = (value: string | null) => value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "—";
const number = (value: number | string | null) => value == null ? "—" : Number(value).toLocaleString("en-IN");

export function DataHealthPage() {
  const query = useQuery({ queryKey: ["data-health"], queryFn: ({ signal }) => getJson<Health>("/v1/data-health", signal), refetchInterval: 60_000 });
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("ALL");
  const [issues, setIssues] = useState(false);
  const [page, setPage] = useState(0);
  const data = query.data;
  const rows = useMemo(() => (data?.instruments ?? []).filter(row => (kind === "ALL" || row.kind === kind) && (!issues || !good(row.state)) && `${row.underlying} ${row.tradingsymbol}`.toLowerCase().includes(search.toLowerCase())), [data, kind, issues, search]);
  const groups = useMemo(() => {
    const result = new Map<string, { total: number; observed: number; streaming: number }>();
    for (const row of data?.instruments ?? []) {
      const group = result.get(row.kind) ?? { total: 0, observed: 0, streaming: 0 };
      group.total++; group.observed += Number(good(row.state)); group.streaming += Number(row.streaming); result.set(row.kind, group);
    }
    return [...result.entries()];
  }, [data]);
  const exportData = () => {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `data-health-${data.generatedAt.slice(0,10)}.json`; anchor.click(); URL.revokeObjectURL(url);
  };
  const observed = data?.instruments.filter(row => good(row.state)).length ?? 0;
  const latest = data?.days.find(day => day.attempted);
  const safePage = Math.min(page, Math.max(0, Math.ceil(rows.length / 50) - 1));
  return <main className={styles.page} data-testid="data-health-dashboard">
    <header className={styles.header}><div><small>DATA & OPERATIONS</small><h1>Daily Data Health</h1><p>Downloads → retained files → parsed data → symbol observations</p></div><div className={styles.actions}><button onClick={() => void query.refetch()} disabled={query.isFetching}>{query.isFetching ? "Refreshing…" : "Refresh"}</button><button onClick={exportData} disabled={!data}>Export evidence</button><Link to="/institutional/nse-intelligence/reports">File details</Link><Link to="/analytics/system/quality">Data quality</Link></div></header>
    {query.isError && <p role="alert" className={styles.error}>Refresh failed. {data ? "Showing the previous snapshot below; it is not a live health confirmation." : "Collection health is unavailable."}</p>}
    {!data ? <p role="status">{query.isPending ? "Loading collection evidence…" : "No evidence available."}</p> : <>
      <p className={styles.caption}>Snapshot {time(data.generatedAt)} IST · {data.marketOpen ? "Market session open" : "Outside recorded session hours"} · Reference session {data.session?.trade_date ?? "Unavailable"} · Refresh every 60 seconds</p>
      <div className={styles.kpis}>
        <article><span>Symbols / contracts observed</span><strong>{number(observed)} <small>/ {number(data.instruments.length)}</small></strong><progress value={observed} max={data.instruments.length || 1} /><small>{data.marketOpen ? "Within freshness allowance" : "At least one observation since reference session opened"}</small></article>
        <article><span>Need attention</span><strong className={styles.warning}>{number(data.instruments.length - observed)}</strong><small>Missing, delayed or older-session observations</small></article>
        <article><span>Latest report date · {latest?.day ?? "—"}</span><strong>{latest ? latest.parsed + latest.archived : "—"} <small>/ {latest?.attempted ?? "—"} retained</small></strong><small>{latest?.parsed ?? "—"} parsed · {latest?.archived ?? "—"} archived only</small></article>
        <article><span>Broker requests · last 24h</span><strong>{number(data.requests.reduce((n,r) => n+r.requests,0))}</strong><small>{data.requests.reduce((n,r) => n+r.failed,0)} failed · {data.requests.reduce((n,r) => n+r.throttled,0)} throttled</small></article>
      </div>
      <section><h2>Instrument coverage</h2><div className={styles.coverage}>{groups.map(([name,g]) => <button key={name} aria-pressed={kind===name} onClick={() => { setKind(kind===name ? "ALL" : name); setPage(0); }}><b>{name}</b><strong>{g.observed}/{g.total}</strong><progress value={g.observed} max={g.total}/><small>{g.streaming} subscribed · {g.total-g.streaming} plan-only</small></button>)}</div><p className={styles.caption}>{data.scope} Streaming allowance: 3 minutes; plan-only allowance: 15 minutes. Outside session hours, green means collected since the reference session opened, not complete end-of-day coverage. Collection timestamps do not certify exchange-event freshness or the freshness of each OI/volume field.</p></section>
      <section><h2>Daily NSE downloads <small>Recent 30-day calendar</small></h2><div className={styles.legend}><span className={styles.green}>● Parsed</span><span className={styles.blue}>● Archived, not parsed</span><span className={styles.warning}>● Not retained</span></div>
        {!data.days.length ? <p>No recorded calendar evidence.</p> : <div className={styles.days}>{data.days.map(day => <div className={styles.day} key={day.day}><b>{day.day}</b>{day.attempted ? <><div className={styles.bar} role="img" aria-label={`${day.parsed} parsed, ${day.archived} archive only, ${day.unavailable} not retained`}><i style={{ width: `${100*day.parsed/day.attempted}%`, background: "#218750" }}/><i style={{ width: `${100*day.archived/day.attempted}%`, background: "#3988d5" }}/><i style={{ width: `${100*day.unavailable/day.attempted}%`, background: "#cf673f" }}/></div><span>{day.parsed} parsed · {day.archived} archived · {day.unavailable} missing <small>({day.retry_issues} last-attempt issues)</small></span></> : <><div className={styles.bar}/><span className={day.is_trading_day ? styles.warning : ""}>{day.is_trading_day ? "Session: no recorded download attempt" : "Non-trading day · no attempt"}</span></>}</div>)}</div>}
        <p className={styles.caption}>Counts cover attempted report types, not every exchange publication. Failed retries do not erase previously retained files. No attempt is not proof of success; use File details for exact failures and timestamps.</p>
      </section>
      <section><h2>Symbol data</h2><div className={styles.actions}><input aria-label="Search symbol" placeholder="Search stock or exact contract…" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }}/><select aria-label="Instrument type" value={kind} onChange={event => { setKind(event.target.value); setPage(0); }}><option value="ALL">All instrument types</option>{groups.map(([name]) => <option key={name}>{name}</option>)}</select><label><input type="checkbox" checked={issues} onChange={event => { setIssues(event.target.checked); setPage(0); }}/> Issues only</label><span>{number(rows.length)} instruments</span></div>
        <div className={styles.table}><table><thead><tr>{["Symbol / contract","Type / expiry","Collection route","State","Last observation · IST","Last received · IST","Price","OI","Volume"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.slice(safePage*50,safePage*50+50).map(row => <tr key={`${row.exchange}:${row.symbol_token}`}><td><b>{row.tradingsymbol || row.symbol_token}</b><small>{row.underlying} · {row.exchange} · {row.symbol_token}</small></td><td>{row.kind}<small>{row.expiry ?? "—"} {row.right}</small></td><td>{row.streaming ? "Subscribed" : "Plan / REST rotation"}<small>Last source: {row.last_source ?? "—"}</small></td><td><span className={good(row.state) ? styles.green : styles.warning}>{labels[row.state] ?? row.state}</span></td><td>{time(row.last_seen_ts)}</td><td>{time(row.updated_at)}</td><td>{number(row.price)}</td><td>{number(row.oi)}</td><td>{number(row.volume)}</td></tr>)}</tbody></table></div>
        {!rows.length && <p>No matching instruments.</p>}<div className={styles.actions}><button disabled={safePage===0} onClick={() => setPage(safePage-1)}>Previous</button><span>Page {safePage+1} / {Math.max(1,Math.ceil(rows.length/50))}</span><button disabled={(safePage+1)*50>=rows.length} onClick={() => setPage(safePage+1)}>Next</button></div>
      </section>
      <section><h2>Broker request health <small>Last 24 hours</small></h2><div className={styles.table}><table><thead><tr><th>Request group</th><th>Requests</th><th>Failed</th><th>Throttled</th><th>Average latency</th><th>Last request · IST</th></tr></thead><tbody>{data.requests.map(row => <tr key={row.name}><td>{row.name}</td><td>{row.requests}</td><td className={row.failed ? styles.warning : ""}>{row.failed}</td><td>{row.throttled}</td><td>{row.latency_ms} ms</td><td>{time(row.last_at)}</td></tr>)}</tbody></table></div>{!data.requests.length && <p>No requests recorded in this window; this does not certify a healthy feed.</p>}</section>
    </>}
  </main>;
}
