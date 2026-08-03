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
import { fmtPrice, formatDateIST, formatNumber, formatPercent } from "../lib/format";
import { useAnalyticsOptionsStructure } from "../lib/hooks";
import type {
  AnalyticsOptionsStructureGammaDeltaPoint,
  AnalyticsOptionsStructureMaxPainPoint,
  AnalyticsOptionsStructurePcrRow,
  AnalyticsOptionsStructureResponse,
  AnalyticsOptionsStructureStrikeRow,
  AnalyticsOptionsStructureTermPoint,
  AnalyticsOptionsStructureWall,
  AnalyticsOptionsStructureWallMigrationPoint
} from "../lib/types";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import { useI18n } from "../i18n/LocaleProvider";
import { AnalyticsHeader, OPTIONS_SECTION_TABS } from "./AnalyticsChrome";
import styles from "./AnalyticsOptionsStructurePage.module.css";

type RubricItem = { label: string; value: string };
type ChartReading = { id: string; title: string; subtitle: string; option: EChartsOption; rubric: RubricItem[] };

const n = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const pct = (value: number | null | undefined, digits = 1, signed = false) =>
  n(value) == null ? "—" : formatPercent(value as number, digits, signed);
const num = (value: number | null | undefined, digits = 0) =>
  n(value) == null ? "—" : formatNumber(value as number, { maximumFractionDigits: digits });
const px = (value: number | null | undefined) => (n(value) == null ? "—" : fmtPrice(value as number));
const clean = (value: string | null | undefined) =>
  ((value ?? "").replace(/[_-]+/g, " ").trim() || "Unknown").replace(/\b\w/g, (token) => token.toUpperCase());
const rubric = (items: Array<[string, string]>) => items.map(([label, value]) => ({ label, value }));

function buildPcrOption(rows: AnalyticsOptionsStructurePcrRow[]): EChartsOption {
  const data = rows.slice().sort((a, b) => (a.expiry ?? "").localeCompare(b.expiry ?? ""));
  return {
    animation: false,
    grid: { left: 48, right: 18, top: 28, bottom: 52 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: data.map((row) => row.expiry?.slice(5) ?? "—"),
      axisLabel: { color: "#8b93a7" }
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#8b93a7" },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } }
    },
    series: [
      {
        type: "bar",
        data: data.map((row) => ({
          value: row.pcr ?? 0,
          itemStyle: { color: (row.pcr ?? 0) >= 1 ? "#6de29b" : "#ff9f68" }
        })),
        barMaxWidth: 24
      }
    ]
  };
}

function buildOiHeatmapOption(rows: AnalyticsOptionsStructureStrikeRow[]): EChartsOption {
  const data = rows.slice();
  return {
    animation: false,
    grid: { left: 64, right: 16, top: 26, bottom: 44 },
    tooltip: { trigger: "item" },
    xAxis: { type: "category", data: ["Call OI", "Put OI"], axisLabel: { color: "#8b93a7" } },
    yAxis: { type: "category", data: data.map((row) => String(row.strike)), axisLabel: { color: "#8b93a7" } },
    visualMap: {
      min: 0,
      max: Math.max(1, ...data.flatMap((row) => [row.callOi ?? 0, row.putOi ?? 0])),
      orient: "horizontal",
      left: "center",
      bottom: 0,
      textStyle: { color: "#8b93a7" }
    },
    series: [
      {
        type: "heatmap",
        data: data.flatMap((row, rowIndex) => [
          [0, rowIndex, row.callOi ?? 0],
          [1, rowIndex, row.putOi ?? 0]
        ]),
        label: {
          show: true,
          color: "#f5f7fb",
          formatter: (params: unknown) => num(Number(((params as { data?: unknown[] }).data ?? [0, 0, 0])[2]), 0)
        }
      }
    ]
  };
}

