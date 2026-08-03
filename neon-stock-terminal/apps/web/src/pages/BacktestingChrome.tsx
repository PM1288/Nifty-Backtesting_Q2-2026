import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { EChartsOption } from "echarts";
import { EChartSurface } from "../components/visual/EChartSurface";
import { useI18n } from "../i18n/LocaleProvider";
import { trackAnalyticsEvent } from "../lib/analytics";
import {
  formatCompactIN,
  formatCurrencyINR,
  formatDateIST,
  formatDateTime,
  formatNumberIN,
  formatPercent
} from "../lib/format";
import type {
  BacktestingFilterModel,
  BacktestingDrawdownPoint,
  BacktestingHistogramBucket,
  BacktestingLinePoint,
  BacktestingPriceIndicatorChart,
  BacktestingScenario,
  BacktestingStrategyDetailResponse
} from "../lib/types";
import { AnalyticsHeader } from "./AnalyticsChrome";
import styles from "./AnalyticsPage.module.css";

export const BACKTESTING_SECTION_TABS = [
  { label: "Overview", to: "/backtesting", badge: "Home", end: true },
  { label: "Leaderboard", to: "/backtesting/strategies", badge: "Rank", end: true },
  { label: "Results", to: "/backtesting/results", badge: "Port" },
  { label: "Regimes", to: "/backtesting/regimes", badge: "Reg" },
  { label: "Stocks", to: "/backtesting/stocks", badge: "Stock" },
  { label: "Daily", to: "/backtesting/daily-summary", badge: "Day" },
  { label: "Compare", to: "/backtesting/compare", badge: "Cmp" },
  { label: "Runs", to: "/backtesting/runs", badge: "Audit" }
] as const;

export function fmtCurrency(value: number | null | undefined) {
  return formatCurrencyINR(value, false);
}

export function fmtCompactCurrency(value: number | null | undefined) {
  return formatCurrencyINR(value, true);
}

export function fmtPct(value: number | null | undefined) {
  return formatPercent(value, 2, true);
}

export function humanizeCapitalMode(value: string) {
  return {
    no_capital_limit: "No Capital Limit",
    capital_10l: "10L",
    capital_20l: "20L",
    capital_50l: "50L"
  }[value] ?? value;
}

export function humanizeUniverse(value: string) {
  return value === "single_stock" ? "Single Stock" : value === "nifty_100" ? "Nifty 100" : value;
}

export function humanizeArchetype(value: string) {
  return {
    mean_reversion_fast: "Fast mean reversion",
    mean_reversion_confirmed: "Confirmed mean reversion",
    trend_continuation: "Trend continuation"
  }[value] ?? value.replaceAll("_", " ");
}

export function BacktestingHeader({
  title,
  subtitle,
  meta,
  testRunAt
}: {
  title: string;
  subtitle: string;
  meta?: string;
  testRunAt?: string;
}) {
  const { tr } = useI18n();
  const testRunMeta = testRunAt
    ? `${tr("Test run")} ${formatDateIST(testRunAt, { includeTime: true })}`
    : null;
  const combinedMeta = [testRunMeta, meta].filter(Boolean).join(" • ");
  return (
    <AnalyticsHeader
      title={tr(title)}
      subtitle={tr(subtitle)}
      meta={combinedMeta || undefined}
      sectionTabs={[...BACKTESTING_SECTION_TABS]}
      learningPrompt={tr("Backtesting here means reviewing historical daily-data evidence with fixed rules and assumptions.")}
    />
  );
}

const STRATEGY_COLORS = ["#e3b341", "#3fb950", "#58a6ff", "#ff7b72", "#a371f7"];
const GRID = {
  top: 24,
  right: 18,
  bottom: 84,
  left: 66,
  containLabel: true
} as const;
const LEGEND_BOTTOM = {
  bottom: 6,
  left: "center",
  data: [] as string[]
};

function dateTick(value: string) {
  if (!value) return "";
  return formatDateTime(value, { includeTime: false }).replace(/ \d{4}$/, "");
}

function tooltipDate(value: string) {
  return formatDateIST(value, { includeTime: false });
}

function currencyAxis(value: number) {
  return formatCompactIN(value, "currency");
}

function numberAxis(value: number) {
  return formatCompactIN(value, "number");
}

