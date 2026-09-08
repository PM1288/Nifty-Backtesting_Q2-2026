import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "../lib/api";
import {useSearchParams} from 'react-router-dom';
import type { EChartsOption } from "echarts";
import styles from "./TradingAnalyticsPage.module.css";
import { candleColors, evidenceValueAxis, chartInterval } from "../lib/tradingAnalyticsChartView";
const Chart = lazy(async () => ({
  default: (await import("../components/visual/EChartSurface")).EChartSurface,
}));
type Row = Record<string, unknown>;
function CollapsiblePricePane({ label, bars, levels=[] }: { label: string; bars: Row[]; levels?: Row[] }) {
  const [open, setOpen] = useState(true);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className={styles.periodPane}
    >
      <summary>{label} context</summary>
      {open && <AnalyticsPricePane label={label} bars={bars} levels={levels} />}
    </details>
  );
}
export function AnalyticsPricePane({
  label,
  bars,
  large = false,
  levels = [],
}: {
  label: string;
  bars: Row[];
  large?: boolean;
  levels?: Row[];
}) {
  const [ema, setEma] = useState(true);
  const option: EChartsOption = {
    animation: false,
    textStyle: { fontSize: 12 },
    tooltip: { trigger: "axis" },
    legend: { data: [label, "9 EMA"], textStyle: { fontSize: 12 } },
    dataZoom: [{ type: "inside" }, { type: "slider", bottom: 0, height: 22 }],
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
      ...evidenceValueAxis,
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
        itemStyle: candleColors,
        markLine: levels.length
          ? {
              silent: true,
              symbol: "none",
              label: { formatter: "{b}", position: "insideEndTop" },
              data: levels.flatMap((level) => {
                const timeframe = String(level.timeframe ?? "").toUpperCase();
                const resistance = level.selected as Row | null | undefined;
                const support = level.support as Row | null | undefined;
                return [
                  resistance?.resistance == null
                    ? null
                    : {
                        name: `${timeframe}R`,
                        yAxis: Number(resistance.resistance),
                        lineStyle: { color: "#c93346", type: "dashed" },
                      },
                  support?.support == null
                    ? null
                    : {
                        name: `${timeframe}S`,
                        yAxis: Number(support.support),
                        lineStyle: { color: "#087a55", type: "dashed" },
                      },
                ].filter(Boolean) as never;
              }),
            }
          : undefined,
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
        <span>Green: rising · red: falling</span>
      </header>
      <p>
        Read-only MR/MS, WR/WS and DR/DS use completed daily-derived source
        candles. Forming or incomplete periods cannot create a confirmed level.
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
  symbol='NIFTY',
  asOf,
  candles,
  periods,
  levels = [],
}: {
  symbol?:string;
  asOf: string;
  candles: Row[];
  periods?: { weekly: Row[]; monthly: Row[] };
  levels?: Row[];
}) {
  const [params,setParams]=useSearchParams();
  const interval=chartInterval(params.get('interval'));
  const setInterval=(value:number)=>{const next=new URLSearchParams(params);next.set('interval',String(value));setParams(next);};
  const q = useQuery({
    queryKey: ["trading-structure", symbol, asOf, interval],
    queryFn: () =>
      getJson<{ panes: { bars: Row[] }[] }>(
        `/v1/trading-analytics/charts?symbol=${encodeURIComponent(symbol)}&asOf=${encodeURIComponent(asOf)}&interval=${interval}`,
      ),
    staleTime: 30000,
  });
  return (
    <>
      <div className={styles.toolbar}>
        <h2>Market Structure · {symbol}</h2>
        <label>
          Intraday interval{" "}
          <select
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value))}
          >
            <option value={1}>1 min</option>
            <option value={5}>5 min</option>
            <option value={15}>15 min</option>
            <option value={60}>1 hour</option>
          </select>
        </label>
      </div>
      <div className={styles.kpis} aria-label="Structural support and resistance levels">
        {levels.flatMap((level) => {
          const resistance = level.selected as Row | null | undefined;
          const support = level.support as Row | null | undefined;
          return [
            <span key={String(level.timeframe) + "-r"}>
              {String(level.codeResistance ?? "R")}{" "}
              <strong>{resistance?.resistance == null ? "—" : Number(resistance.resistance).toLocaleString("en-IN")}</strong>
            </span>,
            <span key={String(level.timeframe) + "-s"}>
              {String(level.codeSupport ?? "S")}{" "}
              <strong>{support?.support == null ? "—" : Number(support.support).toLocaleString("en-IN")}</strong>
            </span>,
          ];
        })}
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
        levels={levels}
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
          levels={levels.filter(
            (level) =>
              String(level.timeframe).toLowerCase() ===
              String(label).toLowerCase(),
          )}
        />
      ))}
    </>
  );
}
