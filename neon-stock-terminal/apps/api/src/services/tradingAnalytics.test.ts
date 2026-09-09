import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  activity,
  participant,
  matrix,
  reconcile,
  moneyDifference,
  ema9,
  fractions,
  nearestPairs,
  chainMetrics,
  eligibleBars,
  levels,
  turnover,
  researchCondition,
  sessionBars,
  type Bar,
} from "./tradingAnalytics";
const golden = JSON.parse(
  readFileSync(
    join(__dirname, "fixtures/trading-analytics-golden.json"),
    "utf8",
  ),
);
const stats = golden.fii_derivatives_records.map((r: any) => ({
  fii_derivatives: r.product,
  buy_contracts: r.buy_contracts,
  sell_contracts: r.sell_contracts,
  buy_value_in_cr: r.buy_crore,
  sell_value_in_cr: r.sell_crore,
  open_contracts: r.oi_contracts,
  open_contracts_value_in_cr: r.oi_crore,
}));
const people = golden.participant_oi_records.map((r: any) => ({
  ...r.values,
  client_type: r.participant,
}));
test("golden all 16 product net counts and exact decimal amounts", () => {
  assert.equal(stats.length, 16);
  for (let i = 0; i < 16; i++) {
    const actual = activity(stats[i]);
    assert.equal(
      actual.net_contracts,
      golden.fii_derivatives_records[i].net_contracts,
    );
    assert.equal(actual.net_crore, golden.fii_derivatives_records[i].net_crore);
  }
});
test("golden all four participant positions and provisional deltas", () => {
  for (const expected of golden.expected_participant_calculations) {
    const row = people.find((r: any) => r.client_type === expected.participant);
    const p = participant(row);
    const prev = participant(
      golden.preceding_workbook_block.records.find(
        (r: any) => r.participant === expected.participant,
      ).values,
    );
    const e = expected.report_date_metrics;
    assert.equal(p.net_calls, e.net_index_calls);
    assert.equal(p.net_puts, e.net_index_puts);
    assert.equal(p.options_proxy, e.index_options_directional_proxy);
    assert.equal(p.net_futures, e.net_index_futures);
    assert.ok(
      Math.abs(p.futures_long_pct! - Number(e.index_futures_long_pct)) < 1e-10,
    );
    assert.equal(
      p.options_proxy! - prev.options_proxy!,
      expected.adjacent_block_change.index_options_directional_proxy,
    );
  }
});
test("golden detects exactly three integer conflicts and two monetary precision warnings", () => {
  const issues = reconcile(stats, people);
  assert.equal(issues.filter((i) => i.unit === "contracts").length, 3);
  assert.equal(issues.filter((i) => i.unit === "INR crore").length, 2);
  for (const issue of issues)
    assert.ok(
      Math.abs(issue.difference) === (issue.unit === "contracts" ? 1 : 0.01),
    );
});
test("decimal arithmetic does not lose hundredths and missing is not zero", () => {
  assert.equal(moneyDifference("1106.90", "1229.76"), "-122.86");
  assert.equal(moneyDifference(null, "3.00"), null);
  assert.equal(moneyDifference("0.01", "0.00"), "0.01");
  assert.equal(moneyDifference("1.001", "0"), null);
});
test("legacy zero is Buy; canonical zero Neutral", () => {
  const r = activity({ buy_value_in_cr: "0", sell_value_in_cr: "0" });
  assert.equal(r.legacy_sign, "Buy");
  assert.equal(r.canonical_sign, "Neutral");
});
for (const [a, b, c, expected] of [
  ["Buy", "Buy", "Buy", "Super Bullish"],
  ["Buy", "Buy", "Sell", "Bullish"],
  ["Buy", "Sell", "Sell", "Sideways (Bearish)"],
  ["Sell", "Sell", "Buy", "Bearish"],
  ["Sell", "Sell", "Sell", "Super Bearish"],
  ["Sell", "Buy", "Buy", "Sideways (Bullish)"],
  ["Buy", "Sell", "Buy", "UNMAPPED_COMBINATION"],
  ["Sell", "Buy", "Sell", "UNMAPPED_COMBINATION"],
])
  test(`matrix ${a}/${b}/${c}`, () => assert.equal(matrix(a, b, c), expected));
