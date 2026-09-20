import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { useParams } from "react-router-dom";
import { useAuthGate } from "../auth/AuthGateProvider";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { ChartCard, DataState, DataTable } from "../components/ui/DashboardPrimitives";
import { EChartSurface } from "../components/visual/EChartSurface";
import { RelatedJourney, ReturnToSource } from "../components/navigation/StrategicPrimitives";
import { StockIdentity } from "../components/stocks/StockProfileControls";
import { MwhdRankBadge } from "../features/mwhd/MwhdRankBadge";
import { useMwhdRankings } from "../features/mwhd/useMwhdRankings";
import { fmtDecimal, fmtPct, fmtPrice, fmtWholeNumber, formatCurrencyINR, formatTime } from "../lib/format";
import { useBacktestingCompare, useIntradayAnalyticsStock, useIntradayAnalyticsSummary, useOiisCandidateContext, useOverview, useStock } from "../lib/hooks";
import { buildMwdEmaValueModel, type MwdEmaValueModel, type MwdLevel, type MwdLevelId } from "../lib/mwdEmaValue";
import { useProfileIndex } from "../lib/stockProfiles";
import type { IntradayBar } from "../lib/types";
import { num, text, toneFromNumber } from "./AnalyticsChrome";
import styles from "./AnalyticsPage.module.css";

const compactLevelLabel = (level: MwdLevel) => ({
  "15m": "15m", "1h": "1H", day: "Day", week: "Week", month: "Month",
  quarter: "3M", year: "Year", pdc: "PDC", "previous-day": "1D ago",
  "previous-week": "1W ago", "previous-month": "1M ago",
}[level.id] ?? level.label);

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return value == null || value === "" || !Number.isFinite(parsed) ? null : parsed;
}

function fmtMaybe(value: unknown, digits = 2) {
  const parsed = finite(value);
  return parsed == null ? "—" : fmtDecimal(parsed, digits);
}

function signedPct(value: unknown) {
  const parsed = finite(value);
  return parsed == null ? "—" : fmtPct(parsed);
}

function computeWindowReturnPct(bars: IntradayBar[], count: number) {
  const window = bars.slice(-count);
  if (window.length < 2 || !window[0]!.c) return null;
  return ((window.at(-1)!.c - window[0]!.c) / window[0]!.c) * 100;
}

