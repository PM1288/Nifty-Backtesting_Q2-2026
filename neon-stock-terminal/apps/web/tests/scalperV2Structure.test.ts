import assert from "node:assert/strict";
import test from "node:test";
import { scalperV2OiTotals, scalperV2StructureRows } from "../src/lib/scalperV2Structure";
import type { ScalperV2ProfileRow } from "../src/lib/scalperV2OiProfile";

const profile: ScalperV2ProfileRow[] = [
  { side: "CE", strike: 100, currentOi: 120, baselineOi: 100, changeOi: 20, baselineKind: "PREVIOUS_SESSION_FINAL", baselineAt: null, currentAt: null, source: "fixture", unit: "contracts", state: "comparable" },
  { side: "PE", strike: 100, currentOi: 80, baselineOi: 100, changeOi: -20, baselineKind: "PREVIOUS_SESSION_FINAL", baselineAt: null, currentAt: null, source: "fixture", unit: "contracts", state: "comparable" },
];

test("Scalper V2 structure matrix preserves OI, signed change and missing price", () => {
  const rows = scalperV2StructureRows([{ option_type: "CE", strike: 100, last_price: 11, open_price: 10 }, { option_type: "PE", strike: 100, last_price: null }], profile, [{ side: "CE", rank: 1, strike: 100, currentOi: 120, changeOi: 20, contractId: "C", tiedOi: false }]);
  assert.ok(Math.abs(rows[0].ce.priceChangePct! - 10) < 1e-12);
  assert.equal(rows[0].ce.rank, 1);
  assert.equal(rows[0].pe.price, null);
  assert.equal(rows[0].pe.changeOi, -20);
});

test("Scalper V2 OI totals expose descriptive PCR and imbalances", () => {
  const totals = scalperV2OiTotals(profile);
  assert.equal(totals.ceOi, 120);
  assert.equal(totals.peOi, 80);
  assert.equal(totals.pcr, 2 / 3);
  assert.equal(totals.oiImbalance, -0.2);
  assert.equal(totals.deltaImbalance, -1);
});
