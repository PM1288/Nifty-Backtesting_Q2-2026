/** Independent research calculations. No paper/broker dependencies or order path. */
export const VERSION = "TRADING-ANALYTICS-20260907.0";
export type Facts = Record<string, unknown>;
export function numeric(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
const subtract = (a: unknown, b: unknown) =>
  numeric(a) == null || numeric(b) == null ? null : numeric(a)! - numeric(b)!;
// Decimal source money is retained as strings; arithmetic uses integer hundredths of crore.
export function moneyDifference(a: unknown, b: unknown): string | null {
  const cents = (v: unknown) => {
    if (v == null || !/^-?\d+(\.\d{1,2})?$/.test(String(v))) return null;
    const s = String(v);
    const [whole, frac = ""] = s.replace("-", "").split(".");
    return (
      BigInt(whole) * 100n * (s.startsWith("-") ? -1n : 1n) +
      BigInt(frac.padEnd(2, "0")) * (s.startsWith("-") ? -1n : 1n)
    );
  };
  const x = cents(a),
    y = cents(b);
  if (x == null || y == null) return null;
  const d = x - y,
    abs = d < 0 ? -d : d;
  return `${d < 0 ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
export function activity(row: Facts) {
  const net = moneyDifference(row.buy_value_in_cr, row.sell_value_in_cr);
  return {
    ...row,
    fii_derivatives: String(row.fii_derivatives),
    net_contracts: subtract(row.buy_contracts, row.sell_contracts),
    net_crore: net,
    legacy_sign: net == null ? null : Number(net) < 0 ? "Sell" : "Buy",
    canonical_sign:
      net == null
        ? null
        : Number(net) === 0
          ? "Neutral"
          : Number(net) < 0
            ? "Sell"
            : "Buy",
    family_total: ["INDEX FUTURES", "INDEX OPTIONS"].includes(
      String(row.fii_derivatives),
    ),
  };
}
export function participant(row: Facts) {
  const calls = subtract(
    row.option_index_call_long,
    row.option_index_call_short,
  );
  const puts = subtract(row.option_index_put_long, row.option_index_put_short);
  const l = numeric(row.future_index_long),
    s = numeric(row.future_index_short);
  const pct =
    l == null || s == null || l + s === 0 ? null : (100 * l) / (l + s);
  const proxy = subtract(calls, puts);
  return {
    ...row,
    net_calls: calls,
    net_puts: puts,
    options_proxy: proxy,
    net_futures: subtract(l, s),
    futures_long_pct: pct,
    legacy_options_label:
      proxy == null ? null : proxy > 50 ? "Bullish" : "Bearish",
    legacy_futures_label: pct == null ? null : pct > 50 ? "Bullish" : "Bearish",
  };
}
export function matrix(
  cash: string | null,
  futures: string | null,
  options: string | null,
) {
  if ([cash, futures, options].some((v) => v == null))
    return "INSUFFICIENT_DATA";
  if ([cash, futures, options].includes("Neutral")) return "NEUTRAL_INPUT";
  const map: Record<string, string> = {
    "Buy|Buy|Buy": "Super Bullish",
    "Buy|Buy|Sell": "Bullish",
    "Buy|Sell|Sell": "Sideways (Bearish)",
    "Sell|Sell|Buy": "Bearish",
    "Sell|Sell|Sell": "Super Bearish",
    "Sell|Buy|Buy": "Sideways (Bullish)",
  };
  return map[[cash, futures, options].join("|")] ?? "UNMAPPED_COMBINATION";
}
export function reconcile(stats: Facts[], participants: Facts[]) {
  const issues: {
    code: string;
    unit: string;
    reported: number;
    calculated: number;
    difference: number;
  }[] = [];
  const compare = (code: string, unit: string, a: unknown, b: unknown) => {
    const x = numeric(a),
      y = numeric(b);
    if (x != null && y != null && Math.abs(x - y) > 1e-8)
      issues.push({
        code,
        unit,
        reported: x,
        calculated: y,
        difference: Number((x - y).toFixed(2)),
      });
  };
  const sum = (rows: Facts[], keys: string[]) => {
    const values = rows.flatMap((r) => keys.map((k) => numeric(r[k])));
    return values.length && values.every((v) => v != null)
      ? values.reduce<number>((s, v) => s + v!, 0)
      : null;
  };
  const people = participants.filter((r) =>
    ["Client", "DII", "FII", "Pro"].includes(String(r.client_type)),
  );
  const total = participants.find(
    (r) => String(r.client_type).toUpperCase() === "TOTAL",
  );
  const fields = [
    "future_index",
    "future_stock",
    "option_index_call",
    "option_index_put",
    "option_stock_call",
    "option_stock_put",
  ];
  for (const p of people)
    for (const side of ["long", "short"])
      compare(
        `PARTICIPANT_${p.client_type}_${side.toUpperCase()}_TOTAL_MISMATCH`,
        "contracts",
        p[`total_${side}_contracts`],
        sum(
          [p],
          fields.map((f) => `${f}_${side}`),
        ),
      );
  if (total && people.length === 4)
    for (const key of [
      ...fields.flatMap((f) => [`${f}_long`, `${f}_short`]),
      "total_long_contracts",
      "total_short_contracts",
    ])
      compare(
        `PARTICIPANT_COLUMN_${key}`,
        "contracts",
        total[key],
        sum(people, [key]),
      );
  const fii = people.find((r) => r.client_type === "FII");
  if (fii)
    for (const [product, keys] of [
      ["INDEX FUTURES", ["future_index_long", "future_index_short"]],
      [
        "INDEX OPTIONS",
        [
          "option_index_call_long",
          "option_index_call_short",
          "option_index_put_long",
          "option_index_put_short",
        ],
      ],
    ] as const)
      compare(
        `CROSS_REPORT_${product}`,
        "contracts",
        stats.find((r) => r.fii_derivatives === product)?.open_contracts,
        sum([fii], [...keys]),
      );
  for (const family of ["FUTURES", "OPTIONS"]) {
    const children = stats.filter(
      (r) =>
        r.fii_derivatives !== `INDEX ${family}` &&
        r.fii_derivatives !== `STOCK ${family}` &&
        String(r.fii_derivatives).endsWith(` ${family}`),
    );
    const parent = stats.find((r) => r.fii_derivatives === `INDEX ${family}`);
    if (children.length === 6 && parent)
      for (const field of [
        "buy_value_in_cr",
        "sell_value_in_cr",
        "open_contracts_value_in_cr",
      ])
        compare(
          `PRECISION_${family}_${field}`,
          "INR crore",
          parent[field],
          sum(children, [field]),
        );
  }
  return issues;
}
export type Bar = {
  start: string;
  end: string;
  knownAt: string | null;
  open: number;
  high: number;
  low: number;
  close: number;
  closed: boolean;
};
export function eligibleBars(bars: Bar[], asOf: string) {
  const t = Date.parse(asOf);
  return bars
    .filter(
      (b) =>
        b.closed &&
        b.knownAt != null &&
        Date.parse(b.end) <= t &&
        Date.parse(b.knownAt) <= t,
    )
    .sort((a, b) => Date.parse(a.end) - Date.parse(b.end));
}
export function ema9(closes: number[]) {
  let e: number | null = null;
  return closes.map((v, i) => {
    if (!Number.isFinite(v)) throw new Error("Invalid close");
    if (i === 8) e = closes.slice(0, 9).reduce((s, n) => s + n, 0) / 9;
    else if (i > 8) e = 0.2 * v + 0.8 * e!;
    return e;
  });
}
export function fractions(
  bar: Pick<Bar, "open" | "high" | "low" | "close">,
  ema: number | null,
) {
  const ratio = (lo: number, hi: number) =>
    ema == null || hi <= lo
      ? { above: null, below: null }
      : {
          above: Math.max(0, Math.min(1, (hi - Math.max(lo, ema)) / (hi - lo))),
          below: Math.max(0, Math.min(1, (Math.min(hi, ema) - lo) / (hi - lo))),
        };
  return {
    range: ratio(bar.low, bar.high),
    body: ratio(Math.min(bar.open, bar.close), Math.max(bar.open, bar.close)),
  };
}
export function levels(bars: Bar[], asOf: string, lookback: number | null) {
  if (lookback == null || lookback < 1)
    return { state: "POLICY_INCOMPLETE", candidates: [] };
  const eligible = eligibleBars(bars, asOf).slice(-lookback);
  const candidates = eligible
    .filter((b) => b.close < b.open)
    .map((b) => ({
      origin: b.end,
      resistance: b.open,
      support: b.close,
      body: b.open - b.close,
      resistanceBrokenAt:
        eligible.find((l) => l.end > b.end && l.close > b.open)?.end ?? null,
      supportBrokenAt:
        eligible.find((l) => l.end > b.end && l.close < b.close)?.end ?? null,
    }))
    .sort((a, b) => b.body - a.body || b.origin.localeCompare(a.origin));
  return { state: "PREVIEW_UNAPPROVED", candidates };
}
export function nearestPairs(legs: Facts[], spot: number, count = 10) {
  const strikes = [
    ...new Set(
      legs.map((l) => numeric(l.strike)).filter((x): x is number => x != null),
    ),
  ]
    .filter((k) =>
      ["CE", "PE"].every((t) =>
        legs.some((l) => numeric(l.strike) === k && l.option_type === t),
      ),
    )
    .sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot) || a - b)
    .slice(0, count)
    .sort((a, b) => a - b);
  return {
    strikes,
    legs: legs.filter((l) => strikes.includes(numeric(l.strike)!)),
    shortfall: Math.max(0, count - strikes.length),
  };
}
export function chainMetrics(legs: Facts[]) {
  const calls = legs.filter((l) => l.option_type === "CE"),
    puts = legs.filter((l) => l.option_type === "PE");
  const sum = (rows: Facts[], field: string) =>
    rows.length &&
    rows.every((r) => numeric(r[field]) != null && numeric(r[field])! >= 0)
      ? rows.reduce((s, r) => s + numeric(r[field])!, 0)
      : null;
  const ce = sum(calls, "open_interest"),
    pe = sum(puts, "open_interest"),
    cv = sum(calls, "total_traded_volume"),
    pv = sum(puts, "total_traded_volume");
  const strikes = [
    ...new Set(
      legs.map((l) => numeric(l.strike)).filter((k): k is number => k != null),
    ),
  ].sort((a, b) => a - b);
  const paired = strikes.every((k) =>
    ["CE", "PE"].every(
      (t) =>
        legs.filter((l) => numeric(l.strike) === k && l.option_type === t)
          .length === 1,
    ),
  );
  // Payout requires validated units, not guessed current lot sizes.
  const validUnits =
    legs.length > 0 &&
    legs.every((l) => numeric(l.oi_units) != null && numeric(l.oi_units)! >= 0);
  const payouts =
    validUnits && paired
      ? strikes.map((strike) => ({
          strike,
          payout: legs.reduce(
            (s, l) =>
              s +
              numeric(l.oi_units)! *
                Math.max(
                  l.option_type === "CE"
                    ? strike - numeric(l.strike)!
                    : numeric(l.strike)! - strike,
                  0,
                ),
            0,
          ),
        }))
      : [];
  const minimum = payouts.length
    ? Math.min(...payouts.map((p) => p.payout))
    : null;
  return {
    scope: "DISPLAY_WINDOW",
    oiPcr: paired && ce != null && ce > 0 && pe != null ? pe / ce : null,
    volumePcr: paired && cv != null && cv > 0 && pv != null ? pv / cv : null,
    maxPainStrikes: payouts
      .filter((p) => p.payout === minimum)
      .map((p) => p.strike),
    payouts,
    normalizationState: validUnits
      ? "VERIFIED_INPUT_UNITS"
      : "DATA_INSUFFICIENT_OI_UNIT_VERIFICATION",
    callOi: ce,
    putOi: pe,
  };
}
export function turnover(
  start: { volume: number; atp: number; session: string; time: number },
  end: typeof start,
) {
  if (
    start.session !== end.session ||
    end.time <= start.time ||
    end.volume < start.volume
  )
    return { value: null, state: "COUNTER_RESET_OR_OUT_OF_ORDER" };
  const value = end.volume * end.atp - start.volume * start.atp;
  return value < 0
    ? { value: null, state: "INVALID_CUMULATIVE_VALUE" }
    : { value, state: "ESTIMATED_FROM_ROUNDED_ATP" };
}
export function researchCondition(
  underlying: Bar[],
  option: Bar[],
  asOf: string,
  direction: "CALL" | "PUT",
  approved = false,
) {
  const u = eligibleBars(underlying, asOf),
    o = eligibleBars(option, asOf),
    ub = u.at(-1),
    ob = o.at(-1);
  if (
    !ub ||
    !ob ||
    ub.end !== ob.end ||
    ub.start !== ob.start ||
    u.length < 9 ||
    o.length < 9
  )
    return { state: "INSUFFICIENT_DATA", confirmed: false };
  const uf = fractions(ub, ema9(u.map((b) => b.close)).at(-1) ?? null),
    of = fractions(ob, ema9(o.map((b) => b.close)).at(-1) ?? null);
  const confirmed =
    (direction === "CALL" ? uf.range.above : uf.range.below) != null &&
    (direction === "CALL" ? uf.range.above! : uf.range.below!) >= 0.7 &&
    of.range.above != null &&
    of.range.above >= 0.7;
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(asOf));
  return {
    state: !approved
      ? "POLICY_INCOMPLETE"
      : time >= "14:00"
        ? "CUTOFF_BLOCKED"
        : confirmed
          ? "CONDITION_CONFIRMED"
          : "WATCH",
    confirmed,
    underlying: uf,
    option: of,
  };
}

/** Calendar supplied by caller. Missing minutes never become observed complete bars. */
export function sessionBars(
  minutes: Facts[],
  sessions: Facts[],
  interval: number,
  asOf: string,
) {
  const output: (Bar & {
    coverage: number;
    expectedMinutes: number;
    partialSessionBar: boolean;
  })[] = [];
  const cutoff = Date.parse(asOf);
  // Parse once per source minute, not once for every target candle. This keeps
  // multi-underlying inspection from multiplying timestamp parsing millions of times.
  const prepared=minutes.map(row=>({row,time:new Date(String(row.ts)).getTime(),known:new Date(String(row.created_at)).getTime()}))
    .filter(m=>m.known<=cutoff).sort((a,b)=>a.time-b.time);
  for (const session of sessions) {
    const start = new Date(String(session.market_open_ts)).getTime(),
      end = new Date(String(session.market_close_ts)).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      continue;
    for (let t = start; t < Math.min(end, cutoff); t += interval * 60000) {
      const close = Math.min(t + interval * 60000, end);
      if (close > cutoff) continue;
      const input = prepared.filter(m=>m.time>=t&&m.time<close).map(m=>m.row);
      if (!input.length) continue;
      const expected = (close - t) / 60000;
      const complete =
        input.length === expected &&
        new Set(input.map((m) => String(m.ts))).size === expected &&
        input.every((m) =>
          ["open", "high", "low", "close"].every((k) => numeric(m[k]) != null),
        );
      output.push({
        start: new Date(t).toISOString(),
        end: new Date(close).toISOString(),
        knownAt: new Date(
          Math.max(
            close,
            ...input.map((m) => new Date(String(m.created_at)).getTime()),
          ),
        ).toISOString(),
        open: numeric(input[0].open)!,
        high: Math.max(...input.map((m) => numeric(m.high)!)),
        low: Math.min(...input.map((m) => numeric(m.low)!)),
        close: numeric(input.at(-1)!.close)!,
        closed: complete,
        coverage: input.length,
        expectedMinutes: expected,
        partialSessionBar: close - t < interval * 60000,
      });
    }
  }
  const completed = output.filter((b) => b.closed);
  const emas = ema9(completed.map((b) => b.close));
  const byEnd = new Map(completed.map((b, i) => [b.end, emas[i]]));
  return output.map((b) => ({ ...b, ema9: byEnd.get(b.end) ?? null }));
}
