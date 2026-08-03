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
import { formatDateIST, formatNumber, formatPercent } from "../lib/format";
import { useAnalyticsEventContext } from "../lib/hooks";
import type {
  AnalyticsEventCatalystRow,
  AnalyticsEventContextResponse,
  AnalyticsEventSectorCluster
} from "../lib/types";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import { useI18n } from "../i18n/LocaleProvider";
import { AnalyticsHeader, CATALYSTS_SECTION_TABS } from "./AnalyticsChrome";
import styles from "./AnalyticsFiiFlowPage.module.css";

type RubricItem = { label: string; value: string };
type ChartReading = {
  id: string;
  title: string;
  subtitle: string;
  option: EChartsOption;
  rubric: RubricItem[];
};

const n = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const num = (value: number | null | undefined, digits = 0) =>
  n(value) == null ? "—" : formatNumber(value as number, { maximumFractionDigits: digits });
const fracPct = (value: number | null | undefined, digits = 2, signed = true) =>
  n(value) == null ? "—" : formatPercent((value as number) * 100, digits, signed);
const clean = (value: string | null | undefined) =>
  ((value ?? "").replace(/[_-]+/g, " ").trim() || "Unknown").replace(/\b\w/g, (token) =>
    token.toUpperCase()
  );
const rubric = (items: Array<[string, string]>) =>
  items.map(([label, value]) => ({ label, value }));

function backdropTone(backdrop: string) {
  if (backdrop === "supportive") return "green";
  if (backdrop === "contrarian" || backdrop === "stretched") return "red";
  return "white";
}

function noteTone(cluster: AnalyticsEventSectorCluster | undefined) {
  if (!cluster) return styles.neutral;
  return cluster.confirmsFlow ? styles.positive : styles.warning;
}

function buildHeatmapOption(payload: AnalyticsEventContextResponse): EChartsOption {
  const rows = payload.charts.eventCalendarHeatmap;
  const maxCount = Math.max(1, ...rows.map((row) => row.count));
  const calendarRange =
    rows.length && rows[0] && rows[rows.length - 1]
      ? [rows[0].date, rows[rows.length - 1].date]
      : undefined;
  return {
    animation: false,
    tooltip: { trigger: "item" },
    visualMap: {
      min: 0,
      max: maxCount,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      textStyle: { color: "#98a2b3" },
      inRange: { color: ["#171b23", "#31546f", "#7dcfff"] }
    },
    calendar: {
      range: calendarRange,
      itemStyle: { borderColor: "rgba(255,255,255,0.06)", borderWidth: 1 },
      splitLine: { show: false },
      dayLabel: { color: "#8b93a7" },
      monthLabel: { color: "#8b93a7" },
      yearLabel: { show: true, color: "#c9d2e3" }
    },
    series: [
      {
        type: "heatmap",
        coordinateSystem: "calendar",
        data: rows.map((row) => [row.date, row.count])
      }
    ]
  };
}

function buildScheduleOption(payload: AnalyticsEventContextResponse): EChartsOption {
  const rows = payload.charts.boardMeetingSchedule.slice(0, 16);
  return {
    animation: false,
    grid: { left: 56, right: 18, top: 32, bottom: 74 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.date.slice(5)),
      axisLabel: { color: "#8b93a7", rotate: 24 }
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#8b93a7" },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } }
    },
    series: [
      {
        type: "bar",
        data: rows.map((row) => row.count),
        itemStyle: { color: "#7dcfff" },
        barMaxWidth: 18
      }
    ]
  };
}

function buildCorporateTimelineOption(payload: AnalyticsEventContextResponse): EChartsOption {
  const rows = payload.charts.corporateActionTimeline.slice(0, 14);
  return {
    animation: false,
    grid: { left: 72, right: 18, top: 32, bottom: 56 },
    tooltip: { trigger: "item" },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.date?.slice(5) ?? "—"),
      axisLabel: { color: "#8b93a7", rotate: 24 }
    },
    yAxis: {
      type: "category",
      data: rows.map((row) => row.symbol),
      axisLabel: { color: "#8b93a7" }
    },
    series: [
      {
        type: "scatter",
        symbolSize: 14,
        data: rows.map((row, index) => ({
          value: [row.date?.slice(5) ?? "—", row.symbol, index],
          itemStyle: {
            color:
              row.timingType === "ex-date"
                ? "#f4d35e"
                : row.timingType === "announcement date"
                  ? "#ff9f68"
                  : "#6de29b"
          },
          name: `${row.symbol} • ${row.purpose}`
        }))
      }
    ]
  };
}