function buildMaxPainOption(rows: AnalyticsOptionsStructureMaxPainPoint[], spot: number | null): EChartsOption {
  const data = rows.slice().sort((a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? ""));
  return {
    animation: false,
    grid: { left: 48, right: 18, top: 28, bottom: 52 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: data.map((row) => row.expiry?.slice(5) ?? "—"), axisLabel: { color: "#8b93a7" } },
    yAxis: { type: "value", axisLabel: { color: "#8b93a7" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    series: [
      { name: "Max pain", type: "line", smooth: true, data: data.map((row) => row.maxPainStrike), lineStyle: { color: "#f4d35e", width: 2 }, itemStyle: { color: "#f4d35e" } },
      { name: "Spot", type: "line", smooth: true, data: data.map((row) => row.spotPrice ?? spot), lineStyle: { color: "#7dcfff", width: 2 }, itemStyle: { color: "#7dcfff" } }
    ]
  };
}

function buildTermStructureOption(rows: AnalyticsOptionsStructureTermPoint[]): EChartsOption {
  const data = rows.slice().sort((a, b) => (a.expiry ?? "").localeCompare(b.expiry ?? ""));
  return {
    animation: false,
    grid: { left: 48, right: 18, top: 28, bottom: 52 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: data.map((row) => row.expiry?.slice(5) ?? "—"), axisLabel: { color: "#8b93a7" } },
    yAxis: { type: "value", axisLabel: { color: "#8b93a7", formatter: "{value}%" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    series: [
      { name: "ATM IV", type: "line", smooth: true, data: data.map((row) => row.atmIv), lineStyle: { color: "#6de29b", width: 2 }, itemStyle: { color: "#6de29b" } },
      { name: "Skew", type: "line", smooth: true, data: data.map((row) => row.currentExpirySkew), lineStyle: { color: "#ff9f68", width: 2 }, itemStyle: { color: "#ff9f68" } }
    ]
  };
}

function buildWallMigrationOption(rows: AnalyticsOptionsStructureWallMigrationPoint[]): EChartsOption {
  const data = rows.slice().sort((a, b) => (a.capturedAt ?? "").localeCompare(b.capturedAt ?? ""));
  const callRows = data.filter((row) => row.optionType === "CE");
  const putRows = data.filter((row) => row.optionType === "PE");
  const xAxisLabels = data.map((row) =>
    row.capturedAt ? new Date(row.capturedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"
  );
  return {
    animation: false,
    grid: { left: 48, right: 18, top: 28, bottom: 52 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: xAxisLabels, axisLabel: { color: "#8b93a7" } },
    yAxis: { type: "value", axisLabel: { color: "#8b93a7" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    series: [
      { name: "Call wall", type: "line", data: callRows.map((row) => row.strike), lineStyle: { color: "#ff7a7a", width: 2 }, itemStyle: { color: "#ff7a7a" } },
      { name: "Put wall", type: "line", data: putRows.map((row) => row.strike), lineStyle: { color: "#6de29b", width: 2 }, itemStyle: { color: "#6de29b" } },
      { name: "Spot", type: "line", data: data.map((row) => row.spot), lineStyle: { color: "#7dcfff", width: 2 }, itemStyle: { color: "#7dcfff" } }
    ]
  };
}

function buildGammaDeltaOption(rows: AnalyticsOptionsStructureGammaDeltaPoint[]): EChartsOption {
  const data = rows.slice();
  return {
    animation: false,
    grid: { left: 56, right: 18, top: 28, bottom: 52 },
    legend: { top: 0, textStyle: { color: "#98a2b3" } },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: data.map((row) => String(row.strike)), axisLabel: { color: "#8b93a7", rotate: 20 } },
    yAxis: { type: "value", axisLabel: { color: "#8b93a7" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    series: [
      { name: "Gamma concentration", type: "bar", data: data.map((row) => row.gammaExposure ?? 0), itemStyle: { color: "#f4d35e" }, barMaxWidth: 18 },
      { name: "Delta concentration", type: "line", smooth: true, data: data.map((row) => row.deltaExposure), lineStyle: { color: "#7dcfff", width: 2 }, itemStyle: { color: "#7dcfff" } }
    ]
  };
}

function wallCard(title: string, rows: AnalyticsOptionsStructureWall[], sideTone: "green" | "red") {
  return (
    <article className={styles.noteCard}>
      <span className={styles.eyebrow}>{title}</span>
      <div className={styles.wallList}>
        {rows.map((row) => (
          <div key={`${title}-${row.side}-${row.strike}`} className={styles.wallItem}>
            <div className={styles.wallHeader}>
              <SymbolPill label={String(row.strike)} detail={`${row.side} wall`} tone={sideTone} />
              <span className={styles.smallPrint}>
                OI {num(row.openInterest, 0)} • COI {num(row.changeInOi, 0)} • dist {num(row.distanceFromSpot, 0)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function buildCharts(payload: AnalyticsOptionsStructureResponse, tr: (value: string) => string): ChartReading[] {
  const summary = payload.summary;
  const callWall = payload.nearestCallWalls[0] ?? null;
  const putWall = payload.nearestPutWalls[0] ?? null;
  const spot = payload.latestSnapshot?.spot ?? null;
  const pcrLead = payload.pcrByExpiry[0] ?? null;
  const maxPainLead = payload.maxPainDrift[payload.maxPainDrift.length - 1] ?? null;
  const termLead = payload.termStructure.find((row) => row.currentExpirySkew != null) ?? payload.termStructure[0] ?? null;
  const callMigr = payload.wallMigration.filter((row) => row.optionType === "CE").at(-1) ?? null;
  const putMigr = payload.wallMigration.filter((row) => row.optionType === "PE").at(-1) ?? null;
  const gammaLead = payload.gammaDeltaConcentration.slice().sort((a, b) => Math.abs(b.gammaExposure ?? 0) - Math.abs(a.gammaExposure ?? 0))[0] ?? null;

  const confirm = summary?.optionsVsSpot ?? "Structure still needs cross-checks from wall migration and IV.";
  const contradict = summary?.dataQualityFlags.length
    ? `The main contradiction is data quality: ${summary.dataQualityFlags.join("; ")}.`
    : "The contradiction is that static OI alone can still be hedging noise instead of conviction.";

  return [
    {
      id: "pcr",
      title: tr("PCR by expiry"),
      subtitle: tr("Use PCR as context only after wall location and migration are clear."),
      option: buildPcrOption(payload.pcrByExpiry),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Put-call ratio across expiries using persisted OI snapshots.")],
        [tr("2. Why traders or analysts care about it."), tr("It helps frame whether positioning is skewed toward puts or calls, but only as secondary context.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is expiry date. Y-axis is PCR ratio, which is a unitless proportion of put OI to call OI.")],
        [tr("4. What a bullish reading looks like."), tr("A mildly supportive PCR that sits with put support below spot and rising walls under price.")],
        [tr("5. What a bearish reading looks like."), tr("A weak PCR combined with call walls pressing down and spot unable to clear structure.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("PCR is mixed across expiries or jumps around too much to describe usable positioning.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Front-expiry PCR can be distorted by rolls, hedges, and stale far-OTM strikes, so PCR in isolation is often misleading.")],
        [tr("8. What todays reading says."), tr(`Front-expiry PCR is ${pct(pcrLead?.pcr, 2)} as a ratio reading, but the recent trail is noisy enough that this chart is contextual rather than directional.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(confirm)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(contradict)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: PCR can support a structural read, but it cannot replace wall analysis or spot behavior.")]
      ])
    },
    {
      id: "oi-heatmap",
      title: tr("Strike-ladder OI heatmap"),
      subtitle: tr("The best live chart for seeing where the market is actually stacked."),
      option: buildOiHeatmapOption(payload.strikeLadder),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Call and put open interest at each strike around spot.")],
        [tr("2. Why traders or analysts care about it."), tr("This is the clearest view of nearby call walls, put walls, and where spot is likely to encounter friction.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is option side. Y-axis is strike. Cell intensity is open interest in contracts.")],
        [tr("4. What a bullish reading looks like."), tr("Spot sits above a durable put shelf and nearby call OI starts thinning or shifting higher.")],
        [tr("5. What a bearish reading looks like."), tr("Call OI stays stacked just above spot while put support erodes below.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Spot is trapped between nearby call and put walls of similar strength.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Static OI can reflect hedging inventory rather than conviction, especially around weekly expiry or roll periods.")],
        [tr("8. What todays reading says."), tr(`Nearest call supply is around ${callWall?.strike ?? "—"} and nearest put support is around ${putWall?.strike ?? "—"}, so spot is still fighting nearby structure rather than moving in clean air.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(confirm)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(contradict)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: start with the nearest walls around spot, then ask whether those walls are migrating or simply sitting still.")]
      ])
    },
    {
      id: "max-pain",
      title: tr("Max pain drift vs spot"),
      subtitle: tr("Useful only as a reference anchor, never as destiny."),
      option: buildMaxPainOption(payload.maxPainDrift, spot),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Tracked max pain levels by expiry versus the corresponding spot reference.")],
        [tr("2. Why traders or analysts care about it."), tr("It shows where option writers may be most comfortable, but it is only a background anchor.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is expiry sequence. Y-axis is strike or spot level in index points.")],
        [tr("4. What a bullish reading looks like."), tr("Spot holds above the stale anchor and nearby put structure keeps migrating upward.")],
        [tr("5. What a bearish reading looks like."), tr("Spot drifts back toward a lower anchor while call resistance stays overhead.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Max pain sits near spot but without fresh updates, so it only describes an old equilibrium.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Stale max pain data and the common mistake of treating max pain as a tradable target can both mislead badly.")],
        [tr("8. What todays reading says."), tr(`Latest persisted max pain sits near ${maxPainLead?.maxPainStrike ?? "—"}, but it is stale by ${num(maxPainLead?.staleDays, 0)} days and should be treated as a reference anchor only.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(summary?.maxPainContext ?? "The summary already flags max pain as a secondary anchor.")],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(contradict)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: max pain is a map pin, not a forecast.")]
      ])
    },
    {
      id: "term-structure",
      title: tr("ATM IV and skew term structure"),
      subtitle: tr("IV helps only when you know whether expansion is supporting the move or warning of exhaustion."),
      option: buildTermStructureOption(payload.termStructure),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("ATM implied volatility by expiry and the current skew reference for the active expiry.")],
        [tr("2. Why traders or analysts care about it."), tr("IV expansion can validate a real move, while unstable or collapsing IV can signal exhaustion or event-risk repricing.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is expiry. Y-axis is implied volatility in percent, with skew shown as an IV spread.")],
        [tr("4. What a bullish reading looks like."), tr("Spot pushes through structure while IV expands in a controlled way and skew does not show panic put demand.")],
        [tr("5. What a bearish reading looks like."), tr("IV spikes mainly through downside demand while spot fails at call resistance.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("ATM IV is elevated but skew and spot do not agree on direction.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("IV can compress after events, and incomplete persisted Greeks history can make skew look cleaner than it really is.")],
        [tr("8. What todays reading says."), tr(`Active expiry ATM IV is around ${pct(termLead?.atmIv != null ? termLead.atmIv / 100 : null, 2)} in percentage terms, but skew history is incomplete, so IV is informative without being decisive.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(summary?.equilibriumContext ?? "The structure read still depends more on live walls than on stale secondary series.")],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(contradict)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: IV supports a move when it expands with structure confirmation, and warns of exhaustion when it expands against fading spot progress.")]
      ])
    },
    {
      id: "wall-migration",
      title: tr("Call-wall / put-wall migration"),
      subtitle: tr("Migration matters more than static OI because structure that moves is structure that is being repriced."),
      option: buildWallMigrationOption(payload.wallMigration),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Recent movement in the dominant call and put walls versus spot.")],
        [tr("2. Why traders or analysts care about it."), tr("Wall migration separates genuine structural shifts from static inventory that only looks important.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is snapshot time. Y-axis is strike or spot level in index points.")],
        [tr("4. What a bullish reading looks like."), tr("Call walls shift higher or weaken while put walls rise under spot.")],
        [tr("5. What a bearish reading looks like."), tr("Call walls stay pinned overhead or drift lower while put walls drop away beneath spot.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Walls stay mostly fixed and spot oscillates between them.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Rollover activity can look directional even when it is just inventory transfer between strikes or expiries.")],
        [tr("8. What todays reading says."), tr(`Recent migration still shows call structure near ${callMigr?.strike ?? "—"} and put structure near ${putMigr?.strike ?? "—"}, so the tape still looks pinned-to-fighting rather than broken free.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(confirm)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(contradict)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: walls that migrate with spot support continuation; walls that do not migrate are usually where continuation stalls.")]
      ])
    },
    {
      id: "gamma-delta",
      title: tr("Gamma / delta concentration"),
      subtitle: tr("Concentration shows where hedging flows are most likely to matter around spot."),
      option: buildGammaDeltaOption(payload.gammaDeltaConcentration),
      rubric: rubric([
        [tr("1. What this chart is measuring."), tr("Strike-level gamma and delta concentration around the active chain.")],
        [tr("2. Why traders or analysts care about it."), tr("Concentration highlights where dealer hedging pressure can reinforce pinning, accelerate a breakout, or amplify reversals.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is strike. Y-axis is normalized concentration from persisted gamma and delta exposure fields.")],
        [tr("4. What a bullish reading looks like."), tr("Positive concentration supports spot above nearby put support and weakens the practical effect of call walls.")],
        [tr("5. What a bearish reading looks like."), tr("Concentration builds around overhead strikes and spot cannot clear them.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Concentration is split around ATM, creating pinning rather than trend extension.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Incomplete Greeks history and one-sided persisted series can make concentration look cleaner than the actual live dealer book.")],
        [tr("8. What todays reading says."), tr(`The biggest concentration sits near ${gammaLead?.strike ?? "—"}, which keeps hedging pressure close to spot and supports the pinned/fighting structure read.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(confirm)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(contradict)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: concentration near spot usually means pin risk; concentration that starts shifting away from spot can open room for expansion.")]
      ])
    }
  ];
}

export function AnalyticsOptionsStructurePage() {
  const { tr } = useI18n();
  const { authReady } = useAuthGate();
  const query = useAnalyticsOptionsStructure(authReady);
  usePageLoadProfile({
    pageName: "analytics_options_structure",
    enabled: authReady,
    queries: [{ name: "analytics-options-structure", isLoading: query.isLoading, isError: !!query.error }]
  });
  const loading = !authReady || (!query.data && query.isLoading);
  const showLoading = useDeferredBusyState(loading);
  const charts = useMemo(() => (query.data ? buildCharts(query.data, tr) : []), [query.data, tr]);

  if (loading) {
    if (!showLoading) return null;
    return (
      <div className={styles.page}>
        <section className={styles.metricGrid}>
          <LoadingSkeletonCard title={tr("Structure summary")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Call wall")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Put wall")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Spot state")} lines={3} compact />
        </section>
        <LoadingSkeletonCard title={tr("Options structure charts")} lines={8} />
      </div>
    );
  }

  if (query.error || !query.data || !query.data.summary || !query.data.latestSnapshot) {
    return (
      <DataState
        kind="error"
        title={tr("The options structure page is unavailable")}
        body={tr("The dashboard could not assemble the persisted option-chain, PCR, max-pain, and Greeks context for the latest NIFTY structure read.")}
      />
    );
  }

  const payload = query.data;
  const summary = payload.summary!;
  const latestSnapshot = payload.latestSnapshot!;

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title="Options Structure"
        meta={`${tr("Expiry")} ${latestSnapshot.expiryDate ? formatDateIST(latestSnapshot.expiryDate) : "—"} • ${tr("Updated")} ${formatDateIST(payload.asOf, { includeTime: true })}`}
        subtitle={tr("Read nearby call walls, put walls, IV, max-pain context, and wall migration before deciding whether spot is pinned, breaking out, or only making noise around expiry structure.")}
        learningPrompt={tr("This page teaches the difference between static option inventory and structure that is actually shifting with spot.")}
        sectionTabs={[...OPTIONS_SECTION_TABS]}
      />

      <section className={styles.metricGrid}>
        <KpiCard label={tr("A. Structure summary")} value={clean(summary.spotState)} tone="white" meta={tr(summary.structureSummary)} />
        <KpiCard label={tr("Nearest call wall")} value={summary.nearestStructure.callWall != null ? String(summary.nearestStructure.callWall) : "—"} tone="red" meta={tr(summary.optionsVsSpot)} />
        <KpiCard label={tr("Nearest put wall")} value={summary.nearestStructure.putWall != null ? String(summary.nearestStructure.putWall) : "—"} tone="green" meta={tr(summary.pcrContext)} />
        <KpiCard label={tr("Spot vs ATM")} value={px(latestSnapshot.spot)} tone="white" meta={tr(`ATM ${latestSnapshot.atmStrike != null ? latestSnapshot.atmStrike : "—"} • ${summary.maxPainContext}`)} />
      </section>

      <section className={styles.verdictCard}>
        <span className={styles.eyebrow}>{tr("A. Structure summary")}</span>
        <p className={styles.sectionText}>{tr(summary.structureSummary)}</p>
        <p className={styles.sectionText}>{tr(summary.optionsVsSpot)}</p>
        <div className={styles.tagWrap}>
          {summary.dataQualityFlags.map((flag) => <span key={flag} className={styles.tag}>{flag}</span>)}
        </div>
      </section>

      <section className={styles.doubleGrid}>
        {wallCard(tr("B. Nearest important call walls"), payload.nearestCallWalls, "red")}
        {wallCard(tr("B. Nearest important put walls"), payload.nearestPutWalls, "green")}
      </section>

      <section className={styles.doubleGrid}>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("C. Whether spot is pinned, breaking out, or fighting structure")}</span>
          <p className={styles.sectionText}>{tr(`Current read: ${clean(summary.spotState)}.`)}</p>
          <p className={styles.sectionText}>{tr(summary.optionsVsSpot)}</p>
          <p className={styles.smallPrint}>{tr(summary.equilibriumContext)}</p>
        </article>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("Data quality and contradictions")}</span>
          <div className={styles.bulletList}>
            <p className={styles.sectionText}>{tr(summary.pcrContext)}</p>
            <p className={styles.sectionText}>{tr(summary.maxPainContext)}</p>
            <p className={styles.sectionText}>{tr(summary.equilibriumContext)}</p>
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
          <span className={styles.eyebrow}>{tr("E. Best options-informed entry contexts")}</span>
          <div className={styles.bulletList}>
            <p className={styles.sectionText}>{tr("Breakout continuation: only when spot clears the nearest call wall and the call wall itself starts migrating higher or thinning.")}</p>
            <p className={styles.sectionText}>{tr("Range fade: strongest when spot is pinned between nearby walls and concentration remains clustered around ATM.")}</p>
            <p className={styles.sectionText}>{tr("Support-resistance trades: most credible when put support and call resistance are both visible in the ladder and migration stays stable.")}</p>
            <p className={styles.sectionText}>{tr("No-trade / reduced conviction: when PCR, max pain, equilibrium, and wall migration disagree or are obviously stale.")}</p>
          </div>
        </article>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("F. Common interpretation mistakes")}</span>
          <div className={styles.bulletList}>
            <p className={styles.sectionText}>{tr("Reading PCR as a standalone signal instead of as one context layer beside walls and spot.")}</p>
            <p className={styles.sectionText}>{tr("Treating max pain as destiny rather than as a sometimes-stale reference anchor.")}</p>
            <p className={styles.sectionText}>{tr("Mistaking weekly-expiry pinning or rollover noise for directional conviction.")}</p>
            <p className={styles.sectionText}>{tr("Assuming far-OTM OI is live structure when it may simply be stale inventory.")}</p>
          </div>
        </article>
      </section>

      <section className={styles.noteCard}>
        <span className={styles.eyebrow}>{tr("G. Teaching notes")}</span>
        <div className={styles.bulletList}>
          <p className={styles.sectionText}>{tr("A static wall tells you where inventory sits; a migrating wall tells you whether that inventory is adapting to price.")}</p>
          <p className={styles.sectionText}>{tr("IV expansion supports a move when it arrives with structure break and wall migration; it warns of exhaustion when IV rises but spot still cannot clear structure.")}</p>
          <p className={styles.sectionText}>{tr("The best live chart here is the strike-ladder OI heatmap, but the best decision chart is wall migration because it shows whether the structure is actually moving.")}</p>
        </div>
      </section>

      <PageIntroAccordion
        label={tr("How to use this page")}
        title={tr("Read options structure in order: walls, migration, IV, then secondary context like PCR and max pain.")}
        body={tr("This dashboard is intentionally conservative. It teaches whether structure confirms spot, contradicts it, or is too noisy to trust for a directional call.")}
        items={[tr("Do not present PCR as a standalone trade signal."), tr("Do not treat max pain as destiny."), tr("Wall migration matters more than static OI."), tr("If the structure is contradictory, the correct answer is reduced conviction, not forced certainty.")]}
        widgetId="analytics_options_structure_help"
      />

      <div className={styles.takeaway}>
        <strong>{tr("Options takeaway:")}</strong>{" "}
        {tr("NIFTY is still trading against nearby option structure, with live call and put walls close enough to matter, so the smarter read is pinned-to-fighting structure rather than clean breakout confirmation until wall migration and fresher secondary data agree.")}
      </div>
    </div>
  );
}
