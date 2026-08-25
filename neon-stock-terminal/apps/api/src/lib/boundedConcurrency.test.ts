import assert from "node:assert/strict";
import test from "node:test";
import { runWithConcurrency } from "./boundedConcurrency";

test("runWithConcurrency bounds active work and preserves result order", async () => {
  let active = 0;
  let maximumActive = 0;
  const tasks = [30, 5, 20, 1, 10].map((delay, index) => async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    active -= 1;
    return index;
  });

  assert.deepEqual(await runWithConcurrency(tasks, 2), [0, 1, 2, 3, 4]);
  assert.equal(maximumActive, 2);
});

test("runWithConcurrency rejects invalid limits", async () => {
  await assert.rejects(() => runWithConcurrency([], 0), RangeError);
  await assert.rejects(() => runWithConcurrency([], 1.5), RangeError);
});