function buildDealSectorOption(payload: AnalyticsEventContextResponse): EChartsOption {
  const rows = payload.charts.blockBulkDealValueBySector.slice(0, 12);
  return {
    animation: false,
    grid: { left: 56, right: 18, top: 32, bottom: 86 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.sectorName),
      axisLabel: { color: "#8b93a7", rotate: 24 }
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#8b93a7", formatter: "{value} cr" },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } }
    },
    series: [
      {
        name: "Bulk",
        type: "bar",
        data: rows.map((row) => row.bulkValueCr),
        itemStyle: { color: "#7dcfff" },
        barMaxWidth: 18
      },
      {
        name: "Block",
        type: "bar",
        data: rows.map((row) => row.blockValueCr),
        itemStyle: { color: "#ff9f68" },
        barMaxWidth: 18
      }
    ]
  };
}

function buildDensityOption(payload: AnalyticsEventContextResponse): EChartsOption {
  const rows = payload.charts.eventDensityVsForwardReturn.slice(-45);
  return {
    animation: false,
    grid: { left: 56, right: 18, top: 32, bottom: 56 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.tradeDate.slice(5)),
      axisLabel: { color: "#8b93a7" }
    },
    yAxis: [
      {
        type: "value",
        axisLabel: { color: "#8b93a7" },
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } }
      },
      {
        type: "value",
        axisLabel: { color: "#8b93a7", formatter: "{value}%" }
      }
    ],
    series: [
      {
        name: "Event count",
        type: "bar",
        data: rows.map((row) => row.eventCount),
        itemStyle: { color: "#f4d35e" },
        barMaxWidth: 14
      },
      {
        name: "Forward 5d",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        data: rows.map((row) => (row.avgForwardReturn5d ?? 0) * 100),
        lineStyle: { color: "#6de29b", width: 2 },
        itemStyle: { color: "#6de29b" }
      }
    ]
  };
}

function buildOverlayOption(payload: AnalyticsEventContextResponse): EChartsOption {
  const rows = payload.charts.institutionalContextOverlayBySector.slice(0, 10);
  return {
    animation: false,
    grid: { left: 56, right: 18, top: 32, bottom: 86 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.sectorName),
      axisLabel: { color: "#8b93a7", rotate: 24 }
    },
    yAxis: [
      {
        type: "value",
        axisLabel: { color: "#8b93a7" },
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } }
      },
      {
        type: "value",
        axisLabel: { color: "#8b93a7", formatter: "{value} cr" }
      }
    ],
    series: [
      {
        name: "Event count",
        type: "bar",
        data: rows.map((row) => row.eventCount),
        itemStyle: { color: "#7dcfff" },
        barMaxWidth: 16
      },
      {
        name: "Deal value",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        data: rows.map((row) => row.dealValueCr),
        lineStyle: { color: "#ff9f68", width: 2 },
        itemStyle: { color: "#ff9f68" }
      }
    ]
  };
}

