import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { useAuthGate } from "../auth/AuthGateProvider";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { ChartCard, DataState, DataTable, KpiCard, LoadingSkeletonCard, PageIntroAccordion, SymbolPill } from "../components/ui/DashboardPrimitives";
import { EChartSurface } from "../components/visual/EChartSurface";
import { useAnalyticsDailySetups } from "../lib/hooks";
import { fmtPrice, formatDateIST, formatNumber, formatPercent } from "../lib/format";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import type { AnalyticsDailyBucket, AnalyticsDailyRegimePerformance, AnalyticsDailySetupsResponse, AnalyticsDailySetupRow, AnalyticsDailySignalHitRate } from "../lib/types";
import { useI18n } from "../i18n/LocaleProvider";
import { AnalyticsHeader, STOCKS_SECTION_TABS } from "./AnalyticsChrome";
import styles from "./AnalyticsSetupsPage.module.css";

type Tone = "green" | "red" | "white";
type RubricItem = { label: string; value: string };
type ChartReading = { id: string; title: string; subtitle: string; option: EChartsOption; rubric: RubricItem[] };

const n = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const pct = (value: number | null | undefined, digits = 1, signed = false) => (n(value) == null ? "—" : formatPercent(value as number, digits, signed));
const px = (value: number | null | undefined) => (n(value) == null ? "—" : fmtPrice(value as number));
const tone = (value: number | null | undefined): Tone => (n(value) == null ? "white" : (value as number) > 0 ? "green" : (value as number) < 0 ? "red" : "white");
const tc = (value: string | null | undefined) => ((value ?? "").replace(/[_-]+/g, " ").trim() || "Unknown").replace(/\b\w/g, (token) => token.toUpperCase());
const rubric = (items: Array<[string, string]>) => items.map(([label, value]) => ({ label, value }));

