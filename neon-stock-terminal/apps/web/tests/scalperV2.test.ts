import assert from "node:assert/strict";
import test from "node:test";
import { maxPainDistribution, oiPcr, rankCurrentOi } from "../src/lib/scalperV2";

const ranking = [
  [23000, 1000, 9000], [23100, 2500, 8000], [23450, 6000, 2000],
  [23700, 10000, 1000], [24000, 8000, 500],
].flatMap(([strike, ce, pe]) => [
  { option_type: "CE", strike, open_interest: ce, symbol_token: `C${strike}` },
  { option_type: "PE", strike, open_interest: pe, symbol_token: `P${strike}` },
]);

test("Scalper V2 ranks current OI by magnitude and side", () => {
  assert.deepEqual(rankCurrentOi(ranking).map((row) => [row.side, row.rank, row.strike]), [
    ["CE", 1, 23700], ["CE", 2, 24000], ["PE", 1, 23000], ["PE", 2, 23100],
  ]);
});

test("Scalper V2 tie ordering is stable and duplicate strikes are rejected", () => {
  const tied = rankCurrentOi([
    { option_type: "CE", strike: 23600, open_interest: 8000, symbol_token: "B" },
    { option_type: "CE", strike: 23500, open_interest: 8000, symbol_token: "A" },
  ]);
  assert.deepEqual(tied.map((row) => row.strike), [23500, 23600]);
  assert.ok(tied.every((row) => row.tiedOi));
  assert.deepEqual(rankCurrentOi([
    { option_type: "PE", strike: 23500, open_interest: 8 },
    { option_type: "PE", strike: 23500, open_interest: 9 },
  ]), []);
});

test("Scalper V2 PCR and combined max-pain use common-unit arithmetic", () => {
  assert.equal(oiPcr([{ option_type: "CE", open_interest: 100 }, { option_type: "PE", open_interest: 150 }]), 1.5);
  assert.equal(oiPcr([{ option_type: "CE", open_interest: 0 }, { option_type: "PE", open_interest: 150 }]), null);
  const result = maxPainDistribution([
    { option_type: "CE", strike: 100, open_interest: 2 },
    { option_type: "CE", strike: 110, open_interest: 1 },
    { option_type: "PE", strike: 100, open_interest: 1 },
    { option_type: "PE", strike: 110, open_interest: 3 },
  ]);
  assert.deepEqual(result.points.map((point) => point.totalPayout), [30, 20]);
  assert.deepEqual(result.candidates, [110]);
});