function buildCharts(
  payload: AnalyticsEventContextResponse,
  tr: (value: string) => string
): ChartReading[] {
  const topUpcoming = payload.upcomingCatalysts[0];
  const topRecent = payload.recentCatalysts[0];
  const topSector = payload.sectorClusters[0];
  const densityTail = payload.charts.eventDensityVsForwardReturn.at(-1);

  return [
    {
      id: "heatmap",
      title: tr("event calendar heatmap"),
      subtitle: tr(
        "Read event clustering first, then drill down into which catalysts are actually informative."
      ),
      option: buildHeatmapOption(payload),
      rubric: rubric([
        [
          tr("1. What this chart is measuring."),
          tr(
            "The count of persisted catalyst rows by calendar date across event schedules, announcements, results, deals, and corporate actions."
          )
        ],
        [
          tr("2. Why traders or analysts care about it."),
          tr(
            "It helps you see when the information load is actually dense enough to change watchlists and sector risk."
          )
        ],
        [
          tr("3. What the axes mean and what units are used."),
          tr("The calendar cells are dates. The unit is event count per day, not price movement or importance.")
        ],
        [
          tr("4. What a bullish reading looks like."),
          tr(
            "A dense event cluster is only bullish if the cluster contains informative catalysts and price or volume confirm the move after the event."
          )
        ],
        [
          tr("5. What a bearish reading looks like."),
          tr(
            "A dense negative catalyst window with weak tape and poor follow-through is bearish because event risk is compounding."
          )
        ],
        [
          tr("6. What a neutral or indecisive reading looks like."),
          tr(
            "A busy calendar full of low-information meetings, filings, or duplicate notices is neutral because event count is high but signal quality is low."
          )
        ],
        [
          tr("7. What can fool the reader or produce a false signal."),
          tr(
            "Duplicate announcements, schedule updates, and ex-date versus announcement-date confusion can all inflate density without adding new information."
          )
        ],
        [
          tr("8. What todays reading says."),
          tr(
            `The current cluster is led by ${topUpcoming?.symbol ?? "—"} ahead and ${topRecent?.symbol ?? "—"} behind, with ${num(payload.summary.upcomingCount, 0)} upcoming and ${num(payload.summary.recentCount, 0)} recent catalysts in the active watch window.`
          )
        ],
        [
          tr("9. What confirms this reading elsewhere on the dashboard."),
          tr(
            `The sector overlay also shows ${topSector?.sectorName ?? "the top sector"} carrying the heaviest catalyst concentration, so the density is not purely random.`
          )
        ],
        [
          tr("10. What contradicts this reading elsewhere on the dashboard."),
          tr(
            "The trust rule still says to trust price over timing, so a busy date cluster without price follow-through contradicts any attempt to turn density into causation."
          )
        ],
        [
          tr('11. One short teaching note beginning with "How to read:".'),
          tr("How to read: count tells you when attention should rise, but only catalyst quality and follow-through tell you whether the date matters.")
        ]
      ])
    },
    {
      id: "schedule",
      title: tr("board-meeting / result schedule"),
      subtitle: tr("Treat result and board dates as risk windows, not automatic breakout triggers."),
      option: buildScheduleOption(payload),
      rubric: rubric([
        [
          tr("1. What this chart is measuring."),
          tr("The count of scheduled board meetings, result windows, and schedule-type calendar items by date.")
        ],
        [
          tr("2. Why traders or analysts care about it."),
          tr("It shows where overnight information risk is stacking up so position sizing and watchlists can adjust.")
        ],
        [
          tr("3. What the axes mean and what units are used."),
          tr("X-axis is date. Y-axis is the number of scheduled event rows on that date.")
        ],
        [
          tr("4. What a bullish reading looks like."),
          tr("A bullish reading is not the count itself; it is when strong price and volume confirmation appear around a result-heavy date.")
        ],
        [
          tr("5. What a bearish reading looks like."),
          tr("A bearish reading appears when crowded result windows meet weak tape, because bad reactions can spill across names or sectors.")
        ],
        [
          tr("6. What a neutral or indecisive reading looks like."),
          tr("A date with many meetings but no confirmed follow-through is neutral because scheduling alone does not reveal directional outcome.")
        ],
        [
          tr("7. What can fool the reader or produce a false signal."),
          tr("Board meeting date, result publication time, and effective market reaction often differ, so timing mismatches can mislead the user.")
        ],
        [
          tr("8. What todays reading says."),
          tr(
            `The schedule is front-loaded around ${topUpcoming?.eventDate ? formatDateIST(topUpcoming.eventDate) : "the nearest cluster"}, which means the next sessions should be treated as catalyst windows rather than quiet baseline tape.`
          )
        ],
        [
          tr("9. What confirms this reading elsewhere on the dashboard."),
          tr("Upcoming catalyst cards show these dates tied to named symbols, so the schedule is backed by actual watchlist items instead of abstract counts.")
        ],
        [
          tr("10. What contradicts this reading elsewhere on the dashboard."),
          tr("If recent catalysts already failed to move price, the same schedule density can become noise rather than tradable information.")
        ],
        [
          tr('11. One short teaching note beginning with "How to read:".'),
          tr("How to read: use this chart to know when risk clusters, then use price action to decide whether that risk is paying off.")
        ]
      ])
    },
    {
      id: "corp-actions",
      title: tr("corporate-action timeline"),
      subtitle: tr("Separate ex-dates, record dates, and announcement dates before you infer anything from the move."),
      option: buildCorporateTimelineOption(payload),
      rubric: rubric([
        [
          tr("1. What this chart is measuring."),
          tr("Recent corporate-action rows plotted by date and symbol with the stored timing tag attached.")
        ],
        [
          tr("2. Why traders or analysts care about it."),
          tr("Adjusted-price mechanics, dividend gaps, and split or bonus dates can distort setup readings if timing fields are mixed together.")
        ],
        [
          tr("3. What the axes mean and what units are used."),
          tr("X-axis is corporate-action date. Y-axis is symbol. Each point is one stored action row.")
        ],
        [
          tr("4. What a bullish reading looks like."),
          tr("Bullish comes from price and liquidity response after the action-related window, not from the action row by itself.")
        ],
        [
          tr("5. What a bearish reading looks like."),
          tr("Bearish appears when traders misread mechanical price adjustments as real weakness or when the event exposes weak sponsorship.")
        ],
        [
          tr("6. What a neutral or indecisive reading looks like."),
          tr("Most corporate-action rows are neutral until post-event price behavior proves otherwise.")
        ],
        [
          tr("7. What can fool the reader or produce a false signal."),
          tr("Adjusted-price errors and ex-date versus announcement-date confusion are the biggest false-signal sources here.")
        ],
        [
          tr("8. What todays reading says."),
          tr(
            `The latest corporate-action tape is dominated by ${payload.charts.corporateActionTimeline[0]?.symbol ?? "—"}, and the page explicitly tags whether the row is an ex-date, record date, or announcement date.`
          )
        ],
        [
          tr("9. What confirms this reading elsewhere on the dashboard."),
          tr("Recent catalyst cards repeat the same action rows with tradeability notes, so the timeline is supported by the narrative watchlist layer.")
        ],
        [
          tr("10. What contradicts this reading elsewhere on the dashboard."),
          tr("The context rule still warns that timing alone is not causation, so any price move without broader confirmation should be treated as mechanical first.")
        ],
        [
          tr('11. One short teaching note beginning with "How to read:".'),
          tr("How to read: before you judge price, confirm which date field the row represents and whether the chart is showing information or mechanics.")
        ]
      ])
    },
    {
      id: "deals",
      title: tr("block/bulk deal value by sector"),
      subtitle: tr("Large prints matter only when value, sector context, and follow-through line up."),
      option: buildDealSectorOption(payload),
      rubric: rubric([
        [
          tr("1. What this chart is measuring."),
          tr("Recent bulk and block deal value aggregated by sector in crore rupees.")
        ],
        [
          tr("2. Why traders or analysts care about it."),
          tr("It shows where large negotiated activity is concentrating so traders can decide whether the print is likely informational or just mechanically large.")
        ],
        [
          tr("3. What the axes mean and what units are used."),
          tr("X-axis is sector. Y-axis is trade value in crore rupees, split between bulk and block categories.")
        ],
        [
          tr("4. What a bullish reading looks like."),
          tr("Bullish is when a sector receives large prints and the same sector also shows healthy price behavior and follow-through.")
        ],
        [
          tr("5. What a bearish reading looks like."),
          tr("Bearish is when outsized deal value appears in weak sectors and price still fails to stabilize afterward.")
        ],
        [
          tr("6. What a neutral or indecisive reading looks like."),
          tr("Neutral is when the print is large but the sector shows no supporting movement, making the deal look more logistical than informational.")
        ],
        [
          tr("7. What can fool the reader or produce a false signal."),
          tr("Block deals can be mechanically large and still say little about conviction, especially if they are off-market transfers or one-off ownership reshuffles.")
        ],
        [
          tr("8. What todays reading says."),
          tr(
            `The heaviest deal pocket is ${payload.charts.blockBulkDealValueBySector[0]?.sectorName ?? "—"} at ${num(payload.charts.blockBulkDealValueBySector[0]?.totalValueCr, 2)} crore total, which is meaningful enough for a watchlist but not enough for causation by itself.`
          )
        ],
        [
          tr("9. What confirms this reading elsewhere on the dashboard."),
          tr("The sector-cluster list and recent-catalyst cards repeat the same sectors and names, so the value cluster is supported by broader event context.")
        ],
        [
          tr("10. What contradicts this reading elsewhere on the dashboard."),
          tr("The page still warns that large prints can be mechanically large but not informationally important, so value alone cannot overrule weak price behavior.")
        ],
        [
          tr('11. One short teaching note beginning with "How to read:".'),
          tr("How to read: a big print tells you where to look, not what to believe.")
        ]
      ])
    },
    {
      id: "density",
      title: tr("event-density vs forward return"),
      subtitle: tr("This is the expectancy chart: useful for context, dangerous for overclaiming causation."),
      option: buildDensityOption(payload),
      rubric: rubric([
        [
          tr("1. What this chart is measuring."),
          tr("Daily event density against the average stored forward 5-day return for that day’s signal set.")
        ],
        [
          tr("2. Why traders or analysts care about it."),
          tr("It helps separate the presence of many catalysts from whether those catalysts historically translated into useful follow-through.")
        ],
        [
          tr("3. What the axes mean and what units are used."),
          tr("X-axis is trade date. Left Y-axis is event count. Right Y-axis is average forward 5-day return in percent.")
        ],
        [
          tr("4. What a bullish reading looks like."),
          tr("Bullish is when higher-quality event clusters are followed by positive forward returns often enough to create expectancy, not just noise.")
        ],
        [
          tr("5. What a bearish reading looks like."),
          tr("Bearish is when dense event days repeatedly fail to produce positive follow-through, showing that catalysts are crowding risk rather than improving expectancy.")
        ],
        [
          tr("6. What a neutral or indecisive reading looks like."),
          tr("Neutral is when forward returns stay mixed even as event counts rise and fall.")
        ],
        [
          tr("7. What can fool the reader or produce a false signal."),
          tr("Lookahead leakage, small samples, and regime drift can all make event-density statistics look cleaner than they really are.")
        ],
        [
          tr("8. What todays reading says."),
          tr(
            `The latest density sample shows ${num(densityTail?.eventCount, 0)} events with an average stored 5-day forward return of ${fracPct(densityTail?.avgForwardReturn5d, 2, true)}, which is context for expectancy rather than a live setup.`
          )
        ],
        [
          tr("9. What confirms this reading elsewhere on the dashboard."),
          tr("The trust rule and data-quality flags both reinforce that signal presence and signal quality must be separated before you trust the history.")
        ],
        [
          tr("10. What contradicts this reading elsewhere on the dashboard."),
          tr("A strong current catalyst list can still contradict weak historical density expectancy if the present tape is confirming more strongly than the old sample average.")
        ],
        [
          tr('11. One short teaching note beginning with "How to read:".'),
          tr("How to read: ask whether many events have actually paid off before you treat a busy calendar as edge.")
        ]
      ])
    },
    {
      id: "overlay",
      title: tr("institutional-context overlay by sector"),
      subtitle: tr("This chart asks whether event clusters are supported by the current participant-flow backdrop."),
      option: buildOverlayOption(payload),
      rubric: rubric([
        [
          tr("1. What this chart is measuring."),
          tr("Sector-level event clustering compared with sector-level deal value, read against the current institutional backdrop tag.")
        ],
        [
          tr("2. Why traders or analysts care about it."),
          tr("It shows whether the most catalyst-heavy sectors are also carrying enough capital attention to matter for next-session watchlists.")
        ],
        [
          tr("3. What the axes mean and what units are used."),
          tr("X-axis is sector. Left Y-axis is event count. Right Y-axis is recent deal value in crore rupees.")
        ],
        [
          tr("4. What a bullish reading looks like."),
          tr("Bullish is when a sector has meaningful event clustering, supportive deal context, and the broader institutional backdrop is not fighting the move.")
        ],
        [
          tr("5. What a bearish reading looks like."),
          tr("Bearish is when clustering piles into sectors that are also facing contrarian or stretched participant context, raising the odds of disappointment.")
        ],
        [
          tr("6. What a neutral or indecisive reading looks like."),
          tr("Neutral is when sectors cluster on events but neither deal value nor institutional backdrop add much confirmation.")
        ],
        [
          tr("7. What can fool the reader or produce a false signal."),
          tr("Sector overlays can look convincing even when the participant data is one day old and the deals are mechanically large, so timing mismatch matters.")
        ],
        [
          tr("8. What todays reading says."),
          tr(
            `The top overlay sector is ${topSector?.sectorName ?? "—"} with ${num(topSector?.eventCount, 0)} catalysts and ${num(topSector?.dealValueCr, 2)} crore of deal context, while the institutional backdrop is currently tagged ${clean(payload.summary.institutionalBackdrop)}.`
          )
        ],
        [
          tr("9. What confirms this reading elsewhere on the dashboard."),
          tr("The catalyst lists and deal-sector chart point to the same sectors, so the overlay is confirmed by both event and transaction context.")
        ],
        [
          tr("10. What contradicts this reading elsewhere on the dashboard."),
          tr("If the participant backdrop is contrarian or stretched, it directly contradicts any attempt to treat sector clustering as easy continuation.")
        ],
        [
          tr('11. One short teaching note beginning with "How to read:".'),
          tr("How to read: use the overlay to decide whether a sector’s catalyst load deserves attention, not to assume the sector must move.")
        ]
      ])
    }
  ];
}

