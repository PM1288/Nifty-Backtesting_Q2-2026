import { DataTable, ErrorState, KpiCard, LoadingSkeletonCard } from "../components/ui/DashboardPrimitives";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { useAuthGate } from "../auth/AuthGateProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { formatDateIST, formatNumberIN } from "../lib/format";
import { useBacktestingDailySummary } from "../lib/hooks";
import { BacktestingHeader, BacktestingHorizontalBarChart, fmtCompactCurrency, fmtPct } from "./BacktestingChrome";
import styles from "./AnalyticsPage.module.css";

export function BacktestingDailySummaryPage() {
  const { authReady } = useAuthGate();
  const { t, tr } = useI18n();
  const summary = useBacktestingDailySummary(authReady);

  usePageLoadProfile({
    pageName: "backtesting_daily_summary",
    enabled: authReady,
    queries: [{ name: "backtesting-daily-summary", isLoading: summary.isLoading, isError: !!summary.error }]
  });

  if (!authReady || summary.isLoading) return <LoadingSkeletonCard title={tr("Daily Summary")} lines={5} />;
  if (summary.error || !summary.data) return <ErrorState title={tr("Daily Summary is unavailable")} body={tr("The latest backtesting daily snapshot could not be loaded.")} />;

  const skippedReasonRows = Object.values(
    summary.data.skippedSignals.reduce<Record<string, { label: string; value: number; tone: "red" | "white" | "green" }>>((all, item) => {
      const key = item.reason || "other";
      all[key] = {
        label: key.replace(/_/g, " "),
        value: (all[key]?.value ?? 0) + 1,
        tone: /cash|ticket|existing/i.test(key) ? "red" : "white"
      };
      return all;
    }, {})
  ).sort((left, right) => right.value - left.value);

  return (
    <div className={`${styles.page} ${styles.backtestingPage}`}>
      <BacktestingHeader
        title={tr("Daily Summary")}
        subtitle={tr("This is the latest day-level read after the snapshot updates: entries, exits, open positions, skipped signals, and deployment.")}
        testRunAt={summary.data.generatedAt}
        meta={t("literals.As of {{date}}", "As of {{date}}", { date: formatDateIST(summary.data.asOfDate) })}
      />

      <section className={styles.systemHealthRow}>
        <KpiCard label={tr("Open positions")} value={formatNumberIN(summary.data.deployment.openPositions)} />
        <KpiCard label={tr("Exposure")} value={fmtPct(summary.data.deployment.exposurePct)} />
        <KpiCard label={tr("Daily portfolio delta (₹)")} value={fmtCompactCurrency(summary.data.deployment.dailyPortfolioDelta)} tone={summary.data.deployment.dailyPortfolioDelta >= 0 ? "green" : "red"} />
        <KpiCard label={tr("Daily benchmark delta (₹)")} value={fmtCompactCurrency(summary.data.deployment.dailyBenchmarkDelta)} tone={summary.data.deployment.dailyBenchmarkDelta >= 0 ? "green" : "red"} />
      </section>

      <article className={styles.chartPanel}>
        <div className={styles.chartHeader}>
          <div>
            <h3 className={styles.panelTitle}>{tr("Skipped-signal reasons")}</h3>
            <div className={styles.chartCaption}>{tr("This shows whether the latest day was constrained by cash, ticket size, or existing-position rules.")}</div>
          </div>
        </div>
        <BacktestingHorizontalBarChart items={skippedReasonRows.map((item) => ({ ...item, label: tr(item.label) }))} xAxisName={tr("Skipped signals")} valueFormatter="number" />
      </article>

      <section className={styles.grid2}>
        <DataTable
          title={tr("Today's new entries")}
          rows={summary.data.latestEntries}
          maxHeight={280}
          columns={[
            { key: "symbol", header: tr("Symbol"), cell: (row) => row.symbol },
            { key: "entryDate", header: tr("Entry date"), cell: (row) => row.entryDate },
            { key: "returnPct", header: tr("Return so far"), align: "right", cell: (row) => fmtPct(row.returnPct) }
          ]}
        />
        <DataTable
          title={tr("Today's exits")}
          rows={summary.data.latestExits}
          maxHeight={280}
          columns={[
            { key: "symbol", header: tr("Symbol"), cell: (row) => row.symbol },
            { key: "exitDate", header: tr("Exit date"), cell: (row) => row.exitDate ?? "—" },
            { key: "exitReason", header: tr("Reason"), cell: (row) => tr(row.exitReason) },
            { key: "returnPct", header: tr("Return"), align: "right", cell: (row) => fmtPct(row.returnPct) }
          ]}
        />
      </section>

      <DataTable
        title={tr("Current open positions")}
        rows={summary.data.currentOpenPositions}
        maxHeight={360}
        columns={[
          { key: "symbol", header: tr("Symbol"), cell: (row) => row.symbol },
          { key: "entryDate", header: "Entry", cell: (row) => row.entryDate },
          { key: "markPrice", header: "Mark", align: "right", cell: (row) => fmtCompactCurrency(row.markPrice) },
          { key: "pnl", header: "Unrealized", align: "right", cell: (row) => fmtCompactCurrency(row.unrealizedPnl) },
          { key: "regime", header: "Regime", cell: (row) => row.regimeOnEntry }
        ]}
      />

      <DataTable
        title={tr("Skipped signals")}
        rows={summary.data.skippedSignals}
        maxHeight={320}
        columns={[
          { key: "date", header: "Date", cell: (row) => row.date },
          { key: "symbol", header: "Symbol", cell: (row) => row.symbol },
          { key: "reason", header: "Reason", cell: (row) => row.reason },
          { key: "detail", header: "Detail", cell: (row) => row.detail }
        ]}
      />
    </div>
  );
}
