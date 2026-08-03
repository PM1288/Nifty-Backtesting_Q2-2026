export type Greeks = {
  delta: number;
  gamma: number;
  thetaPerDay: number;
  vegaPerPct: number;
};

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Abramowitz & Stegun 7.1.26 approximation.
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) *
      Math.exp(-ax * ax);
  return sign * y;
}

function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

export function blackScholesGreeks(params: {
  optionType: 'CE' | 'PE';
  s: number;
  k: number;
  tYears: number;
  r: number; // risk-free rate (decimal, e.g. 0.06)
  q: number; // dividend yield (decimal)
  ivPct: number; // implied vol in percent (e.g. 25.5)
}): Greeks | null {
  const { optionType, s, k, tYears, r, q, ivPct } = params;
  if (!Number.isFinite(s) || !Number.isFinite(k) || !Number.isFinite(tYears)) return null;
  if (s <= 0 || k <= 0 || tYears <= 0) return null;

  const sigma = ivPct / 100;
  if (!Number.isFinite(sigma) || sigma <= 0) return null;

  const sqrtT = Math.sqrt(tYears);
  const d1 = (Math.log(s / k) + (r - q + 0.5 * sigma * sigma) * tYears) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const nd1 = normPdf(d1);
  const Nd1 = normCdf(d1);
  const Nd2 = normCdf(d2);
  const Nmd1 = normCdf(-d1);
  const Nmd2 = normCdf(-d2);

  const discQ = Math.exp(-q * tYears);
  const discR = Math.exp(-r * tYears);

  const gamma = (discQ * nd1) / (s * sigma * sqrtT);

  // Vega is per 1.0 vol (i.e. 100%); convert to per 1% vol.
  const vegaPerPct = (s * discQ * nd1 * sqrtT) / 100;

  let delta: number;
  let thetaPerYear: number;
  if (optionType === 'CE') {
    delta = discQ * Nd1;
    thetaPerYear =
      -(s * discQ * nd1 * sigma) / (2 * sqrtT) -
      r * k * discR * Nd2 +
      q * s * discQ * Nd1;
  } else {
    delta = discQ * (Nd1 - 1);
    thetaPerYear =
      -(s * discQ * nd1 * sigma) / (2 * sqrtT) +
      r * k * discR * Nmd2 -
      q * s * discQ * Nmd1;
  }

  const thetaPerDay = thetaPerYear / 365;

  return { delta, gamma, thetaPerDay, vegaPerPct };
}
