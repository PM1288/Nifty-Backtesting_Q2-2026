import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Table2 } from "lucide-react";
import styles from "./BacktestingReportsPage.module.css";

type ReportPayload = {
  id: string;
  summary: { generatedAt: string; dataStart: string; evaluationStart: string; dataEnd: string; symbols: number; signals: number; summary: Array<{ direction: string; basis: string; count: number; return1: number | null; return5: number | null; return15: number | null; maxFavourable15: number | null; maxDrawdown15: number | null; hit3: number | null }> };
  files: Array<{ name: string; bytes: number; url: string }>;
};
const fmt = (value: number | null) => value == null ? "—" : `${value.toFixed(2)}%`;
const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function BacktestingReportsPage() {
  const query = useQuery({ queryKey: ["backtesting-reports", "three-month"], queryFn: async () => { const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ""}/v1/backtesting/reports/three-month/latest`, { credentials: "include" }); if (!response.ok) throw new Error(`Report API ${response.status}`); return response.json() as Promise<ReportPayload>; }, staleTime: 60_000 });
  const report = query.data;
  return <main className={styles.page} data-testid="backtesting-reports">
    <header><div><span>RESEARCH DOWNLOADS</span><h1>Backtesting Reports</h1><p>Auditable strategy reports and complete trade ledgers. Downloads preserve missing values and source cutoffs.</p></div></header>
    {query.isLoading ? <section className={styles.state}>Loading report catalogue…</section> : query.isError || !report ? <section className={styles.state} role="alert">The generated report is not currently mounted. No placeholder results are shown.</section> : <>
      <section className={styles.hero}><div><h2>3Month Bull/Bear Reversal</h2><p>{report.summary.evaluationStart} → {report.summary.dataEnd} · {report.summary.symbols} symbols · {report.summary.signals.toLocaleString("en-IN")} fresh qualification transitions</p><small>Same-day-open results are explicitly look-ahead. Use next-day-open rows for the causal comparison.</small></div><div className={styles.downloads}>{report.files.filter((file) => /\.(pdf|csv)$/i.test(file.name)).map((file) => <a key={file.name} href={`${import.meta.env.VITE_API_BASE_URL ?? ""}${file.url}`} download><span>{file.name.endsWith(".pdf") ? <FileText /> : <Table2 />}<b>{file.name.endsWith(".pdf") ? "Download PDF report" : "Download complete CSV"}</b><small>{size(file.bytes)}</small></span><Download /></a>)}</div></section>
      <section className={styles.summary}><h2>Performance summary</h2><div className={styles.table}><table><thead><tr><th>Direction</th><th>Entry basis</th><th>Signals</th><th>1D</th><th>5D</th><th>15D</th><th>15D MFE</th><th>15D MDD</th><th>Reached +3%</th></tr></thead><tbody>{report.summary.summary.map((row) => <tr key={`${row.direction}-${row.basis}`}><th data-direction={row.direction.toLowerCase()}>{row.direction}</th><td>{row.basis === "requested" ? "Same-day open · look-ahead" : "Next-day open · causal"}</td><td>{row.count.toLocaleString("en-IN")}</td><td>{fmt(row.return1)}</td><td>{fmt(row.return5)}</td><td>{fmt(row.return15)}</td><td>{fmt(row.maxFavourable15)}</td><td>{fmt(row.maxDrawdown15)}</td><td>{fmt(row.hit3)}</td></tr>)}</tbody></table></div></section>
      <section className={styles.notes}><h2>Report contents</h2><p>Page 1 contains exact BULL/BEAR conditions and timing limitations. Page 2 contains the aggregate summary. The following pages contain the complete trade ledger and one evidence page per selected stock with Daily, Weekly and Monthly OHLC plus EMA9.</p><p>Historical 1H/15m confirmation is not claimed in this daily-only report because retained minute data does not cover the full evaluation year.</p></section>
    </>}
  </main>;
}
