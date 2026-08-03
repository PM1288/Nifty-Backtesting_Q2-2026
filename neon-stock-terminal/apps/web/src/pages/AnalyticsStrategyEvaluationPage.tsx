import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { useAuthGate } from "../auth/AuthGateProvider";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import {
  ChartCard,
  DataState,
  KpiCard,
  LoadingSkeletonCard,
  PageIntroAccordion,
  SymbolPill
} from "../components/ui/DashboardPrimitives";
import { EChartSurface } from "../components/visual/EChartSurface";
import {
  formatCurrencyINR,
  formatDateIST,
  formatNumber,
  formatPercent
} from "../lib/format";
import { useAnalyticsStrategyEvaluation } from "../lib/hooks";
import type {
  AnalyticsStrategyEvaluationDrawdownPoint,
  AnalyticsStrategyEvaluationFamilyPoint,
  AnalyticsStrategyEvaluationForwardPoint,
  AnalyticsStrategyEvaluationRegimePoint,
  AnalyticsStrategyEvaluationResponse,
  AnalyticsStrategyEvaluationScorePoint,
  AnalyticsStrategyEvaluationSectorPoint
} from "../lib/types";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import { useI18n } from "../i18n/LocaleProvider";
import { AnalyticsHeader, STRATEGY_SECTION_TABS } from "./AnalyticsChrome";
import styles from "./AnalyticsStrategyEvaluationPage.module.css";

type RubricItem = { label: string; value: string };
type ChartReading = { id: string; title: string; subtitle: string; option: EChartsOption; rubric: RubricItem[] };

const n = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const pct = (value: number | null | undefined, digits = 1, signed = true) =>
  n(value) == null ? "—" : formatPercent(value as number, digits, signed);
const num = (value: number | null | undefined, digits = 0) =>
  n(value) == null ? "—" : formatNumber(value as number, { maximumFractionDigits: digits });
const cur = (value: number | null | undefined, compact = true) =>
  n(value) == null ? "—" : formatCurrencyINR(value as number, compact);
const clean = (value: string | null | undefined) =>
  ((value ?? "").replace(/[_-]+/g, " ").trim() || "Unknown").replace(/\b\w/g, (token) => token.toUpperCase());
const rubric = (items: Array<[string, string]>) => items.map(([label, value]) => ({ label, value }));

function buildScoreDecompositionOption(rows: AnalyticsStrategyEvaluationScorePoint[]): EChartsOption {
  const data = rows.slice().reverse();
  return {
    animation: false,
    grid: { left: 84, right: 18, top: 28, bottom: 34 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: {
      type: "value",
      axisLabel: { color: "#8b93a7" },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } }
    },
    yAxis: { type: "category", data: data.map((row) => row.symbol), axisLabel: { color: "#8b93a7" } },
    series: [
      { name: "Signal quality", type: "bar", stack: "score", data: data.map((row) => row.signalQuality ?? 0), itemStyle: { color: "#6de29b" }, barMaxWidth: 18 },
      { name: "Regime fit", type: "bar", stack: "score", data: data.map((row) => row.regimeFit ?? 0), itemStyle: { color: "#7dcfff" }, barMaxWidth: 18 },
      { name: "Historical edge", type: "bar", stack: "score", data: data.map((row) => row.historicalEdge ?? 0), itemStyle: { color: "#f4d35e" }, barMaxWidth: 18 },
      { name: "Penalty drag", type: "bar", stack: "score", data: data.map((row) => -((row.riskPenalty ?? 0) + (row.anomalyPenalty ?? 0))), itemStyle: { color: "#ff7a7a" }, barMaxWidth: 18 },
      { name: "Final score", type: "line", data: data.map((row) => row.finalScore ?? 0), lineStyle: { color: "#e8eef9", width: 2 }, itemStyle: { color: "#e8eef9" } }
    ]
  };
}

