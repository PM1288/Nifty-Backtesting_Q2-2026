import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageIntroAccordion } from "../components/ui/DashboardPrimitives";
import { useAuthGate } from "../auth/AuthGateProvider";
import {
  ButtonLink,
  ButtonButton,
  ErrorState,
  InterpretationCard,
  LoadingSkeletonCard,
  LoadingTableCard,
  LoadingState,
  PlainLanguageCard,
  SectionDivider
} from "../components/ui/DashboardPrimitives";
import {
  AssumptionsCard,
  CurrentPortfolioSection,
  CapitalDeploymentChart,
  CurrentStatusSummary,
  DrawdownChart,
  EquityCurveChart,
  ForwardReturnHeatmap,
  HoldingDurationChart,
  IndicatorHero,
  LimitationsCard,
  PriceIndicatorSignalChart,
  StockResultTable,
  StrategyPerStockTable,
  StrategySummaryCards,
  ThresholdGuideTable,
  TradeReturnDistribution
} from "../components/indicators/IndicatorEducationBlocks";
import {
  trackAssumptionsOpened,
  trackCapitalModeChange,
  trackChartRangeChange,
  trackCtaOpenSimulator,
  trackHowToReadOpened,
  trackLimitationsOpened,
  trackStockSelected,
  trackStrategyScenarioChange,
  trackTableFilterChange,
  trackTableSortChange
} from "../analytics/indicatorEvents";
import {
  IndicatorAnalyticsDebugPanel,
  isIndicatorAnalyticsDebugEnabled,
  useIndicatorAnalyticsContext,
  useIndicatorAnalyticsDebug,
  useIndicatorEngagement,
  useIndicatorPageView,
  useIndicatorSectionRefs,
  useIndicatorScrollDepth,
  useIndicatorSectionViews
} from "../analytics/useIndicatorAnalytics";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { analytics } from "../analytics";
import { useI18n } from "../i18n/LocaleProvider";
import { useIndicatorEducation, useIndicatorStrategySnapshot } from "../lib/hooks";
import { trackCtaClick } from "../lib/analytics";
import { formatDateTime } from "../lib/format";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import {
  AnalyticsHeader,
  LEARNING_SECTION_TABS,
  useAnalyticsExperienceMode
} from "./AnalyticsChrome";
import styles from "./AnalyticsPage.module.css";

const DEFAULT_INDICATOR_SLUG = "rsi";

function formatMeta(asOf: string) {
  const parsed = new Date(asOf);
  return Number.isNaN(parsed.getTime()) ? asOf : formatDateTime(parsed.toISOString(), { includeTime: true });
}

function relatedSurfaceHref(slug: string) {
  if (slug === "rsi") return "/heatmap/rsi";
  if (slug === "willr") return "/heatmap/will";
  return "/heatmap/change";
}

