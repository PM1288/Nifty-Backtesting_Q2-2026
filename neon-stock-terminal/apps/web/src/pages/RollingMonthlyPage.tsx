import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { EChartsOption } from "echarts";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  ChevronDown,
  Download,
  ShieldAlert,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import {
  fetchRollingMonthlyDashboard,
  fetchRollingMonthlyWeeklyChart,
  absoluteMonthlyExportUrl,
  fetchAbsoluteMonthlyChart,
  fetchAbsoluteMonthlyDashboard,
  absoluteFirstSessionExportUrl,
  fetchAbsoluteFirstSessionChart,
  fetchAbsoluteFirstSessionDashboard,
  type AbsoluteFirstSessionChart,
  type AbsoluteFirstSessionDashboard,
  type AbsoluteMonthlyChart,
  type AbsoluteMonthlyDashboard,
  type RollingMonthlyDashboard,
  type RollingMonthlyWeeklyChart,
} from "../lib/api";
import { EChartSurface } from "../components/visual/EChartSurface";
import {
  CompactEmptyState,
  DecisionHero,
  ErrorState,
  ExecutiveKpiStrip,
  LoadingSkeleton,
  MetricTile,
  ModuleStatusStrip,
} from "../design-system/WorkspacePrimitives";
import styles from "./RollingMonthlyPage.module.css";
import { matchesStockProfile, type StockProfileFilters, useProfileIndex } from "../lib/stockProfiles";
import { StockDistribution, StockUniverseFilterBar } from "../components/stocks/StockProfileControls";
import {
  LearnAboutThisAnalysis,
  PageHeader,
  RelatedJourney,
  SourceFreshness,
} from "../components/navigation/StrategicPrimitives";
import { summarizeRollingMonthlyCohort } from "../lib/rollingMonthlyCohort";

function n(value: unknown, digits = 2) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "—";
}

function money(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(parsed)
    : "—";
}

function date(value: unknown) {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime())
    ? String(value).slice(0, 10)
    : new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(parsed);
}

function monthYear(value: unknown) {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime())
    ? String(value).slice(0, 7)
    : new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        month: "long",
        year: "numeric",
      }).format(parsed);
}

