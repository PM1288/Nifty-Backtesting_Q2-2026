import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "../lib/api";
import type { EChartsOption } from "echarts";
import styles from "./TradingAnalyticsPage.module.css";
const Chart = lazy(async () => ({
  default: (await import("../components/visual/EChartSurface")).EChartSurface,
}));
type Row = Record<string, unknown>;
function CollapsiblePricePane({ label, bars }: { label: string; bars: Row[] }) {
  const [open, setOpen] = useState(true);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className={styles.periodPane}
    >
      <summary>{label} context</summary>
      {open && <AnalyticsPricePane label={label} bars={bars} />}
    </details>
  );
}
export function AnalyticsPricePane({
  label,
  bars,
  large = false,
}: {
  label: string;
  bars: Row[];
  large?: boolean;
}) {
  const [ema, setEma] = useState(true);
  const option: EChartsOption = {
    animation: false,
    textStyle: { fontSize: 12 },
    tooltip: { trigger: "axis" },
    grid: { left: 75, right: 70, top: 35, bottom: 65 },
    xAxis: {
      type: "category",
      data: bars.map((b) => String(b.date ?? b.end)),
      axisLabel: {
        fontSize: 12,
        hideOverlap: true,
        formatter: (s) =>
          String(s).includes("T")
            ? new Date(String(s)).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })
            : String(s),
      },
    },
    yAxis: {
      type: "value",
      position: "right",
      scale: true,
      name: "Index points",
      axisLabel: { fontSize: 12 },
      splitLine: { lineStyle: { color: "#E8EBEF" } },
    },
    series: [
      {
        name: label,
        type: "candlestick",
        itemStyle: {
          color: "#fff",
          borderColor: "#6478D9",
          color0: "#6478D9",
          borderColor0: "#6478D9",
        },
        data: bars.map((b) =>
          ["open", "close", "low", "high"].map((k) =>
            b[k] == null ? NaN : Number(b[k]),
          ),
        ),
      },
      ...(ema
        ? [
            {
              name: "9 EMA",
              type: "line" as const,
              showSymbol: false,
              data: bars.map((b) => (b.ema9 == null ? null : Number(b.ema9))),
              lineStyle: { color: "#C78F3E", width: 1.5 },
            },
          ]
        : []),
    ],
  };
  return (
    <section className={styles.plot}>
      <header className={styles.toolbar}>
        <h3>{label}</h3>
        <label>
          <input
            type="checkbox"
            checked={ema}
            onChange={(e) => setEma(e.target.checked)}
          />{" "}
          9 EMA
        </label>
        <span>Hollow blue: rising · filled blue: falling</span>
      </header>
      <p>
        Levels / OI price profile unavailable until approved source/level
        overlays are materialized. Forming higher-timeframe bars carry no
        confirmed EMA.
      </p>
      {bars.length ? (
        <Suspense fallback={<p>Loading chart…</p>}>
          <Chart
            ariaLabel={label}
            option={option}
            className={large ? styles.structureLarge : styles.structureSmall}
          />
        </Suspense>
      ) : (
        <p>No recorded candles available.</p>
      )}
      <details>
        <summary>
          {label} · exact source data ({bars.length})
        </summary>
        <pre tabIndex={0}>{JSON.stringify(bars, null, 2)}</pre>
      </details>
    </section>
  );
}
export function TradingAnalyticsStructure({
  asOf,
  candles,
  periods,
}: {
  asOf: string;
  candles: Row[];
  periods?: { weekly: Row[]; monthly: Row[] };
}) {
  const [interval, setInterval] = useState(15);
  const q = useQuery({
    queryKey: ["trading-structure", asOf, interval],
    queryFn: () =>
      getJson<{ panes: { bars: Row[] }[] }>(
        `/v1/trading-analytics/charts?asOf=${encodeURIComponent(asOf)}&interval=${interval}`,
      ),
    staleTime: 30000,
  });
  return (
    <>
      <div className={styles.toolbar}>
        <h2>Market Structure · NIFTY</h2>
        <label>
          Intraday interval{" "}
          <select
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value))}
          >
            <option value={5}>5 min</option>
            <option value={15}>15 min</option>
            <option value={60}>1 hour</option>
          </select>
        </label>
      </div>
      {q.isFetching && <p role="status">Loading recorded intraday candles…</p>}
      {q.error && (
        <p role="alert">
          Intraday source unavailable; other panes remain available.
        </p>
      )}
      <AnalyticsPricePane
        label={`Intraday · ${interval}m`}
        bars={(q.data?.panes[0]?.bars ?? []).filter((b) => b.closed)}
        large
      />
      {[
        ["Daily", candles],
        ["Weekly", periods?.weekly ?? []],
        ["Monthly", periods?.monthly ?? []],
      ].map(([label, bars]) => (
        <CollapsiblePricePane
          key={String(label)}
          label={String(label)}
          bars={bars as Row[]}
        />
      ))}
    </>
  );
}
