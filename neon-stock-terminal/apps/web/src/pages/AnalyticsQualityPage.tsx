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
  StatusBadge
} from "../components/ui/DashboardPrimitives";
import { EChartSurface } from "../components/visual/EChartSurface";
import { formatDateIST, formatNumber, formatPercent } from "../lib/format";
import { useAnalyticsQuality } from "../lib/hooks";
import type { AnalyticsQualityResponse } from "../lib/types";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import { useI18n } from "../i18n/LocaleProvider";
import { AnalyticsHeader, SYSTEM_SECTION_TABS } from "./AnalyticsChrome";
import styles from "./AnalyticsQualityPage.module.css";

type RubricItem = { label: string; value: string };
type ChartReading = { id: string; title: string; subtitle: string; option: EChartsOption; rubric: RubricItem[] };

const n = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const arr = <T,>(value: T[] | null | undefined) => (Array.isArray(value) ? value : []);
const pct = (value: number | null | undefined, digits = 1, signed = false) =>
  n(value) == null ? "—" : formatPercent(value as number, digits, signed);
const num = (value: number | null | undefined, digits = 0) =>
  n(value) == null ? "—" : formatNumber(value as number, { maximumFractionDigits: digits });
const clean = (value: string | null | undefined) =>
  ((value ?? "").replace(/[_-]+/g, " ").trim() || "Unknown").replace(/\b\w/g, (token) => token.toUpperCase());
const rubric = (items: Array<[string, string]>) => items.map(([label, value]) => ({ label, value }));

function badgeTone(status: "safe" | "downgraded" | "hidden" | "fresh" | "delayed" | "stale") {
  if (status === "safe" || status === "fresh") return "green" as const;
  if (status === "downgraded" || status === "delayed") return "white" as const;
  return "red" as const;
}