function intradayChartOption(model: MwdEmaValueModel, selectedLevel: MwdLevelId | null): EChartsOption {
  const dates = model.bars.map((row) => row.t);
  const plottedLevels = model.levels.filter((level) => level.plot && level.value != null);
  const sessionLow = model.bars.length ? Math.min(...model.bars.map((row) => row.l)) : 0;
  const sessionHigh = model.bars.length ? Math.max(...model.bars.map((row) => row.h)) : 1;
  const padding = sessionHigh > sessionLow ? (sessionHigh - sessionLow) * 0.05 : Math.max(0.05, Math.abs(sessionLow) * 0.001);
  return {
    animation: false,
    backgroundColor: "#fff",
    legend: { type: "scroll", top: 2, left: 12, right: 12, data: ["Price", "EMA 9", "EMA 21", "EMA 50", "EMA 200", "Volume", "Traded value", ...plottedLevels.map(compactLevelLabel)] },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    grid: [{ left: 58, right: 66, top: 50, height: "61%" }, { left: 58, right: 66, top: "76%", bottom: 48 }],
    xAxis: [
      { type: "category", gridIndex: 0, data: dates, boundaryGap: true, axisLabel: { show: false }, axisLine: { lineStyle: { color: "#cbd5e1" } } },
      { type: "category", gridIndex: 1, data: dates, boundaryGap: true, axisLabel: { color: "#64748b", hideOverlap: true, formatter: (value: string) => formatTime(value, { hour12: false }) }, axisLine: { lineStyle: { color: "#cbd5e1" } } },
    ],
    yAxis: [
      { type: "value", gridIndex: 0, scale: true, min: sessionLow - padding, max: sessionHigh + padding, axisLabel: { color: "#64748b" }, splitLine: { lineStyle: { color: "#edf2f7" } } },
      { type: "value", gridIndex: 1, min: 0, name: "Volume", axisLabel: { color: "#64748b", formatter: (value: number) => `${Math.round(value / 1000)}K` }, splitLine: { show: false } },
      { type: "value", gridIndex: 1, min: 0, name: "₹Cr", position: "right", axisLabel: { color: "#64748b" }, splitLine: { show: false } },
    ],
    dataZoom: [{ type: "inside", xAxisIndex: [0, 1], start: 0, end: 100 }, { type: "slider", xAxisIndex: [0, 1], bottom: 8, height: 18, start: 0, end: 100 }],
    series: [
      { name: "Price", type: "candlestick", xAxisIndex: 0, yAxisIndex: 0, z: 4, data: model.bars.map((row) => [row.o, row.c, row.l, row.h]), itemStyle: { color: "#059669", color0: "#dc2626", borderColor: "#059669", borderColor0: "#dc2626" } },
      { name: "EMA 9", type: "line", xAxisIndex: 0, yAxisIndex: 0, showSymbol: false, data: model.ema9, lineStyle: { color: "#d97706", width: 1.5 } },
      { name: "EMA 21", type: "line", xAxisIndex: 0, yAxisIndex: 0, showSymbol: false, data: model.ema21, lineStyle: { color: "#c026d3", width: 1.5 } },
      { name: "EMA 50", type: "line", xAxisIndex: 0, yAxisIndex: 0, showSymbol: false, data: model.ema50, lineStyle: { color: "#0891b2", width: 1.5 } },
      { name: "EMA 200", type: "line", xAxisIndex: 0, yAxisIndex: 0, showSymbol: false, data: model.ema200, lineStyle: { color: "#ca8a04", width: 1.5 } },
      { name: "Volume", type: "bar", xAxisIndex: 1, yAxisIndex: 1, barWidth: "65%", data: model.bars.map((row) => finite(row.v)), itemStyle: { color: (p: { dataIndex: number }) => model.bars[p.dataIndex]!.c >= model.bars[p.dataIndex]!.o ? "rgba(5,150,105,.42)" : "rgba(220,38,38,.42)" } },
      { name: "Traded value", type: "line", xAxisIndex: 1, yAxisIndex: 2, showSymbol: false, data: model.tradedValueCr, lineStyle: { color: "#2563eb", width: 1.5 }, areaStyle: { color: "rgba(37,99,235,.08)" } },
      ...plottedLevels.map((level) => ({ name: compactLevelLabel(level), type: "line" as const, xAxisIndex: 0, yAxisIndex: 0, showSymbol: false, connectNulls: false, data: model.bars.map((_, index) => index >= level.startIndex ? level.value : null), lineStyle: { color: level.color, width: selectedLevel === level.id ? 3 : 1.25, type: level.id === "pdc" ? "dashed" as const : "solid" as const }, endLabel: { show: true, formatter: compactLevelLabel(level), color: level.color, fontWeight: 700 } })),
    ],
  };
}

