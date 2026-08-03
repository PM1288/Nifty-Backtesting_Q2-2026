import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthGate } from "../auth/AuthGateProvider";
import { trackFilterChanged } from "../analytics/events";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { useWorkspaceEngagement, useWorkspaceSectionViews } from "../analytics/useWorkspaceAnalytics";
import type { AnalyticsParams } from "../analytics/types";
import { EChartSurface } from "../components/visual/EChartSurface";
import { useI18n } from "../i18n/LocaleProvider";
import type { AnalyticsSimulatorQuery } from "../lib/api";
import { trackAnalyticsEvent, trackCtaClick } from "../lib/analytics";
import { formatCompactCurrency, formatCompactNumber, formatCurrencyINR, formatNumber, fmtPct, fmtPrice } from "../lib/format";
import { useAnalyticsSimulator, useAnalyticsSimulatorUniverse } from "../lib/hooks";
import type {
  AnalyticsSimulatorCapitalScenario,
  AnalyticsSimulatorChargeBreakdown,
  AnalyticsSimulatorScenarioResult,
  AnalyticsSimulatorTimelinePoint,
  AnalyticsSimulatorTrade,
  AnalyticsSimulatorUniverseItem
} from "../lib/types";
import type { EChartsOption } from "echarts";
import { AnalyticsHeader, ExplainThis, toneFromNumber, useAnalyticsExperienceMode } from "./AnalyticsChrome";
import styles from "./AnalyticsPage.module.css";

type StrategyMode = "buy_and_hold" | "buy_on_dip_sell_on_target";
type TranslateText = (key: string, fallback?: string, values?: Record<string, string | number>) => string;

const DEFAULT_QUERY: AnalyticsSimulatorQuery = {
  symbol: "NIFTY 50",
  instrumentType: "index",
  lotAmount: 100000,
  dipPct: 1,
  targetPct: 1.25,
  fdRatePct: 7,
  lookbackDays: 365,
  capitalCaps: "1000000,2500000,5000000",
  includeInfinite: true
};

const PRELOADED_UNIVERSE: AnalyticsSimulatorUniverseItem[] = [
  { symbol: "NIFTY 50", display_name: "NIFTY 50", instrument_type: "index" },
  { symbol: "NIFTY BANK", display_name: "NIFTY BANK", instrument_type: "index" },
  { symbol: "INDIA VIX", display_name: "INDIA VIX", instrument_type: "index" },
  { symbol: "RELIANCE", display_name: "RELIANCE INDUSTRIES LTD", instrument_type: "equity" },
  { symbol: "HDFCBANK", display_name: "HDFC BANK LTD", instrument_type: "equity" },
  { symbol: "ICICIBANK", display_name: "ICICI BANK LTD", instrument_type: "equity" },
  { symbol: "INFY", display_name: "INFOSYS LTD", instrument_type: "equity" },
  { symbol: "TCS", display_name: "TATA CONSULTANCY SERVICES LTD", instrument_type: "equity" },
  { symbol: "LT", display_name: "LARSEN & TOUBRO LTD", instrument_type: "equity" },
  { symbol: "SBIN", display_name: "STATE BANK OF INDIA", instrument_type: "equity" }
];

function fmtCurrency(value: number | null | undefined) {
  return formatCurrencyINR(value, false, { maximumFractionDigits: 0 });
}

function fmtCompactCurrency(value: number | null | undefined) {
  return formatCompactCurrency(value, { maximumFractionDigits: 2 });
}

