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
import { fmtPrice, formatDateIST, formatNumber, formatPercent } from "../lib/format";
import { useAnalyticsLeadership } from "../lib/hooks";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import type { AnalyticsLeadershipResponse, AnalyticsLeadershipSector, AnalyticsLeadershipStock, LeadershipCategory } from "../lib/types";
import { useI18n } from "../i18n/LocaleProvider";
import { AnalyticsHeader, STOCKS_SECTION_TABS } from "./AnalyticsChrome";
import styles from "./AnalyticsLeadershipPage.module.css";

type Tone = "green" | "red" | "white";
type ChartReading = { id: string; title: string; subtitle: string; option: EChartsOption; rubric: Array<{ label: string; value: string }> };

function num(value: number | null | undefined) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function pct(value: number | null | undefined, digits = 1, signed = false) { const v = num(value); return v == null ? "—" : formatPercent(v, digits, signed); }
function px(value: number | null | undefined) { const v = num(value); return v == null ? "—" : fmtPrice(v); }
function toneFrom(value: number | null | undefined): Tone { const v = num(value); if (v == null) return "white"; if (v > 0) return "green"; if (v < 0) return "red"; return "white"; }
function toneFromCategory(category: LeadershipCategory): Tone { return category === "true leader" || category === "catch-up candidate" ? "green" : category === "avoid / noisy" || category === "reversal candidate" ? "red" : "white"; }
function categoryColor(category: LeadershipCategory) { return category === "true leader" ? "#6de29b" : category === "catch-up candidate" ? "#f4d35e" : category === "orderly follower" ? "#7dcfff" : category === "reversal candidate" ? "#f79d65" : "#ff7a7a"; }
function makeRubric(values: Array<[string, string]>) { return values.map(([label, value]) => ({ label, value })); }

