import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { useAuthGate } from "../auth/AuthGateProvider";
import {
  ErrorState,
  LoadingState,
  PartialState,
  PageIntroAccordion,
  StatusBadge
} from "../components/ui/DashboardPrimitives";
import { EChartSurface } from "../components/visual/EChartSurface";
import { formatDateIST, formatNumber, formatPercent, fmtPct, fmtPrice } from "../lib/format";
import { useSupportingMetrics } from "../lib/hooks";
import type { SupportingMetricQuote, SupportingMetricsResponse } from "../lib/types";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import { useI18n } from "../i18n/LocaleProvider";
import { AnalyticsHeader, MARKET_SECTION_TABS, useAnalyticsExperienceMode } from "./AnalyticsChrome";
import styles from "./AnalyticsPage.module.css";

function formatValue(item: SupportingMetricQuote) {
  if (item.value == null || !Number.isFinite(item.value)) return "—";
  if (item.unit === "index_points") return formatNumber(Math.round(item.value), { maximumFractionDigits: 0 });
  if (item.unit === "INR_per_kg") return formatNumber(item.value, { maximumFractionDigits: 0 });
  return fmtPrice(item.value);
}

function formatUnit(item: SupportingMetricQuote, tr: (value: string) => string) {
  const mapping: Record<string, string> = {
    index_points: "index points",
    USD_per_barrel: "USD/barrel",
    INR_per_USD: "INR per USD",
    INR_per_10g: "INR per 10g",
    INR_per_kg: "INR per kg",
    EUR_per_MWh: "EUR/MWh"
  };
  return tr(mapping[item.unit] ?? item.unit.replace(/_/g, " "));
}

function qualityTone(item: SupportingMetricQuote) {
  return /approx/i.test(item.quality) ? "red" : "white";
}

function changeTone(item: SupportingMetricQuote) {
  if (item.changePct == null || !Number.isFinite(item.changePct)) return "white";
  if (item.changePct > 0) return "green";
  if (item.changePct < 0) return "red";
  return "white";
}

function formatChangePct(item: SupportingMetricQuote) {
  if (item.changePct == null || !Number.isFinite(item.changePct)) return "—";
  return fmtPct(item.changePct);
}

function qualityLabel(item: SupportingMetricQuote) {
  return item.quality.replace(/_/g, " ");
}

function sourceLabel(item: SupportingMetricQuote) {
  const source = item.source.toUpperCase();
  if (!item.providerSymbol) return source;
  return `${source} · ${item.providerSymbol}`;
}

function formatTimestamp(value: string | null) {
  return formatDateIST(value, { includeTime: true });
}

function metricByCode(items: SupportingMetricQuote[], code: string) {
  return items.find((item) => item.code === code) ?? null;
}

function interpretOvernightSentiment(globalIndices: SupportingMetricQuote[]) {
  const basket = ["gift_nifty", "dow_jones", "sp_500", "nasdaq_composite"]
    .map((code) => metricByCode(globalIndices, code))
    .filter((item): item is SupportingMetricQuote => item !== null && item.changePct != null);
  if (!basket.length) return "Mixed";
  const avg = basket.reduce((sum, item) => sum + (item.changePct ?? 0), 0) / basket.length;
  if (avg > 0.35) return "Positive";
  if (avg < -0.35) return "Negative";
  return "Mixed";
}

function interpretFxPressure(usdInr: SupportingMetricQuote | null) {
  const change = usdInr?.changePct;
  if (change == null || !Number.isFinite(change)) return "Neutral";
  if (change > 0.2) return "Headwind";
  if (change < -0.2) return "Supportive";
  return "Neutral";
}

function interpretCommodityPressure(brent: SupportingMetricQuote | null, gold: SupportingMetricQuote | null) {
  const basket = [brent?.changePct, gold?.changePct].filter((value): value is number => value != null && Number.isFinite(value));
  if (!basket.length) return "Neutral";
  const avg = basket.reduce((sum, value) => sum + value, 0) / basket.length;
  if (avg > 0.6) return "Inflationary";
  if (avg < -0.6) return "Disinflationary";
  return "Neutral";
}

