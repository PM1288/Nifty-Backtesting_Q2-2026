import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { useParams } from "react-router-dom";
import { useAuthGate } from "../auth/AuthGateProvider";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import {
  ChartCard,
  DataState,
  DataTable,
  InterpretationCard,
  KpiCard,
  LoadingSkeletonCard,
  LoadingTableCard,
  PlainLanguageCard,
  SectionDivider
} from "../components/ui/DashboardPrimitives";
import { EChartSurface } from "../components/visual/EChartSurface";
import { fmtDecimal, fmtPct, fmtPrice, fmtWholeNumber, formatCurrencyINR, formatDateIST, formatTime } from "../lib/format";
import { useBacktestingCompare, useIntradayAnalyticsStock, useIntradayAnalyticsSummary, useOiisCandidateContext, useOverview, useStock } from "../lib/hooks";
import type { IntradayBar } from "../lib/types";
import { useI18n } from "../i18n/LocaleProvider";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import { AnalyticsHeader, num, text, toneFromNumber, useAnalyticsExperienceMode } from "./AnalyticsChrome";
import styles from "./AnalyticsPage.module.css";
import { LearnAboutThisAnalysis, RelatedJourney, ReturnToSource } from "../components/navigation/StrategicPrimitives";
import { useProfileIndex } from "../lib/stockProfiles";
import { StockIdentity } from "../components/stocks/StockProfileControls";

function signedPct(value: unknown) {
  const parsed = num(value);
  if (!Number.isFinite(parsed)) return "—";
  return fmtPct(parsed);
}

function fmtMaybe(value: unknown, digits = 2) {
  const parsed = num(value);
  return Number.isFinite(parsed) ? fmtDecimal(parsed, digits) : "—";
}

function topEntries(record: Record<string, number> | undefined, take = 4, descending = true) {
  return Object.entries(record ?? {})
    .filter(([, value]) => Number.isFinite(value))
    .sort((a, b) => (descending ? b[1] - a[1] : a[1] - b[1]))
    .slice(0, take);
}

