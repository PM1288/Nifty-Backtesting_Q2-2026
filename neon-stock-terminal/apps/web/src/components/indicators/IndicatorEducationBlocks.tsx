import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { EChartsOption } from "echarts";
import {
  ChartCard,
  DataTable,
  KpiCard,
  PageIntroAccordion,
  PlainLanguageCard,
  StatusBadge,
  ButtonButton,
  ButtonLink
} from "../ui/DashboardPrimitives";
import { EChartSurface } from "../visual/EChartSurface";
import { useI18n } from "../../i18n/LocaleProvider";
import {
  fmtDecimal,
  fmtPct,
  fmtPrice,
  fmtWholeNumber,
  formatDateTime,
  formatDurationDays,
  formatNumber,
  formatPercent
} from "../../lib/format";
import type {
  CapitalDeploymentPoint,
  DistributionBucket,
  DrawdownPoint,
  EquityCurvePoint,
  ForwardReturnHeatmapCell,
  IndicatorBandCount,
  IndicatorChartLabels,
  IndicatorCurrentLeader,
  IndicatorCurrentStatusSummary,
  IndicatorEducationResponse,
  IndicatorGlossaryTerm,
  IndicatorSectorSnapshot,
  IndicatorStatusMetric,
  IndicatorStockResultRow,
  IndicatorStrategyOpenPosition,
  IndicatorStrategyPerStockRow,
  IndicatorStrategyScenario,
  IndicatorThresholdBand
} from "../../lib/types";
import styles from "./IndicatorEducationBlocks.module.css";

const CHART_SANS = `"Inter Variable", "Inter", ui-sans-serif, system-ui, sans-serif`;
const CHART_MONO = `"IBM Plex Mono", "Inter Variable", ui-monospace, monospace`;

function chartTextStyle() {
  return { color: "rgba(255, 255, 255, 0.78)", fontFamily: CHART_SANS };
}

function axisLabel(fontFamily = CHART_SANS) {
  return { color: "rgba(255, 255, 255, 0.68)", fontFamily, fontSize: 11, hideOverlap: true };
}

function chartTooltip() {
  return {
    trigger: "axis" as const,
    backgroundColor: "#050607",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    textStyle: { color: "#ffffff", fontFamily: CHART_SANS, fontSize: 11 }
  };
}

function formatAsOfLabel(label: string, value: string) {
  if (!value) return label;
  const parsed = new Date(value);
  return `${label}: ${Number.isNaN(parsed.getTime()) ? value : formatDateTime(parsed.toISOString())}`;
}

function toneFromPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "white";
  if (value > 0) return "green";
  if (value < 0) return "red";
  return "white";
}

function formatCurrency(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `₹${fmtWholeNumber(value)}`;
}

function formatStrategyValue(value: number | null | undefined, mode: "currency" | "index") {
  if (value == null || !Number.isFinite(value)) return "—";
  return mode === "currency" ? formatCurrency(value) : fmtDecimal(value, 2);
}

type IndicatorChartUiLabels = {
  dateAxis: string;
  entry: string;
  exit: string;
  sample: string;
  hitRate: string;
  forwardWindow: string;
  heatmapScaleAria: string;
  negativeForwardReturn: string;
  averageForwardReturnScale: string;
  positiveForwardReturn: string;
  strategySeries: string;
  buyAndHoldSeries: string;
  openPositions: string;
  deployedCapital: string;
  unrealizedReturn: string;
  symbolAxis: string;
  unrealizedPercentAxis: string;
};

function buildIndicatorChartUiLabels(tr: (value: string) => string): IndicatorChartUiLabels {
  return {
    dateAxis: tr("Date"),
    entry: tr("Entry"),
    exit: tr("Exit"),
    sample: tr("Sample"),
    hitRate: tr("Hit rate"),
    forwardWindow: tr("Forward window"),
    heatmapScaleAria: tr("Forward return color scale"),
    negativeForwardReturn: tr("Negative forward return"),
    averageForwardReturnScale: tr("Average forward-return scale"),
    positiveForwardReturn: tr("Positive forward return"),
    strategySeries: tr("Strategy"),
    buyAndHoldSeries: tr("Buy and hold"),
    openPositions: tr("Open positions"),
    deployedCapital: tr("Deployed capital"),
    unrealizedReturn: tr("Unrealized return"),
    symbolAxis: tr("Symbol"),
    unrealizedPercentAxis: tr("Unrealized %")
  };
}

function extractHeatmapTuple(params: unknown) {
  if (params && typeof params === "object") {
    const item = params as { data?: unknown; value?: unknown };
    if (Array.isArray(item.data)) return item.data;
    if (Array.isArray(item.value)) return item.value;
  }
  return [];
}

function StatGrid({ metrics }: { metrics: IndicatorStatusMetric[] }) {
  const { tr } = useI18n();
  return (
    <div className={styles.metricGrid}>
      {metrics.map((metric) => (
        <KpiCard key={metric.label} label={metric.label} value={metric.value} meta={metric.helper} tone={metric.tone} />
      ))}
    </div>
  );
}

