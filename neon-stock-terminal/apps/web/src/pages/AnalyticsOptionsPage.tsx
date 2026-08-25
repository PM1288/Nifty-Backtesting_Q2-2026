import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { EChartsOption } from "echarts";
import { useWorkspaceEngagement, useWorkspaceSectionViews } from "../analytics/useWorkspaceAnalytics";
import {
  ButtonSecondary,
  ChartCard,
  DataState,
  DataTable,
  PageIntroAccordion,
  SectionDivider,
  StatusBadge,
  ToggleGroup
} from "../components/ui/DashboardPrimitives";
import { EChartSurface } from "../components/visual/EChartSurface";
import { fetchOptionChainAnalytics } from "../lib/api";
import { trackAnalyticsEvent, trackCtaClick } from "../lib/analytics";
import { useObservedQueryTiming, usePageLoadProfile } from "../analytics/usePageLoadProfile";
import type { AnalyticsParams } from "../analytics/types";
import { useI18n } from "../i18n/LocaleProvider";
import { formatCompactIN, formatDateIST, formatNumberIN, formatPercent, formatTime as formatClockTime } from "../lib/format";
import type {
  AccentToken,
  OptionChainAnalyticsAtmComboPoint,
  OptionChainAnalyticsPayload,
  OptionChainAnalyticsResponse,
  OptionChainCompareOk,
  OptionChainLeg
} from "../lib/types";
import { AnalyticsHeader, ExplainThis, OPTIONS_SECTION_TABS, toneFromNumber, useAnalyticsExperienceMode } from "./AnalyticsChrome";
import styles from "./AnalyticsPage.module.css";

type GroupedOptionRow = {
  strike: number;
  ce: OptionChainLeg | null;
  pe: OptionChainLeg | null;
  isAtm: boolean;
};

type LocalTab = "snapshot" | "equilibrium" | "combo" | "diagnostics";

const TAB_OPTIONS: Array<{ label: string; value: LocalTab }> = [
  { label: "Snapshot", value: "snapshot" },
  { label: "Equilibrium", value: "equilibrium" },
  { label: "ATM Combo", value: "combo" },
  { label: "Diagnostics", value: "diagnostics" }
];

const WINDOW_OPTIONS = [120, 240, 480] as const;
const REFRESH_OPTIONS = [120_000, 300_000, 600_000] as const;

