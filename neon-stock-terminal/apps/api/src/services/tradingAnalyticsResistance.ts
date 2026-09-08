import { eligibleBars, numeric, type Facts, type Bar } from "./tradingAnalytics";
import { periodCandles } from "./tradingAnalyticsPeriods";

type LevelCandidate = { id:string; side:"R"|"S"; origin:string; price:number; body:number|null; brokenAt:string|null; lifecycle:"UNBROKEN"|"BROKEN" };

export function structuralLevelView(source:Bar[],asOf:string,price:number|null,lookback:number|null) {
  if (lookback==null||lookback<1) return {state:"LOOKBACK_REQUIRED",selected:null,support:null,candidates:[],supportCandidates:[]};
  const available=eligibleBars(source,asOf);
  if(available.length<lookback) return {state:"DATA_INSUFFICIENT",selected:null,support:null,candidates:[],supportCandidates:[]};
  const bars=available.slice(-lookback);
  const resistance:LevelCandidate[]=bars.filter(b=>b.close<b.open).map(b=>{const brokenAt=bars.find(l=>l.end>b.end&&l.close>b.open)?.end??null;return {id:`R:${b.end}:${b.open}`,side:"R",origin:b.end,price:b.open,body:b.open-b.close,brokenAt,lifecycle:brokenAt?"BROKEN":"UNBROKEN"};});
  // Support deliberately comes from closes of every candle colour, not only red candles.
  const supports:LevelCandidate[]=bars.map(b=>{const brokenAt=bars.find(l=>l.end>b.end&&l.close<b.close)?.end??null;return {id:`S:${b.end}:${b.close}`,side:"S",origin:b.end,price:b.close,body:null,brokenAt,lifecycle:brokenAt?"BROKEN":"UNBROKEN"};});
  const recent=(a:LevelCandidate,b:LevelCandidate)=>b.origin.localeCompare(a.origin);
  const activeR=resistance.filter(c=>!c.brokenAt&&(price==null||c.price>price));
  const activeS=supports.filter(c=>!c.brokenAt&&(price==null||c.price<price));
  const r=[...activeR].sort((a,b)=>(b.body??0)-(a.body??0)||recent(a,b))[0]??null;
  const s=[...activeS].sort((a,b)=>a.price-b.price||recent(a,b))[0]??null;
  const selected=r?{...r,resistance:r.price,resistanceBrokenAt:r.brokenAt}:null;
  const support=s?{...s,support:s.price,supportBrokenAt:s.brokenAt}:null;
  return {state:selected||support?"PREVIEW_UNAPPROVED":"NO_VALID_LEVEL",selected,support,
    resistanceAlternatives:{latest:[...activeR].sort(recent)[0]??null,highest:[...activeR].sort((a,b)=>b.price-a.price||recent(a,b))[0]??null,nearest:[...activeR].sort((a,b)=>a.price-b.price||recent(a,b))[0]??null},
    supportAlternatives:{latest:[...activeS].sort(recent)[0]??null,lowest:s,nearest:[...activeS].sort((a,b)=>b.price-a.price||recent(a,b))[0]??null},
    candidates:resistance.map(c=>({...c,resistance:c.price,resistanceBrokenAt:c.brokenAt})),
    supportCandidates:supports.map(c=>({...c,support:c.price,supportBrokenAt:c.brokenAt}))};
}
export function resistanceViews(
  daily: Facts[],
  asOf: string,
  price: number | null,
  dayCount?: number,
  weekCount?: number,
  sessions: Facts[] = [],
) {
  const closeByDate=new Map(sessions.map(r=>[String(r.trade_date),r.market_close_ts]));
  const rows = {
    daily: daily.map((r) => ({
      ...r,
      end: String(closeByDate.get(String(r.date))??`${r.date}T10:00:00Z`),
      knownAt: r.created_at,
      closed: closeByDate.has(String(r.date)) || sessions.length===0,
    })),
    weekly: periodCandles(daily, "week", asOf, sessions),
    monthly: periodCandles(daily, "month", asOf, sessions),
  };
  return Object.entries(rows).map(([timeframe, source]) => {
    const count =
      timeframe === "monthly"
        ? 12
        : timeframe === "weekly"
          ? weekCount
          : dayCount;
    const bars = source
      .filter((r) =>
        ["open", "high", "low", "close"].every(
          (k) => numeric((r as Facts)[k]) != null,
        ),
      )
      .map((r) => ({
        ...r,
        start: String((r as Facts).date),
        end: String(r.end),
        knownAt:
          r.knownAt == null ? null : new Date(String(r.knownAt)).toISOString(),
      })) as Bar[];
    const result = structuralLevelView(bars, asOf, price, count ?? null);
    const available = bars.filter(
      (b) =>
        b.closed &&
        b.knownAt != null &&
        Date.parse(b.knownAt) <= Date.parse(asOf) &&
        Date.parse(b.end) <= Date.parse(asOf),
    ).length;
    const prefix=timeframe==="monthly"?"M":timeframe==="weekly"?"W":"D";
    return {
      timeframe,
      codeResistance:`${prefix}R`,codeSupport:`${prefix}S`,
      lookback: count ?? null,
      availableBars: available,
      price,
      ...result,
      policy:
        "R_BEARISH_OPEN_LARGEST_BODY__S_LOWEST_UNBROKEN_CLOSE_ALL_CANDLES__STRICT_SOURCE_CLOSE_BREAK_V2_PREVIEW",
      coverage:
        "Retained source; original revisions and complete session coverage not certified",
      ...{ candidates: result.candidates },
    };
  });
}
