import assert from "node:assert/strict";
import test from "node:test";
import { latestRead } from "./latestRead";

test("overlapping consumers share one read and successful values expire", async () => {
  let calls = 0;
  const read = latestRead(async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return calls; }, 20);
  assert.deepEqual(await Promise.all(Array.from({ length: 50 }, () => read())), Array(50).fill(1));
  assert.equal(await read(), 1);
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(await read(), 2);
});
test("failed reads are retried and synchronous failures release pending state", async () => {
  let calls = 0;
  const read = latestRead(() => { if (++calls === 1) throw new Error("offline"); return Promise.resolve(10); }, 500);
  await assert.rejects(read(), /offline/);
  assert.equal(await read(), 10);
});
