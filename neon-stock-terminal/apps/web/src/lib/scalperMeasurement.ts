type Row = Record<string, unknown>;
export type MeasurementPane = { identity: Row; bars: Row[] };
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
export function closeAt(bars: Row[], time: string) {
  const bar = bars.find(b => b.end === time && b.closed === true);
  return number(bar?.close);
}
export function openAt(bars: Row[], time: string) {
  const bar = bars.find(b => b.end === time && b.closed === true);
  return number(bar?.open);
}
export function measurePanes(panes: MeasurementPane[], first: string, last: string, quantity: number) {
  const [start, end] = [first, last].sort();
  const rows = panes.map(p => {
    // Entry is the actual open of A's completed candle; exit is B's actual close.
    // Never borrow an adjacent candle or turn an unavailable value into zero.
    const from = openAt(p.bars, start), to = closeAt(p.bars, end);
    const delta = from == null || to == null ? null : to - from;
    const kind = p.identity.exchange === "NSE" ? "UNDERLYING" : String(p.identity.tradingsymbol).endsWith("CE") ? "CE" : "PE";
    return { kind, symbol: String(p.identity.tradingsymbol), from, to, delta };
  });
  const ce = rows.find(r => r.kind === "CE")?.delta, pe = rows.find(r => r.kind === "PE")?.delta;
  const combined = ce == null || pe == null ? null : ce + pe;
  return { start, end, rows, combined, pnl: combined == null || !Number.isSafeInteger(quantity) || quantity <= 0 ? null : combined * quantity };
}

/** Display-only port of papertrade/whatsapp.py _rsi/_macd and rsiwillr/indicators.go.
 * SMA-seeded EMA and rolling-average RSI (not Wilder smoothing).
 * Missing/partial candles reset warm-up; retained earlier sessions warm the view.
 */
export function scalperIndicators(bars: Row[]) {
  let closes: number[] = [], gains = 0, losses = 0;
  let fast: number | null = null, slow: number | null = null, signal: number | null = null;
  let differences: number[] = [];
  return [...bars].sort((a,b)=>String(a.end).localeCompare(String(b.end))).map(b => {
    const close = b.closed === true ? number(b.close) : null;
    if (close == null) {
      closes=[]; gains=0; losses=0; fast=null; slow=null; signal=null; differences=[];
      return { time:String(b.end), rsi:null, macd:null, signal:null, histogram:null };
    }
    closes.push(close);
    const n=closes.length;
    let rsi: number | null=null;
    if(n>1) {
      const change=close-closes[n-2];
      gains+=Math.max(change,0);losses+=Math.max(-change,0);
      if(n>15){const old=closes[n-15]-closes[n-16];gains-=Math.max(old,0);losses-=Math.max(-old,0);}
      if(n>=15) rsi=losses===0?100:100-100/(1+gains/losses);
    }
    const ema=(prior:number|null,period:number)=>n<period?null:prior==null?closes.slice(-period).reduce((a,v)=>a+v,0)/period:prior+(close-prior)*2/(period+1);
    fast=ema(fast,12);slow=ema(slow,26);
    const macd=fast==null||slow==null?null:fast-slow;
    if(macd!=null){differences.push(macd);if(differences.length>=9)signal=signal==null?differences.slice(-9).reduce((a,v)=>a+v,0)/9:signal+(macd-signal)*0.2;}
    return {time:String(b.end),rsi,macd,signal,histogram:macd==null||signal==null?null:macd-signal};
  });
}
