import { lazy, Suspense, useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { EChartsOption, SeriesOption } from "echarts";
import { getJson } from "../lib/api";
import { evidenceCsv } from "../lib/tradingAnalyticsExport";
import { oiTimeline } from "../lib/tradingAnalyticsOiTimeline";
import { closeAt, measurePanes, scalperIndicators } from "../lib/scalperMeasurement";
import {
  candleColors,
  evidenceValueAxis,
  chartInterval,
  istDay,
  dayRows,
  financialVisibleBounds,
  levelIsNearVisiblePrice,
  roundNumberGuides,
} from "../lib/tradingAnalyticsChartView";
import styles from "./TradingAnalyticsPage.module.css";
const Chart = lazy(async () => ({
  default: (await import("../components/visual/EChartSurface")).EChartSurface,
}));
type Row = Record<string, unknown>;
const measurementChartOpts = { notMerge: false, replaceMerge: ["series", "grid", "xAxis", "yAxis"] };
const valueText = (v: number | null) => v == null ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const htmlText = (v: unknown) => String(v ?? "—").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
function scalpTooltip(input: unknown) {
  const entries = (Array.isArray(input) ? input : [input]) as Row[];
  return entries.map((p, i) => {
    const v=p.value;
    const text=p.seriesType === "candlestick" && Array.isArray(v)
      ? ["O","C","L","H"].map((label,j)=>`${label} ${valueText(typeof v.slice(-4)[j] === "number" && Number.isFinite(v.slice(-4)[j]) ? v.slice(-4)[j] : null)}`).join(" · ")
      : valueText(typeof v === "number" && Number.isFinite(v) ? v : null);
    return `${i===0?`${htmlText(p.axisValueLabel)}<br/>`:""}${htmlText(p.seriesName)}: ${htmlText(text)}`;
  }).join("<br/>");
}
function IndicatorEvidence({times, indicators}:{times:string[];indicators:Map<string,ReturnType<typeof scalperIndicators>[number]>}) {
  return <details><summary>RSI / MACD values and calculation</summary>
    <p>Display-only, selected interval, completed closes with retained-history warm-up. RSI14 uses the platform’s rolling average gains/losses (not Wilder smoothing). MACD12/26 and signal9 use SMA-seeded EMA. Partial candles reset warm-up; unavailable values remain —. These do not change strategy signals.</p>
    <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Indicator values scroll area"><table aria-label="Underlying RSI and MACD values"><thead><tr><th>End (UTC)</th><th>RSI14</th><th>MACD</th><th>Signal9</th><th>Histogram</th></tr></thead><tbody>{times.map(t=>{const r=indicators.get(t);return <tr key={t}><td>{t}</td><td>{valueText(r?.rsi??null)}</td><td>{valueText(r?.macd??null)}</td><td>{valueText(r?.signal??null)}</td><td>{valueText(r?.histogram??null)}</td></tr>;})}</tbody></table></div>
  </details>;
}
export function TradingAnalyticsScalper({
  symbol='NIFTY',label='NIFTY 50',
  asOf,
  expiry,
  strikes,
  spot,
  legs = [],
  resistance = [],
}: {
  symbol?:string; label?:string;
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
  const [showGrid, setShowGrid] = useState(symbol==='NIFTY');
  const [fitLevels, setFitLevels] = useState(false);
  const [fixedPair, setFixedPair] = useState<{strike:string;expiry:string}|null>(null);
  const [points, setPoints] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [quantity, setQuantity] = useState("65");
  const [showIndicators, setShowIndicators] = useState(true);
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
  const selected = fixedPair?.strike ?? (strike || String(defaultStrike ?? ""));
  const effectiveExpiry = fixedPair?.expiry ?? expiry;
  const query = new URLSearchParams({ symbol, asOf, interval: String(interval) });
  if (effectiveExpiry && selected) {
    query.set("expiry", effectiveExpiry);
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
  useEffect(() => { setPoints([]); setSelecting(false); }, [interval, day, oneDay, selected, effectiveExpiry]);
  const times = useMemo(() => [...new Set((panes ?? []).flatMap(p => p.bars.map(b => String(b.end))))].sort(), [panes]);
  const indicators = useMemo(() => new Map(scalperIndicators(q.data?.panes[0]?.bars ?? []).map(r => [r.time,r])), [q.data]);
  const visibleUnderlyingBounds = useMemo(
    () => financialVisibleBounds(panes?.[0]?.bars ?? []),
    [panes],
  );
  const selectedLevels = useMemo(
    () => resistance.flatMap((row) => {
      const selectedLevel = row.selected as Row | null | undefined;
      const value = Number(selectedLevel?.resistance);
      return Number.isFinite(value)
        ? [{ row, value }]
        : [];
    }),
    [resistance],
  );
  const plottedLevels = useMemo(
    () => selectedLevels.filter(({ value }) => fitLevels || levelIsNearVisiblePrice(value, visibleUnderlyingBounds)),
    [fitLevels, selectedLevels, visibleUnderlyingBounds],
  );
  const measured = points.length === 2 ? measurePanes(panes ?? [], points[0], points[1], Number(quantity)) : null;
  const pickPoint = (index:number) => {
    if (!fixedPair || !selecting || !times[index]) return;
    if (points.length === 1) { setPoints([points[0],times[index]].sort()); setSelecting(false); }
    else setPoints([times[index]]);
  };
  const option = useMemo<EChartsOption>(() => {
    const rows = panes ?? [];
    const times = [
      ...new Set(rows.flatMap((p) => p.bars.map((b) => String(b.end)))),
    ].sort();
    return {
      animation: false,
      tooltip: { trigger: "axis", transitionDuration:0, hideDelay:0, formatter:scalpTooltip },
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      textStyle: { fontSize: 12 },
      dataZoom: [{type:"inside",xAxisIndex: rows.map((_,i)=>i).concat(showIndicators?[rows.length,rows.length+1]:[]), zoomOnMouseWheel:true, moveOnMouseMove: !selecting}, {type:"slider",xAxisIndex:rows.map((_,i)=>i).concat(showIndicators?[rows.length,rows.length+1]:[]),bottom:5,height:18}],
      grid: [...rows.map((_, i) =>
        narrow
          ? {
              left: 70,
              right: 30,
              top: `${4 + i * (showIndicators?20:29)}%`,
              height: showIndicators?"15%":"22%",
            }
          : i === 0
            ? { left: 70, right: "40%", top: 45, bottom: showIndicators?"35%":65 }
            : {
                left: "62%",
                right: 60,
                top: i === 1 ? 45 : "52%",
                height: "38%",
              },
      ), ...(showIndicators ? [
        {left:70,right:narrow?30:"40%",top:narrow?"65%":"69%",height:"9%"},
        {left:70,right:narrow?30:"40%",top:narrow?"80%":"82%",height:"9%"},
      ] : [])],
      xAxis: [...rows, ...(showIndicators?[rows[0],rows[0]]:[])].map((_, i) => ({
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
      yAxis: [...rows.map((p, i) => ({
        ...evidenceValueAxis,
        type: "value" as const,
        gridIndex: i,
        scale: true,
        min: i === 0 && fitLevels && selectedLevels.length
          ? (v: { min: number }) => Math.min(v.min, ...selectedLevels.map((level) => level.value))
          : undefined,
        max: i === 0 && fitLevels && selectedLevels.length
          ? (v: { max: number }) => Math.max(v.max, ...selectedLevels.map((level) => level.value))
          : undefined,
        position: "right" as const,
        axisLabel: { fontSize: 12 },
        splitLine: { lineStyle: { color: "#E8EBEF" } },
        name:
          p.identity.exchange === "NSE"
            ? `${label} · price`
            : `${p.identity.strike} ${String(p.identity.tradingsymbol).slice(-2)} · ₹`,
      })), ...(showIndicators ? [
        {...evidenceValueAxis,type:"value" as const,gridIndex:rows.length,min:0,max:100,name:"RSI (14)",position:"right" as const},
        {...evidenceValueAxis,type:"value" as const,gridIndex:rows.length+1,scale:true,name:"MACD (12,26,9)",position:"right" as const},
      ] : [])],
      series: [...rows.flatMap<SeriesOption>((p, i) => {
        const bars = new Map(
          p.bars.filter((b) => b.closed).map((b) => [String(b.end), b]),
        );
        return [
          {
            name: String(p.identity.tradingsymbol),
            type: "candlestick" as const,
            itemStyle: candleColors,
            markArea: measured && closeAt(p.bars, measured.start)!=null && closeAt(p.bars, measured.end)!=null ? {
              silent:true,itemStyle:{color:"rgba(190,24,93,0.09)",borderWidth:1,borderColor:"#be185d"},
              data:[[{xAxis:measured.start,yAxis:Math.min(closeAt(p.bars,measured.start)!,closeAt(p.bars,measured.end)!)},{xAxis:measured.end,yAxis:Math.max(closeAt(p.bars,measured.start)!,closeAt(p.bars,measured.end)!)}]],
            } : {data:[]},
            markPoint: {symbol:"circle",symbolSize:8,label:{show:true,formatter:"{b}"},data:points.flatMap((t,j)=>{const v=closeAt(p.bars,t);return v==null?[]:[{name:j===0?"A":"B",coord:[t,v]}];})},
            markLine:
              i === 0 && (showLevels || showGrid)
                ? {
                    symbol: "none",
                    silent: true,
                    label: { position: "insideEndTop" as const, formatter: "{b}" },
                    data: [
                      ...(showLevels ? plottedLevels.map(({ row, value }) => ({
                        name: `${String(row.timeframe).toUpperCase()} R · preview`,
                        yAxis: value,
                        lineStyle: { type: "dashed" as const, color: "#969B45" },
                      })) : []),
                      ...(showGrid ? roundNumberGuides(visibleUnderlyingBounds, 50).map((value) => ({
                        name: `${value}`,
                        yAxis: value,
                        label: { show: false },
                        lineStyle: { type: "dotted" as const, color: "#cbd5e1", width: 1 },
                      })) : []),
                    ],
                    lineStyle: { type: "dashed" as const, color: "#969B45" },
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
      }), ...(showIndicators ? [
        {name:"RSI (14)",type:"line" as const,xAxisIndex:rows.length,yAxisIndex:rows.length,showSymbol:false,connectNulls:false,lineStyle:{color:"#7c3aed"},data:times.map(t=>indicators.get(t)?.rsi??null)},
        ...(["macd","signal","histogram"] as const).map((key,i)=>({name:key==="macd"?"MACD":key==="signal"?"Signal":"Histogram",type:key==="histogram"?"bar" as const:"line" as const,xAxisIndex:rows.length+1,yAxisIndex:rows.length+1,showSymbol:false,connectNulls:false,itemStyle:{color:["#2563eb","#d97706","#64748b"][i]},data:times.map(t=>indicators.get(t)?.[key]??null)})),
      ]:[])],
    };
  }, [panes, narrow, showEma, showLevels, showGrid, showIndicators, indicators, selecting, points, quantity, label, fitLevels, selectedLevels, plottedLevels, visibleUnderlyingBounds]);
  return (
    <>
      <div className={`${styles.toolbar} ${styles.scalperCommandBar}`}>
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
          <select disabled={!!fixedPair} value={selected} onChange={(e) => setStrike(e.target.value)}>
            {[...new Set([...strikes, ...(selected ? [Number(selected)] : [])])]
              .sort((a, b) => a - b)
              .map((s) => (
                <option key={s}>{s}</option>
              ))}
          </select>
        </label>
        <span>Expiry {effectiveExpiry || "—"}</span>
        <button disabled={!!fixedPair} onClick={() => setStrike(selected)}>Pin selected pair</button>
        <button disabled={!!fixedPair} onClick={() => setStrike("")}>Reset to ATM auto-follow</button>
        <strong>{fixedPair ? "VISUAL PAIR FIXED" : strike ? "PINNED" : "ATM AUTO-FOLLOW"}</strong>
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
      <section className={styles.measurement} aria-label="Browser-only position measurement">
        <div className={styles.toolbar}>
          <button disabled={!selected || !effectiveExpiry || q.isFetching || (panes?.length??0)<3} onClick={() => {setFixedPair(fixedPair?null:{strike:selected,expiry:effectiveExpiry});setPoints([]);setSelecting(false);}}>{fixedPair?"Unlock visual pair":"Fix pair for measurement"}</button>
          <label>Quantity (units)<input aria-label="Measurement quantity" type="number" min={1} step={1} value={quantity} onChange={e=>setQuantity(e.target.value)} style={{width:90}} /></label>
          <button disabled={!fixedPair || q.isFetching} onClick={()=>{setPoints([]);setSelecting(true);}}>Select A → B on chart</button>
          <button onClick={()=>{setPoints([]);setSelecting(false);}}>Clear measurement</button>
          <label><input type="checkbox" checked={showIndicators} onChange={e=>setShowIndicators(e.target.checked)}/>Underlying RSI / MACD</label>
        </div>
        <p role="status">{fixedPair?`VISUAL PAIR FIXED · ${symbol} ${fixedPair.strike} · ${fixedPair.expiry}`:"Fix the pair to begin."} {selecting?`Click ${points.length?"B (last)":"A (first)"} on any price pane, or use the time controls below.`:"Scroll to zoom; drag to pan."}</p>
        {fixedPair && <div className={styles.toolbar}>{[0,1].map(i=><label key={i}>{i===0?"A start time":"B end time"}<select aria-label={i===0?"Measurement start time":"Measurement end time"} value={points[i]??""} onChange={e=>{setPoints(old=>!e.target.value?[]:i===0?[e.target.value]:[old[0]??times[0],e.target.value].sort());setSelecting(false);}} disabled={i===1&&!points[0]}><option value="">Choose completed-candle time</option>{times.map(t=><option key={t} value={t}>{new Date(t).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST</option>)}</select></label>)}</div>}
        {measured && <>
          <strong data-testid="measurement-pnl">Illustrative long CE + PE P&amp;L: ₹{valueText(measured.pnl)}</strong>
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Measurement values scroll area"><table aria-label="Synchronized price changes"><thead><tr><th>Instrument</th><th>A close</th><th>B close</th><th>Δ price</th><th>Δ × quantity</th></tr></thead><tbody>{measured.rows.map(r=><tr key={r.symbol}><th>{r.symbol}</th><td>{valueText(r.from)}</td><td>{valueText(r.to)}</td><td>{valueText(r.delta)}</td><td>{r.kind==="UNDERLYING"?"—":valueText(r.delta==null||!Number.isSafeInteger(Number(quantity))||Number(quantity)<=0?null:r.delta*Number(quantity))}</td></tr>)}<tr><th>CE + PE</th><td>—</td><td>—</td><td>{valueText(measured.combined)}</td><td>{valueText(measured.pnl)}</td></tr></tbody></table></div>
          <p>{measured.start} → {measured.end} · UTC source times. Missing matching closes: — (no nearest-time substitution).</p>
        </>}
        <small>Browser memory only; cleared on reload or leaving this view. Quantity 65 is an editable visual default, not verified lot size. Close-to-close price delta, not Greek Delta. Long both legs, before costs/slippage; not a trade, order or booked P&amp;L.</small>
        <IndicatorEvidence times={times} indicators={indicators}/>
      </section>
      <div className={`${styles.toolbar} ${styles.scalperOverlayBar}`}>
        <label>
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(e) => setShowGrid(e.target.checked)}
          />
          {symbol === "NIFTY" ? "NIFTY 50-point grid (optional)" : `${symbol} round-number grid (optional)`}
        </label>
        <label>
          <input
            type="checkbox"
            checked={showLevels}
            onChange={(e) => setShowLevels(e.target.checked)}
          />
          Monthly / weekly / daily R
        </label>
        <button
          type="button"
          disabled={!showLevels || selectedLevels.length === 0}
          aria-pressed={fitLevels}
          onClick={() => setFitLevels((value) => !value)}
        >
          {fitLevels ? "Fit price" : "Fit levels"}
        </button>
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
      <p className={styles.scalperLegend}>
        Green = rising; red = falling. One-day view uses the latest recorded
        underlying session unless another day is selected; EMA retains its
        historical warm-up. The optional 50-point grid is enabled by default only
        for NIFTY; other underlyings and option premiums use their own automatic scale.
      </p>
      <div
        className={`${styles.kpis} ${styles.levelStrip}`}
        role="region"
        aria-label="Structural level summary"
        tabIndex={0}
      >
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
            {r.selected != null && !levelIsNearVisiblePrice(Number((r.selected as Row).resistance), visibleUnderlyingBounds) && !fitLevels
              ? Number((r.selected as Row).resistance) > (visibleUnderlyingBounds?.max ?? Number.POSITIVE_INFINITY)
                ? " · above view ↑"
                : " · below view ↓"
              : ""}
          </span>
        ))}
      </div>
      <details className={styles.scalperEvidence}>
        <summary>Resistance rule / origin and break evidence</summary>
        <p>
          Preview: open of unbroken bearish candle; largest open-minus-close
          body, then latest origin. A later completed same-timeframe close
          strictly above breaks R permanently; equality is a touch. Monthly: 12
          completed bars. Daily and weekly counts are user-configured because
          source notes do not specify them. Only resistance above the as-of
          price is selected. Research overlays, not approved trade signals.
          Auto price view excludes distant levels. Use Fit levels explicitly to include every selected level.
        </p>
        <pre tabIndex={0}>{JSON.stringify(resistance, null, 2)}</pre>
      </details>
      <p className={styles.scalperEvidence}>
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
            {fixedPair ? "Visual pair fixed" : strike ? "Pinned pair" : "Auto pair"}
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
              setOptionOpts={measurementChartOpts}
              axisExtentPolicy="native"
              onCategoryClick={(index,grid)=>{if(grid<(panes?.length??0))pickPoint(index);}}
            />
          </Suspense>
        )}
        <section className={styles.ladder} aria-label="Paired strike ladder" tabIndex={0}>
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
                        (l) => effectiveExpiry === expiry && Number(l.strike) === s && l.option_type === "CE",
                      )?.last_price ?? "—",
                    )}
                  </td>
                  <th>
                    <button disabled={!!fixedPair} onClick={() => setStrike(String(s))}>
                      {s}
                      {s === defaultStrike ? " · ATM" : ""}
                    </button>
                  </th>
                  <td>
                    {String(
                      legs.find(
                        (l) => effectiveExpiry === expiry && Number(l.strike) === s && l.option_type === "PE",
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
          Time axis · SmartAPI raw OI, last recorded quote per {interval}-minute bin.
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
                  ...evidenceValueAxis,
                  type: "value",
                  name: "Provider-native OI",
                  min: 0,
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
      <section className={`${styles.warning} ${styles.scalperEvidence}`}>
        <h3>Closed-candle evidence · POLICY INCOMPLETE</h3>
        <p>
          Own-series 9 EMA · aligned completed intervals required · 70%
          range/body and put confirmation remain unapproved. No paper
          eligibility. Green = rising; red = falling.
        </p>
      </section>
      {(panes?.length ?? 0) < 3 && (
        <p className={`${styles.warning} ${styles.scalperEvidence}`}>
          Exact CE/PE metadata or archive unavailable for this known-at time. No
          substitute contracts are shown.
        </p>
      )}
      {panes?.map((p) => (
        <details className={styles.scalperEvidence} key={String(p.identity.tradingsymbol)}>
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
        <p className={styles.scalperEvidence} key={l}>{l}</p>
      ))}
    </>
  );
}