function CatalystCard({
  title,
  rows
}: {
  title: string;
  rows: AnalyticsEventCatalystRow[];
}) {
  const { tr } = useI18n();
  return (
    <article className={styles.noteCard}>
      <span className={styles.eyebrow}>{tr(title)}</span>
      <div className={styles.listStack}>
        {rows.length ? (
          rows.map((row) => (
            <div key={row.id} className={styles.listItem}>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.5rem" }}>
                <SymbolPill label={row.symbol} detail={row.catalystType} tone={row.informative ? "green" : "white"} />
                <SymbolPill label={row.sectorName} detail={row.timingType} tone="white" />
                <SymbolPill
                  label={clean(row.confidence)}
                  detail={row.eventDate ?? row.reportDate ?? "—"}
                  tone={row.confidence === "high" ? "green" : row.confidence === "medium" ? "white" : "red"}
                />
              </div>
              <strong>{row.headline}</strong>
              <p>{row.detail}</p>
              <p>{row.tradeabilityImpact}</p>
              <p>{row.priceContext}</p>
            </div>
          ))
        ) : (
          <div className={styles.listItem}>
            <strong>{tr("No catalyst rows")}</strong>
            <p>{tr("The current watch window does not contain persisted catalyst rows for this bucket.")}</p>
          </div>
        )}
      </div>
    </article>
  );
}

