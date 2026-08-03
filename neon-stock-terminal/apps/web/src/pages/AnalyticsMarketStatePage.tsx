import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { useAuthGate } from "../auth/AuthGateProvider";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import {
  ChartCard,
  DataState,
  DataTable,
  KpiCard,
  LoadingSkeletonCard,
  PageIntroAccordion,
  SymbolPill
} from "../components/ui/DashboardPrimitives";
import { EChartSurface } from "../components/visual/EChartSurface";
import { formatDateIST, formatNumber, formatPercent, fmtPrice } from "../lib/format";
import { useAnalyticsMarketState } from "../lib/hooks";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import type { AnalyticsMarketStateResponse, MarketStateAnalog, MarketStateHistoryStat, MarketStateMinutePoint } from "../lib/types";
import { useI18n } from "../i18n/LocaleProvider";
import { AnalyticsHeader, MARKET_SECTION_TABS } from "./AnalyticsChrome";
import styles from "./AnalyticsMarketStatePage.module.css";

type Tone = "green" | "red" | "white";
type ChartReading = {
  id: string;
  title: string;
  subtitle: string;
  option: EChartsOption;
  rubric: Array<{ label: string; value: string }>;
};

function num(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pct(value: number | null | undefined, digits = 1, signed = false) {
  const resolved = num(value);
  return resolved == null ? "—" : formatPercent(resolved, digits, signed);
}

function price(value: number | null | undefined) {
  const resolved = num(value);
  return resolved == null ? "—" : fmtPrice(resolved);
}

function toneFrom(value: number | null | undefined): Tone {
  const resolved = num(value);
  if (resolved == null) return "white";
  if (resolved > 0) return "green";
  if (resolved < 0) return "red";
  return "white";
}

function toneFromState(value: string | null | undefined): Tone {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("trend") || normalized.includes("reversal")) return "green";
  if (normalized.includes("failed") || normalized.includes("chop")) return "red";
  return "white";
}

function analogLabel(analog: MarketStateAnalog | undefined) {
  return analog?.tradeDate ? `${formatDateIST(analog.tradeDate)} • ${analog.label}` : "—";
}

function stateForMinute(point: MarketStateMinutePoint) {
  if ((point.weightedParticipationPct ?? 0) >= 60 && (point.breadthUpPct ?? 0) >= 60 && Math.abs(point.changePct ?? 0) >= 0.5) return "Broad trend";
  if ((point.top10ConcentrationPct ?? 0) >= 35 && (point.breadthUpPct ?? 0) < 55) return "Narrow leadership";
  if (point.minuteNo >= 165 && (point.changePct ?? 0) > 0.35 && (point.breadthUpPct ?? 0) >= 50) return "Late reversal";
  if ((point.breadthAboveVwapPct ?? 0) >= 55 && (point.weightedParticipationPct ?? 0) < 55 && (point.changePct ?? 0) > -0.2) return "Gap fill";
  if (Math.abs(point.changePct ?? 0) >= 1 && (point.breadthUpPct ?? 0) >= 30 && (point.breadthUpPct ?? 0) <= 70) return "High-vol chop";
  return "Balanced";
}