function buildChangeBarOption(
  items: SupportingMetricQuote[],
  title: string,
  xAxisName: string,
  yAxisName: string,
  dayChangeLabel: string
): EChartsOption {
  return {
    grid: { top: 24, right: 18, bottom: 52, left: 60, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const rows = Array.isArray(params) ? params as Array<{ axisValue: string; value: number }> : [];
        return `${rows[0]?.axisValue ?? ""}<br/>${dayChangeLabel}: ${formatPercent(rows[0]?.value ?? null, 2, true)}`;
      }
    },
    xAxis: {
      type: "category",
      name: xAxisName,
      data: items.map((item) => item.label)
    },
    yAxis: {
      type: "value",
      name: yAxisName,
      axisLabel: {
        formatter: (value: number) => formatPercent(value, 0, false)
      }
    },
    series: [
      {
        type: "bar",
        barMaxWidth: 24,
        markLine: {
          symbol: "none",
          data: [{ yAxis: 0 }],
          lineStyle: { color: "rgba(230, 237, 243, 0.28)", type: "dashed" }
        },
        data: items.map((item) => ({
          value: item.changePct ?? 0,
          itemStyle: {
            color: (item.changePct ?? 0) >= 0 ? "#3fb950" : "#ff7b72",
            borderRadius: [6, 6, 0, 0]
          }
        }))
      }
    ]
  };
}

const EMPTY_SUPPORTING_METRICS_PAYLOAD: SupportingMetricsResponse = {
  asOf: "",
  gateway: {
    ok: false,
    generatedAt: "",
    service: "supporting-metrics",
    version: "unknown",
    fredKeyConfigured: false,
    cacheEntries: 0
  },
  summary: {
    primaryCount: 0,
    globalIndexCount: 0,
    delayedCount: 0,
    officialCount: 0,
    approximateCount: 0,
    errorCount: 0
  },
  defaultCodes: [],
  supportedDescriptions: {},
  primaryMetrics: [],
  globalIndices: [],
  errors: []
};

