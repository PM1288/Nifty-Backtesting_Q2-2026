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
import { WillHeatmap } from "../components/visual/WillHeatmap";
import { useI18n } from "../i18n/LocaleProvider";
import { formatDateIST, formatNumber, formatTime } from "../lib/format";
import { useWillSurface } from "../lib/hooks";
import { useDeferredBusyState } from "../lib/useDeferredBusyState";
import type { WillSurfaceResponse, WillSurfaceRow } from "../lib/types";
import { AnalyticsHeader, ExplainThis, SIGNAL_SECTION_TABS } from "./AnalyticsChrome";
import styles from "./RsiSurfacePage.module.css";

function fmtNumber(value: number | null | undefined, digits = 1): string {
  return formatNumber(value, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function willTone(value: number | null | undefined): "up" | "down" | "flat" {
  if (value == null || !Number.isFinite(value)) return "flat";
  if (value >= -20) return "up";
  if (value <= -80) return "down";
  return "flat";
}

function ExtremesStrip({
  title,
  items,
  tone
}: {
  title: string;
  items: WillSurfaceRow[];
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
            <span className={styles.extremeValue}>{fmtNumber(item.latestWillr)}</span>
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
        return `${tr("Step")} ${items[0]?.axisValue ?? ""}<br/>WILLR: ${fmtNumber(items[0]?.value ?? null)}`;
      }
    },
    xAxis: {
      type: "category",
      name: tr("Time"),
      data: normalized.map((_, index) => `${index + 1}`)
    },
    yAxis: {
      type: "value",
      name: "WILLR",
      min: -100,
      max: 0
    },
    series: [
      {
        type: "line",
        smooth: true,
        showSymbol: false,
        lineStyle: { color: "#ff7b72", width: 2.5 },
        markLine: {
          symbol: "none",
          data: [{ yAxis: -80 }, { yAxis: -50 }, { yAxis: -20 }],
          lineStyle: { color: "rgba(230, 237, 243, 0.28)", type: "dashed" }
        },
        data: normalized
      }
    ]
  };
  return <EChartSurface ariaLabel="Focused WILLR trend chart" className={styles.chartSurface} option={option} />;
}

