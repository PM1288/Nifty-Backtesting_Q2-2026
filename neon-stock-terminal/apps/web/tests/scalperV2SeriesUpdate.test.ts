import assert from "node:assert/strict";
import test from "node:test";
import { scalperV2SeriesUpdatePlan } from "../src/lib/scalperV2SeriesUpdate";

const row = (time: number, value: number) => ({ time, value });

test("Scalper V2 incrementally updates the last bar and appends new bars", () => {
  assert.deepEqual(scalperV2SeriesUpdatePlan([row(1, 10), row(2, 20)], [row(1, 10), row(2, 21), row(3, 30)]), {
    kind: "update", rows: [row(2, 21), row(3, 30)],
  });
});

test("Scalper V2 replaces series for prepend, truncation, or older corrections", () => {
  assert.equal(scalperV2SeriesUpdatePlan([row(2, 20)], [row(1, 10), row(2, 20)]).kind, "replace");
  assert.equal(scalperV2SeriesUpdatePlan([row(1, 10), row(2, 20)], [row(1, 10)]).kind, "replace");
  assert.equal(scalperV2SeriesUpdatePlan([row(1, 10), row(2, 20), row(3, 30)], [row(1, 11), row(2, 20), row(3, 30)]).kind, "replace");
});

test("Scalper V2 performs no chart write for unchanged data", () => {
  assert.deepEqual(scalperV2SeriesUpdatePlan([row(1, 10)], [row(1, 10)]), { kind: "none" });
});
