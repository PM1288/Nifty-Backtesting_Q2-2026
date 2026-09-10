import type { EvidenceReader } from './tradingAnalyticsSmartApi';
export type AnalyticsUnderlying = { symbol: string; label: string; token: string; kind: string; optionType: string };
export const niftyUnderlying: AnalyticsUnderlying = { symbol:'NIFTY',label:'Nifty 50',token:'99926000',kind:'INDEX',optionType:'OPTIDX' };
export async function analyticsUniverse(read: EvidenceReader, asOf: string): Promise<AnalyticsUnderlying[]> {
  const rows = await read('underlying_universe', `SELECT DISTINCT ON (s.name) s.name symbol,s.tradingsymbol label,s.symbol_token token,
    CASE WHEN s.instrumenttype='AMXIDX' THEN 'INDEX' ELSE 'STOCK' END kind,
    CASE WHEN s.instrumenttype='AMXIDX' THEN 'OPTIDX' ELSE 'OPTSTK' END "optionType"
    FROM public.instruments s WHERE s.exchange='NSE' AND s.updated_at<=$1::timestamptz
    AND ((s.instrumenttype='AMXIDX' AND s.name LIKE 'NIFTY%') OR
      ((s.instrumenttype='AMXIDX' OR s.tradingsymbol=s.name||'-EQ') AND EXISTS(
        SELECT 1 FROM public.instruments o WHERE o.exchange='NFO' AND o.name=s.name
        AND o.instrumenttype IN('OPTIDX','OPTSTK') AND o.expiry>=($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date AND o.updated_at<=$1::timestamptz)))
    ORDER BY s.name,s.updated_at DESC,s.symbol_token`, asOf);
  return rows as AnalyticsUnderlying[];
}
export async function analyticsUnderlying(read: EvidenceReader, asOf: string, symbol='NIFTY'): Promise<AnalyticsUnderlying> {
  const rows = await read('selected_underlying', `SELECT DISTINCT ON (s.name) s.name symbol,s.tradingsymbol label,s.symbol_token token,
    CASE WHEN s.instrumenttype='AMXIDX' THEN 'INDEX' ELSE 'STOCK' END kind,
    CASE WHEN s.instrumenttype='AMXIDX' THEN 'OPTIDX' ELSE 'OPTSTK' END "optionType"
    FROM public.instruments s WHERE s.exchange='NSE' AND s.name=$2 AND s.updated_at<=$1::timestamptz
    AND ((s.instrumenttype='AMXIDX' AND s.name LIKE 'NIFTY%') OR
      ((s.instrumenttype='AMXIDX' OR s.tradingsymbol=s.name||'-EQ') AND EXISTS(
        SELECT 1 FROM public.instruments o WHERE o.exchange='NFO' AND o.name=s.name
        AND o.instrumenttype IN('OPTIDX','OPTSTK') AND o.expiry>=($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date AND o.updated_at<=$1::timestamptz)))
    ORDER BY s.name,s.updated_at DESC,s.symbol_token`, asOf, symbol);
  return selectUnderlying(rows as AnalyticsUnderlying[], symbol);
}
export function selectUnderlying(rows: AnalyticsUnderlying[], symbol='NIFTY'): AnalyticsUnderlying {
  const found=rows.find(r=>r.symbol===symbol);
  if(found) return found;
  // Preserve the existing default identity on a failed master read, never substitute a different requested stock.
  if(symbol==='NIFTY') return niftyUnderlying;
  throw new Error('UNDERLYING_NOT_AVAILABLE');
}
