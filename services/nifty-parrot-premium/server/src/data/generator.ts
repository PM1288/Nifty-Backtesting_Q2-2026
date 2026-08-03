import type { DashboardPayload, MarketSession, Nifty50, NiftyPoint, NiftyRsi, RsiHeatmap, SectorStat, Stock, Vix } from "../types.js";

/** Deterministic RNG */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}



const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function ymd(d: Date){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const dd=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}

function hhmmFromMinutes(totalMins: number) {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return `${hh}:${mm}`;
}

function marketMinutes(open = "09:15", close = "15:30") {
  const [oh, om] = open.split(":").map(Number);
  const [ch, cm] = close.split(":").map(Number);
  const o = oh * 60 + om;
  const c = ch * 60 + cm;
  return { openMin: o, closeMin: c, span: c - o };
}

function gaussian(rng: () => number) {
  // Box–Muller
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z;
}



function makeDailySeries(rng: () => number, lastPrice: number, dayChangePct: number) {
  // 7 points including today (rightmost)
  const len = 7;
  const today = new Date();
  // today's close is lastPrice, today's change vs prev close is dayChangePct
  const series: { date: string; day: string; close: number; changePct: number }[] = new Array(len);
  const todayClose = lastPrice;
  const prevClose = todayClose / (1 + dayChangePct / 100);
  const todayIdx = len - 1;
  const d0 = new Date(today);
  series[todayIdx] = {
    date: ymd(d0),
    day: DAY_NAMES[d0.getDay()],
    close: round2(todayClose),
    changePct: round2(dayChangePct)
  };

  let close = prevClose;
  for (let i = len - 2; i >= 0; i--) {
    const di = new Date(today);
    di.setDate(today.getDate() - (todayIdx - i));
    // generate a plausible daily move
    const pct = clamp(gaussian(rng) * 1.1, -5.5, 5.5);
    series[i] = {
      date: ymd(di),
      day: DAY_NAMES[di.getDay()],
      close: round2(close),
      changePct: round2(pct)
    };
    // step back one day
    close = close / (1 + pct / 100);
  }
  return series;
}

function makeMinuteReturnSeries(rng: () => number, mins: number, targetDayChangePct: number) {
  const steps: number[] = new Array(mins);
  for (let i = 0; i < mins; i++) {
    steps[i] = gaussian(rng) * 0.12;
  }
  const cum: number[] = new Array(mins);
  let acc = 0;
  for (let i = 0; i < mins; i++) {
    acc += steps[i];
    cum[i] = acc;
  }
  const end = cum[mins - 1] || 1;

  const out: number[] = [];
  for (let i = 0; i < mins; i++) {
    const t = i / Math.max(1, mins - 1);
    const bridge = t * end;
    const bridged = cum[i] - bridge;
    const v = targetDayChangePct * t + bridged * 0.22;
    out.push(round2(clamp(v, -8.5, 8.5)));
  }
  return out;
}

function makeIntradayRsiSeries(rng: () => number, minuteSeries: number[], baseRsi: number) {
  const out: number[] = [];
  let rsi = clamp(baseRsi, 30, 70);
  out.push(round2(rsi));
  for (let i = 1; i < minuteSeries.length; i++) {
    const d = minuteSeries[i] - minuteSeries[i - 1];
    rsi += d * 5.8 + gaussian(rng) * 0.65;
    rsi = clamp(rsi, 30, 70);
    out.push(round2(rsi));
  }
  return out;
}

const SECTORS: { sector: string; count: number }[] = [
  { sector: "Financial Services", count: 18 },
  { sector: "Information Technology", count: 10 },
  { sector: "Energy", count: 10 },
  { sector: "FMCG", count: 9 },
  { sector: "Auto", count: 8 },
  { sector: "Pharma", count: 8 },
  { sector: "Metals", count: 7 },
  { sector: "Industrials", count: 8 },
  { sector: "Telecom", count: 4 },
  { sector: "Utilities", count: 4 },
  { sector: "Chemicals", count: 6 },
  { sector: "Capital Goods", count: 4 },
  { sector: "Construction", count: 4 }
];
// Ensure 100
const TOTAL = SECTORS.reduce((s, x) => s + x.count, 0);
if (TOTAL !== 100) {
  // eslint-disable-next-line no-console
  console.warn("Sector distribution does not sum to 100:", TOTAL);
}

function makeSymbol(i: number) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const a = letters[i % 26];
  const b = letters[Math.floor(i / 26) % 26];
  const c = letters[Math.floor(i / (26 * 26)) % 26];
  // Looks like NSE-ish ticker length 3-6
  return `${c}${b}${a}${String(i % 10)}`;
}

