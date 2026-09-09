import test from "node:test";
import assert from "node:assert/strict";
import {
  filtered,
  flatten,
  instrumentEvidence,
  number,
  numeric,
  readState,
  side,
  time,
} from "../src/lib/tradeObservation";
import { evidenceCsv } from "../src/lib/tradingAnalyticsExport";

test("numbers retain zero, numeric strings and missingness without boolean coercion", () => {
  assert.equal(number(0), 0);
  assert.equal(number("0"), 0);
  assert.equal(number("12.34"), 12.34);
  for (const v of [
    null,
    undefined,
    "",
    " ",
    true,
    false,
    [],
    {},
    NaN,
    Infinity,
    "unavailable",
  ])
    assert.equal(number(v), null);
  assert.equal(numeric(-0.001, 2, true), "0.00");
  assert.equal(numeric(null), "—");
});
test("selected side requires exact identity, never defaults an unknown direction to PUT", () => {
  assert.equal(
    side({ direction: "CALL", option_symbol: "ABC-CE", ce_symbol: "ABC-CE" }),
    "ce",
  );
  assert.equal(
    side({ direction: "PUT", option_symbol: "ABC-PE", pe_symbol: "ABC-PE" }),
    "pe",
  );
  for (const r of [
    { direction: "OTHER" },
    { direction: "CALL", option_symbol: "old", ce_symbol: "new" },
    { direction: "PUT" },
  ])
    assert.equal(side(r), null);
});
test("unknown nested fields, arrays, null and literal path collisions survive flattening", () => {
  const r = {
    a: {
      b: 0,
      unknown: { c: null },
      array: [{ name: "retained", n: 1.23456789 }],
    },
    "a.b": 9,
    empty: {},
  };
  const f = flatten(r);
  assert.equal(f["a.b"], 0);
  assert.equal(f["a~1b"], 9);
  assert.equal(f["a.unknown.c"], null);
  assert.deepEqual(f["a.array"], r.a.array);
  assert.deepEqual(f.empty, {});
  assert.match(evidenceCsv([f]), /1.23456789/);
  assert.match(evidenceCsv([{ x: "=DANGER()" }]), /'=DANGER/);
});
test("endpoint and excursion are distinct signed stored values with no bearish inversion", () => {
  const r = {
    outcome_evidence: {
      "15m": {
        maturity: "DEVELOPING",
        pe: { endpoint_change_pct: -2, max_change_pct: 5, min_change_pct: -4 },
      },
    },
  };
  const d = instrumentEvidence(r, "15m", "pe");
  assert.equal(d.endpoint_change_pct, -2);
  assert.equal(d.max_change_pct, 5);
  assert.deepEqual(instrumentEvidence(r, "15m", null), {});
});
test("URL validation preserves unrelated parameters and filters missing maturity explicitly", () => {
  const p = new URLSearchParams(
    "view=trade-log&symbol=NIFTY&logHorizon=bad&logDirection=OTHER&logPreset=bad",
  );
  const s = readState(p);
  assert.equal(s.horizon, "15m");
  assert.equal(s.direction, "");
  assert.equal(s.preset, "Monitor");
  assert.equal(p.get("symbol"), "NIFTY");
  const missing = { underlying_symbol: "ABC", outcome_evidence: {} };
  assert.equal(
    filtered([missing], { ...s, maturity: "DATA_INSUFFICIENT" }).length,
    1,
  );
  assert.equal(filtered([missing], { ...s, maturity: "MATURE" }).length, 0);
});
test("time labels use IST and invalid dates remain unavailable", () => {
  assert.match(time("2026-09-09T04:00:00Z"), /09:30/);
  assert.equal(time("nonsense"), "—");
});
