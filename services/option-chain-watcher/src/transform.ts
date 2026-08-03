import { DateTime } from 'luxon';
import { blackScholesGreeks } from './greeks';

export type OptionType = 'CE' | 'PE';

export interface SelectedLeg {
  strike: number;
  optionType: OptionType;

  lastPrice: number | null;
  change: number | null;
  iv: number | null;
  volume: number | null;
  oi: number | null;
  chgOi: number | null;
  bidQty: number | null;
  bidPrice: number | null;
  askQty: number | null;
  askPrice: number | null;

  // Black-Scholes greeks computed from underlying, strike, time-to-expiry and IV.
  delta: number | null;
  gamma: number | null;
  theta: number | null; // per day
  vega: number | null; // per 1% IV change

  instrumentIdentifier: string | null;
}

export interface SelectedSnapshot {
  symbol: string;
  expiryDate: string; // yyyy-mm-dd
  underlyingValue: number | null;
  atmStrike: number | null;
  strikesAround: number;
  capturedAt: Date;
  legs: SelectedLeg[];
  raw?: unknown;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toWholeNum(v: unknown): number | null {
  const n = toNum(v);
  if (n === null) return null;
  return Math.round(n);
}

export function parseExpiryToISO(exp: string): string {
  // NSE uses dd-MMM-yyyy (e.g. 10-Feb-2026)
  // Use a manual map to avoid locale-dependent Date parsing.
  const s = exp.trim();
  const m = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) throw new Error(`Cannot parse expiry: ${exp}`);
  const dd = Number(m[1]);
  const mon = m[2].toLowerCase();
  const yyyy = Number(m[3]);
  const monthMap: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  const mm = monthMap[mon];
  if (!mm || !Number.isFinite(dd) || !Number.isFinite(yyyy)) throw new Error(`Cannot parse expiry: ${exp}`);
  return `${yyyy.toString().padStart(4, '0')}-${mm.toString().padStart(2, '0')}-${dd.toString().padStart(2, '0')}`;
}

function nearestStrike(strikes: number[], underlying: number): number {
  let best = strikes[0];
  let bestDist = Math.abs(best - underlying);
  for (const s of strikes) {
    const d = Math.abs(s - underlying);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

export function selectAtmPlusMinus(
  nseJson: any,
  opts: {
    symbol: string;
    expiryRaw: string;
    strikesAround: number;
    keepRaw: boolean;
    riskFreeRate: number;
    dividendYield: number;
  },
): SelectedSnapshot {
  const records = nseJson?.records;
  if (!records) throw new Error('Invalid NSE response: missing records');

  const expiryISO = parseExpiryToISO(opts.expiryRaw);
  const underlyingValue = toNum(records?.underlyingValue);
  const capturedAt = new Date();

  // Approximate NIFTY options expiry time at 15:30 IST on expiry date.
  const expiryIst = DateTime.fromISO(expiryISO, { zone: 'Asia/Kolkata' }).set({ hour: 15, minute: 30, second: 0, millisecond: 0 });
  const nowIst = DateTime.fromJSDate(capturedAt).setZone('Asia/Kolkata');
  const tSeconds = Math.max(0, expiryIst.toSeconds() - nowIst.toSeconds());
  const tYears = tSeconds / (365 * 24 * 60 * 60);

  const rows: any[] = records?.data ?? [];
  const strikes = Array.from(new Set(rows.map(r => Number(r?.strikePrice)).filter(n => Number.isFinite(n)))).sort(
    (a, b) => a - b,
  );

  if (!strikes.length) throw new Error(`No strikes found for expiry ${opts.expiryRaw}`);

  const atm =
    underlyingValue != null ? nearestStrike(strikes, underlyingValue) : strikes[Math.floor(strikes.length / 2)];
  const atmIndex = strikes.indexOf(atm);

  const from = Math.max(0, atmIndex - opts.strikesAround);
  const to = Math.min(strikes.length - 1, atmIndex + opts.strikesAround);
  const selectedStrikes = strikes.slice(from, to + 1);

  const legs: SelectedLeg[] = [];
  for (const strike of selectedStrikes) {
    const row = rows.find(r => Number(r?.strikePrice) === strike);
    const ce = row?.CE ?? null;
    const pe = row?.PE ?? null;

    const mapLeg = (leg: any, optionType: OptionType): SelectedLeg => ({
      // Compute greeks only when we have enough inputs.
      // If IV is 0 (often happens for illiquid far strikes), keep greeks as null.
      ...(function () {
        const iv = toNum(leg?.impliedVolatility);
        if (underlyingValue == null || iv == null || iv <= 0 || tYears <= 0) {
          return { delta: null, gamma: null, theta: null, vega: null };
        }
        const g = blackScholesGreeks({
          optionType,
          s: underlyingValue,
          k: strike,
          tYears,
          r: opts.riskFreeRate,
          q: opts.dividendYield,
          ivPct: iv,
        });
        return g
          ? { delta: g.delta, gamma: g.gamma, theta: g.thetaPerDay, vega: g.vegaPerPct }
          : { delta: null, gamma: null, theta: null, vega: null };
      })(),
      strike,
      optionType,
      lastPrice: toNum(leg?.lastPrice),
      change: toNum(leg?.change),
      iv: toNum(leg?.impliedVolatility),
      volume: toWholeNum(leg?.totalTradedVolume),
      oi: toWholeNum(leg?.openInterest),
      chgOi: toWholeNum(leg?.changeinOpenInterest ?? leg?.changeInOpenInterest),
      // option-chain-v3 uses buy/sell instead of bid/ask fields.
      bidQty: toWholeNum(leg?.buyQuantity1 ?? leg?.bidQty),
      bidPrice: toNum(leg?.buyPrice1 ?? leg?.bidprice ?? leg?.bidPrice),
      askQty: toWholeNum(leg?.sellQuantity1 ?? leg?.askQty),
      askPrice: toNum(leg?.sellPrice1 ?? leg?.askPrice),
      instrumentIdentifier: leg?.identifier ? String(leg.identifier) : null,
    });

    legs.push(mapLeg(ce, 'CE'));
    legs.push(mapLeg(pe, 'PE'));
  }

  return {
    symbol: opts.symbol,
    expiryDate: expiryISO,
    underlyingValue,
    atmStrike: atm,
    strikesAround: opts.strikesAround,
    capturedAt,
    legs,
    raw: opts.keepRaw ? nseJson : undefined,
  };
}
