import { useSearchParams } from "react-router-dom";
import { DataTable, ErrorState, KpiCard, LoadingSkeletonCard } from "../components/ui/DashboardPrimitives";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { useAuthGate } from "../auth/AuthGateProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { formatDateIST, formatNumberIN } from "../lib/format";
import { useBacktestingCompare } from "../lib/hooks";
import { hasQualifiedStockFitSample } from "../lib/backtestingAcceptance";
import {
  BacktestingCompareScopeBar,
  BacktestingHeader,
  BacktestingHorizontalBarChart,
  BacktestingScatterChart,
  fmtCompactCurrency,
  fmtPct,
  humanizeArchetype
} from "./BacktestingChrome";
import styles from "./AnalyticsPage.module.css";

export function BacktestingStockInsightsPage() {
  const { authReady } = useAuthGate();
  const { t, tr } = useI18n();
  const compare = useBacktestingCompare(authReady);
  const [searchParams, setSearchParams] = useSearchParams();
  const capitalMode = searchParams.get("capital") ?? "capital_16l";
  const universeMode = searchParams.get("universe") ?? "nifty_100";

  usePageLoadProfile({
    pageName: "backtesting_stocks",
    enabled: authReady,
    queries: [{ name: "backtesting-compare", isLoading: compare.isLoading, isError: !!compare.error }]
  });

  const setFilter = (key: "capital" | "universe", value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  if (!authReady || compare.isLoading) return <LoadingSkeletonCard title={tr("Stock Insights")} lines={6} />;
  if (compare.error || !compare.data) return <ErrorState title={tr("Stock Insights are unavailable")} body={tr("The stock-suitability snapshot could not be loaded.")} />;

  const rows = compare.data.stockSuitability
    .filter((row) => row.capitalMode === capitalMode && row.universeMode === universeMode)
    .sort((left, right) => right.totalNetPnl - left.totalNetPnl);

  const sampleQualified = rows.filter((row) => hasQualifiedStockFitSample(row.acceptedTrades));
  const top = sampleQualified[0];
  const bottom = [...sampleQualified].sort((left, right) => left.totalNetPnl - right.totalNetPnl)[0];
  const bestWin = [...sampleQualified].sort((left, right) => right.winRatePct - left.winRatePct)[0];

  return (
    <div className={`${styles.page} ${styles.backtestingPage}`}>
      <BacktestingHeader
        title={tr("Stock Insights")}
        subtitle={tr("This page compares stock suitability across all three strategy archetypes, so you can see where each style tends to fit or fail.")}
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
        <KpiCard label={tr("Top sample-qualified fit")} value={top ? `${top.symbol} • ${tr(top.displayName)}` : "Inconclusive"} meta={top ? `${fmtCompactCurrency(top.totalNetPnl)} · ${top.acceptedTrades} trades` : tr("No stock has at least 10 accepted trades")} tone={top && top.totalNetPnl > 0 ? "green" : undefined} />
        <KpiCard label={tr("Weakest fit")} value={bottom ? `${bottom.symbol} • ${tr(bottom.displayName)}` : "—"} meta={bottom ? fmtCompactCurrency(bottom.totalNetPnl) : "—"} tone="red" />
        <KpiCard label={tr("Best sample-qualified win rate")} value={bestWin ? `${bestWin.symbol} • ${tr(bestWin.displayName)}` : "Inconclusive"} meta={bestWin ? `${fmtPct(bestWin.winRatePct)} · ${bestWin.acceptedTrades} trades` : "—"} />
      </section>

      <section className={styles.grid2}>
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Top outcome bars")}</h3>
              <div className={styles.chartCaption}>{tr("What this chart shows: the strongest stock-strategy combinations by total net P&L.")}</div>
            </div>
          </div>
          <BacktestingHorizontalBarChart
            items={rows.slice(0, 10).map((row) => ({
              label: `${row.symbol} • ${tr(row.displayName)}`,
              value: row.totalNetPnl,
              tone: row.totalNetPnl >= 0 ? "green" : "red"
            }))}
            xAxisName={tr("Net P&L (₹)")}
            valueFormatter="currency"
          />
        </article>
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Signal volume bars")}</h3>
              <div className={styles.chartCaption}>{tr("Signal count helps separate repeatable fit from one-off luck.")}</div>
            </div>
          </div>
          <BacktestingHorizontalBarChart
            items={rows.slice(0, 12).map((row) => ({
              label: `${row.symbol} • ${tr(row.displayName)}`,
              value: row.signalCount,
              tone: "white"
            }))}
            xAxisName={tr("Signal Count")}
            valueFormatter="number"
          />
        </article>
      </section>

      <article className={styles.chartPanel}>
        <div className={styles.chartHeader}>
          <div>
            <h3 className={styles.panelTitle}>{tr("Win rate vs average return")}</h3>
            <div className={styles.chartCaption}>{tr("Bubble size reflects accepted trades, so a name with only one good outcome does not read the same as repeated fit.")}</div>
          </div>
        </div>
        <BacktestingScatterChart
          points={rows.slice(0, 20).map((row) => ({
            key: `${row.displayName}:${row.symbol}`,
            label: `${row.symbol} • ${tr(row.displayName)}`,
            x: row.avgReturnPct,
            y: row.winRatePct,
            size: row.acceptedTrades
          }))}
          xAxisName={tr("Average Return %")}
          yAxisName={tr("Win Rate %")}
          sizeLabel={tr("Accepted trades")}
        />
      </article>

      <DataTable
        title={tr("Cross-strategy stock suitability")}
        subtitle={tr("Sort this to find names that consistently suit one archetype over another.")}
        rows={rows}
        maxHeight={480}
        columns={[
          { key: "strategy", header: tr("Strategy"), cell: (row) => tr(row.displayName) },
          { key: "archetype", header: tr("Archetype"), cell: (row) => tr(humanizeArchetype(row.archetype)) },
          { key: "symbol", header: tr("Symbol"), sortable: true, sortValue: (row) => row.symbol, cell: (row) => row.symbol },
          { key: "signals", header: tr("Signals"), align: "right", sortable: true, sortValue: (row) => row.signalCount, cell: (row) => formatNumberIN(row.signalCount) },
          { key: "accepted", header: tr("Accepted"), align: "right", sortable: true, sortValue: (row) => row.acceptedTrades, cell: (row) => formatNumberIN(row.acceptedTrades) },
          { key: "win", header: tr("Win rate"), align: "right", sortable: true, sortValue: (row) => row.winRatePct, cell: (row) => fmtPct(row.winRatePct) },
          { key: "avg", header: tr("Avg return"), align: "right", sortable: true, sortValue: (row) => row.avgReturnPct, cell: (row) => fmtPct(row.avgReturnPct) },
          { key: "pnl", header: tr("Net P&L"), align: "right", sortable: true, sortValue: (row) => row.totalNetPnl, cell: (row) => fmtCompactCurrency(row.totalNetPnl) },
          { key: "best", header: tr("Best regime"), cell: (row) => tr(row.bestRegime) },
          { key: "worst", header: tr("Worst regime"), cell: (row) => tr(row.worstRegime) },
          { key: "last", header: tr("Last signal"), cell: (row) => row.lastSignalDate }
        ]}
      />
    </div>
  );
}
