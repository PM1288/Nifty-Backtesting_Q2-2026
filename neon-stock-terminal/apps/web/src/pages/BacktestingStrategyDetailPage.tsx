import { useMemo, useRef } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { useWorkspaceEngagement, useWorkspaceSectionViews } from "../analytics/useWorkspaceAnalytics";
import { DataTable, ErrorState, KpiCard, LoadingSkeletonCard } from "../components/ui/DashboardPrimitives";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { useAuthGate } from "../auth/AuthGateProvider";
import { useI18n } from "../i18n/LocaleProvider";
import type { AnalyticsParams } from "../analytics/types";
import { formatDateIST, formatNumberIN } from "../lib/format";
import { useBacktestingStrategy } from "../lib/hooks";
import {
  BacktestingDrawdownChart,
  BacktestingFilterBar,
  BacktestingHeader,
  BacktestingHistogramChart,
  BacktestingLineChart,
  BacktestingHorizontalBarChart,
  BacktestingPriceContextChart,
  fmtCompactCurrency,
  fmtCurrency,
  fmtPct,
  useBacktestingScenario
} from "./BacktestingChrome";
import styles from "./AnalyticsPage.module.css";

export function BacktestingStrategyDetailPage() {
  const { strategyId = "rsi30_willr80_closegtprev_tp125" } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { authReady } = useAuthGate();
  const { t, tr } = useI18n();
  const scenarioKey = searchParams.get("scenario");
  const detail = useBacktestingStrategy(strategyId, scenarioKey, authReady);
  const { scenario } = useBacktestingScenario(detail.data ?? null);
  const filtersRef = useRef<HTMLElement | null>(null);
  const summaryRef = useRef<HTMLElement | null>(null);
  const rulesRef = useRef<HTMLElement | null>(null);
  const exitReasonsRef = useRef<HTMLElement | null>(null);
  const equityRef = useRef<HTMLElement | null>(null);
  const distributionsRef = useRef<HTMLElement | null>(null);
  const priceContextRef = useRef<HTMLElement | null>(null);
  const positionsRef = useRef<HTMLElement | null>(null);
  const chargesRef = useRef<HTMLElement | null>(null);
  const recentTradesRef = useRef<HTMLElement | null>(null);
  const engagementExtrasRef = useRef<AnalyticsParams>({});

  usePageLoadProfile({
    pageName: "backtesting_strategy_detail",
    enabled: authReady,
    queries: [{ name: `backtesting-strategy:${strategyId}:${scenarioKey ?? "default"}`, isLoading: detail.isLoading, isError: !!detail.error }]
  });

  const analyticsContext = useMemo<AnalyticsParams>(
    () => ({
      page_name: "backtesting_strategy_detail",
      page_family: "backtesting",
      section: "detail",
      page_path: `${location.pathname}${location.search}`,
      strategy_id: detail.data?.strategy.strategyId ?? strategyId,
      scenario_id: scenarioKey ?? detail.data?.defaultScenarioKey,
      scenario_label: scenario?.label,
      universe_mode: scenario?.universeMode,
      capital_mode: scenario?.capitalMode,
      selected_stock: scenario?.stock ?? undefined
    }),
    [
      detail.data?.defaultScenarioKey,
      detail.data?.strategy.strategyId,
      location.pathname,
      location.search,
      scenario?.capitalMode,
      scenario?.label,
      scenario?.stock,
      scenario?.universeMode,
      scenarioKey,
      strategyId
    ]
  );

  engagementExtrasRef.current = {
    strategy_version: detail.data?.version.versionNumber,
    open_positions: scenario?.summary.openPositions,
    closed_trades: scenario?.trades.length,
    current_value: scenario?.summary.currentValue
  };

  useWorkspaceSectionViews(
    {
      backtesting_detail_filters: filtersRef,
      backtesting_detail_summary: summaryRef,
      backtesting_detail_rules: rulesRef,
      backtesting_detail_exit_reasons: exitReasonsRef,
      backtesting_detail_equity: equityRef,
      backtesting_detail_distributions: distributionsRef,
      backtesting_detail_price_context: priceContextRef,
      backtesting_detail_positions: positionsRef,
      backtesting_detail_charges: chargesRef,
      backtesting_detail_recent_trades: recentTradesRef
    },
    analyticsContext,
    "backtesting_strategy_detail_section_view",
    authReady && !!detail.data && !!scenario
  );

  useWorkspaceEngagement(
    analyticsContext,
    "backtesting_strategy_detail_engagement",
    authReady && !!detail.data && !!scenario,
    { extraParams: engagementExtrasRef }
  );

  if (!authReady || detail.isLoading) {
    return <LoadingSkeletonCard title={tr("Strategy Detail")} lines={5} />;
  }

  if (detail.error || !detail.data) {
    return <ErrorState title={tr("The strategy detail is unavailable")} body={tr("The selected backtesting strategy snapshot could not be loaded.")} />;
  }

  if (!scenario) {
    return <ErrorState title={tr("The scenario is unavailable")} body={tr("The selected Backtesting scenario could not be resolved.")} />;
  }

  const exitReasonItems = Object.values(
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
  const universeLabel =
    scenario.universeMode === "single_stock" ? tr("Single Stock") : scenario.universeMode === "nifty_100" ? tr("Nifty 100") : tr(scenario.universeMode);
  const capitalModeLabel =
    scenario.capitalMode === "no_capital_limit"
      ? tr("No Capital Limit")
      : scenario.capitalMode.replace("capital_", "").toUpperCase();

  return (
    <div className={styles.page}>
      <BacktestingHeader
        title={`${tr(detail.data.strategy.displayName)} • v${detail.data.version.versionNumber}`}
        subtitle={tr("This page explains the logic, assumptions, and latest evidence for the selected strategy version.")}
        meta={t("literals.As of {{date}}", "As of {{date}}", { date: formatDateIST(detail.data.asOfDate) })}
      />

      <section ref={filtersRef} data-analytics-section="backtesting_detail_filters">
        <BacktestingFilterBar filters={detail.data.filters} detail={detail.data} />
      </section>

      <section
        ref={summaryRef}
        data-analytics-section="backtesting_detail_summary"
        className={styles.systemHealthRow}
      >
        <KpiCard label={tr("Final value")} value={fmtCompactCurrency(scenario.summary.currentValue)} />
        <KpiCard label={tr("Invested amount")} value={fmtCompactCurrency(scenario.summary.investedAmount)} />
        <KpiCard label={tr("Excess vs benchmark")} value={fmtCompactCurrency(scenario.summary.excessOverBenchmark ?? scenario.summary.excessOverFd)} tone={(scenario.summary.excessOverBenchmark ?? scenario.summary.excessOverFd ?? 0) >= 0 ? "green" : "red"} />
        <KpiCard label={tr("35% realized-profit reserve")} value={fmtCompactCurrency(scenario.summary.taxDeducted ?? 0)} meta={tr("Applied only to positive realized trade profit; configurable research assumption, not tax advice.")} />
        <KpiCard label={tr("Win rate")} value={fmtPct(scenario.summary.winRatePct)} />
        <KpiCard label={tr("Max drawdown")} value={fmtPct(scenario.summary.maxDrawdownPct)} tone="red" />
        <KpiCard label={tr("Total charges")} value={fmtCompactCurrency(scenario.summary.totalCharges)} />
        <KpiCard label={tr("Open positions")} value={formatNumberIN(scenario.summary.openPositions)} />
      </section>

      <section className={styles.grid2}>
        <article
          ref={rulesRef}
          data-analytics-section="backtesting_detail_rules"
          className={styles.panel}
        >
          <h3 className={styles.panelTitle}>{tr("Strategy rule summary")}</h3>
          <div className={styles.statList}>
            <div className={styles.statRow}>
              <span>{tr("Strategy")}</span>
              <strong>{tr(detail.data.strategy.displayName)}</strong>
            </div>
            <div className={styles.statRow}>
              <span>{tr("Scenario")}</span>
              <strong>{tr(scenario.label)}</strong>
            </div>
            <div className={styles.statRow}>
              <span>{tr("Universe")}</span>
              <strong>{universeLabel}</strong>
            </div>
            <div className={styles.statRow}>
              <span>{tr("Capital mode")}</span>
              <strong>{capitalModeLabel}</strong>
            </div>
            <div className={styles.statRow}>
              <span>{tr("Benchmark")}</span>
              <strong>{tr(scenario.summary.benchmarkLabel ?? (scenario.benchmarkMode === "nifty50_price" ? "NIFTY 50 price benchmark" : "FD benchmark"))}</strong>
            </div>
          </div>
        </article>
        <article
          ref={exitReasonsRef}
          data-analytics-section="backtesting_detail_exit_reasons"
          className={styles.chartPanel}
        >
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Exit reason breakdown")}</h3>
              <div className={styles.chartCaption}>{tr("This shows whether outcomes are being driven by targets, stops, timeouts, or signal-based exits.")}</div>
            </div>
          </div>
          <BacktestingHorizontalBarChart items={exitReasonItems.map((item) => ({ ...item, label: tr(item.label) }))} xAxisName={tr("Closed Trades")} valueFormatter="number" />
        </article>
      </section>

      <section
        ref={equityRef}
        data-analytics-section="backtesting_detail_equity"
        className={styles.grid2}
      >
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Equity vs benchmark")}</h3>
              <div className={styles.chartCaption}>{tr("What this chart shows: strategy curve against the FD line for the selected scenario.")}</div>
            </div>
          </div>
          <BacktestingLineChart points={scenario.equityCurve} benchmark />
        </article>
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Drawdown")}</h3>
              <div className={styles.chartCaption}>{tr("Peak-to-trough pain matters as much as total return.")}</div>
            </div>
          </div>
          <BacktestingDrawdownChart points={scenario.drawdownCurve} />
        </article>
      </section>

      <section
        ref={distributionsRef}
        data-analytics-section="backtesting_detail_distributions"
        className={styles.grid2}
      >
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Trade return histogram")}</h3>
              <div className={styles.chartCaption}>{tr("Closed-trade distribution, not open-position MTM.")}</div>
            </div>
          </div>
          <BacktestingHistogramChart rows={scenario.tradeReturnHistogram} xAxisName={tr("Return Buckets")} />
        </article>
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Holding duration histogram")}</h3>
              <div className={styles.chartCaption}>{tr("This shows how long the strategy usually asks capital to stay tied up.")}</div>
            </div>
          </div>
          <BacktestingHistogramChart rows={scenario.holdingDurationHistogram} xAxisName={tr("Hold-Day Buckets")} />
        </article>
      </section>

      {scenario.priceIndicatorChart ? (
        <article
          ref={priceContextRef}
          data-analytics-section="backtesting_detail_price_context"
          className={styles.chartPanel}
        >
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.panelTitle}>{tr("Price + indicators + markers")}</h3>
              <div className={styles.chartCaption}>{tr("Single-stock mode only. Buy markers use T+1 execution after the signal bar closes.")}</div>
            </div>
          </div>
          <BacktestingPriceContextChart chart={scenario.priceIndicatorChart} strategyId={detail.data.strategy.strategyId} />
        </article>
      ) : null}

      <section ref={positionsRef} data-analytics-section="backtesting_detail_positions">
        <DataTable
          title={tr("Current open positions")}
          rows={scenario.openPositions}
          maxHeight={360}
          columns={[
            { key: "symbol", header: tr("Symbol"), cell: (row) => row.symbol },
            { key: "entry", header: tr("Entry"), cell: (row) => row.entryDate },
            { key: "qty", header: tr("Qty"), align: "right", cell: (row) => formatNumberIN(row.quantity) },
            { key: "entryPrice", header: tr("Entry price"), align: "right", cell: (row) => fmtCurrency(row.entryPrice) },
            { key: "mark", header: tr("Current price"), align: "right", cell: (row) => fmtCurrency(row.markPrice) },
            { key: "unrealizedPct", header: tr("Unrealized %"), align: "right", cell: (row) => fmtPct(row.unrealizedPct) },
            { key: "invested", header: tr("Invested"), align: "right", cell: (row) => fmtCurrency(row.entryPrice * row.quantity) },
            { key: "currentValue", header: tr("Current value"), align: "right", cell: (row) => fmtCurrency(row.markPrice * row.quantity) },
            { key: "pnl", header: tr("Unrealized"), align: "right", cell: (row) => fmtCurrency(row.unrealizedPnl) },
            { key: "regime", header: tr("Regime"), cell: (row) => tr(row.regimeOnEntry) }
          ]}
        />
      </section>

      <section ref={chargesRef} data-analytics-section="backtesting_detail_charges">
        <DataTable
          title={tr("Charges summary")}
          rows={scenario.chargesSummary}
          maxHeight={280}
          columns={[
            { key: "label", header: tr("Charge"), cell: (row) => tr(row.label) },
            {
              key: "display",
              header: tr("Assumption"),
              cell: (row) =>
                row.label === "Scenario total"
                  ? t(
                      "literals.Observed charges in this scenario: INR {{value}}",
                      "Observed charges in this scenario: INR {{value}}",
                      { value: formatNumberIN(Math.round(row.value), { maximumFractionDigits: 0 }) }
                    )
                  : tr(row.display)
            },
            { key: "value", header: tr("Observed total"), align: "right", cell: (row) => fmtCurrency(row.value) }
          ]}
        />
      </section>

      <section ref={recentTradesRef} data-analytics-section="backtesting_detail_recent_trades">
        <DataTable
          title={tr("Recent sample trades")}
          subtitle={tr("Use these as quick sanity checks before drilling into the full portfolio tables.")}
          rows={scenario.trades.slice(0, 3)}
          maxHeight={220}
          columns={[
            { key: "symbol", header: tr("Symbol"), cell: (row) => row.symbol },
            { key: "signal", header: tr("Signal date"), cell: (row) => row.signalDate },
            { key: "entry", header: tr("Entry"), cell: (row) => row.entryDate },
            { key: "exit", header: tr("Exit"), cell: (row) => row.exitDate ?? tr("Open") },
            { key: "reason", header: tr("Exit reason"), cell: (row) => tr((row.exitReason ?? "").replace(/_/g, " ")) },
            { key: "returnPct", header: tr("Return"), align: "right", cell: (row) => fmtPct(row.returnPct) },
            { key: "charges", header: tr("Charges"), align: "right", cell: (row) => fmtCurrency(row.charges) }
          ]}
        />
      </section>
    </div>
  );
}
