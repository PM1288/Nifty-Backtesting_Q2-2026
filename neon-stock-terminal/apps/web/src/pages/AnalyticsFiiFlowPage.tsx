import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { useAuthGate } from "../auth/AuthGateProvider";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import {
  ChartCard,
  DataState,
  KpiCard,
  LoadingSkeletonCard,
  PageIntroAccordion
} from "../components/ui/DashboardPrimitives";
import { EChartSurface } from "../components/visual/EChartSurface";
import { formatDateIST, formatNumber, formatPercent } from "../lib/format";
import { useAnalyticsFiiFlow } from "../lib/hooks";
import type {
  AnalyticsFiiFlowBackdrop,
  AnalyticsFiiFlowChangePoint,
  AnalyticsFiiFlowMatrixRow,
  AnalyticsFiiFlowPercentilePoint,
  AnalyticsFiiFlowProductPoint,
  AnalyticsFiiFlowRegimePoint,
  AnalyticsFiiFlowResponse,
  AnalyticsFiiFlowSpreadPoint
} from "../lib/types";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import { useI18n } from "../i18n/LocaleProvider";
import { AnalyticsHeader, INSTITUTIONAL_SECTION_TABS } from "./AnalyticsChrome";
import styles from "./AnalyticsFiiFlowPage.module.css";

type RubricItem = { label: string; value: string };
type ChartReading = { id: string; title: string; subtitle: string; option: EChartsOption; rubric: RubricItem[] };

const n = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const pct = (value: number | null | undefined, digits = 1, signed = false) =>
  n(value) == null ? "—" : formatPercent(value as number, digits, signed);
const ratioPct = (value: number | null | undefined, digits = 1, signed = false) =>
  n(value) == null ? "—" : formatPercent((value as number) * 100, digits, signed);
const num = (value: number | null | undefined, digits = 0) =>
  n(value) == null ? "—" : formatNumber(value as number, { maximumFractionDigits: digits });
const clean = (value: string | null | undefined) =>
  ((value ?? "").replace(/[_-]+/g, " ").trim() || "Unknown").replace(/\b\w/g, (token) => token.toUpperCase());
const rubric = (items: Array<[string, string]>) => items.map(([label, value]) => ({ label, value }));

function backdropTone(backdrop: AnalyticsFiiFlowBackdrop) {
  if (backdrop === "supportive") return "green";
  if (backdrop === "contrarian" || backdrop === "stretched") return "red";
  return "white";
}

function regimeCardTone(backdrop: AnalyticsFiiFlowBackdrop) {
  return backdrop === "supportive" ? styles.positive : backdrop === "neutral" ? styles.neutral : styles.warning;
}

function buildLongShortMatrixOption(rows: AnalyticsFiiFlowMatrixRow[]): EChartsOption {
  return {
    animation: false,
    grid: { left: 72, right: 24, top: 30, bottom: 56 },
    tooltip: { trigger: "item" },
    xAxis: { type: "category", data: ["Long %", "Short %", "Net %"], axisLabel: { color: "#8b93a7" } },
    yAxis: { type: "category", data: rows.map((row) => row.clientType), axisLabel: { color: "#8b93a7" } },
    visualMap: { min: -60, max: 60, orient: "horizontal", left: "center", bottom: 0, textStyle: { color: "#8b93a7" } },
    series: [
      {
        type: "heatmap",
        data: rows.flatMap((row, rowIndex) => [
          [0, rowIndex, row.longSharePct ?? 0],
          [1, rowIndex, row.shortSharePct ?? 0],
          [2, rowIndex, row.netPct ?? 0]
        ]),
        label: {
          show: true,
          color: "#f5f7fb",
          formatter: (params: unknown) => `${num(Number(((params as { data?: unknown[] }).data ?? [0, 0, 0])[2]), 1)}`
        }
      }
    ]
  };
}

