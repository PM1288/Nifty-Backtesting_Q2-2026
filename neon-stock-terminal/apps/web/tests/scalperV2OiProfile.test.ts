import assert from "node:assert/strict";
import test from "node:test";
import { allProfileStrikeBounds, layoutScalperV2Profile, normalizeScalperV2ProfileRows } from "../src/lib/scalperV2OiProfile";

test("Scalper V2 profile keeps one declared baseline and preserves missingness", () => {
  const model = normalizeScalperV2ProfileRows([
    { option_type: "CE", strike: 23_450, open_interest: 140, baseline_open_interest: 100, baseline_kind: "PREVIOUS_SESSION_FINAL", collected_at: "2026-09-10T10:00:00Z" },
    { option_type: "PE", strike: 23_450, open_interest: 80, baseline_open_interest: 100, baseline_kind: "PREVIOUS_SESSION_FINAL", collected_at: "2026-09-10T10:00:00Z" },
    { option_type: "CE", strike: 23_500, open_interest: 200, baseline_open_interest: 150, baseline_kind: "FIRST_SESSION_OBSERVATION" },
    { option_type: "PE", strike: 23_500, open_interest: 200, baseline_open_interest: null, baseline_kind: "BASELINE_UNAVAILABLE" },
  ]);
  assert.equal(model.baselineKind, "PREVIOUS_SESSION_FINAL");
  assert.deepEqual(model.rows.map((row) => row.changeOi), [40, -20, null, null]);
  assert.deepEqual(model.rows.map((row) => row.state), ["comparable", "comparable", "incompatible_baseline", "missing_baseline"]);
});

test("Scalper V2 profile geometry uses the full cohort maximum and native strike coordinates", () => {
  const rows = normalizeScalperV2ProfileRows([
    { option_type: "CE", strike: 100, open_interest: 200, baseline_open_interest: 100, baseline_kind: "PREVIOUS_SESSION_FINAL" },
    { option_type: "PE", strike: 105, open_interest: 150, baseline_open_interest: 100, baseline_kind: "PREVIOUS_SESSION_FINAL" },
    { option_type: "CE", strike: 110, open_interest: 100, baseline_open_interest: 100, baseline_kind: "PREVIOUS_SESSION_FINAL" },
    { option_type: "PE", strike: 115, open_interest: 50, baseline_open_interest: null, baseline_kind: "BASELINE_UNAVAILABLE" },
  ]).rows;
  const layout = layoutScalperV2Profile(rows, "change", 800, 500, (strike) => strike === 115 ? null : strike * 2, 120, .18);
  assert.equal(layout.laneWidth, 120);
  assert.equal(layout.maximum, 100);
  assert.equal(layout.totalStrikes, 4);
  assert.equal(layout.visibleStrikes, 3);
  assert.deepEqual(layout.bars.map((bar) => [bar.strike, bar.y, bar.width]), [[100, 200, 120], [105, 210, 60], [110, 220, 0]]);
});

test("Scalper V2 profile deduplicates conflicting strike-side rows", () => {
  const model = normalizeScalperV2ProfileRows([
    { option_type: "CE", strike: 100, open_interest: 100, baseline_open_interest: 80, baseline_kind: "PREVIOUS_SESSION_FINAL" },
    { option_type: "CE", strike: 100, open_interest: 110, baseline_open_interest: 80, baseline_kind: "PREVIOUS_SESSION_FINAL" },
  ]);
  assert.equal(model.rows.length, 1);
  assert.equal(model.duplicates, 1);
});

test("explicit all-strikes fit includes the session and complete profile cohort", () => {
  const rows = normalizeScalperV2ProfileRows([
    { option_type: "CE", strike: 23_250, open_interest: 100, baseline_open_interest: 80, baseline_kind: "PREVIOUS_SESSION_FINAL" },
    { option_type: "PE", strike: 23_700, open_interest: 120, baseline_open_interest: 100, baseline_kind: "PREVIOUS_SESSION_FINAL" },
  ]).rows;
  assert.deepEqual(allProfileStrikeBounds({ low: 23_390, high: 23_480 }, rows), { low: 23_236.5, high: 23_713.5 });
});
