import test from "node:test";
import assert from "node:assert/strict";
import {
  predictorLeaderboard,
  studyLeaderboard,
  type PredictorRow,
} from "../src/lib/predictor";
const row = (model: string, error: number, symbol = "NIFTY") =>
  ({
    day: "2026-09-18",
    version: "v1",
    symbol,
    model,
    outcome: {
      absoluteErrorPct: error,
      directionCorrect: true,
      covered: true,
      brier: 0.1,
    },
  }) as PredictorRow;
test("ranking uses identical completed cohorts and numeric errors", () => {
  const rows = [
    row("no-change", 2),
    row("ridge", 0.2),
    row("similar-days", 1),
    row("ridge", 99, "ABC"),
  ];
  const ranking = predictorLeaderboard(rows);
  assert.equal(ranking[0].model, "ridge");
  assert.equal(ranking[0].mae, 0.2);
  assert.ok(ranking.every((r) => r.n === 1));
  assert.ok(
    predictorLeaderboard([]).every((r) => r.mae === null && r.hits === null),
  );
});
test("historical errors retain negative returns and are not trading profits", () => {
  const result = studyLeaderboard([
    {
      model: "ridge",
      day: "a",
      condition: "falling",
      actual: -2,
      predicted: -1,
      error: 1,
      directionCorrect: true,
    },
  ]);
  assert.equal(result[0].mae, 1);
  assert.equal(result[0].hit, 1);
  assert.equal(result[0].n, 1);
});