function numeric(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatPoints(value: number | null | undefined, digits = 2) {
  const parsed = numeric(value);
  if (parsed == null) return "—";
  return formatNumberIN(parsed, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatSignedPoints(value: number | null | undefined, digits = 2) {
  const parsed = numeric(value);
  if (parsed == null) return "—";
  const sign = parsed > 0 ? "+" : "";
  return `${sign}${formatPoints(parsed, digits)}`;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return formatClockTime(date);
}

function minutesSince(timestamp: string | null | undefined) {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return (Date.now() - parsed) / 60_000;
}

function sumValues(values: Array<number | null | undefined>) {
  return values.reduce<number>((total, value) => total + (numeric(value) ?? 0), 0);
}

function groupLegs(legs: OptionChainLeg[], atmStrike: number | null | undefined): GroupedOptionRow[] {
  const grouped = new Map<number, GroupedOptionRow>();
  for (const leg of legs) {
    const strike = numeric(leg.strike);
    if (strike == null) continue;
    const existing = grouped.get(strike) ?? {
      strike,
      ce: null,
      pe: null,
      isAtm: numeric(atmStrike) === strike
    };
    if (leg.optionType === "CE") existing.ce = leg;
    if (leg.optionType === "PE") existing.pe = leg;
    grouped.set(strike, existing);
  }
  return Array.from(grouped.values()).sort((left, right) => left.strike - right.strike);
}

function legMap(legs: OptionChainLeg[]) {
  return new Map(legs.map((leg) => [`${leg.strike}:${leg.optionType}`, leg] as const));
}

function straddleFromRow(row: GroupedOptionRow | null | undefined) {
  if (!row) return null;
  const ce = numeric(row.ce?.lastPrice);
  const pe = numeric(row.pe?.lastPrice);
  if (ce == null && pe == null) return null;
  return (ce ?? 0) + (pe ?? 0);
}

function determineSnapshotTone(payload: OptionChainAnalyticsPayload, compare: OptionChainCompareOk | null): AccentToken {
  const current = numeric(payload.snapshot.underlyingValue);
  const previous = numeric(compare?.snapshot.underlyingValue);
  if (current == null || previous == null) return "white";
  return toneFromNumber(current - previous);
}

function overlayOpacityFromRequestedMinutes(requestedMinutes: number) {
  if (requestedMinutes <= 10) return 0.6;
  if (requestedMinutes <= 20) return 0.5;
  if (requestedMinutes <= 30) return 0.4;
  if (requestedMinutes <= 40) return 0.3;
  if (requestedMinutes <= 50) return 0.2;
  if (requestedMinutes <= 60) return 0.1;
  const extraSteps = Math.max(0, Math.floor((requestedMinutes - 60) / 10));
  return Math.max(0.02, 0.1 - extraSteps * 0.02);
}

function overlayLabel(compareEntry: OptionChainCompareOk) {
  return `~${formatPoints(compareEntry.actualAgoMinutes, 1)}m`;
}

function overlaySummary(
  compareSeries: OptionChainCompareOk[],
  t: (key: string, fallback?: string, values?: Record<string, string | number>) => string,
) {
  if (!compareSeries.length) {
    return t(
      "Historical CE and PE overlays are unavailable for the current expiry window.",
      "Historical CE and PE overlays are unavailable for the current expiry window.",
    );
  }
  return t(
    "Historical CE and PE overlays use the nearest stored snapshots from {{windows}}.",
    "Historical CE and PE overlays use the nearest stored snapshots from {{windows}}.",
    { windows: compareSeries.map((entry) => overlayLabel(entry)).join(", ") },
  );
}

function equilibriumSummary(
  payload: OptionChainAnalyticsPayload,
  t: (key: string, fallback?: string, values?: Record<string, string | number>) => string,
) {
  const dominance = payload.equilibrium.currentDominance;
  const spread = payload.equilibrium.currentSpread;
  if (spread == null) {
    return t(
      "The CE and PE baskets do not have enough aligned data yet. Use the snapshot ladder as descriptive context only.",
      "The CE and PE baskets do not have enough aligned data yet. Use the snapshot ladder as descriptive context only.",
    );
  }
  if (Math.abs(spread) <= payload.equilibrium.epsilon) {
    return t(
      "CE and PE baskets are trading close to equilibrium, with only {{points}} normalized points between them.",
      "CE and PE baskets are trading close to equilibrium, with only {{points}} normalized points between them.",
      { points: formatPoints(Math.abs(spread), 2) },
    );
  }
  if (dominance === "CE dominant") {
    return t(
      "Call-side basket strength is leading by {{points}} normalized points, which usually means upside option pressure is heavier than put demand.",
      "Call-side basket strength is leading by {{points}} normalized points, which usually means upside option pressure is heavier than put demand.",
      { points: formatPoints(spread, 2) },
    );
  }
  return t(
    "Put-side basket strength is leading by {{points}} normalized points, which usually means downside hedging demand is dominating the window.",
    "Put-side basket strength is leading by {{points}} normalized points, which usually means downside hedging demand is dominating the window.",
    { points: formatPoints(Math.abs(spread), 2) },
  );
}

function comboSummary(
  payload: OptionChainAnalyticsPayload,
  t: (key: string, fallback?: string, values?: Record<string, string | number>) => string,
) {
  const delta = payload.atmCombo.currentDelta;
  if (delta == null) {
    return t(
      "ATM combo versus open is unavailable for the current session. Check the latest ladder row for direct CE and PE pricing instead.",
      "ATM combo versus open is unavailable for the current session. Check the latest ladder row for direct CE and PE pricing instead.",
    );
  }
  if (delta > 0) {
    return t(
      "The ATM combo is {{delta}} points above session open, which means the current ATM premium basket is pricing more intraday uncertainty than it did at the open.",
      "The ATM combo is {{delta}} points above session open, which means the current ATM premium basket is pricing more intraday uncertainty than it did at the open.",
      { delta: formatSignedPoints(delta) },
    );
  }
  if (delta < 0) {
    return t(
      "The ATM combo is {{delta}} points below session open, which means the current ATM premium basket is pricing less intraday uncertainty than it did at the open.",
      "The ATM combo is {{delta}} points below session open, which means the current ATM premium basket is pricing less intraday uncertainty than it did at the open.",
      { delta: formatSignedPoints(delta) },
    );
  }
  return t(
    "The ATM combo is sitting near its session-open baseline, so option pricing pressure is broadly balanced right now.",
    "The ATM combo is sitting near its session-open baseline, so option pricing pressure is broadly balanced right now.",
  );
}

function buildOiChartOption(rows: GroupedOptionRow[], compareSeries: OptionChainCompareOk[], tr: (value: string) => string): EChartsOption {
  const dashedLine = "dashed" as const;
  const series: EChartsOption["series"] = [
    {
      name: tr("CE OI"),
      type: "bar",
      itemStyle: { color: "#00b26a", borderRadius: 0 },
      data: rows.map((row) => numeric(row.ce?.oi))
    },
    {
      name: tr("PE OI"),
      type: "bar",
      itemStyle: { color: "#b9414a", borderRadius: 0 },
      data: rows.map((row) => numeric(row.pe?.oi))
    },
    ...compareSeries.flatMap((compareEntry) => {
      const compareMap = legMap(compareEntry.legs);
      const opacity = overlayOpacityFromRequestedMinutes(compareEntry.requestedMinutes);
      const label = overlayLabel(compareEntry);
      return [
        {
          name: `${tr("CE OI")} (${label})`,
          type: "line" as const,
          symbol: "none",
          smooth: true,
          lineStyle: { color: `rgba(0,178,106,${opacity})`, type: dashedLine, width: 1.25 },
          data: rows.map((row) => numeric(compareMap.get(`${row.strike}:CE`)?.oi))
        },
        {
          name: `${tr("PE OI")} (${label})`,
          type: "line" as const,
          symbol: "none",
          smooth: true,
          lineStyle: { color: `rgba(185,65,74,${opacity})`, type: dashedLine, width: 1.25 },
          data: rows.map((row) => numeric(compareMap.get(`${row.strike}:PE`)?.oi))
        }
      ];
    })
  ];
  return {
    tooltip: { trigger: "axis" },
    legend: { bottom: 0, data: [tr("CE OI"), tr("PE OI")] },
    grid: { top: 18, left: 104, right: 18, bottom: 88 },
    xAxis: {
      type: "category",
      name: tr("Strike (pts)"),
      nameGap: 28,
      data: rows.map((row) => formatNumberIN(row.strike, { maximumFractionDigits: 0 }))
    },
    yAxis: {
      type: "value",
      name: tr("Open interest (contracts)"),
      nameLocation: "middle",
      nameRotate: 90,
      nameGap: 72,
      axisLabel: {
        formatter: (value: number) => formatCompactIN(value)
      }
    },
    series
  };
}

function buildIvChartOption(rows: GroupedOptionRow[], compareSeries: OptionChainCompareOk[], tr: (value: string) => string): EChartsOption {
  const dashedLine = "dashed" as const;
  const series: EChartsOption["series"] = [
    {
      name: tr("CE IV"),
      type: "line",
      symbol: "none",
      smooth: true,
      lineStyle: { color: "#00b26a", width: 2 },
      data: rows.map((row) => numeric(row.ce?.iv))
    },
    {
      name: tr("PE IV"),
      type: "line",
      symbol: "none",
      smooth: true,
      lineStyle: { color: "#b9414a", width: 2 },
      data: rows.map((row) => numeric(row.pe?.iv))
    },
    ...compareSeries.flatMap((compareEntry) => {
      const compareMap = legMap(compareEntry.legs);
      const opacity = overlayOpacityFromRequestedMinutes(compareEntry.requestedMinutes);
      const label = overlayLabel(compareEntry);
      return [
        {
          name: `${tr("CE IV")} (${label})`,
          type: "line" as const,
          symbol: "none",
          smooth: true,
          lineStyle: { color: `rgba(0,178,106,${opacity})`, type: dashedLine, width: 1.25 },
          data: rows.map((row) => numeric(compareMap.get(`${row.strike}:CE`)?.iv))
        },
        {
          name: `${tr("PE IV")} (${label})`,
          type: "line" as const,
          symbol: "none",
          smooth: true,
          lineStyle: { color: `rgba(185,65,74,${opacity})`, type: dashedLine, width: 1.25 },
          data: rows.map((row) => numeric(compareMap.get(`${row.strike}:PE`)?.iv))
        }
      ];
    })
  ];
  return {
    tooltip: { trigger: "axis" },
    legend: { bottom: 0, data: [tr("CE IV"), tr("PE IV")] },
    grid: { top: 18, left: 104, right: 18, bottom: 88 },
    xAxis: {
      type: "category",
      name: tr("Strike (pts)"),
      nameGap: 28,
      data: rows.map((row) => formatNumberIN(row.strike, { maximumFractionDigits: 0 }))
    },
    yAxis: {
      type: "value",
      name: tr("Implied volatility (%)"),
      nameLocation: "middle",
      nameRotate: 90,
      nameGap: 72,
      axisLabel: {
        formatter: (value: number) => `${formatNumberIN(value, { maximumFractionDigits: 1 })}%`
      }
    },
    series
  };
}

function buildEquilibriumOption(payload: OptionChainAnalyticsPayload, tr: (value: string) => string): EChartsOption {
  const dashedLine = "dashed" as const;
  const crossoverPoints = payload.equilibrium.points
    .filter((point) => point.crossoverFlag || point.equilibriumFlag)
    .map((point) => ({
      name: formatTime(point.capturedAt),
      coord: [formatTime(point.capturedAt), point.ceAggregateNorm ?? point.peAggregateNorm ?? 50],
      value: point.equilibriumSpread ?? undefined
    }));

  return {
    tooltip: { trigger: "axis" },
    legend: { bottom: 0 },
    grid: { top: 18, left: 104, right: 18, bottom: 88 },
    xAxis: {
      type: "category",
      name: tr("Time"),
      nameGap: 28,
      data: payload.equilibrium.points.map((point) => formatTime(point.capturedAt))
    },
    yAxis: {
      type: "value",
      name: tr("Normalized value (0-100)"),
      nameLocation: "middle",
      nameRotate: 90,
      nameGap: 72,
      min: 0,
      max: 100
    },
    series: [
      {
        name: tr("CE basket"),
        type: "line",
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#00b26a", width: 2.5 },
        data: payload.equilibrium.points.map((point) => numeric(point.ceAggregateNorm)),
        markLine: {
          symbol: "none",
          lineStyle: { color: "rgba(255,255,255,0.22)", type: dashedLine },
          data: [{ yAxis: 50, name: tr("Midline") }]
        },
        markPoint: crossoverPoints.length
          ? {
              symbol: "circle",
              symbolSize: 10,
              itemStyle: { color: "#c9a44c" },
              data: crossoverPoints
            }
          : undefined
      },
      {
        name: tr("PE basket"),
        type: "line",
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#b9414a", width: 2.5 },
        data: payload.equilibrium.points.map((point) => numeric(point.peAggregateNorm))
      }
    ]
  };
}

function buildAtmComboOption(points: OptionChainAnalyticsAtmComboPoint[], openCombo: number | null, tr: (value: string) => string): EChartsOption {
  const dashedLine = "dashed" as const;
  const atmShiftMarkers = points
    .filter((point): point is OptionChainAnalyticsAtmComboPoint & { atmCombo: number; atmStrike: number } => point.atmStrikeChanged && point.atmCombo != null && point.atmStrike != null)
    .map((point) => ({
      name: formatTime(point.capturedAt),
      coord: [formatTime(point.capturedAt), point.atmCombo],
      value: point.atmStrike ?? undefined
    }));

  return {
    tooltip: { trigger: "axis" },
    legend: { bottom: 0 },
    grid: { top: 18, left: 104, right: 18, bottom: 88 },
    xAxis: {
      type: "category",
      name: tr("Time"),
      nameGap: 28,
      data: points.map((point) => formatTime(point.capturedAt))
    },
    yAxis: {
      type: "value",
      name: tr("Combo value (pts)"),
      nameLocation: "middle",
      nameRotate: 90,
      nameGap: 72
    },
    series: [
      {
        name: tr("ATM CE+PE combo"),
        type: "line",
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#f0f0f0", width: 2.5 },
        data: points.map((point) => numeric(point.atmCombo)),
        markLine: openCombo == null
          ? undefined
          : {
              symbol: "none",
              lineStyle: { color: "rgba(201,164,76,0.75)", type: dashedLine },
              data: [{ yAxis: openCombo, name: tr("Session open combo") }]
            },
        markPoint: atmShiftMarkers.length
          ? {
              symbol: "circle",
              symbolSize: 8,
              itemStyle: { color: "#c9a44c" },
              data: atmShiftMarkers
            }
          : undefined
      }
    ]
  };
}

function buildComboDeltaOption(points: OptionChainAnalyticsAtmComboPoint[], tr: (value: string) => string): EChartsOption {
  const dashedLine = "dashed" as const;
  return {
    tooltip: { trigger: "axis" },
    legend: { bottom: 0 },
    grid: { top: 18, left: 104, right: 18, bottom: 88 },
    xAxis: {
      type: "category",
      name: tr("Time"),
      nameGap: 28,
      data: points.map((point) => formatTime(point.capturedAt))
    },
    yAxis: {
      type: "value",
      name: tr("Delta vs open (pts)"),
      nameLocation: "middle",
      nameRotate: 90,
      nameGap: 72
    },
    series: [
      {
        name: tr("Combo delta"),
        type: "bar",
        itemStyle: {
          borderRadius: 0,
          color: (params: any) => (Number(params?.value ?? 0) >= 0 ? "#00b26a" : "#b9414a")
        },
        data: points.map((point) => numeric(point.comboDelta)),
        markLine: {
          symbol: "none",
          lineStyle: { color: "rgba(255,255,255,0.22)", type: dashedLine },
          data: [{ yAxis: 0, name: tr("Open baseline") }]
        }
      }
    ]
  };
}

export function AnalyticsOptionsPage() {
  const { t, tr } = useI18n();
  const { mode } = useAnalyticsExperienceMode();
  const [tab, setTab] = useState<LocalTab>("snapshot");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshMs, setRefreshMs] = useState<number>(120_000);
  const [seriesMinutes, setSeriesMinutes] = useState<number>(240);
  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null);

  const analytics = useQuery({
    queryKey: ["option-chain-analytics", selectedExpiry, seriesMinutes],
    queryFn: () => fetchOptionChainAnalytics({ expiry: selectedExpiry, minutes: seriesMinutes, compareMinutes: 10, strikesAround: 3 }),
    refetchInterval: autoRefresh ? refreshMs : false,
    staleTime: 30_000
  });

  useObservedQueryTiming("option-chain-analytics", analytics, true);
  usePageLoadProfile({
    pageName: "analytics_options",
    enabled: true,
    queries: [{ name: "option-chain-analytics", isLoading: analytics.isLoading, isError: !!analytics.error }]
  });

  const data: OptionChainAnalyticsResponse | null = analytics.data ?? null;
  const payload = data?.analytics ?? null;
  const compare: OptionChainCompareOk | null = data?.compare?.ok === true ? data.compare : null;
  const compareSeries = useMemo(
    () =>
      ((data?.compareSeries?.length ? data.compareSeries : compare ? [compare] : []) ?? [])
        .filter((entry) => entry.ok === true)
        .sort((left, right) => left.requestedMinutes - right.requestedMinutes),
    [compare, data?.compareSeries],
  );
  const controlsRef = useRef<HTMLElement | null>(null);
  const summaryRef = useRef<HTMLElement | null>(null);
  const snapshotRef = useRef<HTMLElement | null>(null);
  const equilibriumRef = useRef<HTMLElement | null>(null);
  const comboRef = useRef<HTMLElement | null>(null);
  const diagnosticsRef = useRef<HTMLElement | null>(null);
  const nextStepsRef = useRef<HTMLElement | null>(null);
  const engagementExtrasRef = useRef<AnalyticsParams>({});

  const optionAnalyticsContext = useMemo(
    () => ({
      page_name: "option_chain",
      page_family: "market",
      section: tab,
      page_path: "/options",
      selected_expiry: payload?.expiryContext.selectedExpiry,
      atm_strike: payload?.expiryContext.currentAtmStrike ?? undefined,
      dominant_side: payload?.equilibrium.currentDominance,
      strike_window_size: payload?.strikeWindow.strikes.length ?? undefined,
    }),
    [
      payload?.equilibrium.currentDominance,
      payload?.expiryContext.currentAtmStrike,
      payload?.expiryContext.selectedExpiry,
      payload?.strikeWindow.strikes.length,
      tab,
    ],
  );

  const sectionRefs = useMemo(
    () => ({
      option_controls: controlsRef,
      option_summary: summaryRef,
      option_snapshot: snapshotRef,
      option_equilibrium: equilibriumRef,
      option_combo: comboRef,
      option_diagnostics: diagnosticsRef,
      option_next_steps: nextStepsRef,
    }),
    [],
  );

  useWorkspaceSectionViews(sectionRefs, optionAnalyticsContext, "option_chain_section_view", Boolean(payload));
  useWorkspaceEngagement(optionAnalyticsContext, "option_chain_engagement", Boolean(payload), {
    extraParams: engagementExtrasRef,
  });

  const groupedRows = useMemo(() => groupLegs(payload?.legs ?? [], payload?.strikeWindow.baseAtmStrike), [payload?.legs, payload?.strikeWindow.baseAtmStrike]);
  const atmRow = useMemo(() => groupedRows.find((row) => row.isAtm) ?? null, [groupedRows]);
  const atmIndex = groupedRows.findIndex((row) => row.isAtm);
  const ladderRows = useMemo(() => {
    if (mode !== "beginner" || atmIndex < 0) return groupedRows;
    return groupedRows.slice(Math.max(0, atmIndex - 5), Math.min(groupedRows.length, atmIndex + 6));
  }, [atmIndex, groupedRows, mode]);

  const ceOi = useMemo(() => sumValues(groupedRows.map((row) => row.ce?.oi)), [groupedRows]);
  const peOi = useMemo(() => sumValues(groupedRows.map((row) => row.pe?.oi)), [groupedRows]);
  const pcr = ceOi > 0 ? peOi / ceOi : null;
  const atmStraddle = straddleFromRow(atmRow);
  const compareRows = useMemo(() => (compare ? groupLegs(compare.legs, compare.snapshot.atmStrike) : []), [compare]);
  const previousAtmRow = useMemo(() => compareRows.find((row) => row.isAtm) ?? null, [compareRows]);
  const previousStraddle = straddleFromRow(previousAtmRow);
  const straddleChange = atmStraddle != null && previousStraddle != null ? atmStraddle - previousStraddle : null;
  const underlyingChange =
    numeric(payload?.snapshot.underlyingValue) != null && numeric(compare?.snapshot.underlyingValue) != null
      ? (numeric(payload?.snapshot.underlyingValue) ?? 0) - (numeric(compare?.snapshot.underlyingValue) ?? 0)
      : null;

  const freshnessMinutes = minutesSince(payload?.snapshot.capturedAt);
  const statusTone: AccentToken = data?.watcherState.lastError || (freshnessMinutes != null && freshnessMinutes > 10) ? "red" : "green";
  const statusLabel =
    data?.watcherState.lastError != null
      ? "Data issue"
      : freshnessMinutes != null && freshnessMinutes > 10
        ? "Snapshot delayed"
        : "Current snapshot";
  const summaryTone = payload ? determineSnapshotTone(payload, compare) : "white";

  const oiChartOption = useMemo(() => buildOiChartOption(groupedRows, compareSeries, tr), [compareSeries, groupedRows, tr]);
  const ivChartOption = useMemo(() => buildIvChartOption(groupedRows, compareSeries, tr), [compareSeries, groupedRows, tr]);
  const equilibriumOption = useMemo(() => (payload ? buildEquilibriumOption(payload, tr) : {}), [payload, tr]);
  const comboOption = useMemo(() => (payload ? buildAtmComboOption(payload.atmCombo.points, payload.atmCombo.openCombo, tr) : {}), [payload, tr]);
  const comboDeltaOption = useMemo(() => (payload ? buildComboDeltaOption(payload.atmCombo.points, tr) : {}), [payload, tr]);

  const tableColumns = useMemo(() => {
    const base = [
      {
        key: "strike",
        header: "Strike",
        cell: (row: GroupedOptionRow) => (
          <div className={styles.headline}>
            <strong className={styles.strong}>{formatNumberIN(row.strike, { maximumFractionDigits: 0 })}</strong>
            {row.isAtm ? <StatusBadge label="ATM" tone="white" /> : null}
          </div>
        ),
        sortValue: (row: GroupedOptionRow) => row.strike
      },
      {
        key: "ceLtp",
        header: "CE LTP",
        align: "right" as const,
        cell: (row: GroupedOptionRow) => formatPoints(row.ce?.lastPrice),
        sortValue: (row: GroupedOptionRow) => row.ce?.lastPrice ?? null
      },
      {
        key: "ceChange",
        header: "CE Δ day",
        align: "right" as const,
        cell: (row: GroupedOptionRow) => formatSignedPoints(row.ce?.change),
        sortValue: (row: GroupedOptionRow) => row.ce?.change ?? null
      },
      {
        key: "peLtp",
        header: "PE LTP",
        align: "right" as const,
        cell: (row: GroupedOptionRow) => formatPoints(row.pe?.lastPrice),
        sortValue: (row: GroupedOptionRow) => row.pe?.lastPrice ?? null
      },
      {
        key: "peChange",
        header: "PE Δ day",
        align: "right" as const,
        cell: (row: GroupedOptionRow) => formatSignedPoints(row.pe?.change),
        sortValue: (row: GroupedOptionRow) => row.pe?.change ?? null
      },
      {
        key: "ceOi",
        header: "CE OI",
        align: "right" as const,
        cell: (row: GroupedOptionRow) => formatCompactIN(row.ce?.oi),
        sortValue: (row: GroupedOptionRow) => row.ce?.oi ?? null
      },
      {
        key: "peOi",
        header: "PE OI",
        align: "right" as const,
        cell: (row: GroupedOptionRow) => formatCompactIN(row.pe?.oi),
        sortValue: (row: GroupedOptionRow) => row.pe?.oi ?? null
      },
      {
        key: "atmCombo",
        header: "CE+PE",
        align: "right" as const,
        cell: (row: GroupedOptionRow) => (row.isAtm ? formatPoints(straddleFromRow(row)) : "—"),
        sortValue: (row: GroupedOptionRow) => straddleFromRow(row) ?? null
      }
    ];

    if (mode === "beginner") return base;

    return [
      ...base,
      {
        key: "ceIv",
        header: "CE IV",
        align: "right" as const,
        cell: (row: GroupedOptionRow) => formatPercent(row.ce?.iv, 1, false),
        sortValue: (row: GroupedOptionRow) => row.ce?.iv ?? null
      },
      {
        key: "peIv",
        header: "PE IV",
        align: "right" as const,
        cell: (row: GroupedOptionRow) => formatPercent(row.pe?.iv, 1, false),
        sortValue: (row: GroupedOptionRow) => row.pe?.iv ?? null
      },
      {
        key: "ceDelta",
        header: "CE Δ",
        align: "right" as const,
        cell: (row: GroupedOptionRow) => formatPoints(row.ce?.delta, 4),
        sortValue: (row: GroupedOptionRow) => row.ce?.delta ?? null
      },
      {
        key: "peDelta",
        header: "PE Δ",
        align: "right" as const,
        cell: (row: GroupedOptionRow) => formatPoints(row.pe?.delta, 4),
        sortValue: (row: GroupedOptionRow) => row.pe?.delta ?? null
      },
      {
        key: "ceGamma",
        header: "CE Γ",
        align: "right" as const,
        cell: (row: GroupedOptionRow) => formatPoints(row.ce?.gamma, 4),
        sortValue: (row: GroupedOptionRow) => row.ce?.gamma ?? null
      },
      {
        key: "peGamma",
        header: "PE Γ",
        align: "right" as const,
        cell: (row: GroupedOptionRow) => formatPoints(row.pe?.gamma, 4),
        sortValue: (row: GroupedOptionRow) => row.pe?.gamma ?? null
      }
    ];
  }, [mode]);

  if (analytics.isLoading && !payload) {
    return (
      <DataState
        kind="loading"
        title={tr("Loading option-chain analytics")}
        body={tr("The latest expiry context, equilibrium basket, and ATM combo series are being prepared.")}
      />
    );
  }

  if ((analytics.error && !payload) || !payload) {
    return (
      <DataState
        kind="error"
        title={tr("Option-chain analytics are unavailable")}
        body={tr("The latest option analytics could not load. Refresh and try again.")}
        action={<ButtonSecondary onClick={() => void analytics.refetch()}>{tr("Retry options analytics")}</ButtonSecondary>}
      />
    );
  }

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title={tr("Option Snapshot")}
        subtitle={tr("Keep the option ladder inside the same learning shell. Start with expiry context, then read equilibrium, ATM combo, and strike detail without leaving the current workflow.")}
        meta={`${tr("Trade date")} ${formatDateIST(payload.tradeDate)}`}
        learningPrompt={
          mode === "beginner"
            ? tr("Read the expiry card and dominance first, then move to equilibrium and ATM combo. Use the ladder only after the charts tell you where option pressure is leaning.")
            : tr("Use the equilibrium and combo tabs first, then inspect IV, OI, and the strike ladder to confirm whether the move is positioning-driven or just premium noise.")
        }
        sectionTabs={[...OPTIONS_SECTION_TABS]}
      />

      <SectionDivider
        eyebrow="Options"
        title={tr("Expiry context, equilibrium, and ATM premium pressure")}
        subtitle={tr("Track expiry context, option balance, and ATM premium pressure through the current session.")}
      />

      <section ref={controlsRef} data-analytics-section="option_controls" className={styles.chartPanel}>
        <div className={styles.toggleRow}>
          <div className={styles.toggleGroup}>
            <StatusBadge label={tr(statusLabel)} tone={statusTone} />
            <StatusBadge label={`${tr("Updated")} ${formatTime(payload.snapshot.capturedAt)}`} tone="white" />
            <StatusBadge label={`${tr("Expiry")} ${payload.expiryContext.selectedExpiry}`} tone="white" />
            <StatusBadge label={`${tr("ATM")} ${formatPoints(payload.expiryContext.currentAtmStrike, 0)}`} tone="white" />
          </div>
          <ButtonSecondary
            onClick={() => {
              void trackAnalyticsEvent("option_chain_view", { source: "manual_refresh" });
              void analytics.refetch();
            }}
          >
            {tr("Refresh now")}
          </ButtonSecondary>
        </div>

        <div className={styles.controlGrid}>
          <label className={styles.checkboxField}>
            <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
            <span>{tr("Auto refresh")}</span>
          </label>

          <label className={styles.field}>
            <span>{tr("Refresh cadence")}</span>
            <select className={styles.input} value={String(refreshMs)} onChange={(event) => setRefreshMs(Number(event.target.value))} disabled={!autoRefresh}>
              {REFRESH_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {tr(value === 120_000 ? "Every 2 minutes" : value === 300_000 ? "Every 5 minutes" : "Every 10 minutes")}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>{tr("Selected expiry")}</span>
            <select
              className={styles.input}
              value={selectedExpiry ?? payload.expiryContext.selectedExpiry}
              onChange={(event) => {
                const next = event.target.value || null;
                engagementExtrasRef.current = { interacted_control: true, interaction_type: "expiry_change" };
                void trackAnalyticsEvent("expiry_change", { expiry: next ?? payload.expiryContext.selectedExpiry });
                setSelectedExpiry(next);
              }}
            >
              {payload.availableExpiries.map((expiry) => (
                <option key={expiry} value={expiry}>
                  {expiry}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>{tr("Intraday window")}</span>
            <select
              className={styles.input}
              value={String(seriesMinutes)}
              onChange={(event) => {
                const next = Number(event.target.value);
                engagementExtrasRef.current = { interacted_control: true, interaction_type: "combo_window_change" };
                void trackAnalyticsEvent("atm_combo_window_change", { window_minutes: next });
                setSeriesMinutes(next);
              }}
            >
              {WINDOW_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {tr("Last")} {value} {tr("minutes")}
                </option>
              ))}
            </select>
          </label>

          <ToggleGroup
            label={tr("View")}
            value={tab}
            options={TAB_OPTIONS.map((option) => ({ ...option, label: tr(option.label) }))}
            onChange={(next) => {
              engagementExtrasRef.current = {
                interacted_control: true,
                interaction_type: "tab_change",
                selected_tab: next,
              };
              void trackAnalyticsEvent("option_chain_tab_change", { tab: next });
              setTab(next);
            }}
          />
        </div>

        <div className={styles.chartCaption}>
          {tr("The strike window follows the current ATM and keeps the nearest listed strikes on both sides for a consistent read across tabs.")}
        </div>
      </section>

      <section ref={summaryRef} data-analytics-section="option_summary" className={styles.metricGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("Spot")}</div>
          <div className={styles.metricValue} data-tone={summaryTone}>{formatPoints(payload.expiryContext.currentSpot)}</div>
          <div className={styles.metricHint}>{compare && underlyingChange != null ? `${formatSignedPoints(underlyingChange)} ${tr("vs prior snapshot")}` : tr("Current Nifty spot in points")}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("DTE")}</div>
          <div className={styles.metricValue} data-tone="white">{payload.expiryContext.dteDays == null ? "—" : `${formatPoints(payload.expiryContext.dteDays, 2)}d`}</div>
          <div className={styles.metricHint}>{payload.expiryContext.dteHours == null ? tr("Expiry timing unavailable") : `${formatPoints(payload.expiryContext.dteHours, 1)} ${tr("hours remaining")}`}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("ATM strike")}</div>
          <div className={styles.metricValue} data-tone="white">{formatPoints(payload.expiryContext.currentAtmStrike, 0)}</div>
          <div className={styles.metricHint}>{formatSignedPoints(payload.expiryContext.spotToAtmDistance)} {tr("spot-to-ATM distance")}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("Current dominance")}</div>
          <div className={styles.metricValue} data-tone={payload.equilibrium.currentDominance === "CE dominant" ? "green" : payload.equilibrium.currentDominance === "PE dominant" ? "red" : "white"}>
            {tr(payload.equilibrium.currentDominance)}
          </div>
          <div className={styles.metricHint}>{tr("Spread")} {formatPoints(payload.equilibrium.currentSpread, 2)} {tr("normalized points")}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("ATM combo")}</div>
          <div className={styles.metricValue} data-tone={toneFromNumber(payload.atmCombo.currentDelta)}>{formatPoints(payload.atmCombo.currentCombo)}</div>
          <div className={styles.metricHint}>{payload.atmCombo.currentDelta == null ? tr("Combo delta unavailable") : `${formatSignedPoints(payload.atmCombo.currentDelta)} ${tr("vs open")}`}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("Last crossover")}</div>
          <div className={styles.metricValue} data-tone="white">{payload.expiryContext.lastCrossoverAt ? formatTime(payload.expiryContext.lastCrossoverAt) : "—"}</div>
          <div className={styles.metricHint}>{tr("Gold marker appears when CE/PE baskets converge or cross")}</div>
        </div>
      </section>

      {tab === "snapshot" ? (
        <>
          <section ref={snapshotRef} data-analytics-section="option_snapshot" className={styles.panel}>
            <h2 className={styles.panelTitle}>{tr("Current options context")}</h2>
            <div className={styles.signalGrid}>
              <div className={styles.signalItem}>
                <div>
                    <div className={styles.strong}>{tr("Balance first")}</div>
                  <div className={styles.muted}>{equilibriumSummary(payload, t)}</div>
                </div>
              </div>
              <div className={styles.signalItem}>
                <div>
                    <div className={styles.strong}>{tr("ATM pressure")}</div>
                  <div className={styles.muted}>{comboSummary(payload, t)}</div>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.summaryGrid}>
            <ExplainThis
              label={tr("Equilibrium")}
              summary={tr("Equilibrium compares normalized CE and PE baskets around ATM ± 3 listed strikes.")}
              detail={tr("When the CE and PE aggregates converge, the option ladder is close to balanced. When one side pulls away, that side is dominating the premium surface.")}
              takeaway={tr("Use equilibrium as a pressure read, not as a standalone trade trigger.")}
            />
            <ExplainThis
              label={tr("ATM combo")}
              summary={tr("ATM combo is the CE LTP plus PE LTP at the current dynamic ATM strike.")}
              detail={tr("It is a simple way to read how much premium the market is charging around the current spot at each timestamp.")}
              takeaway={tr("Combo versus session open helps you separate rising uncertainty from fading premium.")}
            />
            <ExplainThis
              label={tr("Strike window")}
              summary={tr("The page uses the nearest listed ATM strike and its three neighboring strikes on both sides.")}
              detail={tr("If spot sits exactly between two listed strikes, the lower strike is chosen consistently to avoid ambiguous flips.")}
              takeaway={tr("The same strike window drives the ladder, equilibrium chart, and summary cards.")}
            />
          </section>

          <section className={styles.grid2}>
            <ChartCard
              title={tr("Open interest by strike")}
              subtitle={tr("Current expiry OI basket with dashed CE and PE overlays from the nearest stored snapshots across the last hour when available.")}
              meta={<StatusBadge label={`PCR ${pcr == null ? "—" : formatPoints(pcr, 3)}`} tone="white" />}
            >
              <EChartSurface ariaLabel="Open interest by strike chart" className={styles.chartSurface} option={oiChartOption} />
            </ChartCard>

            <ChartCard
              title={tr("Implied volatility by strike")}
              subtitle={tr("Read whether option pricing pressure is concentrated in calls, puts, or both, with the nearest stored CE and PE overlays across the last hour.")}
              meta={
                <StatusBadge
                  label={`${tr("Window")} ${payload.strikeWindow.strikes[0]}-${payload.strikeWindow.strikes[payload.strikeWindow.strikes.length - 1]}`}
                  tone="white"
                />
              }
            >
              <EChartSurface ariaLabel="Implied volatility by strike chart" className={styles.chartSurface} option={ivChartOption} />
            </ChartCard>
          </section>

          <DataTable
            title={tr(mode === "beginner" ? "Focused option ladder" : "Option ladder")}
            subtitle={tr(mode === "beginner" ? "Beginner mode keeps the table focused on ATM and nearby strikes. Advanced mode shows IV and Greeks too." : "Advanced mode exposes IV and Greeks so you can inspect whether the surface change is price, volatility, or convexity.")}
            columns={tableColumns}
            rows={ladderRows}
            emptyTitle={tr("No strikes are available")}
            emptyBody={tr("No strike rows are available for the selected expiry right now.")}
            footer={
              mode === "beginner"
                ? tr("Switch to Advanced audience mode in the page header if you need the extended strike diagnostics.")
                : overlaySummary(compareSeries, t)
            }
            tableName="options_ladder"
          />
        </>
      ) : null}

      {tab === "equilibrium" ? (
        <>
          <ChartCard
            title={tr("Option Equilibrium Around ATM")}
            subtitle={tr("Normalized CE versus PE basket around ATM ± 3 listed strikes for the selected expiry.")}
            footer={`${tr("Current side dominance")}: ${tr(payload.equilibrium.currentDominance)}. ${tr("Epsilon threshold for near-equilibrium is")} ${formatPoints(payload.equilibrium.epsilon, 0)} ${tr("normalized points")}.`}
          >
            <EChartSurface ariaLabel="Option equilibrium chart" className={styles.chartSurfaceTall} option={equilibriumOption} />
          </ChartCard>

          <section ref={equilibriumRef} data-analytics-section="option_equilibrium" className={styles.panel}>
            <h2 className={styles.panelTitle}>{tr("Equilibrium read")}</h2>
            <div className={styles.signalGrid}>
              <div className={styles.signalItem}>
                <div>
                    <div className={styles.strong}>{tr("Current spread")}</div>
                  <div className={styles.muted}>{equilibriumSummary(payload, t)}</div>
                </div>
              </div>
              <div className={styles.signalItem}>
                <div>
                    <div className={styles.strong}>{tr("Latest strike snapshot")}</div>
                    <div className={styles.muted}>{tr("Each row below shows the current CE and PE close values and their intraday normalized positions within the same strike series.")}</div>
                </div>
              </div>
            </div>
          </section>

          <DataTable
            title={tr("Normalized strike snapshot")}
            subtitle={tr("Current CE and PE closes in points, plus each series normalized to its own intraday range.")}
            tableName="options_equilibrium_snapshot"
            columns={[
              { key: "strike", header: tr("Strike"), cell: (row) => formatNumberIN(row.strike, { maximumFractionDigits: 0 }), sortValue: (row) => row.strike },
              { key: "ceClose", header: tr("CE close"), align: "right", cell: (row) => formatPoints(row.ceClose), sortValue: (row) => row.ceClose ?? null },
              { key: "ceNorm", header: tr("CE norm"), align: "right", cell: (row) => formatPoints(row.ceNorm, 1), sortValue: (row) => row.ceNorm ?? null },
              { key: "peClose", header: tr("PE close"), align: "right", cell: (row) => formatPoints(row.peClose), sortValue: (row) => row.peClose ?? null },
              { key: "peNorm", header: tr("PE norm"), align: "right", cell: (row) => formatPoints(row.peNorm, 1), sortValue: (row) => row.peNorm ?? null }
            ]}
            rows={payload.equilibrium.latestStrikes}
            emptyTitle={tr("No normalized strike snapshot")}
            emptyBody={tr("There is no aligned CE/PE strike window available for the current snapshot.")}
          />
        </>
      ) : null}

      {tab === "combo" ? (
        <>
          <section ref={comboRef} data-analytics-section="option_combo" className={styles.grid2}>
            <ChartCard
              title={tr("ATM CE+PE Combo")}
              subtitle={tr("Current dynamic ATM CE plus PE premium for the selected expiry, with the session-open combo as the reference line.")}
              meta={<StatusBadge label={`${tr("Open")} ${formatPoints(payload.atmCombo.openCombo)}`} tone="white" />}
            >
              <EChartSurface ariaLabel="ATM combo chart" className={styles.chartSurfaceTall} option={comboOption} />
            </ChartCard>
            <ChartCard
              title={tr("ATM Combo Direction / Delta from Open")}
              subtitle={tr("Histogram of combo value versus the first valid ATM combo print of the session.")}
              meta={<StatusBadge label={`${tr("Current")} ${formatSignedPoints(payload.atmCombo.currentDelta)}`} tone={toneFromNumber(payload.atmCombo.currentDelta)} />}
            >
              <EChartSurface ariaLabel="ATM combo delta chart" className={styles.chartSurfaceTall} option={comboDeltaOption} />
            </ChartCard>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>{tr("ATM combo interpretation")}</h2>
            <div className={styles.signalGrid}>
              <div className={styles.signalItem}>
                <div>
                    <div className={styles.strong}>{tr("Session-open baseline")}</div>
                    <div className={styles.muted}>{tr("The dashed line stays at the first valid combo print of the session, so the chart reads current premium pressure relative to the open rather than in isolation.")}</div>
                </div>
              </div>
              <div className={styles.signalItem}>
                <div>
                    <div className={styles.strong}>{tr("Dynamic ATM")}</div>
                    <div className={styles.muted}>{tr("ATM strike is recalculated from the current stored spot at each timestamp. Gold points mark timestamps where the ATM strike changed within the session.")}</div>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {tab === "diagnostics" ? (
        <>
          <section ref={diagnosticsRef} data-analytics-section="option_diagnostics" className={styles.metricGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>{tr("Freshness")}</div>
              <div className={styles.metricValue} data-tone={statusTone}>{payload.diagnostics.freshnessMinutes == null ? "—" : `${formatPoints(payload.diagnostics.freshnessMinutes, 1)}m`}</div>
              <div className={styles.metricHint}>{tr("Latest snapshot age")}</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>{tr("Strike window size")}</div>
              <div className={styles.metricValue} data-tone="white">{formatNumberIN(payload.diagnostics.strikeWindowSize)}</div>
              <div className={styles.metricHint}>{payload.strikeWindow.strikes.join(" / ")}</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>{tr("Missing CE series")}</div>
              <div className={styles.metricValue} data-tone={payload.diagnostics.missingCeSeriesCount > 0 ? "red" : "white"}>{formatNumberIN(payload.diagnostics.missingCeSeriesCount)}</div>
              <div className={styles.metricHint}>{tr("Aligned CE points missing in the selected window")}</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>{tr("Missing PE series")}</div>
              <div className={styles.metricValue} data-tone={payload.diagnostics.missingPeSeriesCount > 0 ? "red" : "white"}>{formatNumberIN(payload.diagnostics.missingPeSeriesCount)}</div>
              <div className={styles.metricHint}>{tr("Aligned PE points missing in the selected window")}</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>{tr("Normalization fallback")}</div>
              <div className={styles.metricValue} data-tone={payload.diagnostics.normalizationFallbackCount > 0 ? "red" : "white"}>{formatNumberIN(payload.diagnostics.normalizationFallbackCount)}</div>
              <div className={styles.metricHint}>{tr("Flat-series fallback to 50 used when max equals min")}</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>{tr("Crossovers found")}</div>
              <div className={styles.metricValue} data-tone="white">{formatNumberIN(payload.diagnostics.crossoverCount)}</div>
              <div className={styles.metricHint}>{tr("Equilibrium or crossover points in the selected session")}</div>
            </div>
          </section>

          <PageIntroAccordion
            label={tr("Diagnostics")}
            title={tr("Data freshness and alignment")}
            body={tr("The diagnostics view keeps the data path honest: it tells you whether the expiry, strike window, and normalized series are aligned cleanly enough to trust the higher-level charts.")}
            defaultOpen={mode === "advanced"}
            widgetId="options_diagnostics_panel"
            items={[
              `${tr("Selected expiry")}: ${payload.expiryContext.selectedExpiry}`,
              `${tr("Latest snapshot")}: ${formatDateIST(payload.diagnostics.latestSnapshotAt, { includeTime: true })}`,
              `Latest poll ok: ${formatDateIST(data?.watcherState.lastPollOkAt, { includeTime: true })}`,
              `${tr("Query mode")}: ${payload.diagnostics.queryMode}`,
              `${tr("Cache mode")}: ${payload.diagnostics.cacheMode}`,
              data?.watcherState.lastError ? `Latest data issue: ${data.watcherState.lastError}` : tr("No active data issues reported.")
            ]}
          />

          <DataTable
            title={tr("Diagnostics checks")}
            subtitle={tr("Operational and data-quality counters used to explain why the charts look the way they do.")}
            tableName="options_diagnostics"
            columns={[
              { key: "metric", header: tr("Metric"), cell: (row) => row.metric, sortValue: (row) => row.metric },
              { key: "value", header: tr("Value"), align: "right", cell: (row) => row.value, sortValue: (row) => row.raw ?? 0 },
              { key: "note", header: tr("Meaning"), cell: (row) => row.note, sortValue: (row) => row.note }
            ]}
            rows={[
              { metric: tr("Trade date"), value: formatDateIST(payload.tradeDate), raw: payload.tradeDate, note: tr("Session used for the current option view") },
              { metric: tr("Current ATM strike"), value: formatPoints(payload.expiryContext.currentAtmStrike, 0), raw: payload.expiryContext.currentAtmStrike ?? 0, note: tr("Nearest listed strike to current spot, lower strike chosen on ties") },
              { metric: tr("Spot-to-ATM distance"), value: formatSignedPoints(payload.expiryContext.spotToAtmDistance), raw: payload.expiryContext.spotToAtmDistance ?? 0, note: tr("Difference between current spot and ATM strike in points") },
              { metric: tr("Timestamp drift"), value: `${formatPoints(payload.diagnostics.timestampDriftSeconds, 0)}s`, raw: payload.diagnostics.timestampDriftSeconds, note: tr("Current implementation uses aligned snapshot rows; non-zero drift indicates future timestamp reconciliation work") },
              { metric: tr("Available strikes"), value: formatNumberIN(payload.diagnostics.strikeCount), raw: payload.diagnostics.strikeCount, note: tr("Distinct strikes available in the latest stored snapshot window") },
              { metric: tr("Strike window"), value: `${payload.strikeWindow.strikes[0]} to ${payload.strikeWindow.strikes[payload.strikeWindow.strikes.length - 1]}`, raw: payload.diagnostics.strikeWindowSize, note: tr("Actual listed strikes used in the analytics basket") }
            ]}
            emptyTitle={tr("No diagnostics data")}
            emptyBody={tr("Diagnostics are unavailable for the current option view.")}
          />
        </>
      ) : null}

      <section ref={nextStepsRef} data-analytics-section="option_next_steps" className={styles.nextSteps}>
        <Link
          to="/analytics/regime"
          className={styles.nextCard}
          onClick={() => {
            engagementExtrasRef.current = { bridge_cta_clicked: true, bridge_cta_name: "open_market_story" };
            void trackCtaClick({
              cta_name: "open_market_story",
              page_section: "option_next_steps",
              page_family: "market",
              page_path: "/options",
            });
          }}
        >
          <span className={styles.promptLabel}>{tr("Context next")}</span>
          <strong>{tr("Open Market Story")}</strong>
          <span className={styles.muted}>{tr("Use the market-structure page to confirm whether option pressure is reinforcing the tape or fighting it.")}</span>
        </Link>
        <Link
          to="/analytics/learn"
          className={styles.nextCard}
          onClick={() => {
            engagementExtrasRef.current = { bridge_cta_clicked: true, bridge_cta_name: "open_strategy_lab" };
            void trackCtaClick({
              cta_name: "open_strategy_lab",
              page_section: "option_next_steps",
              page_family: "market",
              page_path: "/options",
            });
          }}
        >
          <span className={styles.promptLabel}>{tr("Learning next")}</span>
          <strong>{tr("Open OIIS Lab")}</strong>
          <span className={styles.muted}>{tr("Carry the option context into historical evidence before deciding whether this pressure pattern deserves trust.")}</span>
        </Link>
      </section>
    </div>
  );
}
