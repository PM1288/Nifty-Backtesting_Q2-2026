import { lazy, Suspense, useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { EChartsOption, SeriesOption } from "echarts";
import { getJson } from "../lib/api";
import { evidenceCsv } from "../lib/tradingAnalyticsExport";
import { closeAt, measurePanes, openAt, scalperIndicators } from "../lib/scalperMeasurement";
import { SCALPER_ENTRY_RULE, scalperPairedBody80Signals } from "../lib/scalperSignals";
import { activeChartExpiry } from "../lib/multiTimeframeMatrix";
import {
  candleColors,
  evidenceValueAxis,
  chartInterval,
  istDay,
  dayRows,
  financialVisibleBounds,
  levelIsInSessionRange,
  roundNumberGuides,
} from "../lib/tradingAnalyticsChartView";
import styles from "./TradingAnalyticsPage.module.css";
const Chart = lazy(async () => ({
  default: (await import("../components/visual/EChartSurface")).EChartSurface,
}));
const AlignedTerminal = lazy(async () => ({
  default: (await import("./AlignedScalperTerminal")).AlignedScalperTerminal,
}));
type Row = Record<string, unknown>;
const measurementChartOpts = { notMerge: false, replaceMerge: ["series", "grid", "xAxis", "yAxis"] };
const valueText = (v: number | null) => v == null ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const signedValueText = (v: number | null) => v == null ? "—" : `${v > 0 ? "+" : ""}${valueText(v)}`;
const finiteNumber = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const value = Number(v);
  return Number.isFinite(value) ? value : null;
};
const optionSide = (identity: Row) => {
  const symbol = String(identity.tradingsymbol ?? "").toUpperCase();
  return symbol.endsWith("CE") ? "CE" : symbol.endsWith("PE") ? "PE" : null;
};
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
function OiPriceProfile({legs,bounds}:{legs:Row[];bounds:{min:number;max:number}|null}) {
  const [mode,setMode]=useState<"current"|"change">("current");
  const points=legs.flatMap((leg)=>{
    const raw=mode==="current"?leg.open_interest:(leg.oi_layers as Row|undefined)?.change;
    const value=raw==null?null:Number(raw);
    const strike=leg.strike==null?null:Number(leg.strike);
    if(value==null||strike==null||!Number.isFinite(value)||!Number.isFinite(strike)) return [];
    return [{side:String(leg.option_type),strike,value}];
  });
  return <section className={styles.oiProfile}>
    <header>
      <strong>Price-aligned OI profile</strong>
      <select aria-label="OI price profile measure" value={mode} onChange={event=>setMode(event.target.value as typeof mode)}>
        <option value="current">Current</option>
        <option value="change">ΔOI</option>
      </select>
    </header>
    {points.length&&bounds ? <Suspense fallback={<p>Loading profile…</p>}><Chart
      className={styles.oiProfileChart}
      ariaLabel="Option open interest aligned to actual underlying strike prices"
      axisExtentPolicy="native"
      option={{
        animation:false,
        tooltip:{trigger:"item",formatter:(input:unknown)=>{const p=input as Row;const v=Array.isArray(p.value)?p.value:[];return htmlText(p.seriesName)+" · strike "+htmlText(v[1])+"<br/>"+(mode==="current"?"OI":"ΔOI")+" "+htmlText(Math.abs(Number(v[0])));}},
        grid:{left:8,right:45,top:8,bottom:30,containLabel:true},
        xAxis:{type:"value",name:mode==="current"?"Mirrored OI":"Signed ΔOI",axisLabel:{formatter:(value:number)=>Math.abs(value).toLocaleString("en-IN",{notation:"compact"})}},
        yAxis:{type:"value",name:"Strike",min:bounds.min,max:bounds.max,position:"right",axisLabel:{formatter:(value:number)=>value.toLocaleString("en-IN")}},
        series:["CE","PE"].map((side,index)=>({name:side,type:"scatter",symbol:"rect",symbolSize:[10,7],itemStyle:{color:index?"#087a55":"#c93346"},data:points.filter(point=>point.side===side).map(point=>[(side==="CE"?-1:1)*point.value,point.strike])})),
      }}
    /></Suspense>:<p>Profile unavailable for the visible price/expiry context.</p>}
  </section>;
}
function ScalperOiTopline({ panes }: { panes: { identity: Row; bars: Row[]; oiHistory: Row[] }[] | undefined }) {
  const values = useMemo(() => {
    const bySide = new Map<string, { ltp: number | null; current: number | null; change: number | null; at: string | null }>();
    (panes ?? []).forEach((pane) => {
      const side = optionSide(pane.identity);
      if (!side) return;
      const latestBar = [...pane.bars].filter((row) => row.closed).at(-1);
      const latestOi = [...pane.oiHistory].sort((a, b) => String(a.event_time).localeCompare(String(b.event_time))).at(-1);
      bySide.set(side, {
        ltp: finiteNumber(latestBar?.close),
        current: finiteNumber(latestOi?.current),
        change: finiteNumber(latestOi?.interval_change),
        at: latestOi?.event_time == null ? null : String(latestOi.event_time),
      });
    });
    const ce = bySide.get("CE");
    const pe = bySide.get("PE");
    return {
      ce,
      pe,
      pcr: ce?.current == null || pe?.current == null || ce.current === 0 ? null : pe.current / ce.current,
      endpoint: [ce?.at, pe?.at].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
    };
  }, [panes]);
  const anyObserved = values.ce != null || values.pe != null;
  return <section className={styles.scalperOiTopline} aria-label="Selected call and put OI context" data-testid="scalper-call-put-oi" tabIndex={0} role="region">
    <strong>Selected CE / PE · retained OI endpoint</strong>
    {(["CE", "PE"] as const).map((side) => {
      const row = side === "CE" ? values.ce : values.pe;
      return <span key={side} className={side === "CE" ? styles.callOi : styles.putOi}>
        <b>{side}</b> LTP <em>{valueText(row?.ltp ?? null)}</em> · OI <em>{valueText(row?.current ?? null)}</em> · interval ΔOI <em>{signedValueText(row?.change ?? null)}</em>
      </span>;
    })}
    <span><b>OI PCR</b> <em>{valueText(values.pcr)}</em></span>
    <small>{values.endpoint ? `Endpoint ${new Date(values.endpoint).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} IST` : anyObserved ? "OI endpoint time unavailable" : "Exact CE / PE OI endpoint unavailable"}</small>
  </section>;
}
export function TradingAnalyticsScalper({
  symbol='NIFTY',label='NIFTY 50',
  asOf,
  expiry,
  strikes,
  spot,
  legs = [],
  resistance = [],
  maxPainStrikes = [],
}: {
  symbol?:string; label?:string;
  asOf: string;
  expiry: string;
  strikes: number[];
  spot: number | null;
  legs?: Row[];
  resistance?: Row[];
  maxPainStrikes?: number[];
}) {
  const [params, setParams] = useSearchParams();
  const interval = chartInterval(params.get("interval"));
  const [showLevels, setShowLevels] = useState(true);
  const [showGrid, setShowGrid] = useState(symbol==='NIFTY');
  const renderer = params.get("renderer") === "classic" ? "classic" : "aligned";
  const [fixedPair, setFixedPair] = useState<{strike:string;expiry:string}|null>(null);
  const [points, setPoints] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [quantity, setQuantity] = useState("65");
  // Keep OI beside the candles, not only in the audit chart below the workspace.
  // RSI/MACD remain available without permanently consuming the candle viewport.
  const [lowerPane, setLowerPane] = useState<"oi_interval"|"oi_current"|"oi_cumulative"|"rsi"|"macd">("oi_interval");
  const [oiMetric, setOiMetric] = useState<"current"|"interval_change"|"cumulative_change">("interval_change");
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
  const [axisBounds, setAxisBounds] = useState<Record<number, { min: string; max: string }>>({});
  const defaultStrike =
    spot == null
      ? null
      : [...strikes].sort(
          (a, b) => Math.abs(a - spot) - Math.abs(b - spot) || a - b,
        )[0];
  const requestedChartExpiry = params.get("chartExpiry");
  const chartExpiry = activeChartExpiry(requestedChartExpiry, expiry, asOf);
  const selected = fixedPair?.strike ?? (strike || String(defaultStrike ?? ""));
  const effectiveExpiry = fixedPair?.expiry ?? chartExpiry;
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
          coverage: Row[];
          sourceMinuteCount: number;
          oiHistory: Row[];
        }[];
        availableContracts: Array<{ expiry: string; strike: number; ce_contracts: number; pe_contracts: number }>;
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
  const availableContracts = q.data?.availableContracts ?? [];
  // This selector controls retained exact-pair candles, not the current chain.
  // Never offer an expiry with no paired minute bars as if it were chartable.
  const availableExpiries = [...new Set([...availableContracts.map((row) => String(row.expiry)), effectiveExpiry].filter(Boolean))].sort();
  const availableStrikes = availableContracts.filter((row) => String(row.expiry) === effectiveExpiry).map((row) => Number(row.strike));
  useEffect(() => {
    if (!q.data || fixedPair) return;
    const rolledOver = requestedChartExpiry != null && requestedChartExpiry !== chartExpiry;
    const exactPanes = q.data.panes.filter((pane) => pane.identity.exchange === "NFO");
    if (!rolledOver && requestedChartExpiry && exactPanes.length === 2 && exactPanes.every((pane) => pane.sourceMinuteCount > 1)) return;
    const preferred = q.data.availableContracts.filter((candidate) => String(candidate.expiry) === chartExpiry);
    const candidate = [...(preferred.length ? preferred : q.data.availableContracts)]
      .sort((a, b) => Math.abs(Date.parse(a.expiry) - Date.parse(day || expiry)) - Math.abs(Date.parse(b.expiry) - Date.parse(day || expiry)) || Math.abs(Number(a.strike) - Number(spot ?? 0)) - Math.abs(Number(b.strike) - Number(spot ?? 0)))[0];
    if (!candidate) return;
    const next = new URLSearchParams(params);
    next.set("chartExpiry", String(candidate.expiry));
    next.set("strike", String(candidate.strike));
    next.set("pin", "true");
    setParams(next, { replace: true });
  }, [chartExpiry, day, expiry, fixedPair, params, q.data, requestedChartExpiry, setParams, spot]);
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
  const validManualBounds = (index: number) => {
    const candidate = axisBounds[index];
    if (!candidate) return null;
    const min = Number(candidate.min);
    const max = Number(candidate.max);
    return Number.isFinite(min) && Number.isFinite(max) && min < max
      ? { min, max }
      : null;
  };
  const selectedLevels = useMemo(
    () => resistance.flatMap((row) => {
      const selectedLevel = row.selected as Row | null | undefined;
      const selectedSupport = row.support as Row | null | undefined;
      return [
        { row, side: "R" as const, value: Number(selectedLevel?.resistance) },
        { row, side: "S" as const, value: Number(selectedSupport?.support) },
      ].filter((level) => Number.isFinite(level.value));
    }),
    [resistance],
  );
  const plottedLevels = useMemo(
    () => selectedLevels.filter(({ value }) => levelIsInSessionRange(value, visibleUnderlyingBounds)),
    [selectedLevels, visibleUnderlyingBounds],
  );
  const measured = points.length === 2 ? measurePanes(panes ?? [], points[0], points[1], Number(quantity)) : null;
  const signals = useMemo(() => scalperPairedBody80Signals(panes ?? [], interval), [panes, interval]);
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
      dataZoom: [{type:"inside",xAxisIndex: rows.map((_,i)=>i).concat(rows.length), zoomOnMouseWheel:true, moveOnMouseMove: !selecting,filterMode:"filter"}, {type:"slider",xAxisIndex:rows.map((_,i)=>i).concat(rows.length),bottom:5,height:18,filterMode:"filter"}],
      grid: [...rows.map((_, i) =>
        narrow
          ? {
              left: 70,
              right: 30,
              top: `${4 + i * 20}%`,
              height: "15%",
            }
          : i === 0
            ? { left: 70, right: "40%", top: 45, bottom: "30%" }
            : {
                left: "62%",
                right: 60,
                top: i === 1 ? 45 : "52%",
                height: "38%",
              },
      ), {left:70,right:narrow?30:"40%",top:narrow?"66%":"74%",height:narrow?"19%":"15%"}],
      xAxis: [...rows, rows[0]].map((_, i) => ({
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
      yAxis: [...rows.map((p, i) => {
        const manual = validManualBounds(i);
        return {
        ...evidenceValueAxis,
        type: "value" as const,
        gridIndex: i,
        scale: true,
        min: manual?.min,
        max: manual?.max,
        position: "right" as const,
        axisLabel: { fontSize: 12 },
        splitLine: { lineStyle: { color: "#E8EBEF" } },
        name:
          p.identity.exchange === "NSE"
            ? `${label} · price`
            : `${p.identity.strike} ${String(p.identity.tradingsymbol).slice(-2)} · ₹`,
      };}), lowerPane === "rsi"
        ? {...evidenceValueAxis,type:"value" as const,gridIndex:rows.length,min:0,max:100,name:"RSI (14)",position:"right" as const}
        : lowerPane === "macd"
          ? {...evidenceValueAxis,type:"value" as const,gridIndex:rows.length,scale:true,name:"MACD (12,26,9)",position:"right" as const}
          : {...evidenceValueAxis,type:"value" as const,gridIndex:rows.length,min:lowerPane === "oi_current" ? 0 : undefined,name:lowerPane === "oi_current" ? "Current OI" : lowerPane === "oi_cumulative" ? "Cumulative ΔOI" : "Interval ΔOI",position:"right" as const}],
      series: [...rows.flatMap<SeriesOption>((p, i) => {
        const bars = new Map(
          p.bars.filter((b) => b.closed).map((b) => [String(b.end), b]),
        );
        return [
          {
            name: String(p.identity.tradingsymbol),
            type: "candlestick" as const,
            itemStyle: candleColors,
            markArea: measured && openAt(p.bars, measured.start)!=null && closeAt(p.bars, measured.end)!=null ? {
              silent:true,itemStyle:{color:"rgba(190,24,93,0.09)",borderWidth:1,borderColor:"#be185d"},
              data:[[{xAxis:measured.start,yAxis:Math.min(openAt(p.bars,measured.start)!,closeAt(p.bars,measured.end)!)},{xAxis:measured.end,yAxis:Math.max(openAt(p.bars,measured.start)!,closeAt(p.bars,measured.end)!)}]],
            } : {data:[]},
            markPoint: {symbol:"circle",symbolSize:9,label:{show:true,formatter:"{b}"},data:[
              ...points.flatMap((t,j)=>{const v=j===0?openAt(p.bars,t):closeAt(p.bars,t);return v==null?[]:[{name:j===0?"A · open":"B · close",coord:[t,v]}];}),
              ...signals.flatMap((event) => {
                const side = optionSide(p.identity);
                if (side == null) return [{ name: `${event.direction} CONFIRM`, coord: [event.setupTime, event.setupClose], symbol: event.direction === "CALL" ? "arrow" : "pin", itemStyle: { color: event.direction === "CALL" ? "#2563eb" : "#d97706" } }];
                if (side !== (event.direction === "CALL" ? "CE" : "PE")) return [];
                const setup = p.bars.find((bar) => String(bar.end) === event.setupTime);
                return setup?.close == null ? [] : [{ name: `${side} CONFIRM`, coord: [event.setupTime, Number(setup.close)], symbol: "diamond", itemStyle: { color: side === "CE" ? "#2563eb" : "#d97706" } }];
              }),
            ]},
            markLine:
              i === 0 && (showLevels || showGrid)
                ? {
                    symbol: "none",
                    silent: true,
                    label: { position: "insideEndTop" as const, formatter: "{b}" },
                    data: [
                      ...(showLevels ? plottedLevels.map(({ row, value, side }) => ({
                        name: `${String(row.timeframe).toUpperCase()} ${side} · preview`,
                        yAxis: value,
                        lineStyle: { type: "dashed" as const, color: side === "R" ? "#c93346" : "#087a55" },
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
      }), ...(lowerPane === "rsi" ? [
        {name:"RSI (14)",type:"line" as const,xAxisIndex:rows.length,yAxisIndex:rows.length,showSymbol:false,connectNulls:false,lineStyle:{color:"#7c3aed"},data:times.map(t=>indicators.get(t)?.rsi??null)},
      ] : lowerPane === "macd" ? [
        ...(["macd","signal","histogram"] as const).map((key,i)=>({name:key==="macd"?"MACD":key==="signal"?"Signal":"Histogram",type:key==="histogram"?"bar" as const:"line" as const,xAxisIndex:rows.length,yAxisIndex:rows.length,showSymbol:false,connectNulls:false,itemStyle:{color:["#2563eb","#d97706","#64748b"][i]},data:times.map(t=>indicators.get(t)?.[key]??null)})),
      ] : rows.filter(p=>p.identity.exchange === "NFO").map((p,i)=>{
        const valueKey=lowerPane === "oi_current" ? "current" : lowerPane === "oi_cumulative" ? "cumulative_change" : "interval_change";
        const oiByTime=new Map(p.oiHistory.map(row=>[String(row.event_time),row[valueKey]]));
        return {name:`${String(p.identity.tradingsymbol)} ${valueKey === "current" ? "OI" : valueKey === "interval_change" ? "ΔOI" : "Cum ΔOI"}`,type:valueKey === "current" ? "line" as const : "bar" as const,xAxisIndex:rows.length,yAxisIndex:rows.length,showSymbol:false,connectNulls:false,lineStyle:{color:i?"#087a55":"#c93346"},itemStyle:{color:i?"#087a55":"#c93346",opacity:0.65},data:times.map(t=>oiByTime.get(t)==null?null:Number(oiByTime.get(t))),markLine:valueKey === "current" ? undefined : {silent:true,symbol:"none",data:[{yAxis:0}],label:{show:false}}};
      }))],
    };
  }, [panes, narrow, showEma, showLevels, showGrid, lowerPane, indicators, selecting, points, quantity, label, selectedLevels, plottedLevels, visibleUnderlyingBounds, axisBounds, signals]);
  return (
    <div className={styles.scalperModule} data-renderer={renderer}>
      <div className={`${styles.toolbar} ${styles.scalperCommandBar}`}>
        <h2>SCALPER</h2>
        <label title="Chart renderer">
          <select aria-label="Scalper renderer" value={renderer} onChange={(event) => updateView("renderer", event.target.value === "classic" ? "classic" : "")}>
            <option value="aligned">Aligned</option>
            <option value="classic">Classic ECharts</option>
          </select>
        </label>
        <label title="Chart range">
          <select
            aria-label="Chart range"
            value={oneDay ? "day" : "all"}
            onChange={(e) => updateView("range", e.target.value)}
          >
            <option value="day">1 day</option>
            <option value="all">All retained days</option>
          </select>
        </label>
        {oneDay && (
          <label title="Trading day (IST)">
            <select
              aria-label="Trading day (IST)"
              value={day}
              onChange={(e) => updateView("day", e.target.value)}
            >
              {days.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        )}
        <label title="Candle interval">
          <select
            aria-label="Interval"
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value))}
          >
            <option value={1}>1m</option>
            <option value={5}>5m</option>
            <option value={15}>15m</option>
            <option value={60}>60m</option>
          </select>
        </label>
        <label title="Paired strike">
          <select aria-label="Paired strike" disabled={!!fixedPair} value={selected} onChange={(e) => setStrike(e.target.value)}>
            {[...new Set([...(availableStrikes.length ? availableStrikes : strikes), ...(selected ? [Number(selected)] : [])])]
              .sort((a, b) => a - b)
              .map((s) => (
                <option key={s}>{s}</option>
              ))}
          </select>
        </label>
        <label title="Exact-contract expiry">
          <select aria-label="Exact-contract expiry" disabled={!!fixedPair} value={effectiveExpiry} onChange={(event) => {
            const nextExpiry = event.target.value;
            const candidates = availableContracts.filter((row) => String(row.expiry) === nextExpiry).map((row) => Number(row.strike));
            const nextStrike = [...candidates].sort((a, b) => Math.abs(a - Number(spot ?? 0)) - Math.abs(b - Number(spot ?? 0)))[0];
            const next = new URLSearchParams(params);
            next.set("chartExpiry", nextExpiry);
            if (nextStrike != null) next.set("strike", String(nextStrike));
            setParams(next);
          }}>{availableExpiries.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        </label>
        <button disabled={!!fixedPair} onClick={() => setStrike(selected)}>Pin</button>
        <button disabled={!!fixedPair} onClick={() => setStrike("")}>ATM</button>
        <strong
          className={effectiveExpiry !== expiry ? styles.scalperPairScope : undefined}
          title={effectiveExpiry !== expiry ? `Current chain ${expiry}; retained chart pair ${effectiveExpiry}. Values are not mixed.` : `Retained chart pair and current chain both use ${effectiveExpiry}.`}
        >
          {fixedPair ? "FIXED" : strike ? "PINNED" : "ATM AUTO"}
          {effectiveExpiry !== expiry
            ? ` · PAIR ${effectiveExpiry.slice(5)} ≠ CHAIN ${expiry.slice(5)}`
            : ` · PAIR/CHAIN ${effectiveExpiry.slice(5)}`}
        </strong>
        <details className={styles.scalperCompactMenu}>
          <summary>Layers</summary>
          <div>
            <label><input type="checkbox" checked={showEma} onChange={(e) => setShowEma(e.target.checked)}/> EMA9</label>
            <label><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)}/> 50-point grid</label>
            <label><input type="checkbox" checked={showLevels} onChange={(e) => setShowLevels(e.target.checked)}/> D/W/M R&amp;S</label>
            <span>{plottedLevels.length}/{selectedLevels.length} levels inside session range</span>
          </div>
        </details>
        <details className={styles.scalperCompactMenu}>
          <summary>Measure {measured ? `₹${valueText(measured.pnl)}` : "A→B"}</summary>
          <div>
            <button disabled={!selected || !effectiveExpiry || q.isFetching || (panes?.length??0)<3} onClick={() => {setFixedPair(fixedPair?null:{strike:selected,expiry:effectiveExpiry});setPoints([]);setSelecting(false);}}>{fixedPair?"Unlock pair":"Fix pair"}</button>
            <label>Quantity <input aria-label="Measurement quantity" type="number" min={1} step={1} value={quantity} onChange={e=>setQuantity(e.target.value)} style={{width:90}} /></label>
            <button disabled={!fixedPair || q.isFetching} onClick={()=>{setPoints([]);setSelecting(true);}}>Pick A open → B close</button>
            <button onClick={()=>{setPoints([]);setSelecting(false);}}>Clear</button>
            {fixedPair && [0, 1].map((index) => <label key={index}>{index === 0 ? "A open" : "B close"}<select
              aria-label={index === 0 ? "Measurement start time" : "Measurement end time"}
              value={points[index] ?? ""}
              disabled={index === 1 && !points[0]}
              onChange={(event) => {
                setPoints((current) => !event.target.value ? [] : index === 0 ? [event.target.value] : [current[0] ?? times[0], event.target.value].sort());
                setSelecting(false);
              }}
            ><option value="">Choose candle</option>{times.map((time) => <option key={time} value={time}>{new Date(time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}</option>)}</select></label>)}
            <small>{selecting ? `Select ${points.length ? "B at candle close" : "A at candle open"}` : "Browser-only visual measurement; no order or booked P&L."}</small>
          </div>
        </details>
        <details className={`${styles.axisControls} ${styles.scalperCompactMenu}`}>
          <summary>Axes</summary>
          <div>
            <p>Auto fits visible candles. Enter both limits to lock one pane.</p>
            {(panes ?? []).map((pane, index) => {
              const bounds = axisBounds[index] ?? { min: "", max: "" };
              const locked = validManualBounds(index) != null;
              return <div key={String(pane.identity.tradingsymbol)}>
                <strong>{String(pane.identity.tradingsymbol)}</strong>
                <label>Min <input aria-label={`${String(pane.identity.tradingsymbol)} price-axis minimum`} inputMode="decimal" value={bounds.min} onChange={event=>setAxisBounds(current=>({...current,[index]:{...bounds,min:event.target.value}}))}/></label>
                <label>Max <input aria-label={`${String(pane.identity.tradingsymbol)} price-axis maximum`} inputMode="decimal" value={bounds.max} onChange={event=>setAxisBounds(current=>({...current,[index]:{...bounds,max:event.target.value}}))}/></label>
                <span>{locked ? "Locked" : bounds.min || bounds.max ? "Enter min < max" : "Auto"}</span>
                <button type="button" disabled={!bounds.min && !bounds.max} onClick={()=>setAxisBounds(current=>{const next={...current};delete next[index];return next;})}>Reset</button>
              </div>;
            })}
          </div>
        </details>
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
            Export CSV
          </button>
        )}
      </div>
      <ScalperOiTopline panes={panes} />
      <section className={styles.measurement} aria-label="Browser-only position measurement">
        <div className={styles.toolbar}>
          <button disabled={!selected || !effectiveExpiry || q.isFetching || (panes?.length??0)<3} onClick={() => {setFixedPair(fixedPair?null:{strike:selected,expiry:effectiveExpiry});setPoints([]);setSelecting(false);}}>{fixedPair?"Unlock visual pair":"Fix pair for measurement"}</button>
          <label>Quantity (units)<input aria-label="Measurement quantity" type="number" min={1} step={1} value={quantity} onChange={e=>setQuantity(e.target.value)} style={{width:90}} /></label>
          <button disabled={!fixedPair || q.isFetching} onClick={()=>{setPoints([]);setSelecting(true);}}>Select A entry → B exit on chart</button>
          <button onClick={()=>{setPoints([]);setSelecting(false);}}>Clear measurement</button>
          {renderer === "classic" && <label>Lower chart beside candles
            <select aria-label="Scalper lower chart" value={lowerPane} onChange={event=>setLowerPane(event.target.value as typeof lowerPane)}>
              <option value="oi_interval">CE / PE interval ΔOI</option>
              <option value="oi_current">CE / PE current OI</option>
              <option value="oi_cumulative">CE / PE cumulative ΔOI</option>
              <option value="rsi">Underlying RSI (14)</option>
              <option value="macd">Underlying MACD (12,26,9)</option>
            </select>
          </label>}
        </div>
        <p role="status">{fixedPair?`VISUAL PAIR FIXED · ${symbol} ${fixedPair.strike} · ${fixedPair.expiry}`:"Fix the pair to begin."} {selecting?`Click ${points.length?"B exit (candle close)":"A entry (candle open)"} on any price pane, or use the time controls below.`:"A measures the selected candle open; B measures the selected candle close. Scroll to zoom; drag to pan."}</p>
        {fixedPair && <div className={styles.toolbar}>{[0,1].map(i=><label key={i}>{i===0?"A entry candle (open)":"B exit candle (close)"}<select aria-label={i===0?"Measurement start time":"Measurement end time"} value={points[i]??""} onChange={e=>{setPoints(old=>!e.target.value?[]:i===0?[e.target.value]:[old[0]??times[0],e.target.value].sort());setSelecting(false);}} disabled={i===1&&!points[0]}><option value="">Choose completed-candle time</option>{times.map(t=><option key={t} value={t}>{new Date(t).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST</option>)}</select></label>)}</div>}
        {measured && <>
          <strong data-testid="measurement-pnl">Illustrative long CE + PE P&amp;L: ₹{valueText(measured.pnl)}</strong>
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Measurement values scroll area"><table aria-label="Synchronized price changes"><thead><tr><th>Instrument</th><th>A open (entry)</th><th>B close (exit)</th><th>Δ price</th><th>Δ × quantity</th></tr></thead><tbody>{measured.rows.map(r=><tr key={r.symbol}><th>{r.symbol}</th><td>{valueText(r.from)}</td><td>{valueText(r.to)}</td><td>{valueText(r.delta)}</td><td>{r.kind==="UNDERLYING"?"—":valueText(r.delta==null||!Number.isSafeInteger(Number(quantity))||Number(quantity)<=0?null:r.delta*Number(quantity))}</td></tr>)}<tr><th>CE + PE</th><td>—</td><td>—</td><td>{valueText(measured.combined)}</td><td>{valueText(measured.pnl)}</td></tr></tbody></table></div>
          <p>{measured.start} → {measured.end} · UTC source times. Missing matching closes: — (no nearest-time substitution).</p>
        </>}
        <small>Browser memory only; cleared on reload or leaving this view. Quantity 65 is an editable visual default, not verified lot size. A candle open to B candle close price delta, not Greek Delta. Long both legs, before costs/slippage; not a trade, order or booked P&amp;L. OI lower panes use session-aligned retained quote endpoints; gaps are not zero.</small>
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
          Monthly / weekly / daily R &amp; S
        </label>
        <span>{plottedLevels.length}/{selectedLevels.length} levels inside selected session high–low</span>
        {["daily", "weekly"].map((timeframe) => (
          <label key={timeframe}>
            {timeframe} R lookback{" "}
            <input
              key={params.get(`${timeframe}Lookback`) ?? "unset"}
              type="number"
              min={1}
              max={timeframe === "daily" ? 400 : 100}
              placeholder={timeframe === "daily" ? "20" : "12"}
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
        {resistance.flatMap((row) =>
          [
            { side: "R", value: (row.selected as Row | null | undefined)?.resistance },
            { side: "S", value: (row.support as Row | null | undefined)?.support },
          ].map((level) => {
            const value = level.value == null ? null : Number(level.value);
            const offscreen =
              value != null &&
              !levelIsInSessionRange(value, visibleUnderlyingBounds);
            return (
              <span key={String(row.timeframe) + level.side}>
                {String(row.timeframe).toUpperCase()} {level.side} ·{" "}
                {String(row.lookback ?? "—")} bars
                <strong>
                  {value == null ? "—" : value.toLocaleString("en-IN")}
                </strong>
                {value == null
                  ? String(row.state).replaceAll("_", " ")
                  : offscreen
                    ? value > (visibleUnderlyingBounds?.max ?? Number.POSITIVE_INFINITY)
                      ? "above view ↑"
                      : "below view ↓"
                    : "in view"}
              </span>
            );
          }),
        )}
      </div>
      <details className={styles.scalperEvidence}>
        <summary>Support/resistance rule, origin and lifecycle evidence</summary>
        <p>
          Preview: open of unbroken bearish candle; largest open-minus-close
          body, then latest origin. Support is the lowest unbroken close from
          every candle colour. A later completed same-timeframe close strictly
          beyond a level breaks it permanently; equality is a touch. Monthly,
          weekly and daily use 12, 12 and 20 completed bars by default; daily
          and weekly remain configurable. Research overlays, not approved trade
          signals.
          The price pane renders levels only inside the selected session's actual high–low. Off-range levels remain here for inspection and never stretch the candle scale.
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
      {renderer === "classic" && <div className={styles.contractHeaders}>
        {panes?.map((p) => (
          <strong key={String(p.identity.tradingsymbol)}>
            {String(p.identity.tradingsymbol)} · {interval}m ·{" "}
            {fixedPair ? "Visual pair fixed" : strike ? "Pinned pair" : "Auto pair"}
          </strong>
        ))}
      </div>}
      {renderer === "aligned" && panes && panes.length > 0 ? <Suspense fallback={<p>Loading aligned terminal…</p>}>
        <AlignedTerminal
          panes={panes}
          legs={effectiveExpiry === expiry ? legs : []}
          levels={selectedLevels}
          bounds={visibleUnderlyingBounds}
          showEma={showEma}
          showLevels={showLevels}
          showGrid={showGrid}
          points={points}
          selecting={selecting}
          onTimeClick={(time) => {
            const index = times.indexOf(time);
            if (index >= 0) pickPoint(index);
          }}
          indicators={indicators}
          measured={measured}
          quantity={Number(quantity)}
          strikes={strikes}
          selectedStrike={selected}
          defaultStrike={defaultStrike}
          fixed={Boolean(fixedPair)}
          onStrike={setStrike}
          expiry={effectiveExpiry}
          maxPainStrikes={effectiveExpiry === expiry ? maxPainStrikes : []}
          signals={signals}
        />
      </Suspense> : renderer === "classic" ? <div className={styles.scalperWorkspace}>
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
        <div className={styles.scalperSideDock}>
          <OiPriceProfile legs={legs} bounds={visibleUnderlyingBounds} />
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
      </div> : null}
      <section className={styles.plot}>
        <div className={styles.toolbar}>
          <h3>Exact selected contracts · OI through time</h3>
          <label>
            OI view{" "}
            <select value={oiMetric} onChange={(event)=>setOiMetric(event.target.value as typeof oiMetric)}>
              <option value="interval_change">Interval ΔOI</option>
              <option value="cumulative_change">Cumulative ΔOI</option>
              <option value="current">Current OI</option>
            </select>
          </label>
        </div>
        <p>
          Session-open anchored {interval}-minute endpoints. Interval change is
          endpoint minus the preceding comparable endpoint; cumulative change
          is endpoint minus one fixed first-observation baseline. Missing
          endpoints remain gaps.
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
                  name: oiMetric==="current" ? "Provider-native OI" : "Signed provider-native ΔOI",
                  min: oiMetric==="current" ? 0 : undefined,
                },
                series: panes
                  .filter((p) => p.identity.exchange === "NFO")
                  .map((p, i) => ({
                    name: String(p.identity.tradingsymbol),
                    type: "line",
                    showSymbol: false,
                    lineStyle: { color: i ? "#659E8B" : "#BE7869" },
                    connectNulls: false,
                    data: p.oiHistory.map(row=>[
                      String(row.event_time),
                      row[oiMetric] == null ? null : Number(row[oiMetric]),
                    ]),
                    markLine:oiMetric==="current"?undefined:{silent:true,symbol:"none",data:[{yAxis:0}],label:{show:false}},
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
      <section className={`${styles.warning} ${styles.scalperEvidence}`} tabIndex={0} role="region" aria-label="Closed-candle research evidence">
        <h3>Paired EMA9 body80 / next-open entry indicators</h3>
        <p>
          {SCALPER_ENTRY_RULE} · {signals.length} confirmed setup{signals.length === 1 ? "" : "s"}. CALL requires two red NIFTY and CE closes below their own EMA9, then green crossovers with at least 80% of each real body above EMA9. PUT requires two green NIFTY closes above EMA9, then an 80% bearish cross, plus the same bullish reversal confirmation in the exact PE. Exact timestamps and next scheduled open only; missing bars block entry.
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
    </div>
  );
}
