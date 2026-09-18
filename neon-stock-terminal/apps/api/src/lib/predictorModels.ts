/** Small deterministic daily models. No random split, no future fitting, no execution. */
export const MODEL_VERSION = "morning-close-v1";
export const MODEL_IDS = ["no-change", "ridge", "similar-days"] as const;
export type ModelId = (typeof MODEL_IDS)[number];
export type Bar = {
  day: string;
  open: number;
  high: number;
  low: number;
  close: number;
};
export type Sample = {
  day: string;
  x: number[];
  y: number;
  open: number;
  close: number;
  condition: string;
};
export const FEATURES = [
  "Opening gap %",
  "Previous return %",
  "5-session momentum %",
  "20-session momentum %",
  "20-session volatility %",
  "Previous range %",
];
export const positive = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;
export const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
export function quantile(a: number[], q: number) {
  if (!a.length) return NaN;
  const b = [...a].sort((x, y) => x - y),
    k = (b.length - 1) * q,
    i = Math.floor(k);
  return b[i] + (b[Math.min(i + 1, b.length - 1)] - b[i]) * (k - i);
}
export function validBar(b: Bar) {
  return (
    [b.open, b.high, b.low, b.close].every(positive) &&
    b.low <= Math.min(b.open, b.close) &&
    b.high >= Math.max(b.open, b.close)
  );
}
export function features(history: Bar[], open: number): number[] | null {
  const h = history.slice(-21);
  if (h.length !== 21 || !positive(open) || h.some((b) => !validBar(b)))
    return null;
  // Reject discontinuities rather than silently split-adjusting authoritative observations.
  const r = h.slice(1).map((b, i) => 100 * (b.close / h[i].close - 1));
  const gap = 100 * (open / h[20].close - 1);
  if (
    r.some((v) => Math.abs(v) > 25) ||
    Math.abs(gap) > 25 ||
    Date.parse(h[20].day) - Date.parse(h[0].day) > 45 * 86400000
  )
    return null;
  return [
    gap,
    r[19],
    100 * (h[20].close / h[15].close - 1),
    100 * (h[20].close / h[0].close - 1),
    Math.sqrt(mean(r.map((v) => (v - mean(r)) ** 2))),
    (100 * (h[20].high - h[20].low)) / h[20].close,
  ];
}
export function condition(x: number[]) {
  return `${x[3] >= 0 ? "Rising" : "Falling"} 20-session trend · ${x[4] >= 1.5 ? "higher" : "lower"} volatility`;
}
export function samples(bars: Bar[]): Sample[] {
  const ordered = [...bars].sort((a, b) => a.day.localeCompare(b.day));
  if (new Set(ordered.map((b) => b.day)).size !== ordered.length)
    throw new Error("Duplicate daily observations");
  return ordered.flatMap((b, i) => {
    const x = features(ordered.slice(0, i), b.open),
      y = 100 * (b.close / b.open - 1);
    return x && validBar(b) && Math.abs(y) <= 25
      ? [
          {
            day: b.day,
            x,
            y,
            open: b.open,
            close: b.close,
            condition: condition(x),
          },
        ]
      : [];
  });
}
function solve(a: number[][], b: number[]) {
  const m = a.map((row, i) => [...row, b[i]]),
    n = b.length;
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let j = i + 1; j < n; j++)
      if (Math.abs(m[j][i]) > Math.abs(m[pivot][i])) pivot = j;
    [m[i], m[pivot]] = [m[pivot], m[i]];
    if (Math.abs(m[i][i]) < 1e-10) throw new Error("Singular model");
    const d = m[i][i];
    for (let k = i; k <= n; k++) m[i][k] /= d;
    for (let j = 0; j < n; j++)
      if (j !== i) {
        const f = m[j][i];
        for (let k = i; k <= n; k++) m[j][k] -= f * m[i][k];
      }
  }
  return m.map((row) => row[n]);
}
export function fitPredict(train: Sample[], x: number[], model: ModelId) {
  if (train.length < 120)
    throw new Error("At least 120 training sessions required");
  if (model === "no-change")
    return { value: 0, detail: { method: "Session-open benchmark" } };
  const means = x.map((_, j) => mean(train.map((r) => r.x[j])));
  const scales = x.map(
    (_, j) => Math.sqrt(mean(train.map((r) => (r.x[j] - means[j]) ** 2))) || 1,
  );
  const transform = (v: number[]) =>
    v.map((n, j) => (n - means[j]) / scales[j]);
  const z = transform(x),
    rows = train.map((r) => transform(r.x));
  if (model === "similar-days") {
    const neighbors = train
      .map((r, i) => ({
        r,
        d: rows[i].reduce((s, v, j) => s + (v - z[j]) ** 2, 0),
      }))
      .sort((a, b) => a.d - b.d || a.r.day.localeCompare(b.r.day))
      .slice(0, 25);
    return {
      value: mean(neighbors.map((n) => n.r.y)),
      detail: {
        neighbors: neighbors.map((n) => ({
          day: n.r.day,
          distance: Math.sqrt(n.d),
          returnPct: n.r.y,
        })),
        k: 25,
      },
    };
  }
  const design = rows.map((row) => [1, ...row]),
    target = [1, ...z],
    n = target.length;
  const a = Array.from({ length: n }, (_, j) =>
    Array.from(
      { length: n },
      (_, k) =>
        design.reduce((s, row) => s + row[j] * row[k], 0) +
        (j === k && j > 0 ? 10 : 0),
    ),
  );
  const b = target.map((_, j) =>
    design.reduce((s, row, i) => s + row[j] * train[i].y, 0),
  );
  const weights = solve(a, b);
  return {
    value: target.reduce((s, v, j) => s + v * weights[j], 0),
    detail: {
      alpha: 10,
      intercept: weights[0],
      contributions: FEATURES.map((name, j) => ({
        name,
        value: z[j] * weights[j + 1],
      })),
      means,
      scales,
      weights,
    },
  };
}
export type Validation = {
  model: ModelId;
  day: string;
  condition: string;
  actual: number;
  predicted: number;
  error: number;
  directionCorrect: boolean;
};
export function validate(all: Sample[], count = 60): Validation[] {
  const result: Validation[] = [];
  for (let i = Math.max(120, all.length - count); i < all.length; i++) {
    const train = all.slice(Math.max(0, i - 500), i),
      row = all[i];
    for (const model of MODEL_IDS) {
      const predicted = fitPredict(train, row.x, model).value;
      result.push({
        model,
        day: row.day,
        condition: row.condition,
        actual: row.y,
        predicted,
        error: predicted - row.y,
        directionCorrect: Math.sign(predicted) === Math.sign(row.y),
      });
    }
  }
  return result;
}
export function forecast(
  all: Sample[],
  x: number[],
  open: number,
  reference: number,
) {
  if (all.length < 180) return null;
  const validation = validate(all),
    train = all.slice(-500);
  return MODEL_IDS.map((model) => {
    const fitted = fitPredict(train, x, model);
    const errors = validation
      .filter((v) => v.model === model)
      .map((v) => -v.error);
    // This is an empirical daily error band, NOT a guaranteed or intraday-calibrated interval.
    const predicted =
      model === "no-change" ? reference : open * (1 + fitted.value / 100);
    const possible = errors.map((e) => predicted + (open * e) / 100);
    return {
      model,
      predicted,
      low: quantile(possible, 0.1),
      high: quantile(possible, 0.9),
      probabilityAboveReference:
        (1 + possible.filter((p) => p > reference).length) /
        (possible.length + 2),
      sampleCount: train.length,
      errorSamples: errors.length,
      trainedThrough: train.at(-1)!.day,
      detail: fitted.detail,
      validation,
    };
  });
}
export type GateSource = {
  currentMonthOpen: number | null;
  previousMonthClose: number | null;
  twoMonthsAgoClose: number | null;
  currentWeekOpen: number | null;
  previousWeekOpen: number | null;
  todayOpen: number | null;
};
/** Parity with Home todayModel: M2 requires M1; week gates compare current price. */
export function mwdEligibility(
  source: GateSource,
  price: number,
  direction: string,
) {
  const compare = (a: number | null, b: number | null) =>
    !positive(a) || !positive(b) || !["LONG", "SHORT"].includes(direction)
      ? null
      : direction === "LONG"
        ? a > b
        : a < b;
  const gates = [
    {
      name: "M−1",
      actual: source.currentMonthOpen,
      reference: source.previousMonthClose,
    },
    {
      name: "M−2",
      actual: source.currentMonthOpen,
      reference: source.twoMonthsAgoClose,
    },
    { name: "W0", actual: price, reference: source.currentWeekOpen },
    { name: "W−1", actual: price, reference: source.previousWeekOpen },
    { name: "D0", actual: price, reference: source.todayOpen },
  ].map((g) => ({
    ...g,
    passed: compare(g.actual, g.reference),
    operator: direction === "SHORT" ? "<" : ">",
  }));
  const m1 = [0, 2, 3, 4].every((i) => gates[i].passed === true),
    m2 = m1 && gates[1].passed === true;
  return { eligible: m1, route: m2 ? "M−1 + M−2" : m1 ? "M−1" : null, gates };
}
export function withinMorning(now: number, open: number, close: number) {
  return (
    now >= open + 15 * 60000 &&
    now <= Math.min(open + 45 * 60000, close - 30 * 60000)
  );
}
export function score(
  predicted: number,
  low: number,
  high: number,
  p: number,
  reference: number,
  actual: number,
) {
  if (
    ![predicted, low, high, reference, actual].every(positive) ||
    !Number.isFinite(p) ||
    p < 0 ||
    p > 1 ||
    low > high
  )
    throw new Error("Invalid evaluation");
  return {
    actual,
    absoluteErrorPct: (100 * Math.abs(predicted - actual)) / reference,
    directionCorrect:
      Math.sign(predicted - reference) === Math.sign(actual - reference),
    covered: actual >= low && actual <= high,
    brier: (p - Number(actual > reference)) ** 2,
    actualMovePct: 100 * (actual / reference - 1),
  };
}
