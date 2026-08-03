import { Link } from "react-router-dom";
import { ErrorState, KpiCard, LoadingSkeletonCard, SectionDivider } from "../components/ui/DashboardPrimitives";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { useAuthGate } from "../auth/AuthGateProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { useBacktestingOverview } from "../lib/hooks";
import { formatDateIST, formatNumberIN } from "../lib/format";
import { BacktestingHeader, BacktestingDrawdownChart, BacktestingLineChart, fmtCompactCurrency, fmtPct } from "./BacktestingChrome";
import styles from "./AnalyticsPage.module.css";

export function BacktestingOverviewPage() {
  const { authReady } = useAuthGate();
  const { tr } = useI18n();
  const overview = useBacktestingOverview(authReady);

  usePageLoadProfile({
    pageName: "backtesting_overview",
    enabled: authReady,
    queries: [{ name: "backtesting-overview", isLoading: overview.isLoading, isError: !!overview.error }]
  });

  if (!authReady || overview.isLoading) {
    return (
      <div className={styles.page}>
        <LoadingSkeletonCard title={tr("Backtesting overview")} lines={4} />
      </div>
    );
  }

  if (overview.error || !overview.data) {
    return <ErrorState title={tr("The Backtesting overview is unavailable")} body={tr("The latest Backtesting overview could not load. Refresh and try again.")} />;
  }

  const data = overview.data;

  return (
    <div className={styles.page}>
      <BacktestingHeader
        title={tr("Backtesting Overview")}
        subtitle={tr("Use this as the landing page for historical strategy evidence built from daily market data.")}
        testRunAt={data.generatedAt}
        meta={`Data through ${formatDateIST(data.marketDate)} • ${data.snapshotAgeLabel}`}
      />

      <SectionDivider
        eyebrow={tr("Overview")}
        title={tr("Latest snapshot")}
        subtitle={tr("This page gives you the latest strategy evidence, key assumptions, and a quick read before you drill into details.")}
      />

      <section className={styles.systemHealthRow}>
        <KpiCard label={tr("Last market date")} value={formatDateIST(data.marketDate)} />
        <KpiCard label={tr("Test run date")} value={formatDateIST(data.generatedAt, { includeTime: true })} meta={data.snapshotAgeLabel} />
        <KpiCard label={tr("Active strategies")} value={formatNumberIN(data.activeStrategies)} />
        <KpiCard label={tr("Symbols covered")} value={formatNumberIN(data.symbolsCovered)} />
        <KpiCard label={tr("Open positions today")} value={formatNumberIN(data.latestSnapshot.openPositionsToday)} />
      </section>

      <section className={styles.systemHealthRow}>
        <KpiCard label={tr("Final value")} value={fmtCompactCurrency(data.quickStats.currentValue)} />
        <KpiCard label={tr("Total return")} value={fmtPct(data.quickStats.totalReturnPct)} tone={data.quickStats.totalReturnPct >= 0 ? "green" : "red"} />
        <KpiCard label={tr("Win rate")} value={fmtPct(data.quickStats.winRatePct)} />
        <KpiCard label={tr("Max drawdown")} value={fmtPct(data.quickStats.maxDrawdownPct)} tone="red" />
        <KpiCard label={tr("Total charges")} value={fmtCompactCurrency(data.quickStats.totalCharges)} />
        <KpiCard label={tr("Open positions")} value={formatNumberIN(data.quickStats.openPositions)} />
      </section>

      <section className={styles.grid2}>
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Mini equity curve")}</h3>
              <div className={styles.chartCaption}>{tr("After-cost, after-tax-reserve strategy equity versus the NIFTY 50 price index over the same dates.")}</div>
            </div>
          </div>
          <BacktestingLineChart points={data.miniEquityCurve} benchmark />
        </article>
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Mini drawdown")}</h3>
              <div className={styles.chartCaption}>{tr("This highlights the worst peak-to-trough pain before you inspect trades.")}</div>
            </div>
          </div>
          <BacktestingDrawdownChart points={data.miniDrawdownCurve} />
        </article>
      </section>

      <section className={styles.nextSteps}>
        {data.shortcuts.map((shortcut) => (
          <Link key={shortcut.to} to={shortcut.to} className={styles.nextCard}>
            <div className={styles.guideTitle}>{shortcut.label}</div>
            <div className={styles.guideText}>{tr("Open the next backtesting step.")}</div>
          </Link>
        ))}
      </section>
    </div>
  );
}
