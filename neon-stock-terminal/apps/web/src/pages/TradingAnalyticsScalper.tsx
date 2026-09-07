import { lazy, Suspense, useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { EChartsOption } from "echarts";
import { getJson } from "../lib/api";
import { evidenceCsv } from "../lib/tradingAnalyticsExport";
import { oiTimeline } from "../lib/tradingAnalyticsOiTimeline";
import {
  candleColors,
  chartInterval,
  istDay,
  dayRows,
} from "../lib/tradingAnalyticsChartView";
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
  legs = [],
  resistance = [],
}: {
  asOf: string;
  expiry: string;
  strikes: number[];
  spot: number | null;
  legs?: Row[];
  resistance?: Row[];
}) {
  const [params, setParams] = useSearchParams();
  const interval = chartInterval(params.get("interval"));
  const [showLevels, setShowLevels] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const updateView = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };
  const strike = params.get("strike") ?? "";
  const setInterval = (v: number) => {
    const next = new URLSearchParams(params);
    next.set("interval", String(v));
    setParams(next);
  };
  const setStrike = (v: string) => {
    const next = new URLSearchParams(params);
    if (v) {
      next.set("strike", v);
      next.set("pin", "true");
    } else {
      next.delete("strike");
      next.delete("pin");
    }
    setParams(next);
  };
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1100);
  useEffect(() => {
    const m = matchMedia("(max-width:1099px)");
    const listener = () => setNarrow(m.matches);
    m.addEventListener("change", listener);
    return () => m.removeEventListener("change", listener);
  }, []);
  const [showEma, setShowEma] = useState(true);
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
        panes: {
          identity: Row;
          bars: Row[];
          sourceMinuteCount: number;
          oiHistory: Row[];
        }[];
        limitations: string[];
      }>(`/v1/trading-analytics/charts?${query}`),
    staleTime: 30000,
    retry: 1,
  });
  const days = [
    ...new Set(
      (q.data?.panes[0]?.bars ?? []).map((b) => istDay(b.end)).filter(Boolean),
    ),
  ]
    .sort()
    .reverse();
  const day = days.includes(params.get("day") ?? "")
    ? params.get("day")!
    : (days[0] ?? "");
  const oneDay = params.get("range") !== "all";
  const panes = useMemo(
    () =>
      q.data?.panes.map((p) => ({
        ...p,
        bars: oneDay ? dayRows(p.bars, day, "end") : p.bars,
        oiHistory: oneDay
          ? dayRows(p.oiHistory ?? [], day, "event_time")
          : p.oiHistory,
      })),
    [q.data, oneDay, day],
  );
  const option = useMemo<EChartsOption>(() => {
    const rows = panes ?? [];
    const times = [
      ...new Set(rows.flatMap((p) => p.bars.map((b) => String(b.end)))),
    ].sort();
    return {
      animation: false,
      tooltip: { trigger: "axis" },
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      textStyle: { fontSize: 12 },
      grid: rows.map((_, i) =>
        narrow
          ? {
              left: 70,
              right: 30,
              top: `${5 + i * 31}%`,
              height: "22%",
            }
          : i === 0
            ? { left: 70, right: "43%", top: 45, bottom: 65 }
            : {
                left: "66%",
                right: 60,
                top: i === 1 ? 45 : "56%",
                height: "32%",
              },
      ),
      xAxis: rows.map((_, i) => ({
        type: "category",
        gridIndex: i,
        data: times,
        axisLabel: {
          show: !narrow || i === rows.length - 1,
          fontSize: 12,
          hideOverlap: true,
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
        interval: i === 0 && showGrid ? 50 : undefined,
        position: "right",
        axisLabel: { fontSize: 12 },
        splitLine: { lineStyle: { color: "#E8EBEF" } },
        name:
          p.identity.exchange === "NSE"
            ? "NIFTY · points"
            : `${p.identity.strike} ${String(p.identity.tradingsymbol).slice(-2)} · ₹`,
      })),
      series: rows.flatMap((p, i) => {
        const bars = new Map(
          p.bars.filter((b) => b.closed).map((b) => [String(b.end), b]),
        );
        return [
          {
            name: String(p.identity.tradingsymbol),
            type: "candlestick" as const,
            itemStyle: candleColors,
            markLine:
              i === 0 && showLevels
                ? {
                    symbol: "none",
                    silent: true,
                    label: { position: "insideEndTop", formatter: "{b}" },
                    data: resistance
                      .filter((r) => r.selected != null)
                      .map((r) => ({
                        name: `${String(r.timeframe).toUpperCase()} R · preview`,
                        yAxis: Number((r.selected as Row).resistance),
                      })),
                    lineStyle: { type: "dashed", color: "#969B45" },
                  }
                : undefined,
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
              return !showEma || b?.ema9 == null ? null : Number(b.ema9);
            }),
            lineStyle: { color: "#C78F3E", width: 1.5 },
          },
        ];
      }),
    };
  }, [panes, narrow, showEma, showLevels, showGrid, resistance]);
  return (
    <>
      <div className={styles.toolbar}>
        <h2>Underlying / exact CE / exact PE</h2>
        <label>
          Chart range{" "}
          <select
            value={oneDay ? "day" : "all"}
            onChange={(e) => updateView("range", e.target.value)}
          >
            <option value="day">One day only</option>
            <option value="all">All retained days</option>
          </select>
        </label>
        {oneDay && (
          <label>
            Trading day (IST){" "}
            <select
              value={day}
              onChange={(e) => updateView("day", e.target.value)}
            >
              {days.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        )}
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
            {[...new Set([...strikes, ...(selected ? [Number(selected)] : [])])]
              .sort((a, b) => a - b)
              .map((s) => (
                <option key={s}>{s}</option>
              ))}
          </select>
        </label>
        <span>Expiry {expiry || "—"}</span>
        <button onClick={() => setStrike(selected)}>Pin selected pair</button>
        <button onClick={() => setStrike("")}>Reset to ATM auto-follow</button>
        <strong>{strike ? "PINNED" : "ATM AUTO-FOLLOW"}</strong>
        <label>
          <input
            type="checkbox"
            checked={showEma}
            onChange={(e) => setShowEma(e.target.checked)}
          />
          9 EMA
        </label>
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
      <div className={styles.toolbar}>
        <label>
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(e) => setShowGrid(e.target.checked)}
          />
          NIFTY 50-point grid
        </label>
        <label>
          <input
            type="checkbox"
            checked={showLevels}
            onChange={(e) => setShowLevels(e.target.checked)}
          />
          Monthly / weekly / daily R
        </label>
        {["daily", "weekly"].map((timeframe) => (
          <label key={timeframe}>
            {timeframe} R lookback{" "}
            <input
              key={params.get(`${timeframe}Lookback`) ?? "unset"}
              type="number"
              min={1}
              max={timeframe === "daily" ? 400 : 100}
              placeholder="Required"
              defaultValue={params.get(`${timeframe}Lookback`) ?? ""}
              style={{ width: 90 }}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (
                  !e.target.value ||
                  (Number.isInteger(v) &&
                    v >= 1 &&
                    v <= (timeframe === "daily" ? 400 : 100))
                )
                  updateView(`${timeframe}Lookback`, e.target.value);
                else e.target.reportValidity();
              }}
            />
          </label>
        ))}
      </div>
      <p>
        Green = rising; red = falling. One-day view uses the latest recorded
        underlying session unless another day is selected; EMA retains its
        historical warm-up. Grid spacing is 50 NIFTY points only, not option
        premium levels.
      </p>
      <div className={styles.kpis}>
        {resistance.map((r) => (
          <span key={String(r.timeframe)}>
            {String(r.timeframe).toUpperCase()} R ·{" "}
            {String(r.lookback ?? "choose")} completed bars
            <strong>
              {r.selected == null
                ? "—"
                : Number((r.selected as Row).resistance).toLocaleString(
                    "en-IN",
                  )}
            </strong>
            {String(r.state).replaceAll("_", " ")}
          </span>
        ))}
      </div>
      <details>
        <summary>Resistance rule / origin and break evidence</summary>
        <p>
          Preview: open of unbroken bearish candle; largest open-minus-close
          body, then latest origin. A later completed same-timeframe close
          strictly above breaks R permanently; equality is a touch. Monthly: 12
          completed bars. Daily and weekly counts are user-configured because
          source notes do not specify them. Only resistance above the as-of
          price is selected. Research overlays, not approved trade signals.
          Far-away levels may be outside the visible price range.
        </p>
        <pre tabIndex={0}>{JSON.stringify(resistance, null, 2)}</pre>
      </details>
      <p>
        Shared time cursor, independent price scales. Exact contracts are never
        spliced into a rotating ATM series. Only fully observed closed bars are
        plotted; partial coverage remains in the source table.
      </p>
      {q.isFetching && <p role="status">Loading retained minute paths…</p>}
      {q.error && <p role="alert">Exact-contract chart source unavailable.</p>}
      <div className={styles.contractHeaders}>
        {panes?.map((p) => (
          <strong key={String(p.identity.tradingsymbol)}>
            {String(p.identity.tradingsymbol)} · {interval}m ·{" "}
            {strike ? "Pinned pair" : "Auto pair"}
          </strong>
        ))}
      </div>
      <div className={styles.scalperWorkspace}>
        {panes && panes.length > 0 && (
          <Suspense fallback={<p>Loading chart…</p>}>
            <Chart
              className={styles.scalperChart}
              ariaLabel="Time-linked underlying and exact option candles with independent price scales"
              option={option}
            />
          </Suspense>
        )}
        <section className={styles.ladder} aria-label="Paired strike ladder">
          <h3>Nearest 10 pairs</h3>
          <table>
            <thead>
              <tr>
                <th>CE ₹</th>
                <th>Strike</th>
                <th>PE ₹</th>
              </tr>
            </thead>
            <tbody>
              {strikes.map((s) => (
                <tr key={s} aria-selected={String(s) === selected}>
                  <td>
                    {String(
                      legs.find(
                        (l) => Number(l.strike) === s && l.option_type === "CE",
                      )?.last_price ?? "—",
                    )}
                  </td>
                  <th>
                    <button onClick={() => setStrike(String(s))}>
                      {s}
                      {s === defaultStrike ? " · ATM" : ""}
                    </button>
                  </th>
                  <td>
                    {String(
                      legs.find(
                        (l) => Number(l.strike) === s && l.option_type === "PE",
                      )?.last_price ?? "—",
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            One expiry · provider-native quotes · selection pins both exact
            contracts.
          </p>
        </section>
      </div>
      <section className={styles.plot}>
        <h3>Exact selected contracts · OI through time</h3>
        <p>
          Time axis · SmartAPI raw OI, last recorded quote per 15-minute bin.
          Not previous-session or session-open change. Gaps and asynchronous
          source timestamps retained.
        </p>
        {panes?.some((p) => p.oiHistory?.length) ? (
          <Suspense fallback={<p>Loading OI chart…</p>}>
            <Chart
              className={styles.chart}
              ariaLabel="Exact CE and PE OI through time"
              option={{
                animation: false,
                tooltip: { trigger: "axis" },
                legend: { textStyle: { fontSize: 12 } },
                grid: { left: 95, right: 30, top: 45, bottom: 70 },
                xAxis: {
                  type: "time",
                  name: "IST",
                  axisLabel: {
                    fontSize: 12,
                    formatter: (value: number) =>
                      new Date(value).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      }),
                  },
                },
                yAxis: {
                  type: "value",
                  name: "Provider-native OI",
                  min: 0,
                  axisLabel: { fontSize: 12 },
                },
                series: panes
                  .filter((p) => p.identity.exchange === "NFO")
                  .map((p, i) => ({
                    name: String(p.identity.tradingsymbol),
                    type: "line",
                    showSymbol: false,
                    lineStyle: { color: i ? "#659E8B" : "#BE7869" },
                    connectNulls: false,
                    data: oiTimeline(p.oiHistory),
                  })),
              }}
            />
          </Suspense>
        ) : (
          <p>
            Recorded OI history unavailable. No zero baseline is synthesized.
          </p>
        )}
        <details>
          <summary>Exact OI observations / source timestamps</summary>
          <pre tabIndex={0}>
            {JSON.stringify(
              panes?.map((p) => ({
                identity: p.identity,
                oiHistory: p.oiHistory,
              })) ?? [],
              null,
              2,
            )}
          </pre>
        </details>
      </section>
      <section className={styles.warning}>
        <h3>Closed-candle evidence · POLICY INCOMPLETE</h3>
        <p>
          Own-series 9 EMA · aligned completed intervals required · 70%
          range/body and put confirmation remain unapproved. No paper
          eligibility. Green = rising; red = falling.
        </p>
      </section>
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
            minutes in retained archive ·{" "}
            {p.bars.filter((b) => b.closed).length} complete bars in view
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
