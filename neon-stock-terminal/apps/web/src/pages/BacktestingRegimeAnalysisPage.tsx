import { useSearchParams } from "react-router-dom";
import { DataTable, ErrorState, KpiCard, LoadingSkeletonCard } from "../components/ui/DashboardPrimitives";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { useAuthGate } from "../auth/AuthGateProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { formatDateIST, formatNumber } from "../lib/format";
import { useBacktestingCompare } from "../lib/hooks";
import {
  BacktestingCompareScopeBar,
  BacktestingGroupedBarChart,
  BacktestingHeader,
  fmtCompactCurrency,
  fmtPct,
  humanizeArchetype
} from "./BacktestingChrome";
import styles from "./AnalyticsPage.module.css";

export function BacktestingRegimeAnalysisPage() {
  const { t, tr } = useI18n();
  const { authReady } = useAuthGate();
  const compare = useBacktestingCompare(authReady);
  const [searchParams, setSearchParams] = useSearchParams();
  const capitalMode = searchParams.get("capital") ?? "capital_16l";
  const universeMode = searchParams.get("universe") ?? "nifty_100";

  usePageLoadProfile({
    pageName: "backtesting_regimes",
    enabled: authReady,
    queries: [{ name: "backtesting-compare", isLoading: compare.isLoading, isError: !!compare.error }]
  });

  const setFilter = (key: "capital" | "universe", value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  if (!authReady || compare.isLoading) return <LoadingSkeletonCard title={tr("Regime Analysis")} lines={6} />;
  if (compare.error || !compare.data) return <ErrorState title={tr("Regime Analysis is unavailable")} body={tr("The regime comparison snapshot could not be loaded.")} />;

  const regimeCompare = compare.data.regimeCompare.filter((row) => row.capitalMode === capitalMode && row.universeMode === universeMode);
  const flattened = regimeCompare.flatMap((row) => row.regimes.map((regime) => ({ strategy: tr(row.displayName), archetype: row.archetype, ...regime })));
  const best = [...flattened].sort((left, right) => right.avgReturnPct - left.avgReturnPct)[0];
  const worst = [...flattened].sort((left, right) => left.avgReturnPct - right.avgReturnPct)[0];

  return (
    <div className={`${styles.page} ${styles.backtestingPage}`}>
      <BacktestingHeader
        title={tr("Regime Analysis")}
        subtitle={tr("Entry-date regimes use NIFTY 50 trend/return plus India VIX level and change. Shock: |NIFTY daily return| ≥1.75% or VIX jump ≥15%; Volatile: VIX at/above its trailing 75th percentile; otherwise Rising, Falling, or Neutral from 20/50-day trend.")}
        testRunAt={compare.data.generatedAt}
        meta={t("literals.As of {{date}}", "As of {{date}}", { date: formatDateIST(compare.data.asOfDate) })}
      />

      <BacktestingCompareScopeBar
        universeMode={universeMode}
        capitalMode={capitalMode}
        onUniverseChange={(value) => setFilter("universe", value)}
        onCapitalChange={(value) => setFilter("capital", value)}
      />

      <section className={styles.systemHealthRow}>
        <KpiCard label={tr("Best regime edge")} value={best ? `${best.strategy} • ${tr(best.regime)}` : "—"} meta={best ? fmtPct(best.avgReturnPct) : "—"} tone="green" />
        <KpiCard label={tr("Weakest regime edge")} value={worst ? `${worst.strategy} • ${tr(worst.regime)}` : "—"} meta={worst ? fmtPct(worst.avgReturnPct) : "—"} tone="red" />
        <KpiCard label={tr("Rows compared")} value={formatNumber(flattened.length, { maximumFractionDigits: 0 })} />
      </section>

      <section className={styles.grid2}>
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Regime win-rate bars")}</h3>
              <div className={styles.chartCaption}>{tr("What this chart shows: each row is one strategy-regime pair under the same scenario lens.")}</div>
            </div>
          </div>
          <BacktestingGroupedBarChart
            categories={["Rising", "Falling", "Volatile", "Shock", "Neutral"]}
            series={regimeCompare.map((row) => ({
              name: tr(row.displayName),
              values: ["Rising", "Falling", "Volatile", "Shock", "Neutral"].map((regime) => row.regimes.find((item) => item.regime === regime)?.winRatePct ?? 0)
            }))}
            xAxisName={tr("Regime")}
            yAxisName={tr("Win Rate %")}
            formatter="percent"
          />
        </article>
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Regime average-return bars")}</h3>
              <div className={styles.chartCaption}>{tr("This is where trend-following and mean-reversion should start separating visibly.")}</div>
            </div>
          </div>
          <BacktestingGroupedBarChart
            categories={["Rising", "Falling", "Volatile", "Shock", "Neutral"]}
            series={regimeCompare.map((row) => ({
              name: tr(row.displayName),
              values: ["Rising", "Falling", "Volatile", "Shock", "Neutral"].map((regime) => row.regimes.find((item) => item.regime === regime)?.avgReturnPct ?? 0)
            }))}
            xAxisName={tr("Regime")}
            yAxisName={tr("Avg Return %")}
            formatter="percent"
          />
        </article>
      </section>

      <DataTable
        title={tr("Regime breakdown by strategy")}
        subtitle={tr("Use this table to compare win rate, average return, hold time, and charge load by regime across the three archetypes.")}
        rows={flattened}
        maxHeight={460}
        columns={[
          { key: "strategy", header: tr("Strategy"), cell: (row) => row.strategy },
          { key: "archetype", header: tr("Archetype"), cell: (row) => tr(humanizeArchetype(row.archetype)) },
          { key: "regime", header: tr("Regime"), cell: (row) => tr(row.regime) },
          { key: "trades", header: tr("Trades"), align: "right", cell: (row) => formatNumber(row.tradeCount, { maximumFractionDigits: 0 }) },
          { key: "win", header: tr("Win rate"), align: "right", cell: (row) => fmtPct(row.winRatePct) },
          { key: "avg", header: tr("Avg return"), align: "right", cell: (row) => fmtPct(row.avgReturnPct) },
          { key: "median", header: tr("Median"), align: "right", cell: (row) => fmtPct(row.medianReturnPct) },
          { key: "hold", header: tr("Avg hold"), align: "right", cell: (row) => `${row.avgHoldDays}d` },
          { key: "charges", header: tr("Charges"), align: "right", cell: (row) => fmtCompactCurrency(row.totalCharges) }
        ]}
      />
    </div>
  );
}