export function WillSurfacePage() {
  const { authReady } = useAuthGate();
  const { tr } = useI18n();
  const surface = useWillSurface(authReady);
  usePageLoadProfile({
    pageName: "will_surface",
    enabled: authReady,
    queries: [{ name: "will-surface", isLoading: surface.isLoading, isError: !!surface.error }]
  });
  const loading = !authReady || (!surface.data && surface.isLoading);
  useDeferredBusyState(loading);
  const [selectedSector, setSelectedSector] = useState<string>("all");
  const [symbolQuery, setSymbolQuery] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const rawPayload = surface.data;
  const payload = useMemo<WillSurfaceResponse | null>(() => {
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
    const latestValues = rows.map((row) => row.latestWillr).filter(Number.isFinite);
    return {
      ...rawPayload,
      rows,
      sectors: selectedSector === "all" ? rawPayload.sectors : rawPayload.sectors.filter((item) => item.sector === selectedSector),
      values,
      stats: {
        ...rawPayload.stats,
        min: latestValues.length ? Math.min(...latestValues) : rawPayload.stats.min,
        max: latestValues.length ? Math.max(...latestValues) : rawPayload.stats.max,
        universeAvgWillr: latestValues.length
          ? latestValues.reduce((sum, value) => sum + value, 0) / latestValues.length
          : rawPayload.stats.universeAvgWillr
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
    const topRow = [...payload.rows].sort((a, b) => b.latestWillr - a.latestWillr)[0];
    setSelectedSymbol(topRow?.symbol ?? payload.rows[0]?.symbol ?? null);
  }, [payload, selectedSymbol]);

  if (loading) {
    return (
      <div className={styles.page}>
        <section className={styles.summaryGrid}>
          <LoadingSkeletonCard title={tr("Universe average")} lines={3} compact />
          <LoadingSkeletonCard title={tr("NIFTY WILLR")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Range")} lines={3} compact />
          <LoadingSkeletonCard title={tr("Rows")} lines={3} compact />
        </section>
        <LoadingSkeletonCard title={tr("WILLR heatmap")} lines={8} />
      </div>
    );
  }

  if (surface.error || !surface.data) {
    return (
      <ErrorState
        title={tr("The WILLR map is unavailable")}
        body={tr("The oscillator surface could not load. Check the signal feed and try again.")}
      />
    );
  }
  if (!payload) {
    return (
      <ErrorState
        title={tr("The WILLR map is unavailable")}
        body={tr("The latest WILLR heatmap data could not load. Refresh and try again.")}
      />
    );
  }
  const highestWillr = [...payload.rows].sort((a, b) => b.latestWillr - a.latestWillr).slice(0, 3);
  const lowestWillr = [...payload.rows].sort((a, b) => a.latestWillr - b.latestWillr).slice(0, 3);
  const sectorOptions = ["all", ...rawPayload!.sectors.map((item) => item.sector)];

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title={tr("WILLR Heatmap")}
        meta={`${tr("Rows")} ${formatNumber(payload.rows.length, { maximumFractionDigits: 0 })} • ${tr("Updated")} ${formatDateIST(payload.asOf, { includeTime: true })}`}
        subtitle={tr("WILLR map. Use this to scan which names are near the hot or cold ends of their short-term range.")}
        sectionTabs={[...SIGNAL_SECTION_TABS]}
        learningPrompt={tr("This page answers one question: which names are sitting near the top or bottom of their recent range right now?")}
      />

      <section className={styles.infoBar}>
        <div className={styles.infoMetrics}>
          <div className={styles.metricChip} data-tone="down">
            <span>{tr("Below -80")}</span>
            <strong>{payload.rows.filter((row) => row.latestWillr < -80).length}</strong>
          </div>
          <div className={styles.metricChip} data-tone="down">
            <span>{tr("-80 to -50")}</span>
            <strong>{payload.rows.filter((row) => row.latestWillr >= -80 && row.latestWillr < -50).length}</strong>
          </div>
          <div className={styles.metricChip}>
            <span>{tr("-50 to -30")}</span>
            <strong>{payload.rows.filter((row) => row.latestWillr >= -50 && row.latestWillr < -30).length}</strong>
          </div>
          <div className={styles.metricChip} data-tone="up">
            <span>{tr("-30 to 0")}</span>
            <strong>{payload.rows.filter((row) => row.latestWillr >= -30).length}</strong>
          </div>
        </div>
        <div className={styles.chartCaption}>
          {tr("Values near 0 mean price is near the top of its recent range. Values near -100 mean price is near the bottom.")}
        </div>
      </section>

      <section className={styles.summaryGrid}>
        <KpiCard
          label={tr("Universe average")}
          value={fmtNumber(payload.stats.universeAvgWillr)}
          meta={tr("Average Williams %R across the tracked universe.")}
          tone={willTone(payload.stats.universeAvgWillr) === "up" ? "green" : willTone(payload.stats.universeAvgWillr) === "down" ? "red" : "white"}
        />
        <KpiCard
          label={tr("NIFTY WILLR")}
          value={fmtNumber(payload.stats.niftyWillr)}
          meta={tr("Headline range pressure compared with individual stocks.")}
          tone={willTone(payload.stats.niftyWillr) === "up" ? "green" : willTone(payload.stats.niftyWillr) === "down" ? "red" : "white"}
        />
        <KpiCard
          label={tr("Range")}
          value={`${fmtNumber(payload.stats.min)} to ${fmtNumber(payload.stats.max)}`}
          meta={tr("Visible spread from the coldest to the hottest reading.")}
        />
        <KpiCard
          label={tr("Rows")}
          value={payload.rows.length}
          meta={tr("Tracked names included in this scan.")}
        />
      </section>

      <ChartCard
        title={tr("WILLR heatmap")}
        subtitle={`${tr("Session")} ${formatTime(payload.session.start, { hour12: false })} ${tr("to")} ${formatTime(payload.session.end, { hour12: false })}. ${tr("Left-to-right is time. Compare row color and the latest WILLR column to judge range pressure.")}`}
        meta={
          <div className={styles.filterRow}>
            <input
              type="search"
              value={symbolQuery}
              onChange={(event) => setSymbolQuery(event.currentTarget.value)}
              className={styles.searchInput}
              placeholder={tr("Search symbol")}
              aria-label={tr("Search WILLR symbols")}
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
                    surface: "willr"
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
            <div className={styles.infoExtremes}>
              <ExtremesStrip title="Bottom 3" items={lowestWillr} tone="down" />
              <ExtremesStrip title="Top 3" items={highestWillr} tone="up" />
            </div>
            <HeatmapLegend metric="willr" />
          </div>
        }
      >
        <section className={styles.heatmapPanel}>
          <WillHeatmap payload={payload} selectedSymbol={selectedSymbol} onSelectSymbol={setSelectedSymbol} />
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
                  <span>{tr("Latest WILLR")}</span>
                  <strong data-tone={willTone(detailEntry.row.latestWillr)}>{fmtNumber(detailEntry.row.latestWillr)}</strong>
                </div>
                <div className={styles.detailStat}>
                  <span>{tr("% change")}</span>
                  <strong>{fmtNumber(detailEntry.row.changePct, 2)}</strong>
                </div>
              </div>
            </div>
            <div className={styles.detailSparkWrap}>
              <HeatmapTrend values={detailEntry.values} />
              <div className={styles.detailSparkCaption}>{tr("Selected row Williams %R across the session. Use it to judge whether range pressure is building, fading, or staying pinned.")}</div>
            </div>
            <div className={styles.detailLinks}>
              <Link to={`/analytics/stock/${encodeURIComponent(detailEntry.row.symbol)}`} className={styles.detailLink}>{tr("Open stock detail")}</Link>
              <Link to="/analytics/signal/rsi" className={styles.detailLink}>{tr("Compare RSI")}</Link>
              <Link to="/analytics/learn" className={styles.detailLink}>{tr("Open Strategy Lab")}</Link>
            </div>
          </section>
        ) : null}
      </ChartCard>

      <section className={styles.summaryGrid}>
        <PageIntroAccordion
          label={tr("How to use WILLR here")}
          title={tr("Read the range-pressure map first, then explain the extremes.")}
          body={tr("Read this as a range-pressure map, not a standalone trade engine. Pair extreme readings with breadth, volume quality, and stock context.")}
        widgetId="heatmap_willr_help"
        items={[
            tr("Use the native -100 to 0 range model before you judge any single row."),
            tr("Values near 0 mean price is pressing the top of its range. Values near -100 mean it is pressing the bottom."),
            tr("Treat unstable sessions as watchlist-only until quality confirms the move.")
          ]}
        />
        <ExplainThis
          label={tr("Williams %R extremes")}
          summary={tr("Williams %R shows where price sits inside its recent range.")}
          detail={tr("Readings near the top of the range mean stronger pressure, and readings near the bottom mean weaker pressure. Extremes are context, not a full setup.")}
          takeaway={tr("Pair WILLR extremes with breadth and stock quality before you trust them.")}
        />
        <ExplainThis
          label={tr("WILLR vs RSI")}
          summary={tr("RSI measures momentum force. Williams %R measures where price sits inside its recent range.")}
          detail={tr("That is why both pages can look similar structurally but answer different questions. RSI is about pressure over the lookback window, while WILLR is about position inside the recent high-low envelope.")}
          takeaway={tr("Use WILLR for range pressure and RSI for momentum pressure. Neither is a standalone timing command.")}
        />
      </section>
    </div>
  );
}