export function AnalyticsEventContextPage() {
  const { tr } = useI18n();
  const { authReady } = useAuthGate();
  const query = useAnalyticsEventContext(authReady);

  usePageLoadProfile({
    pageName: "analytics_event_context",
    enabled: authReady,
    queries: [{ name: "analytics-event-context", isLoading: query.isLoading, isError: !!query.error }]
  });

  const loading = !authReady || (!query.data && query.isLoading);
  const showLoading = useDeferredBusyState(loading);
  const payload = query.data;
  const charts = useMemo(() => (payload ? buildCharts(payload, tr) : []), [payload, tr]);
  const topSector = payload?.sectorClusters[0];

  if (loading) {
    if (!showLoading) return null;
    return (
      <div className={styles.page}>
        <section className={styles.metricGrid}>
          <LoadingSkeletonCard title={tr("Upcoming catalysts")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Recent catalysts")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Institutional backdrop")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Clustered sectors")} lines={3} compact />
        </section>
        <LoadingSkeletonCard title={tr("Event context")} lines={8} />
      </div>
    );
  }

  if (query.error || !payload) {
    return (
      <DataState
        kind="error"
        title={tr("Event context is unavailable")}
        body={tr("The dashboard could not build the catalyst context layer from the persisted event, deal, and institutional tables.")}
      />
    );
  }

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title="Event Context"
        meta={`${tr("Latest trade date")} ${payload.latestTradeDate ? formatDateIST(payload.latestTradeDate) : "—"}`}
        subtitle={tr("Merge announcements, results, corporate actions, bulk and block deals, and institutional overlays into watchlists instead of hype.")}
        learningPrompt={tr("This page answers one question: which catalysts matter now, and which ones are only noise unless price proves otherwise?")}
        sectionTabs={[...CATALYSTS_SECTION_TABS]}
      />

      <PageIntroAccordion
        title={tr("Use catalysts to frame risk, not to force causation")}
        body={tr("This page merges official schedules, persisted announcement rows, corporate-action timing, and deal context so you can separate meaningful catalyst clustering from noise.")}
        items={[
          tr("Separate board meeting date, announcement date, ex-date, and effective date before judging price."),
          tr("Treat block and bulk deals as attention markers first. Large prints still need price follow-through to become informative."),
          tr("When event context and price action disagree, trust price more unless the event clearly changed the information set and volume confirms it.")
        ]}
      />

      <section className={styles.metricGrid}>
        <KpiCard label={tr("Upcoming catalysts")} value={num(payload.summary.upcomingCount, 0)} meta={tr("Future catalyst rows inside the active watch window.")} />
        <KpiCard label={tr("Recent catalysts")} value={num(payload.summary.recentCount, 0)} meta={tr("Recent rows worth checking against actual price follow-through.")} />
        <KpiCard label={tr("Institutional backdrop")} value={clean(payload.summary.institutionalBackdrop)} tone={backdropTone(payload.summary.institutionalBackdrop)} meta={tr("Daily participant context used as a sector-level overlay, not as a live trigger.")} />
        <KpiCard label={tr("Clustered sectors")} value={num(payload.summary.clusteredSectorCount, 0)} meta={tr("Sectors with at least two distinct catalyst names in the current watch window.")} />
      </section>

      <section className={styles.noteGrid}>
        <CatalystCard title="A. Most important upcoming catalysts" rows={payload.upcomingCatalysts.slice(0, 6)} />
        <CatalystCard title="B. Most important recent catalysts" rows={payload.recentCatalysts.slice(0, 6)} />
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
        <article className={`${styles.noteCard} ${noteTone(topSector)}`}>
          <span className={styles.eyebrow}>{tr("D. Stocks and sectors with meaningful event clustering")}</span>
          <div className={styles.listStack}>
            {payload.sectorClusters.slice(0, 6).map((row) => (
              <div key={row.sectorName} className={styles.listItem}>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.5rem" }}>
                  <SymbolPill label={row.sectorName} detail={`${row.eventCount} events`} tone={row.confirmsFlow ? "green" : "white"} />
                  <SymbolPill label={`${row.uniqueSymbols} names`} detail={`${num(row.dealValueCr, 2)} cr deals`} tone="white" />
                </div>
                <p>{row.overlayLabel}</p>
              </div>
            ))}
          </div>
        </article>

        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("E. How the event changes tradeability or risk")}</span>
          <p>{payload.summary.trustRule}</p>
          <p>{payload.summary.contextRule}</p>
          <div className={styles.listStack}>
            <div className={styles.listItem}>
              <strong>{tr("Informative catalysts")}</strong>
              <p>{tr("Use results, material announcements, and deal-plus-price confirmation to tighten the watchlist and size with more precision.")}</p>
            </div>
            <div className={styles.listItem}>
              <strong>{tr("Noisy catalysts")}</strong>
              <p>{tr("Treat duplicated notices, routine meetings, or mechanically large block prints as risk markers until price proves they matter.")}</p>
            </div>
            <div className={styles.listItem}>
              <strong>{tr("Conflicting context")}</strong>
              <p>{tr("When event timing is busy but price action is weak, trust the tape more than the calendar and lower conviction.")}</p>
            </div>
          </div>
        </article>
      </section>

      <section className={styles.noteGrid}>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("F. Common event-analysis mistakes")}</span>
          <div className={styles.listStack}>
            <div className={styles.listItem}>
              <strong>{tr("Confusing dates")}</strong>
              <p>{tr("Board meeting dates, announcement dates, ex-dates, and effective dates are not interchangeable, and the wrong field can invert your interpretation.")}</p>
            </div>
            <div className={styles.listItem}>
              <strong>{tr("Assuming deal size equals information")}</strong>
              <p>{tr("A mechanically large block or bulk deal can look dramatic while still adding little new information if sponsorship does not broaden afterward.")}</p>
            </div>
            <div className={styles.listItem}>
              <strong>{tr("Forcing causation from timing")}</strong>
              <p>{tr("A stock moving near an event does not prove the event caused the move. Price, volume, and follow-through still have to confirm the story.")}</p>
            </div>
          </div>
        </article>

        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("G. Teaching notes")}</span>
          <div className={styles.listStack}>
            {payload.dataQualityFlags.map((flag) => (
              <div key={flag} className={styles.listItem}>
                <strong>{tr("Learner note")}</strong>
                <p>{flag}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className={styles.takeawayCard}>
        <strong>{tr("Event-context takeaway:")}</strong>{" "}
        <span>
          {topSector
            ? tr(`${topSector.sectorName} has the most meaningful current catalyst clustering, but it only deserves conviction if price confirms the information and the institutional backdrop stops contradicting it.`)
            : tr("the current catalyst map is useful for watchlists and risk planning, but price and follow-through still matter more than event timing by itself.")}
        </span>
      </section>
    </div>
  );
}