function countOption(rows: AnalyticsDailySetupsResponse["breakoutBreakdownHistory"]): EChartsOption {
  const data = rows.slice(-30);
  return {
    animation: false,
    grid: { left: 44, right: 16, top: 24, bottom: 52 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: data.map((row) => row.tradeDate?.slice(5) ?? "—"), axisLabel: { color: "#8b93a7", rotate: 24, interval: 4 } },
    yAxis: { type: "value", axisLabel: { color: "#8b93a7" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    series: [
      { name: "Breakouts", type: "bar", data: data.map((row) => row.breakoutCount), itemStyle: { color: "#6de29b" }, barMaxWidth: 16 },
      { name: "Breakdowns", type: "bar", data: data.map((row) => row.breakdownCount), itemStyle: { color: "#ff7a7a" }, barMaxWidth: 16 }
    ]
  };
}

function bucketOption(rows: AnalyticsDailyBucket[], key: "avgForwardReturn5d" | "hitRate5d", positive: string): EChartsOption {
  const data = rows.slice().sort((a, b) => a.bucketOrder - b.bucketOrder);
  return {
    animation: false,
    grid: { left: 44, right: 16, top: 24, bottom: 50 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: data.map((row) => row.bucketLabel), axisLabel: { color: "#8b93a7" } },
    yAxis: { type: "value", axisLabel: { color: "#8b93a7" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    series: [{
      type: "bar",
      data: data.map((row) => {
        const value = key === "avgForwardReturn5d" ? (row.avgForwardReturn5d ?? 0) * 100 : row.hitRate5d ?? 0;
        return { value, itemStyle: { color: value >= (key === "hitRate5d" ? 50 : 0) ? positive : "#ff7a7a" } };
      }),
      barMaxWidth: 24
    }]
  };
}

function hitRateOption(rows: AnalyticsDailySignalHitRate[]): EChartsOption {
  const data = rows.slice(0, 8).reverse();
  return {
    animation: false,
    grid: { left: 150, right: 16, top: 24, bottom: 32 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis" },
    xAxis: { type: "value", min: 0, max: 100, axisLabel: { color: "#8b93a7" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    yAxis: { type: "category", data: data.map((row) => `${tc(row.signalName)} • ${tc(row.signalDirection)}`), axisLabel: { color: "#8b93a7" } },
    series: [
      { name: "1d", type: "bar", data: data.map((row) => row.hitRate1d ?? 0), itemStyle: { color: "#7dcfff" }, barMaxWidth: 14 },
      { name: "3d", type: "bar", data: data.map((row) => row.hitRate3d ?? 0), itemStyle: { color: "#f4d35e" }, barMaxWidth: 14 },
      { name: "5d", type: "bar", data: data.map((row) => row.hitRate5d ?? 0), itemStyle: { color: "#6de29b" }, barMaxWidth: 14 },
      { name: "10d", type: "bar", data: data.map((row) => row.hitRate10d ?? 0), itemStyle: { color: "#ff9f68" }, barMaxWidth: 14 }
    ]
  };
}

function regimeOption(rows: AnalyticsDailyRegimePerformance[]): EChartsOption {
  const data = rows.slice(0, 10);
  return {
    animation: false,
    grid: { left: 124, right: 18, top: 26, bottom: 42 },
    tooltip: { trigger: "item" },
    xAxis: { type: "category", data: data.map((row) => tc(row.marketRegime)), axisLabel: { color: "#8b93a7", rotate: 18 } },
    yAxis: { type: "category", data: data.map((row) => tc(row.signalName)), axisLabel: { color: "#8b93a7" } },
    visualMap: { min: -4, max: 4, orient: "horizontal", left: "center", bottom: 0, textStyle: { color: "#8b93a7" } },
    series: [{ type: "heatmap", data: data.map((row, index) => [index, index, (row.avgForwardReturn5d ?? 0) * 100]), label: { show: true, color: "#f5f7fb", formatter: (params: unknown) => `${Number(((params as { data?: unknown[] }).data ?? [0, 0, 0])[2]).toFixed(1)}%` } }]
  };
}

function listCard(title: string, rows: AnalyticsDailySetupRow[]) {
  return (
    <article className={styles.noteCard}>
      <span className={styles.eyebrow}>{title}</span>
      <div className={styles.stockList}>
        {rows.map((row) => (
          <div key={`${title}-${row.symbol}`} className={styles.stockItem}>
            <div className={styles.stockHeader}>
              <SymbolPill label={row.symbol} detail={row.setupStyle} tone={row.qualityLabel === "constructive" ? "green" : row.qualityLabel === "deceptive" ? "red" : "white"} />
              <span className={styles.stockMeta}>{px(row.closePrice)} • {pct(row.dailyReturn, 2, true)} • sample {formatNumber(row.sampleSize)}</span>
            </div>
            <p className={styles.sectionText}><strong>{row.securityName ?? row.symbol}</strong> {row.reasons.join(" • ") || "has an active setup with limited confirmation."}</p>
            <p className={styles.smallPrint}>Regime {row.marketRegime} • 1d {pct(row.avgForwardReturn1d, 2, true)} • 3d {pct(row.avgForwardReturn3d, 2, true)} • 5d {pct(row.avgForwardReturn5d, 2, true)} • 10d {pct(row.avgForwardReturn10d, 2, true)}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function buildCharts(payload: AnalyticsDailySetupsResponse, tr: (value: string) => string): ChartReading[] {
  const best = payload.bestCurrentSetups[0];
  const weak = payload.deceptiveSetups[0];
  const bestSignal = payload.signalHitRates.slice().sort((a, b) => (b.avgForwardReturn5d ?? -Infinity) - (a.avgForwardReturn5d ?? -Infinity))[0];
  const worstSignal = payload.signalHitRates.slice().sort((a, b) => (a.avgForwardReturn5d ?? Infinity) - (b.avgForwardReturn5d ?? Infinity))[0];
  const bestRegime = payload.regimePerformance.slice().sort((a, b) => (b.avgForwardReturn5d ?? -Infinity) - (a.avgForwardReturn5d ?? -Infinity))[0];
  const weakRegime = payload.regimePerformance.slice().sort((a, b) => (a.avgForwardReturn5d ?? Infinity) - (b.avgForwardReturn5d ?? Infinity))[0];
  const volumeBest = payload.volumeBuckets.slice().sort((a, b) => (b.avgForwardReturn5d ?? -Infinity) - (a.avgForwardReturn5d ?? -Infinity))[0];
  const deliveryBest = payload.deliveryBuckets.slice().sort((a, b) => (b.avgForwardReturn5d ?? -Infinity) - (a.avgForwardReturn5d ?? -Infinity))[0];
  const distanceBest = payload.distanceBuckets.slice().sort((a, b) => (b.avgForwardReturn5d ?? -Infinity) - (a.avgForwardReturn5d ?? -Infinity))[0];
  const regime = payload.marketContext?.marketRegime ?? "Unknown";
  const confirm = best ? `${best.symbol} confirms the better-quality side with sample ${formatNumber(best.sampleSize)} and ${pct(best.avgForwardReturn5d, 2, true)} average 5d return.` : "The stronger names still show confirmation from expectancy and structure.";
  const contradict = weak ? `${weak.symbol} contradicts the easy story because signal presence is active while quality remains weak.` : "Weak delivery and event-heavy names still contradict any simple all-clear reading.";
  return [
    { id: "counts", title: tr("breakout / breakdown counts over time"), subtitle: tr("Counts show setup supply, not edge by themselves."), option: countOption(payload.breakoutBreakdownHistory), rubric: rubric([[tr("1. What this chart is measuring."), tr("Daily breakout and breakdown setup counts across the stock universe.")],[tr("2. Why traders or analysts care about it."), tr("It shows whether the tape is creating many directional setups or only scattered noise.")],[tr("3. What the axes mean and what units are used."), tr("X-axis is trade date. Y-axis is number of stocks.")],[tr("4. What a bullish reading looks like."), tr("Breakout counts rise while breakdown counts remain controlled.")],[tr("5. What a bearish reading looks like."), tr("Breakdown counts dominate or breakout counts collapse.")],[tr("6. What a neutral or indecisive reading looks like."), tr("Breakout and breakdown counts stay close together.")],[tr("7. What can fool the reader or produce a false signal."), tr("Lookahead leakage, regime drift, and event-heavy sessions can inflate setup counts without real expectancy.")],[tr("8. What todays reading says."), tr(`Today is ${regime} with ${formatNumber(payload.marketContext?.breakoutCount ?? 0)} breakouts and ${formatNumber(payload.marketContext?.breakdownCount ?? 0)} breakdowns, so activity is elevated but mixed.`)],[tr("9. What confirms this reading elsewhere on the dashboard."), tr(confirm)],[tr("10. What contradicts this reading elsewhere on the dashboard."), tr(contradict)],[tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: count active setups first, then verify whether the active setups historically deserve trust.")]]) },
    { id: "volume", title: tr("volume_rel_20 vs forward 5-day return"), subtitle: tr("Volume confirms only when the bucket itself has positive expectancy."), option: bucketOption(payload.volumeBuckets, "avgForwardReturn5d", "#6de29b"), rubric: rubric([[tr("1. What this chart is measuring."), tr("Average 5-day forward return grouped by volume relative to the 20-day baseline.")],[tr("2. Why traders or analysts care about it."), tr("It tells you whether elevated volume is real confirmation or only emotional participation.")],[tr("3. What the axes mean and what units are used."), tr("X-axis is volume_rel_20 bucket. Y-axis is average 5-day return in percent.")],[tr("4. What a bullish reading looks like."), tr("Higher volume buckets show better forward returns with usable sample size.")],[tr("5. What a bearish reading looks like."), tr("High-volume buckets still produce negative forward returns.")],[tr("6. What a neutral or indecisive reading looks like."), tr("Forward returns cluster near zero across buckets.")],[tr("7. What can fool the reader or produce a false signal."), tr("One-day news spikes and adjusted-price distortions can make volume look more meaningful than it is.")],[tr("8. What todays reading says."), tr(`${volumeBest?.bucketLabel ?? "The best bucket"} is the strongest historical volume bucket with sample ${formatNumber(volumeBest?.sampleSize ?? 0)} and ${pct(volumeBest?.avgForwardReturn5d, 2, true)} average 5d return.`)],[tr("9. What confirms this reading elsewhere on the dashboard."), tr(confirm)],[tr("10. What contradicts this reading elsewhere on the dashboard."), tr(contradict)],[tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: volume is confirmation only if both the live stock and the historical bucket agree.")]]) },
    { id: "delivery", title: tr("delivery_rel_20 vs forward 5-day return"), subtitle: tr("Delivery is the cleaner conviction filter for swing quality."), option: bucketOption(payload.deliveryBuckets, "avgForwardReturn5d", "#7dcfff"), rubric: rubric([[tr("1. What this chart is measuring."), tr("Average 5-day forward return grouped by delivery relative to the 20-day baseline.")],[tr("2. Why traders or analysts care about it."), tr("Delivery helps separate accumulation from speculative churn.")],[tr("3. What the axes mean and what units are used."), tr("X-axis is delivery_rel_20 bucket. Y-axis is average 5-day return in percent.")],[tr("4. What a bullish reading looks like."), tr("Higher delivery buckets produce better forward returns and better hit rates.")],[tr("5. What a bearish reading looks like."), tr("Low delivery buckets underperform, especially when they coincide with breakouts.")],[tr("6. What a neutral or indecisive reading looks like."), tr("Delivery buckets do not separate clearly.")],[tr("7. What can fool the reader or produce a false signal."), tr("Announcement timing and corporate-action dates can distort delivery interpretation if read lazily.")],[tr("8. What todays reading says."), tr(`${deliveryBest?.bucketLabel ?? "The best delivery bucket"} leads with sample ${formatNumber(deliveryBest?.sampleSize ?? 0)} and ${pct(deliveryBest?.avgForwardReturn5d, 2, true)} average 5d return.`)],[tr("9. What confirms this reading elsewhere on the dashboard."), tr(confirm)],[tr("10. What contradicts this reading elsewhere on the dashboard."), tr(contradict)],[tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: if delivery is weak, assume the move has to prove itself again tomorrow.")]]) },
    { id: "distance", title: tr("distance from 52-week high vs future return"), subtitle: tr("Proximity to highs helps only when the setup quality is already sound."), option: bucketOption(payload.distanceBuckets, "avgForwardReturn5d", "#f4d35e"), rubric: rubric([[tr("1. What this chart is measuring."), tr("Average 5-day forward return grouped by derived distance from the 52-week high.")],[tr("2. Why traders or analysts care about it."), tr("It tests whether near-high names actually continue or only look crowded.")],[tr("3. What the axes mean and what units are used."), tr("X-axis is distance-from-high bucket. Y-axis is average 5-day return in percent.")],[tr("4. What a bullish reading looks like."), tr("Near-high buckets outperform with solid sample size.")],[tr("5. What a bearish reading looks like."), tr("Near-high buckets underperform, meaning strength is being overpaid for.")],[tr("6. What a neutral or indecisive reading looks like."), tr("All buckets converge around zero.")],[tr("7. What can fool the reader or produce a false signal."), tr("Adjusted-price issues around splits, bonuses, or dividends can distort distance-from-high calculations.")],[tr("8. What todays reading says."), tr(`${distanceBest?.bucketLabel ?? "The best bucket"} is the strongest distance bucket with sample ${formatNumber(distanceBest?.sampleSize ?? 0)} and ${pct(distanceBest?.avgForwardReturn5d, 2, true)} average 5d return.`)],[tr("9. What confirms this reading elsewhere on the dashboard."), tr(confirm)],[tr("10. What contradicts this reading elsewhere on the dashboard."), tr(contradict)],[tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: being near a high is context, not permission; quality confirmation must still agree.")]]) },
    { id: "hit-rate", title: tr("signal hit-rate by horizon"), subtitle: tr("This shows whether the setup survives beyond the first day."), option: hitRateOption(payload.signalHitRates), rubric: rubric([[tr("1. What this chart is measuring."), tr("Hit rates for the main signal families across 1d, 3d, 5d, and 10d horizons.")],[tr("2. Why traders or analysts care about it."), tr("A setup that works only for one day is very different from one that compounds over a swing horizon.")],[tr("3. What the axes mean and what units are used."), tr("X-axis is hit rate in percent. Y-axis is signal family and direction.")],[tr("4. What a bullish reading looks like."), tr("Hit rates stay above 50% across multiple horizons and average returns remain positive.")],[tr("5. What a bearish reading looks like."), tr("Hit rates fade quickly or stay below 50% as horizon extends.")],[tr("6. What a neutral or indecisive reading looks like."), tr("One horizon works but others fail, so there is no stable edge.")],[tr("7. What can fool the reader or produce a false signal."), tr("Tiny samples and leaked features can make hit-rate tables look more robust than they are.")],[tr("8. What todays reading says."), tr(`${tc(bestSignal?.signalName)} is the best current signal-quality row with sample ${formatNumber(bestSignal?.sampleSize ?? 0)} and ${pct(bestSignal?.avgForwardReturn5d, 2, true)} average 5d return, while ${tc(worstSignal?.signalName)} is the weak side of the table.`)],[tr("9. What confirms this reading elsewhere on the dashboard."), tr(confirm)],[tr("10. What contradicts this reading elsewhere on the dashboard."), tr(contradict)],[tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: compare all horizons together because real swing setups should not collapse after the first day.")]]) },
    { id: "regime", title: tr("regime-specific signal performance"), subtitle: tr("The same setup can work in one regime and fail in another."), option: regimeOption(payload.regimePerformance), rubric: rubric([[tr("1. What this chart is measuring."), tr("Average 5-day forward return for major setup families inside each market regime.")],[tr("2. Why traders or analysts care about it."), tr("It tells you whether a setup has structural edge or only conditional edge.")],[tr("3. What the axes mean and what units are used."), tr("X-axis is market regime. Y-axis is signal family. Cell value is average 5-day return in percent.")],[tr("4. What a bullish reading looks like."), tr("The setup remains positive in the current regime with a credible sample size.")],[tr("5. What a bearish reading looks like."), tr("The setup turns negative in the current regime even when it looks attractive today.")],[tr("6. What a neutral or indecisive reading looks like."), tr("The setup flips sign or hovers near zero across regimes.")],[tr("7. What can fool the reader or produce a false signal."), tr("Regime drift and shrinking samples can make yesterday’s edge look more portable than it is.")],[tr("8. What todays reading says."), tr(`Today’s regime is ${regime}. Strongest row: ${tc(bestRegime?.signalName)} in ${tc(bestRegime?.marketRegime)} with sample ${formatNumber(bestRegime?.sampleSize ?? 0)} and ${pct(bestRegime?.avgForwardReturn5d, 2, true)} average 5d return. Weakest row: ${tc(weakRegime?.signalName)} in ${tc(weakRegime?.marketRegime)} at ${pct(weakRegime?.avgForwardReturn5d, 2, true)}.`)],[tr("9. What confirms this reading elsewhere on the dashboard."), tr(payload.summary?.regimeMessage ?? "The summary already warns that regime context changes setup quality.")],[tr("10. What contradicts this reading elsewhere on the dashboard."), tr(contradict)],[tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: do not ask whether a setup works in general; ask whether it works in this regime.")]]) }
  ];
}

export function AnalyticsSetupsPage() {
  const { tr } = useI18n();
  const { authReady } = useAuthGate();
  const query = useAnalyticsDailySetups(authReady);
  usePageLoadProfile({ pageName: "analytics_daily_setups", enabled: authReady, queries: [{ name: "analytics-daily-setups", isLoading: query.isLoading, isError: !!query.error }] });
  const loading = !authReady || (!query.data && query.isLoading);
  const showLoading = useDeferredBusyState(loading);
  const charts = useMemo(() => (query.data ? buildCharts(query.data, tr) : []), [query.data, tr]);

  if (loading) {
    if (!showLoading) return null;
    return <div className={styles.page}><section className={styles.metricGrid}><LoadingSkeletonCard title={tr("Best current setups")} lines={3} compact /><LoadingSkeletonCard title={tr("Weak setups")} lines={3} compact /><LoadingSkeletonCard title={tr("Regime context")} lines={3} compact /><LoadingSkeletonCard title={tr("Signal quality")} lines={3} compact /></section><LoadingSkeletonCard title={tr("Daily setups charts")} lines={8} /></div>;
  }

  if (query.error || !query.data || !query.data.marketContext || !query.data.summary) {
    return <DataState kind="error" title={tr("The daily setups page is unavailable")} body={tr("The dashboard could not assemble the latest setup, expectancy, and regime context from the EOD stock-analysis tables.")} />;
  }

  const payload = query.data;
  const market = payload.marketContext!;
  const summary = payload.summary!;
  const bestSignal = payload.signalHitRates.slice().sort((a, b) => (b.avgForwardReturn5d ?? -Infinity) - (a.avgForwardReturn5d ?? -Infinity))[0];
  const worstSignal = payload.signalHitRates.slice().sort((a, b) => (a.avgForwardReturn5d ?? Infinity) - (b.avgForwardReturn5d ?? Infinity))[0];

  return (
    <div className={styles.page}>
      <AnalyticsHeader title="Daily Setups" meta={`${tr("Trade date")} ${payload.tradeDate ? formatDateIST(payload.tradeDate) : "—"} • ${tr("Updated")} ${formatDateIST(payload.asOf, { includeTime: true })}`} subtitle={tr("Use post-close setup quality, forward-return expectancy, and regime context to separate real swing setups from random moves.")} learningPrompt={tr("This page answers two questions: which setups are active now, and which setup families have historically earned the right to matter?")} sectionTabs={[...STOCKS_SECTION_TABS]} />

      <section className={styles.metricGrid}>
        <KpiCard label={tr("A. Best current setups")} value={payload.bestCurrentSetups[0]?.symbol ?? "—"} tone={payload.bestCurrentSetups[0]?.qualityLabel === "constructive" ? "green" : "white"} meta={tr(`${payload.bestCurrentSetups[0]?.setupStyle ?? "No active constructive setup"} • sample ${formatNumber(payload.bestCurrentSetups[0]?.sampleSize ?? 0)}`)} />
        <KpiCard label={tr("B. Weak or deceptive setups")} value={payload.deceptiveSetups[0]?.symbol ?? "—"} tone="red" meta={tr(`${payload.deceptiveSetups[0]?.signalName ? tc(payload.deceptiveSetups[0].signalName) : "No deceptive setup"} • sample ${formatNumber(payload.deceptiveSetups[0]?.sampleSize ?? 0)}`)} />
        <KpiCard label={tr("Current regime")} value={market.marketRegime} tone={tone(market.avgDailyReturn)} meta={tr(`Breakouts ${formatNumber(market.breakoutCount)} • Breakdowns ${formatNumber(market.breakdownCount)} • Positive ratio ${pct(market.positiveRatio, 1)}`)} />
        <KpiCard label={tr("Signal quality")} value={bestSignal ? `${tc(bestSignal.signalName)} ${pct(bestSignal.avgForwardReturn5d, 2, true)}` : "—"} tone={tone(bestSignal?.avgForwardReturn5d)} meta={tr(bestSignal ? `sample ${formatNumber(bestSignal.sampleSize)} • 1d ${pct(bestSignal.avgForwardReturn1d, 2, true)} • 10d ${pct(bestSignal.avgForwardReturn10d, 2, true)}` : "No quality row available")} />
      </section>

      <section className={styles.verdictCard}>
        <span className={styles.eyebrow}>{tr("Signal presence vs signal quality")}</span>
        <p className={styles.sectionText}>{tr("A setup is active because a rule fired. A setup is high quality only if it still has expectancy after you check sample size, current regime, volume confirmation, delivery confirmation, and proximity to highs.")}</p>
        <p className={styles.sectionText}>{tr(summary.regimeMessage)}</p>
      </section>

      <section className={styles.doubleGrid}>
        {listCard(tr("A. Best current setups"), payload.bestCurrentSetups)}
        {listCard(tr("B. Weak or deceptive setups to avoid"), payload.deceptiveSetups)}
      </section>

      <section className={styles.sectionStack}>
        {charts.map((chart) => (
          <ChartCard key={chart.id} title={chart.title} subtitle={chart.subtitle}>
            <div className={styles.chartPanel}>
              <EChartSurface ariaLabel={chart.title} className={styles.chartSurface} option={chart.option} />
              <div className={styles.rubricGrid}>
                {chart.rubric.map((item) => <article key={`${chart.id}-${item.label}`} className={styles.rubricItem}><strong>{item.label}</strong><p>{item.value}</p></article>)}
              </div>
            </div>
          </ChartCard>
        ))}
      </section>

      <section className={styles.doubleGrid}>
        <article className={styles.noteCard}><span className={styles.eyebrow}>{tr("D. Historical expectancy by setup and regime")}</span><div className={styles.bulletList}>{payload.regimePerformance.slice(0, 6).map((row) => <p key={`${row.marketRegime}-${row.signalName}-${row.signalDirection}`} className={styles.sectionText}><strong>{tc(row.signalName)} / {tc(row.signalDirection)}</strong> in <strong>{row.marketRegime}</strong>: sample {formatNumber(row.sampleSize)}, 1d {pct(row.avgForwardReturn1d, 2, true)}, 3d {pct(row.avgForwardReturn3d, 2, true)}, 5d {pct(row.avgForwardReturn5d, 2, true)}, 10d {pct(row.avgForwardReturn10d, 2, true)}.</p>)}</div></article>
        <article className={styles.noteCard}><span className={styles.eyebrow}>{tr("E. Best swing entry styles")}</span><div className={styles.bulletList}><p className={styles.sectionText}>{tr("Breakout continuation: only for constructive setups with positive multi-horizon expectancy, supportive volume buckets, and no event distortion.")}</p><p className={styles.sectionText}>{tr("Pullback entry: strongest when the stock stays reasonably close to its 52-week high and delivery confirmation remains intact.")}</p><p className={styles.sectionText}>{tr("Relative-strength hold: use when trend score stays above reversal score and the signal still works in the current regime.")}</p><p className={styles.sectionText}>{tr("Mean-reversion only: reserve for deceptive spikes, weak-delivery breakouts, or event-heavy names with poor 5-day expectancy.")}</p></div></article>
      </section>

      <section className={styles.doubleGrid}>
        <article className={styles.noteCard}><span className={styles.eyebrow}>{tr("F. Risk conditions that reduce expectancy")}</span><div className={styles.bulletList}><p className={styles.sectionText}>{tr("Lookahead leakage can make a setup look smarter than it really is if forward outcomes leak into the signal logic.")}</p><p className={styles.sectionText}>{tr("Adjusted-price mistakes around splits, bonuses, and dividends can corrupt breakout and 52-week-high logic.")}</p><p className={styles.sectionText}>{tr("Announcement dates and ex-dates are not interchangeable; mixing them creates false precision in event overlays.")}</p><p className={styles.sectionText}>{tr("Very low sample-size setups can look exciting, but the confidence interval is too wide for clean expectancy.")}</p></div></article>
        <article className={styles.noteCard}><span className={styles.eyebrow}>{tr("G. Teaching notes for learners")}</span><div className={styles.bulletList}><p className={styles.sectionText}>{tr("Volume, delivery, and proximity to highs are confirmation layers. They do not create the setup by themselves, but they decide whether the setup deserves trust.")}</p><p className={styles.sectionText}>{tr("A random move often has signal presence with poor sample size, poor delivery, negative 5-day expectancy, and no regime support.")}</p><p className={styles.sectionText}>{tr(`Best current quality row: ${tc(bestSignal?.signalName)} (${pct(bestSignal?.avgForwardReturn5d, 2, true)} on 5d). Worst quality row: ${tc(worstSignal?.signalName)} (${pct(worstSignal?.avgForwardReturn5d, 2, true)} on 5d).`)}</p></div></article>
      </section>

      <DataTable title={tr("Current setup board")} subtitle={tr("Compare signal presence, sample size, confirmation, and expectancy before picking a swing candidate.")} tableName="analytics_daily_setups" rows={payload.currentSetups} maxHeight={560} columns={[
        { key: "symbol", header: tr("Symbol"), sortable: true, sortValue: (row) => row.symbol, cell: (row) => <div className={styles.rankCell}><strong>{row.symbol}</strong><span>{row.securityName ?? row.symbol}</span></div> },
        { key: "qualityLabel", header: tr("Quality"), sortable: true, sortValue: (row) => row.qualityLabel, cell: (row) => <SymbolPill label={row.qualityLabel} detail={row.setupStyle} tone={row.qualityLabel === "constructive" ? "green" : row.qualityLabel === "deceptive" ? "red" : "white"} /> },
        { key: "sampleSize", header: tr("Sample"), sortable: true, align: "right", sortValue: (row) => row.sampleSize, cell: (row) => formatNumber(row.sampleSize) },
        { key: "avgForwardReturn5d", header: tr("5d"), sortable: true, align: "right", sortValue: (row) => row.avgForwardReturn5d ?? -Infinity, cell: (row) => <span data-tone={tone(row.avgForwardReturn5d)}>{pct(row.avgForwardReturn5d, 2, true)}</span> },
        { key: "avgForwardReturn10d", header: tr("10d"), sortable: true, align: "right", sortValue: (row) => row.avgForwardReturn10d ?? -Infinity, cell: (row) => <span data-tone={tone(row.avgForwardReturn10d)}>{pct(row.avgForwardReturn10d, 2, true)}</span> },
        { key: "volumeRel20", header: tr("Vol x20"), sortable: true, align: "right", sortValue: (row) => row.volumeRel20 ?? -Infinity, cell: (row) => formatNumber(row.volumeRel20 ?? 0, { maximumFractionDigits: 2 }) },
        { key: "deliveryRel20", header: tr("Del x20"), sortable: true, align: "right", sortValue: (row) => row.deliveryRel20 ?? -Infinity, cell: (row) => formatNumber(row.deliveryRel20 ?? 0, { maximumFractionDigits: 2 }) },
        { key: "distanceFrom52wHighPct", header: tr("Dist 52w high"), sortable: true, align: "right", sortValue: (row) => row.distanceFrom52wHighPct ?? Infinity, cell: (row) => pct(row.distanceFrom52wHighPct != null ? row.distanceFrom52wHighPct / 100 : null, 1) }
      ]} />

      <PageIntroAccordion label={tr("How to use this page")} title={tr("Read setup quality in layers: signal, sample size, regime, volume, delivery, then price position.")} body={tr("This page is for post-close learning and swing analysis. It is intentionally strict: an active setup is not enough unless expectancy and confirmation agree.")} items={[tr("Never trust a setup without sample size and regime context."), tr("Volume, delivery, and proximity to highs are confirmation, not permission."), tr("A deceptive setup is often the one with the loudest candle and the weakest forward-return profile.")]} widgetId="analytics_daily_setups_help" />

      <div className={styles.takeaway}><strong>{tr("Daily-setup takeaway:")}</strong> {tr("today’s swing candidates should come from the small constructive group where sample size is credible, 5-day expectancy is positive, and volume, delivery, and regime context all confirm the setup instead of merely advertising it.")}</div>
    </div>
  );
}
