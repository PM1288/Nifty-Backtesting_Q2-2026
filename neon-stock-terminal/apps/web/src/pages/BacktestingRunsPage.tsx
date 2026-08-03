import { DataTable, ErrorState, KpiCard, LoadingTableCard } from "../components/ui/DashboardPrimitives";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { useAuthGate } from "../auth/AuthGateProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { useBacktestingRuns } from "../lib/hooks";
import { formatDateIST, formatNumber } from "../lib/format";
import { BacktestingGroupedBarChart, BacktestingHeader, fmtCompactCurrency } from "./BacktestingChrome";
import styles from "./AnalyticsPage.module.css";

export function BacktestingRunsPage() {
  const { authReady } = useAuthGate();
  const { tr } = useI18n();
  const runs = useBacktestingRuns(authReady);

  usePageLoadProfile({
    pageName: "backtesting_runs",
    enabled: authReady,
    queries: [{ name: "backtesting-runs", isLoading: runs.isLoading, isError: !!runs.error }]
  });

  if (!authReady || runs.isLoading) return <LoadingTableCard title={tr("Runs / Audit")} rows={6} />;
  if (runs.error || !runs.data) return <ErrorState title={tr("Runs / Audit is unavailable")} body={tr("The Backtesting audit snapshot could not be loaded.")} />;

  const latestRun = runs.data.runs[0];
  const lastSuccessfulRun = runs.data.runs.find((row) => row.status.toLowerCase().includes("success") || row.status.toLowerCase().includes("published")) ?? null;
  const warningCount = runs.data.runs.reduce((sum, row) => sum + row.warningsCount, 0);
  const errorCount = runs.data.runs.reduce((sum, row) => sum + row.errorsCount, 0);
  const runCategories = runs.data.runs.slice(0, 8).map((row) => formatDateIST(row.asOfDate));

  return (
    <div className={styles.page}>
      <BacktestingHeader
        title={tr("Runs / Audit")}
        subtitle={tr("Operational transparency for the Backtesting module: published runs, validations, warnings, and last-known-good snapshot.")}
        meta={`Last known good ${formatDateIST(runs.data.lastKnownGoodSnapshot.asOfDate)}`}
      />

      <section className={styles.systemHealthRow}>
        <KpiCard label={tr("Latest published run")} value={latestRun?.runId ?? "—"} meta={latestRun ? formatDateIST(latestRun.asOfDate) : "—"} />
        <KpiCard label={tr("Last successful run")} value={lastSuccessfulRun?.runId ?? "—"} meta={lastSuccessfulRun ? formatDateIST(lastSuccessfulRun.asOfDate) : "—"} />
        <KpiCard label={tr("Warnings")} value={formatNumber(warningCount, { maximumFractionDigits: 0 })} tone={warningCount > 0 ? "red" : "white"} />
        <KpiCard label={tr("Errors")} value={formatNumber(errorCount, { maximumFractionDigits: 0 })} tone={errorCount > 0 ? "red" : "white"} />
        <KpiCard label={tr("Stocks in latest run")} value={formatNumber(latestRun?.symbolsCovered ?? 0, { maximumFractionDigits: 0 })} />
        <KpiCard label={tr("Trades in latest run")} value={formatNumber(latestRun?.tradeCount ?? 0, { maximumFractionDigits: 0 })} />
        <KpiCard label={tr("Latest after-tax P&L")} value={fmtCompactCurrency(latestRun?.afterTaxNetPnl ?? 0)} tone={(latestRun?.afterTaxNetPnl ?? 0) >= 0 ? "green" : "red"} meta={tr("35% reserve on positive realized trade profit")} />
      </section>

      <section className={styles.grid2}>
        <article className={styles.panel}>
          <div className={styles.panelTitle}>{tr("Last known good snapshot")}</div>
          <div className={styles.strong}>{runs.data.lastKnownGoodSnapshot.key}</div>
          <div className={styles.muted}>{formatDateIST(runs.data.lastKnownGoodSnapshot.generatedAt, { includeTime: true })}</div>
        </article>
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Recent run health")}</h3>
              <div className={styles.chartCaption}>{tr("Rows processed, warnings, and errors over recent runs so an operator can spot degradation before reading raw tables.")}</div>
            </div>
          </div>
          <BacktestingGroupedBarChart
            categories={runCategories}
            series={[
              { name: tr("Rows processed"), values: runs.data.runs.slice(0, 8).map((row) => row.rowsProcessed) },
              { name: tr("Warnings"), values: runs.data.runs.slice(0, 8).map((row) => row.warningsCount) },
              { name: tr("Errors"), values: runs.data.runs.slice(0, 8).map((row) => row.errorsCount) }
            ]}
            xAxisName={tr("Run date")}
            yAxisName={tr("Count")}
            formatter="number"
          />
        </article>
      </section>

      <DataTable
        title={tr("Batch runs")}
        rows={runs.data.runs}
        maxHeight={420}
        columns={[
          { key: "runId", header: tr("Run ID"), cell: (row) => row.runId },
          { key: "date", header: tr("As-of date"), cell: (row) => formatDateIST(row.asOfDate) },
          { key: "generated", header: tr("Generated"), cell: (row) => formatDateIST(row.generatedAt, { includeTime: true }) },
          { key: "status", header: tr("Status"), cell: (row) => tr(row.status) },
          { key: "universe", header: tr("Universe"), cell: (row) => tr(row.universeMode) },
          { key: "capital", header: tr("Capital"), cell: (row) => tr(row.capitalMode) },
          { key: "symbols", header: tr("Stocks"), align: "right", cell: (row) => formatNumber(row.symbolsCovered ?? 0, { maximumFractionDigits: 0 }) },
          { key: "trades", header: tr("Trades"), align: "right", cell: (row) => formatNumber(row.tradeCount ?? 0, { maximumFractionDigits: 0 }) },
          { key: "net", header: tr("Pre-tax net P&L"), align: "right", cell: (row) => fmtCompactCurrency(row.netPnl ?? 0) },
          { key: "tax", header: tr("35% profit reserve"), align: "right", cell: (row) => fmtCompactCurrency(row.taxDeducted ?? 0) },
          { key: "afterTax", header: tr("After-tax P&L"), align: "right", cell: (row) => fmtCompactCurrency(row.afterTaxNetPnl ?? 0) },
          { key: "rows", header: tr("Rows"), align: "right", cell: (row) => formatNumber(row.rowsProcessed, { maximumFractionDigits: 0 }) },
          { key: "warn", header: tr("Warnings"), align: "right", cell: (row) => formatNumber(row.warningsCount, { maximumFractionDigits: 0 }) },
          { key: "err", header: tr("Errors"), align: "right", cell: (row) => formatNumber(row.errorsCount, { maximumFractionDigits: 0 }) }
        ]}
      />

      <DataTable
        title={tr("Validation checks")}
        rows={runs.data.validations}
        maxHeight={360}
        columns={[
          { key: "runId", header: tr("Run ID"), cell: (row) => row.runId },
          { key: "name", header: tr("Validation"), cell: (row) => tr(row.validationName) },
          { key: "status", header: tr("Status"), cell: (row) => tr(row.status) },
          { key: "created", header: tr("Recorded"), cell: (row) => formatDateIST(row.createdAt, { includeTime: true }) },
          { key: "details", header: tr("Details"), cell: (row) => JSON.stringify(row.details) }
        ]}
      />
    </div>
  );
}