export function AnalyticsSupportingMetricsPage() {
  const { authReady } = useAuthGate();
  const { mode } = useAnalyticsExperienceMode();
  const { t, tr } = useI18n();
  const supportingMetrics = useSupportingMetrics(authReady);
  const metricsPayload = supportingMetrics.data;
  usePageLoadProfile({
    pageName: "analytics_supporting_metrics",
    enabled: authReady,
    queries: [
      {
        name: "analytics-supporting-metrics",
        isLoading: supportingMetrics.isLoading,
        isError: !!supportingMetrics.error
      }
    ]
  });

  const loading = !authReady || (!supportingMetrics.data && supportingMetrics.isLoading);
  useDeferredBusyState(loading);
  const keyNotes = useMemo(
    () =>
      metricsPayload
        ? [...metricsPayload.primaryMetrics, ...metricsPayload.globalIndices]
            .flatMap((item) => item.notes.slice(0, 1).map((note) => ({ code: item.code, note })))
            .slice(0, 8)
        : [],
    [metricsPayload]
  );
  const payload = metricsPayload ?? EMPTY_SUPPORTING_METRICS_PAYLOAD;
  const primaryMetrics = payload?.primaryMetrics ?? [];
  const globalIndices = payload?.globalIndices ?? [];
  const spotlightCodes = ["gift_nifty", "dow_jones", "sp_500", "nasdaq_composite", "brent_crude", "india_gold", "india_silver", "usd_inr"];
  const spotlightMetrics = spotlightCodes
    .map((code) => metricByCode([...primaryMetrics, ...globalIndices], code))
    .filter((item): item is SupportingMetricQuote => item !== null);
  const usdInr = metricByCode(primaryMetrics, "usd_inr");
  const brent = metricByCode(primaryMetrics, "brent_crude");
  const gold = metricByCode(primaryMetrics, "india_gold");
  const overnightSentiment = interpretOvernightSentiment([...primaryMetrics, ...globalIndices]);
  const fxPressure = interpretFxPressure(usdInr);
  const commodityPressure = interpretCommodityPressure(brent, gold);
  const indexChartOption = useMemo(
    () => buildChangeBarOption(globalIndices.slice(0, 8), tr("Global indices"), tr("Global indices"), tr("Day Change %"), tr("Day change")),
    [globalIndices, tr]
  );
  const macroChartOption = useMemo(
    () => buildChangeBarOption(spotlightMetrics.slice(0, 8), tr("Macro basket"), tr("Macro basket"), tr("Day Change %"), tr("Day change")),
    [spotlightMetrics, tr]
  );

  if (loading) {
    return (
      <LoadingState
        title={tr("Loading supporting metrics")}
        body={tr("The supporting macro feeds, commodity benchmarks, FX references, and global indices are being prepared.")}
      />
    );
  }

  if (supportingMetrics.error || !metricsPayload) {
    return (
      <ErrorState
        title={tr("Supporting metrics are unavailable")}
        body={tr("The latest supporting metrics could not load. Refresh and try again.")}
      />
    );
  }

  const partial =
    payload.errors.length > 0 ||
    payload.primaryMetrics.length === 0 ||
    payload.globalIndices.length === 0;

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title={tr("Supporting Metrics")}
        meta={`Gateway ${payload.gateway.service} ${payload.gateway.version} • Refreshed ${formatTimestamp(payload.gateway.generatedAt)}`}
        subtitle={tr("Delayed and end-of-day global context for commodities, FX, bullion, and major indices before you read the local tape.")}
        sectionTabs={[...MARKET_SECTION_TABS]}
      />

      {partial ? (
        <PartialState
          title={tr("Supporting metrics returned partial data")}
          body={tr("Some upstream feeds failed or fell back. The available values below are still usable, but check the source and quality labels before acting on them.")}
        />
      ) : null}

      <section className={styles.heroGrid}>
        <div className={styles.heroCard}>
          <div className={styles.eyebrow}>{tr("Why this matters for India today")}</div>
          <div className={styles.heroValue} data-tone={overnightSentiment === "Negative" ? "red" : overnightSentiment === "Positive" ? "green" : "white"}>
            {tr(overnightSentiment)}
          </div>
          <p className={styles.sectionIntro}>
            {t("literals.Overnight sentiment is {{sentiment}}, FX pressure is {{fx}}, and commodity pressure is {{commodity}}. Use this page as optional context before you over-interpret the local tape.", "Overnight sentiment is {{sentiment}}, FX pressure is {{fx}}, and commodity pressure is {{commodity}}. Use this page as optional context before you over-interpret the local tape.", {
              sentiment: tr(overnightSentiment).toLowerCase(),
              fx: tr(fxPressure).toLowerCase(),
              commodity: tr(commodityPressure).toLowerCase()
            })}
          </p>
          <div className={styles.heroMeta}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>{tr("FX pressure")}</div>
              <div className={styles.metricValue} data-tone={fxPressure === "Headwind" ? "red" : fxPressure === "Supportive" ? "green" : "white"}>{tr(fxPressure)}</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>{tr("Commodity pressure")}</div>
              <div className={styles.metricValue} data-tone={commodityPressure === "Inflationary" ? "red" : commodityPressure === "Disinflationary" ? "green" : "white"}>{tr(commodityPressure)}</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>{tr("Reference set")}</div>
              <div className={styles.metricValue}>{formatNumber(spotlightMetrics.length, { maximumFractionDigits: 0 })} {tr("items")}</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>{tr("As of")}</div>
              <div className={styles.metricValue}>{formatTimestamp(payload.gateway.generatedAt)}</div>
            </div>
          </div>
        </div>

        <div className={styles.metricGrid}>
          {spotlightMetrics.map((item) => (
            <article key={item.code} className={styles.metricCard}>
              <div className={styles.metricLabel}>{item.label}</div>
              <div className={styles.metricValue} data-tone={changeTone(item)}>{formatValue(item)}</div>
              <div className={styles.metricHint}>
                {formatUnit(item, tr)} · {item.currency}
              </div>
              <div className={styles.metricHint}>
                {tr("Day move")} {formatChangePct(item)} · {sourceLabel(item)}
              </div>
              <div className={styles.metricHint}>
                {tr(qualityLabel(item))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.grid2}>
        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h2 className={styles.panelTitle}>{tr("Major global indices")}</h2>
              <p className={styles.chartCaption}>{tr("What this chart shows: the daily percentage move across the global index basket used as supporting context.")}</p>
            </div>
          </div>
          <EChartSurface ariaLabel={tr("Major global indices change chart")} className={styles.chartSurface} option={indexChartOption} />
        </article>

        <article className={styles.chartPanel}>
          <div className={styles.chartHeader}>
            <div>
              <h2 className={styles.panelTitle}>{tr("Macro basket move")}</h2>
              <p className={styles.chartCaption}>{tr("Use this to compare commodities, bullion, FX, and Gift Nifty without reading the tables first.")}</p>
            </div>
          </div>
          <EChartSurface ariaLabel={tr("Macro basket change chart")} className={styles.chartSurface} option={macroChartOption} />
        </article>
      </section>

      <section className={styles.grid2}>
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{tr("Primary supporting metrics")}</h2>
          <p className={styles.sectionIntro}>
            {tr("Daily or delayed cross-market reads for the core supporting basket. Use them as context, not as local execution triggers.")}
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>{tr("Metric")}</th>
                  <th>{tr("Value")}</th>
                  <th>{tr("Day %")}</th>
                  <th>{tr("Unit")}</th>
                  <th>{tr("Source")}</th>
                  <th>{tr("Quality")}</th>
                </tr>
              </thead>
              <tbody>
                {primaryMetrics.map((row) => (
                  <tr key={row.code}>
                    <td>
                      <div className={styles.headline}>
                        <strong>{row.label}</strong>
                        <span className={styles.muted}>{tr(row.description ?? row.code)}</span>
                      </div>
                    </td>
                    <td>{formatValue(row)}</td>
                    <td>
                      <span className={styles.smallStat} data-tone={changeTone(row)}>
                        {formatChangePct(row)}
                      </span>
                    </td>
                    <td>{formatUnit(row, tr)}</td>
                    <td>{sourceLabel(row)}</td>
                    <td>
                      <StatusBadge label={qualityLabel(row)} tone={qualityTone(row)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{tr("Major global indices")}</h2>
          <p className={styles.sectionIntro}>{tr("Grouped context for the overnight backdrop. Read this only after you have the local tape in mind.")}</p>
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>{tr("Index")}</th>
                  <th>{tr("Value")}</th>
                  <th>{tr("Day %")}</th>
                  <th>{tr("Currency")}</th>
                  <th>{tr("Source")}</th>
                  <th>{tr("As of")}</th>
                </tr>
              </thead>
              <tbody>
                {globalIndices.map((row) => (
                  <tr key={row.code}>
                    <td>
                      <div className={styles.headline}>
                        <strong>{row.label}</strong>
                        <span className={styles.muted}>{row.code.replace(/_/g, " ")}</span>
                      </div>
                    </td>
                    <td>{formatValue(row)}</td>
                    <td>
                      <span className={styles.smallStat} data-tone={changeTone(row)}>
                        {formatChangePct(row)}
                      </span>
                    </td>
                    <td>{row.currency}</td>
                    <td>{sourceLabel(row)}</td>
                    <td>{formatTimestamp(row.asOf)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={styles.grid2}>
        <div className={styles.panel}>
          <PageIntroAccordion
            label={tr("Source notes")}
            title={tr("Quality notes stay collapsed by default in Beginner mode.")}
            body={tr("Use these notes when you need to understand fallback mechanics or source-specific caveats. They should not displace the main macro read.")}
            defaultOpen={mode === "advanced"}
            widgetId="supporting_metrics_source_notes"
            items={
              keyNotes.length
                ? keyNotes.map((item) => `${item.code.replace(/_/g, " ")}: ${tr(item.note)}`)
                : [tr("No extra source notes are available for the current view.")]
            }
          />
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{tr("India translation")}</h2>
          <div className={styles.signalGrid}>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Overnight risk sentiment")}</div>
                <div className={styles.muted}>{tr("Use this to decide whether global tone is broadly supportive, negative, or mixed before the Indian session.")}</div>
              </div>
              <div className={styles.smallStat} data-tone={overnightSentiment === "Negative" ? "red" : overnightSentiment === "Positive" ? "green" : "white"}>{tr(overnightSentiment)}</div>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("FX pressure")}</div>
                <div className={styles.muted}>{tr("USD/INR acts as a simple headwind / neutral / supportive check for domestic risk appetite.")}</div>
              </div>
              <div className={styles.smallStat} data-tone={fxPressure === "Headwind" ? "red" : fxPressure === "Supportive" ? "green" : "white"}>{tr(fxPressure)}</div>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Commodity pressure")}</div>
                <div className={styles.muted}>{tr("Brent and bullion give a simple inflation / neutral / disinflationary backdrop instead of a raw ops feed read.")}</div>
              </div>
              <div className={styles.smallStat} data-tone={commodityPressure === "Inflationary" ? "red" : commodityPressure === "Disinflationary" ? "green" : "white"}>{tr(commodityPressure)}</div>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("System trust details")}</div>
                <div className={styles.muted}>{tr("Gateway errors, stale runs, and data-quality warnings now belong on the Trust Board instead of in the main market workflow.")}</div>
              </div>
              <div className={styles.smallStat}>{tr("Trust Board")}</div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{tr("How to use this page")}</h2>
        <div className={styles.signalGrid}>
          <div className={styles.signalItem}>
            <div>
              <div className={styles.strong}>{tr("Read context first")}</div>
              <div className={styles.muted}>
                {tr("Supporting metrics frame the macro backdrop before you translate anything into NIFTY-specific decisions.")}
              </div>
            </div>
          </div>
          <div className={styles.signalItem}>
            <div>
              <div className={styles.strong}>{tr("Check the quality badge")}</div>
              <div className={styles.muted}>
                {tr("The quality label distinguishes official-style daily references from delayed market quotes and fallback approximations.")}
              </div>
            </div>
          </div>
          <div className={styles.signalItem}>
            <div>
              <div className={styles.strong}>{tr("Respect source notes")}</div>
              <div className={styles.muted}>
                {tr("Gold and silver prefer IBJA bulletin parsing, while Brent and USD/INR can fall back when premium feeds are unavailable.")}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
