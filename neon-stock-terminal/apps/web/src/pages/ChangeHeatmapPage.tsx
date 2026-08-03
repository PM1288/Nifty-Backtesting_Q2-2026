import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { Link } from "react-router-dom";
import { useAuthGate } from "../auth/AuthGateProvider";
import { trackFilterChanged } from "../analytics/events";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { ButtonButton, ChartCard, DataState, KpiCard, LoadingSkeletonCard, PageIntroAccordion } from "../components/ui/DashboardPrimitives";
import { ChangeHeatmap } from "../components/visual/ChangeHeatmap";
import { EChartSurface } from "../components/visual/EChartSurface";
import { HeatmapLegend } from "../components/visual/HeatmapLegend";
import { formatCurrencyINR, formatDateIST, formatNumber, fmtPct } from "../lib/format";
import { useChangeHeatmap } from "../lib/hooks";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import type { ChangeHeatmapResponse, ChangeHeatmapRow } from "../lib/types";
import { useI18n } from "../i18n/LocaleProvider";
import { AnalyticsHeader, MARKET_SECTION_TABS } from "./AnalyticsChrome";
import styles from "./RsiSurfacePage.module.css";

function fmtRawPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return fmtPct(value);
}

function changeTone(value: number | null | undefined): "up" | "down" | "flat" {
  if (value == null || !Number.isFinite(value)) return "flat";
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

function ExtremesStrip({
  title,
  items,
  tone
}: {
  title: string;
  items: ChangeHeatmapRow[];
  tone: "up" | "down";
}) {
  return (
    <div className={styles.extremesCard} data-tone={tone}>
      <div className={styles.extremesTitle}>{title}</div>
          <div className={styles.extremesItems}>
        {items.map((item) => (
          <div key={`${title}-${item.symbol}`} className={styles.extremeChip} data-tone={tone}>
            <span className={styles.extremeSymbol}>{item.symbol}</span>
            <span className={styles.extremeValue}>{fmtRawPct(item.latestChangePct)}</span>
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
    grid: { top: 24, right: 18, bottom: 46, left: 58, containLabel: true },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params as Array<{ axisValue: string; value: number }> : [];
        return `${tr("Step")} ${items[0]?.axisValue ?? ""}<br/>${tr("% Change")}: ${fmtRawPct(items[0]?.value ?? null)}`;
      }
    },
    xAxis: {
      type: "category",
      name: tr("Time"),
      data: normalized.map((_, index) => `${index + 1}`)
    },
    yAxis: {
      type: "value",
      name: tr("% Change"),
      axisLabel: { formatter: (value: number) => fmtRawPct(value) }
    },
    series: [
      {
        type: "line",
        smooth: true,
        showSymbol: false,
        lineStyle: { color: "#58a6ff", width: 2.5 },
        markLine: {
          symbol: "none",
          data: [{ yAxis: 0 }],
          lineStyle: { color: "rgba(230, 237, 243, 0.28)", type: "dashed" }
        },
        data: normalized
      }
    ]
  };
  return <EChartSurface ariaLabel="Focused change trend chart" className={styles.chartSurface} option={option} />;
}

export function ChangeHeatmapPage() {
  const { tr } = useI18n();
  const { authReady } = useAuthGate();
  const surface = useChangeHeatmap(authReady);
  usePageLoadProfile({
    pageName: "change_heatmap",
    enabled: authReady,
    queries: [{ name: "change-heatmap", isLoading: surface.isLoading, isError: !!surface.error }]
  });
  const loading = !authReady || (!surface.data && surface.isLoading);
  const showLoading = useDeferredBusyState(loading);
  const [selectedSector, setSelectedSector] = useState<string>("all");
  const [symbolQuery, setSymbolQuery] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const rawPayload = surface.data;
  const payload = useMemo<ChangeHeatmapResponse | null>(() => {
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
        stats: {
          ...rawPayload.stats,
          min: rawPayload.stats.min,
          max: rawPayload.stats.max,
          universeAvgChangePct: rawPayload.stats.universeAvgChangePct
        }
      };
    }
    const rows = rowIndexes.map((index) => rawPayload.rows[index]);
    const values = rowIndexes.map((index) => rawPayload.values[index] ?? []);
    const latestChangeValues = rows.map((row) => row.latestChangePct).filter(Number.isFinite);
    return {
      ...rawPayload,
      rows,
      sectors: selectedSector === "all" ? rawPayload.sectors : rawPayload.sectors.filter((item) => item.sector === selectedSector),
      values,
      stats: {
        ...rawPayload.stats,
        min: latestChangeValues.length ? Math.min(...latestChangeValues) : rawPayload.stats.min,
        max: latestChangeValues.length ? Math.max(...latestChangeValues) : rawPayload.stats.max,
        universeAvgChangePct: latestChangeValues.length
          ? latestChangeValues.reduce((sum, value) => sum + value, 0) / latestChangeValues.length
          : rawPayload.stats.universeAvgChangePct
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
    const highestRow = [...payload.rows].sort((a, b) => b.latestChangePct - a.latestChangePct)[0];
    setSelectedSymbol(highestRow?.symbol ?? payload.rows[0]?.symbol ?? null);
  }, [payload, selectedSymbol]);

  if (loading) {
    if (!showLoading) return null;
    return (
      <div className={styles.page}>
        <section className={styles.metricGrid}>
          <LoadingSkeletonCard title={tr("Average change")} lines={3} compact />
          <LoadingSkeletonCard title={tr("NIFTY change")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Range")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Rows")} lines={3} compact />
        </section>
        <LoadingSkeletonCard title={tr("Sector heatmap")} lines={8} />
      </div>
    );
  }

  if (surface.error || !surface.data) {
    return (
      <DataState
        kind="error"
        title={tr("The market heatmap is unavailable")}
        body={tr("The live percent-change map could not load. Refresh and try again.")}
      />
    );
  }
  if (!payload) {
    return (
      <DataState
        kind="error"
        title={tr("The market heatmap is unavailable")}
        body={tr("The latest heatmap data could not load. Refresh and try again.")}
      />
    );
  }
  const highestChange = [...payload.rows].sort((a, b) => b.latestChangePct - a.latestChangePct).slice(0, 3);
  const lowestChange = [...payload.rows].sort((a, b) => a.latestChangePct - b.latestChangePct).slice(0, 3);
  const sectorOptions = ["all", ...rawPayload!.sectors.map((item) => item.sector)];

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title="% Change Heatmap"
        meta={`${tr("Rows")} ${formatNumber(payload.rows.length, { maximumFractionDigits: 0 })} • ${tr("Updated")} ${formatDateIST(payload.asOf, { includeTime: true })}`}
        subtitle={tr("Read sector pressure and broad participation before you drill into individual stocks.")}
        sectionTabs={[...MARKET_SECTION_TABS]}
        learningPrompt={tr("This page answers one question: where is strength or weakness concentrated right now, and is it broad enough to matter?")}
      />

      <section className={styles.metricGrid}>
        <KpiCard
          label={selectedSector === "all" ? tr("Avg % change") : `${selectedSector} ${tr("avg")}`}
          value={fmtRawPct(payload.stats.universeAvgChangePct)}
          meta={tr("Average intraday move in the current filtered universe.")}
          tone={changeTone(payload.stats.universeAvgChangePct) === "up" ? "green" : changeTone(payload.stats.universeAvgChangePct) === "down" ? "red" : "white"}
        />
        <KpiCard
          label={tr("NIFTY % change")}
          value={fmtRawPct(payload.stats.niftyChangePct)}
          meta={tr("Use this to compare the filtered view with the broad index.")}
          tone={changeTone(payload.stats.niftyChangePct) === "up" ? "green" : changeTone(payload.stats.niftyChangePct) === "down" ? "red" : "white"}
        />
        <KpiCard
          label={tr("Range")}
          value={`${fmtRawPct(payload.stats.min)} to ${fmtRawPct(payload.stats.max)}`}
          meta={tr("Raw range today. Display colors stay clamped to -2% to +2% so different sessions remain comparable.")}
        />
        <KpiCard
          label={tr("Rows")}
          value={payload.rows.length.toString()}
          meta={tr("Total symbols in the current heatmap filter.")}
        />
      </section>

      <ChartCard
        title={tr("Sector heatmap")}
        subtitle={tr("Filter the map by sector if you want to see whether leadership is broad or concentrated.")}
        meta={
          <div className={styles.filterRow}>
            <input
              type="search"
              value={symbolQuery}
              onChange={(event) => setSymbolQuery(event.currentTarget.value)}
              className={styles.searchInput}
              placeholder={tr("Search symbol")}
              aria-label={tr("Search heatmap symbols")}
            />
            {sectorOptions.slice(0, 10).map((sector) => (
              <ButtonButton
                key={sector}
                size="s"
                variant={selectedSector === sector ? "primary" : "secondary"}
                tone={
                  selectedSector === sector
                    ? sector === "all"
                      ? "white"
                      : "green"
                    : "white"
                }
                onClick={() => {
                  void trackFilterChanged({
                    filter_name: "sector",
                    filter_value: sector,
                    surface: "change"
                  });
                  setSelectedSector(sector);
                }}
              >
                {sector === "all" ? tr("All sectors") : sector}
              </ButtonButton>
            ))}
          </div>
        }
        footer={tr("White means near-flat, green means positive pressure, and red means negative pressure. Use the strips below as inspection lists, not automatic trades.")}
      >
        <section className={styles.infoMetrics}>
          <div className={styles.metricChip} data-tone="up">
            <span>{tr("Positive")}</span>
            <strong>{payload.rows.filter((row) => row.latestChangePct > 0.25).length}</strong>
          </div>
          <div className={styles.metricChip}>
            <span>{tr("Near flat")}</span>
            <strong>{payload.rows.filter((row) => row.latestChangePct >= -0.25 && row.latestChangePct <= 0.25).length}</strong>
          </div>
          <div className={styles.metricChip} data-tone="down">
            <span>{tr("Negative")}</span>
            <strong>{payload.rows.filter((row) => row.latestChangePct < -0.25).length}</strong>
          </div>
        </section>
        <section className={styles.heatmapPanel}>
          <ChangeHeatmap payload={payload} selectedSymbol={selectedSymbol} onSelectSymbol={setSelectedSymbol} />
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
                  <span>{tr("Latest")}</span>
                  <strong data-tone={changeTone(detailEntry.row.latestChangePct)}>{fmtRawPct(detailEntry.row.latestChangePct)}</strong>
                </div>
                <div className={styles.detailStat}>
                  <span>{tr("Price")}</span>
                  <strong>{formatCurrencyINR(detailEntry.row.last, false, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>
              </div>
            </div>
            <div className={styles.detailSparkWrap}>
              <HeatmapTrend values={detailEntry.values} />
              <div className={styles.detailSparkCaption}>{tr("Intraday change path for the selected row. Use this with Market Story before treating a sharp move as durable.")}</div>
            </div>
            <div className={styles.detailLinks}>
              <Link to={`/analytics/stock/${encodeURIComponent(detailEntry.row.symbol)}`} className={styles.detailLink}>{tr("Open stock detail")}</Link>
              <Link to="/analytics/signal/rsi" className={styles.detailLink}>{tr("Check RSI map")}</Link>
              <Link to="/analytics/regime" className={styles.detailLink}>{tr("Recheck Market Story")}</Link>
            </div>
          </section>
        ) : null}
        <section className={styles.infoBar}>
          <div className={styles.infoExtremes}>
            <ExtremesStrip title={tr("Bottom 3")} items={lowestChange} tone="down" />
            <ExtremesStrip title={tr("Top 3")} items={highestChange} tone="up" />
          </div>
          <HeatmapLegend metric="change" />
        </section>
      </ChartCard>

      <PageIntroAccordion
        label={tr("How to read this heatmap")}
        title={tr("Scan the map first, then use the chips and legend to explain what you saw.")}
        body={tr("Use the average change first, then the range, then the top and bottom rows. This view teaches whether the move is broad, narrow, or heavily concentrated.")}
        widgetId="heatmap_change_help"
        items={[
          tr("Raw range can be wider than the color legend. The display stays clamped so sessions remain comparable."),
          tr("Use the search box when you want to confirm whether a specific name is participating."),
          tr("Top and bottom chips are inspection lists, not instructions.")
        ]}
      />
    </div>
  );
}