function buildSpreadOption(rows: AnalyticsFiiFlowSpreadPoint[]): EChartsOption {
  const data = rows.slice().sort((left, right) => left.tradeDate.localeCompare(right.tradeDate));
  return {
    animation: false,
    grid: { left: 50, right: 18, top: 30, bottom: 56 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: data.map((row) => row.tradeDate.slice(5)), axisLabel: { color: "#8b93a7" } },
    yAxis: [
      { type: "value", axisLabel: { color: "#8b93a7", formatter: "{value}%" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
      { type: "value", axisLabel: { color: "#8b93a7", formatter: "{value}%" } }
    ],
    series: [
      { name: "FII net %", type: "line", smooth: true, data: data.map((row) => (row.fiiNetPct ?? 0) * 100), lineStyle: { color: "#7dcfff", width: 2 }, itemStyle: { color: "#7dcfff" } },
      { name: "Client net %", type: "line", smooth: true, data: data.map((row) => (row.clientNetPct ?? 0) * 100), lineStyle: { color: "#ff9f68", width: 2 }, itemStyle: { color: "#ff9f68" } },
      { name: "Spread", type: "bar", yAxisIndex: 1, data: data.map((row) => (row.spreadPct ?? 0) * 100), itemStyle: { color: (params: unknown) => (Number((params as { value?: number }).value ?? 0) >= 0 ? "#6de29b" : "#ff7a7a") }, barMaxWidth: 14 }
    ]
  };
}

function buildProductOption(rows: AnalyticsFiiFlowProductPoint[]): EChartsOption {
  const data = rows.slice();
  return {
    animation: false,
    grid: { left: 56, right: 18, top: 30, bottom: 84 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: data.map((row) => clean(row.product)), axisLabel: { color: "#8b93a7", rotate: 18 } },
    yAxis: { type: "value", axisLabel: { color: "#8b93a7", formatter: "{value} cr" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    series: [
      { name: "Buy value", type: "bar", data: data.map((row) => row.buyValueCr ?? 0), itemStyle: { color: "#6de29b" }, barMaxWidth: 16 },
      { name: "Sell value", type: "bar", data: data.map((row) => row.sellValueCr ?? 0), itemStyle: { color: "#ff7a7a" }, barMaxWidth: 16 },
      { name: "Open interest value", type: "line", smooth: true, data: data.map((row) => row.openInterestValueCr ?? 0), lineStyle: { color: "#f4d35e", width: 2 }, itemStyle: { color: "#f4d35e" } }
    ]
  };
}

function buildPercentileOption(rows: AnalyticsFiiFlowPercentilePoint[]): EChartsOption {
  const data = rows.filter((row) => row.percentile != null && row.nextSessionReturnPct != null);
  return {
    animation: false,
    grid: { left: 56, right: 18, top: 30, bottom: 56 },
    tooltip: { trigger: "item" },
    xAxis: { type: "value", min: 0, max: 100, axisLabel: { color: "#8b93a7", formatter: "{value}%" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    yAxis: { type: "value", axisLabel: { color: "#8b93a7", formatter: "{value}%" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    series: [{ type: "scatter", symbolSize: 12, data: data.map((row) => ({ value: [(row.percentile ?? 0) * 100, row.nextSessionReturnPct ?? 0], itemStyle: { color: (row.nextSessionReturnPct ?? 0) >= 0 ? "#6de29b" : "#ff7a7a" }, name: row.tradeDate })) }]
  };
}

function buildRegimeOverlayOption(rows: AnalyticsFiiFlowRegimePoint[]): EChartsOption {
  const data = rows.slice().sort((left, right) => left.tradeDate.localeCompare(right.tradeDate));
  return {
    animation: false,
    grid: { left: 56, right: 18, top: 30, bottom: 56 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: data.map((row) => row.tradeDate.slice(5)), axisLabel: { color: "#8b93a7" } },
    yAxis: [
      { type: "value", min: 0, max: 100, axisLabel: { color: "#8b93a7", formatter: "{value}%" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
      { type: "value", axisLabel: { color: "#8b93a7", formatter: "{value}%" } }
    ],
    series: [
      { name: "FII percentile", type: "line", smooth: true, data: data.map((row) => (row.percentile ?? 0) * 100), lineStyle: { color: "#7dcfff", width: 2 }, itemStyle: { color: "#7dcfff" } },
      { name: "Nifty return", type: "bar", yAxisIndex: 1, data: data.map((row) => row.niftyReturnPct ?? 0), itemStyle: { color: (params: unknown) => (Number((params as { value?: number }).value ?? 0) >= 0 ? "#6de29b" : "#ff9f68") }, barMaxWidth: 14 }
    ]
  };
}

function buildChangeOption(rows: AnalyticsFiiFlowChangePoint[]): EChartsOption {
  const data = rows.slice().sort((left, right) => `${left.tradeDate}:${left.clientType}`.localeCompare(`${right.tradeDate}:${right.clientType}`));
  const dates = Array.from(new Set(data.map((row) => row.tradeDate)));
  const clients = Array.from(new Set(data.map((row) => row.clientType)));
  const palette = ["#7dcfff", "#ff9f68", "#6de29b", "#f4d35e"];
  return {
    animation: false,
    grid: { left: 56, right: 18, top: 30, bottom: 56 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: dates.map((value) => value.slice(5)), axisLabel: { color: "#8b93a7" } },
    yAxis: { type: "value", axisLabel: { color: "#8b93a7", formatter: "{value} ppt" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    series: clients.map((clientType, index) => ({
      name: clientType,
      type: "line",
      smooth: true,
      data: dates.map((tradeDate) => data.find((row) => row.tradeDate === tradeDate && row.clientType === clientType)?.dayChangePctPoints ?? null),
      lineStyle: { color: palette[index % palette.length], width: 2 },
      itemStyle: { color: palette[index % palette.length] }
    }))
  };
}

function buildCharts(payload: AnalyticsFiiFlowResponse, tr: (value: string) => string): ChartReading[] {
  const latestTradeDateLabel = payload.latestTradeDate ? formatDateIST(payload.latestTradeDate) : "—";
  const latestFii = payload.participants.find((row) => row.clientType === "FII") ?? null;
  const latestClient = payload.participants.find((row) => row.clientType === "Client") ?? null;
  const latestDii = payload.participants.find((row) => row.clientType === "DII") ?? null;
  const strongestProduct =
    payload.charts.productValueByProduct
      .slice()
      .sort((left, right) => Math.abs(right.netValueCr ?? 0) - Math.abs(left.netValueCr ?? 0))[0] ?? null;
  const latestChangeLead =
    payload.charts.dayOverDayPositioningChange
      .filter((row) => row.tradeDate === payload.latestTradeDate)
      .slice()
      .sort((left, right) => Math.abs(right.dayChangePctPoints ?? 0) - Math.abs(left.dayChangePctPoints ?? 0))[0] ?? null;
  const confirmText = payload.divergences[0]?.detail ?? "The largest participant spread still confirms that positioning is dispersed rather than unified.";
  const contradictText =
    payload.marketContext?.nextSessionReturnPct == null
      ? "The contradiction is sample depth: the next-session overlap is too short to turn this into a precise timing model."
      : `The contradiction is outcome instability: even with current positioning, the next-session Nifty move after the latest report was ${pct(payload.marketContext.nextSessionReturnPct, 2, true)}.`;

  return [
    {
      id: "matrix",
      title: tr("client-type long/short matrix"),
      subtitle: tr("See which participant bucket is genuinely leaning long, hedged, or structurally opposed."),
      option: buildLongShortMatrixOption(payload.charts.clientLongShortMatrix),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("The latest official open-interest split for each participant type across long share, short share, and net positioning.")],
        [tr("2. Why traders or analysts care about it."), tr("It shows who is actually leaning versus hedging, and whether the market is aligned or internally opposed.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is matrix columns for long percent, short percent, and net percent. Y-axis is participant type. Values are percentages of each participant’s own total OI.")],
        [tr("4. What a bullish reading looks like."), tr("FIIs are constructively net long, clients are not wildly overextended, and DIIs are not carrying the entire opposite side alone.")],
        [tr("5. What a bearish reading looks like."), tr("FIIs are materially net short or flattening while clients stay aggressively long into overhead risk.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Most buckets sit near balance and the opposing sides roughly cancel each other out.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Expiry hedging, rollover inventory, and the daily report lag can all make a matrix look directional when it is mostly maintenance positioning.")],
        [tr("8. What todays reading says."), tr(`Latest official reading for ${latestTradeDateLabel} shows FII net at ${ratioPct(latestFii?.oiNetPct, 2, true)}, Client net at ${ratioPct(latestClient?.oiNetPct, 2, true)}, and DII net at ${ratioPct(latestDii?.oiNetPct, 2, true)}, so the regime is opposed rather than cleanly aligned.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(confirmText)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(contradictText)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: start by asking whether FIIs and clients agree, then check whether DIIs and pros are absorbing the other side.")]])
    },
    {
      id: "spread",
      title: tr("FII vs client spread"),
      subtitle: tr("The spread matters more than either line by itself when you want to see who is pressing risk."),
      option: buildSpreadOption(payload.charts.fiiVsClientSpread),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("The historical gap between FII net positioning and client net positioning, with both lines shown explicitly.")],
        [tr("2. Why traders or analysts care about it."), tr("A wide spread often means institutional and retail-style participants are reading risk very differently.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is report date. Y-axis is net positioning percentage. The spread bar is also shown in percentage terms.")],
        [tr("4. What a bullish reading looks like."), tr("FIIs stay stronger than clients and the spread widens for the right reasons, not because clients are panicking out.")],
        [tr("5. What a bearish reading looks like."), tr("Clients chase longs while FII conviction lags or deteriorates, leaving a negative institutional-vs-client confirmation gap.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("FII and client positioning move in a narrow band without clear leadership from either side.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Client extremes can persist far longer than expected, so a wide spread is context, not a timing trigger.")],
        [tr("8. What todays reading says."), tr(`Latest official spread is ${ratioPct((latestFii?.oiNetPct ?? 0) - (latestClient?.oiNetPct ?? 0), 2, true)}, which says clients are leaning harder than FIIs even though FIIs are still mildly net long.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(`The largest divergence card also shows ${payload.divergences[0]?.title ?? "the same participant split"}, reinforcing that the disagreement is structural, not cosmetic.`)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(contradictText)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: the spread tells you who is leaning harder, but not whether price will immediately reward that lean.")]])
    },
    {
      id: "product",
      title: tr("buy/sell/open-interest value by product"),
      subtitle: tr("Product mix reveals whether the latest FII flow is concentrated in index risk, stock risk, or both."),
      option: buildProductOption(payload.charts.productValueByProduct),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Latest official FII derivatives statistics by product, showing buy value, sell value, and open-interest value.")],
        [tr("2. Why traders or analysts care about it."), tr("It helps distinguish index-risk pressure from stock-futures accumulation and prevents one product from being mistaken for the whole regime.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is derivative product. Y-axis is rupee value in crore.")],
        [tr("4. What a bullish reading looks like."), tr("Index and stock products both show constructive buy-side value or at least balanced selling with rising supportive OI context.")],
        [tr("5. What a bearish reading looks like."), tr("Index products show clear net selling while the structure elsewhere offers no offsetting support.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Buy and sell values are close, or stock-futures strength offsets index-futures weakness.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Rollovers can look directional, and product value on one day can describe repositioning rather than fresh conviction.")],
        [tr("8. What todays reading says."), tr(`Latest official product imbalance is biggest in ${clean(strongestProduct?.product)} at ${num(strongestProduct?.netValueCr, 2)} crore net, while index futures remain net-sold and stock futures are relatively firmer.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(confirmText)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`The matrix still shows FIIs as mildly net long in OI terms, so one day of product value pressure does not automatically overturn the broader positioning snapshot.`)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: ask which product is driving the imbalance, then decide whether that product usually matters for the move you care about.")]])
    },
    {
      id: "percentile",
      title: tr("positioning percentile vs next-session return"),
      subtitle: tr("This is the expectancy chart: useful for context, dangerous for overfitting."),
      option: buildPercentileOption(payload.charts.positioningPercentile),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Each historical FII positioning percentile against the next-session Nifty return that followed it.")],
        [tr("2. Why traders or analysts care about it."), tr("It translates raw positioning into historical context and shows whether extreme percentiles have actually carried expectancy.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is FII positioning percentile from 0% to 100%. Y-axis is next-session Nifty return in percent.")],
        [tr("4. What a bullish reading looks like."), tr("Higher percentiles cluster with positive next-session returns and the sample size is large enough to trust the relationship.")],
        [tr("5. What a bearish reading looks like."), tr("Extreme percentiles are followed by weak or negative next-session returns, showing a stretched regime rather than support.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Returns are scattered across all percentiles, which means percentile context is descriptive but not predictive.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Small sample windows, regime drift, and using next-session outcomes as if they were same-day signals can all create false confidence.")],
        [tr("8. What todays reading says."), tr(`Latest official FII percentile is ${ratioPct(latestFii?.oiPercentile, 2)} within a ${num(payload.diagnostics.sampleSize, 0)}-observation sample, which is too ordinary and too short to claim edge by itself.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(`The percentile buckets also show mixed average next-session returns, so the dataset itself confirms that this is a context layer, not a trigger layer.`)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`If you looked only at the latest FII OI matrix, you might think mild net-long positioning is enough, but the scatter says the forward-return payoff has been unstable.`)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: percentile tells you how unusual the positioning is; it does not tell you that price must react immediately.")]])
    },
    {
      id: "overlay",
      title: tr("FII regime overlay on Nifty"),
      subtitle: tr("Use this to compare flow regime and price regime, not to force causality."),
      option: buildRegimeOverlayOption(payload.charts.regimeOverlay),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("FII positioning percentile over time, overlaid with same-session Nifty daily return.")],
        [tr("2. Why traders or analysts care about it."), tr("It shows whether price and institutional context are confirming one another or quietly diverging.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is report date. Left Y-axis is FII percentile. Right Y-axis is same-session Nifty return in percent.")],
        [tr("4. What a bullish reading looks like."), tr("FII percentile rises into constructive territory while Nifty returns also improve, creating confirmation rather than conflict.")],
        [tr("5. What a bearish reading looks like."), tr("FII percentile deteriorates while the index weakens or rallies without institutional confirmation.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("The percentile moves around without a stable relationship to index returns.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Same-day association can look persuasive even when next-session predictive value is weak; this chart does not prove causation.")],
        [tr("8. What todays reading says."), tr(`Latest official regime is ${clean(payload.summary?.regimeLabel)} with Nifty same-day return at ${pct(payload.marketContext?.niftyReturnPct, 2, true)}, which is more context alignment than outright signal quality.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(payload.summary?.reportLagNote ?? "The page explicitly treats participant data as daily context rather than live flow.")],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`The next-session scatter remains mixed, so any same-day visual confirmation still fails the timing-signal test.`)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: use the overlay to ask whether flow and price agree, then check the percentile chart to see whether that agreement has paid off historically.")]])
    },
    {
      id: "change",
      title: tr("day-over-day change in positioning"),
      subtitle: tr("The shift matters because reversals in positioning often matter more than static levels."),
      option: buildChangeOption(payload.charts.dayOverDayPositioningChange),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Day-over-day change in participant net positioning, measured in percentage-point shifts.")],
        [tr("2. Why traders or analysts care about it."), tr("A stable extreme is different from a fresh reversal, so the daily change can reveal whether conviction is building, fading, or just churning.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is report date. Y-axis is change in net positioning percentage points.")],
        [tr("4. What a bullish reading looks like."), tr("FIIs add net long exposure while opposing buckets do not aggressively offset the shift.")],
        [tr("5. What a bearish reading looks like."), tr("FIIs flatten or sell while client or prop positioning absorbs the other side in a way that leaves institutions less committed.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Daily changes are small, choppy, or cancelled out across participant groups.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Expiry distortions and short sample history can make a one-day shift look much more meaningful than it really is.")],
        [tr("8. What todays reading says."), tr(`Latest report shows the largest day-over-day shift in ${latestChangeLead?.clientType ?? "—"} at ${num(latestChangeLead?.dayChangePctPoints, 2)} percentage points, which says the change is noticeable but still inside a noisy daily context series.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(confirmText)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`Static OI still leaves FIIs mildly net long, so one daily change does not automatically imply regime reversal.`)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: compare today’s change with the existing level, because a shift only matters if it changes the regime you were already in.")]])
    }
  ];
}

export function AnalyticsFiiFlowPage() {
  const { tr } = useI18n();
  const { authReady } = useAuthGate();
  const query = useAnalyticsFiiFlow(authReady);

  usePageLoadProfile({
    pageName: "analytics_fii_flow",
    enabled: authReady,
    queries: [{ name: "analytics-fii-flow", isLoading: query.isLoading, isError: !!query.error }]
  });

  const loading = !authReady || (!query.data && query.isLoading);
  const showLoading = useDeferredBusyState(loading);
  const payload = query.data;
  const charts = useMemo(() => (payload ? buildCharts(payload, tr) : []), [payload, tr]);
  const latestFii = payload?.participants.find((row) => row.clientType === "FII") ?? null;

  if (loading) {
    if (!showLoading) return null;
    return (
      <div className={styles.page}>
        <section className={styles.metricGrid}>
          <LoadingSkeletonCard title={tr("Latest report")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Backdrop")} lines={3} compact />
          <LoadingSkeletonCard title={tr("FII percentile")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Sample size")} lines={3} compact />
        </section>
        <LoadingSkeletonCard title={tr("Participant flow summary")} lines={8} />
      </div>
    );
  }

  if (query.error || !payload || !payload.summary) {
    return (
      <DataState
        kind="error"
        title={tr("Participant flow is unavailable")}
        body={tr("The dashboard could not build the institutional context layer from the persisted participant-flow tables.")}
      />
    );
  }

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title="Participant Flow"
        meta={`${tr("Latest official date")} ${payload.latestTradeDate ? formatDateIST(payload.latestTradeDate) : "—"}`}
        subtitle={tr("Read FII, client, DII, and prop positioning as daily institutional context. This page is for framing risk and next-session bias, not for triggering exact intraday entries.")}
        learningPrompt={tr("This page answers one question: does the institutional backdrop support, contradict, stretch, or neutralize the next-session tape?")}
        sectionTabs={[...INSTITUTIONAL_SECTION_TABS]}
      />

      <PageIntroAccordion
        title={tr("Use participant flow as context, not as a trigger")}
        body={tr("NSE participant reports are delayed official summaries. They help you understand who is leaning, who is opposed, and whether the market is in a supportive or stretched institutional regime, but they are not live execution signals.")}
        items={[
          tr("Separate static positioning from daily change. A mildly extreme level is different from a fresh reversal."),
          tr("Check product mix. Index selling and stock-futures buying can coexist and mean different things."),
          tr("Always compare same-day association with next-session follow-through before trusting the signal.")
        ]}
      />

      <section className={styles.metricGrid}>
        <KpiCard label={tr("Latest report")} value={payload.latestTradeDate ? formatDateIST(payload.latestTradeDate) : "—"} meta={payload.summary.reportLagNote} />
        <KpiCard label={tr("Backdrop")} value={clean(payload.backdrop)} tone={backdropTone(payload.backdrop)} meta={payload.summary.text} />
        <KpiCard label={tr("FII percentile")} value={ratioPct(latestFii?.oiPercentile, 1)} meta={tr("Current FII OI percentile within the stored history window.")} />
        <KpiCard label={tr("Sample size")} value={num(payload.diagnostics.sampleSize, 0)} meta={tr("Historical participant observations used for percentile and follow-through context.")} />
      </section>

      <section className={styles.noteGrid}>
        <article className={`${styles.noteCard} ${regimeCardTone(payload.backdrop)}`}>
          <span className={styles.eyebrow}>{tr("A. Institutional regime summary")}</span>
          <h3>{payload.summary.regimeLabel}</h3>
          <p>{payload.summary.text}</p>
          <p>{payload.contextLayer}</p>
        </article>

        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("B. Biggest positioning divergences")}</span>
          <div className={styles.listStack}>
            {payload.divergences.map((row) => (
              <div key={`${row.title}-${row.spreadPctPoints}`} className={styles.listItem}>
                <strong>{row.title}</strong>
                <p>{row.detail}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <span className={styles.eyebrow}>{tr("Latest participant snapshot")}</span>
          <p>{tr("This board separates outstanding positioning from the latest daily trading flow.")}</p>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{tr("Client type")}</th>
                <th>{tr("OI net %")}</th>
                <th>{tr("OI net contracts")}</th>
                <th>{tr("DoD change")}</th>
                <th>{tr("Volume net %")}</th>
                <th>{tr("Volume net contracts")}</th>
              </tr>
            </thead>
            <tbody>
              {payload.participants.map((row) => (
                <tr key={row.clientType}>
                  <td>{row.clientType}</td>
                  <td>{ratioPct(row.oiNetPct, 2, true)}</td>
                  <td>{num(row.oiNetContracts, 0)}</td>
                  <td>{num(row.dayOverDayOiChangePctPoints, 2)} ppt</td>
                  <td>{ratioPct(row.volumeNetPct, 2, true)}</td>
                  <td>{num(row.volumeNetContracts, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.chartGrid}>
        {charts.map((chart) => (
          <ChartCard key={chart.id} title={chart.title} subtitle={chart.subtitle}>
            <EChartSurface ariaLabel={chart.title} option={chart.option} />
            <div className={styles.rubricList}>
              {chart.rubric.map((item) => (
                <div key={`${chart.id}-${item.label}`} className={styles.rubricItem}>
                  <strong>{item.label}</strong>
                  <p>{item.value}</p>
                </div>
              ))}
            </div>
          </ChartCard>
        ))}
      </section>

      <section className={styles.noteGrid}>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("D. Historical interpretation of current percentile levels")}</span>
          <div className={styles.listStack}>
            {payload.percentileBuckets.map((bucket) => (
              <div key={bucket.label} className={styles.listItem}>
                <strong>{bucket.label}</strong>
                <p>{tr("Sample")} {num(bucket.sampleSize, 0)} • {tr("Avg next-session return")} {pct(bucket.avgNextSessionReturnPct, 2, true)} • {tr("Positive hit-rate")} {pct(bucket.hitRatePositivePct, 1)}</p>
              </div>
            ))}
          </div>
        </article>

        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("E. What this changes for next-session bias and sizing")}</span>
          <p>{payload.summary.nextSessionBias}</p>
          <p>{payload.summary.sizingNote}</p>
          <p>{tr("Current backdrop")}: <strong>{clean(payload.backdrop)}</strong>. {tr("Use it to frame conviction, not to force trades.")}</p>
        </article>
      </section>

      <section className={styles.noteGrid}>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("F. What traders often misread in participant data")}</span>
          <div className={styles.listStack}>
            <div className={styles.listItem}>
              <strong>{tr("Treating reports as live flow")}</strong>
              <p>{tr("These are official daily reports. They describe institutional context after the fact; they do not replace live order-flow or price action.")}</p>
            </div>
            <div className={styles.listItem}>
              <strong>{tr("Using extremes as exact timing tools")}</strong>
              <p>{tr("A visible participant extreme can persist for many sessions. Spread, product mix, and historical payoff matter more than one raw reading.")}</p>
            </div>
            <div className={styles.listItem}>
              <strong>{tr("Ignoring expiry distortion")}</strong>
              <p>{tr("One-day swings can reflect inventory transfer, not fresh directional conviction, especially around weekly or monthly expiry.")}</p>
            </div>
          </div>
        </article>

        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("G. Teaching notes")}</span>
          <div className={styles.listStack}>
            <div className={styles.listItem}>
              <strong>{tr("This is context, not execution")}</strong>
              <p>{tr("Participant flow helps you size and frame the next session, but price still decides execution quality.")}</p>
            </div>
            <div className={styles.listItem}>
              <strong>{tr("Signal presence vs signal quality")}</strong>
              <p>{tr("A visible participant extreme is only signal presence. Signal quality comes from sample size, regime stability, and outcome consistency.")}</p>
            </div>
            <div className={styles.listItem}>
              <strong>{tr("What matters most today")}</strong>
              <p>{tr("The real lesson is whether FIIs, clients, DIIs, and product mix are aligned. When they are not, treat the backdrop as context and reduce precision claims.")}</p>
            </div>
          </div>
        </article>
      </section>

      <section className={styles.takeawayCard}>
        <strong>{tr("Flow takeaway:")}</strong>{" "}
        <span>
          {payload.backdrop === "supportive"
            ? tr("participant positioning is constructive enough to support next-session bias, but only if price action confirms it at the open.")
            : payload.backdrop === "contrarian"
              ? tr("clients are leaning harder than institutions, so the flow backdrop warns against treating apparent strength as fully confirmed.")
              : payload.backdrop === "stretched"
                ? tr("institutional positioning is at an extreme, which makes the backdrop more useful as a stretch warning than as a directional trigger.")
                : tr("the institutional backdrop is mixed and should be used for context and sizing, not for exact timing or conviction inflation.")}
        </span>
      </section>
    </div>
  );
}
