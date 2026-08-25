import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Download, RefreshCw } from "lucide-react";
import { fetchOissV1Dashboard, type OissV1Dashboard } from "../lib/api";
import styles from "./OissV1Page.module.css";

const LENSES = ["now","market","sectors","radar","entry","options","carry","rejected","risk","open-positions","changes","backtest","audit"] as const;
type Lens = typeof LENSES[number];
const n = (value: unknown, digits = 2) => value == null || value === "" ? "—" : Number(value).toFixed(digits);
const statusClass = (status: string) => status.includes("BUY") || status.includes("QUALIFIED") ? styles.positive : status.includes("SELL") || status.includes("NO TRADE") || status.includes("NO CHASE") ? styles.negative : styles.warning;

export function OissV1Page() {
  const params = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useSearchParams();
  const lens = LENSES.includes(params.lens as Lens) ? params.lens as Lens : "now";
  const [data, setData] = useState<OissV1Dashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const selectedSymbol = query.get("symbol") ?? "";
  const selected = useMemo(() => data?.radar.find((row) => row.symbol === selectedSymbol) ?? data?.radar[0] ?? null, [data, selectedSymbol]);

  const load = () => {
    setLoading(true); setError("");
    fetchOissV1Dashboard(query.get("runId") ?? undefined).then((next) => {
      setData(next);
      if (!selectedSymbol && next.radar[0]) { const copy = new URLSearchParams(query); copy.set("symbol", next.radar[0].symbol); setQuery(copy, { replace: true }); }
    }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setLoading(false));
  };
  useEffect(load, [query.get("runId")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <div className={styles.state}>Loading OISS immutable run evidence…</div>;
  if (error && !data) return <div className={styles.state}><strong>OISS unavailable</strong><span>{error}</span><button onClick={load}>Retry</button></div>;
  if (!data) return null;
  const run = data.run;
  const summary = run.sections?.summary ?? {};
  const pick = (symbol: string) => { const copy = new URLSearchParams(query); copy.set("symbol", symbol); setQuery(copy, { replace: true }); };
  const openLens = (next: Lens) => navigate(`/strategy/oiss-v1-202608/${next}?${query.toString()}`);
  const download = (format: "json" | "csv" | "xlsx") => window.open(`${import.meta.env.VITE_API_BASE_URL ?? ""}/v1/oiss-v1/export?runId=${encodeURIComponent(run.run_id)}&format=${format}`, "_blank", "noopener,noreferrer");

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>Independent strategy · intelligence/shadow</span><h1>OISS v1.202608</h1><p>Explainable market, opportunity, execution, risk, carry and historical evidence. Existing OIIS remains independent.</p></div>
      <div className={styles.actions}><button onClick={load}><RefreshCw size={14}/> Refresh</button><button onClick={() => download("csv")}><Download size={14}/> CSV</button><button onClick={() => download("xlsx")}><Download size={14}/> Excel</button><button onClick={() => download("json")}><Download size={14}/> JSON</button></div>
    </header>
    <section className={styles.context} aria-label="OISS run context">
      {[['Run',String(run.run_id).slice(0,8)],['As of',new Date(run.scan_timestamp).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})],['Scan',`#${run.scan_sequence}`],['Mode',run.trading_mode],['Formula',run.formula_version],['Config',run.config_version],['Data',`${run.data_quality_grade} · ${n(run.data_quality_score)}%`],['Stocks',summary.stocks ?? data.radar.length]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </section>
    <nav className={styles.lenses} aria-label="OISS dashboard lenses">{LENSES.map((item)=><button key={item} className={lens===item?styles.active:""} onClick={()=>openLens(item)}>{item.replace('-',' ')}</button>)}</nav>
    <section className={styles.kpis}>
      <article><span>Final decision</span><strong>{run.sections?.final_decision?.decision ?? "DATA INSUFFICIENT"}</strong><small>{run.sections?.final_decision?.reason}</small></article>
      <article><span>Actionable</span><strong>{summary.actionable ?? 0}</strong><small>All gates passed</small></article>
      <article><span>Developing</span><strong>{summary.developing ?? 0}</strong><small>Wait/watch evidence</small></article>
      <article><span>Rejected</span><strong>{summary.rejected ?? 0}</strong><small>Retained for backtest</small></article>
      <article><span>Runtime</span><strong>{n(run.runtime_metrics?.total_duration_ms,0)} ms</strong><small>{run.runtime_metrics?.stocks_evaluated ?? 0} evaluated</small></article>
    </section>

    {lens === "sectors" ? <SectorLens rows={data.sectors}/> : lens === "changes" ? <ChangesLens rows={data.changes}/> : lens === "backtest" ? <BacktestLens data={data}/> : lens === "audit" ? <AuditLens data={data}/> : lens === "open-positions" ? <OpenPositions rows={data.paper}/> : lens === "market" || lens === "risk" ? <ContextLens run={run} lens={lens}/> :
      <section className={styles.workspace}>
        <aside className={styles.radar}><h2>{lens === "rejected" ? "Rejected opportunities" : "Stock radar"}</h2><div className={styles.radarRows}>{data.radar.filter((row)=>lens!=="rejected" || ['NO TRADE','NO CHASE','DATA INSUFFICIENT'].includes(row.canonical_status)).map((row)=><button key={row.candidate_id} className={`${selected?.candidate_id===row.candidate_id?styles.selected:""}`} onClick={()=>pick(row.symbol)}><span className={styles.stock}><i>{row.symbol.slice(0,2)}</i><span><b>{row.symbol}</b><small>{row.company_name || row.symbol}</small></span></span><span>{row.direction}</span><b>{n(row.tqs)}</b><em className={statusClass(row.canonical_status)}>{row.canonical_status}</em></button>)}</div></aside>
        <CandidateEvidence row={selected} lens={lens}/>
        <CandidateInspector row={selected}/>
      </section>}
  </main>;
}

function CandidateEvidence({row,lens}:{row:any;lens:Lens}) { if(!row)return <section/>; const horizons=row.horizon_scores??{}; return <section className={styles.evidence}><div className={styles.titleRow}><div><h2>{row.company_name || row.symbol}</h2><span>{row.symbol} · {row.sector} · {row.direction}</span></div><strong className={statusClass(row.canonical_status)}>{row.canonical_status}</strong></div><div className={styles.scoreGrid}>{[['OFactor',row.ofactor],['XFactor',row.xfactor],['TQS',row.tqs],['Extension',row.extension_atr],['Data quality',row.data_quality_score]].map(([k,v])=><div key={k}><span>{k}</span><strong>{n(v)}</strong></div>)}</div>{lens==='carry'?<div className={styles.carry}>{Object.entries(horizons).map(([key,value]:any)=><div key={key}><b>{key}</b><span>{n(value.score)}</span><em>{value.state}</em></div>)}</div>:lens==='entry'?<JsonBlock title="Entry / stop / targets" value={row.entry_plan}/>:lens==='options'?<JsonBlock title="Option / lot / margin" value={{option:row.option_selection,sizing:row.position_sizing}}/>:<><h3>Why</h3><ul>{(row.why??[]).map((x:string)=><li key={x}>{x}</li>)}</ul><h3>Missing confirmation</h3><ul>{(row.missing_confirmation??[]).map((x:string)=><li key={x}>{x}</li>)}</ul><div className={styles.rule}><span>Upgrade</span><p>{row.upgrade_condition}</p></div><div className={styles.rule}><span>Invalidation</span><p>{row.invalidation}</p></div><JsonBlock title="Forward outcome (separate from decision)" value={{state:row.outcome_state,returns:row.returns,extrema:row.extrema}}/></>}</section> }
function CandidateInspector({row}:{row:any}) { if(!row)return <aside/>; return <aside className={styles.inspector}><h2>Execution inspector</h2><dl><dt>Entry zone</dt><dd>{n(row.entry_plan?.entry_zone_low)}–{n(row.entry_plan?.entry_zone_high)}</dd><dt>Stop</dt><dd>{n(row.entry_plan?.stop)}</dd><dt>Target 1 / 2</dt><dd>{n(row.entry_plan?.target_1)} / {n(row.entry_plan?.target_2)}</dd><dt>Lot size</dt><dd>{row.lot_size ?? '—'}</dd><dt>Final lots</dt><dd>{row.position_sizing?.final_lots ?? 0}</dd><dt>Planned loss</dt><dd>₹{n(row.position_sizing?.maximum_planned_loss)}</dd></dl><Link to={`/analytics/stock/${encodeURIComponent(row.symbol)}?strategy=OISS_V1_202608&source=oiss`}>Open Stock 360</Link><Link to={`/paper-trading?strategy=OISS_V1_202608&symbol=${encodeURIComponent(row.symbol)}`}>Open Paper evidence</Link><JsonBlock title="Audit snapshot" value={row.feature_snapshot}/></aside> }
function SectorLens({rows}:{rows:any[]}) { return <section className={styles.tableCard}><h2>Sector rotation</h2><table><thead><tr><th>Rank</th><th>Sector</th><th>Relative strength</th><th>Breadth</th><th>Money flow</th><th>Participation</th><th>Score</th><th>State</th></tr></thead><tbody>{rows.map(r=><tr key={r.sector}><td>{r.rank}</td><td>{r.sector}</td><td>{n(r.relative_strength)}</td><td>{n(r.breadth)}</td><td>{n(r.money_flow)}</td><td>{n(r.participation)}</td><td>{n(r.score)}</td><td>{r.state}</td></tr>)}</tbody></table></section> }
function ChangesLens({rows}:{rows:any[]}) { return <section className={styles.tableCard}><h2>Scan-to-scan changes</h2><table><thead><tr><th>Stock</th><th>Previous</th><th>Current</th><th>O Δ</th><th>X Δ</th><th>TQS Δ</th><th>Why changed</th></tr></thead><tbody>{rows.map(r=><tr key={r.symbol}><td>{r.symbol}</td><td>{r.previous_status??'NEW'}</td><td>{r.current_status}</td><td>{n(Number(r.current_ofactor)-Number(r.previous_ofactor))}</td><td>{n(Number(r.current_xfactor)-Number(r.previous_xfactor))}</td><td>{n(Number(r.current_tqs)-Number(r.previous_tqs))}</td><td>{r.reason_changed}</td></tr>)}</tbody></table></section> }
function BacktestLens({data}:{data:OissV1Dashboard}) { return <section className={styles.tableCard}><h2>Historical evidence</h2><p>Forward outcomes are calculated after immutable decisions and never feed the entry score. Every metric includes sample size.</p><table><thead><tr><th>State</th><th>Sample</th><th>Avg D+1</th><th>Avg D+5</th><th>Avg MFE</th><th>Avg MAE</th></tr></thead><tbody>{data.outcomes.map((r:any)=><tr key={r.outcome_state}><td>{r.outcome_state}</td><td>{r.sample_size}</td><td>{n(r.average_d1)}%</td><td>{n(r.average_d5)}%</td><td>{n(r.average_mfe)}%</td><td>{n(r.average_mae)}%</td></tr>)}</tbody></table><h3>Historical runs</h3><div className={styles.runGrid}>{data.priorRuns.map((r:any)=><a key={r.run_id} href={`?runId=${r.run_id}`}><b>{new Date(r.scan_timestamp).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</b><span>{r.data_quality_grade} · {r.summary?.stocks??0} stocks</span></a>)}</div></section> }
function AuditLens({data}:{data:OissV1Dashboard}) { return <section className={styles.tableCard}><h2>31-section output and immutable audit</h2><ol className={styles.contract}>{(data.run.sections?.contract_sections??[]).map((x:string)=><li key={x}>{x}</li>)}</ol><JsonBlock title="Run identity and sections" value={data.run}/><h3>OIIS comparison (not merged)</h3><table><thead><tr><th>Stock</th><th>OISS status</th><th>OIIS status</th><th>OISS O/X</th><th>OIIS O/X</th></tr></thead><tbody>{data.comparison.slice(0,100).map((r:any)=><tr key={r.symbol}><td>{r.symbol}</td><td>{r.oiss_status}</td><td>{r.oiis_status}</td><td>{n(r.oiss_ofactor)} / {n(r.oiss_xfactor)}</td><td>{n(r.oiis_ofactor)} / {n(r.oiis_xfactor)}</td></tr>)}</tbody></table></section> }
function OpenPositions({rows}:{rows:any[]}) { return <section className={styles.tableCard}><h2>OISS paper positions</h2>{rows.length?<JsonBlock title="Canonical paper ledger links" value={rows}/>:<div className={styles.empty}>NONE — paper activation remains disabled pending shadow validation.</div>}</section> }
function ContextLens({run,lens}:{run:any;lens:Lens}) { return <section className={styles.tableCard}><h2>{lens==='market'?'Market regime, index levels and events':'Portfolio risk'}</h2><p>Unavailable fields remain explicit and are never replaced with zero.</p><JsonBlock title="Persisted run context" value={{sections:run.sections,dataQuality:{grade:run.data_quality_grade,score:run.data_quality_score},runtime:run.runtime_metrics}}/></section> }
function JsonBlock({title,value}:{title:string;value:any}) { return <details className={styles.json}><summary>{title}</summary><pre>{JSON.stringify(value??{},null,2)}</pre></details> }