function dailyChartOption(bars: IntradayBar[]): EChartsOption {
  const dates = bars.map((row) => row.t.slice(0, 10));
  const tradedValue = bars.map((row) => row.tradedValueCr ?? (finite(row.v) == null ? null : row.c * Number(row.v) / 10_000_000));
  const start = bars.length > 90 ? 100 - (90 / bars.length) * 100 : 0;
  return {
    animation: false,
    backgroundColor: "#fff",
    legend: { top: 2, data: ["Daily price", "Volume", "Traded value ₹Cr", "Delivery %"] },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    grid: [{ left: 58, right: 70, top: 48, height: "57%" }, { left: 58, right: 70, top: "72%", bottom: 48 }],
    xAxis: [{ type: "category", gridIndex: 0, data: dates, axisLabel: { show: false }, boundaryGap: true }, { type: "category", gridIndex: 1, data: dates, boundaryGap: true, axisLabel: { color: "#64748b", hideOverlap: true } }],
    yAxis: [
      { type: "value", gridIndex: 0, scale: true, axisLabel: { color: "#64748b" }, splitLine: { lineStyle: { color: "#edf2f7" } } },
      { type: "value", gridIndex: 1, min: 0, name: "Volume", axisLabel: { color: "#64748b", formatter: (value: number) => `${Math.round(value / 1_000_000)}M` }, splitLine: { show: false } },
      { type: "value", gridIndex: 1, min: 0, name: "₹Cr", position: "right", axisLabel: { color: "#2563eb" }, splitLine: { show: false } },
      { type: "value", gridIndex: 1, min: 0, max: 100, name: "Delivery %", position: "right", offset: 40, axisLabel: { color: "#7c3aed", formatter: "{value}%" }, splitLine: { show: false } },
    ],
    dataZoom: [{ type: "inside", xAxisIndex: [0, 1], start, end: 100 }, { type: "slider", xAxisIndex: [0, 1], bottom: 8, height: 18, start, end: 100 }],
    series: [
      { name: "Daily price", type: "candlestick", xAxisIndex: 0, yAxisIndex: 0, data: bars.map((row) => [row.o, row.c, row.l, row.h]), itemStyle: { color: "#059669", color0: "#dc2626", borderColor: "#059669", borderColor0: "#dc2626" } },
      { name: "Volume", type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: bars.map((row) => finite(row.v)), itemStyle: { color: "rgba(15,118,110,.36)" } },
      { name: "Traded value ₹Cr", type: "line", xAxisIndex: 1, yAxisIndex: 2, showSymbol: false, data: tradedValue, lineStyle: { color: "#2563eb", width: 1.5 } },
      { name: "Delivery %", type: "line", xAxisIndex: 1, yAxisIndex: 3, showSymbol: false, connectNulls: false, data: bars.map((row) => row.deliveryPct ?? null), lineStyle: { color: "#7c3aed", width: 1.5 } },
    ],
  };
}

