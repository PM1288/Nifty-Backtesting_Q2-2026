import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { DataTable, ErrorState, KpiCard, LoadingSkeletonCard } from "../components/ui/DashboardPrimitives";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { useAuthGate } from "../auth/AuthGateProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { formatDateIST, formatNumberIN } from "../lib/format";
import { useBacktestingCompare } from "../lib/hooks";
import {
  BacktestingCompareScopeBar,
  BacktestingGroupedBarChart,
  BacktestingHeader,
  BacktestingHorizontalBarChart,
  BacktestingMultiLineChart,
  BacktestingScatterChart,
  fmtCompactCurrency,
  fmtPct,
  humanizeArchetype
} from "./BacktestingChrome";
import styles from "./AnalyticsPage.module.css";

export function BacktestingComparePage() {
  const { authReady } = useAuthGate();
  const { t, tr } = useI18n();
  const compare = useBacktestingCompare(authReady);
  const [searchParams, setSearchParams] = useSearchParams();
  const capitalMode = searchParams.get("capital") ?? "capital_16l";
  const universeMode = searchParams.get("universe") ?? "nifty_100";
  const compareData = compare.data ?? null;
  const rows = compareData?.rows.filter((row) => row.capitalMode === capitalMode && row.universeMode === universeMode) ?? [];
  const curves = compareData?.equityCurves.filter((row) => row.capitalMode === capitalMode && row.universeMode === universeMode) ?? [];
  const regimeCompare = compareData?.regimeCompare.filter((row) => row.capitalMode === capitalMode && row.universeMode === universeMode) ?? [];
  const stockSuitability = (compareData?.stockSuitability ?? [])
    .filter((row) => row.capitalMode === capitalMode && row.universeMode === universeMode)
    .sort((left, right) => right.totalNetPnl - left.totalNetPnl);
  const capitalSensitivity = (compareData?.capitalSensitivity ?? []).filter((row) => row.capitalMode !== "no_capital_limit");
  const bestReturn = useMemo(() => [...rows].sort((left, right) => right.totalReturnPct - left.totalReturnPct)[0], [rows]);
  const safestRow = useMemo(() => [...rows].sort((left, right) => right.maxDrawdownPct - left.maxDrawdownPct)[0], [rows]);
  const highestWin = useMemo(() => [...rows].sort((left, right) => right.winRatePct - left.winRatePct)[0], [rows]);
  const regimeOrder = ["Rising", "Falling", "Volatile", "Shock", "Neutral"];

  usePageLoadProfile({
    pageName: "backtesting_compare",
    enabled: authReady,
    queries: [{ name: "backtesting-compare", isLoading: compare.isLoading, isError: !!compare.error }]
  });

  const setFilter = (key: "capital" | "universe", value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  if (!authReady || compare.isLoading) return <LoadingSkeletonCard title={tr("Compare Strategies")} lines={6} />;
  if (compare.error || !compare.data) return <ErrorState title={tr("Compare Strategies is unavailable")} body={tr("The comparison snapshot could not be loaded.")} />;

  return (
    <div className={styles.page}>
      <BacktestingHeader
        title={tr("Compare Strategies")}
        subtitle={tr("These three strategies are intentionally different archetypes. Use this page to see which style worked where, not just which one made more money.")}
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
        <KpiCard label={tr("Best total return")} value={bestReturn ? tr(bestReturn.displayName) : "—"} meta={bestReturn ? fmtPct(bestReturn.totalReturnPct) : "—"} tone="green" />
        <KpiCard label={tr("Best win rate")} value={highestWin ? tr(highestWin.displayName) : "—"} meta={highestWin ? fmtPct(highestWin.winRatePct) : "—"} />
        <KpiCard label={tr("Shallowest drawdown")} value={safestRow ? tr(safestRow.displayName) : "—"} meta={safestRow ? fmtPct(safestRow.maxDrawdownPct) : "—"} />
        <KpiCard label={tr("Strategies compared")} value={formatNumberIN(rows.length)} />
      </section>

      <section className={styles.grid2}>
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Normalized equity curves")}</h3>
              <div className={styles.chartCaption}>{tr("What this chart shows: each strategy rebased to 100 so relative path and durability are easier to compare.")}</div>
            </div>
          </div>
          <BacktestingMultiLineChart
            series={curves.map((curve) => ({
              key: `${curve.strategyId}:${curve.capitalMode}`,
              label: tr(curve.displayName),
              points: curve.points
            }))}
          />
        </article>
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Win rate vs drawdown")}</h3>
              <div className={styles.chartCaption}>{tr("Bubble size represents closed-trade count. Higher and farther right is generally better.")}</div>
            </div>
          </div>
          <BacktestingScatterChart
            points={rows.map((row) => ({
              key: row.strategyId,
              label: tr(row.displayName),
              x: Math.abs(row.maxDrawdownPct),
              y: row.winRatePct,
              size: row.totalClosedTrades
            }))}
            xAxisName={tr("Max Drawdown %")}
            yAxisName={tr("Win Rate %")}
          />
        </article>
      </section>

      <section className={styles.grid2}>
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Return vs FD")}</h3>
              <div className={styles.chartCaption}>{tr("Compare absolute strategy return against excess over the common NIFTY 50 price benchmark without mixing drawdown into the same chart.")}</div>
            </div>
          </div>
          <BacktestingGroupedBarChart
            categories={rows.map((row) => tr(row.displayName))}
            series={[
              { name: tr("Total Return"), values: rows.map((row) => row.totalReturnPct) },
              { name: tr("Excess vs benchmark"), values: rows.map((row) => row.excessOverFd ?? 0) }
            ]}
            xAxisName={tr("Strategy")}
            yAxisName={tr("Value")}
            formatter="currency"
          />
        </article>
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Capital sensitivity")}</h3>
              <div className={styles.chartCaption}>{tr("Same strategies across 10L, 20L, and 50L. This shows how much the result changes once capital constraints loosen.")}</div>
            </div>
          </div>
          <BacktestingGroupedBarChart
            categories={["10L", "20L", "50L"]}
            series={Array.from(new Set(capitalSensitivity.map((row) => row.displayName))).map((displayName) => ({
              name: tr(displayName),
              values: ["capital_16l", "capital_10l", "capital_20l", "capital_50l"].map((capital) => capitalSensitivity.find((row) => row.displayName === displayName && row.capitalMode === capital)?.totalReturnPct ?? 0)
            }))}
            xAxisName={tr("Capital Mode")}
            yAxisName={tr("Total Return %")}
            formatter="percent"
          />
        </article>
      </section>

      <section className={styles.grid2}>
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Regime comparison")}</h3>
              <div className={styles.chartCaption}>{tr("Compare strategy win rate by regime first, then use the table below for exact returns and hold times.")}</div>
            </div>
          </div>
          <BacktestingGroupedBarChart
            categories={regimeOrder.map((regime) => tr(regime))}
            series={regimeCompare.map((row) => ({
              name: tr(row.displayName),
              values: regimeOrder.map((regime) => row.regimes.find((item) => item.regime === regime)?.winRatePct ?? 0)
            }))}
            xAxisName={tr("Regime")}
            yAxisName={tr("Win Rate %")}
            formatter="percent"
          />
        </article>
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Stock suitability leaders")}</h3>
              <div className={styles.chartCaption}>{tr("These are the strongest stock-strategy combinations under the selected capital lens.")}</div>
            </div>
          </div>
          <BacktestingHorizontalBarChart
            items={stockSuitability.slice(0, 10).map((row) => ({
              label: `${row.symbol} • ${tr(row.displayName)}`,
              value: row.totalNetPnl,
              tone: row.totalNetPnl >= 0 ? "green" : "red"
            }))}
            xAxisName={tr("Net P&L (₹)")}
            valueFormatter="currency"
          />
        </article>
      </section>

      <DataTable
        title={tr("Comparison table")}
        subtitle={tr("Read this as archetype context first, then return, drawdown, trade count, and stock concentration.")}
        rows={rows}
        maxHeight={460}
        columns={[
          {
            key: "strategy",
            header: tr("Strategy"),
            sortable: true,
            sortValue: (row) => row.displayName,
            cell: (row) => (
              <div className={styles.headline}>
                <strong>{tr(row.displayName)}</strong>
                <span className={styles.muted}>{tr(humanizeArchetype(row.archetype))}</span>
              </div>
            )
          },
          { key: "version", header: tr("Version"), cell: (row) => `v${row.versionNumber}` },
          { key: "return", header: tr("Total return"), align: "right", sortable: true, sortValue: (row) => row.totalReturnPct, cell: (row) => fmtPct(row.totalReturnPct) },
          { key: "fd", header: tr("Excess vs benchmark"), align: "right", sortable: true, sortValue: (row) => row.excessOverFd ?? Number.NEGATIVE_INFINITY, cell: (row) => fmtCompactCurrency(row.excessOverFd) },
          { key: "current", header: tr("Current value"), align: "right", sortable: true, sortValue: (row) => row.currentValue, cell: (row) => fmtCompactCurrency(row.currentValue) },
          { key: "win", header: tr("Win rate"), align: "right", sortable: true, sortValue: (row) => row.winRatePct, cell: (row) => fmtPct(row.winRatePct) },
          { key: "closed", header: tr("Closed trades"), align: "right", sortable: true, sortValue: (row) => row.totalClosedTrades, cell: (row) => formatNumberIN(row.totalClosedTrades) },
          { key: "open", header: tr("Open"), align: "right", sortable: true, sortValue: (row) => row.openPositions, cell: (row) => formatNumberIN(row.openPositions) },
          { key: "dd", header: tr("Max drawdown"), align: "right", sortable: true, sortValue: (row) => row.maxDrawdownPct, cell: (row) => fmtPct(row.maxDrawdownPct) },
          { key: "hold", header: tr("Avg hold"), align: "right", sortable: true, sortValue: (row) => row.avgHoldDays, cell: (row) => `${formatNumberIN(row.avgHoldDays)}${tr("d")}` },
          { key: "charges", header: tr("Charges"), align: "right", sortable: true, sortValue: (row) => row.totalCharges, cell: (row) => fmtCompactCurrency(row.totalCharges) },
          { key: "best", header: tr("Best regime"), cell: (row) => row.regimeStrengthSummary.bestRegime ? tr(row.regimeStrengthSummary.bestRegime) : "—" },
          { key: "top", header: tr("Top stock"), cell: (row) => row.topPerformingStock ?? "—" },
          { key: "worst", header: tr("Worst stock"), cell: (row) => row.worstPerformingStock ?? "—" }
        ]}
      />

      <DataTable
        title={tr("Regime comparison")}
        subtitle={tr("This shows which archetype tends to fit which market condition under the selected capital lens.")}
        rows={regimeCompare.flatMap((row) => row.regimes.map((regime) => ({ strategy: tr(row.displayName), archetype: row.archetype, capitalMode: row.capitalMode, ...regime })))}
        maxHeight={420}
        columns={[
          { key: "strategy", header: tr("Strategy"), cell: (row) => row.strategy },
          { key: "archetype", header: tr("Archetype"), cell: (row) => tr(humanizeArchetype(row.archetype)) },
          { key: "regime", header: tr("Regime"), cell: (row) => tr(row.regime) },
          { key: "trades", header: tr("Trades"), align: "right", cell: (row) => formatNumberIN(row.tradeCount) },
          { key: "win", header: tr("Win rate"), align: "right", cell: (row) => fmtPct(row.winRatePct) },
          { key: "avg", header: tr("Avg return"), align: "right", cell: (row) => fmtPct(row.avgReturnPct) },
          { key: "hold", header: tr("Avg hold"), align: "right", cell: (row) => `${formatNumberIN(row.avgHoldDays)}${tr("d")}` }
        ]}
      />

      <DataTable
        title={tr("Stock suitability")}
        subtitle={tr("Best and worst stock fit often differ by archetype even when total strategy return looks similar.")}
        rows={stockSuitability.slice(0, 18)}
        maxHeight={420}
        columns={[
          { key: "strategy", header: tr("Strategy"), cell: (row) => tr(row.displayName) },
          { key: "symbol", header: tr("Symbol"), cell: (row) => row.symbol },
          { key: "signals", header: tr("Signals"), align: "right", cell: (row) => formatNumberIN(row.signalCount) },
          { key: "win", header: tr("Win rate"), align: "right", cell: (row) => fmtPct(row.winRatePct) },
          { key: "avg", header: tr("Avg return"), align: "right", cell: (row) => fmtPct(row.avgReturnPct) },
          { key: "pnl", header: tr("Net P&L"), align: "right", cell: (row) => fmtCompactCurrency(row.totalNetPnl) },
          { key: "best", header: tr("Best regime"), cell: (row) => tr(row.bestRegime) },
          { key: "worst", header: tr("Worst regime"), cell: (row) => tr(row.worstRegime) },
          { key: "last", header: tr("Last signal"), cell: (row) => row.lastSignalDate }
        ]}
      />
    </div>
  );
}
