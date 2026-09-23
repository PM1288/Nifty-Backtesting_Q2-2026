import assert from "node:assert/strict";
import test from "node:test";
import { mergeScalperV2Levels, scalperV2OpposingOiGuides } from "../src/lib/scalperV2Levels";

test("Scalper V2 merges coincident semantic levels by priority", () => {
  const levels = mergeScalperV2Levels([
    { price: 23_400, label: "MAX PAIN", priority: 70, color: "purple" },
    { price: 23_400, label: "SELECTED CE", priority: 90, color: "blue" },
    { price: 23_400.03, label: "PE1", priority: 60, color: "yellow" },
  ]);
  assert.equal(levels.length, 1);
  assert.equal(levels[0].price, 23_400);
  assert.equal(levels[0].title, "SELECTED CE · MAX PAIN · PE1");
  assert.equal(levels[0].color, "blue");
});

test("Scalper V2 underlying OI guides use the requested opposing-side labels without changing rank identity", () => {
  const guides = scalperV2OpposingOiGuides([
    { side: "CE", rank: 1, strike: 23_500, currentOi: 100 },
    { side: "CE", rank: 2, strike: 23_550, currentOi: 90 },
    { side: "PE", rank: 1, strike: 23_400, currentOi: 120 },
    { side: "PE", rank: 2, strike: 23_350, currentOi: 80 },
    { side: "PE", rank: 3, strike: 23_300, currentOi: 70 },
  ]);
  assert.deepEqual(guides.map(({ side, rank, strike, label }) => ({ side, rank, strike, label })), [
    { side: "CE", rank: 1, strike: 23_500, label: "PE1" },
    { side: "CE", rank: 2, strike: 23_550, label: "PE2" },
    { side: "PE", rank: 1, strike: 23_400, label: "CE1" },
    { side: "PE", rank: 2, strike: 23_350, label: "CE2" },
  ]);
});