function humanizeKey(value: string) {
  return value.replace(/[_-]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function latestCloseFromBars(bars: Array<{ c: number }> | undefined) {
  return bars?.length ? bars[bars.length - 1]!.c : null;
}

function computeWindowReturnPct(bars: Array<{ c: number }> | undefined) {
  if (!bars || bars.length < 2) return null;
  const first = bars[0]?.c;
  const last = bars[bars.length - 1]?.c;
  if (!Number.isFinite(first) || !Number.isFinite(last) || !first) return null;
  return ((last - first) / first) * 100;
}

function technicalChartOption(bars: IntradayBar[]): EChartsOption {
  const rows = bars.slice(-120);
  const dates = rows.map((row) => row.t.slice(0, 10));
  const closes = rows.map((row) => row.c);
  const bollinger = rows.map((_, index) => {
    if (index < 19) return [null, null, null] as const;
    const window = closes.slice(index - 19, index + 1);
    const middle = window.reduce((sum, value) => sum + value, 0) / window.length;
    const deviation = Math.sqrt(window.reduce((sum, value) => sum + ((value - middle) ** 2), 0) / window.length);
    return [middle + 2 * deviation, middle, middle - 2 * deviation] as const;
  });
  const rsi = rows.map((_, index) => {
    if (index < 14) return null;
    let gain = 0;
    let loss = 0;
    for (let cursor = index - 13; cursor <= index; cursor += 1) {
      const change = closes[cursor]! - closes[cursor - 1]!;
      if (change >= 0) gain += change;
      else loss -= change;
    }
    if (loss === 0) return 100;
    const rs = (gain / 14) / (loss / 14);
    return 100 - 100 / (1 + rs);
  });
  const pivots = rows.map((_, index) => {
    if (index === 0) return [null, null, null] as const;
    const previous = rows[index - 1]!;
    const pivot = (previous.h + previous.l + previous.c) / 3;
    return [2 * pivot - previous.l, pivot, 2 * pivot - previous.h] as const;
  });

  return {
    animation: false,
    backgroundColor: "#ffffff",
    legend: { top: 2, data: ["Price", "BB upper", "BB 20", "BB lower", "R1", "Pivot", "S1", "Volume", "RSI 14"] },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    grid: [
      { left: 58, right: 28, top: 42, height: "52%" },
      { left: 58, right: 28, top: "64%", height: "13%" },
      { left: 58, right: 28, top: "81%", height: "13%" },
    ],
    xAxis: [0, 1, 2].map((gridIndex) => ({
      type: "category",
      gridIndex,
      data: dates,
      boundaryGap: true,
      axisLabel: { show: gridIndex === 2, color: "#64748b", hideOverlap: true },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
    })),
    yAxis: [
      { scale: true, gridIndex: 0, axisLabel: { color: "#64748b" }, splitLine: { lineStyle: { color: "#edf2f7" } } },
      { scale: true, gridIndex: 1, axisLabel: { color: "#64748b" }, splitLine: { show: false } },
      { min: 0, max: 100, gridIndex: 2, axisLabel: { color: "#64748b" }, splitLine: { lineStyle: { color: "#edf2f7" } } },
    ],
    dataZoom: [{ type: "inside", xAxisIndex: [0, 1, 2], start: 30, end: 100 }, { type: "slider", xAxisIndex: [0, 1, 2], bottom: 0, height: 18, start: 30, end: 100 }],
    series: [
      { name: "Price", type: "candlestick", xAxisIndex: 0, yAxisIndex: 0, data: rows.map((row) => [row.o, row.c, row.l, row.h]), itemStyle: { color: "#15965f", color0: "#d1434b", borderColor: "#15965f", borderColor0: "#d1434b" } },
      { name: "BB upper", type: "line", showSymbol: false, xAxisIndex: 0, yAxisIndex: 0, data: bollinger.map((item) => item[0]), lineStyle: { color: "#6d5bd0", width: 1 } },
      { name: "BB 20", type: "line", showSymbol: false, xAxisIndex: 0, yAxisIndex: 0, data: bollinger.map((item) => item[1]), lineStyle: { color: "#2563a8", width: 1.5 } },
      { name: "BB lower", type: "line", showSymbol: false, xAxisIndex: 0, yAxisIndex: 0, data: bollinger.map((item) => item[2]), lineStyle: { color: "#6d5bd0", width: 1 } },
      { name: "R1", type: "line", showSymbol: false, xAxisIndex: 0, yAxisIndex: 0, data: pivots.map((item) => item[0]), lineStyle: { color: "#df6f38", width: 1, type: "dashed" } },
      { name: "Pivot", type: "line", showSymbol: false, xAxisIndex: 0, yAxisIndex: 0, data: pivots.map((item) => item[1]), lineStyle: { color: "#8a6b21", width: 1, type: "dashed" } },
      { name: "S1", type: "line", showSymbol: false, xAxisIndex: 0, yAxisIndex: 0, data: pivots.map((item) => item[2]), lineStyle: { color: "#26946a", width: 1, type: "dashed" } },
      { name: "Volume", type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: rows.map((row) => row.v ?? 0), itemStyle: { color: "#9db8d3" } },
      { name: "RSI 14", type: "line", showSymbol: false, xAxisIndex: 2, yAxisIndex: 2, data: rsi, lineStyle: { color: "#7c3aed", width: 1.5 }, markLine: { silent: true, symbol: "none", data: [{ yAxis: 70 }, { yAxis: 30 }], lineStyle: { color: "#cbd5e1", type: "dashed" } } },
    ],
  };
}

function buildReading(
  signal: string,
  marketState: string,
  conclusion: string,
  t: (key: string, fallback?: string, values?: Record<string, string | number>) => string
) {
  const normalized = signal.toLowerCase();
  if (normalized.includes("strength")) {
    return {
      title: t("literals.The stock is acting stronger than the average tape.", "The stock is acting stronger than the average tape."),
      body: t(
        "literals.{{conclusion}} In a {{marketState}} session, that usually means buyers are still willing to support this name even if the broad market is mixed.",
        "{{conclusion}} In a {{marketState}} session, that usually means buyers are still willing to support this name even if the broad market is mixed.",
        { conclusion, marketState }
      )
    };
  }
  if (normalized.includes("weakness")) {
    return {
      title: t("literals.The stock is staying weak while the tape moves around it.", "The stock is staying weak while the tape moves around it."),
      body: t(
        "literals.{{conclusion}} In a {{marketState}} session, that usually means sellers still have control and bounce attempts need stronger proof.",
        "{{conclusion}} In a {{marketState}} session, that usually means sellers still have control and bounce attempts need stronger proof.",
        { conclusion, marketState }
      )
    };
  }
  if (normalized.includes("reversal")) {
    return {
      title: t("literals.The stock is trying to change character late in the move.", "The stock is trying to change character late in the move."),
      body: t(
        "literals.{{conclusion}} Reversal reads become more useful when they line up with improving breadth and calmer risk conditions.",
        "{{conclusion}} Reversal reads become more useful when they line up with improving breadth and calmer risk conditions.",
        { conclusion }
      )
    };
  }
  return {
    title: t("literals.Read this stock as a context-dependent setup.", "Read this stock as a context-dependent setup."),
    body: t(
      "literals.{{conclusion}} Use the market state and the quality metrics below to decide whether this is leadership, noise, or a watchlist-only name.",
      "{{conclusion}} Use the market state and the quality metrics below to decide whether this is leadership, noise, or a watchlist-only name.",
      { conclusion }
    )
  };
}

export function AnalyticsStockPage() {
  const { authReady } = useAuthGate();
  const { mode } = useAnalyticsExperienceMode();
  const { t, tr } = useI18n();
  const params = useParams();
  const symbol = (params.symbol ?? "").toUpperCase();
  const profiles = useProfileIndex();
  const stock = useIntradayAnalyticsStock(symbol, authReady);
  const summary = useIntradayAnalyticsSummary(authReady);
  const overview = useOverview(authReady);
  const monthHistory = useStock(symbol, "1M", authReady);
  const yearHistory = useStock(symbol, "1Y", authReady);
  const oiisContext = useOiisCandidateContext(symbol, authReady);
  const strategyCompare = useBacktestingCompare(authReady);
  usePageLoadProfile({
    pageName: "analytics_stock",
    enabled: authReady && !!symbol,
    queries: [
      { name: `intraday-analytics-stock:${symbol}`, isLoading: stock.isLoading, isError: !!stock.error },
      { name: "intraday-analytics-summary", isLoading: summary.isLoading, isError: !!summary.error },
      { name: `stock:${symbol}:1M`, isLoading: monthHistory.isLoading, isError: !!monthHistory.error },
      { name: `stock:${symbol}:1Y`, isLoading: yearHistory.isLoading, isError: !!yearHistory.error },
      { name: `oiis-candidate-context:${symbol}`, isLoading: oiisContext.isLoading, isError: !!oiisContext.error },
      { name: "overview", isLoading: overview.isLoading, isError: !!overview.error },
      { name: "backtesting-compare", isLoading: strategyCompare.isLoading, isError: !!strategyCompare.error }
    ],
    extra: { symbol }
  });
  const loading = !authReady || stock.isLoading || summary.isLoading;
  const showLoading = useDeferredBusyState(loading);
  const yearBars = yearHistory.data?.intraday ?? [];
  const technicalOption = useMemo(() => technicalChartOption(yearBars), [yearBars]);

  if (loading) {
    if (!showLoading) return null;
    return (
      <div className={styles.page}>
        <section className={styles.metricGrid}>
          <LoadingSkeletonCard title={tr("Price context")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Session return")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Dominant signal")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Market state")} lines={3} compact />
        </section>
        <div className={styles.summaryGrid}>
          <LoadingSkeletonCard title={tr("Plain-language stock read")} lines={5} />
        </div>
        <div className={styles.grid2}>
          <LoadingTableCard title={tr("Move quality")} rows={5} />
          <LoadingTableCard title={tr("Relative to the index")} rows={4} />
        </div>
      </div>
    );
  }

  if (stock.error || summary.error || !stock.data || !summary.data) {
    return (
      <DataState
        kind="error"
        title={tr("The stock explorer is unavailable")}
        body={tr("The stock explanation or the market-summary context could not load. Check the stock analytics feed and refresh.")}
      />
    );
  }

  const payload = stock.data.payload ?? {};
  const explanation = stock.data.explanation ?? {};
  const quality = (explanation.quality ?? {}) as Record<string, number>;
  const scores = (explanation.scores ?? {}) as Record<string, number>;
  const residual = (explanation.raw_vs_residual ?? {}) as Record<string, number>;
  const marketState = text(summary.data.state?.primary_state, "balanced-session");
  const dominantSignalLabel = tr(humanizeKey(text(stock.data.dominant_signal, "neutral")));
  const marketStateLabel = tr(humanizeKey(marketState));
  const reading = buildReading(
    text(stock.data.dominant_signal, "neutral"),
    marketStateLabel,
    tr(text(stock.data.conclusion, "No conclusion is available yet.")),
    t
  );
  const strongestDrivers = topEntries(scores, 4, true);
  const biggestQualityFlags = topEntries(quality, 4, false);
  const monthReturnPct = computeWindowReturnPct(monthHistory.data?.intraday);
  const yearReturnPct = computeWindowReturnPct(yearHistory.data?.intraday);
  const monthClose = latestCloseFromBars(monthHistory.data?.intraday);
  const yearClose = latestCloseFromBars(yearHistory.data?.intraday);
  const allSectors = overview.data?.sectors ?? [];
  const rankedSectors = [...allSectors]
    .map((sector) => ({
      ...sector,
      avgChangePct: sector.stocks.length
        ? sector.stocks.reduce((sum, item) => sum + item.changePct, 0) / sector.stocks.length
        : 0
    }))
    .sort((left, right) => right.avgChangePct - left.avgChangePct);
  const sectorName = text(stock.data.sector_name, "Unknown sector");
  const sectorIndex = rankedSectors.findIndex((item) => item.sector === sectorName);
  const sectorContext = sectorIndex >= 0 ? rankedSectors[sectorIndex] : null;
  const sectorRankLabel =
    sectorIndex >= 0
      ? t("literals.#{{rank}} of {{count}} sectors", "#{{rank}} of {{count}} sectors", {
          rank: sectorIndex + 1,
          count: rankedSectors.length
        })
      : tr("Not ranked");
  const topSectorPeers = sectorContext?.stocks.filter((item) => item.symbol !== symbol).slice(0, 3) ?? [];
  const marketGainers = overview.data?.leaderboards.gainers.slice(0, 3) ?? [];
  const relatedStrategyRows = (strategyCompare.data?.stockSuitability ?? [])
    .filter(
      (row) =>
        row.symbol === symbol &&
        row.capitalMode === "capital_10l" &&
        (row.universeMode === "nifty_100" || row.universeMode === "single_stock")
    )
    .sort((left, right) => right.totalNetPnl - left.totalNetPnl)
    .slice(0, 5);
  const oiisCandidate = oiisContext.data?.candidate ?? null;
  const oiisFeatures = (oiisCandidate?.feature_values ?? {}) as Record<string, unknown>;
  const oiisGates = Object.entries((oiisCandidate?.gate_evidence ?? {}) as Record<string, any>).map(([gate, evidence]) => ({
    gate: humanizeKey(gate),
    status: evidence?.passed === true ? "PASS" : evidence?.passed === false ? "FAIL" : text(evidence?.status, "RECORDED"),
    rule: text(evidence?.rule, "Rule recorded in the OIIS run."),
    actual: JSON.stringify(evidence?.actual ?? {}),
  }));
  const smartapiOptions = oiisContext.data?.smartapi.options ?? [];
  const previousBar = yearBars.length > 1 ? yearBars[yearBars.length - 2]! : null;
  const classicPivot = previousBar ? (previousBar.h + previousBar.l + previousBar.c) / 3 : null;
  const pivotR1 = previousBar && classicPivot != null ? 2 * classicPivot - previousBar.l : null;
  const pivotS1 = previousBar && classicPivot != null ? 2 * classicPivot - previousBar.h : null;
  const glossaryCards = [
    {
      title: tr("Residual Strength"),
      body: tr("This shows whether the stock is outperforming the index after removing the broad-market effect. Positive values mean the stock is doing better than the average tape.")
    },
    {
      title: tr("VWAP Hold Quality"),
      body: tr("VWAP is the average traded price for the day. A higher hold-quality score means buyers managed to keep the stock above or around VWAP instead of giving up the move.")
    },
    {
      title: tr("Volume Curve Surprise"),
      body: tr("This compares current activity with the stock’s usual minute-by-minute activity pattern. Above 1 means participation is stronger than normal for this time of day.")
    },
    {
      title: tr("Range Efficiency"),
      body: tr("This asks whether the stock moved smoothly or noisily. Higher efficiency means cleaner trend behavior, while lower efficiency usually means choppy movement.")
    }
  ];

  return (
    <div className={styles.page}>
      <ReturnToSource fallback="/" />
      <div aria-label={`${symbol} company identity`}><StockIdentity symbol={symbol} profile={profiles.bySymbol.get(symbol)} /></div>
      <AnalyticsHeader
        title={
          mode === "beginner"
            ? t("literals.{{symbol}} Stock Report", "{{symbol}} Stock Report", { symbol })
            : t("literals.{{symbol}} Stock Lens", "{{symbol}} Stock Lens", { symbol })
        }
        meta={t(
          "literals.{{sector}} • {{tradeDate}} • As of {{time}}",
          "{{sector}} • {{tradeDate}} • As of {{time}}",
          {
            sector: tr(text(stock.data.sector_name, "Unknown sector")),
            tradeDate: stock.data.trade_date,
            time: formatTime(stock.data.as_of, { hour12: false })
          }
        )}
        subtitle={tr("Use the stock lens to decide whether this move is genuine leadership, fragile noise, or a watchlist-only name.")}
        learningPrompt={tr("Start with the quick read, then check market context, then stock-specific evidence, then decide whether strategy evidence or broader market context is the right next page.")}
        learningPoints={[
          tr("Quick read first, because it explains the stock’s character today."),
          tr("Market context next, because strong names still behave differently in weak tapes."),
          tr("Strategy relevance last, because historical evidence only matters after current context is clear.")
        ]}
      />

      <SectionDivider
        eyebrow={tr("Stocks")}
        title={tr("Quick read / current state")}
        subtitle={tr("This report is designed to answer one question in order: what is happening in this stock, how much context supports it, and where should you go next?")}
      />

      <section className={styles.metricGrid}>
        <KpiCard label={tr("Last price")} value={fmtPrice(num(stock.data.last_price))} tone={text(stock.data.accent_token, "white") as "green" | "red" | "white"} meta={tr("Current session print.")} />
        <KpiCard
          label={tr("Session Return")}
          value={signedPct(stock.data.change_pct_from_prev_close)}
          tone={text(stock.data.accent_token, "white") as "green" | "red" | "white"}
          meta={tr("Relative to previous close.")}
        />
        <KpiCard label={tr("Dominant Signal")} value={dominantSignalLabel} meta={tr("The primary read driving the explainer below.")} />
        <KpiCard label={tr("Market State")} value={marketStateLabel} meta={tr("Context from the broader tape.")} />
        <KpiCard label={tr("1M return")} value={monthReturnPct == null ? "—" : fmtPct(monthReturnPct)} meta={monthClose == null ? tr("Waiting for monthly price context.") : tr("Built from the published 1M stock history view.")} />
        <KpiCard label={tr("1Y return")} value={yearReturnPct == null ? "—" : fmtPct(yearReturnPct)} meta={yearClose == null ? tr("Waiting for yearly price context.") : tr("Built from the published 1Y stock history view.")} />
        <KpiCard label={tr("Sector standing")} value={sectorRankLabel} meta={sectorContext ? t("literals.Sector average {{value}}", "Sector average {{value}}", { value: fmtPct(sectorContext.avgChangePct) }) : tr("Sector context unavailable")} />
      </section>

      <SectionDivider
        eyebrow="OIIS"
        title={tr("Selection evidence and technical history")}
        subtitle={tr("The latest all-F&O evaluation, daily price history and SmartAPI derivatives evidence for this symbol. Missing data remains unavailable rather than being replaced with zero.")}
      />

      {oiisCandidate ? (
        <>
          <section className={styles.metricGrid}>
            <KpiCard label="Direction" value={text(oiisCandidate.direction, "—")} tone={oiisCandidate.direction === "LONG" ? "green" : oiisCandidate.direction === "SHORT" ? "red" : "white"} meta={`${humanizeKey(text(oiisCandidate.direction_state, "unknown"))} · structure ${text(oiisCandidate.structural_direction, "—")} · session ${text(oiisCandidate.session_direction, "—")}`} />
            <KpiCard label="OFactor" value={fmtMaybe(oiisCandidate.ofactor)} meta={`${text(oiisCandidate.ofactor_level, "—")} opportunity cohort`} />
            <KpiCard label="XFactor" value={fmtMaybe(oiisCandidate.xfactor_snapshot)} meta={`${humanizeKey(text(oiisCandidate.setup_id, "no setup"))} · ${humanizeKey(text(oiisCandidate.setup_state, "unknown"))}`} />
            <KpiCard label="Data quality" value={fmtMaybe(oiisCandidate.data_quality)} meta={`${fmtMaybe(oiisCandidate.data_coverage, 1)}% coverage · ${humanizeKey(text(oiisCandidate.data_permission, "unknown"))}`} />
            <KpiCard label="O + X + DQ" value={fmtMaybe(num(oiisCandidate.ofactor) + num(oiisCandidate.xfactor_snapshot) + num(oiisCandidate.data_quality))} meta="OIIS table sequence score; higher values appear first." />
            <KpiCard label="Failed gates" value={fmtWholeNumber(num(oiisCandidate.failed_gate_count))} meta={(Array.isArray(oiisCandidate.reason_codes) ? oiisCandidate.reason_codes.map(humanizeKey).join(" · ") : "No recorded failure reasons") || "None"} />
          </section>

          <section className={styles.grid2}>
            <DataTable
              title={tr("Price, volatility and pivot levels")}
              subtitle={tr("Latest OIIS feature snapshot plus classic pivots calculated from the previous completed daily OHLC bar.")}
              rows={[
                { metric: "Open / high / low / close", value: `${fmtMaybe(oiisFeatures.open)} / ${fmtMaybe(oiisFeatures.high)} / ${fmtMaybe(oiisFeatures.low)} / ${fmtMaybe(oiisFeatures.close)}` },
                { metric: "Session VWAP", value: fmtMaybe(oiisFeatures.session_vwap) },
                { metric: "EMA61 / SMA20 / SMA50", value: `${fmtMaybe(oiisFeatures.ema61)} / ${fmtMaybe(oiisFeatures.sma20)} / ${fmtMaybe(oiisFeatures.sma50)}` },
                { metric: "20-day high / low", value: `${fmtMaybe(oiisFeatures.prior_high_20)} / ${fmtMaybe(oiisFeatures.prior_low_20)}` },
                { metric: "Classic R1 / Pivot / S1", value: `${fmtMaybe(pivotR1)} / ${fmtMaybe(classicPivot)} / ${fmtMaybe(pivotS1)}` },
                { metric: "ATR14 / MoveATR / VWAP distance ATR", value: `${fmtMaybe(oiisFeatures.atr14_previous_completed)} / ${fmtMaybe(oiisFeatures.move_atr)} / ${fmtMaybe(oiisFeatures.vwap_distance_atr)}` },
                { metric: "RSI14 / Williams %R / MACD", value: `${fmtMaybe(oiisCandidate.rsi14)} / ${fmtMaybe(oiisCandidate.willr14)} / ${fmtMaybe(oiisCandidate.macd_line)}` },
                { metric: "Reward:risk", value: fmtMaybe(oiisFeatures.reward_risk) },
              ]}
              columns={[{ key: "metric", header: "Indicator / level", cell: (row) => row.metric }, { key: "value", header: "Actual value", align: "right", cell: (row) => row.value }]}
            />
            <DataTable
              title={tr("Liquidity and data completeness")}
              subtitle={tr("Actual volume, historical baselines, same-session coverage and freshness used by the liquidity gate.")}
              rows={[
                { metric: "Current cumulative volume", value: fmtWholeNumber(num(oiisFeatures.volume_current)) },
                { metric: "20-day average / ratio", value: `${fmtWholeNumber(num(oiisFeatures.volume_average_20))} / ${fmtMaybe(oiisFeatures.volume_ratio_20)}` },
                { metric: "90-day median / percentile", value: `${fmtWholeNumber(num(oiisFeatures.volume_median_90))} / ${fmtMaybe(oiisFeatures.volume_percentile_90)}` },
                { metric: "Previous 1D / 2D volume", value: `${fmtWholeNumber(num(oiisFeatures.volume_previous_1d))} / ${fmtWholeNumber(num(oiisFeatures.volume_previous_2d))}` },
                { metric: "Turnover (₹ lakh) / percentile", value: `${fmtMaybe(oiisFeatures.turnover_lacs)} / ${fmtMaybe(oiisFeatures.turnover_percentile)}` },
                { metric: "Session bar coverage", value: `${fmtMaybe(num(oiisFeatures.session_bar_coverage) * 100, 1)}%` },
                { metric: "Latest bar age", value: `${fmtMaybe(oiisFeatures.session_latest_bar_age_minutes)} min` },
                { metric: "Session data status", value: humanizeKey(text(oiisFeatures.session_data_status, "unavailable")) },
              ]}
              columns={[{ key: "metric", header: "Liquidity evidence", cell: (row) => row.metric }, { key: "value", header: "Actual value", align: "right", cell: (row) => row.value }]}
            />
          </section>

          <DataTable
            title={tr("Every OIIS gate for this stock")}
            subtitle={tr("The exact stored gate result, governed rule and actual input snapshot. Expand the all-F&O ledger for full weighted component evidence.")}
            rows={oiisGates}
            emptyTitle="No gate evidence"
            emptyBody="The latest OIIS candidate did not publish gate evidence."
            columns={[
              { key: "gate", header: "Gate", cell: (row) => row.gate },
              { key: "status", header: "Status", cell: (row) => row.status },
              { key: "rule", header: "Rule", cell: (row) => row.rule },
              { key: "actual", header: "Actual stored values", cell: (row) => row.actual },
            ]}
          />
        </>
      ) : (
        <DataState kind={oiisContext.isLoading ? "loading" : "empty"} title={oiisContext.isLoading ? "Loading latest OIIS evidence" : "No current OIIS candidate evidence"} body="The stock page remains available, but this symbol is not present in the latest completed all-F&O run." />
      )}

      <ChartCard title={tr("Historical price, Bollinger bands, pivots, volume and RSI")} subtitle={tr("Up to 120 completed daily bars from PostgreSQL bars_1d. Pivot R1/P/S1 uses the previous completed trading day; Bollinger bands use 20 sessions and two standard deviations.")}>
        {yearBars.length ? <EChartSurface appearance="light" ariaLabel={`${symbol} daily technical history`} className={styles.stockTechnicalChart} option={technicalOption} /> : <DataState kind="empty" title="Daily history unavailable" body="No completed daily OHLCV bars were returned for this stock." />}
      </ChartCard>

      <DataTable
        title={tr("SmartAPI F&O quotes, liquidity and Greeks")}
        subtitle={oiisContext.data?.smartapi.available ? `Captured ${formatTime(oiisContext.data.smartapi.capturedAt, { hour12: false })} · ${oiisContext.data.smartapi.source} · PAPER analytics only` : "No SmartAPI option snapshot is currently stored for this underlying. No values are fabricated."}
        rows={smartapiOptions}
        emptyTitle="SmartAPI F&O snapshot unavailable"
        emptyBody={oiisContext.data?.smartapi.error || "The collector has not stored a current option-chain snapshot for this stock."}
        columns={[
          { key: "contract", header: "Contract", cell: (row) => text(row.tradingsymbol, "—") },
          { key: "expiry", header: "Expiry", cell: (row) => String(row.expiry ?? "—").slice(0, 10) },
          { key: "strike", header: "Strike / side", align: "right", cell: (row) => `${fmtMaybe(row.strike)} ${text(row.right, "—")}` },
          { key: "quote", header: "Bid / ask / spread", align: "right", cell: (row) => `${fmtMaybe(row.bid)} / ${fmtMaybe(row.ask)} / ${fmtMaybe(row.spread_pct)}%` },
          { key: "depth", header: "Buy / sell / imbalance", align: "right", cell: (row) => `${fmtWholeNumber(num(row.total_buy_qty))} / ${fmtWholeNumber(num(row.total_sell_qty))} / ${fmtMaybe(row.depth_imbalance)}` },
          { key: "activity", header: "Volume / OI / OI Δ%", align: "right", cell: (row) => `${fmtWholeNumber(num(row.volume))} / ${fmtWholeNumber(num(row.oi))} / ${fmtMaybe(row.oi_change_pct)}%` },
          { key: "greeks", header: "IV / Δ / Γ / Θ / Vega", align: "right", cell: (row) => `${fmtMaybe(row.broker_iv ?? row.local_iv)} / ${fmtMaybe(row.broker_delta ?? row.local_delta)} / ${fmtMaybe(row.broker_gamma ?? row.local_gamma, 4)} / ${fmtMaybe(row.broker_theta ?? row.local_theta)} / ${fmtMaybe(row.broker_vega ?? row.local_vega)}` },
          { key: "quality", header: "Quote quality", cell: (row) => `${humanizeKey(text(row.data_quality_status, "unknown"))} · age ${fmtWholeNumber(num(row.quote_age_seconds))}s` },
        ]}
      />

      <section className={styles.summaryGrid}>
        <PlainLanguageCard
          title={reading.title}
          body={reading.body}
          secondaryTitle={tr("Current conclusion")}
          secondaryBody={tr(text(stock.data.conclusion, "No conclusion is available yet."))}
        />
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{tr("Key market context")}</h2>
          <div className={styles.signalGrid}>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Tape state")}</div>
                <div className={styles.muted}>{tr("This is the broad intraday context the stock is being judged against.")}</div>
              </div>
              <div className={styles.smallStat}>{marketStateLabel}</div>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Nifty move")}</div>
                <div className={styles.muted}>{tr("Use this to decide whether the stock is moving with the tape or against it.")}</div>
              </div>
              <div className={styles.smallStat} data-tone={toneFromNumber(overview.data?.indices.nifty50.changePct)}>
                {overview.data ? fmtPct(overview.data.indices.nifty50.changePct) : "—"}
              </div>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Sector standing")}</div>
                <div className={styles.muted}>{tr("A strong stock inside a weak sector means something different from a strong stock inside the leading sector.")}</div>
              </div>
              <div className={styles.smallStat} data-tone={toneFromNumber(sectorContext?.avgChangePct)}>
                {sectorRankLabel}
              </div>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider
        eyebrow={tr("Context")}
        title={tr("Key market context")}
        subtitle={tr("This section explains the tape around the stock before you treat any one signal as enough on its own.")}
      />

      <section className={styles.grid2}>
        <DataTable
          title={tr("Sector context")}
          subtitle={tr("These are the nearest sector peers from the same current market snapshot.")}
          rows={topSectorPeers}
          emptyTitle={tr("Sector peers are unavailable")}
          emptyBody={tr("Sector-relative context is not available for this stock in the current overview snapshot.")}
          columns={[
            { key: "symbol", header: tr("Symbol"), cell: (row) => row.symbol },
            { key: "name", header: tr("Name"), cell: (row) => row.name },
            { key: "last", header: tr("Last"), align: "right", cell: (row) => fmtPrice(row.last) },
            { key: "changePct", header: tr("Change"), align: "right", cell: (row) => fmtPct(row.changePct) }
          ]}
        />
        <DataTable
          title={tr("Broad market leaders")}
          subtitle={tr("Use these names to judge whether this stock is part of broad leadership or an isolated move.")}
          rows={marketGainers}
          emptyTitle={tr("Market leaders are unavailable")}
          emptyBody={tr("The leaderboard snapshot is not available right now.")}
          columns={[
            { key: "symbol", header: tr("Symbol"), cell: (row) => row.symbol },
            { key: "sector", header: tr("Sector"), cell: (row) => tr(text(row.sector, "Unknown")) },
            { key: "last", header: tr("Last"), align: "right", cell: (row) => fmtPrice(row.last) },
            { key: "changePct", header: tr("Change"), align: "right", cell: (row) => fmtPct(row.changePct) }
          ]}
        />
      </section>

      <SectionDivider
        eyebrow={tr("Signals")}
        title={tr("Stock-specific signals")}
        subtitle={tr("Use these numbers to validate the move after the market context checks, not before them.")}
      />

      <section className={styles.metricGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("Beta 20D")}</div>
          <div className={styles.metricValue}>{fmtMaybe(payload.beta_20d)}</div>
          <div className={styles.metricHint}>{tr("How much this stock usually amplifies index movement.")}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("Residual 60M")}</div>
          <div className={styles.metricValue} data-tone={toneFromNumber(num(payload.residual_return_60m_pct))}>
            {signedPct(payload.residual_return_60m_pct)}
          </div>
          <div className={styles.metricHint}>{tr("Stock return after subtracting the index effect.")}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("VWAP Hold Quality")}</div>
          <div className={styles.metricValue}>{fmtMaybe(payload.vwap_hold_quality_score)}</div>
          <div className={styles.metricHint}>{tr("Higher is better. It measures how well the move held around VWAP.")}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("Volume Curve Surprise")}</div>
          <div className={styles.metricValue} data-tone={toneFromNumber(num(payload.volume_curve_surprise) - 1)}>
            {fmtMaybe(payload.volume_curve_surprise)}
          </div>
          <div className={styles.metricHint}>{tr("Above 1 means activity is running hotter than its normal minute-of-day profile.")}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("Range Efficiency")}</div>
          <div className={styles.metricValue}>{fmtMaybe(payload.range_efficiency_pct)}</div>
          <div className={styles.metricHint}>{tr("Higher means the move is smoother, lower means noisier.")}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>{tr("History Samples")}</div>
          <div className={styles.metricValue}>{fmtWholeNumber(num(stock.data.history_context?.sample_count))}</div>
          <div className={styles.metricHint}>{tr("How many times this dominant signal has been observed in the historical learner context.")}</div>
        </div>
      </section>

      <section className={styles.guidanceGrid}>
        {glossaryCards.map((card, index) => (
          <article key={card.title} className={styles.guideCard}>
            <span className={styles.guideStep}>{index + 1}</span>
            <h2 className={styles.guideTitle}>{tr(card.title)}</h2>
            <p className={styles.guideText}>{card.body}</p>
          </article>
        ))}
      </section>

      <section className={styles.summaryGrid}>
        <InterpretationCard
          title={tr("How to use the stock-specific signals")}
          items={[
            tr("Move quality first, because a large return without quality is often unstable."),
            tr("Residual metrics next, because they tell you whether the stock is still strong after removing the index effect."),
            tr("History last, because a clean historical context helps you decide whether the move deserves strategy review.")
          ]}
        />
      </section>

      <section className={styles.guidanceGrid}>
        <article className={styles.guideCard}>
          <span className={styles.guideStep}>1</span>
            <h2 className={styles.guideTitle}>{tr("What supports this move")}</h2>
            <p className={styles.guideText}>
              {strongestDrivers.length
                ? strongestDrivers.map(([key, value]) => `${tr(humanizeKey(key))} ${fmtDecimal(value, 2)}`).join(" • ")
                : tr("No strong supporting drivers are available yet.")}
            </p>
          </article>
          <article className={styles.guideCard}>
            <span className={styles.guideStep}>2</span>
            <h2 className={styles.guideTitle}>{tr("What could weaken it")}</h2>
            <p className={styles.guideText}>
              {biggestQualityFlags.length
                ? biggestQualityFlags.map(([key, value]) => `${tr(humanizeKey(key))} ${fmtDecimal(value, 2)}`).join(" • ")
                : tr("No quality flags are available yet.")}
            </p>
          </article>
          <article className={styles.guideCard}>
            <span className={styles.guideStep}>3</span>
            <h2 className={styles.guideTitle}>{tr("Where to go next")}</h2>
            <p className={styles.guideText}>{tr("If this still looks constructive, open the detailed stock page. If it looks conditional or fragile, step back to Setups or Risk before acting.")}</p>
          </article>
      </section>

      <section className={styles.grid2}>
        <DataTable
          title={tr("Move Quality")}
          subtitle={tr("Use the same shared table styling as the rest of the app to compare the stock-quality signals.")}
          rows={[
            {
              metric: tr("Time Above VWAP"),
              value: signedPct(quality.time_above_vwap_pct),
              read: tr("Higher means the stock spent more of the session holding constructive territory.")
            },
            {
              metric: tr("VWAP Hold Quality"),
              value: fmtMaybe(quality.vwap_hold_quality_score),
              read: tr("Higher means better control around VWAP after the move began.")
            },
            {
              metric: tr("Persistence"),
              value: fmtMaybe(quality.relative_strength_persistence_score),
              read: tr("Higher means the stock kept outperforming instead of flashing briefly.")
            },
            {
              metric: tr("Close Location"),
              value: fmtMaybe(quality.close_location_quality_pct),
              read: tr("Higher means the stock finished nearer the strong part of its intraday range.")
            }
          ]}
          columns={[
            { key: "metric", header: tr("Quality Signal"), cell: (row: { metric: string }) => row.metric },
            { key: "value", header: tr("Value"), align: "right", cell: (row: { value: string }) => row.value },
            { key: "read", header: tr("How to read it"), cell: (row: { read: string }) => row.read }
          ]}
        />

        {mode === "advanced" ? (
          <DataTable
            title={tr("Relative To The Index")}
            subtitle={tr("Residual metrics strip out part of the broad-market effect so you can judge true stock strength.")}
            rows={[
              {
                metric: tr("Stock Change"),
                value: signedPct(residual.stock_change_pct),
                read: tr("The raw session move.")
              },
              {
                metric: tr("Index Change"),
                value: signedPct(residual.index_change_pct),
                read: tr("The broad move it is being compared against.")
              },
              {
                metric: tr("Residual 15M"),
                value: signedPct(residual.residual_return_15m_pct),
                read: tr("Positive means the stock outperformed after removing index effect over 15 minutes.")
              },
              {
                metric: tr("Residual 60M"),
                value: signedPct(residual.residual_return_60m_pct),
                read: tr("This is the cleaner “is it really strong?” read for the last hour.")
              }
            ]}
            columns={[
              { key: "metric", header: tr("Metric"), cell: (row: { metric: string }) => row.metric },
              { key: "value", header: tr("Value"), align: "right", cell: (row: { value: string }) => row.value },
              { key: "read", header: tr("Why it matters"), cell: (row: { read: string }) => row.read }
            ]}
          />
        ) : (
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>{tr("How To Read The Move")}</h2>
            <div className={styles.signalGrid}>
              <div className={styles.signalItem}>
                <div>
                  <div className={styles.strong}>{tr("Stock change")}</div>
                  <div className={styles.muted}>{tr("This is the raw move you can see on the chart.")}</div>
                </div>
                <div className={styles.smallStat} data-tone={toneFromNumber(num(residual.stock_change_pct))}>
                  {signedPct(residual.stock_change_pct)}
                </div>
              </div>
              <div className={styles.signalItem}>
                <div>
                  <div className={styles.strong}>{tr("Residual 60M")}</div>
                  <div className={styles.muted}>{tr("This is the cleaner “is it stronger than the market?” check.")}</div>
                </div>
                <div className={styles.smallStat} data-tone={toneFromNumber(num(residual.residual_return_60m_pct))}>
                  {signedPct(residual.residual_return_60m_pct)}
                </div>
              </div>
              <div className={styles.signalItem}>
                <div>
                  <div className={styles.strong}>{tr("Index context")}</div>
                  <div className={styles.muted}>{tr("Use the market state above to decide whether strength is broad, narrow, or fragile.")}</div>
                </div>
                <div className={styles.smallStat}>{signedPct(residual.index_change_pct)}</div>
              </div>
            </div>
          </div>
        )}
      </section>

      <SectionDivider
        eyebrow={tr("History")}
        title={tr("Related strategy relevance")}
        subtitle={tr("This section does not invent a recommendation. It shows whether the current stock has strong published strategy fit in the existing backtesting snapshots.")}
      />

      <section className={styles.grid2}>
        <DataTable
          title={tr("Published strategy fit")}
          subtitle={tr("Built from the published stock-suitability snapshot under the 10L lens.")}
          rows={relatedStrategyRows}
          emptyTitle={tr("No related strategy evidence yet")}
          emptyBody={tr("There is no published stock-suitability row for this symbol under the current comparison lens.")}
          columns={[
            { key: "strategy", header: tr("Strategy"), cell: (row) => tr(row.displayName) },
            { key: "universe", header: tr("Scope"), cell: (row) => tr(row.universeMode === "single_stock" ? "Single Stock" : "Nifty 100") },
            { key: "winRate", header: tr("Win rate"), align: "right", cell: (row) => fmtPct(row.winRatePct) },
            { key: "avgReturn", header: tr("Avg return"), align: "right", cell: (row) => fmtPct(row.avgReturnPct) },
            { key: "netPnl", header: tr("Net P&L"), align: "right", cell: (row) => formatCurrencyINR(row.totalNetPnl, true) },
            { key: "bestRegime", header: tr("Best regime"), cell: (row) => tr(row.bestRegime) },
            { key: "lastSignal", header: tr("Last signal"), cell: (row) => formatDateIST(row.lastSignalDate) }
          ]}
        />
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{tr("What this means")}</h2>
          <div className={styles.signalGrid}>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Good strategy fit")}</div>
                <div className={styles.muted}>{tr("If one or two strategies keep showing up with strong win rate, acceptable drawdown, and a sensible best regime, this stock deserves deeper strategy review.")}</div>
              </div>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Weak strategy fit")}</div>
                <div className={styles.muted}>{tr("If the stock does not have a clean published fit, treat the current move as observation first and evidence second.")}</div>
              </div>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Best next move")}</div>
                <div className={styles.muted}>{tr("Open the strategy leaderboard if this stock still looks constructive after the market and signal checks.")}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <RelatedJourney items={[
        { id: "oiis", title: "OIIS evidence", detail: `${symbol} current selection, factors and gates`, to: `/strategy/oiis-live?symbol=${encodeURIComponent(symbol)}&source=stock-360`, actionLabel: "Open evidence" },
        { id: "paper", title: "Paper Trading", detail: `Preview a PAPER-only ${symbol} observation`, to: `/paper-trading?action=add&symbol=${encodeURIComponent(symbol)}&source=stock-360`, actionLabel: "Preview" },
        { id: "history", title: "Historical evidence", detail: "Strategy fit and similar 30-day outcomes", to: `/backtesting/stocks?symbol=${encodeURIComponent(symbol)}&source=stock-360` },
        { id: "options", title: "Options", detail: `${symbol} chain, expiry, IV and OI context`, to: `/options/intelligence?symbol=${encodeURIComponent(symbol)}&source=stock-360` },
      ]} />
      <LearnAboutThisAnalysis sections={[
        { id: "read", title: "How to read this page", content: <p>Start with the current quote and price path, then relative performance and drawdown, and only then interpret signals and strategy fit.</p> },
        { id: "methodology", title: "Methodology and calculation rules", content: <p>Indicators are calculated for the displayed timeframe and preserve the source adjustment policy. Strategy evidence remains separate from a current trade authorisation.</p> },
        { id: "definitions", title: "Definitions", content: <p>VWAP is the session volume-weighted price. Relative volume compares current activity with the stock’s historical intraday profile. ATR measures recent trading range.</p> },
        { id: "sources", title: "Data sources and freshness", content: <p>Cash OHLCV, canonical indicators, benchmark and sector series, strategy results, events and available F&amp;O evidence retain their individual timestamps and readiness states.</p> },
        { id: "limitations", title: "Limitations and assumptions", content: <p>Missing indicators, events or derivatives evidence remain unavailable rather than being converted to zero. Historical relationships do not guarantee a current outcome.</p> },
        { id: "related", title: "Related dashboards", content: <p>Use the context-aware links immediately above to continue into OIIS, Paper Trading, historical evidence or Options without changing the selected stock.</p> },
      ]} />
    </div>
  );
}
