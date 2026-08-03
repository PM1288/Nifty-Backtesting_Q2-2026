import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { Link } from "react-router-dom";
import { useAuthGate } from "../auth/AuthGateProvider";
import { trackFilterChanged } from "../analytics/events";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import {
  ButtonButton,
  ChartCard,
  ErrorState,
  KpiCard,
  LoadingSkeletonCard,
  PageIntroAccordion
} from "../components/ui/DashboardPrimitives";
import { EChartSurface } from "../components/visual/EChartSurface";
import { HeatmapLegend } from "../components/visual/HeatmapLegend";
import { RsiHeatmap } from "../components/visual/RsiHeatmap";
import { useI18n } from "../i18n/LocaleProvider";
import { formatDateIST, formatNumber, formatTime } from "../lib/format";
import { useRsiSurface } from "../lib/hooks";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import type { RsiSurfaceResponse, RsiSurfaceRow } from "../lib/types";
import { AnalyticsHeader, ExplainThis, SIGNAL_SECTION_TABS } from "./AnalyticsChrome";
import styles from "./RsiSurfacePage.module.css";

function fmtNumber(value: number | null | undefined, digits = 1): string {
  return formatNumber(value, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function rsiTone(value: number | null | undefined): "up" | "down" | "flat" {
  if (value == null || !Number.isFinite(value)) return "flat";
  if (value >= 60) return "up";
  if (value <= 40) return "down";
  return "flat";
}

function ExtremesStrip({
  title,
  items,
  tone
}: {
  title: string;
  items: RsiSurfaceRow[];
  tone: "up" | "down";
}) {
  const { tr } = useI18n();
  return (
    <div className={styles.extremesCard} data-tone={tone}>
      <div className={styles.extremesTitle}>{tr(title)}</div>
      <div className={styles.extremesItems}>
        {items.map((item) => (
          <div key={`${title}-${item.symbol}`} className={styles.extremeChip} data-tone={tone}>
            <span className={styles.extremeSymbol}>{item.symbol}</span>
            <span className={styles.extremeValue}>{fmtNumber(item.latestRsi)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeatmapTrend({ values }: { values: number[] }) {
  const { tr } = useI18n();
  const normalized = values.filter((value) => Number.isFinite(value));
  if (!normalized.length) {
    return <div className={styles.detailSparkEmpty}>{tr("Trend unavailable")}</div>;
  }
  const option: EChartsOption = {
    grid: { top: 24, right: 18, bottom: 46, left: 54, containLabel: true },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params as Array<{ axisValue: string; value: number }> : [];
        return `${tr("Step")} ${items[0]?.axisValue ?? ""}<br/>RSI: ${fmtNumber(items[0]?.value ?? null)}`;
      }
    },
    xAxis: {
      type: "category",
      name: tr("Time"),
      data: normalized.map((_, index) => `${index + 1}`)
    },
    yAxis: {
      type: "value",
      name: "RSI",
      min: 0,
      max: 100
    },
    series: [
      {
        type: "line",
        smooth: true,
        showSymbol: false,
        lineStyle: { color: "#3fb950", width: 2.5 },
        markLine: {
          symbol: "none",
          data: [{ yAxis: 30 }, { yAxis: 50 }, { yAxis: 70 }, { yAxis: 20 }, { yAxis: 80 }],
          lineStyle: { color: "rgba(230, 237, 243, 0.28)", type: "dashed" }
        },
        data: normalized
      }
    ]
  };
  return <EChartSurface ariaLabel="Focused RSI trend chart" className={styles.chartSurface} option={option} />;
}

export function RsiSurfacePage() {
  const { authReady } = useAuthGate();
  const { tr } = useI18n();
  const surface = useRsiSurface(authReady);
  usePageLoadProfile({
    pageName: "rsi_surface",
    enabled: authReady,
    queries: [{ name: "rsi-surface", isLoading: surface.isLoading, isError: !!surface.error }]
  });
  const loading = !authReady || (!surface.data && surface.isLoading);
  useDeferredBusyState(loading);
  const [selectedSector, setSelectedSector] = useState<string>("all");
  const [symbolQuery, setSymbolQuery] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const rawPayload = surface.data;
  const payload = useMemo<RsiSurfaceResponse | null>(() => {
    if (!rawPayload) return null;
    const query = symbolQuery.trim().toLowerCase();
    const rowIndexes = rawPayload.rows.reduce<number[]>((all, row, index) => {
      const matchesSector = selectedSector === "all" || row.sector === selectedSector;
      const matchesQuery = !query || row.symbol.toLowerCase().includes(query) || row.name.toLowerCase().includes(query);
      if (matchesSector && matchesQuery) all.push(index);
      return all;
    }, []);
    if (!rowIndexes.length) {
      return {
        ...rawPayload,
        rows: [],
        sectors: selectedSector === "all" ? rawPayload.sectors : rawPayload.sectors.filter((item) => item.sector === selectedSector),
        values: [],
        stats: rawPayload.stats
      };
    }
    const rows = rowIndexes.map((index) => rawPayload.rows[index]);
    const values = rowIndexes.map((index) => rawPayload.values[index] ?? []);
    const latestValues = rows.map((row) => row.latestRsi).filter(Number.isFinite);
    return {
      ...rawPayload,
      rows,
      sectors: selectedSector === "all" ? rawPayload.sectors : rawPayload.sectors.filter((item) => item.sector === selectedSector),
      values,
      stats: {
        ...rawPayload.stats,
        min: latestValues.length ? Math.min(...latestValues) : rawPayload.stats.min,
        max: latestValues.length ? Math.max(...latestValues) : rawPayload.stats.max,
        universeAvgRsi: latestValues.length
          ? latestValues.reduce((sum, value) => sum + value, 0) / latestValues.length
          : rawPayload.stats.universeAvgRsi
      }
    };
  }, [selectedSector, rawPayload, symbolQuery]);
  const detailEntry = useMemo(() => {
    if (!payload || !selectedSymbol) return null;
    const rowIndex = payload.rows.findIndex((row) => row.symbol === selectedSymbol);
    if (rowIndex < 0) return null;
    return {
      row: payload.rows[rowIndex],
      values: payload.values[rowIndex] ?? []
    };
  }, [payload, selectedSymbol]);

  useEffect(() => {
    if (!payload) return;
    if (!payload.rows.length) {
      setSelectedSymbol(null);
      return;
    }
    if (selectedSymbol && payload.rows.some((row) => row.symbol === selectedSymbol)) return;
    const topRow = [...payload.rows].sort((a, b) => b.latestRsi - a.latestRsi)[0];
    setSelectedSymbol(topRow?.symbol ?? payload.rows[0]?.symbol ?? null);
  }, [payload, selectedSymbol]);

  if (loading) {
    return (
      <div className={styles.page}>
        <section className={styles.summaryGrid}>
          <LoadingSkeletonCard title={tr("Universe average")} lines={3} compact />
          <LoadingSkeletonCard title={tr("NIFTY RSI")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Range")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Rows")} lines={3} compact />
        </section>
        <LoadingSkeletonCard title={tr("RSI heatmap")} lines={8} />
      </div>
    );
  }

  if (surface.error || !surface.data) {
    return (
      <ErrorState
        title={tr("The RSI map is unavailable")}
        body={tr("The momentum surface could not load. Check the signal feed and try again.")}
      />
    );
  }
  if (!payload) {
    return (
      <ErrorState
        title={tr("The RSI map is unavailable")}
        body={tr("The latest RSI heatmap data could not load. Refresh and try again.")}
      />
    );
  }
  const highestRsi = [...payload.rows].sort((a, b) => b.latestRsi - a.latestRsi).slice(0, 3);
  const lowestRsi = [...payload.rows].sort((a, b) => a.latestRsi - b.latestRsi).slice(0, 3);
  const sectorOptions = ["all", ...rawPayload!.sectors.map((item) => item.sector)];

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title={tr("RSI Heatmap")}
        meta={`${tr("Rows")} ${formatNumber(payload.rows.length, { maximumFractionDigits: 0 })} • ${tr("Updated")} ${formatDateIST(payload.asOf, { includeTime: true })}`}
        subtitle={tr("RSI map. Use this as a momentum scan inside the Signals workspace, not as a standalone trade engine.")}
        sectionTabs={[...SIGNAL_SECTION_TABS]}
        learningPrompt={tr("This page answers one question: which names are stretched, washed out, or balanced on RSI right now?")}
      />

      <section className={styles.summaryGrid}>
        <KpiCard
          label={tr("Universe average")}
          value={fmtNumber(payload.stats.universeAvgRsi)}
          meta={tr("Average RSI across the tracked universe.")}
          tone={rsiTone(payload.stats.universeAvgRsi) === "up" ? "green" : rsiTone(payload.stats.universeAvgRsi) === "down" ? "red" : "white"}
        />
        <KpiCard
          label={tr("NIFTY RSI")}
          value={fmtNumber(payload.stats.niftyRsi)}
          meta={tr("Use this to compare stock momentum with the headline market.")}
          tone={rsiTone(payload.stats.niftyRsi) === "up" ? "green" : rsiTone(payload.stats.niftyRsi) === "down" ? "red" : "white"}
        />
        <KpiCard
          label={tr("Range")}
          value={`${fmtNumber(payload.stats.min)} to ${fmtNumber(payload.stats.max)}`}
          meta={tr("Visible spread between the weakest and strongest RSI readings.")}
        />
        <KpiCard
          label={tr("Rows")}
          value={payload.rows.length}
          meta={tr("Tracked names included in this scan.")}
        />
      </section>

      <ChartCard
        title={tr("RSI heatmap")}
        subtitle={`${tr("Session")} ${formatTime(payload.session.start, { hour12: false })} ${tr("to")} ${formatTime(payload.session.end, { hour12: false })}. ${tr("Left-to-right is time. Compare row color and the latest RSI column to judge momentum pressure.")}`}
        meta={
          <div className={styles.filterRow}>
            <input
              type="search"
              value={symbolQuery}
              onChange={(event) => setSymbolQuery(event.currentTarget.value)}
              className={styles.searchInput}
              placeholder={tr("Search symbol")}
              aria-label={tr("Search RSI symbols")}
            />
            {sectorOptions.slice(0, 10).map((sector) => (
              <ButtonButton
                key={sector}
                size="s"
                variant={selectedSector === sector ? "primary" : "secondary"}
                tone={selectedSector === sector && sector !== "all" ? "green" : "white"}
                onClick={() => {
                  void trackFilterChanged({
                    filter_name: "sector",
                    filter_value: sector,
                    surface: "rsi"
                  });
                  setSelectedSector(sector);
                }}
              >
                {sector === "all" ? tr("All sectors") : sector}
              </ButtonButton>
            ))}
          </div>
        }
        footer={
          <div className={styles.infoBar}>
            <div className={styles.infoMetrics}>
              {[
                ["<20", payload.rows.filter((row) => row.latestRsi < 20).length, "down"],
                ["20-30", payload.rows.filter((row) => row.latestRsi >= 20 && row.latestRsi < 30).length, "down"],
                ["30-40", payload.rows.filter((row) => row.latestRsi >= 30 && row.latestRsi < 40).length, "down"],
                ["40-50", payload.rows.filter((row) => row.latestRsi >= 40 && row.latestRsi < 50).length, "flat"],
                ["50-70", payload.rows.filter((row) => row.latestRsi >= 50 && row.latestRsi < 70).length, "up"],
                ["70-80", payload.rows.filter((row) => row.latestRsi >= 70 && row.latestRsi < 80).length, "up"],
                ["80+", payload.rows.filter((row) => row.latestRsi >= 80).length, "up"]
              ].map(([label, count, tone]) => (
                <div key={String(label)} className={styles.metricChip} data-tone={String(tone)}>
                  <span>{label}</span>
                  <strong>{count as number}</strong>
                </div>
              ))}
            </div>
            <div className={styles.infoExtremes}>
              <ExtremesStrip title="Bottom 3" items={lowestRsi} tone="down" />
              <ExtremesStrip title="Top 3" items={highestRsi} tone="up" />
            </div>
            <HeatmapLegend metric="rsi" />
          </div>
        }
      >
        <section className={styles.heatmapPanel}>
          <RsiHeatmap payload={payload} selectedSymbol={selectedSymbol} onSelectSymbol={setSelectedSymbol} />
        </section>
        {detailEntry ? (
          <section className={styles.detailCard}>
            <div className={styles.detailHeader}>
              <div>
                <div className={styles.detailEyebrow}>{tr("Focused row")}</div>
                <div className={styles.detailTitleRow}>
                  <strong>{detailEntry.row.symbol}</strong>
                  <span>{detailEntry.row.name}</span>
                </div>
              </div>
              <div className={styles.detailStats}>
                <div className={styles.detailStat}>
                  <span>{tr("Sector")}</span>
                  <strong>{detailEntry.row.sector}</strong>
                </div>
                <div className={styles.detailStat}>
                  <span>{tr("Latest RSI")}</span>
                  <strong data-tone={rsiTone(detailEntry.row.latestRsi)}>{fmtNumber(detailEntry.row.latestRsi)}</strong>
                </div>
                <div className={styles.detailStat}>
                  <span>{tr("% change")}</span>
                  <strong>{fmtNumber(detailEntry.row.changePct, 2)}</strong>
                </div>
              </div>
            </div>
            <div className={styles.detailSparkWrap}>
              <HeatmapTrend values={detailEntry.values} />
              <div className={styles.detailSparkCaption}>{tr("Selected row RSI through the intraday window. Check whether the move is stretching or cooling before routing into a trade idea.")}</div>
            </div>
            <div className={styles.detailLinks}>
              <Link to={`/analytics/stock/${encodeURIComponent(detailEntry.row.symbol)}`} className={styles.detailLink}>{tr("Open stock detail")}</Link>
              <Link to="/analytics/signal/willr" className={styles.detailLink}>{tr("Compare WILLR")}</Link>
              <Link to="/analytics/indicators" className={styles.detailLink}>{tr("Open indicators")}</Link>
            </div>
          </section>
        ) : null}
      </ChartCard>

      <section className={styles.summaryGrid}>
        <PageIntroAccordion
          label={tr("How to use RSI here")}
          title={tr("Read the map first, then explain the strongest and weakest rows.")}
          body={tr("Start with the summary cards, then inspect the strongest and weakest rows. High RSI is not a sell signal by itself and low RSI is not a buy signal by itself.")}
        widgetId="heatmap_rsi_help"
        items={[
            tr("Use the black / red / yellow / green / dark-green / white thresholds before you judge any single row."),
            tr("High RSI can mean genuine strength, not automatic exhaustion."),
            tr("Compare extremes with the market story before you trust them.")
          ]}
        />
        <ExplainThis
          label={tr("RSI extremes")}
          summary={tr("RSI tells you how forcefully price has been moving over the lookback window.")}
          detail={tr("Very high readings often mean strong participation, and very low readings often mean weak participation. Neither reading is enough on its own.")}
          takeaway={tr("Use RSI as context for stock selection, not as a complete buy or sell rule.")}
        />
        <ExplainThis
          label={tr("When RSI stays stretched")}
          summary={tr("Strong trends can keep RSI elevated or depressed for longer than beginners expect.")}
          detail={tr("That is why the page is a scan, not a timing engine. Use regime, breadth, and stock quality before treating a high or low reading as a reversal cue.")}
          takeaway={tr("Overbought and oversold describe condition, not an automatic action.")}
        />
      </section>
    </div>
  );
}