function histogramAxis(value: number) {
  return formatNumberIN(value, { maximumFractionDigits: 0 });
}

export function useBacktestingScenario(detail?: BacktestingStrategyDetailResponse | null) {
  const [searchParams, setSearchParams] = useSearchParams();
  const scenarioKey = searchParams.get("scenario") ?? detail?.defaultScenarioKey ?? "";
  const scenario = detail?.scenarios?.[scenarioKey] ?? (detail ? detail.scenarios[detail.defaultScenarioKey] : null);

  const setScenarioKey = (nextKey: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("scenario", nextKey);
    setSearchParams(params, { replace: true });
    void trackAnalyticsEvent("backtesting_filter_change", {
      filter_name: "scenario",
      filter_value: nextKey
    });
  };

  return { scenarioKey, scenario, setScenarioKey };
}

export function BacktestingFilterBar({
  filters,
  detail
}: {
  filters: BacktestingFilterModel;
  detail: BacktestingStrategyDetailResponse;
}) {
  const { tr } = useI18n();
  const navigate = useNavigate();
  const { scenarioKey, scenario, setScenarioKey } = useBacktestingScenario(detail);

  const selectedUniverse = scenario?.universeMode ?? "nifty_100";
  const selectedCapital = scenario?.capitalMode ?? "capital_16l";
  const selectedStock = scenario?.stock ?? "";

  const scenarioMap = useMemo(() => new Map(detail.scenarioOptions.map((item) => [item.key, item])), [detail.scenarioOptions]);

  const updateScenarioFromParts = (parts: { universeMode?: string; capitalMode?: string; stock?: string }) => {
    const nextUniverse = parts.universeMode ?? selectedUniverse;
    const nextCapital = parts.capitalMode ?? selectedCapital;
    const nextStock = parts.stock ?? selectedStock;
    const next = detail.scenarioOptions.find((option) => (
      option.universeMode === nextUniverse &&
      option.capitalMode === nextCapital &&
      (nextUniverse === "single_stock" ? option.stock === nextStock : true)
    ));
    if (next) {
      setScenarioKey(next.key);
      return;
    }
    const fallback = nextUniverse === "single_stock"
      ? detail.scenarioOptions.find((option) => option.universeMode === "single_stock")
      : detail.scenarioOptions.find((option) => option.universeMode === nextUniverse);
    if (fallback) setScenarioKey(fallback.key);
  };

  return (
    <section className={styles.panel} data-clarity-region="filter_bar">
      <div className={styles.toggleRow}>
        <div className={styles.strong}>{tr("Scenario filters")}</div>
        <div className={styles.muted}>
          {tr("Strategy")} {tr(detail.strategy.displayName)} • v{detail.version.versionNumber}
        </div>
      </div>
      <div className={styles.controlGrid}>
        <label className={styles.field}>
          {tr("Strategy")}
          <select
            className={styles.input}
            value={detail.strategy.strategyId}
            onChange={(event) => {
              void trackAnalyticsEvent("strategy_select", { strategy_id: event.currentTarget.value });
              navigate(`/backtesting/strategies/${event.currentTarget.value}`);
            }}
          >
            {filters.strategies.map((option) => (
              <option key={option.value} value={option.value}>
                {tr(option.label)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          {tr("Universe")}
          <select
            className={styles.input}
            value={selectedUniverse}
            onChange={(event) => {
              void trackAnalyticsEvent("universe_mode_change", { universe_mode: event.currentTarget.value });
              updateScenarioFromParts({ universeMode: event.currentTarget.value });
            }}
          >
            {filters.universeModes.map((option) => (
              <option key={option.value} value={option.value}>
                {tr(option.label)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          {tr("Capital")}
          <select
            className={styles.input}
            value={selectedCapital}
            onChange={(event) => {
              void trackAnalyticsEvent("capital_mode_change", { capital_mode: event.currentTarget.value });
              updateScenarioFromParts({ capitalMode: event.currentTarget.value });
            }}
          >
            {filters.capitalModes.map((option) => (
              <option key={option.value} value={option.value}>
                {tr(option.label)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          {tr("Date range")}
          <select
            className={styles.input}
            defaultValue="3y"
            onChange={(event) => {
              void trackAnalyticsEvent("date_range_change", { date_range: event.currentTarget.value });
              void trackAnalyticsEvent("backtesting_filter_change", { filter_name: "date_range", filter_value: event.currentTarget.value });
            }}
          >
            {filters.dateRanges.map((option) => (
              <option key={option.value} value={option.value}>
                {tr(option.label)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          {tr("Stock")}
          <select
            className={styles.input}
            value={selectedStock}
            disabled={selectedUniverse !== "single_stock"}
            onChange={(event) => {
              void trackAnalyticsEvent("stock_detail_open", { symbol: event.currentTarget.value });
              updateScenarioFromParts({ stock: event.currentTarget.value, universeMode: "single_stock" });
            }}
          >
            <option value="">{tr("Select stock")}</option>
            {filters.stocks.map((option) => (
              <option key={option.value} value={option.value}>
                {tr(option.label)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {scenarioKey && scenarioMap.get(scenarioKey) ? (
        <div className={styles.pillRow}>
          <span className={styles.pill}>{tr(humanizeUniverse(selectedUniverse))}</span>
          <span className={styles.pill}>{tr(humanizeCapitalMode(selectedCapital))}</span>
          {selectedStock ? <span className={styles.pill}>{selectedStock}</span> : null}
        </div>
      ) : null}
    </section>
  );
}

export function BacktestingCompareScopeBar({
  universeMode,
  capitalMode,
  onUniverseChange,
  onCapitalChange
}: {
  universeMode: string;
  capitalMode: string;
  onUniverseChange: (value: string) => void;
  onCapitalChange: (value: string) => void;
}) {
  const { tr } = useI18n();
  return (
    <section className={styles.panel} data-clarity-region="filter_bar">
      <div className={styles.toggleRow}>
        <div className={styles.strong}>{tr("Comparison scope")}</div>
        <div className={styles.muted}>{tr("Compare all active archetypes using the same published scenario lens.")}</div>
      </div>
      <div className={styles.controlGrid}>
        <label className={styles.field}>
          {tr("Universe")}
          <select
            className={styles.input}
            value={universeMode}
            onChange={(event) => {
              void trackAnalyticsEvent("universe_mode_change", { universe_mode: event.currentTarget.value });
              onUniverseChange(event.currentTarget.value);
            }}
          >
            <option value="nifty_100">{tr("Nifty 100")}</option>
          </select>
        </label>
        <label className={styles.field}>
          {tr("Capital")}
          <select
            className={styles.input}
            value={capitalMode}
            onChange={(event) => {
              void trackAnalyticsEvent("capital_mode_change", { capital_mode: event.currentTarget.value });
              onCapitalChange(event.currentTarget.value);
            }}
          >
            <option value="no_capital_limit">{tr("No Capital Limit")}</option>
            <option value="capital_16l">{tr("₹16L / ₹2L tickets / max 8")}</option>
            <option value="capital_10l">10L</option>
            <option value="capital_20l">20L</option>
            <option value="capital_50l">50L</option>
          </select>
        </label>
      </div>
      <div className={styles.pillRow}>
        <span className={styles.pill}>{tr(humanizeUniverse(universeMode))}</span>
        <span className={styles.pill}>{tr(humanizeCapitalMode(capitalMode))}</span>
      </div>
    </section>
  );
}

export function BacktestingLineChart({
  points,
  benchmark,
  indexed = false,
  yAxisName,
  strategyLabel = "Strategy",
  benchmarkLabel = indexed ? "Peer" : "NIFTY 50 price benchmark"
}: {
  points: BacktestingLinePoint[];
  benchmark?: boolean;
  indexed?: boolean;
  yAxisName?: string;
  strategyLabel?: string;
  benchmarkLabel?: string;
}) {
  const { tr } = useI18n();
  const resolvedStrategyLabel = tr(strategyLabel);
  const resolvedBenchmarkLabel = tr(benchmarkLabel);
  const resolvedYAxisName = tr(yAxisName ?? (indexed ? "Indexed Value (Base 100)" : "Portfolio Value (₹)"));
  const resolvedDate = tr("Date");
  const option = useMemo<EChartsOption>(() => ({
    grid: GRID,
    legend: benchmark ? { ...LEGEND_BOTTOM, data: [resolvedStrategyLabel, resolvedBenchmarkLabel] } : undefined,
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params as Array<{ axisValue: string; seriesName: string; value: [string, number] }> : [];
        const lines = items.map((item) => {
          const formatter = indexed ? numberAxis : currencyAxis;
          return `${item.seriesName}: ${formatter(item.value[1])}`;
        });
        return [tooltipDate(items[0]?.axisValue ?? ""), ...lines].join("<br/>");
      }
    },
    xAxis: {
      type: "category",
      name: resolvedDate,
      boundaryGap: false,
      data: points.map((point) => point.date),
      axisLabel: {
        formatter: (value: string) => dateTick(value)
      }
    },
    yAxis: {
      type: "value",
      name: resolvedYAxisName,
      axisLabel: {
        formatter: (value: number) => (indexed ? numberAxis(value) : currencyAxis(value))
      }
    },
    series: [
      {
        name: resolvedStrategyLabel,
        type: "line" as const,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2.5, color: "#3fb950" },
        areaStyle: indexed ? undefined : { color: "rgba(63, 185, 80, 0.12)" },
        data: points.map((point) => point.strategyValue)
      },
      ...(benchmark
        ? [
            {
              name: resolvedBenchmarkLabel,
              type: "line" as const,
              smooth: true,
              showSymbol: false,
              lineStyle: { width: 2, color: "#e6edf3", type: "dashed" as const },
              data: points.map((point) => point.benchmarkValue)
            }
          ]
        : [])
    ]
  }), [benchmark, indexed, points, resolvedBenchmarkLabel, resolvedDate, resolvedStrategyLabel, resolvedYAxisName]);

  return <EChartSurface ariaLabel="Backtesting line chart" className={styles.chartSurface} option={option} />;
}

export function BacktestingDrawdownChart({ points }: { points: BacktestingDrawdownPoint[] }) {
  const { tr } = useI18n();
  const resolvedDate = tr("Date");
  const resolvedDrawdown = tr("Drawdown");
  const resolvedDrawdownAxis = tr("Drawdown %");
  const option = useMemo<EChartsOption>(() => ({
    grid: GRID,
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params as Array<{ axisValue: string; value: number }> : [];
        return `${tooltipDate(items[0]?.axisValue ?? "")}<br/>${resolvedDrawdown}: ${formatPercent(items[0]?.value ?? null, 2, true)}`;
      }
    },
    xAxis: {
      type: "category",
      name: resolvedDate,
      boundaryGap: false,
      data: points.map((point) => point.date),
      axisLabel: { formatter: (value: string) => dateTick(value) }
    },
    yAxis: {
      type: "value",
      name: resolvedDrawdownAxis,
      max: 0,
      axisLabel: { formatter: (value: number) => formatPercent(value, 0, false) }
    },
    series: [
      {
        type: "line" as const,
        name: resolvedDrawdown,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2.5, color: "#ff7b72" },
        areaStyle: { color: "rgba(255, 123, 114, 0.18)" },
        markLine: {
          symbol: "none",
          data: [{ yAxis: 0 }],
          lineStyle: { color: "rgba(230, 237, 243, 0.35)", type: "dashed" }
        },
        data: points.map((point) => point.drawdownPct)
      }
    ]
  }), [points, resolvedDate, resolvedDrawdown, resolvedDrawdownAxis]);

  return <EChartSurface ariaLabel="Backtesting drawdown chart" className={styles.chartSurface} option={option} />;
}

export function BacktestingMultiLineChart({
  series
}: {
  series: Array<{ key: string; label: string; points: BacktestingLinePoint[] }>;
}) {
  const { tr } = useI18n();
  const resolvedDate = tr("Date");
  const resolvedIndexed = tr("Indexed Value (Base 100)");
  const resolvedSeries = series.map((item) => ({ ...item, translatedLabel: tr(item.label) }));
  const option = useMemo<EChartsOption>(() => ({
    grid: GRID,
    legend: {
      ...LEGEND_BOTTOM,
      data: resolvedSeries.map((item) => item.translatedLabel)
    },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params as Array<{ axisValue: string; seriesName: string; value: number }> : [];
        return [
          tooltipDate(items[0]?.axisValue ?? ""),
          ...items.map((item) => `${item.seriesName}: ${numberAxis(item.value)}`)
        ].join("<br/>");
      }
    },
    xAxis: {
      type: "category",
      name: resolvedDate,
      boundaryGap: false,
      data: resolvedSeries[0]?.points.map((point) => point.date) ?? [],
      axisLabel: { formatter: (value: string) => dateTick(value) }
    },
    yAxis: {
      type: "value",
      name: resolvedIndexed,
      axisLabel: { formatter: (value: number) => numberAxis(value) }
    },
    series: resolvedSeries.map((item, index) => ({
      name: item.translatedLabel,
      type: "line" as const,
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 2.5, color: STRATEGY_COLORS[index % STRATEGY_COLORS.length] },
      data: item.points.map((point) => point.strategyValue)
    }))
  }), [resolvedDate, resolvedIndexed, resolvedSeries]);

  return <EChartSurface ariaLabel="Backtesting multi-line comparison chart" className={styles.chartSurface} option={option} />;
}

export function BacktestingScatterChart({
  points,
  xAxisName = "Max Drawdown %",
  yAxisName = "Win Rate %",
  sizeLabel = "Closed trades"
}: {
  points: Array<{ key: string; label: string; x: number; y: number; size: number }>;
  xAxisName?: string;
  yAxisName?: string;
  sizeLabel?: string;
}) {
  const { tr } = useI18n();
  const resolvedXAxisName = tr(xAxisName);
  const resolvedYAxisName = tr(yAxisName);
  const resolvedSizeLabel = tr(sizeLabel);
  const translatedPoints = points.map((point) => ({ ...point, translatedLabel: tr(point.label) }));
  const sizeMax = Math.max(...points.map((point) => point.size), 1);
  const option = useMemo<EChartsOption>(() => ({
    grid: GRID,
    tooltip: {
      trigger: "item",
      formatter: (params: unknown) => {
        const item = params as {
          name?: string;
          value?: [number, number, number, string] | [number, number, number];
          data?: { value?: [number, number, number, string] | [number, number, number] } | [number, number, number, string] | [number, number, number];
        };
        const rawValue = Array.isArray(item?.value)
          ? item.value
          : Array.isArray(item?.data)
            ? item.data
            : Array.isArray(item?.data?.value)
              ? item.data.value
              : [0, 0, 0, ""];
        const data = rawValue as [number, number, number, string?];
        const label = item?.name ?? data[3] ?? "";
        return [
          label,
          `${resolvedXAxisName}: ${formatPercent(data[0], 2, true)}`,
          `${resolvedYAxisName}: ${formatPercent(data[1], 2, true)}`,
          `${resolvedSizeLabel}: ${formatNumberIN(data[2], { maximumFractionDigits: 0 })}`
        ].join("<br/>");
      }
    },
    xAxis: {
      type: "value",
      name: resolvedXAxisName,
      axisLabel: { formatter: (value: number) => formatPercent(value, 0, false) }
    },
    yAxis: {
      type: "value",
      name: resolvedYAxisName,
      axisLabel: { formatter: (value: number) => formatPercent(value, 0, false) }
    },
    series: [
      {
        type: "scatter" as const,
        data: translatedPoints.map((point, index) => ({
          name: point.translatedLabel,
          value: [point.x, point.y, point.size, point.translatedLabel],
          symbolSize: 12 + (point.size / sizeMax) * 18,
          itemStyle: { color: STRATEGY_COLORS[index % STRATEGY_COLORS.length], opacity: 0.72 }
        }))
      }
    ]
  }), [resolvedSizeLabel, resolvedXAxisName, resolvedYAxisName, sizeMax, translatedPoints]);

  return <EChartSurface ariaLabel="Backtesting scatter comparison chart" className={styles.chartSurface} option={option} />;
}

export function BacktestingHistogramChart({
  rows,
  xAxisName,
  yAxisName = "Closed Trades"
}: {
  rows: BacktestingHistogramBucket[];
  xAxisName: string;
  yAxisName?: string;
}) {
  const { tr } = useI18n();
  const resolvedXAxisName = tr(xAxisName);
  const resolvedYAxisName = tr(yAxisName);
  const resolvedTrades = tr("Trades");
  const option = useMemo<EChartsOption>(() => ({
    grid: GRID,
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params as Array<{ axisValue: string; value: number }> : [];
        return `${items[0]?.axisValue ?? ""}<br/>${resolvedTrades}: ${formatNumberIN(items[0]?.value ?? null, { maximumFractionDigits: 0 })}`;
      }
    },
    xAxis: {
      type: "category",
      name: resolvedXAxisName,
      data: rows.map((row) => row.bucketLabel)
    },
    yAxis: {
      type: "value",
      name: resolvedYAxisName,
      axisLabel: { formatter: histogramAxis }
    },
    series: [
      {
        type: "bar" as const,
        barMaxWidth: 28,
        itemStyle: { color: "#58a6ff", borderRadius: [6, 6, 0, 0] },
        data: rows.map((row) => row.count)
      }
    ]
  }), [resolvedTrades, resolvedXAxisName, resolvedYAxisName, rows]);

  return <EChartSurface ariaLabel="Backtesting histogram chart" className={styles.chartSurface} option={option} />;
}

export function BacktestingHorizontalBarChart({
  items,
  xAxisName,
  valueFormatter = "currency"
}: {
  items: Array<{ label: string; value: number; tone?: "green" | "red" | "white" }>;
  xAxisName: string;
  valueFormatter?: "currency" | "number" | "percent";
}) {
  const { tr } = useI18n();
  const resolvedXAxisName = tr(xAxisName);
  const resolvedSymbolStrategy = tr("Symbol / Strategy");
  const translatedItems = items.map((item) => ({ ...item, translatedLabel: tr(item.label) }));
  const formatValue = (value: number) =>
    valueFormatter === "currency"
      ? formatCurrencyINR(value, true)
      : valueFormatter === "percent"
        ? formatPercent(value, 2, true)
        : formatNumberIN(value);

  const option = useMemo<EChartsOption>(() => ({
    grid: { ...GRID, left: 120 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params as Array<{ axisValue: string; value: number }> : [];
        return `${items[0]?.axisValue ?? ""}<br/>${formatValue(items[0]?.value ?? 0)}`;
      }
    },
    xAxis: {
      type: "value",
      name: resolvedXAxisName,
      axisLabel: {
        formatter: (value: number) =>
          valueFormatter === "currency"
            ? currencyAxis(value)
            : valueFormatter === "percent"
              ? formatPercent(value, 0, false)
              : numberAxis(value)
      }
    },
    yAxis: {
      type: "category",
      name: resolvedSymbolStrategy,
      data: translatedItems.map((item) => item.translatedLabel)
    },
    series: [
      {
        type: "bar" as const,
        barMaxWidth: 20,
        data: translatedItems.map((item) => ({
          value: item.value,
          itemStyle: {
            color:
              item.tone === "red"
                ? "#ff7b72"
                : item.tone === "white"
                  ? "#e6edf3"
                  : "#3fb950",
            borderRadius: [0, 6, 6, 0]
          }
        }))
      }
    ]
  }), [resolvedSymbolStrategy, resolvedXAxisName, translatedItems, valueFormatter]);

  return <EChartSurface ariaLabel="Backtesting horizontal bar chart" className={styles.chartSurfaceTall} option={option} />;
}

export function BacktestingGroupedBarChart({
  categories,
  series,
  xAxisName,
  yAxisName,
  formatter = "percent"
}: {
  categories: string[];
  series: Array<{ name: string; values: number[] }>;
  xAxisName: string;
  yAxisName: string;
  formatter?: "percent" | "currency" | "number";
}) {
  const { tr } = useI18n();
  const resolvedXAxisName = tr(xAxisName);
  const resolvedYAxisName = tr(yAxisName);
  const translatedCategories = categories.map((category) => tr(category));
  const translatedSeries = series.map((item) => ({ ...item, translatedName: tr(item.name) }));
  const rotateLabels = categories.some((label) => label.length > 14);
  const option = useMemo<EChartsOption>(() => ({
    grid: {
      ...GRID,
      bottom: rotateLabels ? 104 : GRID.bottom
    },
    legend: { ...LEGEND_BOTTOM, data: translatedSeries.map((item) => item.translatedName) },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params as Array<{ axisValue: string; seriesName: string; value: number }> : [];
        return [
          items[0]?.axisValue ?? "",
          ...items.map((item) => {
            const value =
              formatter === "currency"
                ? formatCurrencyINR(item.value, true)
                : formatter === "number"
                  ? formatNumberIN(item.value)
                  : formatPercent(item.value, 2, true);
            return `${item.seriesName}: ${value}`;
          })
        ].join("<br/>");
      }
    },
    xAxis: {
      type: "category",
      name: resolvedXAxisName,
      data: translatedCategories,
      axisLabel: {
        interval: 0,
        rotate: rotateLabels ? 18 : 0
      }
    },
    yAxis: {
      type: "value",
      name: resolvedYAxisName,
      axisLabel: {
        formatter: (value: number) =>
          formatter === "currency"
            ? currencyAxis(value)
            : formatter === "number"
              ? numberAxis(value)
              : formatPercent(value, 0, false)
      }
    },
    series: translatedSeries.map((item, index) => ({
      name: item.translatedName,
      type: "bar" as const,
      barMaxWidth: 22,
      itemStyle: { color: STRATEGY_COLORS[index % STRATEGY_COLORS.length], borderRadius: [6, 6, 0, 0] },
      markLine: {
        symbol: "none",
        data: [{ yAxis: 0 }],
        lineStyle: { color: "rgba(230, 237, 243, 0.28)", type: "dashed" as const }
      },
      data: item.values
    }))
  }), [formatter, resolvedXAxisName, resolvedYAxisName, rotateLabels, translatedCategories, translatedSeries]);

  return <EChartSurface ariaLabel="Backtesting grouped bar chart" className={styles.chartSurface} option={option} />;
}

export function BacktestingDeploymentChart({
  points
}: {
  points: BacktestingScenario["capitalDeploymentCurve"];
}) {
  const { tr } = useI18n();
  const resolvedCapitalDeployed = tr("Capital deployed");
  const resolvedOpenPositions = tr("Open positions");
  const resolvedDate = tr("Date");
  const resolvedCapitalAxis = tr("Capital Deployed (₹)");
  const resolvedOpenAxis = tr("Open Positions");
  const option = useMemo<EChartsOption>(() => ({
    grid: GRID,
    legend: { ...LEGEND_BOTTOM, data: [resolvedCapitalDeployed, resolvedOpenPositions] },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params as Array<{ axisValue: string; seriesName: string; value: number }> : [];
        return [
          tooltipDate(items[0]?.axisValue ?? ""),
          ...items.map((item) =>
            `${item.seriesName}: ${item.seriesName === resolvedCapitalDeployed ? formatCurrencyINR(item.value, true) : formatNumberIN(item.value)}`
          )
        ].join("<br/>");
      }
    },
    xAxis: {
      type: "category",
      name: resolvedDate,
      boundaryGap: false,
      data: points.map((point) => point.date),
      axisLabel: { formatter: (value: string) => dateTick(value) }
    },
    yAxis: [
      {
        type: "value",
        name: resolvedCapitalAxis,
        axisLabel: { formatter: currencyAxis }
      },
      {
        type: "value",
        name: resolvedOpenAxis,
        axisLabel: { formatter: histogramAxis }
      }
    ],
    series: [
      {
        name: resolvedCapitalDeployed,
        type: "line" as const,
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 2.5, color: "#58a6ff" },
        areaStyle: { color: "rgba(88, 166, 255, 0.14)" },
        data: points.map((point) => point.deployedCapital)
      },
      {
        name: resolvedOpenPositions,
        type: "line",
        yAxisIndex: 1,
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 2, color: "#e3b341", type: "dashed" as const },
        data: points.map((point) => point.openPositions)
      }
    ]
  }), [points, resolvedCapitalAxis, resolvedCapitalDeployed, resolvedDate, resolvedOpenAxis, resolvedOpenPositions]);

  return <EChartSurface ariaLabel="Backtesting capital deployment chart" className={styles.chartSurface} option={option} />;
}

export function BacktestingPriceContextChart({
  chart,
  strategyId
}: {
  chart: BacktestingPriceIndicatorChart;
  strategyId: string;
}) {
  const { tr } = useI18n();
  if (!chart) return null;
  const resolvedPrice = tr("Price");
  const resolvedRsi = tr("RSI");
  const resolvedWillr = tr("WILLR");
  const resolvedEntries = tr("Entries");
  const resolvedExits = tr("Exits");
  const resolvedDate = tr("Date");
  const resolvedPriceAxis = tr("Price (₹)");
  const resolvedIndicatorAxis = tr(strategyId.includes("macd") ? "RSI / WILLR context" : "Indicator");
  const option = useMemo<EChartsOption>(() => {
    const entryMarkers = chart.points
      .filter((point) => point.buyMarker)
      .map((point) => ({ value: [point.date, point.price] as [string, number] }));
    const exitMarkers = chart.points
      .filter((point) => point.sellMarker)
      .map((point) => ({ value: [point.date, point.price] as [string, number] }));

    return {
      grid: [
        { top: 18, left: 66, right: 18, height: 138, containLabel: true },
        { left: 66, right: 18, top: 198, bottom: 82, containLabel: true }
      ],
      legend: {
        ...LEGEND_BOTTOM,
        data: ["Price", "RSI", "WILLR", "Entries", "Exits"]
      },
      tooltip: {
        trigger: "axis",
        formatter: (params: unknown) => {
          const items = Array.isArray(params) ? params as Array<{ axisValue: string; seriesName: string; value: number }> : [];
          return [
          tooltipDate(items[0]?.axisValue ?? ""),
          ...items.map((item) => {
              const value = item.seriesName === resolvedPrice || item.seriesName.startsWith("SMA") ? formatCurrencyINR(item.value, false, { maximumFractionDigits: 2 }) : formatNumberIN(item.value, { maximumFractionDigits: 2 });
              return `${item.seriesName}: ${value}`;
            })
          ].join("<br/>");
        }
      },
      xAxis: [
        {
          type: "category",
          gridIndex: 0,
          data: chart.points.map((point) => point.date),
          axisLabel: { show: false }
        },
        {
          type: "category",
          gridIndex: 1,
          name: resolvedDate,
          data: chart.points.map((point) => point.date),
          axisLabel: { formatter: (value: string) => dateTick(value) }
        }
      ],
      yAxis: [
        {
          type: "value",
          gridIndex: 0,
          name: resolvedPriceAxis,
          axisLabel: { formatter: currencyAxis }
        },
        {
          type: "value",
          gridIndex: 1,
          name: resolvedIndicatorAxis,
          min: -100,
          max: 100
        }
      ],
      series: [
        {
          name: resolvedPrice,
          type: "line" as const,
          xAxisIndex: 0,
          yAxisIndex: 0,
          showSymbol: false,
          lineStyle: { color: "#e6edf3", width: 2.5 },
          data: chart.points.map((point) => point.price)
        },
        {
          name: resolvedRsi,
          type: "line" as const,
          xAxisIndex: 1,
          yAxisIndex: 1,
          showSymbol: false,
          lineStyle: { color: "#3fb950", width: 2 },
          markLine: {
            symbol: "none",
            data: [{ yAxis: 30 }, { yAxis: 50 }, { yAxis: 70 }],
            lineStyle: { color: "rgba(230, 237, 243, 0.28)", type: "dashed" as const }
          },
          data: chart.points.map((point) => point.rsi)
        },
        {
          name: resolvedWillr,
          type: "line" as const,
          xAxisIndex: 1,
          yAxisIndex: 1,
          showSymbol: false,
          lineStyle: { color: "#ff7b72", width: 2 },
          data: chart.points.map((point) => point.willr)
        },
        {
          name: resolvedEntries,
          type: "scatter" as const,
          xAxisIndex: 0,
          yAxisIndex: 0,
          symbolSize: 10,
          itemStyle: { color: "#3fb950" },
          data: entryMarkers
        },
        {
          name: resolvedExits,
          type: "scatter" as const,
          xAxisIndex: 0,
          yAxisIndex: 0,
          symbolSize: 10,
          itemStyle: { color: "#ff7b72" },
          data: exitMarkers
        }
      ]
    };
  }, [chart, resolvedDate, resolvedEntries, resolvedExits, resolvedIndicatorAxis, resolvedPrice, resolvedPriceAxis, resolvedRsi, resolvedWillr]);

  return <EChartSurface ariaLabel="Backtesting price and indicator context chart" className={styles.chartSurfaceTall} option={option} />;
}