export function AnalyticsIndicatorsPage() {
  const { t, tr, translateText } = useI18n();
  const { authReady } = useAuthGate();
  const { mode } = useAnalyticsExperienceMode();
  const { slug: routeSlug } = useParams();
  const navigate = useNavigate();
  const slug = (routeSlug ?? DEFAULT_INDICATOR_SLUG).toLowerCase();
  const indicator = useIndicatorEducation(slug, authReady);
  const [selectedScenarioKey, setSelectedScenarioKey] = useState("");
  const [selectedCapitalModeKey, setSelectedCapitalModeKey] = useState("");
  const [strategyTableFilter, setStrategyTableFilter] = useState("");
  const [stockTableFilter, setStockTableFilter] = useState("");
  const sectionRefs = useIndicatorSectionRefs();
  const reachedStrategySectionRef = useRef(false);
  const analyticsDebugEnabled = isIndicatorAnalyticsDebugEnabled();

  useEffect(() => {
    const defaultScenario = indicator.data?.strategyEvaluator.defaultScenarioKey;
    if (!defaultScenario) return;
    setSelectedScenarioKey((current) => (current ? current : defaultScenario));
  }, [indicator.data?.strategyEvaluator.defaultScenarioKey]);

  useEffect(() => {
    const defaultCapitalMode = indicator.data?.strategyEvaluator.defaultCapitalModeKey;
    if (!defaultCapitalMode) return;
    setSelectedCapitalModeKey((current) => (current ? current : defaultCapitalMode));
  }, [indicator.data?.strategyEvaluator.defaultCapitalModeKey]);

  const activeScenarioFamily = useMemo(() => {
    const families = indicator.data?.strategyEvaluator.scenarioFamilies ?? [];
    return families.find((scenario) => scenario.key === selectedScenarioKey) ?? families[0] ?? null;
  }, [indicator.data?.strategyEvaluator.scenarioFamilies, selectedScenarioKey]);

  useEffect(() => {
    const nextCapitalModeKey = activeScenarioFamily?.capitalModes?.[0]?.key;
    if (!nextCapitalModeKey) return;
    const hasCurrentKey = activeScenarioFamily?.capitalModes.some((mode) => mode.key === selectedCapitalModeKey);
    if (hasCurrentKey) return;
    setSelectedCapitalModeKey(nextCapitalModeKey);
  }, [activeScenarioFamily, selectedCapitalModeKey]);

  const activeCapitalMode = useMemo(() => {
    const modes = activeScenarioFamily?.capitalModes ?? [];
    return modes.find((mode) => mode.key === selectedCapitalModeKey) ?? modes[0] ?? null;
  }, [activeScenarioFamily, selectedCapitalModeKey]);

  const strategySnapshot = useIndicatorStrategySnapshot(slug, activeCapitalMode?.scenarioId ?? "", authReady && !!activeCapitalMode?.scenarioId);
  usePageLoadProfile({
    pageName: "analytics_indicator",
    enabled: authReady,
    queries: [
      { name: `indicator-education:${slug}`, isLoading: indicator.isLoading, isError: !!indicator.error },
      {
        name: `indicator-strategy-snapshot:${slug}:${activeCapitalMode?.scenarioId ?? ""}`,
        isLoading: Boolean(activeCapitalMode?.scenarioId) && strategySnapshot.isLoading,
        isError: !!strategySnapshot.error
      }
    ],
    extra: { indicator_slug: slug }
  });
  const analyticsContext = useIndicatorAnalyticsContext({
    indicatorSlug: slug,
    asOfDate: strategySnapshot.data?.dataAsOfDate ?? indicator.data?.freshness.currentStatusDate,
    scenarioId: activeCapitalMode?.scenarioId,
    capitalMode: activeCapitalMode?.key
  });
  const debugEvents = useIndicatorAnalyticsDebug(analyticsDebugEnabled);

  useEffect(() => {
    analytics.setContext(analyticsContext);
  }, [analyticsContext]);

  useIndicatorPageView(analyticsContext, authReady && !!indicator.data);
  useIndicatorSectionViews(sectionRefs, analyticsContext, authReady && !!indicator.data, () => {
    reachedStrategySectionRef.current = true;
  });
  useIndicatorScrollDepth(analyticsContext, authReady && !!indicator.data);
  useIndicatorEngagement(analyticsContext, authReady && !!indicator.data, reachedStrategySectionRef);
  const pageLoading = !authReady || indicator.isLoading;
  useDeferredBusyState(pageLoading);

  if (pageLoading) {
    return (
      <LoadingState
        title={tr("Loading indicator education template")}
        body={tr("Preparing the plain-language summary, evidence window, and strategy outcomes.")}
      />
    );
  }

  if (indicator.error || !indicator.data) {
    return (
      <ErrorState
        title={tr("Indicator education page is unavailable")}
        body={tr("The latest indicator data could not load. Refresh and try again.")}
      />
    );
  }

  const data = indicator.data;
  const evidenceAsOf = t("literals.Evidence through {{date}}", "Evidence through {{date}}", {
    date: data.freshness.evidenceEndDate
  });
  const strategyAsOf = t("literals.Strategy evidence through {{date}}", "Strategy evidence through {{date}}", {
    date: strategySnapshot.data?.dataAsOfDate ?? data.freshness.evidenceEndDate
  });
  const relatedSurface = relatedSurfaceHref(slug);

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title={t("{{name}} explained", `${data.displayName} explained`, { name: data.displayName })}
        meta={`${tr("Snapshot")} ${formatMeta(data.freshness.snapshotGeneratedAt)}`}
        subtitle={
          mode === "beginner"
            ? tr("Start with the plain-language read, then use the evidence and strategy sections to see what the indicator has historically meant.")
            : tr("Use one page to review the explanation, thresholds, historical evidence, and strategy outcomes for this indicator.")
        }
        sectionTabs={[...LEARNING_SECTION_TABS]}
      />

      <IndicatorHero indicator={data} activeSlug={slug} />

      <section className={styles.summaryGrid}>
        <InterpretationCard
          title={tr("Why you are here")}
          items={[
            t("literals.Use {{name}} to learn one stable interpretation language before you look at the live heatmaps or strategy outcomes.", "Use {{name}} to learn one stable interpretation language before you look at the live heatmaps or strategy outcomes.", { name: data.displayName }),
            tr("This page should answer what the indicator measures, what its thresholds mean, and what the current evidence has historically implied."),
            tr("Once the meaning is clear, route back into the live signal surface or forward into simulator-style evidence.")
          ]}
        />
        <PlainLanguageCard
          title={tr("Question answered today")}
          body={t("literals.What is {{name}} actually saying right now, and how trustworthy has that message been across the evidence window?", "What is {{name}} actually saying right now, and how trustworthy has that message been across the evidence window?", { name: data.displayName })}
          secondaryTitle={tr("Go next")}
          secondaryBody={t("literals.Use {{name}} meaning first, then the {{surface}}, then the strategy evaluator if you still need capital-behavior evidence.", "Use {{name}} meaning first, then the {{surface}}, then the strategy evaluator if you still need capital-behavior evidence.", {
            name: data.displayName,
            surface: slug === "rsi" ? "RSI heatmap" : slug === "willr" ? "WILLR heatmap" : tr("live signal surface")
          })}
        />
      </section>

      <section ref={sectionRefs.explanation} data-indicator-section="explanation">
        <SectionDivider
          eyebrow={tr("Indicator basics")}
          title={tr("What it is and how to read it")}
          subtitle={tr("The page explains the indicator first, then applies the same thresholds to today's universe and the 3-year evidence.")}
        />

        <div className={styles.summaryGrid}>
          <InterpretationCard title={tr("What the indicator is")} items={data.whatItIs.map((item) => tr(item))} />
          <PageIntroAccordion
            label={tr("How to read")}
            title={t("literals.How to read {{name}}", "How to read {{name}}", { name: data.displayName })}
            body={tr(data.howToRead[0] ?? data.shortDescription)}
            items={data.howToRead.slice(1).map((item) => tr(item))}
            widgetId="indicator_how_to_read"
            onOpen={() => trackHowToReadOpened(analyticsContext)}
          />
        </div>
      </section>

      <section ref={sectionRefs.threshold_guide} data-indicator-section="threshold_guide">
        <ThresholdGuideTable bands={data.thresholdBands} />
      </section>

      <section ref={sectionRefs.current_status} data-indicator-section="current_status">
        <SectionDivider
          eyebrow="Today"
          title={tr("What it is saying today in the tracked universe")}
          subtitle={t("literals.Current universe read as of {{date}}.", "Current universe read as of {{date}}.", {
            date: data.freshness.currentStatusDate
          })}
        />

        <CurrentStatusSummary
          summary={data.currentStatus}
          onStockSelect={(symbol) => {
            trackStockSelected({ ...analyticsContext, selected_stock: symbol, source_section: "current_status" });
            navigate(`/analytics/stock/${encodeURIComponent(symbol)}`);
          }}
        />
      </section>

      <section ref={sectionRefs.evidence_charts} data-indicator-section="evidence_charts">
        <SectionDivider
          eyebrow={tr("Evidence")}
          title={tr("3-year evidence")}
          subtitle={t("literals.Daily evidence window: {{range}}.", "Daily evidence window: {{range}}.", {
            range: data.freshness.evidenceRangeLabel
          })}
        />

        <PriceIndicatorSignalChart
          series={data.evidence.priceSeries}
          bands={data.thresholdBands}
          labels={data.chartLabels}
          helperText={data.chartHelpText.priceIndicatorSignalChart}
          asOfLabel={evidenceAsOf}
          isStale={data.evidence.isStale}
          chartId="evidence_price_rsi"
          enableRangeSelector
          onRangeChange={(chartId, range) => trackChartRangeChange({ ...analyticsContext, chart_id: chartId, range })}
        />

        <ForwardReturnHeatmap
          cells={data.evidence.heatmapCells}
          labels={data.chartLabels}
          helperText={data.chartHelpText.forwardReturnHeatmap}
          asOfLabel={evidenceAsOf}
          isStale={data.evidence.isStale}
        />
      </section>

      <section ref={sectionRefs.strategy_results} data-indicator-section="strategy_results">
        <SectionDivider
          eyebrow={tr("Strategy evaluator")}
          title={tr("Precomputed strategy outcomes")}
          subtitle={tr("Each scenario uses the same evidence window and rule definitions shipped by the indicator registry.")}
          action={
            <ButtonLink
              to="/analytics/simulator"
              size="s"
              onClick={() => trackCtaOpenSimulator(analyticsContext)}
            >
              {tr("Open simulator")}
            </ButtonLink>
          }
        />

        <div className={styles.analyticsToolbar}>
          {(data.strategyEvaluator.scenarioFamilies ?? []).map((scenario) => (
            <ButtonButton
              key={scenario.key}
              size="s"
              variant={scenario.key === activeScenarioFamily?.key ? "primary" : "secondary"}
              tone={scenario.key === activeScenarioFamily?.key ? "green" : "white"}
              onClick={() => {
                setSelectedScenarioKey(scenario.key);
                trackStrategyScenarioChange({
                  ...analyticsContext,
                  scenario_id: scenario.capitalModes[0]?.scenarioId ?? scenario.key,
                  scenario_key: scenario.key
                });
              }}
            >
                {translateText(scenario.label)}
            </ButtonButton>
          ))}
        </div>
      </section>

      {activeScenarioFamily ? (
        <>
          <div className={styles.analyticsToolbar}>
            {(activeScenarioFamily.capitalModes ?? []).map((capitalMode) => (
              <ButtonButton
                key={capitalMode.key}
                size="s"
                variant={capitalMode.key === activeCapitalMode?.key ? "primary" : "secondary"}
                tone={capitalMode.key === activeCapitalMode?.key ? "green" : "white"}
                onClick={() => {
                  setSelectedCapitalModeKey(capitalMode.key);
                  trackCapitalModeChange({
                    ...analyticsContext,
                    scenario_id: capitalMode.scenarioId,
                    capital_mode: capitalMode.key
                  });
                }}
              >
                {translateText(capitalMode.label)}
              </ButtonButton>
            ))}
          </div>

          {strategySnapshot.isLoading || !strategySnapshot.data ? (
            <div className={styles.stackGrid}>
              <div className={styles.grid3}>
                <LoadingSkeletonCard title={tr("Strategy summary")} lines={4} />
                <LoadingSkeletonCard title={tr("Current portfolio")} lines={4} />
                <LoadingSkeletonCard title={tr("Open positions")} lines={5} />
              </div>
              <div className={styles.grid2}>
                <LoadingSkeletonCard title={tr("Price + indicator chart")} lines={6} />
                <LoadingSkeletonCard title={tr("Equity and drawdown")} lines={6} />
              </div>
              <LoadingTableCard title={tr("Per-stock strategy results")} rows={7} />
            </div>
          ) : (
            <>
              <StrategySummaryCards scenario={strategySnapshot.data} />

              {strategySnapshot.data.signalChart ? (
                <PriceIndicatorSignalChart
                  series={strategySnapshot.data.signalChart.points.filter((point) => point.price != null).map((point) => ({ date: point.date, price: point.price ?? 0, indicatorValue: point.indicatorValue }))}
                  bands={data.thresholdBands}
                  labels={{ ...data.chartLabels, priceAxis: `${strategySnapshot.data.signalChart.symbol} price` }}
                  helperText={data.chartHelpText.priceIndicatorSignalChart}
                  asOfLabel={strategyAsOf}
                  isStale={strategySnapshot.data.isStale}
                  title={t("literals.{{symbol}} price + RSI with strategy markers", "{{symbol}} price + RSI with strategy markers", { symbol: strategySnapshot.data.signalChart.symbol })}
                  subtitle={`${strategySnapshot.data.signalChart.name} • ${strategySnapshot.data.signalChart.sector}`}
                  entryMarkers={strategySnapshot.data.signalChart.entryMarkers}
                  exitMarkers={strategySnapshot.data.signalChart.exitMarkers}
                  chartId="strategy_price_rsi"
                  enableRangeSelector
                  onRangeChange={(chartId, range) => trackChartRangeChange({ ...analyticsContext, chart_id: chartId, range })}
                />
              ) : (
                <PriceIndicatorSignalChart
                  series={data.evidence.priceSeries.filter((point) => point.price != null).map((point) => ({ date: point.date, price: point.price, indicatorValue: point.indicatorValue }))}
                  bands={data.thresholdBands}
                  labels={data.chartLabels}
                  helperText={data.chartHelpText.priceIndicatorSignalChart}
                  asOfLabel={evidenceAsOf}
                  isStale={data.evidence.isStale}
                  title={tr("Price and RSI context")}
                  subtitle={tr("Representative trade chart is unavailable, so the benchmark context is shown instead.")}
                  chartId="strategy_price_context"
                  enableRangeSelector
                  onRangeChange={(chartId, range) => trackChartRangeChange({ ...analyticsContext, chart_id: chartId, range })}
                />
              )}

              <div className={styles.grid2}>
                <EquityCurveChart
                  points={strategySnapshot.data.equityCurve}
                  labels={data.chartLabels}
                  helperText={data.chartHelpText.equityCurveChart}
                  asOfLabel={strategyAsOf}
                  isStale={strategySnapshot.data.isStale}
                  chartId="strategy_equity_curve"
                  enableRangeSelector
                  onRangeChange={(chartId, range) => trackChartRangeChange({ ...analyticsContext, chart_id: chartId, range })}
                />
                <DrawdownChart
                  points={strategySnapshot.data.drawdownSeries}
                  labels={data.chartLabels}
                  helperText={data.chartHelpText.drawdownChart}
                  asOfLabel={strategyAsOf}
                  isStale={strategySnapshot.data.isStale}
                />
              </div>

              <div className={styles.grid3}>
                <TradeReturnDistribution
                  buckets={strategySnapshot.data.tradeReturnDistribution}
                  labels={data.chartLabels}
                  helperText={data.chartHelpText.tradeReturnDistribution}
                  asOfLabel={strategyAsOf}
                  isStale={strategySnapshot.data.isStale}
                />
                <HoldingDurationChart
                  buckets={strategySnapshot.data.holdingDurationDistribution}
                  labels={data.chartLabels}
                  helperText={data.chartHelpText.holdingDurationChart}
                  asOfLabel={strategyAsOf}
                  isStale={strategySnapshot.data.isStale}
                />
                <CapitalDeploymentChart
                  points={strategySnapshot.data.capitalDeployment}
                  labels={data.chartLabels}
                  helperText={data.chartHelpText.capitalDeploymentChart}
                  asOfLabel={strategyAsOf}
                  isStale={strategySnapshot.data.isStale}
                />
              </div>

              <CurrentPortfolioSection
                scenario={strategySnapshot.data}
                onStockSelect={(symbol) => {
                  trackStockSelected({ ...analyticsContext, selected_stock: symbol, source_section: "current_portfolio" });
                  navigate(`/analytics/stock/${encodeURIComponent(symbol)}`);
                }}
              />
              <StrategyPerStockTable
                rows={strategySnapshot.data.perStockSummary}
                filterValue={strategyTableFilter}
                onFilterValueChange={(value) => {
                  setStrategyTableFilter(value);
                  trackTableFilterChange({
                    ...analyticsContext,
                    table_name: "indicator-strategy-per-stock",
                    filter_length: value.trim().length
                  });
                }}
                onSortChange={(columnKey, direction) =>
                  trackTableSortChange({
                    ...analyticsContext,
                    table_name: "indicator-strategy-per-stock",
                    column_key: columnKey,
                    sort_direction: direction
                  })
                }
                onStockSelect={(symbol) => {
                  trackStockSelected({ ...analyticsContext, selected_stock: symbol, source_section: "strategy_results" });
                  navigate(`/analytics/stock/${encodeURIComponent(symbol)}`);
                }}
              />
            </>
          )}
        </>
      ) : (
        <PlainLanguageCard
          title={tr("Strategy evaluator")}
          body={tr("No scenario results are available for this indicator yet.")}
        />
      )}

      <section ref={sectionRefs.assumptions} data-indicator-section="assumptions">
        <SectionDivider
          eyebrow={tr("Read carefully")}
          title={tr("Assumptions and limitations")}
          subtitle={tr("These cards explain what the template assumes so the charts are interpreted in the right context.")}
        />

        <div className={styles.summaryGrid}>
          <AssumptionsCard items={data.assumptions} onOpen={() => trackAssumptionsOpened(analyticsContext)} />
          <LimitationsCard items={data.limitations} onOpen={() => trackLimitationsOpened(analyticsContext)} />
        </div>
      </section>

      <StockResultTable
        rows={data.stockResults}
        valueLabel={`${data.displayName} value`}
        filterValue={stockTableFilter}
        onFilterValueChange={(value) => {
          setStockTableFilter(value);
          trackTableFilterChange({
            ...analyticsContext,
            table_name: "indicator-stock-breakdown",
            filter_length: value.trim().length
          });
        }}
        onSortChange={(columnKey, direction) =>
          trackTableSortChange({
            ...analyticsContext,
            table_name: "indicator-stock-breakdown",
            column_key: columnKey,
            sort_direction: direction
          })
        }
        onStockSelect={(symbol) => {
          trackStockSelected({ ...analyticsContext, selected_stock: symbol, source_section: "stock_table" });
          navigate(`/analytics/stock/${encodeURIComponent(symbol)}`);
        }}
      />

      <section
        ref={sectionRefs.next_steps}
        data-indicator-section="next_steps"
        className={styles.nextSteps}
      >
        <Link
          to={relatedSurface}
          className={styles.nextCard}
          onClick={() => {
            void trackCtaClick({
              ...analyticsContext,
              page_family: "learning",
              section: "next_steps",
              cta_name: "open_related_heatmap",
              page_section: "indicator_next_steps",
              destination_path: relatedSurface
            });
          }}
        >
          <span className={styles.promptLabel}>{tr("Live surface")}</span>
          <strong>{tr("Open related heatmap")}</strong>
          <span className={styles.muted}>{tr("Take the threshold language back into the live market scan.")}</span>
        </Link>
        <Link
          to="/analytics/simulator"
          className={styles.nextCard}
          onClick={() => {
            trackCtaOpenSimulator({
              ...analyticsContext,
              source_section: "next_steps"
            });
            void trackCtaClick({
              ...analyticsContext,
              page_family: "learning",
              section: "next_steps",
              cta_name: "open_simulator",
              page_section: "indicator_next_steps",
              destination_path: "/analytics/simulator"
            });
          }}
        >
          <span className={styles.promptLabel}>{tr("Capital behavior")}</span>
          <strong>{tr("Open Simulator")}</strong>
          <span className={styles.muted}>{tr("Use this after the indicator meaning is clear and you want a scenario-level risk read.")}</span>
        </Link>
      </section>

      {analyticsDebugEnabled ? <IndicatorAnalyticsDebugPanel events={debugEvents} /> : null}
    </div>
  );
}