function buildFreshnessOption(payload: AnalyticsQualityResponse): EChartsOption {
  const rows = arr(payload.charts?.freshnessBySource).slice();
  return {
    animation: false,
    grid: { left: 64, right: 24, top: 28, bottom: 72 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: rows.map((row) => row.label), axisLabel: { color: "#8b93a7", rotate: 20 } },
    yAxis: [
      { type: "value", name: "Lag", axisLabel: { color: "#8b93a7" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
      { type: "value", name: "Rows", axisLabel: { color: "#8b93a7" } }
    ],
    series: [
      {
        name: "Lag sessions",
        type: "bar",
        data: rows.map((row) => row.lagSessions ?? 0),
        itemStyle: {
          color: (params: { dataIndex: number }) => {
            const status = rows[params.dataIndex]?.status;
            return status === "fresh" ? "#6de29b" : status === "delayed" ? "#f4d35e" : "#ff7a7a";
          }
        },
        barMaxWidth: 18
      },
      {
        name: "Recent rows",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        data: rows.map((row) => row.recentRows ?? 0),
        lineStyle: { color: "#7dcfff", width: 2 },
        itemStyle: { color: "#7dcfff" }
      }
    ]
  };
}

function buildCoverageOption(payload: AnalyticsQualityResponse): EChartsOption {
  const rows = arr(payload.charts?.coverageByModule).slice();
  return {
    animation: false,
    grid: { left: 64, right: 24, top: 28, bottom: 86 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: rows.map((row) => row.label), axisLabel: { color: "#8b93a7", rotate: 24 } },
    yAxis: { type: "value", max: 100, axisLabel: { color: "#8b93a7", formatter: "{value}%" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    series: [
      {
        type: "bar",
        data: rows.map((row) => (row.coverageRatio ?? 0) * 100),
        itemStyle: {
          color: (params: { dataIndex: number }) => {
            const status = rows[params.dataIndex]?.status;
            return status === "safe" ? "#6de29b" : status === "downgraded" ? "#f4d35e" : "#ff7a7a";
          }
        },
        barMaxWidth: 22
      }
    ]
  };
}

function buildMissingBarHeatmapOption(payload: AnalyticsQualityResponse): EChartsOption {
  const rows = arr(payload.charts?.missingBarHeatmap).slice();
  const dates = [...new Set(rows.map((row) => row.tradeDate ?? "Unknown"))];
  const symbols = [...new Set(rows.map((row) => row.symbol))];
  return {
    animation: false,
    grid: { left: 110, right: 28, top: 24, bottom: 52 },
    tooltip: {
      formatter: (params: { data?: unknown } | unknown) => {
        const data =
          params && typeof params === "object" && "data" in params && Array.isArray((params as { data?: unknown }).data)
            ? ((params as { data?: unknown }).data as [number, number, number])
            : null;
        if (!data) return "No missing-bar rows";
        return `${symbols[data[1]]}<br/>${dates[data[0]]}<br/>Missing bars: ${data[2]}`;
      }
    },
    xAxis: { type: "category", data: dates, axisLabel: { color: "#8b93a7" } },
    yAxis: { type: "category", data: symbols, axisLabel: { color: "#8b93a7" } },
    visualMap: {
      min: 0,
      max: Math.max(...rows.map((row) => row.missingBars ?? 0), 1),
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      textStyle: { color: "#8b93a7" },
      inRange: { color: ["#1b2b45", "#ff7a7a"] }
    },
    series: [{ type: "heatmap", data: rows.map((row) => [dates.indexOf(row.tradeDate ?? "Unknown"), symbols.indexOf(row.symbol), row.missingBars ?? 0]) }]
  };
}

function buildFailedJobsOption(payload: AnalyticsQualityResponse): EChartsOption {
  const rows = arr(payload.charts?.failedJobsTimeline).slice();
  const dates = [...new Set(rows.map((row) => row.jobDate ?? "Unknown"))];
  const jobs = [...new Set(rows.map((row) => row.jobName))];
  return {
    animation: false,
    grid: { left: 64, right: 24, top: 28, bottom: 64 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "category", data: dates, axisLabel: { color: "#8b93a7" } },
    yAxis: { type: "value", axisLabel: { color: "#8b93a7" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    series: jobs.map((jobName, index) => ({
      name: clean(jobName),
      type: "bar",
      stack: "failed",
      data: dates.map((date) => rows.find((row) => row.jobDate === date && row.jobName === jobName)?.count ?? 0),
      itemStyle: { color: ["#ff7a7a", "#f4d35e", "#7dcfff", "#b692ff"][index % 4] }
    }))
  };
}

function buildExpectedVsSeenOption(payload: AnalyticsQualityResponse): EChartsOption {
  const rows = arr(payload.charts?.expectedVsSeenInstruments).slice();
  return {
    animation: false,
    grid: { left: 64, right: 24, top: 28, bottom: 82 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: rows.map((row) => row.label), axisLabel: { color: "#8b93a7", rotate: 22 } },
    yAxis: { type: "value", axisLabel: { color: "#8b93a7" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    series: [
      { name: "Expected", type: "bar", data: rows.map((row) => row.expectedCount ?? 0), itemStyle: { color: "#7dcfff" }, barMaxWidth: 16 },
      { name: "Seen", type: "bar", data: rows.map((row) => row.actualCount ?? 0), itemStyle: { color: "#6de29b" }, barMaxWidth: 16 }
    ]
  };
}

function buildMissingDateLedgerOption(payload: AnalyticsQualityResponse): EChartsOption {
  const rows = arr(payload.charts?.missingDateLedger).slice();
  const dates = [...new Set(rows.map((row) => row.tradeDate))].sort();
  const modules = [...new Set(rows.map((row) => row.label))];
  return {
    animation: false,
    grid: { left: 130, right: 28, top: 24, bottom: 58 },
    tooltip: {
      formatter: (params: { data?: unknown } | unknown) => {
        const data =
          params && typeof params === "object" && "data" in params && Array.isArray((params as { data?: unknown }).data)
            ? ((params as { data?: unknown }).data as [number, number, number])
            : null;
        if (!data) return "No ledger rows";
        const row = rows.find((item) => item.tradeDate === dates[data[0]] && item.label === modules[data[1]]);
        return `${modules[data[1]]}<br/>${dates[data[0]]}<br/>${row?.present ? "Present" : `Missing: ${row?.reason ?? "Unknown"}`}`;
      }
    },
    xAxis: { type: "category", data: dates, axisLabel: { color: "#8b93a7" } },
    yAxis: { type: "category", data: modules, axisLabel: { color: "#8b93a7" } },
    visualMap: {
      min: 0,
      max: 1,
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      text: ["Present", "Missing"],
      textStyle: { color: "#8b93a7" },
      inRange: { color: ["#ff7a7a", "#6de29b"] }
    },
    series: [{ type: "heatmap", data: rows.map((row) => [dates.indexOf(row.tradeDate), modules.indexOf(row.label), row.present ? 1 : 0]) }]
  };
}

function buildChartReadings(payload: AnalyticsQualityResponse, tr: (value: string) => string): ChartReading[] {
  const freshnessRows = arr(payload.freshnessBySource);
  const moduleRows = arr(payload.moduleStatus);
  const missingBarRows = arr(payload.charts?.missingBarHeatmap);
  const failedJobRows = arr(payload.charts?.failedJobsTimeline);
  const expectedVsSeenRows = arr(payload.charts?.expectedVsSeenInstruments);
  const missingDateRows = arr(payload.charts?.missingDateLedger);
  const safeModules = arr(payload.safeModules);
  const hiddenModules = arr(payload.hiddenModules);
  const downgradedModules = arr(payload.downgradedModules);

  const freshnessLead = freshnessRows.find((row) => row.status !== "fresh") ?? freshnessRows[0] ?? null;
  const worstCoverage = moduleRows.slice().sort((left, right) => (left.coverageRatio ?? -1) - (right.coverageRatio ?? -1))[0] ?? null;
  const biggestMissingBar = missingBarRows[0] ?? null;
  const failedJob = failedJobRows[0] ?? null;
  const mostIncomplete = expectedVsSeenRows
    .slice()
    .sort((left, right) => ((left.expectedCount ?? 0) - (left.actualCount ?? 0)) - ((right.expectedCount ?? 0) - (right.actualCount ?? 0)))[0] ?? null;
  const missingLedger = missingDateRows.find((row) => !row.present) ?? null;
  const safeConfirm = safeModules[0] ?? "Options Structure";
  const contradiction = hiddenModules[0] ?? downgradedModules[0] ?? "another module";

  return [
    {
      id: "freshness",
      title: tr("freshness by source"),
      subtitle: tr("The first chart answers whether the source moved recently, not whether the table merely contains old rows."),
      option: buildFreshnessOption(payload),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Per-source business-day lag and recent-row production across the core ingestion feeds.")],
        [tr("2. Why traders or analysts care about it."), tr("A chart built on stale source dates can look complete while quietly describing an older market.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is source. Left Y-axis is lag in business sessions. Right Y-axis is recent rows loaded over the recent lookback.")],
        [tr("4. What a bullish reading looks like."), tr("Most sources show zero-session lag and still produce recent rows.")],
        [tr("5. What a bearish reading looks like."), tr("Multiple sources are two or more sessions behind or stale-but-nonempty.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Most sources are only one session behind, with enough rows to keep context but not enough for full trust.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Non-empty tables and recent load timestamps can hide the fact that the source-date itself did not advance.")],
        [tr("8. What todays reading says."), tr(`${freshnessLead?.label ?? "One source"} is the weakest freshness link right now, with ${num(freshnessLead?.lagSessions, 0)} session lag and ${num(freshnessLead?.recentRows, 0)} recent rows.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(`${safeConfirm} remains trustable, so the freshness problem is not universal across every module.`)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`${contradiction} is being downgraded or hidden, which proves freshness weakness is still active somewhere else on the platform.`)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: trust source-date freshness before you trust row counts or pretty recent load times.")]
      ])
    },
    {
      id: "coverage",
      title: tr("coverage ratio by module"),
      subtitle: tr("Coverage tells you whether a module saw the expected universe, not whether it generated an opinion."),
      option: buildCoverageOption(payload),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Expected-versus-actual constituent coverage for each analytical module.")],
        [tr("2. Why traders or analysts care about it."), tr("Coverage gaps can create false breadth, false leadership, and false confidence even when the chart still renders.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is module. Y-axis is coverage ratio as a percent of expected instruments.")],
        [tr("4. What a bullish reading looks like."), tr("Coverage stays near full expected universe, especially for state, leadership, and setup modules.")],
        [tr("5. What a bearish reading looks like."), tr("Coverage breaks materially below full universe or drops to zero for critical modules.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Coverage is usable but not complete, which means conclusions should be framed as tentative.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("A module can still rank names or states when half the expected instruments are absent.")],
        [tr("8. What todays reading says."), tr(`${worstCoverage?.label ?? "One module"} has the weakest usable coverage right now at ${pct(worstCoverage?.coverageRatio, 0, false)}.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(`${safeConfirm} is listed as safe, so complete coverage still exists in at least one family.`)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`${contradiction} is suppressed, showing that coverage and freshness are not uniformly healthy.`)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: a module with weak coverage can still publish numbers, but those numbers should lose authority immediately.")]
      ])
    },
    {
      id: "missing-bars",
      title: tr("missing-bar heatmap"),
      subtitle: tr("This chart isolates partial intraday sessions that can quietly distort state and stock-level charts."),
      option: buildMissingBarHeatmapOption(payload),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Which symbols finished the latest intraday session with fewer minute bars than the session maximum.")],
        [tr("2. Why traders or analysts care about it."), tr("Missing bars can make a stock look cleaner, weaker, or more stable than it really was.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is trade date. Y-axis is symbol. Cell color shows missing-bar count in bars.")],
        [tr("4. What a bullish reading looks like."), tr("Few or no symbols have missing bars on the latest session.")],
        [tr("5. What a bearish reading looks like."), tr("Several symbols end the session with meaningful missing-bar gaps.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Only a handful of symbols are short by one bar, so the distortion is narrow but real.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("A chart can still look current even when the last one or two bars are missing for exactly the stocks you care about.")],
        [tr("8. What todays reading says."), tr(biggestMissingBar ? `${biggestMissingBar.symbol} is the worst visible case with ${num(biggestMissingBar.missingBars, 0)} missing bars on ${biggestMissingBar.tradeDate}.` : "No missing-bar rows are currently flagged in the latest sample.")],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(`${moduleRows.find((item) => item.moduleKey === "market-state")?.label ?? "Market State"} is downgraded when minute coverage is partial, so the suppression logic agrees with this chart.`)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`${safeConfirm} may still be safe because not every module depends on full minute-bar completeness.`)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: missing bars are not just an ops defect; they directly change the shape of market-state and leadership stories.")]
      ])
    },
    {
      id: "failed-jobs",
      title: tr("failed jobs timeline"),
      subtitle: tr("Healthy data systems do not just load data; they keep loading it consistently without silent breakage."),
      option: buildFailedJobsOption(payload),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Recent non-success job counts grouped by day and job name.")],
        [tr("2. Why traders or analysts care about it."), tr("A delayed or failed pipeline can leave old market views on screen while appearing operationally alive.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is job date. Y-axis is count of failed or non-success job runs.")],
        [tr("4. What a bullish reading looks like."), tr("The timeline stays empty or sparse, with failures isolated and quickly resolved.")],
        [tr("5. What a bearish reading looks like."), tr("Repeated failures cluster in the same module family or continue across several sessions.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("There are occasional failures, but not enough to prove broad breakage on their own.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("A green health check can hide the fact that one downstream job is repeatedly failing while upstream jobs still succeed.")],
        [tr("8. What todays reading says."), tr(failedJob ? `${clean(failedJob.jobName)} shows recent non-success runs on ${failedJob.jobDate}, so job health is not a clean slate.` : "The current 30-day failure timeline is empty, which is the cleanest possible operational read.")],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr("Latest quality checks and pipeline audit are shown below, so the job timeline is not the only health signal.")],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`${safeConfirm} may still be current even when another job family is unstable, so failures are not always platform-wide.`)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: a failed-jobs spike matters most when it lines up with a module you are about to trust.")]
      ])
    },
    {
      id: "expected-seen",
      title: tr("expected-vs-seen instruments"),
      subtitle: tr("This chart checks whether the platform saw the universe it claims to analyze."),
      option: buildExpectedVsSeenOption(payload),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Expected instrument counts against the actual seen counts for the core universe-driven modules.")],
        [tr("2. Why traders or analysts care about it."), tr("Instrument mismatch between live and EOD universes can quietly break breadth, setups, and recommendations.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is module. Y-axis is instrument count.")],
        [tr("4. What a bullish reading looks like."), tr("Actual seen instruments closely match the expected universe count.")],
        [tr("5. What a bearish reading looks like."), tr("Actual counts lag meaningfully behind expected counts, especially in daily or intraday stock modules.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Counts are only modestly short, which supports cautious but not blind trust.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("A model can still emit scores even when the live universe and the EOD universe are out of sync.")],
        [tr("8. What todays reading says."), tr(mostIncomplete ? `${mostIncomplete.label} shows the largest expected-versus-seen gap right now at ${num(mostIncomplete.actualCount, 0)} seen against ${num(mostIncomplete.expectedCount, 0)} expected.` : "No instrument-count mismatch is visible in the current sample.")],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(`${payload.summary.hiddenModuleCount} modules are already being hidden or suppressed, so the platform is reacting to these mismatches rather than ignoring them.`)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`${safeConfirm} demonstrates that some modules still maintain acceptable instrument alignment.`)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: if expected and seen instruments diverge, trust the count mismatch before you trust the derived analytics.")]
      ])
    },
    {
      id: "missing-ledger",
      title: tr("missing-date ledger"),
      subtitle: tr("The ledger makes data gaps explicit so stale modules cannot pass as normal just because an older date still exists."),
      option: buildMissingDateLedgerOption(payload),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Module-by-date presence across recent business sessions, marking which analytical families were present or missing.")],
        [tr("2. Why traders or analysts care about it."), tr("A recent missing date is often more important than a long history of older data.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is trade date. Y-axis is analytical module. Cell state is binary: present or missing.")],
        [tr("4. What a bullish reading looks like."), tr("Recent business dates show mostly present cells across the modules you depend on.")],
        [tr("5. What a bearish reading looks like."), tr("Recent expected dates contain several missing cells, especially in the same family you are about to interpret.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("A few modules are missing on a few dates, but the gaps are not broad enough to suppress the entire platform.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Users often see an older last-available date and assume continuity, even when yesterday is missing entirely.")],
        [tr("8. What todays reading says."), tr(missingLedger ? `${missingLedger.label} is explicitly missing on ${missingLedger.tradeDate}: ${missingLedger.reason}` : "The recent ledger is fully present, which is the strongest possible freshness confirmation.")],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(`${payload.summary.schemaBoundaryRisk} is already called out separately, so missing-date risk is being treated as part of trust, not hidden in ops logs.`)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`${safeConfirm} remains safe, which means the platform still has usable modules even with some recent ledger gaps.`)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: when a recent date is missing, downgrade the conclusion first and investigate the cause second.")]
      ])
    }
  ];
}

function moduleCard(item: AnalyticsQualityResponse["moduleStatus"][number], tr: (value: string) => string) {
  return (
    <article key={item.moduleKey} className={styles.moduleCard}>
      <div className={styles.moduleHeader}>
        <div>
          <strong>{item.label}</strong>
          <p className={styles.smallPrint}>{item.reason}</p>
        </div>
        <StatusBadge label={clean(item.status)} tone={badgeTone(item.status)} />
      </div>
      <div className={styles.metricChipRow}>
        <span className={styles.metricChip}>{tr("Trust")} {num(item.trustScore, 0)}</span>
        <span className={styles.metricChip}>{tr("Last seen")} {item.lastSeenDate ?? "—"}</span>
        {item.expectedCount != null ? <span className={styles.metricChip}>{tr("Coverage")} {num(item.actualCount, 0)}/{num(item.expectedCount, 0)}</span> : null}
      </div>
      <p className={styles.smallPrint}>{item.staleNote}</p>
    </article>
  );
}

export function AnalyticsQualityPage() {
  const { tr } = useI18n();
  const { authReady } = useAuthGate();
  const query = useAnalyticsQuality(authReady);
  usePageLoadProfile({
    pageName: "analytics_quality",
    enabled: authReady,
    queries: [{ name: "analytics-quality", isLoading: query.isLoading, isError: !!query.error }]
  });

  const loading = !authReady || (!query.data && query.isLoading);
  const showLoading = useDeferredBusyState(loading);
  const charts = useMemo(() => (query.data ? buildChartReadings(query.data, tr) : []), [query.data, tr]);

  if (loading) {
    if (!showLoading) return null;
    return (
      <div className={styles.page}>
        <section className={styles.metricGrid}>
          <LoadingSkeletonCard title={tr("Trust score")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Fresh sources")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Downgraded modules")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Schema boundary")} lines={3} compact />
        </section>
        <LoadingSkeletonCard title={tr("Quality charts")} lines={8} />
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <DataState
        kind="error"
        title={tr("The quality and freshness dashboard is unavailable")}
        body={tr("The platform could not build the trust-first payload needed to suppress stale analytical modules.")}
      />
    );
  }

  const payload = query.data;
  const summary = payload.summary;
  const moduleRows = arr(payload.moduleStatus);
  const safeModules = arr(payload.safeModules);
  const downgradedModules = arr(payload.downgradedModules);
  const hiddenModules = arr(payload.hiddenModules);
  const latestJobRuns = arr(payload.diagnostics?.latestJobRuns);

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title="Quality & Freshness"
        meta={`${tr("Expected trade date")} ${payload.expectedTradeDate ?? "—"} • ${tr("Updated")} ${formatDateIST(payload.asOf, { includeTime: true })}`}
        subtitle={tr("Trust comes before interpretation. This page tells you which analytical modules are genuinely current, which ones need downgrade labels, and which ones should be hidden entirely.")}
        learningPrompt={tr("No analysis should be consumed before this page answers whether the source is fresh, the universe is complete, and the schema boundary is still safe.")}
        sectionTabs={[...SYSTEM_SECTION_TABS]}
      />

      <section className={styles.metricGrid}>
        <KpiCard label={tr("A. Overall trust score")} value={num(summary.trustScore, 0)} tone={summary.verdict === "healthy" ? "green" : summary.verdict === "mixed" ? "white" : "red"} meta={tr(summary.synopsis)} />
        <KpiCard label={tr("Safe to trust")} value={num(summary.safeModuleCount, 0)} tone="green" meta={safeModules.join(", ") || tr("None")} />
        <KpiCard label={tr("Downgraded")} value={num(summary.downgradedModuleCount, 0)} tone="white" meta={downgradedModules.join(", ") || tr("None")} />
        <KpiCard label={tr("Hidden")} value={num(summary.hiddenModuleCount, 0)} tone="red" meta={hiddenModules.join(", ") || tr("None")} />
      </section>

      <section className={styles.doubleGrid}>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("A. Overall trust score")}</span>
          <p className={styles.sectionText}>{tr(summary.synopsis)}</p>
          <p className={styles.sectionText}>{tr(`Expected session is ${payload.expectedTradeDate ?? "—"}, and schema-boundary risk is ${summary.schemaBoundaryRisk}.`)}</p>
          <p className={styles.smallPrint}>{tr("This is a trust gate, not a decorative ops page. Hidden modules should not be interpreted as if they were current.")}</p>
        </article>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("Schema boundary risk")}</span>
          <p className={styles.sectionText}>{payload.schemaBoundary.message}</p>
          <div className={styles.metricChipRow}>
            <span className={styles.metricChip}>{tr("Latest pre")} {payload.schemaBoundary.latestPreDate ?? "—"}</span>
            <span className={styles.metricChip}>{tr("Earliest post")} {payload.schemaBoundary.earliestPostDate ?? "—"}</span>
            <span className={styles.metricChip}>{tr("Overlap")} {num(arr(payload.schemaBoundary?.overlapDates).length, 0)}</span>
          </div>
        </article>
      </section>

      <section className={styles.sectionStack}>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("B. Module-by-module freshness status")}</span>
          <div className={styles.moduleGrid}>{moduleRows.map((item) => moduleCard(item, tr))}</div>
        </article>
      </section>

      <section className={styles.doubleGrid}>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("D. Which modules are safe to trust")}</span>
          <div className={styles.bulletList}>
            {moduleRows.filter((item) => item.status === "safe").map((item) => (
              <p key={item.moduleKey} className={styles.sectionText}><strong>{item.label}:</strong> {item.reason}</p>
            ))}
            {safeModules.length === 0 ? <p className={styles.sectionText}>{tr("No modules are fully safe right now.")}</p> : null}
          </div>
        </article>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("E. Which modules should be downgraded or hidden")}</span>
          <div className={styles.bulletList}>
            {moduleRows.filter((item) => item.status !== "safe").map((item) => (
              <p key={item.moduleKey} className={styles.sectionText}><strong>{item.label}:</strong> {item.reason}</p>
            ))}
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
          <span className={styles.eyebrow}>{tr("Diagnostics")}</span>
          <div className={styles.bulletList}>
            {latestJobRuns.slice(0, 5).map((row) => (
              <p key={`${row.jobName}-${row.startedAt ?? "none"}`} className={styles.sectionText}>
                <strong>{clean(row.jobName)}:</strong> {clean(row.status)} • {row.startedAt ? formatDateIST(row.startedAt, { includeTime: true }) : "—"}
              </p>
            ))}
          </div>
        </article>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("F. Learner notes on why stale data can create false conviction")}</span>
          <div className={styles.bulletList}>
            <p className={styles.sectionText}>{tr("Stale data is dangerous because it usually still looks clean. The risk is not ugliness; it is false confidence.")}</p>
            <p className={styles.sectionText}>{tr("Partial universes can make breadth, leadership, and setup quality look better than they really are.")}</p>
            <p className={styles.sectionText}>{tr("Schema changes like the post-2024-07-08 UDiFF boundary matter because historical joins can silently change behavior across the cutover.")}</p>
          </div>
        </article>
      </section>

      <PageIntroAccordion
        label={tr("Why this matters")}
        title={tr("Freshness, coverage, and schema compatibility are part of the analysis, not separate from it.")}
        body={tr("This page exists so the platform can suppress stale or partial modules before the user builds conviction from them.")}
        items={[
          tr("Never trust a non-empty table just because it is non-empty."),
          tr("Expected-versus-seen instrument checks matter as much as chart styling."),
          tr("Historical continuity across the UDiFF boundary must be monitored explicitly."),
          tr("A hidden module is safer than a quietly stale module.")
        ]}
        widgetId="analytics_quality_help"
      />

      <div className={styles.takeaway}>
        <strong>{tr("Quality takeaway:")}</strong>{" "}
        {tr("Trust the platform selectively: safe modules can be interpreted normally, downgraded modules need explicit caution, and hidden modules should not contribute to conviction until freshness, coverage, and boundary checks recover.")}
      </div>
    </div>
  );
}