test("matrix missing and neutral are explicit", () => {
  assert.equal(matrix(null, "Buy", "Buy"), "INSUFFICIENT_DATA");
  assert.equal(matrix("Neutral", "Buy", "Buy"), "NEUTRAL_INPUT");
});
test("EMA SMA9 warmup and 0.2 update", () => {
  assert.deepEqual(ema9([1, 2, 3, 4, 5, 6, 7, 8]), Array(8).fill(null));
  assert.deepEqual(ema9([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).slice(8), [5, 6]);
});
test("70% boundaries range/body degeneracy", () => {
  assert.equal(
    fractions({ open: 2, close: 8, low: 0, high: 10 }, 3).range.above,
    0.7,
  );
  assert.ok(
    fractions({ open: 2, close: 8, low: 0, high: 10 }, 3.01).range.above! < 0.7,
  );
  assert.equal(
    fractions({ open: 5, close: 5, low: 5, high: 5 }, 5).range.above,
    null,
  );
  assert.equal(
    fractions({ open: 5, close: 5, low: 0, high: 10 }, 5).body.above,
    null,
  );
});
test("nearest ten actual paired strikes with lower strike tie", () => {
  const legs = Array.from({ length: 13 }, (_, i) => 100 + i * 10).flatMap(
    (strike) => ["CE", "PE"].map((option_type) => ({ strike, option_type })),
  );
  const w = nearestPairs(legs, 155);
  assert.equal(w.legs.length, 20);
  assert.deepEqual(nearestPairs(legs, 155, 1).strikes, [150]);
  assert.equal(
    nearestPairs([{ strike: 100, option_type: "CE" }], 100).shortfall,
    10,
  );
});
test("OI ratios, max pain ties, missing normalization", () => {
  const legs = [
    {
      strike: 100,
      option_type: "CE",
      open_interest: 1,
      total_traded_volume: 0,
      oi_units: 1,
    },
    {
      strike: 100,
      option_type: "PE",
      open_interest: 0,
      total_traded_volume: 0,
      oi_units: 0,
    },
    {
      strike: 110,
      option_type: "CE",
      open_interest: 0,
      total_traded_volume: 0,
      oi_units: 0,
    },
    {
      strike: 110,
      option_type: "PE",
      open_interest: 1,
      total_traded_volume: 0,
      oi_units: 1,
    },
  ];
  assert.deepEqual(chainMetrics(legs).maxPainStrikes, [100, 110]);
  assert.equal(chainMetrics(legs).oiPcr, 1);
  assert.equal(chainMetrics(legs).volumePcr, null);
  assert.deepEqual(
    chainMetrics(legs.map(({ oi_units, ...r }) => r)).maxPainStrikes,
    [],
  );
});
const bar = (day: number, close = 10): Bar => ({
  start: `2026-09-${String(day).padStart(2, "0")}T03:45:00Z`,
  end: `2026-09-${String(day).padStart(2, "0")}T04:00:00Z`,
  knownAt: `2026-09-${String(day).padStart(2, "0")}T04:00:00Z`,
  open: 12,
  high: 13,
  low: 9,
  close,
  closed: true,
});
test("lookahead blocks future, unknown knowledge and forming candles", () => {
  assert.equal(
    eligibleBars(
      [
        bar(1),
        bar(2),
        { ...bar(1), knownAt: null },
        { ...bar(1), closed: false },
      ],
      "2026-09-01T05:00:00Z",
    ).length,
    1,
  );
});
test("broken level never resurrects and equality is touch", () => {
  const r = levels(
    [bar(1), bar(2, 12), bar(3, 14), bar(4, 10)],
    "2026-09-05T04:00:00Z",
    12,
  );
  assert.equal(
    r.candidates.find((c) => c.origin === bar(1).end)?.resistanceBrokenAt,
    bar(3).end,
  );
  assert.equal(
    levels([], "2026-09-05T04:00:00Z", null).state,
    "POLICY_INCOMPLETE",
  );
});
test("turnover detects resets and reordering", () => {
  const s = { volume: 10, atp: 100, session: "a", time: 1 };
  assert.equal(turnover(s, { ...s, volume: 20, time: 2 }).value, 1000);
  assert.equal(turnover(s, { ...s, volume: 9, time: 2 }).value, null);
  assert.equal(turnover(s, { ...s, session: "b", time: 2 }).value, null);
});
test("research never emits paper eligibility, independently aligned option warmup", () => {
  const bars = Array.from({ length: 11 }, (_, i) => bar(i + 1));
  assert.equal(
    researchCondition(bars, bars, "2026-09-15T05:00:00Z", "PUT").state,
    "POLICY_INCOMPLETE",
  );
  assert.equal(
    researchCondition(bars, bars, "2026-09-15T08:30:00Z", "PUT", true).state,
    "CUTOFF_BLOCKED",
  );
  assert.equal(
    researchCondition(bars, bars.slice(1), "2026-09-15T05:00:00Z", "PUT").state,
    "INSUFFICIENT_DATA",
  );
});
for (const duration of [360, 375, 385])
  test(`calendar anchored ${duration} minute session`, () => {
    const start = Date.parse("2026-09-07T03:45:00Z"),
      end = start + duration * 60000;
    const rows = Array.from({ length: duration }, (_, i) => ({
      ts: new Date(start + i * 60000).toISOString(),
      created_at: new Date(start + (i + 1) * 60000).toISOString(),
      open: 100,
      high: 102,
      low: 99,
      close: 101,
    }));
    const result = sessionBars(
      rows,
      [
        {
          market_open_ts: new Date(start).toISOString(),
          market_close_ts: new Date(end).toISOString(),
        },
      ],
      15,
      new Date(end).toISOString(),
    );
    assert.equal(result.length, Math.ceil(duration / 15));
    assert.ok(result.every((b) => b.closed));
    assert.equal(result.at(-1)?.partialSessionBar, duration === 385);
    if (duration === 385) assert.equal(result.at(-1)?.expectedMinutes, 10);
  });
test("missing or duplicate minute does not confirm a complete candle", () => {
  const session = {
    market_open_ts: "2026-09-07T03:45:00Z",
    market_close_ts: "2026-09-07T04:00:00Z",
  };
  const r = {
    ts: "2026-09-07T03:45:00Z",
    created_at: "2026-09-07T03:46:00Z",
    open: 1,
    high: 2,
    low: 0,
    close: 1,
  };
  assert.equal(
    sessionBars([r], [session], 15, "2026-09-07T04:00:00Z")[0].closed,
    false,
  );
  assert.equal(
    sessionBars(Array(15).fill(r), [session], 15, "2026-09-07T04:00:00Z")[0]
      .closed,
    false,
  );
});
