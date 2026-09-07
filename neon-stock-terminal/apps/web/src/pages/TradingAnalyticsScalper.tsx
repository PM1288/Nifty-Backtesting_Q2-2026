import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { EChartsOption } from "echarts";
import { getJson } from "../lib/api";
import { evidenceCsv } from "../lib/tradingAnalyticsExport";
import styles from "./TradingAnalyticsPage.module.css";
const Chart = lazy(async () => ({
  default: (await import("../components/visual/EChartSurface")).EChartSurface,
}));
type Row = Record<string, unknown>;
export function TradingAnalyticsScalper({
  asOf,
  expiry,
  strikes,
  spot,
}: {
  asOf: string;
  expiry: string;
  strikes: number[];
  spot: number | null;
}) {
  const [interval, setInterval] = useState(15);
  const [strike, setStrike] = useState("");
  const defaultStrike =
    spot == null
      ? null
      : [...strikes].sort(
          (a, b) => Math.abs(a - spot) - Math.abs(b - spot) || a - b,
        )[0];
  const selected = strike || String(defaultStrike ?? "");
  const query = new URLSearchParams({ asOf, interval: String(interval) });
  if (expiry && selected) {
    query.set("expiry", expiry);
    query.set("strike", selected);
  }
  const q = useQuery({
    queryKey: ["trading-analytics-charts", query.toString()],
    queryFn: () =>
      getJson<{
        panes: { identity: Row; bars: Row[]; sourceMinuteCount: number }[];
        limitations: string[];
      }>(`/v1/trading-analytics/charts?${query}`),
    staleTime: 30000,
    retry: 1,
  });
  const panes = q.data?.panes;
  const option = useMemo<EChartsOption>(() => {
    const rows = panes ?? [];
    const times = [
      ...new Set(rows.flatMap((p) => p.bars.map((b) => String(b.end)))),
    ].sort();
    return {
      animation: false,
      tooltip: { trigger: "axis" },
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      grid: rows.map((_, i) => ({
        left: 70,
        right: 30,
        top: `${5 + i * 31}%`,
        height: "22%",
      })),
      xAxis: rows.map((_, i) => ({
        type: "category",
        gridIndex: i,
        data: times,
        axisLabel: {
          show: i === rows.length - 1,
          formatter: (s: string) =>
            new Date(s).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            }),
        },
      })),
      yAxis: rows.map((p, i) => ({
        type: "value",
        gridIndex: i,
        scale: true,
        name: p.identity.exchange === "NSE" ? "NIFTY · points" : `${p.identity.strike} ${String(p.identity.tradingsymbol).slice(-2)} · ₹`,
      })),
      series: rows.flatMap((p, i) => {
        const bars = new Map(
          p.bars.filter((b) => b.closed).map((b) => [String(b.end), b]),
        );
        return [
          {
            name: String(p.identity.tradingsymbol),
            type: "candlestick" as const,
            xAxisIndex: i,
            yAxisIndex: i,
            data: times.map((t) => {
              const b = bars.get(t);
              return b
                ? [
                    Number(b.open),
                    Number(b.close),
                    Number(b.low),
                    Number(b.high),
                  ]
                : [NaN, NaN, NaN, NaN];
            }),
          },
          {
            name: `${p.identity.tradingsymbol} EMA9`,
            type: "line" as const,
            xAxisIndex: i,
            yAxisIndex: i,
            showSymbol: false,
            data: times.map((t) => {
              const b = bars.get(t);
              return b?.ema9 == null ? null : Number(b.ema9);
            }),
            lineStyle: { color: "#d97706", width: 1.5 },
          },
        ];
      }),
    };
  }, [panes]);
  return (
    <>
      <div className={styles.toolbar}>
        <h2>Underlying / exact CE / exact PE</h2>
        <label>
          Interval{" "}
          <select
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value))}
          >
            <option value={5}>5 min</option>
            <option value={15}>15 min</option>
            <option value={60}>1 hour</option>
          </select>
        </label>
        <label>
          Pinned paired strike{" "}
          <select value={selected} onChange={(e) => setStrike(e.target.value)}>
            {strikes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <span>Expiry {expiry || "—"}</span>
        {q.data && (
          <button
            onClick={() => {
              const rows = q.data.panes.flatMap((p) =>
                p.bars.map((b) => ({ ...p.identity, ...b })),
              );
              const url = URL.createObjectURL(
                new Blob([evidenceCsv(rows)], {
                  type: "text/csv;charset=utf-8",
                }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = "trading-analytics-exact-contract-bars.csv";
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Export exact-contract bars CSV
          </button>
        )}
      </div>
      <p>
        Shared time cursor, independent price scales. Exact contracts are never
        spliced into a rotating ATM series. Only fully observed closed bars are
        plotted; partial coverage remains in the source table.
      </p>
      {q.isFetching && <p role="status">Loading retained minute paths…</p>}
      {q.error && <p role="alert">Exact-contract chart source unavailable.</p>}
      {panes && panes.length > 0 && (
        <Suspense fallback={<p>Loading chart…</p>}>
          <Chart
            className={styles.scalperChart}
            ariaLabel="Time-linked underlying and exact option candles with independent price scales"
            option={option}
          />
        </Suspense>
      )}
      {(panes?.length ?? 0) < 3 && (
        <p className={styles.warning}>
          Exact CE/PE metadata or archive unavailable for this known-at time. No
          substitute contracts are shown.
        </p>
      )}
      {panes?.map((p) => (
        <details key={String(p.identity.tradingsymbol)}>
          <summary>
            {String(p.identity.tradingsymbol)} · {p.sourceMinuteCount} source
            minutes · {p.bars.filter((b) => b.closed).length} complete bars
          </summary>
          <div
            className={styles.tableWrap}
            tabIndex={0}
            role="region"
            aria-label={`${p.identity.tradingsymbol} source bar scroll area`}
          >
            <table aria-label={`${p.identity.tradingsymbol} source bars`}>
              <thead>
                <tr>
                  {[
                    "End",
                    "Open",
                    "High",
                    "Low",
                    "Close",
                    "EMA9",
                    "Observed / expected minutes",
                    "Complete",
                  ].map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.bars.map((b) => (
                  <tr key={String(b.end)}>
                    {[
                      b.end,
                      b.open,
                      b.high,
                      b.low,
                      b.close,
                      b.ema9,
                      `${b.coverage}/${b.expectedMinutes}`,
                      b.closed,
                    ].map((v, i) => (
                      <td key={i}>{v == null ? "—" : String(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
      {q.data?.limitations.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </>
  );
}
