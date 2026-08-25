import { useSearchParams } from "react-router-dom";
import { DataTable, ErrorState, KpiCard, LoadingSkeletonCard } from "../components/ui/DashboardPrimitives";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { useAuthGate } from "../auth/AuthGateProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { useBacktestingStrategy } from "../lib/hooks";
import { formatNumber } from "../lib/format";
import {
  BacktestingDeploymentChart,
  BacktestingFilterBar,
  BacktestingHeader,
  BacktestingHorizontalBarChart,
  BacktestingLineChart,
  fmtCompactCurrency,
  fmtPct,
  useBacktestingScenario
} from "./BacktestingChrome";
import styles from "./AnalyticsPage.module.css";

export function BacktestingPortfolioResultsPage() {
  const [searchParams] = useSearchParams();
  const { authReady } = useAuthGate();
  const { t, tr } = useI18n();
  const scenarioKey = searchParams.get("scenario");
  const detail = useBacktestingStrategy("rsi30_willr80_closegtprev_tp125", scenarioKey, authReady);
  const { scenario } = useBacktestingScenario(detail.data ?? null);

  usePageLoadProfile({
    pageName: "backtesting_results",
    enabled: authReady,
    queries: [{ name: `backtesting-strategy:rsi30_willr80_closegtprev_tp125:${scenarioKey ?? "default"}`, isLoading: detail.isLoading, isError: !!detail.error }]
  });

  if (!authReady || detail.isLoading) return <LoadingSkeletonCard title={tr("Portfolio Results")} lines={5} />;
  if (detail.error || !detail.data) return <ErrorState title={tr("Portfolio Results are unavailable")} body={tr("The strategy result snapshot could not be loaded.")} />;

  if (!scenario) return <ErrorState title={tr("Scenario unavailable")} body={tr("The selected portfolio scenario could not be resolved.")} />;
  const exitReasons = Object.values(
    scenario.trades.reduce<Record<string, { label: string; value: number; tone: "green" | "red" | "white" }>>((all, trade) => {
      const key = trade.exitReason || "open";
      all[key] = {
        label: key.replace(/_/g, " "),
        value: (all[key]?.value ?? 0) + 1,
        tone: /target|profit/i.test(key) ? "green" : /stop|timeout|bearish|below/i.test(key) ? "red" : "white"
      };
      return all;
    }, {})
  ).sort((left, right) => right.value - left.value);
  const openDistribution = scenario.openPositions
    .map((row) => ({
      label: row.symbol,
      value: row.unrealizedPnl,
      tone: (row.unrealizedPnl >= 0 ? "green" : "red") as "green" | "red"
    }))
    .sort((left, right) => right.value - left.value);

  return (
    <div className={`${styles.page} ${styles.backtestingPage}`}>
      <BacktestingHeader
        title={tr("Portfolio Results")}
        subtitle={tr("Portfolio-level outcomes across the selected universe and capital bucket.")}
        testRunAt={detail.data.generatedAt}
        meta={t("literals.Scenario {{label}}", "Scenario {{label}}", { label: tr(scenario.label) })}
      />
      <BacktestingFilterBar filters={detail.data.filters} detail={detail.data} />

      <section className={styles.systemHealthRow}>
        <KpiCard label={tr("Invested amount")} value={fmtCompactCurrency(scenario.summary.investedAmount)} />
        <KpiCard label={tr("Current value")} value={fmtCompactCurrency(scenario.summary.currentValue)} />
        <KpiCard label={tr("Realized P&L")} value={fmtCompactCurrency(scenario.summary.realizedPnl)} tone={scenario.summary.realizedPnl >= 0 ? "green" : "red"} />
        <KpiCard label={tr("Unrealized P&L")} value={fmtCompactCurrency(scenario.summary.unrealizedPnl)} tone={scenario.summary.unrealizedPnl >= 0 ? "green" : "red"} />
        <KpiCard label={tr("Closed-trade win rate")} value={fmtPct(scenario.summary.winRatePct)} />
        <KpiCard label={tr("Cash balance")} value={fmtCompactCurrency(scenario.summary.cashBalance)} />
        <KpiCard label={tr("Exposure")} value={fmtPct(scenario.summary.exposurePct)} />
        <KpiCard label={tr("Max open")} value={formatNumber(scenario.summary.maxOpenPositionsReached, { maximumFractionDigits: 0 })} />
      </section>

      <section className={styles.grid2}>
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Equity vs FD")}</h3>
              <div className={styles.chartCaption}>{tr("What this chart shows: the scenario equity curve against the NIFTY 50 price benchmark over the same period.")}</div>
            </div>
          </div>
          <BacktestingLineChart points={scenario.equityCurve} benchmark />
        </article>
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Capital deployment")}</h3>
              <div className={styles.chartCaption}>{tr("Capital deployed and open-position count should rise and fall together, but they are not the same unit.")}</div>
            </div>
          </div>
          <BacktestingDeploymentChart points={scenario.capitalDeploymentCurve} />
        </article>
      </section>

      <section className={styles.grid2}>
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Exit reason breakdown")}</h3>
              <div className={styles.chartCaption}>{tr("Use this before the raw trades table so you can see how the scenario is actually resolving.")}</div>
            </div>
          </div>
          <BacktestingHorizontalBarChart items={exitReasons} xAxisName={tr("Closed Trades")} valueFormatter="number" />
        </article>
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Open-position P/L distribution")}</h3>
              <div className={styles.chartCaption}>{tr("This isolates mark-to-market pressure in currently open names instead of mixing it into closed-trade statistics.")}</div>
            </div>
          </div>
          <BacktestingHorizontalBarChart items={openDistribution} xAxisName={tr("Unrealized P&L (₹)")} valueFormatter="currency" />
        </article>
      </section>

      <DataTable
        title={tr("Closed and open trades")}
        rows={scenario.trades}
        maxHeight={460}
        columns={[
          { key: "symbol", header: tr("Symbol"), cell: (row) => row.symbol },
          { key: "entry", header: tr("Entry"), cell: (row) => row.entryDate },
          { key: "exit", header: tr("Exit"), cell: (row) => row.exitDate ?? tr("Open") },
          { key: "reason", header: tr("Exit reason"), cell: (row) => tr(row.exitReason) },
          { key: "ret", header: tr("Return"), align: "right", cell: (row) => fmtPct(row.returnPct) },
          { key: "hold", header: tr("Hold"), align: "right", cell: (row) => `${row.holdingDays}d` },
          { key: "charges", header: tr("Charges"), align: "right", cell: (row) => fmtCompactCurrency(row.charges) },
          { key: "quality", header: tr("Trade quality"), align: "right", cell: (row) => row.tradeQuality?.totalScore == null
            ? `${tr("Not estimable")} · ${row.tradeQuality?.process.coveragePct?.toFixed(0) ?? 0}% process evidence`
            : `${row.tradeQuality.totalScore.toFixed(2)} · ${tr(row.tradeQuality.label)}` }
        ]}
      />

      <DataTable
        title={tr("Skipped signals")}
        rows={scenario.skippedSignals}
        maxHeight={320}
        columns={[
          { key: "date", header: tr("Date"), cell: (row) => row.date },
          { key: "symbol", header: tr("Symbol"), cell: (row) => row.symbol },
          { key: "reason", header: tr("Reason"), cell: (row) => tr(row.reason) },
          { key: "detail", header: tr("Detail"), cell: (row) => tr(row.detail) }
        ]}
      />
    </div>
  );
}
