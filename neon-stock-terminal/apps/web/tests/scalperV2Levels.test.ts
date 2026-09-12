import assert from "node:assert/strict";
import test from "node:test";
import { mergeScalperV2Levels } from "../src/lib/scalperV2Levels";

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