function fmtSignedCurrency(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${fmtCompactCurrency(value)}`;
}

function strategyLabel(mode: StrategyMode) {
  return mode === "buy_and_hold" ? "Accumulate & Hold" : "Dip Buy + 1.25% Exit";
}

function resolveScenario(capital: AnalyticsSimulatorCapitalScenario | undefined, mode: StrategyMode) {
  if (!capital) return null;
  return capital[mode];
}

function normalizeUniverseItem(items: AnalyticsSimulatorUniverseItem[], symbol: string) {
  return items.find((item) => item.symbol.toUpperCase() === symbol.toUpperCase()) ?? null;
}

const CHART_COLORS = {
  black: "#000000",
  white: "#ffffff",
  green: "#00ff66",
  fd: "#d4af37",
  savings: "#66ccff",
  red: "#ff0033",
  text: "rgba(255, 255, 255, 0.72)",
  muted: "rgba(255, 255, 255, 0.54)",
  grid: "rgba(255, 255, 255, 0.08)",
  panel: "rgba(255, 255, 255, 0.04)",
  neutral: "rgba(255, 255, 255, 0.38)",
  strategyArea: "rgba(0, 255, 102, 0.08)"
} as const;
const LEGEND_BOTTOM = {
  bottom: 6,
  left: "center"
} as const;

const DEFAULT_SAVINGS_RATE_PCT = 3.5;

type SavingsTimelinePoint = {
  date: string;
  value: number;
};

type ComparisonRow = {
  label: string;
  investedPrincipal: number;
  cashOutflow: number;
  strategy: number;
  strategyReturnPct: number;
  fd: number;
  fdReturnPct: number;
  savings: number;
  savingsReturnPct: number;
};

type SimulatorCoachCard = {
  eyebrow: string;
  title: string;
  body: string;
  tone: "green" | "red" | "white";
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sttRound(value: number) {
  const whole = Math.floor(value);
  return whole + (value - whole >= 0.5 ? 1 : 0);
}

function dateDiffDays(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(Math.round((end - start) / 86_400_000), 0);
}

function compoundValue(principal: number, startDate: string, endDate: string, annualRatePct: number) {
  if (!Number.isFinite(principal) || principal <= 0) return 0;
  const days = dateDiffDays(startDate, endDate);
  return round2(principal * ((1 + annualRatePct / 100) ** (days / 365)));
}

function buildRateTimeline(
  timeline: AnalyticsSimulatorTimelinePoint[],
  trades: AnalyticsSimulatorTrade[],
  annualRatePct: number
): SavingsTimelinePoint[] {
  return timeline.map((point) => ({
    date: point.date,
    value: round2(
      trades
        .filter((trade) => trade.buy_date <= point.date)
        .reduce((total, trade) => total + compoundValue(trade.principal, trade.buy_date, point.date, annualRatePct), 0)
    )
  }));
}

function fmtAxisCurrency(value: number) {
  if (!Number.isFinite(value)) return "—";
  return formatCompactNumber(value, {
    maximumFractionDigits: Math.abs(value) >= 1_00_000 ? 1 : 0
  });
}

function resolveAxisBounds(values: number[]) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (!finiteValues.length) {
    return { min: 0, max: 1 };
  }

  const minValue = Math.min(...finiteValues);
  const maxValue = Math.max(...finiteValues);

  if (minValue === maxValue) {
    const padding = Math.max(Math.abs(maxValue) * 0.08, 1);
    return {
      min: Math.max(0, minValue - padding),
      max: maxValue + padding
    };
  }

  const padding = (maxValue - minValue) * 0.08;
  return {
    min: Math.max(0, minValue - padding),
    max: maxValue + padding
  };
}

function buildComparisonChartOption(rows: ComparisonRow[]): EChartsOption {
  const rowLookup = new Map(rows.map((row) => [row.label, row]));
  const axisBounds = resolveAxisBounds(
    rows.flatMap((row) => [row.investedPrincipal, row.cashOutflow, row.strategy, row.fd, row.savings])
  );

  return {
    animationDuration: 320,
    animationDurationUpdate: 220,
    backgroundColor: "transparent",
    textStyle: {
      color: CHART_COLORS.text,
      fontFamily: "Hoover, sans-serif"
    },
    grid: {
      top: 24,
      right: 18,
      bottom: 86,
      left: 18,
      containLabel: true
    },
    legend: {
      ...LEGEND_BOTTOM,
      itemWidth: 14,
      itemHeight: 2,
      textStyle: {
        color: CHART_COLORS.text,
        fontSize: 11
      }
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: CHART_COLORS.black,
      borderColor: CHART_COLORS.grid,
      borderWidth: 1,
      textStyle: {
        color: CHART_COLORS.white,
        fontSize: 11
      },
      formatter: (params: any) => {
        const items = Array.isArray(params) ? params : [params];
        const axisLabel = items[0]?.axisValueLabel ?? "";
        const row = rowLookup.get(axisLabel);
        if (!row) {
          return axisLabel;
        }

        return [
          axisLabel,
          `Invested principal: ${fmtCurrency(row.investedPrincipal)}`,
          `Cash outflow: ${fmtCurrency(row.cashOutflow)}`,
          `${items[0]?.marker ?? ""}Strategy: ${fmtCurrency(row.strategy)} (${fmtPct(row.strategyReturnPct)})`,
          `${items[1]?.marker ?? ""}FD: ${fmtCurrency(row.fd)} (${fmtPct(row.fdReturnPct)})`,
          `${items[2]?.marker ?? ""}Savings: ${fmtCurrency(row.savings)} (${fmtPct(row.savingsReturnPct)})`
        ].join("<br/>");
      }
    },
    xAxis: {
      type: "category",
      name: "Scenario / Capital Bucket",
      nameLocation: "middle",
      nameGap: 38,
      nameTextStyle: {
        color: CHART_COLORS.muted,
        fontSize: 11
      },
      data: rows.map((row) => row.label),
      axisLine: { lineStyle: { color: CHART_COLORS.grid } },
      axisTick: { show: false },
      axisLabel: {
        color: CHART_COLORS.muted,
        fontSize: 11,
        margin: 10
      }
    },
    yAxis: {
      type: "value",
      name: "Value (₹)",
      nameTextStyle: {
        color: CHART_COLORS.muted,
        fontSize: 11
      },
      scale: true,
      min: axisBounds.min,
      max: axisBounds.max,
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: CHART_COLORS.grid } },
      axisLabel: {
        color: CHART_COLORS.muted,
        fontSize: 11,
        formatter: (value: number) => fmtAxisCurrency(value)
      }
    },
    series: [
      {
        name: "Strategy",
        type: "bar",
        barGap: "20%",
        barMaxWidth: 28,
        data: rows.map((row) => row.strategy),
        itemStyle: {
          color: CHART_COLORS.green,
          borderRadius: [10, 10, 0, 0],
          shadowBlur: 12,
          shadowColor: "rgba(0, 255, 102, 0.35)"
        }
      },
      {
        name: "FD",
        type: "bar",
        barMaxWidth: 28,
        data: rows.map((row) => row.fd),
        itemStyle: {
          color: CHART_COLORS.fd,
          borderRadius: [10, 10, 0, 0],
          shadowBlur: 10,
          shadowColor: "rgba(212, 175, 55, 0.22)"
        }
      },
      {
        name: "Savings",
        type: "bar",
        barMaxWidth: 28,
        data: rows.map((row) => row.savings),
        itemStyle: {
          color: CHART_COLORS.savings,
          borderRadius: [10, 10, 0, 0],
          shadowBlur: 10,
          shadowColor: "rgba(102, 204, 255, 0.18)"
        }
      }
    ]
  };
}

function buildTimelineChartOption(
  points: AnalyticsSimulatorTimelinePoint[],
  savingsTimeline: SavingsTimelinePoint[]
): EChartsOption {
  const labelStride = Math.max(1, Math.floor(points.length / 6));
  const firstClose = points[0]?.close ?? 0;
  const savingsByDate = new Map(savingsTimeline.map((point) => [point.date, point.value]));
  const timelineRows = points.map((point, index) => {
    const previousClose = index > 0 ? points[index - 1].close : point.close;
    const closeDayMovePct = previousClose > 0 ? round2(((point.close / previousClose) - 1) * 100) : 0;
    const closeFromStartPct = firstClose > 0 ? round2(((point.close / firstClose) - 1) * 100) : 0;
    const savingsValue = savingsByDate.get(point.date) ?? 0;
    return {
      ...point,
      savings_value: savingsValue,
      savings_profit: round2(savingsValue - point.invested_principal),
      savings_return_pct:
        point.invested_principal > 0 ? round2(((savingsValue / point.invested_principal) - 1) * 100) : 0,
      fd_return_pct: point.invested_principal > 0 ? round2(((point.fd_value / point.invested_principal) - 1) * 100) : 0,
      strategy_return_pct:
        point.cash_outflow > 0 ? round2(((point.strategy_value / point.cash_outflow) - 1) * 100) : 0,
      close_day_move_pct: closeDayMovePct,
      close_from_start_pct: closeFromStartPct
    };
  });
  const axisBounds = resolveAxisBounds(
    timelineRows.flatMap((point) => [
      point.invested_principal,
      point.cash_outflow,
      point.strategy_value,
      point.fd_value,
      point.savings_value
    ])
  );
  const buyMarkers = timelineRows
    .map((point, index) => {
      const previousBuys = index > 0 ? timelineRows[index - 1]?.executed_buys ?? 0 : 0;
      const buyDelta = point.executed_buys - previousBuys;
      if (buyDelta <= 0) return null;
      return {
        value: [point.date, point.strategy_value],
        buyDelta,
        openLots: point.open_lots
      };
    })
    .filter((item): item is { value: [string, number]; buyDelta: number; openLots: number } => item !== null);

  return {
    animationDuration: 320,
    animationDurationUpdate: 220,
    backgroundColor: "transparent",
    textStyle: {
      color: CHART_COLORS.text,
      fontFamily: "Hoover, sans-serif"
    },
    grid: {
      top: 24,
      right: 18,
      bottom: 90,
      left: 18,
      containLabel: true
    },
    legend: {
      ...LEGEND_BOTTOM,
      itemWidth: 14,
      itemHeight: 2,
      textStyle: {
        color: CHART_COLORS.text,
        fontSize: 11
      }
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line" },
      backgroundColor: CHART_COLORS.black,
      borderColor: CHART_COLORS.grid,
      borderWidth: 1,
      textStyle: {
        color: CHART_COLORS.white,
        fontSize: 11
      },
      formatter: (params: any) => {
        const items = Array.isArray(params) ? params : [params];
        const indexedItem = items.find((item: any) => typeof item?.dataIndex === "number") ?? items[0];
        const index = indexedItem?.dataIndex ?? 0;
        const row = timelineRows[index];
        if (!row) {
          return items[0]?.axisValueLabel ?? "";
        }

        return [
          row.date,
          `Close: ${fmtPrice(row.close)} (${fmtPct(row.close_day_move_pct)} day, ${fmtPct(row.close_from_start_pct)} from start)`,
          `Invested principal: ${fmtCurrency(row.invested_principal)}`,
          `Cash outflow: ${fmtCurrency(row.cash_outflow)}`,
          `${items[0]?.marker ?? ""}Strategy: ${fmtCurrency(row.strategy_value)} (${fmtPct(row.strategy_return_pct)})`,
          `${items[1]?.marker ?? ""}FD: ${fmtCurrency(row.fd_value)} (${fmtPct(row.fd_return_pct)})`,
          `${items[2]?.marker ?? ""}Savings: ${fmtCurrency(row.savings_value)} (${fmtPct(row.savings_return_pct)})`,
          `${items[3]?.marker ?? ""}Invested: ${fmtCurrency(row.invested_principal)}`,
          `Open lots: ${formatNumber(row.open_lots, { maximumFractionDigits: 0 })} | Buys: ${formatNumber(row.executed_buys, { maximumFractionDigits: 0 })}`
        ].join("<br/>");
      }
    },
    xAxis: {
      type: "category",
      name: "Trade Date",
      nameLocation: "middle",
      nameGap: 40,
      nameTextStyle: {
        color: CHART_COLORS.muted,
        fontSize: 11
      },
      boundaryGap: false,
      data: points.map((point) => point.date),
      axisLine: { lineStyle: { color: CHART_COLORS.grid } },
      axisTick: { show: false },
      axisLabel: {
        color: CHART_COLORS.muted,
        fontSize: 11,
        margin: 12,
        interval: labelStride > 1 ? labelStride - 1 : 0,
        formatter: (value: string) => {
          const [year, month, day] = value.split("-");
          return year && month && day ? `${day}/${month}` : value;
        }
      }
    },
    yAxis: {
      type: "value",
      name: "Portfolio Value (₹)",
      nameTextStyle: {
        color: CHART_COLORS.muted,
        fontSize: 11
      },
      scale: true,
      min: axisBounds.min,
      max: axisBounds.max,
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: CHART_COLORS.grid } },
      axisLabel: {
        color: CHART_COLORS.muted,
        fontSize: 11,
        formatter: (value: number) => fmtAxisCurrency(value)
      }
    },
    series: [
      {
        name: "Strategy",
        type: "line",
        smooth: 0.22,
        showSymbol: false,
        sampling: "lttb",
        data: timelineRows.map((point) => point.strategy_value),
        lineStyle: {
          color: CHART_COLORS.green,
          width: 2.8
        },
        areaStyle: {
          color: CHART_COLORS.strategyArea
        }
      },
      {
        name: "FD",
        type: "line",
        smooth: 0.18,
        showSymbol: false,
        sampling: "lttb",
        data: timelineRows.map((point) => point.fd_value),
        lineStyle: {
          color: CHART_COLORS.fd,
          width: 2.4
        }
      },
      {
        name: "Savings",
        type: "line",
        smooth: 0.18,
        showSymbol: false,
        sampling: "lttb",
        data: timelineRows.map((point) => point.savings_value),
        lineStyle: {
          color: CHART_COLORS.savings,
          width: 2.2
        }
      },
      {
        name: "Invested principal",
        type: "line",
        smooth: 0.18,
        showSymbol: false,
        sampling: "lttb",
        data: timelineRows.map((point) => point.invested_principal),
        lineStyle: {
          color: CHART_COLORS.neutral,
          width: 2,
          type: "dashed"
        }
      },
      {
        name: "Buy markers",
        type: "scatter",
        symbol: "diamond",
        symbolSize: 9,
        data: buyMarkers,
        itemStyle: {
          color: CHART_COLORS.white,
          borderColor: CHART_COLORS.green,
          borderWidth: 1.2,
          shadowBlur: 10,
          shadowColor: "rgba(0, 255, 102, 0.24)"
        },
        tooltip: {
          formatter: (params: any) => {
            const marker = params?.marker ?? "";
            const [date, strategyValue] = (params?.data?.value ?? []) as [string, number];
            return [
              `${marker}Buy day`,
              `${date ?? "—"}`,
              `Strategy value: ${fmtCurrency(strategyValue)}`,
              `New entries: ${formatNumber(params?.data?.buyDelta ?? null, { maximumFractionDigits: 0 })}`,
              `Open positions: ${formatNumber(params?.data?.openLots ?? null, { maximumFractionDigits: 0 })}`
            ].join("<br/>");
          }
        }
      }
    ]
  };
}

function buildDrawdownChartOption(
  points: AnalyticsSimulatorTimelinePoint[],
  savingsTimeline: SavingsTimelinePoint[]
): EChartsOption {
  const labelStride = Math.max(1, Math.floor(points.length / 6));
  let strategyPeak = Number.NEGATIVE_INFINITY;
  let fdPeak = Number.NEGATIVE_INFINITY;
  const savingsByDate = new Map(savingsTimeline.map((point) => [point.date, point.value]));
  const drawdownRows = points.map((point) => {
    strategyPeak = Math.max(strategyPeak, point.strategy_value);
    fdPeak = Math.max(fdPeak, point.fd_value);
    const savingsValue = savingsByDate.get(point.date) ?? 0;
    return {
      date: point.date,
      strategyDrawdown: strategyPeak > 0 ? round2(((point.strategy_value / strategyPeak) - 1) * 100) : 0,
      fdDrawdown: fdPeak > 0 ? round2(((point.fd_value / fdPeak) - 1) * 100) : 0,
      savingsDrawdown: savingsValue > 0 ? 0 : 0
    };
  });

  return {
    animationDuration: 280,
    animationDurationUpdate: 220,
    backgroundColor: "transparent",
    textStyle: {
      color: CHART_COLORS.text,
      fontFamily: "Hoover, sans-serif"
    },
    grid: {
      top: 24,
      right: 18,
      bottom: 82,
      left: 18,
      containLabel: true
    },
    legend: {
      ...LEGEND_BOTTOM,
      itemWidth: 14,
      itemHeight: 2,
      textStyle: {
        color: CHART_COLORS.text,
        fontSize: 11
      }
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line" },
      backgroundColor: CHART_COLORS.black,
      borderColor: CHART_COLORS.grid,
      borderWidth: 1,
      textStyle: {
        color: CHART_COLORS.white,
        fontSize: 11
      },
      formatter: (params: any) => {
        const items = Array.isArray(params) ? params : [params];
        const index = items[0]?.dataIndex ?? 0;
        const row = drawdownRows[index];
        if (!row) return items[0]?.axisValueLabel ?? "";
        return [
          row.date,
          `${items[0]?.marker ?? ""}Strategy drawdown: ${fmtPct(row.strategyDrawdown)}`,
          `${items[1]?.marker ?? ""}FD drawdown: ${fmtPct(row.fdDrawdown)}`,
          `${items[2]?.marker ?? ""}Savings drawdown: ${fmtPct(row.savingsDrawdown)}`
        ].join("<br/>");
      }
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: drawdownRows.map((point) => point.date),
      axisLine: { lineStyle: { color: CHART_COLORS.grid } },
      axisTick: { show: false },
      axisLabel: {
        color: CHART_COLORS.muted,
        fontSize: 11,
        margin: 10,
        interval: labelStride > 1 ? labelStride - 1 : 0,
        formatter: (value: string) => {
          const [year, month, day] = value.split("-");
          return year && month && day ? `${day}/${month}` : value;
        }
      }
    },
    yAxis: {
      type: "value",
      name: "Drawdown %",
      nameTextStyle: {
        color: CHART_COLORS.muted,
        fontSize: 11
      },
      min: Math.min(-30, ...drawdownRows.map((point) => point.strategyDrawdown), ...drawdownRows.map((point) => point.fdDrawdown)),
      max: 1,
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: CHART_COLORS.grid } },
      axisLabel: {
        color: CHART_COLORS.muted,
        fontSize: 11,
        formatter: (value: number) => `${Math.round(value)}%`
      }
    },
    series: [
      {
        name: "Strategy",
        type: "line",
        smooth: 0.18,
        showSymbol: false,
        sampling: "lttb",
        data: drawdownRows.map((point) => point.strategyDrawdown),
        lineStyle: {
          color: CHART_COLORS.red,
          width: 2.4
        },
        areaStyle: {
          color: "rgba(255, 0, 51, 0.12)"
        }
      },
      {
        name: "FD",
        type: "line",
        smooth: 0.18,
        showSymbol: false,
        sampling: "lttb",
        data: drawdownRows.map((point) => point.fdDrawdown),
        lineStyle: {
          color: CHART_COLORS.fd,
          width: 2
        }
      },
      {
        name: "Savings",
        type: "line",
        smooth: 0.18,
        showSymbol: false,
        sampling: "lttb",
        data: drawdownRows.map((point) => point.savingsDrawdown),
        lineStyle: {
          color: CHART_COLORS.savings,
          width: 1.8,
          type: "dashed"
        }
      }
    ]
  };
}

function ComparisonBarChart({
  rows,
  mode
}: {
  rows: ComparisonRow[];
  mode: StrategyMode;
}) {
  const { t, tr } = useI18n();
  const option = useMemo(() => buildComparisonChartOption(rows), [rows]);

  return (
    <div className={styles.chartPanel}>
      <div className={styles.chartHeader}>
        <div>
          <div className={styles.panelTitle}>{tr("Capital Comparison")}</div>
          <div className={styles.chartCaption}>
            {mode === "buy_and_hold"
              ? t(
                  "simulator.chartCaption.capitalComparisonHold",
                  "Accumulate & Hold against matched FD and savings-account carry to today."
                )
              : t(
                  "simulator.chartCaption.capitalComparisonExit",
                  "Dip Buy + 1.25% Exit against matched FD and savings-account carry to today."
                )}
          </div>
        </div>
      </div>
      <EChartSurface ariaLabel="Simulation capital comparison chart" className={styles.chartSurface} option={option} />
    </div>
  );
}

function TimelineChart({
  points,
  savingsTimeline,
  mode
}: {
  points: AnalyticsSimulatorTimelinePoint[];
  savingsTimeline: SavingsTimelinePoint[];
  mode: StrategyMode;
}) {
  const { t, tr } = useI18n();
  const option = useMemo(() => buildTimelineChartOption(points, savingsTimeline), [points, savingsTimeline]);

  return (
    <div className={styles.chartPanel}>
      <div className={styles.chartHeader}>
        <div>
          <div className={styles.panelTitle}>{tr("Time Series")}</div>
          <div className={styles.chartCaption}>
            {mode === "buy_and_hold"
              ? t(
                  "simulator.chartCaption.timelineHold",
                  "Accumulate & Hold tracked against FD, savings, and invested principal across the selected history window."
                )
              : t(
                  "simulator.chartCaption.timelineExit",
                  "Dip Buy + 1.25% Exit tracked against FD, savings, and invested principal across the selected history window."
                )}
          </div>
        </div>
      </div>
      <EChartSurface ariaLabel="Simulation time series chart" className={styles.chartSurfaceTall} option={option} />
    </div>
  );
}

function DrawdownChart({
  points,
  savingsTimeline
}: {
  points: AnalyticsSimulatorTimelinePoint[];
  savingsTimeline: SavingsTimelinePoint[];
}) {
  const { tr } = useI18n();
  const option = useMemo(() => buildDrawdownChartOption(points, savingsTimeline), [points, savingsTimeline]);

  return (
    <div className={styles.chartPanel}>
      <div className={styles.chartHeader}>
        <div>
          <div className={styles.panelTitle}>{tr("Underwater view")}</div>
          <div className={styles.chartCaption}>
            {tr("Peak-to-current drawdown. This answers how deep the strategy sat below its own prior high while it was working.")}
          </div>
        </div>
      </div>
      <EChartSurface ariaLabel="Simulation drawdown chart" className={styles.chartSurface} option={option} />
    </div>
  );
}

function ChargePanel({ breakdown, title }: { breakdown: AnalyticsSimulatorChargeBreakdown; title: string }) {
  const { tr } = useI18n();
  const rows = [
    ["Brokerage", breakdown.brokerage],
    ["STT", breakdown.stt],
    ["Txn", breakdown.transaction_charges],
    ["SEBI", breakdown.sebi_charges],
    ["GST", breakdown.gst],
    ["Stamp", breakdown.stamp_duty],
    ["DP", breakdown.dp_charges],
    ["Total", breakdown.total]
  ] as const;

  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>{tr(title)}</h2>
      <div className={styles.statList}>
        {rows.map(([label, value]) => (
          <div key={label} className={styles.statRow}>
            <span>{tr(label)}</span>
            <strong>{fmtCurrency(value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildSimulatorCoachCards({
  displayName,
  mode,
  capitalLabel,
  activeScenario,
  fdRatePct,
  savingsRatePct,
  savingsValue,
  t
}: {
  displayName: string;
  mode: StrategyMode;
  capitalLabel: string;
  activeScenario: AnalyticsSimulatorScenarioResult;
  fdRatePct: number;
  savingsRatePct: number;
  savingsValue: number;
  t: TranslateText;
}): SimulatorCoachCard[] {
  const closeRate = activeScenario.executed_buys > 0 ? activeScenario.closed_lots / activeScenario.executed_buys : 0;
  const openRatio = activeScenario.executed_buys > 0 ? activeScenario.open_lots / activeScenario.executed_buys : 0;
  const beatFd = activeScenario.net_strategy_value >= activeScenario.fd_value;
  const beatSavings = activeScenario.net_strategy_value >= savingsValue;

  let riskTitle = t("simulator.coach.riskTitleMeasured", "Measured inventory risk");
  let riskBody = t(
    "simulator.coach.riskBodyMeasured",
    "Only {{closeRate}}% of entries are fully closed, which leaves part of the plan exposed to the next leg of market movement.",
    { closeRate: Math.round(closeRate * 100) }
  );
  let riskTone: SimulatorCoachCard["tone"] = "white";

  if (activeScenario.net_return_pct < 0 || openRatio > 0.55) {
    riskTitle = t("simulator.coach.riskTitleHigh", "High holding risk");
    riskBody = t(
      "simulator.coach.riskBodyHigh",
      "A large share of the dip buys is still open, so the outcome depends heavily on what {{displayName}} does next rather than on realised exits.",
      { displayName }
    );
    riskTone = "red";
  } else if (closeRate >= 0.6 && activeScenario.net_return_pct > 0) {
    riskTitle = t("simulator.coach.riskTitleControlled", "Reversion risk stayed controlled");
    riskBody = t(
      "simulator.coach.riskBodyControlled",
      "More than half of the dip entries reached a realised outcome, which means the setup did not depend only on mark-to-market recovery."
    );
    riskTone = "green";
  }

  let lessonTitle = t("simulator.coach.lessonTitle", "What this teaches");
  let lessonBody = beatFd
    ? t(
        "simulator.coach.lessonBodyBeatFd",
        "This scenario beat a {{fdRatePct}}% FD benchmark, so the repeated dip entries created more value than passive cash carry over the same dates.",
        { fdRatePct }
      )
    : t(
        "simulator.coach.lessonBodyLagFd",
        "This scenario lagged a {{fdRatePct}}% FD benchmark, which means the stock did not recover fast enough after the 1% down-day entries to justify the extra market risk.",
        { fdRatePct }
      );
  let lessonTone: SimulatorCoachCard["tone"] = beatFd ? "green" : "red";

  if (!beatSavings) {
    lessonBody += t(
      "simulator.coach.lessonBodySavingsLag",
      " It also fell behind the {{savingsRatePct}}% savings benchmark, so even low-friction cash would have preserved value better in this window.",
      { savingsRatePct }
    );
  } else if (!beatFd && beatSavings) {
    lessonBody += t(
      "simulator.coach.lessonBodySavingsBeatOnly",
      " It still beat the {{savingsRatePct}}% savings benchmark, so the edge exists, but not enough to clear the stronger cash benchmark.",
      { savingsRatePct }
    );
  }

  let setupTitle =
    mode === "buy_and_hold"
      ? t("simulator.coach.setupTitleHold", "Why the accumulate-and-hold version can work")
      : t("simulator.coach.setupTitleExit", "Why the dip-buy-and-exit version can work");
  let setupBody =
    mode === "buy_and_hold"
      ? t(
          "simulator.coach.setupBodyHold",
          "Each 1% down close adds another ₹1 lakh-style layer into weakness, so the edge comes from averaging entries and letting later recovery reprice the stack."
        )
      : t(
          "simulator.coach.setupBodyExit",
          "Each 1% down close creates an entry, but the plan only books profits once price stretches 1.25% above that entry, so realised returns depend on follow-through, not only on recovery."
        );
  let setupTone: SimulatorCoachCard["tone"] = "white";

  if (activeScenario.skipped_triggers > 0 && capitalLabel !== "Infinite") {
    setupBody += t(
      "simulator.coach.setupBodyCapitalExhausted",
      " In the {{capitalLabel}} run, {{skippedTriggers}} trigger(s) were skipped once capital was exhausted, so this is also a capital-efficiency test.",
      {
        capitalLabel,
        skippedTriggers: formatNumber(activeScenario.skipped_triggers, { maximumFractionDigits: 0 })
      }
    );
  }
  if (mode === "buy_on_dip_sell_on_target" && closeRate < 0.35) {
    setupTitle = t("simulator.coach.setupTitleLikelyMistake", "Likely mistake: target was harder than it looked");
    setupBody = t(
      "simulator.coach.setupBodyLikelyMistake",
      "Most dip buys never reached the 1.25% exit, so the rule spent more time holding inventory than realising quick mean-reversion gains. A tighter target or stronger trend filter would be more realistic."
    );
    setupTone = "red";
  } else if (mode === "buy_and_hold" && activeScenario.net_return_pct > activeScenario.fd_return_pct) {
    setupTone = "green";
  }

  return [
    {
      eyebrow: "Trade logic",
      title: setupTitle,
      body: t(
        "simulator.coach.currentRun",
        "{{setupBody}} Current run: {{executedBuys}} executed buy(s), {{triggerDays}} total trigger day(s).",
        {
          setupBody,
          executedBuys: formatNumber(activeScenario.executed_buys, { maximumFractionDigits: 0 }),
          triggerDays: formatNumber(activeScenario.trigger_count, { maximumFractionDigits: 0 })
        }
      ),
      tone: setupTone
    },
    {
      eyebrow: "Risk level",
      title: riskTitle,
      body: riskBody,
      tone: riskTone
    },
    {
      eyebrow: "Benchmark lesson",
      title: lessonTitle,
      body: lessonBody,
      tone: lessonTone
    }
  ];
}

export function AnalyticsSimulatorPage() {
  const { t, tr } = useI18n();
  const { authReady } = useAuthGate();
  const { mode: experienceMode } = useAnalyticsExperienceMode();
  const universeQuery = useAnalyticsSimulatorUniverse(authReady);
  const [form, setForm] = useState(DEFAULT_QUERY);
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [mode, setMode] = useState<StrategyMode>("buy_and_hold");
  const [selectedCapital, setSelectedCapital] = useState<string | null>(null);
  const [savingsRatePct, setSavingsRatePct] = useState(DEFAULT_SAVINGS_RATE_PCT);
  const viewedResultKeyRef = useRef<string | null>(null);
  const simulatorQuery = useAnalyticsSimulator(query, authReady);
  usePageLoadProfile({
    pageName: "analytics_simulator",
    enabled: authReady,
    queries: [
      { name: "analytics-simulator-universe", isLoading: universeQuery.isLoading, isError: !!universeQuery.error },
      {
        name: `analytics-simulator:${query.symbol}:${query.instrumentType}`,
        isLoading: simulatorQuery.isLoading,
        isError: !!simulatorQuery.error
      }
    ],
    extra: { symbol: query.symbol, instrument_type: query.instrumentType }
  });

  const items = useMemo(() => {
    const sourceItems = universeQuery.data?.items?.length ? universeQuery.data.items : PRELOADED_UNIVERSE;
    return [...sourceItems].sort((left, right) => {
      if (left.instrument_type !== right.instrument_type) {
        return left.instrument_type === "index" ? -1 : 1;
      }
      return left.symbol.localeCompare(right.symbol);
    });
  }, [universeQuery.data?.items]);
  const simulator = simulatorQuery.data ?? null;
  const selectedUniverseItem = useMemo(() => normalizeUniverseItem(items, form.symbol), [items, form.symbol]);
  const indexItems = useMemo(() => items.filter((item) => item.instrument_type === "index"), [items]);
  const equityItems = useMemo(() => items.filter((item) => item.instrument_type === "equity"), [items]);

  useEffect(() => {
    if (!items.length) return;
    if (selectedUniverseItem) return;
    setForm((prev: AnalyticsSimulatorQuery) => ({
      ...prev,
      symbol: items[0].symbol,
      instrumentType: items[0].instrument_type
    }));
  }, [items, selectedUniverseItem]);

  useEffect(() => {
    if (!simulator?.capital_scenarios.length) return;
    const labels = simulator.capital_scenarios.map((item) => item.capital_label);
    setSelectedCapital((prev: string | null) => (prev && labels.includes(prev) ? prev : labels[0]));
  }, [simulator]);

  const activeCapital = useMemo(
    () => simulator?.capital_scenarios.find((item) => item.capital_label === selectedCapital) ?? simulator?.capital_scenarios[0],
    [selectedCapital, simulator]
  );

  const activeScenario = resolveScenario(activeCapital, mode);

  useEffect(() => {
    if (!simulator || !activeCapital || !activeScenario) return;
    const resultKey = [
      simulator.as_of,
      simulator.symbol,
      simulator.instrument_type,
      activeCapital.capital_label,
      mode,
      query.lookbackDays
    ].join("|");
    if (viewedResultKeyRef.current === resultKey) return;
    viewedResultKeyRef.current = resultKey;
    void trackAnalyticsEvent("simulation_result_view", {
      simulation_type: mode,
      strategy_name: strategyLabel(mode),
      instrument: simulator.symbol,
      timeframe: `${query.lookbackDays}d`,
      capital_mode: activeCapital.capital_label
    });
  }, [activeCapital, activeScenario, mode, query.lookbackDays, simulator]);
  const activeSavingsTimeline = useMemo(() => {
    if (!activeScenario) return [] as SavingsTimelinePoint[];
    return buildRateTimeline(activeScenario.timeline, activeScenario.trades, savingsRatePct);
  }, [activeScenario, savingsRatePct]);

  const activeSavingsStats = useMemo(() => {
    if (!activeScenario) return null;
    const savingsValue = activeSavingsTimeline.at(-1)?.value ?? 0;
    const investedPrincipal = activeScenario.invested_principal;
    const savingsProfit = round2(savingsValue - investedPrincipal);
    return {
      value: savingsValue,
      profit: savingsProfit,
      returnPct: investedPrincipal > 0 ? round2(((savingsValue / investedPrincipal) - 1) * 100) : 0,
      deltaVsStrategy: round2(activeScenario.net_strategy_value - savingsValue)
    };
  }, [activeScenario, activeSavingsTimeline]);
  const scenarioSelectorRef = useRef<HTMLElement | null>(null);
  const toleranceRef = useRef<HTMLElement | null>(null);
  const comparisonRef = useRef<HTMLElement | null>(null);
  const timelineRef = useRef<HTMLElement | null>(null);
  const chargesRef = useRef<HTMLElement | null>(null);
  const sectionRefs = useMemo(
    () => ({
      scenario_selector: scenarioSelectorRef,
      tolerance_summary: toleranceRef,
      benchmark_comparison: comparisonRef,
      timeline_review: timelineRef,
      charges_and_ledger: chargesRef
    }),
    []
  );
  const engagementExtrasRef = useRef<AnalyticsParams>({});
  const simulatorAnalyticsContext = useMemo(
    () => ({
      page_name: "simulator",
      page_family: "learning",
      section: "simulator",
      page_path: "/analytics/simulator",
      simulation_type: mode,
      strategy_name: strategyLabel(mode),
      instrument: simulator?.symbol ?? query.symbol,
      timeframe: `${query.lookbackDays}d`,
      capital_mode: activeCapital?.capital_label ?? selectedCapital ?? "active"
    }),
    [activeCapital?.capital_label, mode, query.lookbackDays, query.symbol, selectedCapital, simulator?.symbol]
  );

  useWorkspaceSectionViews(sectionRefs, simulatorAnalyticsContext, "simulator_section_view", authReady && !!simulator && !!activeScenario);
  useWorkspaceEngagement(simulatorAnalyticsContext, "simulator_page_engagement", authReady && !!simulator && !!activeScenario, {
    extraParams: engagementExtrasRef
  });

  const trackSimulatorInputChange = (fieldName: string, fieldValue: string | number | boolean) => {
    void trackAnalyticsEvent("simulator_input_change", {
      ...simulatorAnalyticsContext,
      field_name: fieldName,
      field_value: typeof fieldValue === "boolean" ? String(fieldValue) : fieldValue
    });
  };

  const comparisonRows = useMemo(
    () =>
      (simulator?.capital_scenarios ?? []).map((scenario) => {
        const current = resolveScenario(scenario, mode);
        const investedPrincipal = current?.invested_principal ?? 0;
        const savingsValue = round2(
          (current?.trades ?? []).reduce(
            (total, trade) =>
              total +
              compoundValue(
                trade.principal,
                trade.buy_date,
                simulator?.window.end_date ?? trade.buy_date,
                savingsRatePct
              ),
            0
          )
        );

        return {
          label: scenario.capital_label,
          investedPrincipal,
          cashOutflow: current?.cash_outflow ?? 0,
          strategy: current?.net_strategy_value ?? 0,
          strategyReturnPct: current?.net_return_pct ?? 0,
          fd: current?.fd_value ?? 0,
          fdReturnPct: current?.fd_return_pct ?? 0,
          savings: savingsValue,
          savingsReturnPct: investedPrincipal > 0 ? round2(((savingsValue / investedPrincipal) - 1) * 100) : 0
        };
      }),
    [mode, savingsRatePct, simulator]
  );

  const summaryCards = useMemo(() => {
    if (!activeScenario) return [];
    return [
      ["Invested", fmtCurrency(activeScenario.invested_principal), "white"],
      ["Current value", fmtCurrency(activeScenario.net_strategy_value), toneFromNumber(activeScenario.net_profit)],
      ["Net P&L", fmtSignedCurrency(activeScenario.net_profit), toneFromNumber(activeScenario.net_profit)],
      ["FD delta", fmtSignedCurrency(activeScenario.fd_delta_vs_strategy), toneFromNumber(activeScenario.fd_delta_vs_strategy)],
      ["Risk level", activeScenario.open_lots > activeScenario.closed_lots ? "Elevated" : "Measured", activeScenario.open_lots > activeScenario.closed_lots ? "red" : "white"],
      ["Open positions", formatNumber(activeScenario.open_lots, { maximumFractionDigits: 0 }), "white"]
    ] as Array<[string, string, string]>;
  }, [activeScenario]);

  const simulatorCoachCards = useMemo(() => {
    if (!activeScenario || !simulator) return [] as SimulatorCoachCard[];
    return buildSimulatorCoachCards({
      displayName: simulator.display_name,
      mode,
      capitalLabel: activeCapital?.capital_label ?? "Active",
      activeScenario,
      fdRatePct: simulator.assumptions.fd_rate_pct,
      savingsRatePct,
      savingsValue: activeSavingsStats?.value ?? 0,
      t
    });
  }, [activeCapital?.capital_label, activeScenario, activeSavingsStats?.value, mode, savingsRatePct, simulator, t]);

  if (!authReady) {
    return <div className={styles.state}>{tr("Loading simulator…")}</div>;
  }

  if (simulatorQuery.error) {
    return <div className={styles.state}>{tr("Failed to load simulator.")}</div>;
  }

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title={tr("Simulator")}
        subtitle={
          experienceMode === "beginner"
            ? tr("Test one-year dip-buy ideas, compare them with FD and savings carry, and learn what the strategy is actually asking you to tolerate.")
            : tr("Model dip-buy allocation, compare it with FD carry, and inspect charges lot by lot.")
        }
        learningPrompt={
          experienceMode === "beginner"
            ? tr("Start with NIFTY 50 or a large-cap stock, keep the one-year window, then compare strategy value against FD and savings carry before trusting the trade idea.")
            : tr("This simulator uses one year of day-wise data. Dips are triggered from close-to-previous-close returns, and target exits are validated using the later daily high.")
        }
      />

      <section ref={scenarioSelectorRef} data-analytics-section="scenario_selector" className={styles.panel}>
        <div className={styles.panelTitle}>{tr("Scenario selector")}</div>
        <form
          className={styles.controlGrid}
          onSubmit={(event) => {
            event.preventDefault();
            const nextQuery = {
              ...form,
              instrumentType: selectedUniverseItem?.instrument_type ?? form.instrumentType
            };
            void trackAnalyticsEvent("run_simulation", {
              simulation_type: mode,
              strategy_name: strategyLabel(mode),
              instrument: nextQuery.symbol,
              timeframe: `${nextQuery.lookbackDays}d`,
              capital_mode: selectedCapital ?? "active"
            });
            setQuery(nextQuery);
          }}
        >
          <label className={styles.field}>
            <span>{tr("Symbol / Index")}</span>
            <select
              className={styles.input}
              value={form.symbol}
              onChange={(event) => {
                const matched = normalizeUniverseItem(items, event.target.value);
                trackSimulatorInputChange("symbol", matched?.symbol ?? event.target.value);
                setForm((prev: AnalyticsSimulatorQuery) => ({
                  ...prev,
                  symbol: matched?.symbol ?? event.target.value,
                  instrumentType: matched?.instrument_type ?? prev.instrumentType
                }));
              }}
            >
              {indexItems.length ? (
                <optgroup label={tr("Indices")}>
                  {indexItems.map((item) => (
                    <option key={`${item.instrument_type}-${item.symbol}`} value={item.symbol}>
                      {item.symbol} · {item.display_name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {equityItems.length ? (
                <optgroup label={tr("Stocks")}>
                  {equityItems.map((item) => (
                    <option key={`${item.instrument_type}-${item.symbol}`} value={item.symbol}>
                      {item.symbol} · {item.display_name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>

          <label className={styles.field}>
            <span>{tr("Lot amount")}</span>
            <input className={styles.input} type="number" min="1000" step="1000" value={form.lotAmount} onChange={(event) => setForm((prev: AnalyticsSimulatorQuery) => ({ ...prev, lotAmount: Number(event.target.value) }))} onBlur={(event) => trackSimulatorInputChange("lot_amount", Number(event.target.value))} />
          </label>

          <label className={styles.field}>
            <span>{tr("Dip trigger %")}</span>
            <input className={styles.input} type="number" min="0.1" max="25" step="0.05" value={form.dipPct} onChange={(event) => setForm((prev: AnalyticsSimulatorQuery) => ({ ...prev, dipPct: Number(event.target.value) }))} onBlur={(event) => trackSimulatorInputChange("dip_trigger_pct", Number(event.target.value))} />
          </label>

          <label className={styles.field}>
            <span>{tr("Target exit %")}</span>
            <input className={styles.input} type="number" min="0.1" max="50" step="0.05" value={form.targetPct} onChange={(event) => setForm((prev: AnalyticsSimulatorQuery) => ({ ...prev, targetPct: Number(event.target.value) }))} onBlur={(event) => trackSimulatorInputChange("target_exit_pct", Number(event.target.value))} />
          </label>

          <label className={styles.field}>
            <span>{tr("FD rate %")}</span>
            <input className={styles.input} type="number" min="0" max="25" step="0.1" value={form.fdRatePct} onChange={(event) => setForm((prev: AnalyticsSimulatorQuery) => ({ ...prev, fdRatePct: Number(event.target.value) }))} onBlur={(event) => trackSimulatorInputChange("fd_rate_pct", Number(event.target.value))} />
          </label>

          <label className={styles.field}>
            <span>{tr("Savings rate %")}</span>
            <input className={styles.input} type="number" min="0" max="25" step="0.1" value={savingsRatePct} onChange={(event) => setSavingsRatePct(Number(event.target.value))} onBlur={(event) => trackSimulatorInputChange("savings_rate_pct", Number(event.target.value))} />
          </label>

          <label className={styles.field}>
            <span>{tr("Window")}</span>
            <input className={styles.input} value={tr("1 year (365 days)")} disabled />
          </label>

          <label className={styles.field}>
            <span>{tr("Capital caps")}</span>
            <input className={styles.input} value={form.capitalCaps} onChange={(event) => setForm((prev: AnalyticsSimulatorQuery) => ({ ...prev, capitalCaps: event.target.value }))} onBlur={(event) => trackSimulatorInputChange("capital_caps_count", event.target.value.split(",").map((part) => part.trim()).filter(Boolean).length)} />
          </label>

          <label className={styles.checkboxField}>
            <input type="checkbox" checked={form.includeInfinite} onChange={(event) => { trackSimulatorInputChange("include_infinite", event.target.checked); setForm((prev: AnalyticsSimulatorQuery) => ({ ...prev, includeInfinite: event.target.checked })); }} />
            <span>{tr("Include infinite-money reference")}</span>
          </label>

          <button type="submit" className={styles.primaryButton}>{tr("Load scenario")}</button>
        </form>
      </section>

      {!simulator || !activeScenario ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{tr("Preloading 1Y Baseline")}</h2>
          <p className={styles.sectionIntro}>
            {tr("Preparing the one-year baseline view. Use the selector above to switch scenarios; each view uses the same one-year window for quick comparison.")}
          </p>
        </section>
      ) : (
        <>
          <section ref={toleranceRef} data-analytics-section="tolerance_summary" className={styles.panel}>
            <h2 className={styles.panelTitle}>{tr("What this scenario is asking you to tolerate")}</h2>
            <p className={styles.sectionIntro}>
              {tr("Start with the six cards below, then compare the strategy line with FD and savings carry, and only then move into the lot ledger and charges model.")}
            </p>
          </section>

          <section className={styles.metricGrid}>
            {summaryCards.map(([label, value, tone]) => (
              <div key={label} className={styles.metricCard}>
                <div className={styles.metricLabel}>{tr(label)}</div>
                <div className={styles.metricValue} data-tone={tone}>{value}</div>
                <div className={styles.metricHint}>{simulator.display_name} • {activeCapital?.capital_label ?? "—"} • {tr(strategyLabel(mode))}</div>
              </div>
            ))}
          </section>

          <section className={styles.toggleRow}>
            <div className={styles.toggleGroup}>
              <button
                type="button"
                className={styles.routeLink}
                data-active={mode === "buy_and_hold" ? "true" : "false"}
                onClick={() => {
                  void trackFilterChanged({
                    filter_name: "strategy_variant",
                    filter_value: "buy_and_hold",
                    page_name: "simulator"
                  });
                  setMode("buy_and_hold");
                }}
              >
                {tr("Accumulate & Hold")}
              </button>
              <button
                type="button"
                className={styles.routeLink}
                data-active={mode === "buy_on_dip_sell_on_target" ? "true" : "false"}
                onClick={() => {
                  void trackFilterChanged({
                    filter_name: "strategy_variant",
                    filter_value: "buy_on_dip_sell_on_target",
                    page_name: "simulator"
                  });
                  setMode("buy_on_dip_sell_on_target");
                }}
              >
                {tr("Dip Buy + Exit")}
              </button>
            </div>
            <div className={styles.toggleGroup}>
              {simulator.capital_scenarios.map((scenario) => (
                <button
                  key={scenario.capital_label}
                  type="button"
                  className={styles.routeLink}
                  data-active={activeCapital?.capital_label === scenario.capital_label ? "true" : "false"}
                  onClick={() => {
                    void trackFilterChanged({
                      filter_name: "capital_bucket",
                      filter_value: scenario.capital_label,
                      page_name: "simulator"
                    });
                    setSelectedCapital(scenario.capital_label);
                  }}
                >
                  {scenario.capital_label}
                </button>
              ))}
            </div>
          </section>

          <section className={styles.coachGrid}>
            {simulatorCoachCards.map((card) => (
              <article key={`${card.eyebrow}-${card.title}`} className={styles.coachCard} data-tone={card.tone}>
                <div className={styles.coachEyebrow}>{tr(card.eyebrow)}</div>
                <h2 className={styles.coachTitle}>{tr(card.title)}</h2>
                <p className={styles.coachText}>{tr(card.body)}</p>
              </article>
            ))}
          </section>

          <section className={styles.explainGrid}>
            <ExplainThis
              label={tr("Dip trigger")}
              summary={t("simulator.dipTriggerSummary", "A buy is triggered when the selected stock or index closes at least 1% below the previous close.")}
              detail={t("simulator.dipTriggerDetail", "This is a day-wise trigger, not an intraday trigger. In other words, the simulator reacts to completed down days in the one-year history window.")}
              takeaway={t("simulator.dipTriggerTakeaway", "This setup studies whether repeated buying into weakness was rewarded later, not whether intraday entries were perfect.")}
            />
            <ExplainThis
              label={tr("FD and savings benchmark")}
              summary={t("simulator.fdBenchmarkSummary", "Every time the strategy deploys capital, the same principal is also compounded forward as if it had gone into an FD or savings account instead.")}
              detail={t("simulator.fdBenchmarkDetail", "That keeps the timing identical. You are comparing what the same money did in the market versus what it would have done in lower-risk cash alternatives.")}
              takeaway={t(
                "simulator.fdBenchmarkTakeaway",
                "If the stock plan cannot beat {{fdRate}}% FD carry or even {{savingsRate}}% savings carry, the extra market risk is hard to justify.",
                {
                  fdRate: simulator.assumptions.fd_rate_pct,
                  savingsRate: savingsRatePct
                }
              )}
            />
            <ExplainThis
              label={tr("Delivery charges")}
              summary={t("simulator.deliveryChargesSummary", "Equity runs include delivery-side taxes and charges such as STT, transaction charges, GST, stamp duty, and DP charges on sell orders.")}
              detail={t("simulator.deliveryChargesDetail", "Index runs skip those delivery equity charges because there is no direct cash-delivery stock transfer in that case.")}
              takeaway={t("simulator.deliveryChargesTakeaway", "Charges matter most when the strategy trades many small lots. A rule can look attractive before costs and fail after costs.")}
            />
          </section>

          <section ref={comparisonRef} data-analytics-section="benchmark_comparison" className={styles.grid2}>
            <ComparisonBarChart rows={comparisonRows} mode={mode} />
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>{tr("Current state today")}</h2>
              <div className={styles.statList}>
                <div className={styles.statRow}><span>{tr("Benchmark verdict")}</span><strong>{activeScenario.net_strategy_value >= activeScenario.fd_value ? tr("Beating FD") : tr("Lagging FD")}</strong></div>
                <div className={styles.statRow}><span>{tr("Vs savings")}</span><strong>{fmtSignedCurrency(activeSavingsStats?.deltaVsStrategy)}</strong></div>
                <div className={styles.statRow}><span>{tr("Cash remaining")}</span><strong>{fmtCurrency(activeScenario.cash_remaining)}</strong></div>
                <div className={styles.statRow}><span>{tr("Skipped triggers")}</span><strong>{formatNumber(activeScenario.skipped_triggers, { maximumFractionDigits: 0 })}</strong></div>
                <div className={styles.statRow}><span>{tr("Open lots")}</span><strong>{formatNumber(activeScenario.open_lots, { maximumFractionDigits: 0 })}</strong></div>
                <div className={styles.statRow}><span>{tr("Closed lots")}</span><strong>{formatNumber(activeScenario.closed_lots, { maximumFractionDigits: 0 })}</strong></div>
              </div>
              <p className={styles.sectionIntro}>
                {tr("Read this panel before the ledger. It tells you whether the strategy is winning because it realised gains cleanly, or because it is still carrying inventory risk into today.")}
              </p>
              <h2 className={styles.panelTitle}>{tr("Window & Assumptions")}</h2>
              <div className={styles.statList}>
                <div className={styles.statRow}><span>{tr("Window")}</span><strong>{simulator.window.start_date} → {simulator.window.end_date}</strong></div>
                <div className={styles.statRow}><span>{tr("Trading days")}</span><strong>{formatNumber(simulator.window.trading_days, { maximumFractionDigits: 0 })}</strong></div>
                <div className={styles.statRow}><span>{tr("Latest close")}</span><strong>{fmtPrice(simulator.latest_close)}</strong></div>
                <div className={styles.statRow}><span>{tr("Dip rule")}</span><strong>{simulator.assumptions.dip_pct}% {tr("down day")}</strong></div>
                <div className={styles.statRow}><span>{tr("Exit rule")}</span><strong>{simulator.assumptions.target_pct}% {tr("above entry")}</strong></div>
                <div className={styles.statRow}><span>{tr("FD benchmark")}</span><strong>{simulator.assumptions.fd_rate_pct}% {tr("annual")}</strong></div>
                <div className={styles.statRow}><span>{tr("Savings benchmark")}</span><strong>{savingsRatePct}% {tr("annual")}</strong></div>
              </div>
              <p className={styles.sectionIntro}>{tr(simulator.assumptions.trigger_logic)}</p>
              <p className={styles.sectionIntro}>{tr(simulator.assumptions.exit_logic)}</p>
              {simulator.instrument_type === "index" ? <p className={styles.sectionIntro}>{tr(simulator.assumptions.index_note)}</p> : null}
            </div>
          </section>

          <section ref={timelineRef} data-analytics-section="timeline_review" className={styles.grid2}>
            <TimelineChart points={activeScenario.timeline} savingsTimeline={activeSavingsTimeline} mode={mode} />
            <DrawdownChart points={activeScenario.timeline} savingsTimeline={activeSavingsTimeline} />
          </section>

          <section className={styles.grid3}>
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>{tr("Scenario summary")}</h2>
              <div className={styles.statList}>
                <div className={styles.statRow}><span>{tr("Cash outflow")}</span><strong>{fmtCurrency(activeScenario.cash_outflow)}</strong></div>
                <div className={styles.statRow}><span>{tr("Net return")}</span><strong>{fmtPct(activeScenario.net_return_pct)}</strong></div>
                <div className={styles.statRow}><span>{tr("FD return")}</span><strong>{fmtPct(activeScenario.fd_return_pct)}</strong></div>
                <div className={styles.statRow}><span>{tr("Savings value")}</span><strong>{fmtCurrency(activeSavingsStats?.value)}</strong></div>
                <div className={styles.statRow}><span>{tr("Savings return")}</span><strong>{fmtPct(activeSavingsStats?.returnPct ?? Number.NaN)}</strong></div>
                <div className={styles.statRow}><span>{tr("Open lots")}</span><strong>{formatNumber(activeScenario.open_lots, { maximumFractionDigits: 0 })}</strong></div>
                <div className={styles.statRow}><span>{tr("Closed lots")}</span><strong>{formatNumber(activeScenario.closed_lots, { maximumFractionDigits: 0 })}</strong></div>
                <div className={styles.statRow}><span>{tr("Skipped triggers")}</span><strong>{formatNumber(activeScenario.skipped_triggers, { maximumFractionDigits: 0 })}</strong></div>
                <div className={styles.statRow}><span>{tr("Cash remaining")}</span><strong>{fmtCurrency(activeScenario.cash_remaining)}</strong></div>
              </div>
            </div>

            <ChargePanel breakdown={activeScenario.charges_paid} title="Charges Paid" />
            <ChargePanel breakdown={activeScenario.estimated_exit_charges_today} title="Estimated Exit Charges Today" />
          </section>

          <details className={styles.explainBox} open={experienceMode === "advanced"} onToggle={(event) => {
            const open = (event.currentTarget as HTMLDetailsElement).open;
            engagementExtrasRef.current = { lot_ledger_opened: open || engagementExtrasRef.current.lot_ledger_opened === true };
            if (open) {
              void trackAnalyticsEvent("simulator_detail_expand", {
                ...simulatorAnalyticsContext,
                detail_name: "lot_ledger"
              });
            }
          }}>
            <summary className={styles.explainSummary}>{tr("Lot ledger")}</summary>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{tr("Lot")}</th>
                    <th>{tr("Buy Date")}</th>
                    <th>{tr("Entry")}</th>
                    <th>{tr("Qty")}</th>
                    <th>{tr("Invested")}</th>
                    <th>{tr("Sell Date")}</th>
                    <th>{tr("Sell")}</th>
                    <th>{tr("Net P&L")}</th>
                    <th>{tr("Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeScenario.trades.map((trade) => (
                    <tr key={`${trade.lot_id}-${trade.buy_date}-${trade.status}`}>
                      <td>{trade.lot_id}</td>
                      <td>{trade.buy_date}</td>
                      <td>{fmtPrice(trade.entry_price)}</td>
                      <td>{formatNumber(trade.quantity, { maximumFractionDigits: trade.quantity < 1 ? 4 : 0 })}</td>
                      <td>{fmtCurrency(trade.buy_outflow)}</td>
                      <td>{trade.sell_date ?? "—"}</td>
                      <td>{trade.sell_price == null ? "—" : fmtPrice(trade.sell_price)}</td>
                      <td className={styles.value} data-tone={toneFromNumber(trade.net_pnl)}>{trade.net_pnl == null ? "—" : fmtSignedCurrency(trade.net_pnl)}</td>
                      <td>{trade.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <section ref={chargesRef} data-analytics-section="charges_and_ledger" className={styles.grid2}>
            <details className={styles.explainBox} open={experienceMode === "advanced"} onToggle={(event) => {
              if ((event.currentTarget as HTMLDetailsElement).open) {
                void trackAnalyticsEvent("simulator_detail_expand", {
                  ...simulatorAnalyticsContext,
                  detail_name: "charges_model"
                });
              }
            }}>
              <summary className={styles.explainSummary}>{tr("Charges model")}</summary>
              <div className={styles.panel}>
              <h2 className={styles.panelTitle}>{tr("Charges model")}</h2>
              <div className={styles.statList}>
                <div className={styles.statRow}><span>{tr("Brokerage")}</span><strong>{t("simulator.deliveryEquityRate", "{{value}}% delivery equity", { value: simulator.charges_model.brokerage_delivery_equity })}</strong></div>
                <div className={styles.statRow}><span>{tr("STT")}</span><strong>{t("simulator.buyAndSellRate", "{{value}}% on buy and sell", { value: simulator.charges_model.stt_delivery_rate })}</strong></div>
                <div className={styles.statRow}><span>{tr("NSE txn")}</span><strong>{simulator.charges_model.transaction_charge_rate_nse_equity_cash}%</strong></div>
                <div className={styles.statRow}><span>{tr("SEBI")}</span><strong>{t("simulator.perCroreCharge", "₹{{value}} / crore", { value: simulator.charges_model.sebi_charge_per_crore })}</strong></div>
                <div className={styles.statRow}><span>{tr("GST")}</span><strong>{t("simulator.onChargesRate", "{{value}}% on charges", { value: simulator.charges_model.gst_rate })}</strong></div>
                <div className={styles.statRow}><span>{tr("Stamp duty")}</span><strong>{t("simulator.buySideRate", "{{value}}% buy-side", { value: simulator.charges_model.stamp_duty_buy_rate_delivery })}</strong></div>
                <div className={styles.statRow}><span>{tr("DP charge")}</span><strong>{t("simulator.perSellOrder", "{{value}} per sell order", { value: fmtCurrency(simulator.charges_model.dp_charge_sell_order_total) })}</strong></div>
              </div>
              </div>
            </details>

            <details className={styles.explainBox} open={experienceMode === "advanced"} onToggle={(event) => {
              if ((event.currentTarget as HTMLDetailsElement).open) {
                void trackAnalyticsEvent("simulator_detail_expand", {
                  ...simulatorAnalyticsContext,
                  detail_name: "trigger_footprint"
                });
              }
            }}>
              <summary className={styles.explainSummary}>{tr("Trigger footprint")}</summary>
              <div className={styles.panel}>
              <h2 className={styles.panelTitle}>{tr("Trigger footprint")}</h2>
              <div className={styles.pillRow}>
                {simulator.trigger_dates.slice(-24).map((day) => (
                  <span key={day} className={styles.pill}>{day}</span>
                ))}
              </div>
              <p className={styles.sectionIntro}>{tr("Recent dip triggers in the selected one-year window. The hold and exit scenarios both start from this same trigger stream.")}</p>
              </div>
            </details>
          </section>
        </>
      )}
    </div>
  );
}
