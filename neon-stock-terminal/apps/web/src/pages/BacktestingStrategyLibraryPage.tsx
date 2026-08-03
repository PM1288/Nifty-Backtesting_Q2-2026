import { Link } from "react-router-dom";
import { DataTable, ErrorState, InterpretationCard, KpiCard, LoadingTableCard, SectionDivider } from "../components/ui/DashboardPrimitives";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { useAuthGate } from "../auth/AuthGateProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { useBacktestingCompare, useBacktestingStrategies } from "../lib/hooks";
import { formatDateIST, formatNumber } from "../lib/format";
import { BacktestingHeader, fmtCompactCurrency, fmtPct, humanizeArchetype } from "./BacktestingChrome";
import styles from "./AnalyticsPage.module.css";

export function BacktestingStrategyLibraryPage() {
  const { authReady } = useAuthGate();
  const { t, tr } = useI18n();
  const strategies = useBacktestingStrategies(authReady);
  const compare = useBacktestingCompare(authReady);

  usePageLoadProfile({
    pageName: "backtesting_library",
    enabled: authReady,
    queries: [
      { name: "backtesting-strategies", isLoading: strategies.isLoading, isError: !!strategies.error },
      { name: "backtesting-compare", isLoading: compare.isLoading, isError: !!compare.error }
    ]
  });

  if (!authReady || strategies.isLoading || compare.isLoading) {
    return <LoadingTableCard title={tr("Strategy Leaderboard")} rows={6} />;
  }

  if (strategies.error || compare.error || !strategies.data || !compare.data) {
    return <ErrorState title={tr("The Strategy Leaderboard is unavailable")} body={tr("The strategy registry snapshot could not be loaded.")} />;
  }

  const leaderboardLens = { universeMode: "nifty_100", capitalMode: "capital_16l" } as const;
  const compareRows = compare.data.rows.filter(
    (row) => row.universeMode === leaderboardLens.universeMode && row.capitalMode === leaderboardLens.capitalMode
  );
  const rowByStrategyId = new Map(compareRows.map((row) => [row.strategyId, row]));

  const leaderboardRows = strategies.data.items
    .map((item) => {
      const performance = rowByStrategyId.get(item.strategyId);
      return {
        ...item,
        performance
      };
    })
    .filter(
      (item): item is typeof item & { performance: NonNullable<typeof item.performance> } =>
        item.status === "active" && Boolean(item.performance)
    )
    .sort((left, right) => right.performance.totalReturnPct - left.performance.totalReturnPct)
    .map((item, index) => ({
      rank: index + 1,
      ...item
    }));

  const topReturn = leaderboardRows[0] ?? null;
  const bestWinRate = [...leaderboardRows].sort(
    (left, right) => right.performance.winRatePct - left.performance.winRatePct
  )[0] ?? null;
  const safestDrawdown = [...leaderboardRows].sort(
    (left, right) => right.performance.maxDrawdownPct - left.performance.maxDrawdownPct
  )[0] ?? null;
  const topStockFit = [...leaderboardRows].find((row) => row.performance.topPerformingStock) ?? null;

  return (
    <div className={`${styles.page} ${styles.backtestingPage}`}>
      <BacktestingHeader
        title={tr("Strategy Leaderboard")}
        subtitle={tr("This ranks the published strategy set under one explicit comparison lens so you can decide what to inspect next without mistaking the library for arbitrary browser-side code.")}
        testRunAt={strategies.data.generatedAt}
        meta={t("literals.As of {{date}}", "As of {{date}}", { date: formatDateIST(strategies.data.asOfDate) })}
      />

      <SectionDivider
        eyebrow={tr("Backtesting")}
        title={tr("Published strategy leaderboard")}
        subtitle={tr("The ranking below uses the published Nifty 100 • ₹16L / ₹2L ticket / max 8 comparison lens so every strategy is judged on the same current snapshot instead of on mixed scenarios.")}
      />

      <section className={styles.systemHealthRow}>
        <KpiCard
          label={tr("Top total return")}
          value={topReturn ? tr(topReturn.displayName) : "—"}
          meta={topReturn ? fmtPct(topReturn.performance.totalReturnPct) : "—"}
          tone="green"
        />
        <KpiCard
          label={tr("Best win rate")}
          value={bestWinRate ? tr(bestWinRate.displayName) : "—"}
          meta={bestWinRate ? fmtPct(bestWinRate.performance.winRatePct) : "—"}
        />
        <KpiCard
          label={tr("Shallowest drawdown")}
          value={safestDrawdown ? tr(safestDrawdown.displayName) : "—"}
          meta={safestDrawdown ? fmtPct(safestDrawdown.performance.maxDrawdownPct) : "—"}
        />
        <KpiCard
          label={tr("Most visible stock fit")}
          value={topStockFit?.performance.topPerformingStock ?? "—"}
          meta={topStockFit ? tr(topStockFit.displayName) : tr("No published stock fit")}
        />
      </section>

      <section className={styles.summaryGrid}>
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{tr("How to read the leaderboard")}</h2>
          <div className={styles.signalGrid}>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Current lens")}</div>
                <div className={styles.muted}>{tr("Nifty 100 universe with ₹16 lakh starting cash, ₹2 lakh tickets, and at most 8 simultaneous positions.")}</div>
              </div>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("What ranks it")}</div>
                <div className={styles.muted}>{tr("Rows are ordered by published total return first. Use win rate, drawdown, and best regime as the credibility checks, not as decoration.")}</div>
              </div>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("What to do next")}</div>
                <div className={styles.muted}>{tr("Open strategy detail for the top candidates, then step back to Compare if two strategies look close for the current tape.")}</div>
              </div>
            </div>
          </div>
        </div>
        <InterpretationCard
          title={tr("What this page is good for")}
          items={[
            tr("Shortlisting strategy families before reading detail."),
            tr("Seeing which archetype currently looks strongest under one shared lens."),
            tr("Checking whether return leadership still survives the drawdown and regime-fit filters.")
          ]}
        />
      </section>

      <DataTable
        title={tr("Ranked strategies")}
        subtitle={tr("This is versioned metadata plus the current published comparison lens, not arbitrary code from the browser.")}
        rows={leaderboardRows}
        maxHeight={460}
        columns={[
          {
            key: "rank",
            header: tr("Rank"),
            align: "right",
            sortable: true,
            sortValue: (row) => row.rank,
            cell: (row) => `#${row.rank}`
          },
          {
            key: "name",
            header: tr("Strategy"),
            sortable: true,
            sortValue: (row) => row.displayName,
            cell: (row) => (
              <div className={styles.headline}>
                <strong>{tr(row.displayName)}</strong>
                <span className={styles.muted}>{tr(row.description)}</span>
              </div>
            )
          },
          { key: "version", header: tr("Version"), cell: (row) => `v${row.activeVersionNumber}` },
          { key: "archetype", header: tr("Archetype"), cell: (row) => tr(humanizeArchetype(row.archetype)) },
          {
            key: "return",
            header: tr("Total return"),
            align: "right",
            sortable: true,
            sortValue: (row) => row.performance.totalReturnPct,
            cell: (row) => fmtPct(row.performance.totalReturnPct)
          },
          {
            key: "fd",
            header: tr("Excess vs benchmark"),
            align: "right",
            sortable: true,
            sortValue: (row) => row.performance.excessOverFd ?? Number.NEGATIVE_INFINITY,
            cell: (row) => fmtCompactCurrency(row.performance.excessOverFd)
          },
          {
            key: "win",
            header: tr("Win rate"),
            align: "right",
            sortable: true,
            sortValue: (row) => row.performance.winRatePct,
            cell: (row) => fmtPct(row.performance.winRatePct)
          },
          {
            key: "drawdown",
            header: tr("Max drawdown"),
            align: "right",
            sortable: true,
            sortValue: (row) => row.performance.maxDrawdownPct,
            cell: (row) => fmtPct(row.performance.maxDrawdownPct)
          },
          {
            key: "bestRegime",
            header: tr("Best regime"),
            cell: (row) => row.performance.regimeStrengthSummary.bestRegime ? tr(row.performance.regimeStrengthSummary.bestRegime) : "—"
          },
          {
            key: "topStock",
            header: tr("Top stock"),
            cell: (row) => row.performance.topPerformingStock ?? "—"
          },
          { key: "run", header: tr("Latest run"), cell: (row) => tr(row.latestRunStatus) },
          { key: "date", header: tr("As-of date"), cell: (row) => formatDateIST(row.latestAsOfDate) },
          {
            key: "action",
            header: tr("Action"),
            cell: (row) => (
              <Link to={`/backtesting/strategies/${row.strategyId}`} className={styles.inlineLink}>
                {tr("View detail")}
              </Link>
            )
          }
        ]}
      />

      <section className={styles.nextSteps}>
        <Link to="/backtesting/compare" className={styles.nextCard}>
          <span className={styles.promptLabel}>{tr("Compare the field")}</span>
          <strong>{tr("Open Compare Strategies")}</strong>
          <span className={styles.muted}>{tr("Use this when two leaderboard rows look close and you want to compare equity path, drawdown, regime fit, and stock suitability side by side.")}</span>
        </Link>
        <Link to="/analytics/system/map" className={styles.nextCard}>
          <span className={styles.promptLabel}>{tr("Navigate the product")}</span>
          <strong>{tr("Open the System Map")}</strong>
          <span className={styles.muted}>{tr("Use this when you want to understand where strategy evidence sits relative to market context, stock reports, options, and trust.")}</span>
        </Link>
      </section>
    </div>
  );
}
