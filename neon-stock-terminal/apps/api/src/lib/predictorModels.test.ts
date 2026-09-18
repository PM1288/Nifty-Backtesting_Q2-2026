import test from "node:test";
import assert from "node:assert/strict";
import {
  features,
  samples,
  fitPredict,
  forecast,
  validate,
  mwdEligibility,
  withinMorning,
  score,
  MODEL_IDS,
  type Bar,
  type Sample,
} from "./predictorModels";
const bars: Bar[] = Array.from({ length: 230 }, (_, i) => {
  const open = 100 + i * 0.1,
    close = open * (1 + 0.003 * Math.sin(i));
  return {
    day: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
    open,
    close,
    high: Math.max(open, close) + 1,
    low: Math.min(open, close) - 1,
  };
});
test("features only consume prior 21 sessions and today's open", () => {
  const all = samples(bars),
    first = all[0];
  assert.equal(first.day, bars[21].day);
  assert.equal(all.length, 209);
  const changed = bars.map((b, i) =>
    i > 100 ? { ...b, close: b.close + 1, high: b.high + 2 } : b,
  );
  assert.deepEqual(
    samples(changed).filter((s) => s.day <= bars[100].day),
    all.filter((s) => s.day <= bars[100].day),
  );
  assert.equal(features(bars.slice(0, 5), 100), null);
  assert.equal(features(bars.slice(0, 21), 1000), null);
  assert.throws(() => samples([...bars, bars[0]]), /Duplicate/);
});
test("invalid OHLC and discontinuities are unavailable, not adjusted", () => {
  assert.equal(
    features([...bars.slice(0, 20), { ...bars[20], high: 1 }], 100),
    null,
  );
  assert.equal(features(bars.slice(0, 21), NaN), null);
});
test("ridge learns a known linear target; no-change stays zero", () => {
  const train: Sample[] = Array.from({ length: 200 }, (_, i) => ({
    day: String(i),
    x: [i / 100],
    y: (2 * i) / 100,
    open: 100,
    close: 100,
    condition: "test",
  }));
  assert.ok(Math.abs(fitPredict(train, [1.3], "ridge").value - 2.6) < 0.05);
  assert.equal(fitPredict(train, [1.3], "no-change").value, 0);
  assert.ok(
    Math.abs(fitPredict(train, [1.3], "similar-days").value - 2.6) < 0.05,
  );
  assert.throws(() => fitPredict(train.slice(0, 30), [1], "ridge"), /120/);
});
test("walk-forward origin predictions are unchanged by later outcomes", () => {
  const all = samples(bars),
    a = validate(all, 209),
    cutoff = 180;
  const changed = all.map((r, i) => (i > cutoff ? { ...r, y: r.y + 7 } : r)),
    b = validate(changed, 209);
  assert.deepEqual(
    a.filter((r) => r.day <= all[cutoff].day),
    b.filter((r) => r.day <= all[cutoff].day),
  );
  const f = forecast(all, all.at(-1)!.x, 100, 101)!;
  assert.equal(f.length, 3);
  for (const m of f) {
    assert.ok(m.low <= m.high);
    assert.ok(
      m.probabilityAboveReference > 0 && m.probabilityAboveReference < 1,
    );
    assert.equal(m.errorSamples, 60);
    assert.equal(m.trainedThrough, all.at(-1)!.day);
  }
  assert.equal(f.find((m) => m.model === "no-change")!.predicted, 101);
  assert.equal(forecast(all.slice(0, 179), all[0].x, 100, 100), null);
});
test("MWD matches Home bullish and inverse bearish gates including M1 sufficiency", () => {
  const source = {
    currentMonthOpen: 105,
    previousMonthClose: 100,
    twoMonthsAgoClose: 103,
    currentWeekOpen: 106,
    previousWeekOpen: 104,
    todayOpen: 107,
  };
  assert.equal(mwdEligibility(source, 108, "LONG").route, "M−1 + M−2");
  assert.equal(
    mwdEligibility({ ...source, previousMonthClose: 110 }, 108, "LONG")
      .eligible,
    false,
  );
  assert.equal(
    mwdEligibility({ ...source, twoMonthsAgoClose: 110 }, 108, "LONG").route,
    "M−1",
  );
  assert.equal(
    mwdEligibility({ ...source, previousWeekOpen: null }, 108, "LONG").eligible,
    false,
  );
  assert.equal(mwdEligibility(source, 108, "NEUTRAL").eligible, false);
  assert.equal(
    mwdEligibility({ ...source, currentMonthOpen: 95 }, 90, "SHORT").eligible,
    true,
  );
  assert.equal(mwdEligibility(source, 107, "LONG").eligible, false);
});
test("morning publication window refuses late and backdated same-day captures", () => {
  const open = Date.parse("2026-09-18T03:45:00Z"),
    close = open + 375 * 60000;
  assert.equal(withinMorning(open, open, close), false);
  assert.equal(withinMorning(open + 15 * 60000, open, close), true);
  assert.equal(withinMorning(open + 45 * 60000 + 1, open, close), false);
  assert.equal(withinMorning(close, open, close), false);
});
test("scoring separates direction, magnitude, probability and range", () => {
  const s = score(110, 95, 115, 0.8, 100, 105);
  assert.equal(s.absoluteErrorPct, 5);
  assert.equal(s.covered, true);
  assert.equal(s.directionCorrect, true);
  assert.ok(Math.abs(s.brier - 0.04) < 1e-10);
  assert.equal(score(100, 95, 115, 0.5, 100, 105).directionCorrect, false);
  assert.throws(() => score(100, 95, 115, 0.5, 0, 105));
  assert.equal(MODEL_IDS.length, 3);
});
