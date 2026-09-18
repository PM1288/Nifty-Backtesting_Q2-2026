export type PaperRow = Record<string, any>;
export type OutcomeBasis = 'closed' | 'open' | 'eod';
export type AnalyzerTrade = { id: string; raw: PaperRow; symbol: string; strategy: string; direction: string; sector: string; day: string; weekday: string; hour: string; outcome: number | null; pnl: number | null; excluded: string | null; parameters: Record<string, number | null> };
export const analyzerParameters = [
  { id: 'rsi', label: 'Entry RSI (14)', unit: 'RSI' },
  { id: 'volume', label: 'Entry volume / SMA20', unit: '×' },
  { id: 'ofactor', label: 'Entry O factor', unit: 'score' },
  { id: 'xfactor', label: 'Entry X factor', unit: 'score' },
  { id: 'edge', label: 'Entry directional edge', unit: 'score' },
  { id: 'atr', label: 'Entry ATR / reference price', unit: '%' },
  { id: 'spread', label: 'Entry bid/ask spread', unit: 'bps' },
  { id: 'capital', label: 'Entry notional', unit: '₹' },
  { id: 'price', label: 'Entry price', unit: '₹' },
] as const;
export const finite = (value: unknown): number | null => {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const n = Number(value); return Number.isFinite(n) ? n : null;
};
const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const ist = (value: string, options: Intl.DateTimeFormatOptions) => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', ...options });
export function analyzerTrade(raw: PaperRow, basis: OutcomeBasis): AnalyzerTrade {
  const opened = timestamp(raw.opened_at);
  const available = timestamp(raw.evidence_available_at);
  const entryKnown = opened != null && available != null && available <= opened;
  const price = finite(raw.average_entry_price), quantity = finite(raw.opened_quantity), remaining = finite(raw.remaining_quantity);
  const capital = price != null && price > 0 && quantity != null && quantity > 0 ? price * quantity : null;
  const closed = remaining === 0;
  const sourceInvalid = raw.evidence_audit?.status === 'DATA_INVALID';
  let pnl: number | null = null, outcome: number | null = null, excluded: string | null = null;
  if (sourceInvalid) excluded = 'Invalid source evidence';
  else if (capital == null || opened == null || remaining == null || remaining < 0) excluded = 'Missing/invalid entry or quantity';
  else if (basis === 'closed') {
    if (!closed) excluded = 'Position not fully closed';
    else { pnl = finite(raw.realised_pnl); outcome = pnl == null ? null : 100 * pnl / capital; }
  } else if (basis === 'open') {
    if (closed) excluded = 'No remaining position';
    else if (finite(raw.last_mark) == null || timestamp(raw.last_mark_at) == null) excluded = 'Missing mark';
    else { pnl = finite(raw.unrealised_pnl); outcome = pnl == null ? null : 100 * pnl / (price! * remaining); }
  } else if (!raw.intraday_eod_complete) excluded = 'Entry-day EOD unavailable';
  else { pnl = finite(raw.intraday_eod_pnl); outcome = finite(raw.intraday_eod_return_pct); }
  if (outcome == null && !excluded) excluded = 'Outcome unavailable';
  const ev = (key: string) => entryKnown ? finite(raw[key]) : null;
  const ref = ev('evidence_reference_price'), atr = ev('evidence_atr14');
  const quote = timestamp(raw.entry_book_quote_ts), spread = finite(raw.entry_book_spread_bps);
  return { id: String(raw.trade_leg_id ?? raw.trade_group_id), raw, symbol: String(raw.symbol ?? 'Unknown'),
    strategy: `${raw.strategy_id ?? 'Unknown'} · ${raw.strategy_version ?? 'Unversioned'} · ${raw.entry_strategy ?? 'Unspecified'}`,
    direction: raw.side === 'BUY' ? 'LONG' : raw.side === 'SELL' ? 'SHORT' : 'Unknown', sector: String(raw.evidence_sector ?? 'Unknown'),
    day: opened == null ? '' : new Date(opened + 330 * 60_000).toISOString().slice(0,10),
    weekday: opened == null ? 'Unknown' : ist(raw.opened_at, { weekday: 'short' }),
    hour: opened == null ? 'Unknown' : `${ist(raw.opened_at, { hour: '2-digit', hour12:false })}:00 IST`, outcome, pnl, excluded,
    parameters: { rsi: ev('evidence_rsi14'), volume: ev('evidence_volume_ratio'), ofactor: ev('evidence_ofactor'), xfactor: ev('evidence_xfactor'), edge: ev('evidence_directional_edge'),
      atr: atr != null && ref != null && ref > 0 ? 100*atr/ref : null,
      spread: quote != null && opened != null && quote <= opened && opened-quote<=60_000 && spread != null && spread>=0 ? spread : null,
      capital, price } };
}
export function summarizeOutcomes(rows: AnalyzerTrade[]) {
  const included = rows.filter(r => r.outcome != null && !r.excluded);
  const values = included.map(r => r.outcome!).sort((a,b) => a-b), n = values.length;
  const wins = values.filter(x=>x>0).length, losses = values.filter(x=>x<0).length;
  const mean = n ? values.reduce((a,b)=>a+b,0)/n : null;
  const median = n ? (values[Math.floor((n-1)/2)] + values[Math.floor(n/2)])/2 : null;
  // Descriptive Wilson interval; repeated stock/session observations are not independent.
  const p = n ? wins/n : 0, z2=1.96**2, center=(p+z2/(2*(n||1)))/(1+z2/(n||1));
  const margin=1.96*Math.sqrt(p*(1-p)/(n||1)+z2/(4*(n||1)**2))/(1+z2/(n||1));
  return { n, excluded: rows.length-n, symbols: new Set(included.map(r=>r.symbol)).size, wins, losses, flat:n-wins-losses, mean, median,
    winRate:n ? 100*p : null, winLow:n ? 100*(center-margin):null, winHigh:n ? 100*(center+margin):null,
    pnl: n && included.every(r=>r.pnl!=null) ? included.reduce((sum,r)=>sum+r.pnl!,0) : null,
    indication:n<10 ? 'Too few outcomes' : mean!>0 ? 'Positive observed average' : mean!<0 ? 'Negative observed average' : 'Flat observed average' };
}
function ranks(values: number[]) {
  const sorted=values.map((value,index)=>({value,index})).sort((a,b)=>a.value-b.value), result:number[]=[];
  for(let i=0;i<sorted.length;) { let j=i+1;while(j<sorted.length&&sorted[j].value===sorted[i].value)j++;for(let k=i;k<j;k++)result[sorted[k].index]=(i+j-1)/2+1;i=j; } return result;
}
export function correlation(pairs: [number,number][]) {
  const n=pairs.length;
  const pearson=(x:number[],y:number[]) => {if(n<3)return null;const mx=x.reduce((a,b)=>a+b,0)/n,my=y.reduce((a,b)=>a+b,0)/n;let a=0,b=0,c=0;for(let i=0;i<n;i++){a+=(x[i]-mx)*(y[i]-my);b+=(x[i]-mx)**2;c+=(y[i]-my)**2;}return b>0&&c>0?Math.max(-1,Math.min(1,a/Math.sqrt(b*c))):null;};
  const x=pairs.map(p=>p[0]),y=pairs.map(p=>p[1]);return { n, pearson:pearson(x,y), spearman:pearson(ranks(x),ranks(y)) };
}
export function histogram(values: number[], bins=12) {
  if(!values.length)return [];
  let low=Math.min(...values),high=Math.max(...values);if(low===high){low-=0.5;high+=0.5;}
  const width=(high-low)/bins, result=Array.from({length:bins},(_,i)=>({low:low+i*width,high:low+(i+1)*width,count:0,density:0}));
  for(const value of values)result[Math.min(bins-1,Math.max(0,Math.floor((value-low)/width)))].count++;
  for(const bin of result)bin.density=bin.count/values.length/width;return result;
}
export function analyzerGroups(rows: AnalyzerTrade[], group: string, parameter: string) {
  const valid = rows.filter(r=>r.outcome!=null&&!r.excluded);
  const values=valid.map(r=>r.parameters[parameter]).filter((n):n is number=>n!=null).sort((a,b)=>a-b);
  const boundaries=[.25,.5,.75].map(q=>values[Math.floor((values.length-1)*q)]);
  const groups=new Map<string,AnalyzerTrade[]>();
  for(const row of valid){ const value=row.parameters[parameter];const key=group==='parameter'?(value==null?'Parameter unavailable':`Q${1+boundaries.filter(b=>value>b).length}`):String(row[group as keyof AnalyzerTrade] ?? 'Unknown');groups.set(key,[...(groups.get(key)??[]),row]); }
  const dates=[...new Set(valid.map(r=>r.day))].sort();const cutoff=dates.length>=2 ? dates[Math.min(dates.length-1,Math.floor(dates.length*.7))] : null;
  return { boundaries, cutoff, rows:[...groups.entries()].map(([label,trades])=>({label,...summarizeOutcomes(trades),early:summarizeOutcomes(trades.filter(r=>cutoff!=null&&r.day<cutoff)),later:summarizeOutcomes(trades.filter(r=>cutoff!=null&&r.day>=cutoff))})).sort((a,b)=>(b.mean??-Infinity)-(a.mean??-Infinity)) };
}
export function analyzerCsv(rows: AnalyzerTrade[], basis: OutcomeBasis='closed', asOf: string|null=null) {
  const cell=(v:unknown)=>{let text=v==null?'':String(v);if(typeof v==='string'&&/^[=+\-@\t\r]/.test(text))text="'"+text;return `"${text.replaceAll('"','""')}"`;};
  return [['Outcome basis','Ledger refreshed at','Trade leg','Trade group','Symbol','Strategy','Direction','Entry day IST','Return %','PnL INR','Exclusion',...analyzerParameters.map(p=>`${p.label} (${p.unit})`)],...rows.map(r=>[basis,asOf,r.id,r.raw.trade_group_id,r.symbol,r.strategy,r.direction,r.day,r.outcome,r.pnl,r.excluded,...analyzerParameters.map(p=>r.parameters[p.id])])].map(row=>row.map(cell).join(',')).join('\r\n');
}