export function AnalyticsStockPage() {
  const { authReady } = useAuthGate();
  const params = useParams();
  const symbol = (params.symbol ?? "").toUpperCase();
  const profiles = useProfileIndex();
  const [loadAnalytics, setLoadAnalytics] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [selectedMwdLevel, setSelectedMwdLevel] = useState<MwdLevelId | null>(null);
  const dayHistory = useStock(symbol, "1D", authReady);
  const yearHistory = useStock(symbol, "1Y", authReady);

  useEffect(() => {
    if (!authReady || !dayHistory.data) return;
    const timer = window.setTimeout(() => setLoadAnalytics(true), 250);
    return () => window.clearTimeout(timer);
  }, [authReady, dayHistory.data]);

  const stock = useIntradayAnalyticsStock(symbol, authReady && loadAnalytics);
  const summary = useIntradayAnalyticsSummary(authReady && loadAnalytics);
  const overview = useOverview(authReady && loadAnalytics);
  const mwhd = useMwhdRankings(authReady && loadAnalytics);
  const oiisContext = useOiisCandidateContext(symbol, authReady && showEvidence);
  const strategyCompare = useBacktestingCompare(authReady && showEvidence);

  usePageLoadProfile({ pageName: "analytics_stock", enabled: authReady && !!symbol, queries: [
    { name: `stock:${symbol}:1D`, isLoading: dayHistory.isLoading, isError: !!dayHistory.error },
    { name: `stock:${symbol}:1Y`, isLoading: yearHistory.isLoading, isError: !!yearHistory.error },
    { name: `intraday-analytics-stock:${symbol}`, isLoading: loadAnalytics && stock.isLoading, isError: !!stock.error },
  ], extra: { symbol, chartFirst: true } });

  const yearBars = yearHistory.data?.intraday ?? [];
  const mwdModel = useMemo(() => buildMwdEmaValueModel(dayHistory.data?.intraday ?? [], yearBars, dayHistory.data?.indicatorWarmup ?? []), [dayHistory.data?.indicatorWarmup, dayHistory.data?.intraday, yearBars]);
  const intradayOption = useMemo(() => intradayChartOption(mwdModel, selectedMwdLevel), [mwdModel, selectedMwdLevel]);
  const dailyOption = useMemo(() => dailyChartOption(yearBars), [yearBars]);

  if (!authReady || (dayHistory.isLoading && !dayHistory.data)) return <div className={styles.page}><DataState kind="loading" title={`${symbol || "Stock"} chart`} body="Loading the current price session first…" /></div>;
  if (dayHistory.error || !dayHistory.data) return <DataState kind="error" title="Stock price history unavailable" body="The primary OHLCV feed did not return this stock. Secondary analytics were not allowed to hide that failure." />;

  const quote = dayHistory.data.stock;
  const analytics = stock.data;
  const payload = analytics?.payload ?? {};
  const explanation = analytics?.explanation ?? {};
  const quality = (explanation.quality ?? {}) as Record<string, number>;
  const residual = (explanation.raw_vs_residual ?? {}) as Record<string, number>;
  const dominantSignal = analytics ? text(analytics.dominant_signal, "Neutral") : stock.isLoading ? "Loading…" : "Unavailable";
  const marketState = summary.data ? text(summary.data.state?.primary_state, "Balanced") : summary.isLoading ? "Loading…" : "Unavailable";
  const latestDaily = yearBars.at(-1);
  const monthReturn = computeWindowReturnPct(yearBars, 22);
  const yearReturn = computeWindowReturnPct(yearBars, 252);
  const latestTradedValue = latestDaily ? latestDaily.tradedValueCr ?? (finite(latestDaily.v) == null ? null : latestDaily.c * Number(latestDaily.v) / 10_000_000) : null;
  const oiisCandidate = oiisContext.data?.candidate ?? null;
  const oiisFeatures = (oiisCandidate?.feature_values ?? {}) as Record<string, unknown>;
  const oiisGates = Object.entries((oiisCandidate?.gate_evidence ?? {}) as Record<string, { passed?: boolean; status?: string; rule?: string; actual?: unknown }>).map(([gate, evidence]) => ({
    gate: gate.replace(/[_-]/g, " "),
    status: evidence.passed === true ? "PASS" : evidence.passed === false ? "FAIL" : text(evidence.status, "RECORDED"),
    rule: text(evidence.rule, "Stored rule"),
    actual: JSON.stringify(evidence.actual ?? {}),
  }));
  const relatedStrategyRows = (strategyCompare.data?.stockSuitability ?? []).filter((row) => row.symbol === symbol && row.capitalMode === "capital_10l").sort((a, b) => b.totalNetPnl - a.totalNetPnl).slice(0, 5);
  const sector = (overview.data?.sectors ?? []).find((row) => row.sector === (analytics?.sector_name ?? quote.sector));

  return (
    <div className={`${styles.page} ${styles.stock360Page}`} data-testid="stock-360">
      <header className={styles.stock360Header}>
        <ReturnToSource fallback="/" />
        <div className={styles.stock360Identity}><StockIdentity symbol={symbol} profile={profiles.bySymbol.get(symbol)} /><MwhdRankBadge ranking={mwhd.rankings.get(symbol)} /><span className={styles.stock360AsOf}>As of {formatTime(quote.timestamp, { hour12: false })}</span></div>
      </header>

      <section className={styles.stock360KpiStrip} aria-label="Stock summary">
        <div><span>LTP</span><strong>{fmtPrice(quote.last)}</strong></div>
        <div data-tone={toneFromNumber(quote.changePct)}><span>Session</span><strong>{signedPct(quote.changePct)}</strong></div>
        <div><span>Signal</span><strong>{dominantSignal.replace(/[_-]/g, " ")}</strong></div>
        <div><span>Market</span><strong>{marketState.replace(/[_-]/g, " ")}</strong></div>
        <div><span>1M</span><strong>{monthReturn == null ? "—" : fmtPct(monthReturn)}</strong></div>
        <div><span>1Y</span><strong>{yearReturn == null ? "—" : fmtPct(yearReturn)}</strong></div>
        <div><span>Volume</span><strong>{finite(quote.volume) == null ? "—" : fmtWholeNumber(finite(quote.volume)!)}</strong></div>
        <div><span>Delivery</span><strong>{latestDaily?.deliveryPct == null ? "—" : fmtPct(latestDaily.deliveryPct)}</strong></div>
      </section>

      <ChartCard title="Intraday" subtitle="Price, EMA, actual volume and per-bar traded value. Select a reference level to emphasise it.">
        {mwdModel.bars.length ? <div className={styles.mwdWorkspace} data-testid="stock-360-intraday-chart">
          <EChartSurface appearance="light" ariaLabel={`${symbol} intraday price, volume and traded value`} className={styles.stockTechnicalChart} option={intradayOption} />
          <div className={styles.mwdLevelTable} role="list" aria-label="Price references">
            <div className={styles.mwdLevelHead}><span>Level</span><span>Value</span><span>Bias</span></div>
            {mwdModel.levels.map((level) => <button key={level.id} type="button" role="listitem" data-selected={selectedMwdLevel === level.id ? "true" : "false"} data-bias={level.bias.toLowerCase()} onClick={() => setSelectedMwdLevel((current) => current === level.id ? null : level.id)} title={level.basis}><span><i style={{ background: level.color }} />{compactLevelLabel(level)}</span><strong>{level.value == null ? "—" : fmtPrice(level.value)}</strong><em>{level.bias === "UP" ? "▲" : level.bias === "DOWN" ? "▼" : "—"}</em></button>)}
          </div>
        </div> : <DataState kind="empty" title="Intraday history unavailable" body="No canonical intraday OHLCV bars were returned." />}
      </ChartCard>

      <ChartCard title="Daily price, volume, traded value and delivery" subtitle="Completed daily observations. Traded value uses exchange turnover when present and close × volume only as a labelled fallback; missing delivery remains missing.">
        {yearHistory.isLoading && !yearBars.length ? <DataState kind="loading" title="Loading daily history" body="The intraday chart remains usable while daily evidence loads." /> : yearBars.length ? <EChartSurface appearance="light" ariaLabel={`${symbol} daily price volume traded value and delivery percentage`} className={styles.stockDailyChart} option={dailyOption} /> : <DataState kind="empty" title="Daily evidence unavailable" body="No completed daily bars were returned." />}
      </ChartCard>

      <section className={styles.stock360DailyStrip} aria-label="Latest daily observation"><span>Daily close <b>{latestDaily ? fmtPrice(latestDaily.c) : "—"}</b></span><span>Volume <b>{latestDaily?.v == null ? "—" : fmtWholeNumber(latestDaily.v)}</b></span><span>Traded value <b>{latestTradedValue == null ? "—" : `₹${fmtDecimal(latestTradedValue, 2)} Cr`}</b></span><span>Delivery <b>{latestDaily?.deliveryPct == null ? "—" : fmtPct(latestDaily.deliveryPct)}</b></span></section>

      <section className={styles.stock360SignalPanel} aria-label="Stock-specific signals">
        <div className={styles.stock360SectionTitle}>Stock signals</div>
        <div className={styles.stock360SignalTable}>
          <div><span>Beta 20D</span><b>{fmtMaybe(payload.beta_20d)}</b></div><div><span>Residual 60m</span><b data-tone={toneFromNumber(num(payload.residual_return_60m_pct))}>{signedPct(payload.residual_return_60m_pct)}</b></div><div><span>VWAP quality</span><b>{fmtMaybe(payload.vwap_hold_quality_score ?? quality.vwap_hold_quality_score)}</b></div><div><span>Volume surprise</span><b>{fmtMaybe(payload.volume_curve_surprise)}</b></div><div><span>Range efficiency</span><b>{fmtMaybe(payload.range_efficiency_pct)}</b></div><div><span>Sector</span><b>{sector ? signedPct(sector.stocks.reduce((sum, row) => sum + row.changePct, 0) / Math.max(1, sector.stocks.length)) : "—"}</b></div><div><span>TradingView</span><b title="No authorised TradingView recommendation source is connected.">Not connected</b></div>
        </div>
        {analytics?.conclusion ? <p className={styles.stock360Conclusion}>{analytics.conclusion}</p> : stock.isLoading ? <p className={styles.stock360Conclusion}>Detailed signal context is loading; charts remain interactive.</p> : null}
      </section>

      <div className={styles.stock360EvidenceToggle}><button type="button" onClick={() => setShowEvidence((current) => !current)} aria-expanded={showEvidence}>{showEvidence ? "Hide full evidence" : "Load full OIIS, F&O and strategy evidence"}</button></div>
      {showEvidence ? <section className={styles.stock360Evidence}>
        {oiisContext.isLoading ? <DataState kind="loading" title="Loading OIIS evidence" body="The slower evidence request is intentionally separate from chart first paint." /> : oiisCandidate ? <>
          <DataTable title="OIIS snapshot" subtitle="Stored selection and liquidity evidence; unavailable values are not converted to zero." rows={[{ metric: "Direction", value: text(oiisCandidate.direction, "—") }, { metric: "OFactor / XFactor / quality", value: `${fmtMaybe(oiisCandidate.ofactor)} / ${fmtMaybe(oiisCandidate.xfactor_snapshot)} / ${fmtMaybe(oiisCandidate.data_quality)}` }, { metric: "Session VWAP", value: fmtMaybe(oiisFeatures.session_vwap) }, { metric: "Volume ratio 20D", value: fmtMaybe(oiisFeatures.volume_ratio_20) }, { metric: "ATR14 / RSI14", value: `${fmtMaybe(oiisFeatures.atr14_previous_completed)} / ${fmtMaybe(oiisCandidate.rsi14)}` }]} columns={[{ key: "metric", header: "Metric", cell: (row) => row.metric }, { key: "value", header: "Value", align: "right", cell: (row) => row.value }]} />
          <DataTable title="Every stored OIIS gate" subtitle="Exact result, rule and input evidence from the latest run." rows={oiisGates} emptyTitle="No gate evidence" emptyBody="The latest candidate did not publish gate evidence." columns={[{ key: "gate", header: "Gate", cell: (row) => row.gate }, { key: "status", header: "Status", cell: (row) => row.status }, { key: "rule", header: "Rule", cell: (row) => row.rule }, { key: "actual", header: "Stored values", cell: (row) => row.actual }]} />
          <DataTable title="Stored F&O contracts" subtitle={oiisContext.data?.smartapi.available ? `Captured ${formatTime(oiisContext.data.smartapi.capturedAt, { hour12: false })}` : "No stored SmartAPI option snapshot."} rows={oiisContext.data?.smartapi.options ?? []} emptyTitle="F&O snapshot unavailable" emptyBody={oiisContext.data?.smartapi.error || "No option snapshot is stored for this underlying."} columns={[{ key: "contract", header: "Contract", cell: (row) => text(row.tradingsymbol, "—") }, { key: "expiry", header: "Expiry", cell: (row) => String(row.expiry ?? "—").slice(0, 10) }, { key: "strike", header: "Strike", align: "right", cell: (row) => `${fmtMaybe(row.strike)} ${text(row.right, "—")}` }, { key: "quote", header: "Bid / ask / spread", align: "right", cell: (row) => `${fmtMaybe(row.bid)} / ${fmtMaybe(row.ask)} / ${fmtMaybe(row.spread_pct)}%` }, { key: "depth", header: "Buy / sell", align: "right", cell: (row) => `${fmtWholeNumber(num(row.total_buy_qty))} / ${fmtWholeNumber(num(row.total_sell_qty))}` }, { key: "activity", header: "Volume / OI / ΔOI%", align: "right", cell: (row) => `${fmtWholeNumber(num(row.volume))} / ${fmtWholeNumber(num(row.oi))} / ${fmtMaybe(row.oi_change_pct)}%` }, { key: "greeks", header: "IV / Δ / Γ / Θ / Vega", align: "right", cell: (row) => `${fmtMaybe(row.broker_iv ?? row.local_iv)} / ${fmtMaybe(row.broker_delta ?? row.local_delta)} / ${fmtMaybe(row.broker_gamma ?? row.local_gamma, 4)} / ${fmtMaybe(row.broker_theta ?? row.local_theta)} / ${fmtMaybe(row.broker_vega ?? row.local_vega)}` }]} />
        </> : <DataState kind="empty" title="No current OIIS evidence" body="This symbol is not present in the latest completed OIIS run." />}
        <DataTable title="Move quality and index-relative context" subtitle="Existing stock explanation fields, shown only after the primary charts." rows={[{ metric: "Time above VWAP", value: signedPct(quality.time_above_vwap_pct) }, { metric: "VWAP hold quality", value: fmtMaybe(quality.vwap_hold_quality_score) }, { metric: "Persistence", value: fmtMaybe(quality.relative_strength_persistence_score) }, { metric: "Close location", value: fmtMaybe(quality.close_location_quality_pct) }, { metric: "Stock / index change", value: `${signedPct(residual.stock_change_pct)} / ${signedPct(residual.index_change_pct)}` }, { metric: "Residual 15m / 60m", value: `${signedPct(residual.residual_return_15m_pct)} / ${signedPct(residual.residual_return_60m_pct)}` }]} columns={[{ key: "metric", header: "Metric", cell: (row) => row.metric }, { key: "value", header: "Value", align: "right", cell: (row) => row.value }]} />
        <DataTable title="Published strategy fit" subtitle="Existing backtesting snapshots; not a live recommendation." rows={relatedStrategyRows} emptyTitle={strategyCompare.isLoading ? "Loading strategy evidence" : "No related strategy evidence"} emptyBody="No published fit row exists for this symbol under the current lens." columns={[{ key: "strategy", header: "Strategy", cell: (row) => row.displayName }, { key: "winRate", header: "Win rate", align: "right", cell: (row) => fmtPct(row.winRatePct) }, { key: "avgReturn", header: "Avg return", align: "right", cell: (row) => fmtPct(row.avgReturnPct) }, { key: "netPnl", header: "Net P&L", align: "right", cell: (row) => formatCurrencyINR(row.totalNetPnl, true) }]} />
      </section> : null}

      <RelatedJourney items={[{ id: "oiis", title: "OIIS evidence", detail: `${symbol} selection and gates`, to: `/strategy/oiis-live?symbol=${encodeURIComponent(symbol)}&source=stock-360`, actionLabel: "Open evidence" }, { id: "paper", title: "Paper Trading", detail: `Preview ${symbol}`, to: `/paper-trading?action=add&symbol=${encodeURIComponent(symbol)}&source=stock-360`, actionLabel: "Preview" }, { id: "history", title: "Historical evidence", detail: "Strategy results", to: `/backtesting/stocks?symbol=${encodeURIComponent(symbol)}&source=stock-360` }, { id: "options", title: "Options", detail: `${symbol} chain`, to: `/options/intelligence?symbol=${encodeURIComponent(symbol)}&source=stock-360` }]} />
    </div>
  );
}