export function generateDashboard(mins: number, seed = 1337): DashboardPayload {
  const rng = mulberry32(seed);

  // Session
  const open = "09:15";
  const close = "15:30";
  const mm = marketMinutes(open, close);
  const nowLocal = new Date();
  // For a stable demo: project "now" into session time using rng
  const tNow = clamp(0.05 + rng() * 0.9, 0, 1);
  const asOfMin = Math.round(mm.openMin + tNow * mm.span);
  const asOf = new Date(nowLocal);
  asOf.setHours(Math.floor(asOfMin / 60), asOfMin % 60, 0, 0);

  const session: MarketSession = {
    open,
    close,
    t: round3(tNow),
    asOfIso: asOf.toISOString()
  };

  // NIFTY50: base value and today's move
  const baseValue = 22000 + rng() * 4500; // 22k-26.5k
  const niftyChangePct = clamp(gaussian(rng) * 0.8, -2.8, 2.8); // plausible daily move
  const openValue = baseValue / (1 + niftyChangePct / 100);
  const targetEnd = baseValue;

  // Create intraday series as a Brownian bridge to target
  const series: NiftyPoint[] = [];
  const steps: number[] = [];
  for (let i = 0; i < mins; i++) {
    steps.push(gaussian(rng) * 0.08); // noise
  }
  // cumulative
  const cum: number[] = [];
  let acc = 0;
  for (let i = 0; i < mins; i++) {
    acc += steps[i];
    cum.push(acc);
  }
  // normalize to [0..1] with end matching target return
  const end = cum[mins - 1] || 1;
  const targetReturn = (targetEnd - openValue) / openValue;
  // scale + smooth
  for (let i = 0; i < mins; i++) {
    const bridge = (i / (mins - 1)) * end;
    const bridged = cum[i] - bridge; // ends at 0
    const scaled = bridged * 0.004 + targetReturn * (i / (mins - 1));
    const v = openValue * (1 + scaled);
    const t = i / (mins - 1);
    const time = hhmmFromMinutes(mm.openMin + Math.round(t * mm.span));
    const changePct = ((v - openValue) / openValue) * 100;
    series.push({ t: round3(t), time, value: round2(v), changePct: round2(changePct) });
  }

  // current value (use session.t)
  const idxNow = Math.floor(session.t * (mins - 1));
  const current = series[idxNow] ?? series[series.length - 1];
  const nifty50: Nifty50 = {
    value: round2(current.value),
    changePct: round2(current.changePct),
    series
  };

  // VIX: correlates loosely with abs move
  const vixVal = clamp(11 + Math.abs(nifty50.changePct) * 4 + gaussian(rng) * 1.2, 10, 28);
  const vix: Vix = { value: round2(vixVal) };

  // RSI: derived loosely from series momentum; clamp to [30,70] for viz
  const mom = series[Math.max(0, idxNow - 8)] ? (current.value - series[Math.max(0, idxNow - 8)].value) : 0;
  const rsiBase = 50 + clamp(mom / 40, -15, 15) + gaussian(rng) * 3;
  const niftyRsi: NiftyRsi = { value: round2(clamp(rsiBase, 30, 70)) };

  // NIFTY100 stocks
  const stocks: Stock[] = [];
  let stockIndex = 0;

  for (const s of SECTORS) {
    for (let j = 0; j < s.count; j++) {
      const sym = makeSymbol(stockIndex);
      const name = `${s.sector.split(" ")[0]} ${sym}`;
      const dayChangePct = clamp(gaussian(rng) * 1.4 + (nifty50.changePct * 0.15), -6.5, 6.5);
      const lastPrice = clamp(80 + Math.abs(gaussian(rng)) * 900 + rng() * 400, 50, 4800);
      const minuteSeries = makeMinuteReturnSeries(rng, mins, round2(dayChangePct));
      const rsiSeries = makeIntradayRsiSeries(rng, minuteSeries, 50 + dayChangePct * 1.2 + gaussian(rng) * 4);
      const rsi = rsiSeries[Math.max(0, Math.min(idxNow, rsiSeries.length - 1))] ?? rsiSeries[rsiSeries.length - 1] ?? 50;

      stocks.push({
        symbol: sym,
        name,
        sector: s.sector,
        lastPrice: round2(lastPrice),
        dayChangePct: round2(dayChangePct),
        rsi: round2(rsi),
        dailySeries: makeDailySeries(rng, round2(lastPrice), round2(dayChangePct)),
        minuteSeries,
        rsiSeries
      });
      stockIndex++;
    }
  }

  // Sector stats
  const sectors: SectorStat[] = SECTORS.map((s) => {
    const subset = stocks.filter((x) => x.sector === s.sector);
    const avg = subset.reduce((acc, x) => acc + x.dayChangePct, 0) / Math.max(1, subset.length);
    return { sector: s.sector, symbolCount: subset.length, avgChangePct: round2(avg) };
  }).sort((a, b) => b.avgChangePct - a.avgChangePct);

  // RSI heatmap (stocks × minutes)
  const minutesArr: string[] = [];
  for (let i = 0; i < mins; i++) {
    const t = i / (mins - 1);
    minutesArr.push(hhmmFromMinutes(mm.openMin + Math.round(t * mm.span)));
  }

  const values: number[][] = stocks.map((s) => s.rsiSeries.slice(0, mins));

  const rsiHeatmap: RsiHeatmap = {
    minutes: minutesArr,
    symbols: stocks.map((s) => s.symbol),
    values
  };

  return {
    session,
    nifty50,
    vix,
    niftyRsi,
    n100: { sectors, stocks },
    rsiHeatmap
  };
}