function label(value: unknown) {
  return String(value ?? "—")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function pct(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(2)}%` : "—";
}

const FIRST_SESSION_PERFORMANCE_THRESHOLDS = [1, 2, 3, 5, 10] as const;

function firstSessionRowStyle(row: Record<string, any>): CSSProperties {
  if (row.entry_status !== "ENTERED") {
    return {
      "--first-session-row-bg": "#eef2f6",
      "--first-session-row-accent": "#8996a8",
    } as CSSProperties;
  }
  const rawReturn = Number(row.end_return_pct);
  if (!Number.isFinite(rawReturn)) {
    return {
      "--first-session-row-bg": "#f2f4f7",
      "--first-session-row-accent": "#718096",
    } as CSSProperties;
  }
  const value = Math.max(-10, Math.min(10, rawReturn));
  if (value >= -1 && value <= 1) {
    return {
      "--first-session-row-bg": "#fff3bd",
      "--first-session-row-accent": "#a56600",
    } as CSSProperties;
  }
  if (value > 1) {
    const strength = (value - 1) / 9;
    return {
      "--first-session-row-bg": `hsl(${48 + 92 * strength} 68% ${94 - 10 * strength}%)`,
      "--first-session-row-accent": `hsl(${54 + 86 * strength} 68% ${42 - 6 * strength}%)`,
    } as CSSProperties;
  }
  const strength = (Math.abs(value) - 1) / 9;
  return {
    "--first-session-row-bg": `hsl(${45 - 42 * strength} 76% ${94 - 10 * strength}%)`,
    "--first-session-row-accent": `hsl(${38 - 35 * strength} 72% ${43 - 5 * strength}%)`,
  } as CSSProperties;
}

function components(candidate: Record<string, any>) {
  return Array.isArray(candidate.component_snapshot?.components)
    ? (candidate.component_snapshot.components as Array<Record<string, any>>)
    : [];
}

function metric(
  data: RollingMonthlyDashboard,
  side: string,
  band: string,
  key: string,
) {
  return data.referenceMetrics.find(
    (row) =>
      row.side === side && row.quality_band === band && row.metric_key === key,
  );
}

function weeklyChartOption(data: RollingMonthlyWeeklyChart): EChartsOption {
  const rows = data.bars;
  const dates = rows.map((row) => String(row.weekStart).slice(0, 10));
  const monthLines = dates.filter((value, index) => index === 0 || value.slice(0, 7) !== dates[index - 1]?.slice(0, 7));
  const eventWeek = (eventDate: string) => {
    const key = String(eventDate).slice(0, 10);
    return rows.find((row) => key >= String(row.firstSession).slice(0, 10) && key <= String(row.lastSession).slice(0, 10))?.weekStart;
  };
  const events = (data.qualificationEvents ?? []).map((event) => ({ ...event, signalWeek: eventWeek(event.signalDate), entryWeek: eventWeek(event.entryDate) }));
  const entryLines = events.filter((event) => event.entryWeek).map((event) => ({
    xAxis: String(event.entryWeek).slice(0, 10),
    lineStyle: { color: event.selected ? "#0f52ba" : "#2f75d6", type: "solid", width: event.selected ? 3 : 2 },
    label: { show: event.selected, formatter: "Selected entry", color: "#0f52ba", fontSize: 10 },
  }));
  const entryPoints = events.filter((event) => event.entryWeek && Number.isFinite(Number(event.entryPrice))).map((event) => ({
    value: [String(event.entryWeek).slice(0, 10), Number(event.entryPrice)],
    symbolSize: event.selected ? 19 : 14,
    itemStyle: { color: event.selected ? "#0b4da2" : "#2f75d6", borderColor: "#fff", borderWidth: 2 },
    label: { show: event.selected, position: "top", formatter: `${event.side} entry\n₹${Number(event.entryPrice).toFixed(2)}`, color: "#0f52ba", fontSize: 10, fontWeight: 700 },
    event,
  }));
  const signalPoints = events.filter((event) => event.signalWeek && Number.isFinite(Number(event.signalClose))).map((event) => ({
    value: [String(event.signalWeek).slice(0, 10), Number(event.signalClose)],
    symbolSize: event.selected ? 15 : 11,
    itemStyle: { color: "#6b52cb", borderColor: "#fff", borderWidth: 2 },
    label: { show: event.selected, position: "bottom", formatter: "Conditions met", color: "#51419c", fontSize: 10, fontWeight: 700 },
    event,
  }));
  return {
    animation: false,
    legend: { top: 2, data: ["Weekly OHLC", "Condition met", "Entry point", "Volume"] },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    grid: [{ left: 62, right: 24, top: 42, height: "62%" }, { left: 62, right: 24, top: "75%", height: "15%" }],
    xAxis: [
      { type: "category", data: dates, boundaryGap: true, axisLabel: { formatter: (value: string) => value.slice(5) } },
      { type: "category", gridIndex: 1, data: dates, boundaryGap: true, axisLabel: { show: false }, axisTick: { show: false } },
    ],
    yAxis: [
      { scale: true, splitLine: { lineStyle: { color: "#e6ebf2" } }, axisLabel: { formatter: (value: number) => `₹${value.toFixed(0)}` } },
      { gridIndex: 1, scale: true, splitNumber: 2, axisLabel: { formatter: (value: number) => value >= 1e6 ? `${(value / 1e6).toFixed(1)}m` : `${(value / 1e3).toFixed(0)}k` } },
    ],
    dataZoom: [{ type: "inside", xAxisIndex: [0, 1], start: 0, end: 100 }, { type: "slider", xAxisIndex: [0, 1], bottom: 2, height: 18 }],
    series: [
      {
        name: "Weekly OHLC", type: "candlestick", data: rows.map((row) => [Number(row.open), Number(row.close), Number(row.low), Number(row.high)]),
        itemStyle: { color: "#0b7a53", color0: "#c2384a", borderColor: "#0b7a53", borderColor0: "#c2384a" },
        markLine: {
          silent: true, symbol: "none",
          lineStyle: { color: "#6b52cb", type: "dashed", width: 1 },
          label: { show: true, formatter: ({ value }: any) => String(value).slice(0, 7), color: "#51419c", fontSize: 10 },
          data: [
            ...monthLines.map((value) => ({ xAxis: value, label: { show: false } })),
            ...entryLines,
          ] as any,
        },
      },
      { name: "Condition met", type: "scatter", data: signalPoints as any, symbol: "circle", z: 8 },
      { name: "Entry point", type: "scatter", data: entryPoints as any, symbol: "diamond", z: 10 },
      { name: "Volume", type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: rows.map((row) => Number(row.volume)), itemStyle: { color: "#7c8fb8" } },
    ],
  };
}

function absoluteMonthlyChartOption(data: AbsoluteMonthlyChart): EChartsOption {
  const rows = data.bars;
  const dates = rows.map((row) => String(row.trade_date).slice(0, 10));
  const monthStarts = dates.filter((value, index) => index === 0 || value.slice(0, 7) !== dates[index - 1]?.slice(0, 7));
  const entryDate = String(data.candidate.entry_date).slice(0, 10);
  const entryPrice = Number(data.candidate.entry_price);
  return {
    animation: false,
    legend: { top: 2, data: ["Daily OHLC", "Absolute-month entry", "Volume"] },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    grid: [{ left: 64, right: 24, top: 42, height: "62%" }, { left: 64, right: 24, top: "75%", height: "15%" }],
    xAxis: [
      { type: "category", data: dates, boundaryGap: true, axisLabel: { formatter: (value: string) => value.slice(5) } },
      { type: "category", gridIndex: 1, data: dates, boundaryGap: true, axisLabel: { show: false }, axisTick: { show: false } },
    ],
    yAxis: [
      { scale: true, splitLine: { lineStyle: { color: "#e6ebf2" } }, axisLabel: { formatter: (value: number) => `₹${value.toFixed(0)}` } },
      { gridIndex: 1, scale: true, splitNumber: 2 },
    ],
    dataZoom: [{ type: "inside", xAxisIndex: [0, 1], start: 0, end: 100 }, { type: "slider", xAxisIndex: [0, 1], bottom: 2, height: 18 }],
    series: [
      {
        name: "Daily OHLC", type: "candlestick",
        data: rows.map((row) => [Number(row.open), Number(row.close), Number(row.low), Number(row.high)]),
        itemStyle: { color: "#0b7a53", color0: "#c2384a", borderColor: "#0b7a53", borderColor0: "#c2384a" },
        markLine: { silent: true, symbol: "none", data: [
          ...monthStarts.map((value) => ({ xAxis: value, lineStyle: { color: "#6b52cb", type: "dashed", width: 1 }, label: { show: true, formatter: value.slice(0, 7), color: "#51419c" } })),
          { xAxis: entryDate, lineStyle: { color: "#175ec8", width: 3 }, label: { show: true, formatter: "Entry", color: "#175ec8", fontWeight: 800 } },
        ] as any },
      },
      { name: "Absolute-month entry", type: "scatter", symbol: "diamond", symbolSize: 20, z: 10,
        data: Number.isFinite(entryPrice) ? [{ value: [entryDate, entryPrice], itemStyle: { color: "#175ec8", borderColor: "#fff", borderWidth: 2 }, label: { show: true, position: "top", formatter: `Entry ₹${entryPrice.toFixed(2)}`, color: "#175ec8", fontWeight: 800 } }] : [] },
      { name: "Volume", type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: rows.map((row) => Number(row.volume)), itemStyle: { color: "#7c8fb8" } },
    ],
  };
}

function absoluteFirstSessionChartOption(data: AbsoluteFirstSessionChart): EChartsOption {
  const rows = data.bars;
  const dates = rows.map((row) => String(row.trade_date).slice(0, 10));
  const monthStarts = dates.filter((value, index) => index === 0 || value.slice(0, 7) !== dates[index - 1]?.slice(0, 7));
  const firstDate = String(data.candidate.first_session_date).slice(0, 10);
  const entryDate = data.candidate.entry_date ? String(data.candidate.entry_date).slice(0, 10) : null;
  const entryPrice = Number(data.candidate.entry_price);
  return {
    animation: false,
    legend: { top: 2, data: ["Daily OHLC", "First session", "Entry", "Volume"] },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    grid: [{ left: 64, right: 24, top: 42, height: "62%" }, { left: 64, right: 24, top: "75%", height: "15%" }],
    xAxis: [
      { type: "category", data: dates, boundaryGap: true, axisLabel: { formatter: (value: string) => value.slice(5) } },
      { type: "category", gridIndex: 1, data: dates, boundaryGap: true, axisLabel: { show: false }, axisTick: { show: false } },
    ],
    yAxis: [{ scale: true, axisLabel: { formatter: (value: number) => `₹${value.toFixed(0)}` } }, { gridIndex: 1, scale: true }],
    dataZoom: [{ type: "inside", xAxisIndex: [0, 1] }, { type: "slider", xAxisIndex: [0, 1], bottom: 2, height: 18 }],
    series: [
      { name: "Daily OHLC", type: "candlestick", data: rows.map((row) => [Number(row.open), Number(row.close), Number(row.low), Number(row.high)]),
        itemStyle: { color: "#0b7a53", color0: "#c2384a", borderColor: "#0b7a53", borderColor0: "#c2384a" },
        markLine: { silent: true, symbol: "none", data: [
          ...monthStarts.map((value) => ({ xAxis: value, lineStyle: { color: "#6b52cb", type: "dashed" }, label: { show: true, formatter: value.slice(0, 7) } })),
          { xAxis: firstDate, lineStyle: { color: "#c68a0b", width: 2 }, label: { show: true, formatter: "First session" } },
          ...(entryDate ? [{ xAxis: entryDate, lineStyle: { color: "#175ec8", width: 3 }, label: { show: true, formatter: "Entry" } }] : []),
        ] as any } },
      { name: "First session", type: "scatter", symbol: "circle", symbolSize: 15,
        data: [{ value: [firstDate, Number(data.candidate.first_session_open)], itemStyle: { color: "#c68a0b" } }] },
      { name: "Entry", type: "scatter", symbol: "diamond", symbolSize: 20,
        data: entryDate && Number.isFinite(entryPrice) ? [{ value: [entryDate, entryPrice], itemStyle: { color: "#175ec8" }, label: { show: true, position: "top", formatter: `Entry ₹${entryPrice.toFixed(2)}` } }] : [] },
      { name: "Volume", type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: rows.map((row) => Number(row.volume)), itemStyle: { color: "#7c8fb8" } },
    ],
  };
}

function absoluteHistoryOption(data: AbsoluteMonthlyDashboard): EChartsOption {
  const rows = data.monthlySummary.slice().reverse();
  return {
    animation: false,
    legend: { top: 0, data: ["Month-end / to-date", "Maximum profit", "Maximum drawdown"] },
    tooltip: { trigger: "axis" },
    grid: { left: 55, right: 24, top: 38, bottom: 58 },
    xAxis: { type: "category", data: rows.map((row) => String(row.evaluation_month).slice(0, 7)), axisLabel: { rotate: 45 } },
    yAxis: { type: "value", axisLabel: { formatter: (value: number) => `${value.toFixed(0)}%` }, splitLine: { lineStyle: { color: "#e6ebf2" } } },
    dataZoom: [{ type: "inside", start: 0, end: 100 }],
    series: [
      { name: "Month-end / to-date", type: "bar", data: rows.map((row) => Number(row.average_end_return_pct)), itemStyle: { color: (params: any) => Number(params.value) >= 0 ? "#0b7a53" : "#c2384a" } },
      { name: "Maximum profit", type: "line", smooth: true, data: rows.map((row) => Number(row.average_max_profit_pct)), lineStyle: { color: "#175ec8" }, itemStyle: { color: "#175ec8" } },
      { name: "Maximum drawdown", type: "line", smooth: true, data: rows.map((row) => Number(row.average_max_drawdown_pct)), lineStyle: { color: "#c2384a" }, itemStyle: { color: "#c2384a" } },
    ],
  };
}

function absoluteFirstSessionHistoryOption(data: AbsoluteFirstSessionDashboard): EChartsOption {
  const rows = data.monthlySummary.slice().reverse();
  return {
    animation: false,
    legend: { top: 0, data: ["Month-end / to-date", "Maximum possible", "Maximum drawdown"] },
    tooltip: { trigger: "axis" },
    grid: { left: 60, right: 24, top: 40, bottom: 60 },
    xAxis: { type: "category", data: rows.map((row) => String(row.evaluation_month).slice(0, 7)), axisLabel: { rotate: 45 } },
    yAxis: { type: "value", axisLabel: { formatter: (value: number) => `₹${value.toLocaleString("en-IN")}` } },
    dataZoom: [{ type: "inside" }],
    series: [
      { name: "Month-end / to-date", type: "bar", data: rows.map((row) => Number(row.end_pnl_10000 ?? 0)), itemStyle: { color: (params: any) => Number(params.value) >= 0 ? "#0b7a53" : "#c2384a" } },
      { name: "Maximum possible", type: "line", data: rows.map((row) => Number(row.max_profit_10000 ?? 0)), lineStyle: { color: "#175ec8" } },
      { name: "Maximum drawdown", type: "line", data: rows.map((row) => Number(row.max_drawdown_10000 ?? 0)), lineStyle: { color: "#c2384a" } },
    ],
  };
}

export function RollingMonthlyPage() {
  const [search, setSearch] = useSearchParams();
  const [data, setData] = useState<RollingMonthlyDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [weeklyChart, setWeeklyChart] = useState<RollingMonthlyWeeklyChart | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [absoluteData, setAbsoluteData] = useState<AbsoluteMonthlyDashboard | null>(null);
  const [absoluteLoading, setAbsoluteLoading] = useState(false);
  const [absoluteError, setAbsoluteError] = useState<string | null>(null);
  const [absoluteChart, setAbsoluteChart] = useState<AbsoluteMonthlyChart | null>(null);
  const [firstSessionData, setFirstSessionData] = useState<AbsoluteFirstSessionDashboard | null>(null);
  const [firstSessionLoading, setFirstSessionLoading] = useState(false);
  const [firstSessionError, setFirstSessionError] = useState<string | null>(null);
  const [firstSessionChart, setFirstSessionChart] = useState<AbsoluteFirstSessionChart | null>(null);
  const [profileFilters, setProfileFilters] = useState<StockProfileFilters>({ universe: "FNO", capBucket: "ALL", sector: "ALL" });
  const profiles = useProfileIndex();
  const side =
    search.get("side") === "LONG" || search.get("side") === "SHORT"
      ? search.get("side")!
      : "ALL";
  const view =
    search.get("view") === "evidence" ||
    search.get("view") === "history" ||
    search.get("view") === "expiry" ||
    search.get("view") === "absolute" ||
    search.get("view") === "absolute-first-session"
      ? search.get("view")!
      : "candidates";
  const evidenceOnly = view === "evidence";
  const historyOnly = view === "history";
  const expiryOnly = view === "expiry";
  const absoluteOnly = view === "absolute";
  const firstSessionOnly = view === "absolute-first-session";
  const absoluteYear = search.get("year") ?? "";
  const absoluteMonth = search.get("month") ?? "";
  const firstSessionThreshold = ["1", "1.0", "1.00"].includes(search.get("threshold") ?? "") ? "1.00" : "0.50";

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchRollingMonthlyDashboard()
      .then((result) => {
        if (live) {
          setData(result);
          setError(null);
        }
      })
      .catch((reason) => {
        if (live)
          setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!absoluteOnly) return;
    let live = true;
    setAbsoluteLoading(true);
    fetchAbsoluteMonthlyDashboard(absoluteYear || undefined, absoluteMonth || undefined)
      .then((result) => { if (live) { setAbsoluteData(result); setAbsoluteError(null); } })
      .catch((reason) => { if (live) setAbsoluteError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (live) setAbsoluteLoading(false); });
    return () => { live = false; };
  }, [absoluteOnly, absoluteYear, absoluteMonth]);
  useEffect(() => {
    if (!firstSessionOnly) return;
    let live = true;
    setFirstSessionLoading(true);
    fetchAbsoluteFirstSessionDashboard(absoluteYear || undefined, absoluteMonth || undefined, firstSessionThreshold)
      .then((result) => { if (live) { setFirstSessionData(result); setFirstSessionError(null); } })
      .catch((reason) => { if (live) setFirstSessionError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (live) setFirstSessionLoading(false); });
    return () => { live = false; };
  }, [firstSessionOnly, absoluteYear, absoluteMonth, firstSessionThreshold]);
  useEffect(() => {
    if (!weeklyChart && !absoluteChart && !firstSessionChart && !chartError) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWeeklyChart(null);
        setAbsoluteChart(null);
        setFirstSessionChart(null);
        setChartError(null);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [weeklyChart, absoluteChart, firstSessionChart, chartError]);

  const candidates = useMemo(() => {
    const rows = data?.candidates ?? [];
    return rows.filter((row) => (side === "ALL" || row.side === side) && matchesStockProfile(profiles.bySymbol.get(String(row.symbol).toUpperCase()), profileFilters));
  }, [data?.candidates, side, profileFilters, profiles.bySymbol]);
  const qualified = candidates.filter(
    (row) =>
      ["HIGH", "MEDIUM"].includes(row.quality_band) &&
      row.entry_eligible === true,
  );
  const nearest = candidates
    .slice()
    .sort((a, b) => Number(b.quality_score) - Number(a.quality_score))
    .slice(0, 12);
  const run = data?.latestRun;

  if (loading)
    return (
      <main className={styles.page}>
        <LoadingSkeleton label="Loading Rolling Monthly strategy" rows={6} />
      </main>
    );
  if (error)
    return (
      <main className={styles.page}>
        <ErrorState
          title="Rolling Monthly data could not be loaded"
          detail={error}
        />
      </main>
    );
  if (!data || !run)
    return (
      <main className={styles.page}>
        <CompactEmptyState
          kind="NO_DATA"
          title="No completed Rolling Monthly run"
          detail="The isolated runner has not published a completed canonical-data run yet."
        />
      </main>
    );

  const qualityValid = run.quality_status === "VALID";
  const decisionState = !qualityValid
    ? "INCOMPLETE"
    : qualified.length
      ? "APPROVED"
      : "BLOCKED";
  const backtest = data.backtestHistory;
  const evidenceApproved = backtest.governance?.status === "APPROVED";
  const historyBands = backtest.bandSummary.filter(
    (row) =>
      row.scope === "ALL" &&
      row.quality_band !== "BASELINE" &&
      (side === "ALL" || row.side === side),
  );
  const baselineHistory = backtest.bandSummary.filter(
    (row) =>
      row.scope === "ALL" &&
      row.quality_band === "BASELINE" &&
      (side === "ALL" || row.side === side),
  );
  const totalBacktests = baselineHistory.reduce(
    (sum, row) => sum + Number(row.trades || 0),
    0,
  );
  const totalSuccessful = baselineHistory.reduce(
    (sum, row) => sum + Number(row.success_count || 0),
    0,
  );
  const totalFailed = baselineHistory.reduce(
    (sum, row) => sum + Number(row.failure_count || 0),
    0,
  );
  const historyConditions = backtest.conditionEvidence
    .filter(
      (row) => row.scope === "ALL" && (side === "ALL" || row.side === side),
    )
    .slice(0, side === "ALL" ? 16 : 12);
  const historyCorrelations = backtest.correlations
    .filter((row) => side === "ALL" || row.side === side)
    .slice(0, side === "ALL" ? 16 : 12);
  const monthlyHistory = backtest.monthlySummary.filter(
    (row) => side === "ALL" || row.side === side,
  );
  const expiryMonths = data.expiryHistory.months;
  const expiryCandidates = data.expiryHistory.candidates.filter(
    (row) => side === "ALL" || row.side === side,
  );
  const expiryPerformance: Array<
    Record<string, any> & {
      rows: Array<Record<string, any>>;
      success: number;
      failed: number;
      pending: number;
      high: number;
      medium: number;
      low: number;
      averageReturn: number | null;
    }
  > = expiryMonths.map((month) => {
    const rows = expiryCandidates.filter(
      (row) =>
        String(row.expiry_month).slice(0, 10) ===
        String(month.expiry_month).slice(0, 10),
    );
    return {
      ...month,
      rows,
      success: rows.filter((row) => row.d5_outcome === "SUCCESS").length,
      failed: rows.filter((row) => row.d5_outcome === "FAILED").length,
      pending: rows.filter((row) => row.d5_outcome === "PENDING").length,
      high: rows.filter((row) => row.quality_band === "HIGH").length,
      medium: rows.filter((row) => row.quality_band === "MEDIUM").length,
      low: rows.filter((row) => row.quality_band === "LOW").length,
      averageReturn: rows.length
        ? rows.reduce(
            (sum, row) => sum + Number(row.current_return_pct || 0),
            0,
          ) / rows.length
        : null,
    };
  });
  const expiryCohorts = expiryPerformance.slice(0, 3);
  const requestedCohort = search.get("cohort");
  const selectedExpiryCohort =
    expiryCohorts.find(
      (month) =>
        String(month.expiry_month).slice(0, 10) === requestedCohort,
    ) ?? expiryCohorts[0];
  const selectedCohortSummary = summarizeRollingMonthlyCohort(
    selectedExpiryCohort?.rows ?? [],
  );
  const absoluteYears = Array.from(new Set((absoluteData?.runs ?? []).map((row) => String(row.evaluation_month).slice(0, 4))));
  const absoluteRows = (absoluteData?.candidates ?? []).filter((row) => matchesStockProfile(profiles.bySymbol.get(String(row.symbol).toUpperCase()), profileFilters));
  const absoluteEligibleRows = absoluteRows.filter((row) => row.evaluation_status !== "INCOMPLETE");
  const absoluteWinners = absoluteEligibleRows.filter((row) => Number(row.end_return_pct) > 0).length;
  const absoluteAverageReturn = absoluteEligibleRows.length
    ? absoluteEligibleRows.reduce((sum, row) => sum + Number(row.end_return_pct), 0) / absoluteEligibleRows.length
    : null;
  const absoluteAverageMaxProfit = absoluteEligibleRows.length
    ? absoluteEligibleRows.reduce((sum, row) => sum + Number(row.max_profit_pct), 0) / absoluteEligibleRows.length
    : null;
  const absoluteWorstDrawdown = absoluteEligibleRows.length
    ? Math.min(...absoluteEligibleRows.map((row) => Number(row.max_drawdown_pct)))
    : null;
  const absoluteNetPnl = absoluteEligibleRows.reduce(
    (sum, row) => sum + Number(row.end_return_pct) * Number(absoluteData?.researchNotionalPerOpportunity ?? 0) / 100,
    0,
  );
  const firstSessionRows = (firstSessionData?.candidates ?? []).filter((row) => matchesStockProfile(profiles.bySymbol.get(String(row.symbol).toUpperCase()), profileFilters));
  const firstSessionTotals = firstSessionData?.totals ?? {};
  const firstSessionEntered = Number(firstSessionTotals.entered ?? 0);
  const firstSessionEvaluable = Number(firstSessionTotals.path_evaluable ?? 0);
  const firstSessionThresholds = firstSessionData?.performanceThresholdsPct?.length
    ? firstSessionData.performanceThresholdsPct
    : [...FIRST_SESSION_PERFORMANCE_THRESHOLDS];
  const firstSessionYears = Array.from(new Set((firstSessionData?.runs ?? []).map((row) => String(row.evaluation_month).slice(0, 4))));

  const setView = (
    nextView: "candidates" | "expiry" | "absolute" | "absolute-first-session" | "history" | "evidence",
    nextSide = side,
  ) => {
    const params: Record<string, string> = {};
    if (nextSide !== "ALL") params.side = nextSide;
    if (nextView !== "candidates") params.view = nextView;
    setSearch(params);
  };
  const setAbsolutePeriod = (year: string, month: string) => {
    const params: Record<string, string> = { view: firstSessionOnly ? "absolute-first-session" : "absolute" };
    if (year) params.year = year;
    if (month) params.month = month;
    if (firstSessionOnly) params.threshold = firstSessionThreshold;
    setSearch(params);
  };
  const setFirstSessionThreshold = (threshold: string) => {
    const params: Record<string, string> = { view: "absolute-first-session", threshold };
    if (absoluteYear) params.year = absoluteYear;
    if (absoluteMonth) params.month = absoluteMonth;
    setSearch(params);
  };

  const selectExpiryCohort = (expiryMonth: unknown) => {
    const params: Record<string, string> = { view: "expiry" };
    if (side !== "ALL") params.side = side;
    params.cohort = String(expiryMonth).slice(0, 10);
    setSearch(params);
  };
  const openWeeklyChart = async (candidateId: string) => {
    setChartLoading(true);
    setChartError(null);
    try {
      setWeeklyChart(await fetchRollingMonthlyWeeklyChart(candidateId));
    } catch (reason) {
      setChartError(reason instanceof Error ? reason.message : String(reason));
      setWeeklyChart(null);
    } finally {
      setChartLoading(false);
    }
  };
  const openAbsoluteChart = async (candidateId: string) => {
    setChartLoading(true);
    setChartError(null);
    try {
      setAbsoluteChart(await fetchAbsoluteMonthlyChart(candidateId));
    } catch (reason) {
      setChartError(reason instanceof Error ? reason.message : String(reason));
      setAbsoluteChart(null);
    } finally {
      setChartLoading(false);
    }
  };
  const openFirstSessionChart = async (candidateId: string) => {
    setChartLoading(true);
    setChartError(null);
    try {
      setFirstSessionChart(await fetchAbsoluteFirstSessionChart(candidateId));
    } catch (reason) {
      setChartError(reason instanceof Error ? reason.message : String(reason));
      setFirstSessionChart(null);
    } finally {
      setChartLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <ModuleStatusStrip
        environment="REPLAY"
        quality={{
          moduleId: "Rolling Monthly",
          transport: "CONNECTED",
          freshness: qualityValid ? "CURRENT" : "DELAYED",
          readiness: qualityValid ? "READY" : "DEGRADED",
          dataThrough: run.data_as_of ?? undefined,
          source: "Canonical bars_1d + active NFO universe",
          message: `${run.nifty50_coverage}/50 NIFTY breadth coverage`,
        }}
        context={
          <>
            Independent strategy · Signal {date(run.signal_date)} · Entry{" "}
            {date(run.entry_date)} · V2 research
          </>
        }
      />

      <PageHeader
        breadcrumb={
          <>
            <CalendarRange size={14} aria-hidden="true" /> Strategies / Rolling
            Monthly
          </>
        }
        title="Rolling Monthly"
        context="Bullish LONG and bearish SHORT candidates from completed monthly, point-in-time weekly and daily evidence. This is independent from OIIS."
        quality={
          <SourceFreshness
            source="Canonical bars_1d + active NFO universe"
            asOf={run.data_as_of}
            state="Research only"
          />
        }
        actions={
          <div className={styles.safety}>
            <ShieldAlert size={18} aria-hidden="true" />
            <strong>Research only</strong>
            <span>No Paper Trading or broker-order connection</span>
          </div>
        }
      />

      <StockUniverseFilterBar profiles={profiles.payload?.records ?? []} filters={profileFilters} onChange={setProfileFilters} count={firstSessionOnly ? firstSessionRows.length : absoluteOnly ? absoluteRows.length : candidates.length} />
      <StockDistribution profiles={(firstSessionOnly ? firstSessionRows : absoluteOnly ? absoluteRows : candidates).map((row) => profiles.bySymbol.get(String(row.symbol).toUpperCase())).filter((item): item is NonNullable<typeof item> => Boolean(item))} />

      <nav className={styles.filters} aria-label="Rolling Monthly view filters">
        {(["ALL", "LONG", "SHORT"] as const).map((value) => (
          <button
            key={value}
            type="button"
            data-active={view === "candidates" && side === value}
            onClick={() => setView("candidates", value)}
          >
            {value === "ALL" ? "Current candidates" : `${value} candidates`}
          </button>
        ))}
        <button
          type="button"
          data-active={expiryOnly}
          onClick={() => setView("expiry")}
        >
          Expiry journey
        </button>
        <button
          type="button"
          data-active={absoluteOnly}
          onClick={() => setView("absolute")}
        >
          Absolute monthly closure
        </button>
        <button
          type="button"
          data-active={firstSessionOnly}
          onClick={() => setView("absolute-first-session")}
        >
          Absolute first session
        </button>
        <button
          type="button"
          data-active={historyOnly}
          onClick={() => setView("history")}
        >
          Backtest history
        </button>
        <button
          type="button"
          data-active={evidenceOnly}
          onClick={() => setView("evidence")}
        >
          Method &amp; reference
        </button>
      </nav>

      {view === "candidates" ? (
        <>
          <DecisionHero
            eyebrow={`${side === "ALL" ? "LONG + SHORT" : side} · finalized after next-session open`}
            title={
              qualified.length
                ? `${qualified.length} quality candidate${qualified.length === 1 ? "" : "s"} qualified`
                : "No High or Medium quality candidate for this run"
            }
            state={decisionState}
            reasons={
              qualified.length ? (
                <>
                  These scanner matches passed their side-specific mandatory
                  quality gates and the entry-gap check.
                </>
              ) : (
                <>
                  {run.long_scanner_count} LONG and {run.short_scanner_count}{" "}
                  SHORT base-scanner matches were assessed. All failed at least
                  one authoritative quality gate.
                </>
              )
            }
            evidence={
              <span>
                Signal close {date(run.signal_date)} · Actual next-session open{" "}
                {date(run.entry_date)} · Factor {data.factorVersion}
              </span>
            }
          />

          <ExecutiveKpiStrip>
            <MetricTile
              label="F&O universe"
              value={run.universe_size}
              scope="Canonical active stock underlyings"
              definition="Unique NFO FUTSTK/OPTSTK underlyings evaluated."
            />
            <MetricTile
              label="Base scanner matches"
              value={
                Number(run.long_scanner_count) + Number(run.short_scanner_count)
              }
              scope={`${run.long_scanner_count} LONG · ${run.short_scanner_count} SHORT`}
            />
            <MetricTile
              label="High / Medium"
              value={`${run.high_count} / ${run.medium_count}`}
              scope="After mandatory quality gates"
              tone={Number(run.high_count) ? "positive" : "neutral"}
            />
            <MetricTile
              label="NIFTY breadth coverage"
              value={`${run.nifty50_coverage}/50`}
              scope={qualityValid ? "Complete" : "Degraded"}
              tone={qualityValid ? "positive" : "warning"}
            />
          </ExecutiveKpiStrip>

          <section className={styles.panel}>
            <div className={styles.sectionTitle}>
              <div>
                <span>Current selection</span>
                <h2>
                  {qualified.length
                    ? "Qualified candidates"
                    : "Closest scanner matches"}
                </h2>
                <p>
                  {qualified.length
                    ? "High and Medium bands only."
                    : "Ranked for diagnosis only. Every row remains NO TRADE."}
                </p>
              </div>
              <small>
                Scores rank within a band; Boolean gate logic is authoritative.
              </small>
            </div>
            {nearest.length ? (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Stock</th>
                      <th>Direction</th>
                      <th>Band / score</th>
                      <th>Signal → entry</th>
                      <th>Target / stop</th>
                      <th>Decision</th>
                      <th>Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nearest.map((row) => (
                      <tr key={row.candidate_id} data-side={row.side}>
                        <td>#{row.rank}</td>
                        <td>
                          <button
                            type="button"
                            className={styles.stockChartLink}
                            onClick={() => void openWeeklyChart(row.candidate_id)}
                          >
                            {row.symbol}
                          </button>
                          <small>{row.sector || "Sector unavailable"}</small>
                        </td>
                        <td>
                          <span
                            className={styles.direction}
                            data-side={row.side}
                          >
                            {row.side === "LONG" ? (
                              <ArrowUpRight size={14} />
                            ) : (
                              <ArrowDownRight size={14} />
                            )}
                            {row.side}
                          </span>
                        </td>
                        <td>
                          <strong
                            className={styles.band}
                            data-band={row.quality_band}
                          >
                            {row.quality_band}
                          </strong>
                          <small>{n(row.quality_score)} / 100</small>
                        </td>
                        <td>
                          <strong>
                            {money(row.signal_close)} → {money(row.entry_price)}
                          </strong>
                          <small>
                            {date(row.signal_date)} → {date(row.entry_date)}
                          </small>
                        </td>
                        <td>
                          <strong>{money(row.primary_target_price)}</strong>
                          <small>Stop {money(row.stop_price)}</small>
                        </td>
                        <td>
                          <strong>{label(row.deployment_action)}</strong>
                          <small>
                            {row.entry_rejection_reason
                              ? label(row.entry_rejection_reason)
                              : row.mandatory_gate_pass
                                ? "Entry checks passed"
                                : "Quality gate failed"}
                          </small>
                        </td>
                        <td>
                          <details>
                            <summary>
                              Gate values <ChevronDown size={13} />
                            </summary>
                            <div className={styles.gates}>
                              {components(row).map((item) => (
                                <div key={item.code} data-pass={item.pass}>
                                  <span>
                                    {item.pass ? "✓" : "×"} {item.label}
                                  </span>
                                  <strong>
                                    {n(item.value)} <small>{item.rule}</small>
                                  </strong>
                                </div>
                              ))}
                            </div>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <CompactEmptyState
                kind="NO_RESULT"
                title="No base-scanner match"
                detail="None of the active F&O stocks passed all six side-specific scanner conditions for this signal date."
              />
            )}
          </section>
        </>
      ) : null}

      {expiryOnly ? (
        <section className={styles.expiryHistory}>
          <div className={styles.sectionTitle}>
            <div>
              <span>Last-Tuesday monthly expiry</span>
              <h2>Conditions then, quality then, position now</h2>
              <p>
                Each snapshot is fixed at the monthly expiry close. Entry is
                measured at the next valid exchange-session open; no future
                condition is allowed into the original quality label.
              </p>
            </div>
            <small>{data.expiryHistory.outcomeRule}</small>
          </div>

          <nav className={styles.cohortTabs} aria-label="Expiry cohort reports">
            {expiryCohorts.map((month) => {
              const key = String(month.expiry_month).slice(0, 10);
              const active =
                key ===
                String(selectedExpiryCohort?.expiry_month).slice(0, 10);
              const summary = summarizeRollingMonthlyCohort(month.rows);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  data-active={active}
                  onClick={() => selectExpiryCohort(month.expiry_month)}
                >
                  <strong>{monthYear(month.expiry_month)}</strong>
                  <span>
                    {summary.scannerMatches} scanner matches ·{" "}
                    {summary.matured ? "Matured" : "Developing"}
                  </span>
                </button>
              );
            })}
          </nav>

          {selectedExpiryCohort ? (
            <>
              <div className={styles.expiryHero}>
                <div>
                  <span>{monthYear(selectedExpiryCohort.expiry_month)} signal expiry</span>
                  <strong>{date(selectedExpiryCohort.scheduled_expiry_date)}</strong>
                  <small>
                    Entry {date(selectedExpiryCohort.entry_date)} · Next expiry{" "}
                    {date(selectedExpiryCohort.rows[0]?.next_scheduled_expiry_date)}
                  </small>
                </div>
                <div>
                  <span>Base scanner / quality eligible</span>
                  <strong>
                    {selectedCohortSummary.scannerMatches} /{" "}
                    {selectedCohortSummary.qualityEligible}
                  </strong>
                  <small>
                    {selectedExpiryCohort.rows.filter((row) => row.side === "LONG").length}{" "}
                    LONG ·{" "}
                    {selectedExpiryCohort.rows.filter((row) => row.side === "SHORT").length}{" "}
                    SHORT
                  </small>
                </div>
                <div>
                  <span>Average expiry P/L</span>
                  <strong>
                    {pct(selectedCohortSummary.averageReturnPct)}
                  </strong>
                  <small>
                    Winners {selectedCohortSummary.winners} · Losers{" "}
                    {selectedCohortSummary.losers}
                  </small>
                </div>
                <div>
                  <span>Average max profit / drawdown</span>
                  <strong>
                    {pct(selectedCohortSummary.averageMaxProfitPct)} /{" "}
                    {pct(selectedCohortSummary.averageMaxDrawdownPct)}
                  </strong>
                  <small>
                    Average winning return {pct(selectedCohortSummary.averageProfitPct)} ·{" "}
                    average losing return {pct(selectedCohortSummary.averageLossPct)}
                  </small>
                </div>
              </div>

              <div className={styles.historyPanel}>
                <div className={styles.sectionTitle}>
                  <div>
                    <span>{monthYear(selectedExpiryCohort.expiry_month)} cohort</span>
                    <h2>Qualification and next-expiry outcome</h2>
                    <p>
                      {data.expiryHistory.cohortWindowRule} Cash-equity prices
                      are direction-normalized for LONG and SHORT research.
                    </p>
                  </div>
                  <small>{data.expiryHistory.cohortAverageRule}</small>
                </div>
                {selectedExpiryCohort.rows.length ? (
                  <div className={styles.tableWrap}>
                    <table className={styles.expiryTable}>
                      <thead>
                        <tr>
                          <th>Stock</th>
                          <th>Side / quality</th>
                          <th>Qualification</th>
                          <th>Entry → expiry</th>
                          <th>Expiry P/L</th>
                          <th>Max profit</th>
                          <th>Max drawdown</th>
                          <th>Conditions at expiry</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedExpiryCohort.rows.map((row) => (
                          <tr key={row.candidate_id}>
                            <td>
                              <button
                                type="button"
                                className={styles.stockChartLink}
                                onClick={() => void openWeeklyChart(row.candidate_id)}
                              >
                                {row.symbol}
                              </button>
                              <small>
                                {row.sector || "Sector unavailable"}
                              </small>
                            </td>
                            <td>
                              <span
                                className={styles.direction}
                                data-side={row.side}
                              >
                                {row.side}
                              </span>
                              <strong
                                className={styles.band}
                                data-band={row.quality_band}
                              >
                                {row.quality_band}
                              </strong>
                            </td>
                            <td>
                              <strong>
                                Base scanner qualified
                              </strong>
                              <small>
                                {row.entry_eligible
                                  ? "Quality model: entry eligible"
                                  : `Quality model rejected: ${label(row.entry_rejection_reason || row.quality_band)}`}
                              </small>
                            </td>
                            <td>
                              <strong>
                                {money(row.entry_price)} →{" "}
                                {money(row.current_price)}
                              </strong>
                              <small>
                                {row.expiry_evaluation_status === "MATURED"
                                  ? `Next expiry ${date(row.next_scheduled_expiry_date)}`
                                  : `Developing through ${date(row.current_price_date)}`}
                              </small>
                            </td>
                            <td>
                              <strong
                                data-tone={
                                  Number(row.expiry_return_pct) >= 0
                                    ? "positive"
                                    : "negative"
                                }
                              >
                                {pct(row.expiry_return_pct)}
                              </strong>
                              <small>{label(row.expiry_evaluation_status)}</small>
                            </td>
                            <td>
                              <strong data-tone="positive">
                                {pct(row.max_profit_pct)}
                              </strong>
                              <small>{date(row.max_profit_date)}</small>
                            </td>
                            <td>
                              <strong data-tone="negative">
                                {pct(row.max_drawdown_pct)}
                              </strong>
                              <small>{date(row.max_drawdown_date)}</small>
                            </td>
                            <td>
                              <details>
                                <summary>
                                  View captured gates <ChevronDown size={13} />
                                </summary>
                                <div className={styles.gates}>
                                  {components(row).map((item) => (
                                    <div key={item.code} data-pass={item.pass}>
                                      <span>
                                        {item.pass ? "✓" : "×"} {item.label}
                                      </span>
                                      <strong>
                                        {n(item.value)}{" "}
                                        <small>{item.rule}</small>
                                      </strong>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <CompactEmptyState
                    kind="NO_RESULT"
                    title="No scanner match at the latest expiry"
                    detail="The expiry run completed, but no stock passed all six base scanner conditions."
                  />
                )}
              </div>

              <div className={styles.historyPanel}>
                <div className={styles.sectionTitle}>
                  <div>
                    <span>Six-expiry performance</span>
                    <h2>Monthly quality and outcome history</h2>
                    <p>
                      Success and failure use the same D+5 clean +3% / adverse
                      2% rule for every month.
                    </p>
                  </div>
                </div>
                <div className={styles.expiryGrid}>
                  {expiryPerformance.map((month) => {
                    const complete = month.success + month.failed;
                    const successRate = complete
                      ? (month.success * 100) / complete
                      : null;
                    return (
                      <article key={String(month.expiry_month)}>
                        <header>
                          <strong>{date(month.scheduled_expiry_date)}</strong>
                          <span data-status={month.status}>{month.status}</span>
                        </header>
                        <div className={styles.monthOutcome}>
                          <b>{month.success}</b>
                          <span>successful</span>
                          <b>{month.failed}</b>
                          <span>failed</span>
                        </div>
                        <div
                          className={styles.performanceRail}
                          aria-label={`Success rate ${pct(successRate)}`}
                        >
                          <i
                            style={{
                              width: `${Math.max(0, Math.min(100, successRate ?? 0))}%`,
                            }}
                          />
                        </div>
                        <dl>
                          <div>
                            <dt>Success rate</dt>
                            <dd>{pct(successRate)}</dd>
                          </div>
                          <div>
                            <dt>High / Medium / Low</dt>
                            <dd>
                              {month.high} / {month.medium} / {month.low}
                            </dd>
                          </div>
                          <div>
                            <dt>Pending</dt>
                            <dd>{month.pending}</dd>
                          </div>
                          <div>
                            <dt>Current mean</dt>
                            <dd>{pct(month.averageReturn)}</dd>
                          </div>
                        </dl>
                        <small>
                          Signal {date(month.signal_date)} · Entry{" "}
                          {date(month.entry_date)}
                        </small>
                      </article>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <CompactEmptyState
              kind="NO_DATA"
              title="Expiry history is not available"
              detail="The expiry backfill has not completed yet."
            />
          )}
        </section>
      ) : null}

      {absoluteOnly ? (
        <section className={styles.absoluteHistory}>
          <div className={styles.sectionTitle}>
            <div>
              <span>Absolute calendar-month variant</span>
              <h2>Red month → green month → confirmed bullish entry</h2>
              <p>
                The first seven-condition match per F&amp;O stock is entered at that session's close and
                evaluated only through the final exchange session of the same calendar month. This does
                not use monthly expiry dates and does not change the existing strategy variants.
              </p>
            </div>
            <div className={styles.exportActions}>
              <a href={absoluteMonthlyExportUrl("csv", absoluteYear || undefined, absoluteMonth || undefined)} download>
                <Download size={15} /> CSV
              </a>
              <a href={absoluteMonthlyExportUrl("xls", absoluteYear || undefined, absoluteMonth || undefined)} download>
                <Download size={15} /> Excel
              </a>
            </div>
          </div>

          <div className={styles.absoluteFilters} aria-label="Absolute Monthly report filters">
            <label>
              <span>Year</span>
              <select value={absoluteYear} onChange={(event) => setAbsolutePeriod(event.target.value, absoluteMonth)}>
                <option value="">All years</option>
                {absoluteYears.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <label>
              <span>Month</span>
              <select value={absoluteMonth} onChange={(event) => setAbsolutePeriod(absoluteYear, event.target.value)}>
                <option value="">All months</option>
                {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")).map((month) => (
                  <option key={month} value={month}>{new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC" }).format(new Date(`2026-${month}-01T00:00:00Z`))}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setAbsolutePeriod("", "")}>Clear filters</button>
            <small>{absoluteRows.length} opportunities shown · data-backed filters also apply to downloads</small>
          </div>

          {absoluteLoading ? <LoadingSkeleton label="Replaying Absolute Monthly history" rows={5} /> : null}
          {absoluteError ? <ErrorState title="Absolute Monthly history could not be loaded" detail={absoluteError} /> : null}
          {!absoluteLoading && !absoluteError && absoluteData ? (
            <>
              <div className={styles.absoluteKpis}>
                <article>
                  <span>Recognized opportunities</span>
                  <strong>{absoluteRows.length}</strong>
                  <small>{absoluteEligibleRows.length} eligible · {absoluteWinners} profitable · {absoluteRows.length - absoluteEligibleRows.length} incomplete excluded</small>
                </article>
                <article data-tone={Number(absoluteAverageReturn) >= 0 ? "positive" : "negative"}>
                  <span>Average month-end / to-date</span>
                  <strong>{pct(absoluteAverageReturn)}</strong>
                  <small>Equal-weight average across filtered opportunities</small>
                </article>
                <article data-tone="positive">
                  <span>Average maximum profit</span>
                  <strong>{pct(absoluteAverageMaxProfit)}</strong>
                  <small>Post-entry daily highs; signal-day high excluded</small>
                </article>
                <article data-tone="negative">
                  <span>Worst maximum drawdown</span>
                  <strong>{pct(absoluteWorstDrawdown)}</strong>
                  <small>Post-entry daily lows; signal-day low excluded</small>
                </article>
              </div>

              <div className={styles.absolutePortfolioStrip}>
                <div>
                  <span>Equal-notional research result</span>
                  <strong data-tone={absoluteNetPnl >= 0 ? "positive" : "negative"}>{money(absoluteNetPnl)}</strong>
                  <small>₹{Number(absoluteData.researchNotionalPerOpportunity).toLocaleString("en-IN")} per opportunity · gross before costs and tax</small>
                </div>
                <div>
                  <span>Strategy version</span>
                  <strong>{absoluteData.strategyVersion}</strong>
                  <small>First match only · same-calendar-month close</small>
                </div>
                <div>
                  <span>Current source horizon</span>
                  <strong>{date(absoluteData.runs[0]?.source_end_date)}</strong>
                  <small>{label(absoluteData.runs[0]?.maturity_state)}</small>
                </div>
              </div>

              <div className={styles.absoluteCharts}>
                <article>
                  <div className={styles.sectionTitle}>
                    <div><span>Monthly performance</span><h2>Return, opportunity and pain</h2></div>
                    <small>Average percentages per monthly cohort</small>
                  </div>
                  <EChartSurface className={styles.absoluteHistoryChart} option={absoluteHistoryOption(absoluteData)} ariaLabel="Absolute Monthly average end return, maximum profit and maximum drawdown by month" />
                </article>
                <article>
                  <div className={styles.sectionTitle}>
                    <div><span>Yearly summary</span><h2>Opportunities and gross result</h2></div>
                  </div>
                  <div className={styles.yearSummary}>
                    {absoluteData.yearlySummary.map((row) => (
                      <div key={String(row.year)}>
                        <strong>{row.year}</strong>
                        <span>{row.opportunities} opportunities · {row.winners} winners</span>
                        <b data-tone={Number(row.average_end_return_pct) >= 0 ? "positive" : "negative"}>{pct(row.average_end_return_pct)} average</b>
                        <small>Net {money(row.hypothetical_net_pnl)} · best path {pct(row.highest_max_profit_pct)} · worst path {pct(row.worst_max_drawdown_pct)}</small>
                      </div>
                    ))}
                  </div>
                </article>
              </div>

              <div className={styles.historyPanel}>
                <div className={styles.sectionTitle}>
                  <div>
                    <span>Complete calendar-month evidence</span>
                    <h2>Every recognized stock opportunity and all seven checks</h2>
                    <p>Click a stock for daily candles, calendar-month dividers and the blue entry annotation.</p>
                  </div>
                </div>
                {absoluteRows.length ? (
                  <div className={styles.tableWrap}>
                    <table className={styles.absoluteTable}>
                      <thead><tr>
                        <th>Month / stock</th><th>M−2 red candle</th><th>M−1 green + crossover</th>
                        <th>Week evidence</th><th>Day evidence</th><th>Entry → close</th>
                        <th>Maximum profit</th><th>Maximum drawdown</th><th>Status</th>
                      </tr></thead>
                      <tbody>{absoluteRows.map((row) => (
                        <tr key={row.candidate_id}>
                          <td><button type="button" className={styles.stockChartLink} onClick={() => void openAbsoluteChart(row.candidate_id)}>{row.symbol}</button><small>{monthYear(row.evaluation_month)} · signal {date(row.signal_date)}</small></td>
                          <td><strong className={styles.conditionPass}>✓ {money(row.month_two_close)} &lt; {money(row.month_two_open)}</strong><small>Close / open</small></td>
                          <td><strong className={styles.conditionPass}>✓ {money(row.month_one_close)} &gt; {money(row.month_one_open)}</strong><small>✓ M−1 close &gt; M−2 open {money(row.month_two_open)}</small></td>
                          <td><strong className={styles.conditionPass}>✓ {money(row.current_week_close_asof)} &gt; {money(row.current_week_open)}</strong><small>✓ Above previous-week open {money(row.previous_week_open)} · previous close {money(row.previous_week_close)}</small></td>
                          <td><strong className={styles.conditionPass}>✓ {money(row.signal_day_close)} &gt; {money(row.signal_day_open)}</strong><small>✓ Above previous-day open {money(row.previous_day_open)} · previous close {money(row.previous_day_close)}</small></td>
                          <td><strong data-tone={Number(row.end_return_pct) >= 0 ? "positive" : "negative"}>{money(row.entry_price)} → {money(row.path_end_price)} · {pct(row.end_return_pct)}</strong><small>{date(row.entry_date)} → {date(row.evaluation_end_date)} · {money(row.profit_per_share)}/share</small></td>
                          <td><strong data-tone="positive">{pct(row.max_profit_pct)} · {money(row.max_profit_per_share)}/share</strong><small>{money(row.max_profit_price)} on {date(row.max_profit_date)}</small></td>
                          <td><strong data-tone="negative">{pct(row.max_drawdown_pct)} · {money(row.max_drawdown_per_share)}/share</strong><small>{money(row.max_drawdown_price)} on {date(row.max_drawdown_date)}</small></td>
                          <td><strong data-status={row.evaluation_status}>{label(row.evaluation_status)}</strong><small>{row.observed_post_entry_sessions} post-entry sessions</small></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <CompactEmptyState kind="NO_RESULT" title="No absolute-month opportunity for this filter" detail="The backtest ran, but no recognized F&O stock passed all seven point-in-time conditions in this period." />}
              </div>

              <div className={styles.absoluteWarnings}>
                {absoluteData.warnings.map((warning) => <p key={warning}><ShieldAlert size={15} /> {warning}</p>)}
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {firstSessionOnly ? (
        <section className={styles.absoluteHistory}>
          <div className={styles.sectionTitle}>
            <div>
              <span>Absolute Monthly · isolated first-session variant</span>
              <h2>Completed month and week setup → first-session execution</h2>
              <p>
                Eligibility is frozen before the first trading session opens. A non-significant gap buys
                at that open; a significant gap-up waits for the first same-month fill back to the prior
                close. An unfilled gap is retained as evidence but is not counted as a trade.
              </p>
            </div>
            <div className={styles.exportActions}>
              <a href={absoluteFirstSessionExportUrl("csv", absoluteYear || undefined, absoluteMonth || undefined, firstSessionThreshold)} download><Download size={15} /> CSV</a>
              <a href={absoluteFirstSessionExportUrl("xls", absoluteYear || undefined, absoluteMonth || undefined, firstSessionThreshold)} download><Download size={15} /> Excel</a>
            </div>
          </div>

          <div className={styles.absoluteFilters} aria-label="Absolute first-session report filters">
            <label><span>Year</span><select value={absoluteYear} onChange={(event) => setAbsolutePeriod(event.target.value, absoluteMonth)}><option value="">All years</option>{firstSessionYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
            <label><span>Month</span><select value={absoluteMonth} onChange={(event) => setAbsolutePeriod(absoluteYear, event.target.value)}><option value="">All months</option>{Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")).map((month) => <option key={month} value={month}>{new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC" }).format(new Date(`2026-${month}-01T00:00:00Z`))}</option>)}</select></label>
            <label><span>Significant gap-up</span><select value={firstSessionThreshold} onChange={(event) => setFirstSessionThreshold(event.target.value)}><option value="0.50">0.50%</option><option value="1.00">1.00%</option></select></label>
            <button type="button" onClick={() => { setAbsolutePeriod("", ""); }}>Clear date filters</button>
            <small>{firstSessionRows.length} setup scenarios shown · threshold changes execution timing, never eligibility</small>
          </div>

          {firstSessionLoading ? <LoadingSkeleton label="Replaying first-session Absolute Monthly history" rows={5} /> : null}
          {firstSessionError ? <ErrorState title="First-session analysis could not be loaded" detail={firstSessionError} /> : null}
          {!firstSessionLoading && !firstSessionError && firstSessionData ? (
            <>
              <div className={styles.absoluteKpis}>
                <article><span>Entered scenarios</span><strong>{Number(firstSessionTotals.entered ?? 0)}</strong><small>{Number(firstSessionTotals.unfilled ?? 0)} significant gaps never filled · not trades</small></article>
                <article data-tone={Number(firstSessionTotals.one_share_end_pnl ?? 0) >= 0 ? "positive" : "negative"}><span>One share each · month-end</span><strong>{money(firstSessionTotals.one_share_end_pnl)}</strong><small>Sum of every entered stock's final-close less entry</small></article>
                <article data-tone="positive"><span>One share each · maximum</span><strong>{money(firstSessionTotals.one_share_max_profit)}</strong><small>Sum of each path's maximum favourable per-share move</small></article>
                <article data-tone="negative"><span>One share each · drawdown</span><strong>{money(firstSessionTotals.one_share_max_drawdown)}</strong><small>Sum of direction-normalised adverse per-share paths</small></article>
              </div>

              <div className={styles.absolutePortfolioStrip}>
                <div><span>₹10,000 per entered stock · invested</span><strong>{money(firstSessionTotals.invested_10000)}</strong><small>Whole shares only; unused cash stays uninvested</small></div>
                <div><span>Month-end / to-date P&amp;L</span><strong data-tone={Number(firstSessionTotals.end_pnl_10000 ?? 0) >= 0 ? "positive" : "negative"}>{money(firstSessionTotals.end_pnl_10000)}</strong><small>{pct(Number(firstSessionTotals.invested_10000) ? Number(firstSessionTotals.end_pnl_10000) / Number(firstSessionTotals.invested_10000) * 100 : null)} on actual invested value</small></div>
                <div><span>Maximum possible P&amp;L</span><strong data-tone="positive">{money(firstSessionTotals.max_profit_10000)}</strong><small>{pct(Number(firstSessionTotals.invested_10000) ? Number(firstSessionTotals.max_profit_10000) / Number(firstSessionTotals.invested_10000) * 100 : null)} aggregate opportunity</small></div>
                <div><span>Maximum drawdown</span><strong data-tone="negative">{money(firstSessionTotals.max_drawdown_10000)}</strong><small>{pct(Number(firstSessionTotals.invested_10000) ? Number(firstSessionTotals.max_drawdown_10000) / Number(firstSessionTotals.invested_10000) * 100 : null)} aggregate adverse path</small></div>
              </div>

              <section className={styles.firstSessionThresholds} aria-label="First-session favourable target attainment and drawdown incidence">
                <header>
                  <div>
                    <span>Success factor · favourable excursion</span>
                    <h3>How many entered stocks traded at least this far above entry?</h3>
                  </div>
                  <small>{firstSessionEvaluable} of {firstSessionEntered} entered trades have evaluable price paths</small>
                </header>
                <div className={styles.thresholdKpiGrid}>
                  {firstSessionThresholds.map((threshold) => {
                    const count = Number(firstSessionTotals[`profit_target_${threshold}_count`] ?? 0);
                    const rate = firstSessionEvaluable ? count * 100 / firstSessionEvaluable : null;
                    return <article key={`profit-${threshold}`} data-tone="positive">
                      <span>Reached +{threshold}%</span>
                      <strong>{count.toLocaleString("en-IN")}</strong>
                      <b>{pct(rate)}</b>
                      <small>{count} of {firstSessionEvaluable} evaluable entered trades</small>
                    </article>;
                  })}
                </div>
                <header className={styles.drawdownHeader}>
                  <div>
                    <span>Risk factor · adverse excursion</span>
                    <h3>How many entered stocks fell at least this far below entry?</h3>
                  </div>
                  <small>Incidence is cumulative: a −10% path also counts at −1%, −2%, −3% and −5%</small>
                </header>
                <div className={styles.thresholdKpiGrid}>
                  {firstSessionThresholds.map((threshold) => {
                    const count = Number(firstSessionTotals[`drawdown_${threshold}_count`] ?? 0);
                    const rate = firstSessionEvaluable ? count * 100 / firstSessionEvaluable : null;
                    return <article key={`drawdown-${threshold}`} data-tone="negative">
                      <span>Reached −{threshold}%</span>
                      <strong>{count.toLocaleString("en-IN")}</strong>
                      <b>{pct(rate)}</b>
                      <small>{count} of {firstSessionEvaluable} evaluable entered trades</small>
                    </article>;
                  })}
                </div>
              </section>

              <div className={styles.absoluteCharts}>
                <article><div className={styles.sectionTitle}><div><span>Monthly ₹10,000 scenarios</span><h2>Final result, opportunity and drawdown</h2></div></div><EChartSurface className={styles.absoluteHistoryChart} option={absoluteFirstSessionHistoryOption(firstSessionData)} ariaLabel="Absolute first-session monthly final profit, maximum profit and maximum drawdown" /></article>
                <article><div className={styles.sectionTitle}><div><span>Yearly summary</span><h2>Threshold-specific performance</h2></div></div><div className={styles.yearSummary}>{firstSessionData.yearlySummary.map((row) => <div key={`${row.year}-${row.gap_threshold_pct}`}><strong>{row.year}</strong><span>{row.entered} entered · {row.winners} winners · {row.unfilled} unfilled</span><b data-tone={Number(row.end_pnl_10000) >= 0 ? "positive" : "negative"}>{money(row.end_pnl_10000)} final</b><small>Max {money(row.max_profit_10000)} · drawdown {money(row.max_drawdown_10000)}</small></div>)}</div></article>
              </div>

              <div className={styles.historyPanel}>
                <div className={styles.sectionTitle}><div><span>Complete first-session evidence</span><h2>Every validator, execution path and outcome</h2><p>Click a stock for daily candles, month dividers, first-session marker and actual entry annotation.</p></div></div>
                <div className={styles.firstSessionScale} aria-label="Row colour scale from minus ten to plus ten percent final return">
                  <span>Final return row scale</span>
                  <i data-band="loss-10">−10%</i><i data-band="loss-1">−1%</i><i data-band="neutral">−1% to +1%</i><i data-band="gain-1">+1%</i><i data-band="gain-10">+10%</i><i data-band="not-entered">Not entered</i>
                </div>
                {firstSessionRows.length ? <div className={styles.tableWrap}><table className={styles.absoluteTable}>
                  <thead><tr><th>Month / stock</th><th>M−2 red</th><th>M−1 green + crossover</th><th>Completed-week validators</th><th>First-session gap</th><th>Entry</th><th>Final close</th><th>Maximum profit</th><th>Maximum drawdown</th><th>₹10,000 scenario</th><th>Status</th></tr></thead>
                  <tbody>{firstSessionRows.map((row) => <tr key={row.candidate_id} className={styles.absoluteFirstSessionRow} style={firstSessionRowStyle(row)} data-entry-status={row.entry_status} data-final-return={Number.isFinite(Number(row.end_return_pct)) ? Number(row.end_return_pct).toFixed(2) : undefined}>
                    <td><button type="button" className={styles.stockChartLink} onClick={() => void openFirstSessionChart(row.candidate_id)}>{row.symbol}</button><small>{monthYear(row.evaluation_month)} · {row.company_name}</small></td>
                    <td><strong className={styles.conditionPass}>✓ {money(row.month_two_close)} &lt; {money(row.month_two_open)}</strong><small>Completed M−2 close / open</small></td>
                    <td><strong className={styles.conditionPass}>✓ {money(row.month_one_close)} &gt; {money(row.month_one_open)}</strong><small>✓ Above M−2 open {money(row.month_two_open)}</small></td>
                    <td><strong className={styles.conditionPass}>✓ {money(row.completed_week_close)} &gt; {money(row.completed_week_open)}</strong><small>✓ Above prior-week open {money(row.prior_week_open)}</small></td>
                    <td><strong data-tone={Number(row.opening_gap_pct) >= Number(row.gap_threshold_pct) ? "negative" : "neutral"}>{pct(row.opening_gap_pct)}</strong><small>{money(row.previous_close)} → {money(row.first_session_open)} · threshold {pct(row.gap_threshold_pct)}</small></td>
                    <td><strong data-status={row.entry_status}>{row.entry_status === "ENTERED" ? money(row.entry_price) : "Not entered"}</strong><small>{label(row.entry_mode)} · {date(row.entry_date)}</small></td>
                    <td><strong data-tone={Number(row.end_return_pct) >= 0 ? "positive" : "negative"}>{money(row.profit_per_share)}/share · {pct(row.end_return_pct)}</strong><small>{money(row.path_end_price)} on {date(row.evaluation_end_date)}</small></td>
                    <td><strong data-tone="positive">{money(row.max_profit_per_share)}/share · {pct(row.max_profit_pct)}</strong><small>{money(row.max_profit_price)} on {date(row.max_profit_date)}</small></td>
                    <td><strong data-tone="negative">{money(row.max_drawdown_per_share)}/share · {pct(row.max_drawdown_pct)}</strong><small>{money(row.max_drawdown_price)} on {date(row.max_drawdown_date)}</small></td>
                    <td><strong data-tone={Number(row.end_pnl_10000) >= 0 ? "positive" : "negative"}>{money(row.end_pnl_10000)} final</strong><small>{row.quantity_10000} shares · invested {money(row.invested_10000)} · max {money(row.max_profit_10000)} · pain {money(row.max_drawdown_10000)}</small></td>
                    <td><strong data-status={row.evaluation_status}>{label(row.evaluation_status)}</strong><small>{row.observed_sessions} observed sessions</small></td>
                  </tr>)}</tbody>
                </table></div> : <CompactEmptyState kind="NO_RESULT" title="No first-session setup for this filter" detail="No recognized F&O stock passed the completed monthly and weekly validators for this period." />}
              </div>
              <div className={styles.absoluteWarnings}>{firstSessionData.warnings.map((warning) => <p key={warning}><ShieldAlert size={15} /> {warning}</p>)}</div>
            </>
          ) : null}
        </section>
      ) : null}

      {historyOnly ? (
        <section className={styles.history}>
          {!evidenceApproved ? (
            <div className={styles.governanceBlock} role="alert">
              <strong>Historical quality evidence is quarantined</strong>
              <p>
                The five-year research source failed exchange-session coverage
                validation. These figures remain visible for audit only and
                must not approve candidates or thresholds until the repaired
                series and indicators are rebuilt.
              </p>
              {backtest.governance?.blocking_reasons?.length ? (
                <small>
                  {backtest.governance.blocking_reasons
                    .map((reason) => label(reason))
                    .join(" · ")}
                </small>
              ) : null}
            </div>
          ) : null}
          <div className={styles.sectionTitle}>
            <div>
              <span>Five-year backtest history</span>
              <h2>High, Medium and Low cohort outcomes</h2>
              <p>{backtest.successDefinition}</p>
            </div>
            <small>
              {date(backtest.periodStart)} – {date(backtest.periodEnd)} · Source
              as of {date(backtest.sourceAsOf)}
            </small>
          </div>

          <div className={styles.historyKpis}>
            <article>
              <span>Complete D+5 episodes</span>
              <strong>{totalBacktests.toLocaleString("en-IN")}</strong>
              <small>{side === "ALL" ? "LONG + SHORT" : side} baseline</small>
            </article>
            <article data-tone="positive">
              <span>Clean +3% successes</span>
              <strong>{totalSuccessful.toLocaleString("en-IN")}</strong>
              <small>
                {pct(
                  totalBacktests
                    ? (totalSuccessful * 100) / totalBacktests
                    : null,
                )}{" "}
                of complete episodes
              </small>
            </article>
            <article data-tone="negative">
              <span>Did not meet success rule</span>
              <strong>{totalFailed.toLocaleString("en-IN")}</strong>
              <small>Includes adverse-first and non-converting paths</small>
            </article>
            <article>
              <span>Evidence source</span>
              <strong>{evidenceApproved ? "Approved V2" : "Quarantined V2"}</strong>
              <small>
                {evidenceApproved ? "Approved" : "Audit only"} through{" "}
                {date(backtest.sourceAsOf)}
              </small>
            </article>
          </div>

          <div className={styles.historyGrid}>
            {historyBands.map((row) => (
              <article
                key={`${row.side}-${row.quality_band}`}
                data-side={row.side}
                data-band={row.quality_band}
              >
                <header>
                  <span>{row.side}</span>
                  <strong>{label(row.quality_band)}</strong>
                </header>
                <div className={styles.outcomeCount}>
                  <b>{Number(row.success_count).toLocaleString("en-IN")}</b>
                  <span>successful</span>
                  <b>{Number(row.failure_count).toLocaleString("en-IN")}</b>
                  <span>failed</span>
                </div>
                <dl>
                  <div>
                    <dt>Episodes</dt>
                    <dd>{Number(row.trades).toLocaleString("en-IN")}</dd>
                  </div>
                  <div>
                    <dt>Clean +1%</dt>
                    <dd>{pct(row.clean_1_pct)}</dd>
                  </div>
                  <div>
                    <dt>Clean +3%</dt>
                    <dd>{pct(row.clean_3_pct)}</dd>
                  </div>
                  <div>
                    <dt>Clean +5%</dt>
                    <dd>{pct(row.clean_5_pct)}</dd>
                  </div>
                  <div>
                    <dt>2% adverse</dt>
                    <dd>{pct(row.adverse_2_pct)}</dd>
                  </div>
                  <div>
                    <dt>Median MFE / MAE</dt>
                    <dd>
                      {pct(row.median_mfe_5d_pct)} /{" "}
                      {pct(row.median_mae_5d_pct)}
                    </dd>
                  </div>
                  <div>
                    <dt>T5/S2 mean</dt>
                    <dd>{pct(row.t5_s2_mean)}</dd>
                  </div>
                  <div>
                    <dt>Profit factor</dt>
                    <dd>{n(row.t5_s2_profit_factor)}×</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          <div className={styles.historyPanel}>
            <div className={styles.sectionTitle}>
              <div>
                <span>Month-by-month stability</span>
                <h2>High and Medium monthly cohorts</h2>
                <p>
                  Each row is grouped by signal Month–Year. Successful and
                  failed counts make weak and strong monthly cohorts explicit;
                  small samples must not be over-interpreted.
                </p>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.historyTable}>
                <thead>
                  <tr>
                    <th>Month–Year</th>
                    <th>Side / band</th>
                    <th>Episodes</th>
                    <th>Successful / failed</th>
                    <th>Clean +3%</th>
                    <th>Clean +5%</th>
                    <th>2% adverse</th>
                    <th>T5/S2 mean</th>
                    <th>Profit factor</th>
                    <th>Median MAE</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyHistory.map((row) => (
                    <tr
                      key={`${row.signal_month}-${row.side}-${row.quality_band}`}
                    >
                      <td>{new Intl.DateTimeFormat("en-IN", {
                        timeZone: "Asia/Kolkata",
                        month: "short",
                        year: "numeric",
                      }).format(new Date(row.signal_month))}</td>
                      <td>
                        <span className={styles.direction} data-side={row.side}>
                          {row.side}
                        </span>{" "}
                        <strong>{label(row.quality_band)}</strong>
                      </td>
                      <td>{Number(row.trades).toLocaleString("en-IN")}</td>
                      <td>
                        <strong data-tone="positive">{Number(row.success_count).toLocaleString("en-IN")}</strong>
                        {" / "}
                        <strong data-tone="negative">{Number(row.failure_count).toLocaleString("en-IN")}</strong>
                      </td>
                      <td>{pct(row.clean_3_pct)}</td>
                      <td>{pct(row.clean_5_pct)}</td>
                      <td>{pct(row.adverse_2_pct)}</td>
                      <td>{pct(row.t5_s2_mean)}</td>
                      <td>{n(row.t5_s2_profit_factor)}×</td>
                      <td>{pct(row.median_mae_5d_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.historyPanel}>
            <div className={styles.sectionTitle}>
              <div>
                <span>Condition evidence</span>
                <h2>Pass versus fail uplift</h2>
                <p>
                  Positive uplift means the condition-pass group had a higher
                  clean +3% rate. Negative values remain visible.
                </p>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.historyTable}>
                <thead>
                  <tr>
                    <th>Side</th>
                    <th>Condition</th>
                    <th>Pass / fail n</th>
                    <th>Pass success</th>
                    <th>Fail success</th>
                    <th>Uplift</th>
                    <th>Pass / fail PF</th>
                    <th>Pass / fail MAE</th>
                  </tr>
                </thead>
                <tbody>
                  {historyConditions.map((row) => (
                    <tr key={`${row.side}-${row.condition_name}`}>
                      <td>
                        <span className={styles.direction} data-side={row.side}>
                          {row.side}
                        </span>
                      </td>
                      <td>
                        <strong>{row.condition_name}</strong>
                      </td>
                      <td>
                        {Number(row.pass_n).toLocaleString("en-IN")} /{" "}
                        {Number(row.fail_n).toLocaleString("en-IN")}
                      </td>
                      <td>{pct(row.pass_clean_3_pct)}</td>
                      <td>{pct(row.fail_clean_3_pct)}</td>
                      <td>
                        <strong
                          data-tone={
                            Number(row.uplift_pp) > 0 ? "positive" : "negative"
                          }
                        >
                          {Number(row.uplift_pp) > 0 ? "+" : ""}
                          {n(row.uplift_pp)} pp
                        </strong>
                      </td>
                      <td>
                        {n(row.pass_profit_factor)}× /{" "}
                        {n(row.fail_profit_factor)}×
                      </td>
                      <td>
                        {pct(row.pass_median_mae_pct)} /{" "}
                        {pct(row.fail_median_mae_pct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.historyPanel}>
            <div className={styles.sectionTitle}>
              <div>
                <span>Indicator correlation</span>
                <h2>Good-versus-bad descriptive relationships</h2>
                <p>
                  Spearman relationships are descriptive and generally weak.
                  They do not establish causality; bounded condition evidence is
                  more decision-useful.
                </p>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.historyTable}>
                <thead>
                  <tr>
                    <th>Side</th>
                    <th>Indicator</th>
                    <th>Sample</th>
                    <th>ρ clean +3%</th>
                    <th>ρ T3/S2</th>
                    <th>Median good</th>
                    <th>Median bad</th>
                    <th>Difference</th>
                    <th>Interpretation</th>
                  </tr>
                </thead>
                <tbody>
                  {historyCorrelations.map((row) => (
                    <tr key={`${row.side}-${row.indicator_name}`}>
                      <td>
                        <span className={styles.direction} data-side={row.side}>
                          {row.side}
                        </span>
                      </td>
                      <td>
                        <strong>{row.indicator_name}</strong>
                      </td>
                      <td>{Number(row.sample_size).toLocaleString("en-IN")}</td>
                      <td>{n(row.spearman_clean_3)}</td>
                      <td>{n(row.spearman_t3_s2)}</td>
                      <td>{n(row.median_good)}</td>
                      <td>{n(row.median_bad)}</td>
                      <td>{n(row.median_difference)}</td>
                      <td>{row.interpretation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {(chartLoading || chartError || weeklyChart || absoluteChart || firstSessionChart) ? (
        <div className={styles.chartBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setWeeklyChart(null); setAbsoluteChart(null); setFirstSessionChart(null); setChartError(null); } }}>
          <section className={styles.weeklyChartDialog} role="dialog" aria-modal="true" aria-label={`${weeklyChart?.candidate.symbol ?? absoluteChart?.candidate.symbol ?? firstSessionChart?.candidate.symbol ?? "Stock"} candlestick chart`}>
            <header>
              <div>
                <span>Rolling Monthly stock evidence</span>
                <h2>{weeklyChart?.candidate.symbol ?? absoluteChart?.candidate.symbol ?? firstSessionChart?.candidate.symbol ?? "Price chart"}</h2>
                <p>
                  {firstSessionChart
                    ? `Daily OHLC candles · amber marks the first session · blue marks ${firstSessionChart.candidate.entry_status === "ENTERED" ? `the ${label(firstSessionChart.candidate.entry_mode)} entry` : "no entry because the significant gap remained unfilled"}`
                    : absoluteChart
                    ? `Daily OHLC candles · calendar-month dividers · blue line and diamond mark the selected entry ${date(absoluteChart.candidate.entry_date)}`
                    : `Weekly OHLC candles · purple dots mark conditions met · blue diamonds and vertical lines mark entries${weeklyChart ? ` · selected signal ${date(weeklyChart.candidate.signalDate)} · entry ${date(weeklyChart.candidate.entryDate)}` : ""}`}
                </p>
              </div>
              <button type="button" aria-label="Close candlestick chart" onClick={() => { setWeeklyChart(null); setAbsoluteChart(null); setFirstSessionChart(null); setChartError(null); }}><X size={20} /></button>
            </header>
            {chartLoading ? <LoadingSkeleton label="Loading stock candles" rows={4} /> : null}
            {chartError ? <ErrorState title="Candlestick chart unavailable" detail={chartError} /> : null}
            {absoluteChart ? (
              <>
                <EChartSurface appearance="light" ariaLabel={`${absoluteChart.candidate.symbol} daily candlestick chart with calendar-month dividers and blue Absolute Monthly entry marker`} className={styles.weeklyChart} option={absoluteMonthlyChartOption(absoluteChart)} />
                <div className={styles.chartEvents} aria-label="Absolute Monthly selected entry and outcome">
                  <article data-selected="true"><span aria-hidden="true" /><div><strong>Selected absolute-month entry</strong><small>{date(absoluteChart.candidate.entry_date)} at {money(absoluteChart.candidate.entry_price)} · closes {date(absoluteChart.candidate.evaluation_end_date)}</small></div><em>{pct(absoluteChart.candidate.end_return_pct)} end / to-date · {pct(absoluteChart.candidate.max_profit_pct)} max · {pct(absoluteChart.candidate.max_drawdown_pct)} drawdown</em></article>
                </div>
                <footer><span>{absoluteChart.bars.length} daily candles · {absoluteChart.source}</span><Link to={`/analytics/stock/${encodeURIComponent(String(absoluteChart.candidate.symbol))}?strategy=absolute-monthly&asOf=${absoluteChart.candidate.signal_date}`}>Open full Stock 360</Link></footer>
              </>
            ) : null}
            {firstSessionChart ? (
              <>
                <EChartSurface appearance="light" ariaLabel={`${firstSessionChart.candidate.symbol} daily candles with first-session and gap-aware entry markers`} className={styles.weeklyChart} option={absoluteFirstSessionChartOption(firstSessionChart)} />
                <div className={styles.chartEvents} aria-label="Absolute first-session entry and outcome">
                  <article data-selected="true"><span aria-hidden="true" /><div><strong>{firstSessionChart.candidate.entry_status === "ENTERED" ? "Selected first-session scenario" : "No trade · gap unfilled"}</strong><small>First session {date(firstSessionChart.candidate.first_session_date)} · gap {pct(firstSessionChart.candidate.opening_gap_pct)} · threshold {pct(firstSessionChart.candidate.gap_threshold_pct)} · entry {date(firstSessionChart.candidate.entry_date)} at {money(firstSessionChart.candidate.entry_price)}</small></div><em>{pct(firstSessionChart.candidate.end_return_pct)} final · {pct(firstSessionChart.candidate.max_profit_pct)} max · {pct(firstSessionChart.candidate.max_drawdown_pct)} drawdown</em></article>
                </div>
                <footer><span>{firstSessionChart.bars.length} daily candles · {firstSessionChart.source}</span><Link to={`/analytics/stock/${encodeURIComponent(String(firstSessionChart.candidate.symbol))}?strategy=absolute-first-session&asOf=${firstSessionChart.candidate.first_session_date}`}>Open full Stock 360</Link></footer>
              </>
            ) : null}
            {weeklyChart ? (
              <>
                <EChartSurface appearance="light" ariaLabel={`${weeklyChart.candidate.symbol} weekly candlestick and volume chart with historical Rolling Monthly condition and blue entry markers`} className={styles.weeklyChart} option={weeklyChartOption(weeklyChart)} />
                <div className={styles.chartEvents} aria-label="Rolling Monthly qualification and entry events">
                  {(weeklyChart.qualificationEvents ?? []).map((event) => (
                    <article key={`${event.candidateId}-${event.signalDate}`} data-selected={event.selected}>
                      <span aria-hidden="true" />
                      <div>
                        <strong>{event.selected ? "Selected event" : `${monthYear(event.signalDate)} event`} · {event.side}</strong>
                        <small>Conditions met {date(event.signalDate)} · entry {date(event.entryDate)} at {money(event.entryPrice)}</small>
                      </div>
                      <em>{event.entryEligible ? "Entry eligible" : `Not entered · ${label(event.entryRejectionReason || event.qualityBand)}`}</em>
                    </article>
                  ))}
                </div>
                <footer>
                  <span>{weeklyChart.bars.length} weekly candles · {weeklyChart.qualificationEvents.length} current/past condition event(s) · {weeklyChart.source}</span>
                  <Link to={`/analytics/stock/${encodeURIComponent(weeklyChart.candidate.symbol)}?strategy=rolling-monthly&asOf=${weeklyChart.candidate.signalExpiryDate}`}>Open full Stock 360</Link>
                </footer>
              </>
            ) : null}
          </section>
        </div>
      ) : null}

      {evidenceOnly ? (
        <section className={styles.evidence}>
          <div className={styles.sectionTitle}>
            <div>
              <span>Five-year supplied fixture</span>
              <h2>Baseline versus High quality</h2>
              <p>
                Research evidence is contextual—not a current signal and not
                pristine untouched out-of-sample validation.
              </p>
            </div>
            <small>Fixture through 07 Aug 2026</small>
          </div>
          <div className={styles.evidenceGrid}>
            {["LONG", "SHORT"].map((direction) => {
              const baseClean = metric(
                data,
                direction,
                "BASELINE",
                "clean_3pct_5d_pct",
              );
              const highClean = metric(
                data,
                direction,
                "HIGH",
                "clean_3pct_5d_pct",
              );
              const basePf = metric(
                data,
                direction,
                "BASELINE",
                "profit_factor_t5_s2",
              );
              const highPf = metric(
                data,
                direction,
                "HIGH",
                "profit_factor_t5_s2",
              );
              return (
                <article key={direction} data-side={direction}>
                  <h3>{direction} strategy</h3>
                  <div>
                    <span>Clean 3% by D+5</span>
                    <strong>
                      {n(baseClean?.metric_value)}% <b>→</b>{" "}
                      {n(highClean?.metric_value)}%
                    </strong>
                    <small>
                      {baseClean?.sample_size} baseline ·{" "}
                      {highClean?.sample_size} High
                    </small>
                  </div>
                  <div>
                    <span>T5/S2 gross profit factor</span>
                    <strong>
                      {n(basePf?.metric_value)}× <b>→</b>{" "}
                      {n(highPf?.metric_value)}×
                    </strong>
                    <small>Before costs; daily OHLC stop-first model</small>
                  </div>
                </article>
              );
            })}
          </div>
          <div className={styles.ruleColumns}>
            <article>
              <h3>Bullish LONG</h3>
              <p>
                All six bullish scanner conditions, then VIX contraction,
                moderate NIFTY DI and at least 3% weekly follow-through. High
                also requires the EMA200 extension test.
              </p>
              <strong>Deployment: shadow only</strong>
            </article>
            <article>
              <h3>Bearish SHORT</h3>
              <p>
                All six bearish scanner conditions, moderate bearish NIFTY
                breadth, controlled scanner density and at least five of eight
                confirmations for High.
              </p>
              <strong>Deployment: research candidate only</strong>
            </article>
          </div>
        </section>
      ) : null}

      <section className={styles.warnings}>
        <h2>Research limitations</h2>
        <ul>
          {data.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </section>
      <RelatedJourney
        items={[
          {
            id: "stock",
            title: "Stock 360",
            detail: "Inspect price, levels and technical evidence",
            to: nearest[0]
              ? `/analytics/stock/${encodeURIComponent(nearest[0].symbol)}?strategy=rolling-monthly&source=rolling-monthly&asOf=${run.signal_date}`
              : "/analytics/indicators?source=rolling-monthly",
          },
          {
            id: "futures",
            title: "Futures context",
            detail: "Review basis, OI, liquidity and active contracts",
            to: "/futures?strategy=rolling-monthly&source=rolling-monthly",
          },
          {
            id: "quality",
            title: "Data Quality",
            detail: `${run.nifty50_coverage}/50 breadth coverage · ${run.quality_status}`,
            to: "/analytics/system/quality?source=rolling-monthly",
          },
        ]}
      />
      <LearnAboutThisAnalysis
        sections={[
          {
            id: "read",
            title: "How to read this page",
            content: (
              <p>
                High and Medium bands are governed candidates. Low rows are
                diagnostic scanner matches and always remain NO TRADE.
              </p>
            ),
          },
          {
            id: "methodology",
            title: "Methodology and calculation rules",
            content: (
              <p>
                The signal is evaluated only after the completed close, and
                entry economics use the next valid session open. Boolean
                gates—not score rank—authorise a quality band.
              </p>
            ),
          },
          {
            id: "definitions",
            title: "Definitions",
            content: (
              <p>
                LONG and SHORT are separate base strategies with separate gates.
                The numeric score ranks evidence inside the governed gate
                structure.
              </p>
            ),
          },
          {
            id: "sources",
            title: "Data sources and freshness",
            content: (
              <p>
                Inputs come from canonical daily bars, active NFO membership,
                effective NIFTY 50 membership and sector reference data.
              </p>
            ),
          },
          {
            id: "limitations",
            title: "Limitations and assumptions",
            content: (
              <p>
                Current F&O membership is not point-in-time historical
                membership. SHORT uses the documented cash-underlying proxy, and
                daily OHLC cannot resolve same-bar target/stop chronology.
              </p>
            ),
          },
          {
            id: "version",
            title: "Formula and model version",
            content: (
              <p>
                {data.factorId} · {data.factorVersion}. This page has no Paper
                Trading or broker-order connection.
              </p>
            ),
          },
        ]}
      />
    </main>
  );
}
