import assert from "node:assert/strict";
import test from "node:test";
import {
  applyScalperLegsToChartQuery,
  availableScalperStrikes,
  scalperLegSelection,
  setScalperLegSelection,
} from "../src/lib/scalperContractSelection";

test("legacy pair links initialise both exact legs", () => {
  const selected = scalperLegSelection(new URLSearchParams("strike=23450"), 23500);
  assert.deepEqual(selected, { ceStrike: "23450", peStrike: "23450" });
});

test("independent CE and PE strikes stay distinct in URL and chart query", () => {
  const params = setScalperLegSelection(new URLSearchParams("strike=23450"), {
    ceStrike: "23500",
    peStrike: "23400",
  });
  assert.equal(params.get("ceStrike"), "23500");
  assert.equal(params.get("peStrike"), "23400");
  assert.equal(params.has("strike"), false);
  assert.equal(params.get("pin"), "true");

  const query = applyScalperLegsToChartQuery(new URLSearchParams("interval=5"), "2026-09-15", scalperLegSelection(params, null));
  assert.equal(query.get("ceStrike"), "23500");
  assert.equal(query.get("peStrike"), "23400");
  assert.equal(query.has("strike"), false);
});

test("available strike lists preserve one-sided retained contracts", () => {
  const rows = [
    { expiry: "2026-09-15", strike: 23400, ce_contracts: 0, pe_contracts: 1 },
    { expiry: "2026-09-15", strike: 23450, ce_contracts: 1, pe_contracts: 1 },
    { expiry: "2026-09-15", strike: 23500, ce_contracts: 1, pe_contracts: 0 },
  ];
  assert.deepEqual(availableScalperStrikes(rows, "2026-09-15", "CE"), [23450, 23500]);
  assert.deepEqual(availableScalperStrikes(rows, "2026-09-15", "PE"), [23400, 23450]);
});
