import assert from "node:assert/strict";
import test from "node:test";
import { liveRefreshHealth } from "../src/lib/liveRefresh";

const nowMs = Date.parse("2026-09-20T12:00:00.000Z");

test("live refresh stays fresh inside three refresh intervals", () => {
  const health = liveRefreshHealth({ hasData: true, isError: false, isFetching: false, generatedAt: "2026-09-20T11:58:30.000Z", intervalMs: 60_000, nowMs });
  assert.equal(health.state, "fresh");
});

test("live refresh exposes a stale server snapshot even when HTTP polling succeeds", () => {
  const health = liveRefreshHealth({ hasData: true, isError: false, isFetching: false, generatedAt: "2026-09-20T11:56:00.000Z", dataUpdatedAt: nowMs, intervalMs: 60_000, nowMs });
  assert.equal(health.state, "stale");
  assert.equal(health.lastSuccessAt, Date.parse("2026-09-20T11:56:00.000Z"));
});

test("background failure retains data but reports an error", () => {
  const health = liveRefreshHealth({ hasData: true, isError: true, isFetching: false, dataUpdatedAt: nowMs - 10_000, intervalMs: 10_000, nowMs });
  assert.equal(health.state, "error");
});

test("initial failure has no invented success timestamp", () => {
  const health = liveRefreshHealth({ hasData: false, isError: true, isFetching: false, intervalMs: 60_000, nowMs });
  assert.equal(health.state, "error");
  assert.equal(health.lastSuccessAt, null);
});
