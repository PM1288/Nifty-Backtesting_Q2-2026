import test from "node:test";
import assert from "node:assert/strict";
import { observationState, readDataHealth, registerDataHealth } from "./dataHealth";
import express from "express";
import type { AddressInfo } from "node:net";

const open = "2026-09-18T03:45:00Z", close = "2026-09-18T10:00:00Z";
test("collection freshness separates missing, old, invalid and rotation allowance", () => {
  const now = Date.parse("2026-09-18T05:00:00Z");
  assert.equal(observationState(null, open, close, now, true), "MISSING");
  assert.equal(observationState("2026-09-17T09:00:00Z", open, close, now, true), "OLDER_SESSION");
  assert.equal(observationState("2026-09-18T04:50:00Z", open, close, now, true), "STALE");
  assert.equal(observationState("2026-09-18T04:50:00Z", open, close, now, false), "RECENT");
  assert.equal(observationState("2026-09-18T04:59:00Z", open, close, now, true), "RECENT");
  assert.equal(observationState("2026-09-18T06:00:00Z", open, close, now, true), "INVALID_TIME");
  assert.equal(observationState(open, null, null, now, true), "UNKNOWN_SESSION");
});
test("after hours marks session observation without claiming live or full-day coverage", () => {
  assert.equal(observationState(open, open, close, Date.parse("2026-09-19T06:00:00Z"), true), "OBSERVED_SESSION");
});
test("health is read-only, preserves unavailable numerics and caches simultaneous callers", async () => {
  let calls = 0;
  const db = { $queryRawUnsafe: async () => { calls++; return []; } } as any;
  const empty = await readDataHealth(db);
  assert.equal(empty.session, null); assert.equal(empty.marketOpen, false); assert.deepEqual(empty.instruments, []);
  calls = 0;
  const app = express(); registerDataHealth(app, db); const server = app.listen(0);
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/data-health`;
    const responses = await Promise.all([fetch(url), fetch(url)]);
    assert.ok(responses.every(r => r.status===200)); assert.equal(calls, 4);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