function buildForwardReturnOption(rows: AnalyticsStrategyEvaluationForwardPoint[]): EChartsOption {
  const data = rows.slice();
  return {
    animation: false,
    grid: { left: 64, right: 18, top: 28, bottom: 88 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: data.map((row) => row.label), axisLabel: { color: "#8b93a7", rotate: 20 } },
    yAxis: [
      { type: "value", axisLabel: { color: "#8b93a7", formatter: "{value}%" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
      { type: "value", axisLabel: { color: "#8b93a7", formatter: "{value}%" } }
    ],
    series: [
      { name: "30m return", type: "bar", data: data.map((row) => row.avgRet30mPct ?? 0), itemStyle: { color: "#7dcfff" }, barMaxWidth: 16 },
      { name: "Close return", type: "bar", data: data.map((row) => row.avgRetClosePct ?? 0), itemStyle: { color: "#6de29b" }, barMaxWidth: 16 },
      { name: "30m hit-rate", type: "line", yAxisIndex: 1, smooth: true, data: data.map((row) => row.winRate30mPct ?? 0), lineStyle: { color: "#f4d35e", width: 2 }, itemStyle: { color: "#f4d35e" } }
    ]
  };
}

function buildHitRateOption(rows: AnalyticsStrategyEvaluationFamilyPoint[]): EChartsOption {
  const data = rows.slice();
  return {
    animation: false,
    grid: { left: 64, right: 18, top: 28, bottom: 72 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: data.map((row) => row.signalFamily), axisLabel: { color: "#8b93a7", rotate: 18 } },
    yAxis: [
      { type: "value", axisLabel: { color: "#8b93a7", formatter: "{value}%" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
      { type: "value", axisLabel: { color: "#8b93a7" } }
    ],
    series: [
      { name: "Hit-rate", type: "bar", data: data.map((row) => row.hitRatePct ?? 0), itemStyle: { color: "#6de29b" }, barMaxWidth: 18 },
      { name: "Regime hit-rate", type: "bar", data: data.map((row) => row.regimeWinRatePct ?? 0), itemStyle: { color: "#7dcfff" }, barMaxWidth: 18 },
      { name: "Sample size", type: "line", yAxisIndex: 1, smooth: true, data: data.map((row) => row.sampleCount), lineStyle: { color: "#f4d35e", width: 2 }, itemStyle: { color: "#f4d35e" } }
    ]
  };
}

function buildEquityOption(points: AnalyticsStrategyEvaluationResponse["charts"]["equityCurveVsBenchmark"]): EChartsOption {
  const data = points.slice();
  return {
    animation: false,
    grid: { left: 56, right: 18, top: 28, bottom: 56 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: data.map((row) => row.date.slice(0, 10)), axisLabel: { color: "#8b93a7", formatter: (value: string) => value.slice(5) } },
    yAxis: { type: "value", axisLabel: { color: "#8b93a7", formatter: (value: number) => cur(value) }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    series: [
      { name: "Strategy", type: "line", smooth: true, showSymbol: false, data: data.map((row) => row.strategyValue), lineStyle: { color: "#6de29b", width: 2 } },
      { name: "Benchmark", type: "line", smooth: true, showSymbol: false, data: data.map((row) => row.benchmarkValue ?? null), lineStyle: { color: "#7dcfff", width: 2 } }
    ]
  };
}

function buildDrawdownOption(points: AnalyticsStrategyEvaluationDrawdownPoint[]): EChartsOption {
  const data = points.slice();
  return {
    animation: false,
    grid: { left: 56, right: 18, top: 28, bottom: 56 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: data.map((row) => row.date.slice(0, 10)), axisLabel: { color: "#8b93a7", formatter: (value: string) => value.slice(5) } },
    yAxis: { type: "value", axisLabel: { color: "#8b93a7", formatter: "{value}%" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    series: [{ type: "line", areaStyle: { color: "rgba(255,122,122,0.18)" }, smooth: true, showSymbol: false, data: data.map((row) => row.drawdownPct ?? 0), lineStyle: { color: "#ff7a7a", width: 2 }, itemStyle: { color: "#ff7a7a" } }]
  };
}

function buildRegimeOption(rows: AnalyticsStrategyEvaluationRegimePoint[]): EChartsOption {
  const data = rows.slice();
  return {
    animation: false,
    grid: { left: 64, right: 18, top: 28, bottom: 64 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: data.map((row) => clean(row.regime)), axisLabel: { color: "#8b93a7", rotate: 18 } },
    yAxis: [
      { type: "value", axisLabel: { color: "#8b93a7", formatter: "{value}%" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
      { type: "value", axisLabel: { color: "#8b93a7" } }
    ],
    series: [
      { name: "Avg return", type: "bar", data: data.map((row) => row.avgReturnPct ?? 0), itemStyle: { color: "#6de29b" }, barMaxWidth: 18 },
      { name: "Win-rate", type: "line", yAxisIndex: 1, smooth: true, data: data.map((row) => row.winRatePct ?? 0), lineStyle: { color: "#7dcfff", width: 2 }, itemStyle: { color: "#7dcfff" } },
      { name: "Charges", type: "bar", data: data.map((row) => row.totalCharges ?? 0), itemStyle: { color: "#f4d35e" }, barMaxWidth: 12 }
    ]
  };
}

function buildSectorOption(rows: AnalyticsStrategyEvaluationSectorPoint[]): EChartsOption {
  const data = rows.slice();
  return {
    animation: false,
    grid: { left: 64, right: 18, top: 28, bottom: 74 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: data.map((row) => row.sectorName), axisLabel: { color: "#8b93a7", rotate: 18 } },
    yAxis: [
      { type: "value", axisLabel: { color: "#8b93a7", formatter: (value: number) => cur(value) }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
      { type: "value", axisLabel: { color: "#8b93a7" } }
    ],
    series: [
      { name: "Net PnL", type: "bar", data: data.map((row) => row.totalNetPnl ?? 0), itemStyle: { color: "#7dcfff" }, barMaxWidth: 18 },
      { name: "Avg return", type: "line", yAxisIndex: 1, smooth: true, data: data.map((row) => row.avgReturnPct ?? 0), lineStyle: { color: "#6de29b", width: 2 }, itemStyle: { color: "#6de29b" } }
    ]
  };
}

function buildCharts(payload: AnalyticsStrategyEvaluationResponse, tr: (value: string) => string): ChartReading[] {
  const summary = payload.summary!;
  const leadSetup = payload.currentSetups[0] ?? null;
  const cautionLead = payload.cautionSetups[0] ?? null;
  const topFamily = payload.charts.hitRateBySignalFamily[0] ?? null;
  const strongestRegime = payload.charts.performanceByRegime.slice().sort((left, right) => (right.avgReturnPct ?? 0) - (left.avgReturnPct ?? 0))[0] ?? null;
  const weakestRegime = payload.charts.performanceByRegime.slice().sort((left, right) => (left.avgReturnPct ?? 0) - (right.avgReturnPct ?? 0))[0] ?? null;
  const topSector = payload.charts.sectorContribution[0] ?? null;
  const worstSector = payload.charts.sectorContribution.slice().sort((left, right) => (left.totalNetPnl ?? 0) - (right.totalNetPnl ?? 0))[0] ?? null;
  const bestAction = payload.charts.forwardReturnByActionDirection.slice().sort((left, right) => (right.avgRet30mPct ?? 0) - (left.avgRet30mPct ?? 0))[0] ?? null;
  const worstAction = payload.charts.forwardReturnByActionDirection.slice().sort((left, right) => (left.avgRet30mPct ?? 0) - (right.avgRet30mPct ?? 0))[0] ?? null;
  const ddLead = payload.charts.drawdownCurve.reduce((lowest, row) => Math.min(lowest, row.drawdownPct ?? 0), 0);
  const latestEquity = payload.charts.equityCurveVsBenchmark.at(-1) ?? null;

  const confirmText = summary?.regimeDependence ?? "The confirming factor is that regime-aware scorecards exist for the current state.";
  const contradictText = summary?.costNote ?? "The contradiction is that gross performance still needs to survive costs and regime drift.";

  return [
    {
      id: "score",
      title: tr("score decomposition"),
      subtitle: tr("High score matters only when the positive components still dominate after penalty drag."),
      option: buildScoreDecompositionOption(payload.charts.scoreDecomposition),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Per-stock score components: signal quality, regime fit, historical edge, penalty drag, and final score.")],
        [tr("2. Why traders or analysts care about it."), tr("It shows whether the model likes a name because of real edge or because one raw component is drowning out hidden risk.")],
        [tr("3. What the axes mean and what units are used."), tr("Y-axis is stock symbol. X-axis is internal score points on a 0-100 style scale, with penalties plotted as negative drag.")],
        [tr("4. What a bullish reading looks like."), tr("Positive components stay broad and penalty drag is small, so final score remains high for the right reasons.")],
        [tr("5. What a bearish reading looks like."), tr("Final score looks attractive at first glance but risk and anomaly drag eat most of the gross signal.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Stocks cluster in the middle and the positive and negative components are too balanced to support conviction.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("High score can be mistaken for high certainty when it may only reflect one strong factor inside an overfit regime.")],
        [tr("8. What todays reading says."), tr(`The strongest current setup is ${leadSetup?.symbol ?? "—"} with final score ${num(leadSetup?.finalScore, 1)}, but the page still shows its penalty layer because score is not the same thing as certainty.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(confirmText)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(cautionLead ? `${cautionLead.symbol} carries elevated penalties despite score strength, which is exactly why the decomposition matters.` : contradictText)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: trust the score only after you inspect how much of it survives the penalty layer.")]
      ])
    },
    {
      id: "forward",
      title: tr("forward return by action and direction"),
      subtitle: tr("The best action bucket is the one that still holds edge after costs, not the one with the prettiest label."),
      option: buildForwardReturnOption(payload.charts.forwardReturnByActionDirection),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Historical forward returns and hit-rate for each action and direction bucket.")],
        [tr("2. Why traders or analysts care about it."), tr("It links what the model says now with what similar actions historically delivered after the signal fired.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is action plus direction. Left Y-axis is average forward return in percent. Right Y-axis is 30-minute hit-rate in percent.")],
        [tr("4. What a bullish reading looks like."), tr("Buy-style actions show positive forward returns across horizons with stable hit-rate, not just one isolated window.")],
        [tr("5. What a bearish reading looks like."), tr("The action bucket has weak or negative realized outcomes, especially once you move beyond the first horizon.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Different horizons disagree or hit-rate is only marginally above coin-flip.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Overlapping signals, unmodeled slippage, and holding-period mismatch can all make a bucket look stronger than it really trades.")],
        [tr("8. What todays reading says."), tr(`Best 30-minute bucket right now is ${bestAction?.label ?? "—"} at ${pct(bestAction?.avgRet30mPct, 2, true)}, while the weakest is ${worstAction?.label ?? "—"} at ${pct(worstAction?.avgRet30mPct, 2, true)}.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(topFamily ? `${topFamily.signalFamily} also leads the family table, so the action read is not standing alone.` : confirmText)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(summary?.costNote ?? contradictText)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: compare the action label with realized returns by horizon, not with the model’s confidence wording.")]
      ])
    },
    {
      id: "family",
      title: tr("hit-rate by signal family"),
      subtitle: tr("Signal presence is cheap; signal quality is what survives sample size and regime filters."),
      option: buildHitRateOption(payload.charts.hitRateBySignalFamily),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Historical hit-rate, sample size, and current-regime context for each signal family.")],
        [tr("2. Why traders or analysts care about it."), tr("It shows which signal families actually carry edge and which ones only appear often without paying well.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is signal family. Left Y-axis is hit-rate in percent. Right Y-axis is sample size count.")],
        [tr("4. What a bullish reading looks like."), tr("A signal family has healthy hit-rate, positive returns, and enough observations to matter in the current regime.")],
        [tr("5. What a bearish reading looks like."), tr("The family appears often but carries weak hit-rate or thin regime-specific sample support.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Hit-rate is respectable but regime support is thin or average returns are too small to survive costs.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Large sample size can hide regime drift, and small sample size can falsely flatter a niche family.")],
        [tr("8. What todays reading says."), tr(`Top family is ${topFamily?.signalFamily ?? "—"} with hit-rate ${pct(topFamily?.hitRatePct, 1, false)} on ${num(topFamily?.sampleCount, 0)} observations; the real question is whether that still holds in the current regime.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(confirmText)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(topFamily && topFamily.regimeSampleCount < 25 ? `${topFamily.signalFamily} looks good overall, but only ${num(topFamily.regimeSampleCount, 0)} regime-specific observations support it right now.` : contradictText)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: a frequent signal is not automatically a good signal; demand hit-rate, expectancy, and regime sample depth together.")]
      ])
    },
    {
      id: "equity",
      title: tr("equity curve vs benchmark"),
      subtitle: tr("A backtest becomes useful only when you compare its path, not just its terminal return."),
      option: buildEquityOption(payload.charts.equityCurveVsBenchmark),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Published strategy equity curve against its benchmark curve over time.")],
        [tr("2. Why traders or analysts care about it."), tr("It shows whether the strategy’s edge is persistent or only a short burst that happened to end well.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is date. Y-axis is portfolio value in rupees.")],
        [tr("4. What a bullish reading looks like."), tr("Strategy equity compounds above benchmark with tolerable volatility and manageable drawdowns.")],
        [tr("5. What a bearish reading looks like."), tr("Strategy equity lags benchmark for long stretches or only wins by taking unstable risk.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Equity and benchmark hug each other closely, leaving little dependable excess after costs.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Backtests can hide leakage, reuse overlapping signals, or understate slippage, so the curve is evidence, not proof.")],
        [tr("8. What todays reading says."), tr(`Reference strategy is ${payload.referenceStrategy?.displayName ?? "—"}, ending near ${cur(latestEquity?.strategyValue, true)} versus benchmark ${cur(latestEquity?.benchmarkValue ?? null, true)}.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(payload.referenceStrategy ? `${payload.referenceStrategy.displayName} still shows ${pct(payload.referenceStrategy.totalReturnPct, 2, true)} total return with ${pct(payload.referenceStrategy.winRatePct, 1, false)} win-rate.` : confirmText)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(summary?.costNote ?? contradictText)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: the smoother path usually teaches more than the highest final point.")]
      ])
    },
    {
      id: "drawdown",
      title: tr("drawdown curve"),
      subtitle: tr("This is the chart that keeps a good-looking model honest."),
      option: buildDrawdownOption(payload.charts.drawdownCurve),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Percentage drawdown from the equity curve’s prior peak.")],
        [tr("2. Why traders or analysts care about it."), tr("Drawdown tells you how much pain the strategy demanded while trying to earn its edge.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is date. Y-axis is drawdown in percent below the prior peak.")],
        [tr("4. What a bullish reading looks like."), tr("Drawdowns stay shallow and recover quickly relative to the benchmark opportunity set.")],
        [tr("5. What a bearish reading looks like."), tr("Drawdowns deepen, persist, or cluster around the same regimes where the strategy is supposed to have edge.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Drawdown is moderate but not clearly better or worse than what the return profile would justify.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("A short backtest or a conveniently chosen start date can hide how ugly the downside looked in harsher regimes.")],
        [tr("8. What todays reading says."), tr(`Worst drawdown in the published reference path is ${pct(ddLead, 2, true)}, so confidence should be tied to tolerance for that path, not just to the latest score.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(strongestRegime ? `${clean(strongestRegime.regime)} is where the model historically paid best, which helps explain how recovery episodes happen.` : confirmText)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(weakestRegime ? `${clean(weakestRegime.regime)} is where the model historically struggled, so regime dependence can re-open drawdown even when current scores look healthy.` : contradictText)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: if you would not sit through the drawdown, you do not really own the strategy.")]
      ])
    },
    {
      id: "regime",
      title: tr("performance by regime"),
      subtitle: tr("This is where you check whether the model actually earns its keep in the regime it claims to fit."),
      option: buildRegimeOption(payload.charts.performanceByRegime),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Historical strategy performance split by regime, including return, hit-rate, hold profile, and charges.")],
        [tr("2. Why traders or analysts care about it."), tr("A strategy can work well overall and still fail exactly when today’s regime shows up.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is regime. Left Y-axis is average return in percent. Secondary values include hit-rate percent and charge totals in rupees.")],
        [tr("4. What a bullish reading looks like."), tr("Current regime is one of the strategy’s historically constructive buckets with enough trade count to trust the edge.")],
        [tr("5. What a bearish reading looks like."), tr("Current regime is historically weak or charge-heavy, even if the raw model score today looks attractive.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Regime results are mixed or too close together to support strong adaptation claims.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Regime labeling can drift over time, and small regime buckets can make a strategy look smarter than it really is.")],
        [tr("8. What todays reading says."), tr(`Best historical regime is ${clean(strongestRegime?.regime)} at ${pct(strongestRegime?.avgReturnPct, 2, true)}, while weakest is ${clean(weakestRegime?.regime)} at ${pct(weakestRegime?.avgReturnPct, 2, true)}.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(confirmText)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(weakestRegime ? `The contradiction is regime fragility: when the environment slips toward ${clean(weakestRegime.regime)}, historical edge degrades quickly.` : contradictText)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: backtest quality improves when the current regime is one where the strategy has already paid after costs.")]
      ])
    },
    {
      id: "sector",
      title: tr("sector contribution"),
      subtitle: tr("Concentration risk shows up here long before it shows up in a marketing summary."),
      option: buildSectorOption(payload.charts.sectorContribution),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Sector-level contribution to published strategy PnL and average return.")],
        [tr("2. Why traders or analysts care about it."), tr("It shows whether the strategy is broadly useful or quietly dependent on a few sectors doing the heavy lifting.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is sector. Left Y-axis is net PnL in rupees. Right Y-axis is average return in percent.")],
        [tr("4. What a bullish reading looks like."), tr("Contribution is spread across several sectors, reducing dependence on one pocket of the market.")],
        [tr("5. What a bearish reading looks like."), tr("One sector dominates gains while other sectors lag or lose money, increasing fragility if leadership rotates.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Sector contributions are modest and mixed, so concentration risk is limited but edge is also not obvious.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Sector contribution can be distorted by stock count, benchmark composition, and one exceptional theme period that does not repeat.")],
        [tr("8. What todays reading says."), tr(`Top sector contribution is ${topSector?.sectorName ?? "—"} at ${cur(topSector?.totalNetPnl, true)}, while the weakest visible sector is ${worstSector?.sectorName ?? "—"} at ${cur(worstSector?.totalNetPnl, true)}.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(summary?.concentrationRisk ?? confirmText)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(topSector && worstSector && topSector.sectorName !== worstSector.sectorName ? `Sector dispersion cuts both ways: some sectors carry the curve, but ${worstSector.sectorName} shows the model is not uniformly strong.` : contradictText)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: sector contribution tells you whether the strategy has breadth or is simply surfing one favorable theme.")]
      ])
    }
  ];
}

function setupCard(title: string, items: AnalyticsStrategyEvaluationResponse["currentSetups"] | AnalyticsStrategyEvaluationResponse["cautionSetups"]) {
  return (
    <article className={styles.noteCard}>
      <span className={styles.eyebrow}>{title}</span>
      <div className={styles.setupList}>
        {items.map((item) => (
          <div key={`${title}-${item.symbol}-${item.action}`} className={styles.setupCard}>
            <div className={styles.setupHeader}>
              <SymbolPill label={item.symbol} detail={item.sectorName} tone="white" />
              <span className={styles.smallPrint}>{clean(item.action)} • {clean(item.direction)} • {clean(item.signalFamily)}</span>
            </div>
            <p className={styles.sectionText}>{item.reason}</p>
            <div className={styles.setupMetrics}>
              <span className={styles.metricChip}>Score {num(item.finalScore, 1)}</span>
              {"confidenceScore" in item ? <span className={styles.metricChip}>Confidence {num(item.confidenceScore, 1)} • {item.confidenceLabel}</span> : null}
              {"historicalEdge" in item ? <span className={styles.metricChip}>Edge {num(item.historicalEdge, 1)}</span> : null}
              {"regimeFit" in item ? <span className={styles.metricChip}>Regime {num(item.regimeFit, 1)}</span> : null}
              {"expectancy" in item ? <span className={styles.metricChip}>30m expectancy {pct(item.expectancy.avgReturnPct, 2, true)} on {num(item.expectancy.sampleCount, 0)} obs</span> : null}
              <span className={styles.metricChip}>Risk {num(item.riskPenalty, 1)}</span>
              <span className={styles.metricChip}>Anomaly {num(item.anomalyPenalty, 1)}</span>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export function AnalyticsStrategyEvaluationPage() {
  const { tr } = useI18n();
  const { authReady } = useAuthGate();
  const query = useAnalyticsStrategyEvaluation(authReady);
  usePageLoadProfile({
    pageName: "analytics_strategy_evaluation",
    enabled: authReady,
    queries: [{ name: "analytics-strategy-evaluation", isLoading: query.isLoading, isError: !!query.error }]
  });
  const loading = !authReady || (!query.data && query.isLoading);
  const showLoading = useDeferredBusyState(loading);
  const charts = useMemo(() => (query.data ? buildCharts(query.data, tr) : []), [query.data, tr]);

  if (loading) {
    if (!showLoading) return null;
    return (
      <div className={styles.page}>
        <section className={styles.metricGrid}>
          <LoadingSkeletonCard title={tr("Recommendation summary")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Historical edge")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Regime fit")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Risk penalties")} lines={3} compact />
        </section>
        <LoadingSkeletonCard title={tr("Strategy charts")} lines={8} />
      </div>
    );
  }

  if (query.error || !query.data || !query.data.summary) {
    return (
      <DataState
        kind="error"
        title={tr("The strategy evaluation page is unavailable")}
        body={tr("The dashboard could not assemble the recommendation, expectancy, regime, and backtest context required for a useful strategy read.")}
      />
    );
  }

  const payload = query.data;
  const summary = payload.summary!;
  const lead = payload.currentSetups[0] ?? null;
  const caution = payload.cautionSetups[0] ?? null;
  const bestRegime = payload.charts.performanceByRegime.slice().sort((left, right) => (right.avgReturnPct ?? 0) - (left.avgReturnPct ?? 0))[0] ?? null;
  const bestFamily = payload.charts.hitRateBySignalFamily[0] ?? null;

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title="Strategy Evaluation"
        meta={`${tr("As of")} ${payload.asOfDate ? formatDateIST(payload.asOfDate) : "—"} • ${tr("Updated")} ${formatDateIST(payload.generatedAt, { includeTime: true })}`}
        subtitle={tr("Separate raw score, confidence, regime fit, penalties, and realized expectancy before trusting any recommendation. This page is educational by design: it explains why the model works, where it fails, and what the backtest path actually demanded.")}
        learningPrompt={tr("This page teaches the difference between a high score, a high-confidence setup, and a historically supported setup after costs.")}
        sectionTabs={[...STRATEGY_SECTION_TABS]}
      />

      <section className={styles.metricGrid}>
        <KpiCard label={tr("A. Current recommendation summary")} value={summary.confidenceLabel} tone="white" meta={tr(summary.modelBias)} />
        <KpiCard label={tr("Average final score")} value={num(summary.avgFinalScore, 1)} tone="green" meta={tr(`Historical edge ${num(summary.avgHistoricalEdge, 1)} • Regime fit ${num(summary.avgRegimeFit, 1)}`)} />
        <KpiCard label={tr("Penalty layer")} value={`${num(summary.avgRiskPenalty, 1)} / ${num(summary.avgAnomalyPenalty, 1)}`} tone="red" meta={tr("Average risk / anomaly drag")} />
        <KpiCard label={tr("Regime context")} value={summary.currentRegime} tone="white" meta={tr(`${summary.currentDirection} • ${summary.regimeDependence}`)} />
      </section>

      <section className={styles.verdictCard}>
        <span className={styles.eyebrow}>{tr("A. Current recommendation summary")}</span>
        <p className={styles.sectionText}>{tr(summary.takeaway)}</p>
        <p className={styles.sectionText}>{tr(`Current regime is ${summary.currentRegime} with ${num(summary.signalCount, 0)} active recommendations, top sector ${summary.topSector}, and top signal family ${summary.topSignalFamily}.`)}</p>
        <p className={styles.smallPrint}>{tr(summary.concentrationRisk)}</p>
      </section>

      <section className={styles.doubleGrid}>
        {setupCard(tr("B. Why the model likes the current setups"), payload.currentSetups)}
        {setupCard(tr("E. What reduces confidence in the current recommendation"), payload.cautionSetups)}
      </section>

      <section className={styles.kickerGrid}>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("D. Historical performance by regime, sector, and signal family")}</span>
          <p className={styles.sectionText}>{tr(`Best regime bucket is ${clean(bestRegime?.regime)} at ${pct(bestRegime?.avgReturnPct, 2, true)} average return with ${pct(bestRegime?.winRatePct, 1, false)} hit-rate.`)}</p>
          <p className={styles.sectionText}>{tr(`Current top signal family is ${bestFamily?.signalFamily ?? "—"} on ${num(bestFamily?.sampleCount, 0)} observations, with regime-specific sample ${num(bestFamily?.regimeSampleCount, 0)}.`)}</p>
          <p className={styles.smallPrint}>{tr(summary.costNote)}</p>
        </article>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("Confidence reducers")}</span>
          <div className={styles.bulletList}>
            <p className={styles.sectionText}>{tr("High score is not high certainty when penalties are doing hidden work against the raw signal.")}</p>
            <p className={styles.sectionText}>{tr("Backtest quality changes by regime and sector, so a strong current setup can still be fragile in the wrong environment.")}</p>
            <p className={styles.sectionText}>{tr("Forward outcomes are path-sensitive: a bucket can work at 30 minutes and fail badly by close or after costs.")}</p>
          </div>
        </article>
      </section>

      <section className={styles.sectionStack}>
        {charts.map((chart) => (
          <ChartCard key={chart.id} title={chart.title} subtitle={chart.subtitle}>
            <div className={styles.chartPanel}>
              <EChartSurface ariaLabel={chart.title} className={styles.chartSurface} option={chart.option} />
              <div className={styles.rubricGrid}>
                {chart.rubric.map((item) => (
                  <article key={`${chart.id}-${item.label}`} className={styles.rubricItem}>
                    <strong>{item.label}</strong>
                    <p>{item.value}</p>
                  </article>
                ))}
              </div>
            </div>
          </ChartCard>
        ))}
      </section>

      <section className={styles.doubleGrid}>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("F. Teaching notes on reading model output")}</span>
          <div className={styles.bulletList}>
            <p className={styles.sectionText}>{tr("Signal score is the model’s internal ranking, confidence is score after penalties and context, and realized expectancy is what similar signals actually delivered historically.")}</p>
            <p className={styles.sectionText}>{tr("A model can be right directionally and still be poor for your hold horizon. Always check 30m, close, and regime-specific results before acting.")}</p>
            <p className={styles.sectionText}>{tr("The more a strategy depends on one regime or one sector, the less transferable its historical edge is.")}</p>
          </div>
        </article>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("Best reading habits")}</span>
          <div className={styles.bulletList}>
            <p className={styles.sectionText}>{tr(`Start with ${lead?.symbol ?? "the top setup"} only after asking whether the current regime and family statistics agree with the headline score.`)}</p>
            <p className={styles.sectionText}>{tr(`Treat ${caution?.symbol ?? "the caution bucket"} as a reminder that penalties exist for a reason: anomaly and risk drag can be the real story.`)}</p>
            <p className={styles.sectionText}>{tr("Use the equity and drawdown charts to calibrate sizing, not just to admire historical returns.")}</p>
          </div>
        </article>
      </section>

      <PageIntroAccordion
        label={tr("How to use this page")}
        title={tr("Read the model in this order: score components, penalties, regime fit, realized expectancy, then backtest path and cost sensitivity.")}
        body={tr("This page is deliberately anti-promotional. It explains when the recommendation engine deserves attention, when it deserves skepticism, and why a high score alone is never enough.")}
        items={[
          tr("Always separate score, confidence, and realized expectancy."),
          tr("Costs and slippage can turn a gross edge into a weak net edge."),
          tr("Regime and sector dependence matter more than a pretty headline return."),
          tr("Backtests are evidence about the past, not proof about the future.")
        ]}
        widgetId="analytics_strategy_evaluation_help"
      />

      <div className={styles.takeaway}>
        <strong>{tr("Strategy takeaway:")}</strong>{" "}
        {tr("The model sees selective opportunity, but the durable read is not the headline score alone: confidence only improves when regime fit, family-level expectancy, and cost-aware backtest behavior all point in the same direction.")}
      </div>
    </div>
  );
}
