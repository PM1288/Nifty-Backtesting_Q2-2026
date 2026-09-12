import { lazy, Suspense, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import {
  buildParticipantOptionsHistory,
  participantOptionMetrics,
  type ParticipantOptionMetric,
} from "../lib/participantOptionsHistory";
import { evidenceValueAxis } from "../lib/tradingAnalyticsChartView";
import styles from "./TradingAnalyticsPage.module.css";

const Chart = lazy(async () => ({
  default: (await import("../components/visual/EChartSurface")).EChartSurface,
}));

type Row = Record<string, unknown>;
type ParticipantHistory = {
  rows: Row[];
  reportCount: number;
  oldestDate: string | null;
  latestDate: string | null;
  state: string;
  scope: string;
  unit: string;
  limit: number;
};

const colours: Record<string, string> = {
  FII: "#2563eb",
  Pro: "#7c3aed",
  Client: "#d97706",
  DII: "#117a40",
};

const compactContracts = (candidate: unknown) => {
  const value = Number(candidate);
  if (!Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  if (absolute >= 10_000_000) return `${(value / 10_000_000).toFixed(1)}Cr`;
  if (absolute >= 100_000) return `${(value / 100_000).toFixed(1)}L`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
};

export function ParticipantOptionsHistoryChart({ history, smallMultiples = false }: { history?: ParticipantHistory; smallMultiples?: boolean }) {
  const [metric, setMetric] = useState<ParticipantOptionMetric>("options_proxy");
  const metricDefinition = participantOptionMetrics.find((candidate) => candidate.key === metric)!;
  const model = useMemo(
    () => buildParticipantOptionsHistory(history?.rows ?? [], metric),
    [history?.rows, metric],
  );
  const option = useMemo<EChartsOption>(() => ({
    animation: false,
    color: model.series.map((series) => colours[series.participant]),
    tooltip: {
      trigger: "axis",
      valueFormatter: (candidate: unknown) => {
        const value = Number(candidate);
        return Number.isFinite(value) ? `${value.toLocaleString("en-IN")}${metric === "futures_long_pct" ? "%" : " contracts"}` : "Unavailable";
      },
    },
    legend: { data: model.series.map((series) => series.label) },
    grid: { left: 32, right: 28, top: 70, bottom: model.dates.length > 30 ? 78 : 58, containLabel: true },
    dataZoom: model.dates.length > 30 ? [
      { type: "inside", startValue: Math.max(0, model.dates.length - 30), endValue: model.dates.length - 1 },
      { type: "slider", height: 18, bottom: 12, startValue: Math.max(0, model.dates.length - 30), endValue: model.dates.length - 1 },
    ] : undefined,
    xAxis: {
      type: "category",
      boundaryGap: false,
      name: "Official report date",
      data: model.dates,
      axisLabel: { formatter: (date: string) => date.slice(5), rotate: model.dates.length > 20 ? 30 : 0 },
    },
    yAxis: {
      ...evidenceValueAxis,
      type: "value",
      name: `${metricDefinition.label} · ${metric === "futures_long_pct" ? "%" : "contracts"}`,
      axisLabel: { formatter: compactContracts },
    },
    series: model.series.map((series) => ({
      name: series.label,
      type: "line",
      connectNulls: false,
      showSymbol: model.dates.length <= 45,
      symbolSize: 5,
      lineStyle: { width: 2, color: colours[series.participant] },
      itemStyle: { color: colours[series.participant] },
      data: series.values,
      markLine: metricDefinition.signed ? {
        silent: true,
        symbol: "none",
        label: { show: false },
        lineStyle: { color: "#64748b", type: "dashed", width: 1 },
        data: [{ yAxis: 0 }],
      } : undefined,
    })),
  }), [metric, metricDefinition.label, metricDefinition.signed, model]);
  const smallOptions = useMemo(() => model.series.map((series): EChartsOption => ({
    animation: false,
    title: { text: series.label, left: 8, top: 4, textStyle: { fontSize: 12, color: "#24324a" } },
    tooltip: { trigger: "axis" },
    grid: { left: 18, right: 14, top: 30, bottom: 22, containLabel: true },
    xAxis: { type: "category", boundaryGap: false, data: model.dates, axisLabel: { formatter: (date: string) => date.slice(5), showMaxLabel: true, showMinLabel: true } },
    yAxis: { ...evidenceValueAxis, type: "value", axisLabel: { formatter: compactContracts } },
    series: [{
      name: series.label, type: "line", connectNulls: false, showSymbol: false,
      lineStyle: { width: 2, color: colours[series.participant] },
      itemStyle: { color: colours[series.participant] }, data: series.values,
      markLine: metricDefinition.signed ? { silent: true, symbol: "none", label: { show: false }, data: [{ yAxis: 0 }] } : undefined,
    }],
  })), [metricDefinition.signed, model]);

  return (
    <div className={styles.participantHistory} data-testid="morning-participant-history">
      <header>
        <div>
          <h3>Daily participant index-options positions</h3>
          <p>
            Current value from the latest retained revision for each official report date · {model.dates.length} reports · {model.observedCount}/{model.expectedCount} participant readings.
          </p>
        </div>
        <label>
          Plot
          <select value={metric} onChange={(event) => setMetric(event.target.value as ParticipantOptionMetric)} data-testid="morning-participant-history-metric">
            {participantOptionMetrics.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.label}</option>)}
          </select>
        </label>
      </header>
      {!history || model.dates.length === 0 ? (
        <div className={styles.participantHistoryEmpty} data-testid="morning-participant-history-state">
          Participant report history unavailable. Missing reports are not plotted as zero.
        </div>
      ) : (
        <Suspense fallback={<div className={styles.participantHistoryEmpty}>Loading participant history chart…</div>}>
          {smallMultiples ? <div className={styles.participantHistorySmallMultiples}>{smallOptions.map((smallOption, index) => <Chart
            key={model.series[index].participant}
            className={styles.participantHistorySmallChart}
            ariaLabel={`Daily ${metricDefinition.label} for ${model.series[index].label} by official report date`}
            axisExtentPolicy="native"
            option={smallOption}
          />)}</div> : <Chart className={styles.participantHistoryChart} ariaLabel={`Daily ${metricDefinition.label} for FII, Pro, Client and DII by official report date`} axisExtentPolicy="native" option={option} />}
        </Suspense>
      )}
      <p className={styles.participantHistoryNote}>
        Daily official participant OI report · contracts, not premium cash flow · gaps remain unavailable · Client is the exchange-reported class, not verified retail-only.
      </p>
    </div>
  );
}