function scatterOption(titleX: string, titleY: string, rows: AnalyticsLeadershipStock[], x: (row: AnalyticsLeadershipStock) => number | null | undefined, y: (row: AnalyticsLeadershipStock) => number | null | undefined): EChartsOption {
  return {
    animation: false,
    grid: { left: 52, right: 24, top: 28, bottom: 42 },
    tooltip: { formatter: (params: unknown) => {
      const point = params && typeof params === "object" && "data" in params ? (params as { data?: unknown[] }).data : undefined;
      return Array.isArray(point) ? `${point[2]}<br/>${titleX}: ${point[0]}<br/>${titleY}: ${point[1]}` : "—";
    } },
    xAxis: { type: "value", name: titleX, axisLabel: { color: "#8b93a7" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    yAxis: { type: "value", name: titleY, axisLabel: { color: "#8b93a7" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    series: [{
      type: "scatter",
      symbolSize: 12,
      data: rows.map((row) => ({
        value: [num(x(row)) ?? 0, num(y(row)) ?? 0, row.symbol],
        itemStyle: { color: categoryColor(row.category) }
      }))
    }]
  };
}

function buildSectorHeatmap(sectors: AnalyticsLeadershipSector[]): EChartsOption {
  const metrics = ["Leadership", "Residual", "Continuation", "VWAP", "Reversal"];
  return {
    animation: false,
    grid: { left: 88, right: 20, top: 24, bottom: 72 },
    tooltip: { trigger: "item" },
    xAxis: { type: "category", data: sectors.map((sector) => sector.sectorName), axisLabel: { color: "#8b93a7", interval: 0, rotate: 24 } },
    yAxis: { type: "category", data: metrics, axisLabel: { color: "#8b93a7" } },
    visualMap: { min: 0, max: 100, calculable: false, orient: "horizontal", left: "center", bottom: 0, textStyle: { color: "#8b93a7" } },
    series: [{
      type: "heatmap",
      data: sectors.flatMap((sector, index) => ([
        [index, 0, sector.avgLeadershipScore],
        [index, 1, sector.avgResidualReturn60mPct * 20 + 50],
        [index, 2, sector.avgContinuationScore],
        [index, 3, sector.avgVwapHoldScore],
        [index, 4, sector.avgReversalScore]
      ])),
      label: { show: false }
    }]
  };
}

function buildCatchUpOption(rows: AnalyticsLeadershipStock[]): EChartsOption {
  const items = rows.slice(0, 8).reverse();
  return {
    animation: false,
    grid: { left: 96, right: 20, top: 24, bottom: 28 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "value", axisLabel: { color: "#8b93a7" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    yAxis: { type: "category", data: items.map((row) => row.symbol), axisLabel: { color: "#8b93a7" } },
    series: [{ type: "bar", data: items.map((row) => ({ value: row.catchUpScore ?? 0, itemStyle: { color: categoryColor(row.category) } })), barMaxWidth: 18 }]
  };
}

function buildRankingOption(rows: AnalyticsLeadershipStock[]): EChartsOption {
  const items = rows.slice(0, 10).reverse();
  return {
    animation: false,
    grid: { left: 116, right: 20, top: 24, bottom: 28 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "value", min: 0, max: 100, axisLabel: { color: "#8b93a7" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
    yAxis: { type: "category", data: items.map((row) => `${row.symbol} • ${row.categoryRank}`), axisLabel: { color: "#8b93a7" } },
    series: [{ type: "bar", data: items.map((row) => ({ value: row.leadershipScore, itemStyle: { color: categoryColor(row.category) } })), barMaxWidth: 18 }]
  };
}

function chartReadings(payload: AnalyticsLeadershipResponse, tr: (value: string) => string): ChartReading[] {
  const market = payload.marketState;
  const leaders = payload.topLeaders[0];
  const avoid = payload.falseLeaders[0];
  const bestSector = payload.sectorStrength[0];
  const weakSector = payload.sectorStrength[payload.sectorStrength.length - 1];
  const ranking = payload.rankingBoard;
  const catchUps = payload.catchUpCandidates;
  const continuationSupported = market?.continuationBias ?? "requires stock-by-stock confirmation";
  return [
    { id: "residual-volume", title: tr("Residual return vs volume-curve surprise"), subtitle: tr("Prefer names where residual return is strong and the volume structure is supportive, not theatrical."), option: scatterOption("Volume-curve surprise", "Residual return 60m %", ranking, (row) => row.volumeCurveSurprise, (row) => row.residualReturn60mPct), rubric: makeRubric([
      [tr("1. What this chart is measuring."), tr("Residual return versus volume-curve surprise for each stock, separating true alpha from simple beta participation.")],
      [tr("2. Why traders or analysts care about it."), tr("Residual return shows whether a stock is outperforming the market; volume surprise shows whether that move has structural participation.")],
      [tr("3. What the axes mean and what units are used."), tr("X-axis is volume-curve surprise as a score. Y-axis is residual 60-minute return in percent.")],
      [tr("4. What a bullish reading looks like."), tr("Upper-right stocks with strong residual return and healthy volume structure.")],
      [tr("5. What a bearish reading looks like."), tr("Lower-left names with weak residual return and flat volume structure.")],
      [tr("6. What a neutral or indecisive reading looks like."), tr("Names clustered near zero residual or modest volume surprise without separation.")],
      [tr("7. What can fool the reader or produce a false signal."), tr("One-candle news spikes and illiquid prints can create fake upper-right readings.")],
      [tr("8. What todays reading says."), tr(`${leaders?.symbol ?? "The top leader"} is leading with ${pct(leaders?.residualReturn60mPct, 2, true)} residual return and ${formatNumber(leaders?.volumeCurveSurprise ?? 0, { maximumFractionDigits: 0 })} volume surprise, while ${avoid?.symbol ?? "the top avoid"} looks loud without clean alpha.`)],
      [tr("9. What confirms this reading elsewhere on the dashboard."), tr(`${leaders?.symbol ?? "The lead name"} also scores well on VWAP hold and RS persistence, and ${bestSector?.sectorName ?? "the best sector"} confirms it at sector level.`)],
      [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`Market context is ${continuationSupported}, which means even good alpha names still face index-level chop risk.`)],
      [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: prefer the names in the upper-right only if their VWAP hold and persistence also confirm the move.")]
    ]) },
    { id: "vwap-persistence", title: tr("VWAP-hold quality vs RS persistence"), subtitle: tr("This is the cleanest leader test: can the stock hold structure while its relative strength persists?"), option: scatterOption("VWAP-hold quality", "RS persistence", ranking, (row) => row.vwapHoldQualityScore, (row) => row.rsPersistenceScore), rubric: makeRubric([
      [tr("1. What this chart is measuring."), tr("Each stock’s VWAP-hold quality against relative-strength persistence.")],
      [tr("2. Why traders or analysts care about it."), tr("A real leader tends to hold VWAP and keep outperforming, rather than flash briefly and fade.")],
      [tr("3. What the axes mean and what units are used."), tr("Both axes are internal quality scores on a 0-100 style scale.")],
      [tr("4. What a bullish reading looks like."), tr("Upper-right names holding VWAP while relative strength persists.")],
      [tr("5. What a bearish reading looks like."), tr("Lower-left names failing VWAP and losing persistence.")],
      [tr("6. What a neutral or indecisive reading looks like."), tr("Middle-cluster names that are acceptable but not dominant.")],
      [tr("7. What can fool the reader or produce a false signal."), tr("Sector-wide squeezes can make persistence look better than the stock’s own edge.")],
      [tr("8. What todays reading says."), tr(`${leaders?.symbol ?? "The top leader"} is a real leader because VWAP and persistence are aligned, while ${avoid?.symbol ?? "the top avoid"} shows the opposite structure.`)],
      [tr("9. What confirms this reading elsewhere on the dashboard."), tr(`Continuation score and leadership score both back the upper-right cluster, not just absolute return.`)],
      [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`${weakSector?.sectorName ?? "The weakest sector"} shows poor sector-level follow-through, so single-stock persistence can still fail if the group rolls over.`)],
      [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: a leader is not just green; it stays above VWAP while its relative strength keeps compounding.")]
    ]) },
    { id: "cont-reversal", title: tr("Continuation score vs reversal score"), subtitle: tr("This shows whether the tape is rewarding continuation or only creating fade and reversal setups."), option: scatterOption("Continuation score", "Reversal score", ranking, (row) => row.continuationScore, (row) => row.reversalScore), rubric: makeRubric([
      [tr("1. What this chart is measuring."), tr("Each stock’s continuation score plotted against its reversal score.")],
      [tr("2. Why traders or analysts care about it."), tr("It helps separate breakout continuation candidates from mean-reversion traps.")],
      [tr("3. What the axes mean and what units are used."), tr("Both axes are internal scores; higher values mean stronger continuation or stronger reversal pressure.")],
      [tr("4. What a bullish reading looks like."), tr("Names with high continuation and low reversal pressure.")],
      [tr("5. What a bearish reading looks like."), tr("Names with low continuation and high reversal pressure.")],
      [tr("6. What a neutral or indecisive reading looks like."), tr("Names near the middle where neither side dominates.")],
      [tr("7. What can fool the reader or produce a false signal."), tr("Late-day squeezes can briefly lift continuation scores without improving underlying persistence.")],
      [tr("8. What todays reading says."), tr(`Today still supports stock-by-stock continuation rather than broad continuation. ${leaders?.symbol ?? "The top leader"} sits in the continuation-friendly quadrant, while reversal names remain tactical only.`)],
      [tr("9. What confirms this reading elsewhere on the dashboard."), tr(`The market-state note says ${continuationSupported}, which supports selective continuation and penalizes beta passengers.`)],
      [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`High-volatility market state means reversal pressure can still overwhelm continuation if breadth or participation slips.`)],
      [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: take continuation setups only when continuation is high and reversal pressure stays clearly lower.")]
    ]) },
    { id: "sector-heatmap", title: tr("Sector strength heatmap"), subtitle: tr("Sector confirmation matters because a leader inside a weak sector has less room to keep trending."), option: buildSectorHeatmap(payload.sectorStrength.slice(0, 8)), rubric: makeRubric([
      [tr("1. What this chart is measuring."), tr("Sector-level averages for leadership, residual strength, continuation, VWAP quality, and reversal pressure.")],
      [tr("2. Why traders or analysts care about it."), tr("A stock leader inside a confirming sector is usually stronger than an isolated name in a weak group.")],
      [tr("3. What the axes mean and what units are used."), tr("X-axis is sector. Y-axis is sector metric. Cell color is normalized strength on a 0-100 style scale.")],
      [tr("4. What a bullish reading looks like."), tr("Warm cells across leadership, residual, continuation, and VWAP in the same sector.")],
      [tr("5. What a bearish reading looks like."), tr("Cool cells across those same metrics or hot reversal cells with weak leadership.")],
      [tr("6. What a neutral or indecisive reading looks like."), tr("Mixed colors where no sector owns multiple strength metrics.")],
      [tr("7. What can fool the reader or produce a false signal."), tr("A single heavyweight can distort the whole sector if the group has too few active names.")],
      [tr("8. What todays reading says."), tr(`${bestSector?.sectorName ?? "The leading sector"} is the strongest confirming pocket, while ${weakSector?.sectorName ?? "the weakest sector"} is where leadership is least trustworthy.`)],
      [tr("9. What confirms this reading elsewhere on the dashboard."), tr(`Top leaders are clustering in the stronger sectors instead of appearing as isolated one-stock spikes.`)],
      [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`When a stock’s beta-follow score is still high, sector strength can mask the difference between true alpha and a beta passenger.`)],
      [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: sector confirmation is the difference between a leader with tailwind and a leader swimming alone.")]
    ]) },
    { id: "catch-up", title: tr("Catch-up candidates"), subtitle: tr("These are names with improving structure that have not yet fully converted into top-tier leadership."), option: buildCatchUpOption(catchUps), rubric: makeRubric([
      [tr("1. What this chart is measuring."), tr("The strongest catch-up scores among names that are not already top leaders.")],
      [tr("2. Why traders or analysts care about it."), tr("Catch-up names often offer cleaner pullback or delayed-breakout entries than crowded leaders.")],
      [tr("3. What the axes mean and what units are used."), tr("Y-axis is stock symbol. X-axis is catch-up score on the internal 0-100 style scale.")],
      [tr("4. What a bullish reading looks like."), tr("High catch-up score with decent VWAP quality and controlled beta-follow.")],
      [tr("5. What a bearish reading looks like."), tr("High catch-up score but weak VWAP structure or elevated spike/noise penalties.")],
      [tr("6. What a neutral or indecisive reading looks like."), tr("Scores in the middle without clear confirmation from persistence or continuation.")],
      [tr("7. What can fool the reader or produce a false signal."), tr("Names can look like catch-up candidates when they are only bouncing after weakness.")],
      [tr("8. What todays reading says."), tr(`The catch-up board is useful today because market state favors selective stock picking more than broad continuation.`)],
      [tr("9. What confirms this reading elsewhere on the dashboard."), tr(`Catch-up names are more credible when sector strength is improving and reversal pressure stays contained.`)],
      [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`If the market state slips back into broader chop, catch-up names can fail before the leaders do.`)],
      [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: a catch-up candidate is not late if its VWAP and persistence are still improving.")]
    ]) },
    { id: "ranking", title: tr("Leader / follower / avoid ranking board"), subtitle: tr("This combines residual, structure, continuation, beta-follow, and spike penalties into one teaching-first board."), option: buildRankingOption(ranking), rubric: makeRubric([
      [tr("1. What this chart is measuring."), tr("The highest leadership scores across leaders, followers, catch-up names, reversals, and avoids.")],
      [tr("2. Why traders or analysts care about it."), tr("It turns a noisy stock list into a ranked view of names worth stalking versus names to fade or ignore.")],
      [tr("3. What the axes mean and what units are used."), tr("Y-axis is stock and category rank. X-axis is composite leadership score on a 0-100 scale.")],
      [tr("4. What a bullish reading looks like."), tr("True leaders dominate the board and followers are orderly rather than noisy.")],
      [tr("5. What a bearish reading looks like."), tr("Avoid/noisy names crowd the board or the top scores are still mostly beta passengers.")],
      [tr("6. What a neutral or indecisive reading looks like."), tr("Scores bunch together and categories do not separate cleanly.")],
      [tr("7. What can fool the reader or produce a false signal."), tr("Composite ranks can hide a critical flaw if you ignore the reason list for each stock.")],
      [tr("8. What todays reading says."), tr(`Today's board has ${formatNumber(payload.summary?.trueLeaderCount ?? 0, { maximumFractionDigits: 0 })} true leaders and ${formatNumber(payload.summary?.avoidCount ?? 0, { maximumFractionDigits: 0 })} avoid/noisy names, so the opportunity set exists but is selective.`)],
      [tr("9. What confirms this reading elsewhere on the dashboard."), tr(`Market state is ${payload.summary?.dominantState ?? "mixed"} and the sector heatmap still shows a few confirming pockets for continuation.`)],
      [tr("10. What contradicts this reading elsewhere on the dashboard."), tr(`Weak weighted participation at market level means even a strong board still needs selective execution rather than broad risk-on exposure.`)],
      [tr("11. One short teaching note beginning with \"How to read:\"."), tr("How to read: read the rank first, then ask whether the stock is a true leader or only a beta passenger hiding inside a green tape.")]
    ]) }
  ];
}

function listForCategory(rows: AnalyticsLeadershipStock[], heading: string) {
  return (
    <article className={styles.noteCard}>
      <span className={styles.eyebrow}>{heading}</span>
      <div className={styles.stockList}>
        {rows.map((row) => (
          <div key={`${heading}-${row.symbol}`} className={styles.stockItem}>
            <div className={styles.stockHeader}>
              <SymbolPill label={row.symbol} detail={row.category} tone={toneFromCategory(row.category)} />
              <span className={styles.stockMeta}>{row.sectorName} • {px(row.lastPrice)} • {pct(row.absoluteReturnPct, 2, true)}</span>
            </div>
            <p className={styles.sectionText}><strong>{row.explanation}</strong></p>
            <p className={styles.smallPrint}>{row.reasons.join(" • ") || "No extra reasons were attached."}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

export function AnalyticsLeadershipPage() {
  const { tr } = useI18n();
  const { authReady } = useAuthGate();
  const query = useAnalyticsLeadership(authReady);
  usePageLoadProfile({ pageName: "analytics_leadership", enabled: authReady, queries: [{ name: "analytics-leadership", isLoading: query.isLoading, isError: !!query.error }] });
  const loading = !authReady || (!query.data && query.isLoading);
  const showLoading = useDeferredBusyState(loading);
  const charts = useMemo(() => (query.data ? chartReadings(query.data, tr) : []), [query.data, tr]);

  if (loading) {
    if (!showLoading) return null;
    return <div className={styles.page}><section className={styles.metricGrid}><LoadingSkeletonCard title={tr("Leadership summary")} lines={3} compact /><LoadingSkeletonCard title={tr("True leaders")} lines={3} compact /><LoadingSkeletonCard title={tr("Avoid names")} lines={3} compact /><LoadingSkeletonCard title={tr("Market support")} lines={3} compact /></section><LoadingSkeletonCard title={tr("Stock leadership charts")} lines={8} /></div>;
  }

  if (query.error || !query.data || !query.data.marketState || !query.data.summary) {
    return <DataState kind="error" title={tr("The stock leadership page is unavailable")} body={tr("The dashboard could not assemble the latest stock-level alpha, VWAP, volume, and signal context from the leadership tables.")} />;
  }

  const payload = query.data;
  const summary = payload.summary!;
  const market = payload.marketState!;

  return (
    <div className={styles.page}>
      <AnalyticsHeader title="Stock Leadership" meta={`${tr("Trade date")} ${payload.tradeDate ? formatDateIST(payload.tradeDate) : "—"} • ${tr("Updated")} ${payload.coverage.asOf ? formatDateIST(payload.coverage.asOf, { includeTime: true }) : "—"}`} subtitle={tr("Separate true alpha from index-beta passengers by reading residual strength, VWAP quality, persistence, and sector confirmation together.")} learningPrompt={tr("This page answers one question: which stocks are real leaders, which are just following the tape, and which names should be avoided?")} sectionTabs={[...STOCKS_SECTION_TABS]} />

      <section className={styles.metricGrid}>
        <KpiCard label={tr("A. Leadership summary")} value={summary.marketSupportNote} tone={toneFromCategory("true leader")} meta={tr("Residual strength is weighted more than raw return so beta passengers do not dominate the board.")} />
        <KpiCard label={tr("True leaders")} value={formatNumber(summary.trueLeaderCount, { maximumFractionDigits: 0 })} tone="green" meta={tr(`Best sector: ${summary.strongestSector ?? "—"}`)} />
        <KpiCard label={tr("Avoid / noisy")} value={formatNumber(summary.avoidCount, { maximumFractionDigits: 0 })} tone="red" meta={tr(`Weakest sector: ${summary.weakestSector ?? "—"}`)} />
        <KpiCard label={tr("Market support")} value={market.continuationBias} tone={toneFrom(market.indexChangePct)} meta={tr(`Breadth ${pct(market.breadthUpPct, 1)} • Weighted participation ${pct(market.weightedParticipationPct, 1)} • Concentration ${pct(market.top10ConcentrationPct, 1)}`)} />
      </section>

      <section className={styles.verdictCard}>
        <span className={styles.eyebrow}>{tr("Leader vs beta passenger")}</span>
        <p className={styles.sectionText}>{tr("A true leader is outperforming on residual terms, holding VWAP, and keeping its relative-strength persistence alive. A beta passenger may be green, but the move is mostly explained by the index or sector dragging it higher.")}</p>
        <p className={styles.sectionText}>{tr(`Today’s market state is ${summary.dominantState}, which ${summary.continuationBias}. That means stock-level continuation exists, but only in names whose residual, VWAP, and persistence all agree.`)}</p>
      </section>

      <section className={styles.doubleGrid}>
        {listForCategory(payload.topLeaders, tr("B. Top 5 true leaders with reasons"))}
        {listForCategory(payload.falseLeaders, tr("C. Top 5 false leaders or avoid names with reasons"))}
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
        <article className={styles.noteCard}><span className={styles.eyebrow}>{tr("E. Best entry styles by stock category")}</span><div className={styles.bulletList}><p className={styles.sectionText}>{tr("Breakout continuation: use only true leaders with strong residual return, VWAP hold, and persistence.")}</p><p className={styles.sectionText}>{tr("Pullback entry: use catch-up candidates that keep improving structure without becoming spike-heavy.")}</p><p className={styles.sectionText}>{tr("Relative-strength hold: use orderly followers only when their sector still confirms the move.")}</p><p className={styles.sectionText}>{tr("Mean-reversion only: reserve reversal candidates and avoid/noisy names for fade setups, not for trend chasing.")}</p></div></article>
        <article className={styles.noteCard}><span className={styles.eyebrow}>{tr("F. What would invalidate leadership")}</span><div className={styles.bulletList}><p className={styles.sectionText}>{tr("The leader loses VWAP and its residual edge compresses back toward the pack.")}</p><p className={styles.sectionText}>{tr("Sector confirmation cools while beta-follow pressure rises, revealing that the move was group beta rather than stock alpha.")}</p><p className={styles.sectionText}>{tr("Headline spike or anomaly risk rises faster than persistence, turning a leader into a noisy chase.")}</p></div></article>
      </section>

      <section className={styles.doubleGrid}>
        <article className={styles.noteCard}><span className={styles.eyebrow}>{tr("G. Sector confirmation or contradiction")}</span><div className={styles.bulletList}>{payload.sectorStrength.slice(0, 4).map((sector) => <p key={sector.sectorName} className={styles.sectionText}><strong>{sector.sectorName}:</strong> {sector.confirmation}; {sector.contradiction}.</p>)}</div></article>
        <article className={styles.noteCard}><span className={styles.eyebrow}>{tr("H. Teaching notes")}</span><div className={styles.bulletList}><p className={styles.sectionText}>{tr("Residual strength matters more than absolute return because it strips out part of the market beta effect.")}</p><p className={styles.sectionText}>{tr("VWAP-hold quality and RS persistence are what turn a green stock into a reliable hold rather than a one-candle story.")}</p><p className={styles.sectionText}>{tr("A leader with no sector confirmation is still tradable, but it deserves smaller size and faster risk management.")}</p></div></article>
      </section>

      <DataTable
        title={tr("Leader / follower / avoid ranking board")}
        subtitle={tr("Read the rank first, then use the category, reasons, and market-state context to decide which names are actionable.")}
        tableName="analytics_leadership_ranking"
        rows={payload.rankingBoard}
        maxHeight={520}
        columns={[
          { key: "symbol", header: tr("Symbol"), sortable: true, sortValue: (row) => row.symbol, cell: (row) => <div className={styles.rankCell}><strong>{row.symbol}</strong><span>{row.sectorName}</span></div> },
          { key: "category", header: tr("Category"), sortable: true, sortValue: (row) => row.category, cell: (row) => <SymbolPill label={row.category} detail={`#${row.categoryRank}`} tone={toneFromCategory(row.category)} /> },
          { key: "leadershipScore", header: tr("Leadership"), sortable: true, align: "right", sortValue: (row) => row.leadershipScore, cell: (row) => formatNumber(row.leadershipScore, { maximumFractionDigits: 1 }) },
          { key: "residualReturn60mPct", header: tr("Residual"), sortable: true, align: "right", sortValue: (row) => row.residualReturn60mPct ?? 0, cell: (row) => <span data-tone={toneFrom(row.residualReturn60mPct)}>{pct(row.residualReturn60mPct, 2, true)}</span> },
          { key: "vwapHoldQualityScore", header: tr("VWAP"), sortable: true, align: "right", sortValue: (row) => row.vwapHoldQualityScore ?? 0, cell: (row) => formatNumber(row.vwapHoldQualityScore ?? 0, { maximumFractionDigits: 0 }) },
          { key: "rsPersistenceScore", header: tr("Persistence"), sortable: true, align: "right", sortValue: (row) => row.rsPersistenceScore ?? 0, cell: (row) => formatNumber(row.rsPersistenceScore ?? 0, { maximumFractionDigits: 0 }) },
          { key: "betaFollowScore", header: tr("Beta follow"), sortable: true, align: "right", sortValue: (row) => row.betaFollowScore ?? 0, cell: (row) => formatNumber(row.betaFollowScore ?? 0, { maximumFractionDigits: 0 }) },
          { key: "headlineSpikeScore", header: tr("Spike"), sortable: true, align: "right", sortValue: (row) => row.headlineSpikeScore ?? 0, cell: (row) => formatNumber(row.headlineSpikeScore ?? 0, { maximumFractionDigits: 0 }) }
        ]}
      />

      <PageIntroAccordion label={tr("How to use this page")} title={tr("Start with market support, then read residual, VWAP, persistence, and sector confirmation before you chase any name.")} body={tr("This page is designed to teach the difference between a true leader and a beta passenger. Read every chart as a cross-check, not as a standalone trigger.")} items={[tr("Prefer residual strength over raw return."), tr("Reward persistence and VWAP hold more than one fast candle."), tr("Penalize names that look good only because the sector or index is dragging them.")]} widgetId="analytics_stock_leadership_help" />

      <div className={styles.takeaway}><strong>{tr("Leadership takeaway:")}</strong> {tr("today supports selective stock continuation only in names whose residual return, VWAP hold, persistence, and sector confirmation all line up; broad green beta alone is not enough.")}</div>
    </div>
  );
}
