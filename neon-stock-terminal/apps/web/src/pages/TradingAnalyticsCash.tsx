import { lazy, Suspense, useState } from "react";
import styles from "./TradingAnalyticsPage.module.css";
import { evidenceValueAxis } from "../lib/tradingAnalyticsChartView";
import { evidenceCsv } from "../lib/tradingAnalyticsExport";
const Chart = lazy(async () => ({ default: (await import("../components/visual/EChartSurface")).EChartSurface }));
type Row = Record<string, unknown>;
export type CashHistory = { rows: Row[]; latestDate: string | null; requestedDate: string; source: string; unit: string; state: string; knowledgeState: string; note: string };
const number = (v: unknown) => v == null ? "—" : new Intl.NumberFormat("en-IN", {minimumFractionDigits:2, maximumFractionDigits:2}).format(Number(v));
export function TradingAnalyticsCash({data,onInspect}: {data?: CashHistory;onInspect:(r:Row)=>void}) {
  const [date,setDate]=useState("");
  const dates=[...new Set(data?.rows.map(r=>String(r.market_date))??[])];
  const selected=dates.includes(date)?date:dates[0];
  const rows=data?.rows.filter(r=>r.market_date===selected)??[];
  const chartDates=dates.slice(0,30).reverse();
  function exportRows(){const url=URL.createObjectURL(new Blob([evidenceCsv(data?.rows??[])],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="fii-dii-cash-history.csv";a.click();URL.revokeObjectURL(url);}
  return <section className={styles.plot} aria-label="Daily FII and DII cash segment">
    <header className={styles.toolbar}><h2>Daily FII/FPI & DII · cash segment</h2><label>Cash report date <select value={selected??""} onChange={e=>setDate(e.target.value)} disabled={!dates.length}>{!dates.length&&<option value="">Unavailable</option>}{dates.map(d=><option key={d}>{d}</option>)}</select></label><button onClick={exportRows}>Export cash history CSV</button></header>
    <p>{data?.source??"NSE cash source unavailable"} · ₹ crore · Latest retained: {data?.latestDate??"—"} · Requested report: {data?.requestedDate??"—"} · {data?.state??"DATA_INSUFFICIENT"}</p>
    <div className={styles.tableWrap}><table><caption>Cash purchases, sales and net flow · {selected??"no report"}</caption><thead><tr><th>Participant</th><th>Buy · ₹ crore</th><th>Sell · ₹ crore</th><th>Net · ₹ crore</th><th>Source evidence</th></tr></thead><tbody>{["FII/FPI","DII"].map(p=>{const matches=rows.filter(r=>r.participant_type===p);const r=matches.length===1?matches[0]:null;return <tr key={p}><th>{p}</th>{["buy_value","sell_value","net_value"].map(k=><td key={k} style={{textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{number(r?.[k])}</td>)}<td><button onClick={()=>onInspect(r??{participant:p,state:matches.length?"AMBIGUOUS_ROWS":"DATA_INSUFFICIENT"})}>Inspect</button></td></tr>;})}</tbody></table></div>
    <p className={styles.warning}>{data?.note??"No retained cash report."} {data?.knowledgeState?.replaceAll("_"," ")}</p>
    {!!chartDates.length&&<Suspense fallback={<p>Loading cash history…</p>}><Chart className={styles.chart} ariaLabel="Daily FII and DII net cash flow in INR crore" option={{animation:false,tooltip:{trigger:"axis"},legend:{data:["FII/FPI","DII"]},grid:{left:28,right:28,top:65,bottom:55,containLabel:true},xAxis:{type:"category",data:chartDates,axisLabel:{rotate:30}},yAxis:{...evidenceValueAxis,type:"value",name:"₹ crore"},series:["FII/FPI","DII"].map((p,i)=>({name:p,type:"bar",itemStyle:{color:i?"#087a55":"#315ad7"},data:chartDates.map(d=>{const m=data!.rows.filter(r=>r.market_date===d&&r.participant_type===p);return m.length===1&&m[0].net_value!=null?Number(m[0].net_value):null;})}))}}/></Suspense>}
    <details><summary>Full retained cash history · {data?.rows.length??0} rows</summary><pre tabIndex={0}>{JSON.stringify(data?.rows??[],null,2)}</pre></details>
  </section>;
}
