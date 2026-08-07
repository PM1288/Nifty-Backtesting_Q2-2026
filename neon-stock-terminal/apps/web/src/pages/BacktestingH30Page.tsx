import { useEffect, useState } from "react";
import { BacktestingHeader } from "./BacktestingChrome";
import styles from "./BacktestingH30Page.module.css";

type Result = {
  runId: string; strategyVersionId: string; status: string; diagnosticScore: number | null;
  finalScore: number | null; blockers: string[]; generatedAt: string;
  ranking: { summary: Record<string, unknown>; outcome_semantics: string };
  observations: Array<Record<string, unknown>>; charts: Array<{ chartId: string; format: string; url: string }>;
};

const fmt = (value: unknown) => typeof value === "number" ? value.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : String(value ?? "—");

export function BacktestingH30Page() {
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { fetch("/v1/backtesting/h30/latest").then(async (response) => {
    if (!response.ok) throw new Error((await response.json()).message ?? "H30 result unavailable");
    return response.json();
  }).then(setData).catch((reason) => setError(String(reason.message ?? reason))); }, []);
  const summary = data?.ranking.summary ?? {};
  return <main className={styles.page}>
    <BacktestingHeader title="30-session opportunity" subtitle="How far each entry travelled using official daily closes, independent of execution exits." testRunAt={data?.generatedAt} />
    <section className={styles.warning}><strong>Hindsight opportunity — not realised P&L</strong><span>The scan always observes D0 through D+29. Crossing 0.3%, 0.5%, 0.7%, 1%, 2% or 5% never stops this evaluation or releases capital.</span></section>
    {error && <section className={styles.error}>{error}</section>}
    {!data && !error && <section className={styles.loading}>Loading the latest H30 evidence…</section>}
    {data && <>
      <section className={styles.identity}><div><span>Run</span><strong>{data.runId}</strong></div><div><span>Strategy version</span><strong>{data.strategyVersionId}</strong></div><div><span>Rank status</span><strong>{data.status}</strong></div></section>
      <section className={styles.cards}>
        <article><span>Mature entries</span><strong>{fmt(summary.mature_entry_count)}</strong></article>
        <article><span>Coverage</span><strong>{fmt(summary.mature_coverage_pct)}%</strong></article>
        <article><span>Median after-tax opportunity</span><strong>{fmt(summary.median_after_tax_max_close_upside_pct)}%</strong></article>
        <article><span>Median sessions to max</span><strong>{fmt(summary.median_sessions_to_max)}</strong></article>
        <article><span>P95 drawdown before max</span><strong>{fmt(summary.p95_absolute_mae_before_max_pct)}%</strong></article>
        <article><span>Diagnostic score</span><strong>{fmt(data.diagnosticScore)}</strong></article>
      </section>
      <section className={styles.blockers}><h2>Ranking governance</h2><p>Final score: <strong>{fmt(data.finalScore)}</strong>. Diagnostic scores remain visible even when publication gates block ranking.</p><div>{data.blockers.map((value) => <span key={value}>{value.replaceAll("_", " ")}</span>)}</div></section>
      <section className={styles.charts}>{data.charts.filter((chart) => chart.format === "png").map((chart) => <figure key={chart.chartId}><img src={chart.url} alt={chart.chartId} /><figcaption>{chart.chartId.replaceAll("_", " ")}</figcaption></figure>)}</section>
      <section className={styles.table}><h2>Entry observations</h2><div><table><thead><tr><th>Stock</th><th>Entry</th><th>Coverage</th><th>Sessions</th><th>Max close</th><th>Day of max</th><th>After-tax opportunity</th><th>Drawdown before max</th></tr></thead><tbody>{data.observations.map((row, index) => <tr key={`${row.symbol}-${row.entryDate}-${index}`}><td>{fmt(row.symbol)}</td><td>{fmt(row.entryDate).slice(0,10)}</td><td>{fmt(row.coverageStatus)}</td><td>{fmt(row.sessionsObserved)}</td><td>{fmt(row.maxClosePrice)}</td><td>D+{fmt(row.sessionsToMax)}</td><td>{fmt(row.afterTaxUpsidePct)}%</td><td>{fmt(row.maeBeforeMaxPct)}%</td></tr>)}</tbody></table></div></section>
    </>}
  </main>;
}