function buildIndexBreadthOption(series: MarketStateMinutePoint[]): EChartsOption {
  return {
    animation: false,
    legend: { top: 0, textStyle: { color: "#d6d9e0" } },
    grid: { left: 52, right: 56, top: 32, bottom: 40 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: series.map((p) => p.minuteLabel), axisLabel: { color: "#8b93a7", interval: 29 } },
    yAxis: [
      { type: "value", name: "Index", scale: true, axisLabel: { color: "#8b93a7" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
      { type: "value", name: "Breadth %", min: 0, max: 100, axisLabel: { color: "#8b93a7", formatter: "{value}%" }, splitLine: { show: false } }
    ],
    series: [
      { name: "Nifty 50", type: "line", smooth: true, showSymbol: false, lineStyle: { width: 2, color: "#d4af37" }, data: series.map((p) => p.lastPrice) },
      { name: "Breadth up %", type: "line", smooth: true, yAxisIndex: 1, showSymbol: false, lineStyle: { width: 2, color: "#69d2e7" }, areaStyle: { color: "rgba(105,210,231,0.12)" }, data: series.map((p) => p.breadthUpPct) }
    ]
  };
}

function buildBreadthWeightOption(series: MarketStateMinutePoint[]): EChartsOption {
  return {
    animation: false,
    legend: { top: 0, textStyle: { color: "#d6d9e0" } },
    grid: { left: 48, right: 20, top: 24, bottom: 40 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: series.map((p) => p.minuteLabel), axisLabel: { color: "#8b93a7", interval: 29 } },
    yAxis: { type: "value", min: 0, max: 100, axisLabel: { color: "#8b93a7", formatter: "{value}%" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    series: [
      { name: "Breadth above VWAP %", type: "line", smooth: true, showSymbol: false, connectNulls: true, lineStyle: { width: 2, color: "#88f7b1" }, data: series.map((p) => p.breadthAboveVwapPct) },
      { name: "Weighted participation %", type: "line", smooth: true, showSymbol: false, lineStyle: { width: 2, color: "#ff7a7a" }, data: series.map((p) => p.weightedParticipationPct) }
    ]
  };
}

function buildConcentrationOption(series: MarketStateMinutePoint[]): EChartsOption {
  return {
    animation: false,
    legend: { top: 0, textStyle: { color: "#d6d9e0" } },
    grid: { left: 50, right: 52, top: 28, bottom: 40 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: series.map((p) => p.minuteLabel), axisLabel: { color: "#8b93a7", interval: 29 } },
    yAxis: [
      { type: "value", name: "Return %", axisLabel: { color: "#8b93a7", formatter: "{value}%" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
      { type: "value", name: "Top-10 %", min: 0, max: 100, axisLabel: { color: "#8b93a7", formatter: "{value}%" }, splitLine: { show: false } }
    ],
    series: [
      { name: "Index return %", type: "line", smooth: true, showSymbol: false, lineStyle: { width: 2, color: "#d4af37" }, data: series.map((p) => p.changePct) },
      { name: "Top-10 concentration %", type: "line", smooth: true, yAxisIndex: 1, showSymbol: false, lineStyle: { width: 2, color: "#b38cff" }, data: series.map((p) => p.top10ConcentrationPct) }
    ]
  };
}

function buildStateTimelineOption(series: MarketStateMinutePoint[]): EChartsOption {
  const orderedStates = ["Broad trend", "Late reversal", "Gap fill", "Narrow leadership", "High-vol chop", "Balanced"];
  return {
    animation: false,
    grid: { left: 76, right: 20, top: 24, bottom: 40 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: series.map((p) => p.minuteLabel), axisLabel: { color: "#8b93a7", interval: 29 } },
    yAxis: { type: "category", data: orderedStates, axisLabel: { color: "#8b93a7" } },
    series: [{ type: "scatter", symbolSize: 10, itemStyle: { color: "#69d2e7" }, data: series.map((p) => [p.minuteLabel, stateForMinute(p)]) }]
  };
}

function buildGapCloseOption(session: AnalyticsMarketStateResponse["session"], analogs: MarketStateAnalog[]): EChartsOption {
  const analogPoints = analogs.map((analog) => ({ value: [analog.gapPct, analog.closeLocationPct, analog.label], itemStyle: { color: "#6e768a" } }));
  const todayPoint = session ? { value: [session.gapPct, session.closeLocationPct, "Today"], itemStyle: { color: "#d4af37" }, symbolSize: 18 } : null;
  return {
    animation: false,
    grid: { left: 48, right: 20, top: 28, bottom: 44 },
    tooltip: {
      formatter: (params: unknown) => {
        const value = params && typeof params === "object" && "value" in params ? (params as { value?: unknown[] }).value : undefined;
        return Array.isArray(value)
          ? `${value[2] ?? "Session"}<br/>Gap ${pct(num(value[0] as number | null), 2, true)}<br/>Close-location ${pct(num(value[1] as number | null), 1)}`
          : "—";
      }
    },
    xAxis: { type: "value", name: "Gap %", axisLabel: { color: "#8b93a7", formatter: "{value}%" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    yAxis: { type: "value", name: "Close-location %", min: 0, max: 100, axisLabel: { color: "#8b93a7", formatter: "{value}%" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    series: [{ type: "scatter", symbolSize: 12, data: todayPoint ? [...analogPoints, todayPoint] : analogPoints }]
  };
}

function buildFollowThroughOption(stateStats: MarketStateHistoryStat[], currentState: string | null | undefined): EChartsOption {
  const sorted = [...stateStats].sort((a, b) => (b.sessionCount - a.sessionCount) || a.label.localeCompare(b.label)).slice(0, 6);
  if (currentState && !sorted.find((item) => item.primaryState === currentState)) {
    const match = stateStats.find((item) => item.primaryState === currentState);
    if (match) sorted.push(match);
  }
  const unique = sorted.filter((item, index, list) => list.findIndex((candidate) => candidate.primaryState === item.primaryState) === index);
  return {
    animation: false,
    grid: { left: 56, right: 20, top: 28, bottom: 80 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: unique.map((item) => item.label), axisLabel: { color: "#8b93a7", interval: 0, rotate: 24 } },
    yAxis: { type: "value", name: "Follow-through %", axisLabel: { color: "#8b93a7", formatter: "{value}%" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    series: [{ type: "bar", barMaxWidth: 36, data: unique.map((item) => ({ value: item.nextDayFollowthroughPct, itemStyle: { color: item.primaryState === currentState ? "#d4af37" : "#69d2e7" } })) }]
  };
}

function makeRubric(entries: Array<[string, string]>) {
  return entries.map(([label, value]) => ({ label, value }));
}

function chartReadings(payload: AnalyticsMarketStateResponse, tr: (value: string) => string): ChartReading[] {
  const session = payload.session;
  if (!session) return [];
  const minuteSeries = payload.minuteSeries;
  const exactStats = payload.exactStateStats;
  const vixChange = payload.officialContext?.indiaVix?.changePct ?? null;
  const officialIndexChange = payload.officialContext?.nifty50?.changePct ?? null;
  const analogs = payload.analogs.slice(0, 3);

  return [
    {
      id: "index-breadth",
      title: tr("Index price vs breadth-up %"),
      subtitle: tr("Price can be carried by weight; breadth shows whether the tape is truly broad."),
      option: buildIndexBreadthOption(minuteSeries),
      rubric: makeRubric([
        [tr("1. What this chart is measuring."), tr("The intraday Nifty 50 path versus the percentage of names above prior close.")],
        [tr("2. Why traders or analysts care about it."), tr("It separates index strength from broad market strength.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is IST session time. Left Y-axis is index points. Right Y-axis is breadth-up in percent.")],
        [tr("4. What a bullish reading looks like."), tr("Price and breadth rise together, with breadth staying above about 60%.")],
        [tr("5. What a bearish reading looks like."), tr("Price trends lower while breadth stays weak and cannot repair.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Breadth sits around 50% while price mean-reverts instead of trending.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Opening-auction noise, stale constituent coverage, and cap-weight distortion.")],
        [tr("8. What todays reading says."), tr(`Breadth-up closed at ${pct(session.breadthUpPct, 1)} while the state snapshot closed ${pct(session.changePct, 2, true)} and the official close printed ${pct(officialIndexChange, 2, true)}. That says the tape repaired internally, but not decisively.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(`Breadth above VWAP ${pct(session.breadthAboveVwapPct, 1)} and close-location ${pct(session.closeLocationPct, 1)} confirm the late repair.`)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`Weighted participation ${pct(session.weightedParticipationPct, 1)} and India VIX ${pct(vixChange, 2, true)} contradict a clean bullish breadth expansion.`)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: trust price more when breadth confirms it, and trust breadth more when it improves before price does.")]
      ])
    },
    {
      id: "breadth-weight",
      title: tr("Breadth above VWAP % vs weighted participation %"),
      subtitle: tr("Many names can look healthy without the heavyweights actually carrying the index."),
      option: buildBreadthWeightOption(minuteSeries),
      rubric: makeRubric([
        [tr("1. What this chart is measuring."), tr("The share of names above session VWAP versus the weighted participation of index constituents.")],
        [tr("2. Why traders or analysts care about it."), tr("It tells you whether breadth health is real index support or only a lighter-stock repair.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is IST time. Y-axis is percent for both lines.")],
        [tr("4. What a bullish reading looks like."), tr("Both lines above about 60%, with weighted participation confirming breadth.")],
        [tr("5. What a bearish reading looks like."), tr("Both lines stay below about 40%, especially if weight leads lower.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("One line improves while the other stays stuck, leaving the move mixed.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Early-session VWAP gaps, expiry flows, and rebalance days.")],
        [tr("8. What todays reading says."), tr(`Breadth above VWAP ended ${pct(session.breadthAboveVwapPct, 1)} while weighted participation ended ${pct(session.weightedParticipationPct, 1)}. More names repaired than heavyweights confirmed.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(`Top-10 concentration stayed low at ${pct(session.top10ConcentrationPct, 1)}, so the repair was dispersed rather than carried by a few names.`)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`Close-location ${pct(session.closeLocationPct, 1)} was strong enough that you would normally expect better weight confirmation.`)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: breadth above VWAP tells you how many names are okay; weighted participation tells you whether the index can act on it.")]
      ])
    },
    {
      id: "concentration",
      title: tr("Top-10 concentration % vs index return"),
      subtitle: tr("Low concentration with weak return is churn; high concentration with a strong index is narrow leadership."),
      option: buildConcentrationOption(minuteSeries),
      rubric: makeRubric([
        [tr("1. What this chart is measuring."), tr("Index return versus the share of contribution coming from the top ten names.")],
        [tr("2. Why traders or analysts care about it."), tr("It reveals whether a move is broad or is being carried by a few heavyweights.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is IST time. Left Y-axis is return percent. Right Y-axis is top-10 concentration percent.")],
        [tr("4. What a bullish reading looks like."), tr("Return improves without a concentration spike, meaning the move is broad.")],
        [tr("5. What a bearish reading looks like."), tr("Concentration rises while return stays weak, meaning even leadership is not enough.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("Concentration stays middling while return hovers around flat.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Rebalances, expiry, and one-off earnings shocks in heavyweights.")],
        [tr("8. What todays reading says."), tr(`The day finished with concentration ${pct(session.top10ConcentrationPct, 1)} and intraday return ${pct(session.changePct, 2, true)}. That is dispersed churn, not a narrow-leadership rescue.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(`Breadth-up recovered to ${pct(session.breadthUpPct, 1)}, which fits dispersed movement instead of a few names dragging the index.`)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`Weighted participation ${pct(session.weightedParticipationPct, 1)} still lagged, so heavyweights were not fully aligned even though concentration stayed low.`)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: low concentration is only bullish when price and participation improve with it.")]
      ])
    },
    {
      id: "timeline",
      title: tr("Session-state timeline"),
      subtitle: tr("The path matters: stable trend, failed open, noisy repair, or repeated sign flips."),
      option: buildStateTimelineOption(minuteSeries),
      rubric: makeRubric([
        [tr("1. What this chart is measuring."), tr("The dominant intraday state label minute by minute.")],
        [tr("2. Why traders or analysts care about it."), tr("A strong close reached through stable acceptance is more trustworthy than one reached through repeated flips.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is IST time. Y-axis is categorical session state labels.")],
        [tr("4. What a bullish reading looks like."), tr("One constructive state dominates most of the session with few regime flips.")],
        [tr("5. What a bearish reading looks like."), tr("Weak states dominate and every repair attempt is rejected quickly.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("The state flips around and ends without stable directional acceptance.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Overweighting the final few minutes and ignoring the unstable path into them.")],
        [tr("8. What todays reading says."), tr(`The day opened stressed, spent most of the session repairing, and closed near the high, but still kept enough instability for the dominant read to remain ${payload.verdict?.dominantState ?? "balanced / indecisive"}.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(`Session range ${pct(session.sessionRangePct, 2)}, gap filled ${session.gapFilled ? "yes" : "no"}, and failed open ${session.failedOpen ? "yes" : "no"} confirm the unstable repair.`)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`Close-location ${pct(session.closeLocationPct, 1)} and breadth above VWAP ${pct(session.breadthAboveVwapPct, 1)} are stronger than you would expect from a fully indecisive close.`)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: judge the route into the close, not only the close itself.")]
      ])
    },
    {
      id: "gap-close",
      title: tr("Gap type vs close-location value"),
      subtitle: tr("A repaired gap can still be only repair if follow-through and participation do not confirm it."),
      option: buildGapCloseOption(session, payload.analogs),
      rubric: makeRubric([
        [tr("1. What this chart is measuring."), tr("Opening gap percent versus close-location percent within the day’s range.")],
        [tr("2. Why traders or analysts care about it."), tr("It tells you whether the open was accepted or rejected by the close.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is gap percent vs previous close. Y-axis is close-location percent, where 100% is the day high.")],
        [tr("4. What a bullish reading looks like."), tr("A negative gap repaired into a high-range close, or a positive gap that holds high.")],
        [tr("5. What a bearish reading looks like."), tr("A positive gap that fails low, or a negative gap that expands lower and closes near the low.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("A filled gap with a mid-range close.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Short-covering gap fills that look bullish intraday but lack follow-through.")],
        [tr("8. What todays reading says."), tr(`Today's point is ${pct(session.gapPct, 2, true)} gap and ${pct(session.closeLocationPct, 1)} close-location. That is a negative-gap repair ending in the high-close quadrant.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(`Gap filled ${session.gapFilled ? "yes" : "no"} and breadth-up ${pct(session.breadthUpPct, 1)} both confirm that the opening weakness was rejected.`)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`Exact-state follow-through ${pct(exactStats?.nextDayFollowthroughPct, 1)} and average next-day move ${pct(exactStats?.avgNextDayChangePct, 2, true)} contradict treating the repair as automatic continuation.`)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: a repaired gap is informative, but participation and next-day follow-through decide whether it matters.")]
      ])
    },
    {
      id: "followthrough",
      title: tr("Historical next-session follow-through by state"),
      subtitle: tr("Exact-state history keeps the current label honest before you chase continuation."),
      option: buildFollowThroughOption(payload.stateStats, session.primaryState),
      rubric: makeRubric([
        [tr("1. What this chart is measuring."), tr("The stored next-session follow-through rate for each market state.")],
        [tr("2. Why traders or analysts care about it."), tr("It turns a label into a base-rate question: continuation, fade, or reduced conviction.")],
        [tr("3. What the axes mean and what units are used."), tr("X-axis is state label. Y-axis is next-session follow-through in percent.")],
        [tr("4. What a bullish reading looks like."), tr("The current state has a positive next-session base rate and a meaningfully high follow-through percent.")],
        [tr("5. What a bearish reading looks like."), tr("The current state has weak follow-through and negative average next-day change.")],
        [tr("6. What a neutral or indecisive reading looks like."), tr("The sample is too small or too mixed to carry much predictive weight.")],
        [tr("7. What can fool the reader or produce a false signal."), tr("Tiny samples and over-reliance on exact labels instead of the broader state family.")],
        [tr("8. What todays reading says."), tr(`The exact state ${session.primaryState ?? "balanced"} has ${formatNumber(exactStats?.sessionCount ?? 0, { maximumFractionDigits: 0 })} sessions, ${pct(exactStats?.nextDayFollowthroughPct, 1)} follow-through, and ${pct(exactStats?.avgNextDayChangePct, 2, true)} average next-day move. That keeps the base rate cautious.`)],
        [tr("9. What confirms this reading elsewhere on the dashboard."), tr(`India VIX ${pct(vixChange, 2, true)} and failed open ${session.failedOpen ? "yes" : "no"} both confirm a fade-first reading.`)],
        [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`The top family analog ${analogLabel(analogs[0])} and close-location ${pct(session.closeLocationPct, 1)} both argue the late repair still deserves respect.`)],
        [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: use exact-state history first, then widen to same-family analogs when the exact sample is thin.")]
      ])
    }
  ];
}

function verdictConfirmationLines(payload: AnalyticsMarketStateResponse, tr: (value: string) => string) {
  const session = payload.session;
  if (!session) return [];
  return [
    tr(`Session range ${pct(session.sessionRangePct, 2)} and gap ${pct(session.gapPct, 2, true)} confirm the day was unstable from the open.`),
    tr(`Gap filled ${session.gapFilled ? "yes" : "no"} and failed open ${session.failedOpen ? "yes" : "no"} confirm a repair-after-stress structure rather than a clean open-drive.`),
    tr(`India VIX ${pct(payload.officialContext?.indiaVix?.changePct, 2, true)} confirms that the volatility backdrop did not fully calm down.`)
  ];
}

function verdictContradictionLines(payload: AnalyticsMarketStateResponse, tr: (value: string) => string) {
  const session = payload.session;
  if (!session) return [];
  return [
    tr(`Close-location ${pct(session.closeLocationPct, 1)} contradicts a fully weak tape because buyers still pushed the close toward the day high.`),
    tr(`Breadth above VWAP ${pct(session.breadthAboveVwapPct, 1)} contradicts the most bearish interpretation because more than half the universe repaired.`),
    tr(`Official Nifty 50 close ${pct(payload.officialContext?.nifty50?.changePct, 2, true)} contradicts the harsher intraday snapshot by finishing modestly positive.`)
  ];
}

function bestEntryContexts(payload: AnalyticsMarketStateResponse, tr: (value: string) => string) {
  const session = payload.session;
  if (!session) return [];
  return [
    tr("Fade stretched opening moves when a large gap starts filling but weighted participation still lags breadth."),
    tr("Take selective longs only in names that reclaimed VWAP and held it into the close."),
    tr("Reduce broad index continuation exposure until weighted participation confirms the late repair.")
  ];
}

function invalidationConditions(payload: AnalyticsMarketStateResponse, tr: (value: string) => string) {
  const session = payload.session;
  if (!session) return [];
  return [
    tr("Breadth above VWAP and weighted participation both sustain above 60%, upgrading the tape from repair to broad acceptance."),
    tr("The next session opens firm and accepts above the previous close instead of re-testing the failed-open structure."),
    tr("India VIX cools while price holds higher, removing the stress backdrop behind the chop verdict.")
  ];
}

function teachingNotes(payload: AnalyticsMarketStateResponse, tr: (value: string) => string) {
  const analogs = payload.analogs.slice(0, 3);
  return [
    analogs[0] ? tr(`${analogLabel(analogs[0])} is the closest analog and shows how similar structures resolved one session later.`) : tr("Use the closest analog first before trusting a single day’s close."),
    analogs[1] ? tr(`${analogLabel(analogs[1])} helps you compare whether late repair led to continuation or only short-covering.`) : tr("Compare at least two analogs so you do not overfit one outcome."),
    analogs[2] ? tr(`${analogLabel(analogs[2])} reminds you to separate a strong close from a genuinely broad market close.`) : tr("Always compare breadth, participation, and concentration separately.")
  ];
}

function alertRules(payload: AnalyticsMarketStateResponse, tr: (value: string) => string) {
  const session = payload.session;
  if (!session) return [];
  return [
    tr("Alert if breadth above VWAP and weighted participation both move above 60%; the state is upgrading toward trend continuation."),
    tr("Alert if top-10 concentration spikes above 40% while breadth stalls; the tape is narrowing into leadership risk."),
    tr("Alert if India VIX expands again while breadth-up slips below 45%; the repair is failing back into a stress regime.")
  ];
}

function buildVerdictText(payload: AnalyticsMarketStateResponse, tr: (value: string) => string) {
  const session = payload.session;
  if (!session || !payload.verdict) return "";
  return tr(
    `The dominant state is ${payload.verdict.dominantState}. The open printed ${pct(session.gapPct, 2, true)}, the full-session range reached ${pct(session.sessionRangePct, 2)}, and the close finished at ${pct(session.closeLocationPct, 1)} of the day range. That combination says repair happened, but it happened inside a still-volatile tape rather than a clean trend session.`
  );
}

export function AnalyticsMarketStatePage() {
  const { tr } = useI18n();
  const { authReady } = useAuthGate();
  const marketStateQuery = useAnalyticsMarketState(authReady);

  usePageLoadProfile({
    pageName: "analytics_market_state",
    enabled: authReady,
    queries: [{ name: "analytics-market-state", isLoading: marketStateQuery.isLoading, isError: !!marketStateQuery.error }]
  });

  const loading = !authReady || (!marketStateQuery.data && marketStateQuery.isLoading);
  const showLoading = useDeferredBusyState(loading);
  const chartCards = useMemo(() => (marketStateQuery.data ? chartReadings(marketStateQuery.data, tr) : []), [marketStateQuery.data, tr]);

  if (loading) {
    if (!showLoading) return null;
    return (
      <div className={styles.page}>
        <section className={styles.metricGrid}>
          <LoadingSkeletonCard title={tr("Dominant state")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Preferred environment")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Weighted participation")} lines={3} compact />
          <LoadingSkeletonCard title={tr("India VIX")} lines={3} compact />
        </section>
        <LoadingSkeletonCard title={tr("Session verdict")} lines={5} />
        <LoadingSkeletonCard title={tr("Market state charts")} lines={8} />
      </div>
    );
  }

  if (marketStateQuery.error || !marketStateQuery.data || !marketStateQuery.data.session || !marketStateQuery.data.verdict) {
    return (
      <DataState
        kind="error"
        title={tr("The market-state page is unavailable")}
        body={tr("The dashboard could not assemble the latest session state, breadth, participation, and analog history from the internal market-state tables.")}
      />
    );
  }

  const payload = marketStateQuery.data;
  const session = payload.session!;
  const verdict = payload.verdict!;
  const officialContext = payload.officialContext;
  const exactStateStats = payload.exactStateStats;
  const confirmationLines = verdictConfirmationLines(payload, tr);
  const contradictionLines = verdictContradictionLines(payload, tr);
  const entryContexts = bestEntryContexts(payload, tr);
  const invalidationLines = invalidationConditions(payload, tr);
  const teaching = teachingNotes(payload, tr);
  const alerts = alertRules(payload, tr);
  const verdictText = buildVerdictText(payload, tr);
  const analogs = payload.analogs.slice(0, 3);

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title="Market State"
        meta={`${tr("Trade date")} ${session.tradeDate ? formatDateIST(session.tradeDate) : "—"} • ${tr("Updated")} ${session.generatedAt ? formatDateIST(session.generatedAt, { includeTime: true }) : "—"}`}
        subtitle={tr("Classify the session first, then separate breadth, participation, and concentration before trusting the index move.")}
        learningPrompt={tr("This page answers one question: was today a broad trend, a narrow leadership push, a failed open, or just volatile chop with a strong close?")}
        sectionTabs={[...MARKET_SECTION_TABS]}
      />

      <section className={styles.metricGrid}>
        <KpiCard
          label={tr("Dominant state")}
          value={verdict.dominantState}
          tone={toneFromState(verdict.dominantState)}
          meta={tr("Use this as the headline label, then verify it against the charts underneath before acting on it.")}
        />
        <KpiCard
          label={tr("Preferred environment")}
          value={verdict.preferredEnvironment}
          tone={toneFromState(verdict.dominantState)}
          meta={tr("This is the playbook bias, not a trade signal. Confirmation still matters.")}
        />
        <KpiCard
          label={tr("Weighted participation")}
          value={pct(session.weightedParticipationPct, 1)}
          tone={toneFrom((session.weightedParticipationPct ?? 0) - 50)}
          meta={tr("This tells you whether index weight actually agreed with the move.")}
        />
        <KpiCard
          label={tr("India VIX")}
          value={`${price(officialContext?.indiaVix?.close)} • ${pct(officialContext?.indiaVix?.changePct, 2, true)}`}
          tone={toneFrom(-(officialContext?.indiaVix?.changePct ?? 0))}
          meta={tr("Rising VIX usually supports caution when the session already looks unstable.")}
        />
      </section>

      <section className={styles.verdictGrid}>
        <article className={styles.verdictCard}>
          <div className={styles.verdictHeader}>
            <div>
              <span className={styles.eyebrow}>{tr("A. Session verdict")}</span>
              <h2 className={styles.sectionTitle}>{verdict.dominantState}</h2>
            </div>
            <SymbolPill label={verdict.preferredEnvironment} detail={session.participationLabel ?? tr("Participation watch")} tone={toneFromState(verdict.dominantState)} />
          </div>
          <p className={styles.sectionText}>{verdictText}</p>
          <div className={styles.summaryStrip}>
            <div className={styles.summaryMetric}>
              <strong>{tr("Gap")}</strong>
              <span data-tone={toneFrom(session.gapPct)}>{pct(session.gapPct, 2, true)}</span>
            </div>
            <div className={styles.summaryMetric}>
              <strong>{tr("Range")}</strong>
              <span>{pct(session.sessionRangePct, 2)}</span>
            </div>
            <div className={styles.summaryMetric}>
              <strong>{tr("Close-location")}</strong>
              <span data-tone={toneFrom((session.closeLocationPct ?? 0) - 50)}>{pct(session.closeLocationPct, 1)}</span>
            </div>
            <div className={styles.summaryMetric}>
              <strong>{tr("Breadth-up")}</strong>
              <span data-tone={toneFrom((session.breadthUpPct ?? 0) - 50)}>{pct(session.breadthUpPct, 1)}</span>
            </div>
          </div>
        </article>

        <article className={styles.verdictSideCard}>
          <span className={styles.eyebrow}>{tr("Historical analogs")}</span>
          <div className={styles.chipColumn}>
            {analogs.map((analog) => (
              <SymbolPill
                key={`${analog.tradeDate}-${analog.primaryState}`}
                label={analogLabel(analog)}
                detail={`${tr("Next day")} ${pct(analog.nextDayChangePct, 2, true)}`}
                tone={toneFrom(analog.nextDayChangePct)}
              />
            ))}
          </div>
          <p className={styles.smallPrint}>
            {tr(`Exact-state follow-through is ${pct(exactStateStats?.nextDayFollowthroughPct, 1)} across ${formatNumber(exactStateStats?.sessionCount ?? 0, { maximumFractionDigits: 0 })} stored sessions, so today's strong close still needs confirmation.`)}
          </p>
        </article>
      </section>

      <section className={styles.sectionStack}>
        {chartCards.map((chart) => (
          <ChartCard
            key={chart.id}
            title={chart.title}
            subtitle={chart.subtitle}
            footer={
              <span className={styles.chartFooterText}>
                {tr("Official context")}: {tr("Nifty 50")} {pct(officialContext?.nifty50?.changePct, 2, true)} • {tr("India VIX")} {pct(officialContext?.indiaVix?.changePct, 2, true)}
              </span>
            }
          >
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
          <span className={styles.eyebrow}>{tr("C. What confirms the verdict")}</span>
          <div className={styles.bulletList}>
            {confirmationLines.map((line) => (
              <p key={line} className={styles.sectionText}>{line}</p>
            ))}
          </div>
        </article>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("D. What contradicts the verdict")}</span>
          <div className={styles.bulletList}>
            {contradictionLines.map((line) => (
              <p key={line} className={styles.sectionText}>{line}</p>
            ))}
          </div>
        </article>
      </section>

      <DataTable
        title={tr("Historical analogs")}
        subtitle={tr("Use at least three analogs from the same state family before you decide whether today’s repair deserves continuation or a fade-first bias.")}
        tableName="analytics_market_state_analogs"
        rows={payload.analogs}
        maxHeight={420}
        columns={[
          {
            key: "tradeDate",
            header: tr("Date"),
            sortable: true,
            sortValue: (row) => row.tradeDate ?? "",
            cell: (row) => (
              <div className={styles.dateCell}>
                <strong>{row.tradeDate ? formatDateIST(row.tradeDate) : "—"}</strong>
                <span>{row.label}</span>
              </div>
            )
          },
          {
            key: "gapPct",
            header: tr("Gap"),
            sortable: true,
            align: "right",
            sortValue: (row) => row.gapPct ?? 0,
            cell: (row) => <span data-tone={toneFrom(row.gapPct)}>{pct(row.gapPct, 2, true)}</span>
          },
          {
            key: "closeLocationPct",
            header: tr("Close-location"),
            sortable: true,
            align: "right",
            sortValue: (row) => row.closeLocationPct ?? 0,
            cell: (row) => <span>{pct(row.closeLocationPct, 1)}</span>
          },
          {
            key: "breadthUpPct",
            header: tr("Breadth-up"),
            sortable: true,
            align: "right",
            sortValue: (row) => row.breadthUpPct ?? 0,
            cell: (row) => <span>{pct(row.breadthUpPct, 1)}</span>
          },
          {
            key: "nextDayChangePct",
            header: tr("Next day"),
            sortable: true,
            align: "right",
            sortValue: (row) => row.nextDayChangePct ?? 0,
            cell: (row) => <span data-tone={toneFrom(row.nextDayChangePct)}>{pct(row.nextDayChangePct, 2, true)}</span>
          },
          {
            key: "similarityScore",
            header: tr("Similarity"),
            sortable: true,
            align: "right",
            sortValue: (row) => row.similarityScore ?? 0,
            cell: (row) => formatNumber(row.similarityScore ?? 0, { maximumFractionDigits: 0 })
          }
        ]}
        emptyTitle={tr("No analog sessions found")}
        emptyBody={tr("The state history currently has no comparable sessions with enough overlap to rank as analogs.")}
      />

      <section className={styles.doubleGrid}>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("E. Best entry contexts for this market state")}</span>
          <div className={styles.bulletList}>
            {entryContexts.map((line) => (
              <p key={line} className={styles.sectionText}>{line}</p>
            ))}
          </div>
        </article>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("F. Conditions that would invalidate the current reading")}</span>
          <div className={styles.bulletList}>
            {invalidationLines.map((line) => (
              <p key={line} className={styles.sectionText}>{line}</p>
            ))}
          </div>
        </article>
      </section>

      <section className={styles.doubleGrid}>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("G. Teaching notes for a learner")}</span>
          <div className={styles.bulletList}>
            {teaching.map((line) => (
              <p key={line} className={styles.sectionText}>{line}</p>
            ))}
          </div>
        </article>
        <article className={styles.noteCard}>
          <span className={styles.eyebrow}>{tr("H. Alerts to trigger if the state changes")}</span>
          <div className={styles.bulletList}>
            {alerts.map((line) => (
              <p key={line} className={styles.sectionText}>{line}</p>
            ))}
          </div>
        </article>
      </section>

      <PageIntroAccordion
        label={tr("How to use this page")}
        title={tr("Read breadth, participation, and concentration separately before trusting the index move.")}
        body={tr("This page is intentionally redundant: the verdict tells you the headline state, the six charts test it from different angles, and the confirmation/contradiction sections stop you from over-reading one strong metric in isolation.")}
        items={[
          tr("Do not confuse an index rebound with a broad-market rebound. Weighted participation and breadth-above-VWAP must be read separately."),
          tr("A strong close after a weak open is not automatically bullish. Use follow-through history and India VIX context before you chase it."),
          tr("Low concentration is only helpful when participation is also healthy. Otherwise it often means dispersed churn.")
        ]}
        widgetId="analytics_market_state_help"
      />

      <div className={styles.takeaway}>
        <strong>{tr("Market-state takeaway:")}</strong>{" "}
        {tr("today behaved like a failed-open repair inside a still-volatile environment, so late strength deserves respect but not automatic trend-continuation trust until weighted participation and next-session follow-through confirm it.")}
      </div>
    </div>
  );
}