function LeaderList({
  title,
  rows,
  deltaLabel,
  onStockSelect
}: {
  title: string;
  rows: IndicatorCurrentLeader[];
  deltaLabel?: string;
  onStockSelect?: (symbol: string) => void;
}) {
  return (
    <div className={styles.infoListCard}>
      <h3 className={styles.cardHeading}>{title}</h3>
      <div className={styles.infoList}>
        {rows.map((row) => (
          <div key={`${title}-${row.symbol}`} className={styles.infoRow}>
            <div className={styles.infoCopy}>
              {onStockSelect ? (
                <button type="button" className={styles.stockButton} onClick={() => onStockSelect(row.symbol)}>
                  {row.symbol}
                </button>
              ) : (
                <strong>{row.symbol}</strong>
              )}
              <span>{row.sector}</span>
            </div>
            <div className={styles.infoValues}>
              <strong>{fmtDecimal(row.currentValue, 1)}</strong>
              <span data-tone={row.tone}>
                {deltaLabel && row.delta != null ? `${deltaLabel} ${fmtDecimal(row.delta, 1)}` : fmtPct(row.changePct)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectorList({ title, rows }: { title: string; rows: IndicatorSectorSnapshot[] }) {
  const { tr } = useI18n();
  return (
    <div className={styles.infoListCard}>
      <h3 className={styles.cardHeading}>{title}</h3>
      <div className={styles.infoList}>
        {rows.map((row) => (
          <div key={`${title}-${row.sector}`} className={styles.infoRow}>
            <div className={styles.infoCopy}>
              <strong>{row.sector}</strong>
              <span>{formatNumber(row.count, { maximumFractionDigits: 0 })} {tr("names")}</span>
            </div>
            <div className={styles.infoValues}>
              <strong>{fmtDecimal(row.avgValue, 1)}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type IndicatorChartFrameProps = {
  title: string;
  subtitle?: string;
  helperText: string;
  asOfLabel: string;
  isLoading?: boolean;
  isStale?: boolean;
  isEmpty?: boolean;
  action?: ReactNode;
  children: ReactNode;
};

function IndicatorChartFrame({
  title,
  subtitle,
  helperText,
  asOfLabel,
  isLoading = false,
  isStale = false,
  isEmpty = false,
  action,
  children
}: IndicatorChartFrameProps) {
  const { tr } = useI18n();
  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      meta={
        <div className={styles.metaStack}>
          <StatusBadge label={asOfLabel} tone="white" />
          <StatusBadge label={tr("Daily data only")} tone="white" />
          {isStale ? <StatusBadge label={tr("Stale data")} tone="red" /> : null}
        </div>
      }
      action={action}
      footer={
        <div className={styles.helperBox}>
          <strong>{tr("What this chart shows")}</strong>
          <span>{tr(helperText)}</span>
        </div>
      }
    >
      {isLoading ? (
        <div className={styles.chartState}>
          <strong>{tr("Loading chart")}</strong>
          <span>{tr("Preparing the indicator evidence.")}</span>
        </div>
      ) : isEmpty ? (
        <div className={styles.chartState}>
          <strong>{tr("No chart data available")}</strong>
          <span>{tr("There is not enough data to render this chart right now.")}</span>
        </div>
      ) : (
        <>
          {isStale ? (
            <div className={styles.staleBanner}>
              <strong>{tr("Evidence is stale")}</strong>
              <span>{tr("This chart is using older data than usual. Treat it as historical context until the next refresh lands.")}</span>
            </div>
          ) : null}
          {children}
        </>
      )}
    </ChartCard>
  );
}

type ChartRangeKey = "6m" | "1y" | "3y" | "all";

const CHART_RANGE_OPTIONS: Array<{ key: ChartRangeKey; label: string }> = [
  { key: "6m", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "3y", label: "3Y" },
  { key: "all", label: "All" }
];

function sliceSeriesByRange<T extends { date: string }>(points: T[], range: ChartRangeKey) {
  if (range === "all" || points.length <= 2) return points;
  const lastDate = new Date(points[points.length - 1]?.date ?? "");
  if (Number.isNaN(lastDate.getTime())) return points;
  const next = new Date(lastDate);
  if (range === "6m") next.setMonth(next.getMonth() - 6);
  if (range === "1y") next.setFullYear(next.getFullYear() - 1);
  if (range === "3y") next.setFullYear(next.getFullYear() - 3);
  return points.filter((point) => {
    const date = new Date(point.date);
    return Number.isNaN(date.getTime()) ? true : date >= next;
  });
}

function ChartRangeSelector({
  value,
  onChange
}: {
  value: ChartRangeKey;
  onChange: (next: ChartRangeKey) => void;
}) {
  return (
    <div className={styles.chartRangeSelector}>
      {CHART_RANGE_OPTIONS.map((option) => (
        <ButtonButton
          key={option.key}
          size="s"
          variant={option.key === value ? "primary" : "secondary"}
          tone={option.key === value ? "green" : "white"}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </ButtonButton>
      ))}
    </div>
  );
}

export function IndicatorHero({ indicator, activeSlug }: { indicator: IndicatorEducationResponse; activeSlug: string }) {
  const { tr } = useI18n();
  return (
    <section className={styles.heroGrid}>
      <div className={styles.heroPrimary}>
        <div className={styles.eyebrowRow}>
          <span className={styles.eyebrow}>{tr("Indicator template")}</span>
          <StatusBadge label={formatAsOfLabel(tr("Last market date"), indicator.freshness.lastMarketDate)} tone="white" />
        </div>
        <h2 className={styles.heroTitle}>{indicator.displayName}</h2>
        <p className={styles.heroSummary}>{tr(indicator.oneLineSummary)}</p>
        <p className={styles.heroBody}>{tr(indicator.formulaText)}</p>
        <div className={styles.heroMetaGrid}>
          <div className={styles.metaTile}>
            <span>{tr("Snapshot generated")}</span>
            <strong>{formatDateTime(indicator.freshness.snapshotGeneratedAt, { includeTime: true })}</strong>
          </div>
          <div className={styles.metaTile}>
            <span>{tr("Evidence window")}</span>
            <strong>{tr(indicator.freshness.evidenceRangeLabel)}</strong>
          </div>
        </div>
        <div className={styles.selectorRow}>
          {indicator.availableIndicators.map((item) =>
            item.slug === activeSlug ? (
              <span key={item.slug} className={styles.selectorPill} data-active="true">
                {item.displayName}
              </span>
            ) : (
              <ButtonLink key={item.slug} to={`/analytics/indicators/${item.slug}`} size="s">
                {item.displayName}
              </ButtonLink>
            )
          )}
        </div>
      </div>
      <div className={styles.heroSide}>
        <PlainLanguageCard
          title={tr("What the indicator is")}
          body={indicator.whatItIs[0] ? tr(indicator.whatItIs[0]) : tr(indicator.shortDescription)}
          secondaryTitle={tr("How to read it")}
          secondaryBody={indicator.howToRead[0] ? tr(indicator.howToRead[0]) : tr(indicator.shortDescription)}
        />
        <div className={styles.glossaryCard}>
          <h3 className={styles.cardHeading}>{tr("Glossary")}</h3>
          <div className={styles.glossaryList}>
            {indicator.glossaryTerms.map((term: IndicatorGlossaryTerm) => (
              <div key={term.term} className={styles.glossaryRow}>
                <strong>{term.term}</strong>
                <span>{tr(term.definition)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ThresholdGuideTable({ bands }: { bands: IndicatorThresholdBand[] }) {
  const { tr } = useI18n();
  return (
    <DataTable
      title={tr("Threshold guide")}
      subtitle={tr("Use the same thresholds everywhere so the page teaches one stable language.")}
      rows={bands}
      columns={[
        { key: "label", header: tr("Band"), cell: (row) => tr(row.label) },
        { key: "range", header: tr("Range"), cell: (row) => tr(row.rangeLabel), align: "center" },
        { key: "meaning", header: tr("Interpretation"), cell: (row) => tr(row.interpretation) }
      ]}
      emptyTitle={tr("No threshold bands configured")}
      emptyBody={tr("Add threshold metadata in the indicator registry to populate this guide.")}
      tableName="indicator-threshold-guide"
    />
  );
}

export function CurrentStatusSummary({
  summary,
  onStockSelect
}: {
  summary: IndicatorCurrentStatusSummary;
  onStockSelect?: (symbol: string) => void;
}) {
  const { tr } = useI18n();
  return (
    <section className={styles.stackSection}>
      <div className={styles.summaryGrid}>
        <PlainLanguageCard
          title={tr("What the indicator is saying today")}
          body={tr(summary.narrative)}
          secondaryTitle={tr("Last updated")}
          secondaryBody={summary.lastUpdatedDate ?? summary.tradeDate}
        />
        <div className={styles.bandCard}>
          <h3 className={styles.cardHeading}>{tr("Bucket counts today")}</h3>
          <div className={styles.bandList}>
            {summary.bandCounts.map((band: IndicatorBandCount) => (
              <div key={band.key} className={styles.bandRow}>
                <div className={styles.bandCopy}>
                  <strong>{tr(band.label)}</strong>
                  <span>{band.count} {tr("names")}</span>
                </div>
                <div className={styles.bandValue}>
                  <span>{fmtDecimal(band.sharePct, 1)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <StatGrid metrics={summary.metrics} />
      <div className={styles.summaryGrid}>
        <LeaderList title={tr("Current oversold names")} rows={summary.oversoldNames} onStockSelect={onStockSelect} />
        <LeaderList title={tr("Current overbought names")} rows={summary.overboughtNames} onStockSelect={onStockSelect} />
      </div>
      <div className={styles.summaryGrid}>
        <LeaderList title={tr("Strongest recoveries / reversals")} rows={summary.strongestReversals} deltaLabel={tr("RSI change")} onStockSelect={onStockSelect} />
        <LeaderList title={tr("Highest readings")} rows={summary.strongestReadings} onStockSelect={onStockSelect} />
      </div>
      <div className={styles.summaryGrid}>
        <SectorList title={tr("Strongest sectors")} rows={summary.sectorLeaders} />
        <SectorList title={tr("Weakest sectors")} rows={summary.sectorLaggards} />
      </div>
    </section>
  );
}

function priceIndicatorOption({
  series,
  leftName,
  rightName,
  rightMin,
  rightMax,
  thresholdLines,
  entryMarkers,
  exitMarkers,
  uiLabels
}: {
  series: Array<{ date: string; price: number; indicatorValue: number | null }>;
  leftName: string;
  rightName: string;
  rightMin?: number;
  rightMax?: number;
  thresholdLines?: number[];
  entryMarkers?: Array<{ date: string; price: number | null; label: string }>;
  exitMarkers?: Array<{ date: string; price: number | null; label: string }>;
  uiLabels: IndicatorChartUiLabels;
}): EChartsOption {
  return {
    textStyle: chartTextStyle(),
    tooltip: chartTooltip(),
    legend: {
      top: 8,
      left: "center",
      data: [leftName, rightName, uiLabels.entry, uiLabels.exit],
      textStyle: { color: "rgba(255,255,255,0.78)", fontFamily: CHART_SANS }
    },
    grid: { top: 82, right: 18, bottom: 52, left: 18, containLabel: true },
    xAxis: {
      type: "category",
      data: series.map((point) => point.date),
      name: uiLabels.dateAxis,
      axisLabel: axisLabel(),
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } }
    },
    yAxis: [
      {
        type: "value",
        name: leftName,
        axisLabel: axisLabel(CHART_MONO),
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } }
      },
      {
        type: "value",
        name: rightName,
        min: rightMin,
        max: rightMax,
        axisLabel: axisLabel(CHART_MONO),
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: leftName,
        type: "line",
        smooth: true,
        symbol: "none",
        data: series.map((point) => point.price),
        lineStyle: { width: 2, color: "#ffffff" }
      },
      {
        name: rightName,
        type: "line",
        smooth: true,
        symbol: "none",
        yAxisIndex: 1,
        data: series.map((point) => point.indicatorValue),
        lineStyle: { width: 2, color: "#00ff66" },
        markLine: thresholdLines?.length
          ? {
              symbol: ["none", "none"],
              lineStyle: { type: "dashed", color: "rgba(212, 175, 55, 0.55)" },
              label: { color: "rgba(255,255,255,0.68)", fontFamily: CHART_SANS },
              data: thresholdLines.map((value) => ({ yAxis: value }))
            }
          : undefined
      },
      {
        name: uiLabels.entry,
        type: "scatter",
        symbolSize: 10,
        itemStyle: { color: "#00ff66" },
        data: (entryMarkers ?? []).filter((marker) => marker.price != null).map((marker) => [marker.date, marker.price, marker.label])
      },
      {
        name: uiLabels.exit,
        type: "scatter",
        symbolSize: 10,
        itemStyle: { color: "#ff4d6d" },
        data: (exitMarkers ?? []).filter((marker) => marker.price != null).map((marker) => [marker.date, marker.price, marker.label])
      }
    ]
  };
}

function heatmapOption(cells: ForwardReturnHeatmapCell[], labels: IndicatorChartLabels, uiLabels: IndicatorChartUiLabels): EChartsOption {
  const horizonLabels = [...new Set(cells.map((cell) => `${cell.horizonDays}d`))];
  const bandLabels = [...new Set(cells.map((cell) => cell.bandLabel))];
  const values = cells
    .filter((cell) => cell.avgReturnPct != null)
    .map((cell) => [
      horizonLabels.indexOf(`${cell.horizonDays}d`),
      bandLabels.indexOf(cell.bandLabel),
      Number(cell.avgReturnPct),
      cell.sampleSize,
      cell.hitRatePct == null ? null : Number(cell.hitRatePct.toFixed(1))
    ]);
  const maxAbs = Math.max(2, ...values.map((value) => Math.abs(Number(value[2] ?? 0))));

  return {
    textStyle: chartTextStyle(),
    tooltip: {
      ...chartTooltip(),
      trigger: "item",
      formatter: (params) => {
        const data = extractHeatmapTuple(params);
        const horizonLabel = horizonLabels[Number(data[0] ?? 0)] ?? "";
        const bandLabel = bandLabels[Number(data[1] ?? 0)] ?? "";
        return [
          `<strong>${bandLabel}</strong>`,
          `${horizonLabel}: ${fmtPct(Number(data[2] ?? 0))}`,
          `${uiLabels.sample}: ${formatNumber(Number(data[3] ?? 0), { maximumFractionDigits: 0 })}`,
          `${uiLabels.hitRate}: ${data[4] == null ? "—" : formatPercent(Number(data[4]), 1, false)}`
        ].join("<br/>");
      }
    },
    grid: { top: 42, right: 18, bottom: 78, left: 18, containLabel: true },
    xAxis: { type: "category", data: horizonLabels, name: uiLabels.forwardWindow, axisLabel: axisLabel() },
    yAxis: { type: "category", data: bandLabels, axisLabel: axisLabel() },
    visualMap: {
      min: -maxAbs,
      max: maxAbs,
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 10,
      itemWidth: 112,
      itemHeight: 9,
      textGap: 8,
      text: [`+${labels.heatmapLegend}`, `-${labels.heatmapLegend}`],
      inRange: { color: ["#ff0033", "#0f1318", "#00ff66"] },
      textStyle: { color: "rgba(255,255,255,0.66)", fontFamily: CHART_SANS, fontSize: 10 }
    },
    series: [{ type: "heatmap", data: values, label: { show: true, color: "#ffffff", fontSize: 11, fontFamily: CHART_MONO, formatter: (params) => fmtPct(Number(extractHeatmapTuple(params)[2] ?? 0)) } }]
  };
}

function HeatmapScaleLegend({ labels, uiLabels }: { labels: IndicatorChartLabels; uiLabels: IndicatorChartUiLabels }) {
  return (
    <div className={styles.heatmapScale} aria-label={uiLabels.heatmapScaleAria}>
      <div className={styles.heatmapScaleHeader}>
        <span>{uiLabels.negativeForwardReturn}</span>
        <span>{uiLabels.averageForwardReturnScale}</span>
        <span>{uiLabels.positiveForwardReturn}</span>
      </div>
      <div className={styles.heatmapScaleBar} aria-hidden="true" />
      <div className={styles.heatmapScaleTicks}>
        <span>{`-${labels.heatmapLegend}`}</span>
        <span>0%</span>
        <span>{`+${labels.heatmapLegend}`}</span>
      </div>
    </div>
  );
}

function barOption(data: DistributionBucket[], axisName: string): EChartsOption {
  return {
    textStyle: chartTextStyle(),
    tooltip: chartTooltip(),
    grid: { top: 24, right: 18, bottom: 54, left: 18, containLabel: true },
    xAxis: { type: "category", data: data.map((item) => item.bucketLabel), axisLabel: axisLabel() },
    yAxis: { type: "value", name: axisName, axisLabel: axisLabel(CHART_MONO) },
    series: [{ type: "bar", data: data.map((item) => item.count), itemStyle: { color: "rgba(212, 175, 55, 0.75)", borderRadius: [4, 4, 0, 0] } }]
  };
}

function simpleLineOption(
  dates: string[],
  values: Array<number | null | undefined>,
  seriesName: string,
  axisName: string,
  color: string,
  uiLabels: IndicatorChartUiLabels
): EChartsOption {
  return {
    textStyle: chartTextStyle(),
    tooltip: chartTooltip(),
    grid: { top: 24, right: 18, bottom: 42, left: 18, containLabel: true },
    xAxis: { type: "category", data: dates, name: uiLabels.dateAxis, axisLabel: axisLabel() },
    yAxis: { type: "value", name: axisName, axisLabel: axisLabel(CHART_MONO) },
    series: [{ name: seriesName, type: "line", smooth: true, symbol: "none", data: values, lineStyle: { width: 2, color }, areaStyle: color === "#ff0033" ? { color: "rgba(255, 0, 51, 0.16)" } : undefined }]
  };
}

function equityOption(points: EquityCurvePoint[], labels: IndicatorChartLabels, uiLabels: IndicatorChartUiLabels): EChartsOption {
  return {
    textStyle: chartTextStyle(),
    tooltip: chartTooltip(),
    legend: {
      top: 8,
      left: "center",
      data: [uiLabels.strategySeries, uiLabels.buyAndHoldSeries],
      textStyle: { color: "rgba(255,255,255,0.78)", fontFamily: CHART_SANS }
    },
    grid: { top: 76, right: 18, bottom: 42, left: 18, containLabel: true },
    xAxis: { type: "category", data: points.map((point) => point.date), name: uiLabels.dateAxis, axisLabel: axisLabel() },
    yAxis: { type: "value", name: labels.equityAxis, axisLabel: axisLabel(CHART_MONO) },
    series: [
      { name: uiLabels.strategySeries, type: "line", smooth: true, symbol: "none", data: points.map((point) => point.equityIndex), lineStyle: { width: 2, color: "#00ff66" } },
      { name: uiLabels.buyAndHoldSeries, type: "line", smooth: true, symbol: "none", data: points.map((point) => point.benchmarkIndex), lineStyle: { width: 2, color: "#ffffff" } }
    ]
  };
}

function capitalDeploymentOption(points: CapitalDeploymentPoint[], labels: IndicatorChartLabels, uiLabels: IndicatorChartUiLabels): EChartsOption {
  return {
    textStyle: chartTextStyle(),
    tooltip: chartTooltip(),
    legend: {
      top: 8,
      left: "center",
      data: [uiLabels.openPositions, uiLabels.deployedCapital],
      textStyle: { color: "rgba(255,255,255,0.78)", fontFamily: CHART_SANS }
    },
    grid: { top: 78, right: 18, bottom: 42, left: 18, containLabel: true },
    xAxis: { type: "category", data: points.map((point) => point.date), name: uiLabels.dateAxis, axisLabel: axisLabel() },
    yAxis: [
      { type: "value", name: uiLabels.openPositions, axisLabel: axisLabel(CHART_MONO) },
      { type: "value", name: labels.capitalAxis, axisLabel: axisLabel(CHART_MONO) }
    ],
    series: [
      { name: uiLabels.openPositions, type: "line", smooth: true, symbol: "none", data: points.map((point) => point.activePositions), lineStyle: { width: 2, color: "#d4af37" } },
      { name: uiLabels.deployedCapital, type: "line", smooth: true, symbol: "none", yAxisIndex: 1, data: points.map((point) => point.deployedCapital), lineStyle: { width: 2, color: "#00ff66" } }
    ]
  };
}

function openPositionReturnOption(positions: IndicatorStrategyOpenPosition[], uiLabels: IndicatorChartUiLabels): EChartsOption {
  return {
    textStyle: chartTextStyle(),
    tooltip: {
      ...chartTooltip(),
      trigger: "item",
      formatter: (params) => {
        const item = params as { name?: string; value?: number };
        return [`<strong>${item.name ?? ""}</strong>`, `${uiLabels.unrealizedReturn}: ${fmtPct(item.value ?? 0)}`].join("<br/>");
      }
    },
    grid: { top: 18, right: 18, bottom: 42, left: 18, containLabel: true },
    xAxis: { type: "category", data: positions.map((item) => item.symbol), name: uiLabels.symbolAxis, axisLabel: axisLabel() },
    yAxis: { type: "value", name: uiLabels.unrealizedPercentAxis, axisLabel: axisLabel(CHART_MONO) },
    series: [
      {
        type: "bar",
        data: positions.map((item) => ({
          name: item.symbol,
          value: item.unrealizedReturnPct ?? 0,
          itemStyle: { color: (item.unrealizedReturnPct ?? 0) >= 0 ? "#00ff66" : "#ff0033" }
        })),
        itemStyle: { borderRadius: [4, 4, 0, 0] }
      }
    ]
  };
}

export function PriceIndicatorSignalChart({
  series,
  bands,
  labels,
  helperText,
  asOfLabel,
  entryMarkers,
  exitMarkers,
  title = "Price and RSI with signals",
  subtitle,
  chartId = "price_indicator",
  enableRangeSelector = false,
  onRangeChange,
  isLoading = false,
  isStale = false
}: {
  series: Array<{ date: string; price: number; indicatorValue: number | null }>;
  bands: IndicatorThresholdBand[];
  labels: IndicatorChartLabels;
  helperText: string;
  asOfLabel: string;
  entryMarkers?: Array<{ date: string; price: number | null; label: string }>;
  exitMarkers?: Array<{ date: string; price: number | null; label: string }>;
  title?: string;
  subtitle?: string;
  chartId?: string;
  enableRangeSelector?: boolean;
  onRangeChange?: (chartId: string, range: ChartRangeKey) => void;
  isLoading?: boolean;
  isStale?: boolean;
}) {
  const { tr } = useI18n();
  const [range, setRange] = useState<ChartRangeKey>("all");
  const rangedSeries = useMemo(() => sliceSeriesByRange(series, range), [range, series]);
  const rangedEntries = useMemo(() => sliceSeriesByRange(entryMarkers ?? [], range), [entryMarkers, range]);
  const rangedExits = useMemo(() => sliceSeriesByRange(exitMarkers ?? [], range), [exitMarkers, range]);
  const uiLabels = useMemo(() => buildIndicatorChartUiLabels(tr), [tr]);
  const indicatorDomain = useMemo(() => {
    const thresholdValues = bands.flatMap((band) => [band.lowerBound, band.upperBound]).filter((value): value is number => value != null);
    const seriesValues = rangedSeries.map((point) => point.indicatorValue).filter((value): value is number => value != null);
    const allValues = [...thresholdValues, ...seriesValues];
    if (!allValues.length) return { min: 0, max: 100 };
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = Math.max(4, (max - min) * 0.12);
    return { min: Number((min - padding).toFixed(2)), max: Number((max + padding).toFixed(2)) };
  }, [bands, rangedSeries]);

  const option = useMemo(
    () =>
      priceIndicatorOption({
        series: rangedSeries,
        leftName: labels.priceAxis,
        rightName: labels.indicatorAxis,
        rightMin: indicatorDomain.min,
        rightMax: indicatorDomain.max,
        thresholdLines: [...new Set(bands.flatMap((band) => [band.lowerBound, band.upperBound]).filter((value): value is number => value != null))],
        entryMarkers: rangedEntries,
        exitMarkers: rangedExits,
        uiLabels
      }),
    [bands, indicatorDomain.max, indicatorDomain.min, labels.indicatorAxis, labels.priceAxis, rangedEntries, rangedExits, rangedSeries, uiLabels]
  );

  const chartAction = enableRangeSelector ? (
    <ChartRangeSelector
      value={range}
      onChange={(next) => {
        setRange(next);
        onRangeChange?.(chartId, next);
      }}
    />
  ) : undefined;

  return (
    <IndicatorChartFrame title={tr(title)} subtitle={subtitle} helperText={helperText} asOfLabel={asOfLabel} isLoading={isLoading} isStale={isStale} isEmpty={!rangedSeries.length} action={chartAction}>
      <EChartSurface ariaLabel={tr("Indicator price context chart")} className={styles.chartSurfaceTall} option={option} />
    </IndicatorChartFrame>
  );
}

export function ForwardReturnHeatmap({ cells, labels, helperText, asOfLabel, isLoading = false, isStale = false }: { cells: ForwardReturnHeatmapCell[]; labels: IndicatorChartLabels; helperText: string; asOfLabel: string; isLoading?: boolean; isStale?: boolean }) {
  const { tr } = useI18n();
  const uiLabels = useMemo(() => buildIndicatorChartUiLabels(tr), [tr]);
  const option = useMemo(() => heatmapOption(cells, labels, uiLabels), [cells, labels, uiLabels]);
  return (
    <IndicatorChartFrame title={tr("Forward-return heatmap")} subtitle={tr("Historical evidence grouped by the same threshold bands used on the page.")} helperText={helperText} asOfLabel={asOfLabel} isLoading={isLoading} isStale={isStale} isEmpty={!cells.length}>
      <EChartSurface ariaLabel={tr("Forward return heatmap")} className={styles.chartSurfaceTall} option={option} />
      <HeatmapScaleLegend labels={labels} uiLabels={uiLabels} />
    </IndicatorChartFrame>
  );
}

export function StrategySummaryCards({ scenario }: { scenario: IndicatorStrategyScenario }) {
  const { tr } = useI18n();
  return (
    <section className={styles.stackSection}>
      <div className={styles.summaryGrid}>
        <PlainLanguageCard
          title={`${scenario.label} • ${scenario.capitalModeLabel}`}
          body={tr(scenario.shortDescription)}
          secondaryTitle={tr("Rules")}
          secondaryBody={`${tr(scenario.entryRule)} ${tr(scenario.exitRule)}`}
        />
        <div className={styles.bandCard}>
          <h3 className={styles.cardHeading}>{tr("Scenario rules")}</h3>
          <div className={styles.ruleList}>
            <p>{tr(scenario.entryRule)}</p>
            <p>{tr(scenario.exitRule)}</p>
            <p>{tr("Capital mode")}: {scenario.capitalModeLabel}</p>
            <p>{tr("Maximum hold")}: {scenario.maxHoldDays} {tr("trading days")}</p>
          </div>
        </div>
      </div>
      <StatGrid metrics={scenario.summaryMetrics} />
    </section>
  );
}

export function EquityCurveChart({
  points,
  labels,
  helperText,
  asOfLabel,
  chartId = "equity_curve",
  enableRangeSelector = false,
  onRangeChange,
  isLoading = false,
  isStale = false
}: {
  points: EquityCurvePoint[];
  labels: IndicatorChartLabels;
  helperText: string;
  asOfLabel: string;
  chartId?: string;
  enableRangeSelector?: boolean;
  onRangeChange?: (chartId: string, range: ChartRangeKey) => void;
  isLoading?: boolean;
  isStale?: boolean;
}) {
  const { tr } = useI18n();
  const [range, setRange] = useState<ChartRangeKey>("all");
  const rangedPoints = useMemo(() => sliceSeriesByRange(points, range), [points, range]);
  const uiLabels = useMemo(() => buildIndicatorChartUiLabels(tr), [tr]);
  const option = useMemo(() => equityOption(rangedPoints, labels, uiLabels), [labels, rangedPoints, uiLabels]);
  return (
    <IndicatorChartFrame
      title={tr("Strategy equity curve vs buy-and-hold")}
      helperText={helperText}
      asOfLabel={asOfLabel}
      isLoading={isLoading}
      isStale={isStale}
      isEmpty={!rangedPoints.length}
      action={
        enableRangeSelector ? (
          <ChartRangeSelector
            value={range}
            onChange={(next) => {
              setRange(next);
              onRangeChange?.(chartId, next);
            }}
          />
        ) : undefined
      }
    >
      <EChartSurface ariaLabel={tr("Equity curve chart")} className={styles.chartSurface} option={option} />
    </IndicatorChartFrame>
  );
}

export function DrawdownChart({ points, labels, helperText, asOfLabel, isLoading = false, isStale = false }: { points: DrawdownPoint[]; labels: IndicatorChartLabels; helperText: string; asOfLabel: string; isLoading?: boolean; isStale?: boolean }) {
  const { tr } = useI18n();
  const uiLabels = useMemo(() => buildIndicatorChartUiLabels(tr), [tr]);
  const option = useMemo(() => simpleLineOption(points.map((point) => point.date), points.map((point) => point.drawdownPct), tr("Drawdown"), labels.drawdownAxis, "#ff0033", uiLabels), [labels.drawdownAxis, points, tr, uiLabels]);
  return (
    <IndicatorChartFrame title={tr("Drawdown")} helperText={helperText} asOfLabel={asOfLabel} isLoading={isLoading} isStale={isStale} isEmpty={!points.length}>
      <EChartSurface ariaLabel={tr("Drawdown chart")} className={styles.chartSurface} option={option} />
    </IndicatorChartFrame>
  );
}

export function TradeReturnDistribution({ buckets, labels, helperText, asOfLabel, isLoading = false, isStale = false }: { buckets: DistributionBucket[]; labels: IndicatorChartLabels; helperText: string; asOfLabel: string; isLoading?: boolean; isStale?: boolean }) {
  const { tr } = useI18n();
  const option = useMemo(() => barOption(buckets, labels.returnAxis), [buckets, labels.returnAxis]);
  return (
    <IndicatorChartFrame title={tr("Trade return histogram")} helperText={helperText} asOfLabel={asOfLabel} isLoading={isLoading} isStale={isStale} isEmpty={!buckets.length}>
      <EChartSurface ariaLabel={tr("Trade return distribution chart")} className={styles.chartSurface} option={option} />
    </IndicatorChartFrame>
  );
}

export function HoldingDurationChart({ buckets, labels, helperText, asOfLabel, isLoading = false, isStale = false }: { buckets: DistributionBucket[]; labels: IndicatorChartLabels; helperText: string; asOfLabel: string; isLoading?: boolean; isStale?: boolean }) {
  const { tr } = useI18n();
  const option = useMemo(() => barOption(buckets, labels.holdingAxis), [buckets, labels.holdingAxis]);
  return (
    <IndicatorChartFrame title={tr("Holding duration histogram")} helperText={helperText} asOfLabel={asOfLabel} isLoading={isLoading} isStale={isStale} isEmpty={!buckets.length}>
      <EChartSurface ariaLabel={tr("Holding duration chart")} className={styles.chartSurface} option={option} />
    </IndicatorChartFrame>
  );
}

export function CapitalDeploymentChart({ points, labels, helperText, asOfLabel, isLoading = false, isStale = false }: { points: CapitalDeploymentPoint[]; labels: IndicatorChartLabels; helperText: string; asOfLabel: string; isLoading?: boolean; isStale?: boolean }) {
  const { tr } = useI18n();
  const uiLabels = useMemo(() => buildIndicatorChartUiLabels(tr), [tr]);
  const option = useMemo(() => capitalDeploymentOption(points, labels, uiLabels), [labels, points, uiLabels]);
  return (
    <IndicatorChartFrame title={tr("Capital deployed and open positions")} helperText={helperText} asOfLabel={asOfLabel} isLoading={isLoading} isStale={isStale} isEmpty={!points.length}>
      <EChartSurface ariaLabel={tr("Capital deployment chart")} className={styles.chartSurface} option={option} />
    </IndicatorChartFrame>
  );
}

export function OpenPositionReturnChart({
  positions,
  asOfLabel,
  isStale = false
}: {
  positions: IndicatorStrategyOpenPosition[];
  asOfLabel: string;
  isStale?: boolean;
}) {
  const { tr } = useI18n();
  const uiLabels = useMemo(() => buildIndicatorChartUiLabels(tr), [tr]);
  const option = useMemo(() => openPositionReturnOption(positions, uiLabels), [positions, uiLabels]);
  return (
    <IndicatorChartFrame
      title={tr("Open-position P/L snapshot")}
      subtitle={tr("Current active trades only.")}
      helperText={tr("This chart compares unrealized return across active positions using the latest daily snapshot. It helps you see whether today's open book is concentrated in a few names or broadly distributed.")}
      asOfLabel={asOfLabel}
      isStale={isStale}
      isEmpty={!positions.length}
    >
      <EChartSurface ariaLabel={tr("Open position return chart")} className={styles.chartSurface} option={option} />
    </IndicatorChartFrame>
  );
}

export function CurrentPortfolioSection({
  scenario,
  onStockSelect
}: {
  scenario: IndicatorStrategyScenario;
  onStockSelect?: (symbol: string) => void;
}) {
  const { t, tr } = useI18n();
  return (
    <section className={styles.stackSection}>
      <div className={styles.summaryGrid}>
        <PlainLanguageCard
          title={tr("Where are we today")}
          body={t("literals.This block shows the selected scenario's current portfolio state as of {{date}}.", "This block shows the selected scenario's current portfolio state as of {{date}}.", { date: scenario.currentStatus.asOfDate })}
          secondaryTitle={tr("Active stocks")}
          secondaryBody={scenario.currentStatus.activeSymbols.length ? scenario.currentStatus.activeSymbols.join(", ") : tr("No active positions")}
        />
        <div className={styles.bandCard}>
          <h3 className={styles.cardHeading}>{tr("Current portfolio state")}</h3>
          <div className={styles.ruleList}>
            <p>{tr("Portfolio value")}: {formatStrategyValue(scenario.currentStatus.currentPortfolioValue, scenario.summary.valueMode)}</p>
            <p>{tr("Invested now")}: {scenario.summary.valueMode === "currency" ? formatCurrency(scenario.currentStatus.currentInvestedAmount) : tr("Normalized model")}</p>
            <p>{tr("Cash balance")}: {scenario.summary.valueMode === "currency" ? formatCurrency(scenario.currentStatus.cashBalance) : tr("Not capped")}</p>
            <p>{tr("Open positions")}: {scenario.currentStatus.openPositionsCount}</p>
          </div>
        </div>
      </div>
      <OpenPositionReturnChart
        positions={scenario.currentOpenPositions}
        asOfLabel={formatAsOfLabel(tr("As of"), scenario.currentStatus.asOfDate)}
        isStale={scenario.isStale}
      />
      <DataTable
        title={tr("Current open positions")}
        subtitle={tr("These are the stocks currently active under the selected scenario and capital mode.")}
        rows={scenario.currentOpenPositions}
        columns={[
          {
            key: "symbol",
            header: tr("Symbol"),
            cell: (row: IndicatorStrategyOpenPosition) => (
              <div className={styles.tableSymbol}>
                {onStockSelect ? (
                  <button type="button" className={styles.stockButton} onClick={() => onStockSelect(row.symbol)}>
                    {row.symbol}
                  </button>
                ) : (
                  <strong>{row.symbol}</strong>
                )}
                <span>{row.sector}</span>
              </div>
            ),
            sortable: true,
            sortValue: (row) => `${row.symbol} ${row.sector}`
          },
          { key: "entryDate", header: tr("Entry date"), cell: (row) => row.entryDate, align: "center" },
          { key: "daysOpen", header: tr("Days in trade"), cell: (row) => row.daysOpen, align: "right", sortable: true, sortValue: (row) => row.daysOpen },
          { key: "entryPrice", header: tr("Entry"), cell: (row) => fmtPrice(row.entryPrice ?? Number.NaN), align: "right" },
          { key: "currentPrice", header: tr("Current"), cell: (row) => fmtPrice(row.currentPrice ?? Number.NaN), align: "right" },
          { key: "currentIndicatorValue", header: tr("Indicator"), cell: (row) => fmtDecimal(row.currentIndicatorValue ?? Number.NaN, 1), align: "right" },
          { key: "targetPrice", header: tr("Target"), cell: (row) => (row.targetPrice == null ? "—" : fmtPrice(row.targetPrice)), align: "right" },
          { key: "unrealizedReturnPct", header: tr("Unrealized %"), cell: (row) => <span data-tone={toneFromPct(row.unrealizedReturnPct)}>{row.unrealizedReturnPct == null ? "—" : fmtPct(row.unrealizedReturnPct)}</span>, align: "right", sortable: true, sortValue: (row) => row.unrealizedReturnPct },
          { key: "allocatedCapital", header: tr("Invested"), cell: (row) => formatCurrency(row.allocatedCapital), align: "right" },
          { key: "marketValue", header: tr("Current value"), cell: (row) => formatCurrency(row.marketValue), align: "right" }
        ]}
        emptyTitle={tr("No current open positions")}
        emptyBody={tr("The selected scenario has no active trades as of the latest daily snapshot.")}
        tableName="indicator-current-open-positions"
      />
    </section>
  );
}

export function StrategyPerStockTable({
  rows,
  filterValue,
  onFilterValueChange,
  onSortChange,
  onStockSelect
}: {
  rows: IndicatorStrategyPerStockRow[];
  filterValue?: string;
  onFilterValueChange?: (value: string) => void;
  onSortChange?: (columnKey: string, direction: "asc" | "desc") => void;
  onStockSelect?: (symbol: string) => void;
}) {
  const { tr } = useI18n();
  return (
    <DataTable
      title={tr("Per-stock results table")}
      subtitle={tr("Scenario-level results by stock from the stored daily strategy history.")}
      rows={rows}
      columns={[
        { key: "symbol", header: tr("Symbol"), cell: (row) => <div className={styles.tableSymbol}><button type="button" className={styles.stockButton} onClick={() => onStockSelect?.(row.symbol)}>{row.symbol}</button><span>{row.sector}</span></div>, sortable: true, sortValue: (row) => `${row.symbol} ${row.sector}` },
        { key: "tradeCount", header: tr("Trades"), cell: (row) => row.tradeCount, align: "right", sortable: true, sortValue: (row) => row.tradeCount },
        { key: "winRatePct", header: tr("Win rate"), cell: (row) => (row.winRatePct == null ? "—" : formatPercent(row.winRatePct, 1, false)), align: "right", sortable: true, sortValue: (row) => row.winRatePct },
        { key: "avgReturnPct", header: tr("Avg %"), cell: (row) => (row.avgReturnPct == null ? "—" : fmtPct(row.avgReturnPct)), align: "right", sortable: true, sortValue: (row) => row.avgReturnPct },
        { key: "medianReturnPct", header: tr("Median %"), cell: (row) => (row.medianReturnPct == null ? "—" : fmtPct(row.medianReturnPct)), align: "right", sortable: true, sortValue: (row) => row.medianReturnPct },
        { key: "maxGainPct", header: tr("Max gain"), cell: (row) => (row.maxGainPct == null ? "—" : fmtPct(row.maxGainPct)), align: "right", sortable: true, sortValue: (row) => row.maxGainPct },
        { key: "maxLossPct", header: tr("Max loss"), cell: (row) => (row.maxLossPct == null ? "—" : fmtPct(row.maxLossPct)), align: "right", sortable: true, sortValue: (row) => row.maxLossPct },
        { key: "avgHoldingDays", header: tr("Avg hold"), cell: (row) => formatDurationDays(row.avgHoldingDays, 1), align: "right", sortable: true, sortValue: (row) => row.avgHoldingDays },
        { key: "maxHoldingDays", header: tr("Max hold"), cell: (row) => formatDurationDays(row.maxHoldingDays, 0), align: "right", sortable: true, sortValue: (row) => row.maxHoldingDays },
        { key: "totalInvested", header: tr("Total invested"), cell: (row) => formatCurrency(row.totalInvested), align: "right" },
        { key: "currentValue", header: tr("Current value"), cell: (row) => formatCurrency(row.currentValue), align: "right" },
        { key: "realizedPnl", header: tr("Realized P/L"), cell: (row) => <span data-tone={toneFromPct(row.realizedPnl)}>{formatCurrency(row.realizedPnl)}</span>, align: "right", sortable: true, sortValue: (row) => row.realizedPnl },
        { key: "unrealizedPnl", header: tr("Unrealized P/L"), cell: (row) => <span data-tone={toneFromPct(row.unrealizedPnl)}>{formatCurrency(row.unrealizedPnl)}</span>, align: "right", sortable: true, sortValue: (row) => row.unrealizedPnl },
        { key: "openPositionFlag", header: tr("Open?"), cell: (row) => (row.openPositionFlag ? tr("Yes") : tr("No")), align: "center", sortable: true, sortValue: (row) => row.openPositionFlag ? 1 : 0 },
        { key: "lastSignalDate", header: tr("Last signal"), cell: (row) => row.lastSignalDate ?? "—", align: "center" }
      ]}
      emptyTitle={tr("No per-stock results")}
      emptyBody={tr("No per-stock results are available for the selected scenario.")}
      maxHeight={580}
      tableName="indicator-strategy-per-stock"
      filterValue={filterValue}
      onFilterValueChange={onFilterValueChange}
      onSortChange={onSortChange}
      filterPlaceholder={tr("Filter by symbol or sector")}
    />
  );
}

export function StockResultTable({
  rows,
  valueLabel,
  filterValue,
  onFilterValueChange,
  onSortChange,
  onStockSelect
}: {
  rows: IndicatorStockResultRow[];
  valueLabel: string;
  filterValue?: string;
  onFilterValueChange?: (value: string) => void;
  onSortChange?: (columnKey: string, direction: "asc" | "desc") => void;
  onStockSelect?: (symbol: string) => void;
}) {
  const { tr } = useI18n();
  return (
    <DataTable
      title={tr("Indicator snapshot by stock")}
      subtitle={tr("Current indicator reading plus nearby historical context for each stock.")}
      rows={rows}
      columns={[
        { key: "symbol", header: tr("Symbol"), cell: (row) => <div className={styles.tableSymbol}><button type="button" className={styles.stockButton} onClick={() => onStockSelect?.(row.symbol)}>{row.symbol}</button><span>{row.sector}</span></div>, sortable: true, sortValue: (row) => `${row.symbol} ${row.sector}` },
        { key: "last", header: tr("Last"), cell: (row) => fmtPrice(row.last), align: "right" },
        { key: "changePct", header: tr("Day %"), cell: (row) => <span data-tone={toneFromPct(row.changePct)}>{fmtPct(row.changePct)}</span>, align: "right", sortable: true, sortValue: (row) => row.changePct },
        { key: "currentValue", header: valueLabel, cell: (row) => fmtDecimal(row.currentValue, 1), align: "right", sortable: true, sortValue: (row) => row.currentValue },
        { key: "bandLabel", header: tr("Band"), cell: (row) => tr(row.bandLabel), sortable: true, sortValue: (row) => row.bandLabel },
        { key: "percentile3y", header: tr("3Y pctile"), cell: (row) => (row.percentile3y == null ? "—" : formatPercent(row.percentile3y, 1, false)), align: "right", sortable: true, sortValue: (row) => row.percentile3y },
        { key: "avgForwardReturn20dSameBand", header: tr("Avg 20D"), cell: (row) => (row.avgForwardReturn20dSameBand == null ? "—" : fmtPct(row.avgForwardReturn20dSameBand)), align: "right", sortable: true, sortValue: (row) => row.avgForwardReturn20dSameBand },
        { key: "hitRate20dSameBand", header: tr("20D hit rate"), cell: (row) => (row.hitRate20dSameBand == null ? "—" : formatPercent(row.hitRate20dSameBand, 1, false)), align: "right", sortable: true, sortValue: (row) => row.hitRate20dSameBand }
      ]}
      emptyTitle={tr("No stock breakdown available")}
      emptyBody={tr("No stock-level rows are available for this indicator right now.")}
      maxHeight={580}
      tableName="indicator-stock-breakdown"
      filterValue={filterValue}
      onFilterValueChange={onFilterValueChange}
      onSortChange={onSortChange}
      filterPlaceholder={tr("Filter by symbol or band")}
    />
  );
}

export function AssumptionsCard({ items, onOpen }: { items: string[]; onOpen?: () => void }) {
  const { tr } = useI18n();
  return (
    <PageIntroAccordion
      label={tr("Assumptions")}
      title={tr("What this template assumes")}
      body={items[0] ? tr(items[0]) : tr("Review the strategy assumptions before interpreting the evidence.")}
      items={items.slice(1).map((item) => tr(item))}
      widgetId="indicator_assumptions"
      defaultOpen={false}
      onOpen={onOpen}
    />
  );
}

export function LimitationsCard({ items, onOpen }: { items: string[]; onOpen?: () => void }) {
  const { tr } = useI18n();
  return (
    <PageIntroAccordion
      label={tr("Limitations")}
      title={tr("Where the signal can fail or stay stretched")}
      body={items[0] ? tr(items[0]) : tr("This indicator can remain stretched and should not be treated as a standalone timing tool.")}
      items={items.slice(1).map((item) => tr(item))}
      widgetId="indicator_limitations"
      defaultOpen={false}
      onOpen={onOpen}
    />
  );
}
