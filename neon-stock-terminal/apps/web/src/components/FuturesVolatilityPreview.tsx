import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchFuturesVolatilityScreener, type FuturesVolatilityScreener } from "../lib/api";
import styles from "./FuturesVolatilityPreview.module.css";

const n = (value: string | null) => value == null ? "—" : Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function FuturesVolatilityPreview() {
  const [data, setData] = useState<FuturesVolatilityScreener | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    fetchFuturesVolatilityScreener().then(value => { if (active) setData(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  const run = data?.run ?? {};
  return <section className={styles.preview} data-testid="home-futures-volatility">
    <header><div><strong>FUTURES VOLATILITY SCREENER</strong><small>Report {String(run.report_date ?? "—")} → Analysis {String(run.analysis_session ?? "—")} · Δ daily futures vol &gt; 1.0000 bp</small></div><Link to="/futures/volatility">View all</Link></header>
    {failed || data?.readiness === "REPORT_NOT_READY" ? <div className={styles.state}>Report not ready · source and retry status available in the full dashboard.</div> : !data ? <div className={styles.state}>Loading report selection…</div> : data.rows.length === 0 ? <div className={styles.state}>No stocks matched this validated report.</div> : <div className={styles.scroller} tabIndex={0} aria-label="Futures volatility qualifying stocks">{data.rows.slice(0, 5).map(row => <Link to={`/analytics/stock/${encodeURIComponent(row.symbol)}`} key={`${row.sourceRevisionId}:${row.symbol}`}><b>#{row.matchRank} {row.symbol}</b><span>Δ vol <strong>{n(row.deltaBasisPoints)} bp</strong></span><span>Open→Close <em data-tone={row.openCloseChangePct == null ? "neutral" : Number(row.openCloseChangePct) >= 0 ? "positive" : "negative"}>{row.openCloseChangePct == null ? "—" : `${Number(row.openCloseChangePct) >= 0 ? "+" : ""}${n(row.openCloseChangePct)}%`}</em></span><small>{row.outcomeState.replaceAll("_", " ")}</small></Link>)}</div>}
    {data ? <footer>{data.counts.displayed} displayed of {data.counts.matched} qualifying report rows · price gaps do not remove membership</footer> : null}
  </section>;
}
