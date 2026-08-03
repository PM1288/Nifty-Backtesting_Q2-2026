import { Link } from "react-router-dom";
import { ErrorState, KpiCard, LoadingSkeletonCard, SectionDivider } from "../components/ui/DashboardPrimitives";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { useAuthGate } from "../auth/AuthGateProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { useBacktestingOverview } from "../lib/hooks";
import { formatDateIST, formatNumberIN } from "../lib/format";
import {
  BacktestingContextStrip,
  BacktestingDecisionBrief,
  BacktestingDrawdownChart,
  BacktestingEvidenceCards,
  BacktestingHeader,
  BacktestingLineChart,
  fmtCompactCurrency,
  fmtPct
} from "./BacktestingChrome";
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
      <div className={`${styles.page} ${styles.backtestingPage}`}>
        <LoadingSkeletonCard title={tr("Backtesting overview")} lines={4} />
      </div>
    );
  }

  if (overview.error || !overview.data) {
    return <ErrorState title={tr("The Backtesting overview is unavailable")} body={tr("The latest Backtesting overview could not load. Refresh and try again.")} />;
  }

  const data = overview.data;

  return (
    <div className={`${styles.page} ${styles.backtestingPage}`}>
      <BacktestingHeader
        title={tr("Backtesting Overview")}
        subtitle={tr("Use this as the landing page for historical strategy evidence built from daily market data.")}
        testRunAt={data.generatedAt}
        meta={`Data through ${formatDateIST(data.marketDate)} • ${data.snapshotAgeLabel}`}
      />

      <BacktestingContextStrip
        runLabel={tr("Latest published snapshot")}
        generatedAt={data.generatedAt}
        asOfDate={data.asOfDate}
        universe="nifty_100"
        capital="capital_16l"
        benchmark={data.quickStats.benchmarkLabel ?? "NIFTY 50 price index"}
      />

      <SectionDivider
        eyebrow={tr("Two-minute decision")}
        title={tr("What happened, and why")}
        subtitle={tr("Start with the portfolio verdict. Then separate closed-trade economics from the positions that remain open.")}
      />

      <BacktestingDecisionBrief summary={data.quickStats} />
      <BacktestingEvidenceCards summary={data.quickStats} />

      <SectionDivider
        eyebrow={tr("Money")}
        title={tr("Capital and economics")}
        subtitle={tr("Final portfolio value includes both realized results and the mark-to-market value of open positions.")}
      />

      <section className={styles.systemHealthRow}>
        <KpiCard label={tr("Starting capital")} value={fmtCompactCurrency(data.quickStats.investedAmount)} />
        <KpiCard label={tr("Ending portfolio")} value={fmtCompactCurrency(data.quickStats.currentValue)} tone={data.quickStats.currentValue >= data.quickStats.investedAmount ? "green" : "red"} />
        <KpiCard label={tr("Total portfolio return")} value={fmtPct(data.quickStats.totalReturnPct)} tone={data.quickStats.totalReturnPct >= 0 ? "green" : "red"} />
        <KpiCard label={tr("Excess vs NIFTY") } value={fmtCompactCurrency(data.quickStats.excessOverBenchmark ?? data.quickStats.excessOverFd)} tone={(data.quickStats.excessOverBenchmark ?? data.quickStats.excessOverFd ?? 0) >= 0 ? "green" : "red"} />
      </section>

      <section className={styles.systemHealthRow}>
        <KpiCard label={tr("After-tax realized P&L")} value={fmtCompactCurrency(data.quickStats.realizedPnl)} tone={data.quickStats.realizedPnl >= 0 ? "green" : "red"} meta={tr("Closed trades only")} />
        <KpiCard label={tr("Open-position P&L")} value={fmtCompactCurrency(data.quickStats.unrealizedPnl)} tone={data.quickStats.unrealizedPnl >= 0 ? "green" : "red"} meta={`${formatNumberIN(data.quickStats.openPositions)} ${tr("positions remain open")}`} />
        <KpiCard label={tr("35% profit-tax reserve")} value={fmtCompactCurrency(data.quickStats.taxDeducted ?? 0)} />
        <KpiCard label={tr("Transaction charges")} value={fmtCompactCurrency(data.quickStats.totalCharges)} />
        <KpiCard label={tr("Closed-trade win rate")} value={fmtPct(data.quickStats.winRatePct)} meta={tr("Does not include open positions")} />
        <KpiCard label={tr("Max drawdown")} value={fmtPct(data.quickStats.maxDrawdownPct)} tone="red" />
      </section>

      <SectionDivider
        eyebrow={tr("Risk")}
        title={tr("Path and drawdown")}
        subtitle={tr("A final number hides the journey. These charts show when value changed and how deep the portfolio fell from a prior peak.")}
      />

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

      <SectionDivider
        eyebrow={tr("Coverage")}
        title={tr("Snapshot scope")}
        subtitle={tr("Use these counts to understand the breadth and freshness of the evidence before opening a strategy or audit run.")}
      />
      <section className={styles.systemHealthRow}>
        <KpiCard label={tr("Last market date")} value={formatDateIST(data.marketDate)} />
        <KpiCard label={tr("Test run date")} value={formatDateIST(data.generatedAt, { includeTime: true })} meta={data.snapshotAgeLabel} />
        <KpiCard label={tr("Active strategies")} value={formatNumberIN(data.activeStrategies)} />
        <KpiCard label={tr("Symbols covered")} value={formatNumberIN(data.symbolsCovered)} />
        <KpiCard label={tr("Open positions today")} value={formatNumberIN(data.latestSnapshot.openPositionsToday)} />
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
