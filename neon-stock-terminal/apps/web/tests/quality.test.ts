import assert from "node:assert/strict";
import test from "node:test";
import { buildMarketQuoteQuality, classifyFreshness, formatAge, parseAgeMs, qualitySummary, qualityTone, type ModuleQualityState } from "../src/design-system/quality";

const ready: ModuleQualityState = { moduleId: "quotes", transport: "CONNECTED", freshness: "CURRENT", readiness: "READY", ageMs: 3_200 };

test("quality layers only produce positive when all three are healthy", () => {
  assert.equal(qualityTone(ready), "positive");
  assert.equal(qualityTone({ ...ready, readiness: "INCOMPLETE" }), "warning");
  assert.equal(qualityTone({ ...ready, freshness: "STALE" }), "warning");
  assert.equal(qualityTone({ ...ready, transport: "DISCONNECTED" }), "negative");
  assert.equal(qualityTone({ ...ready, freshness: "UNKNOWN", readiness: "NO_DATA" }), "missing");
});

test("quality summary does not call a connected but incomplete module ready", () => {
  assert.match(qualitySummary({ ...ready, readiness: "INCOMPLETE" }), /incomplete$/);
  assert.doesNotMatch(qualitySummary({ ...ready, readiness: "INCOMPLETE" }), /· ready$/);
});

test("age helpers are deterministic and reject invalid timestamps", () => {
  assert.equal(formatAge(18_400), "18s");
  assert.equal(formatAge(133 * 86_400_000), "133d");
  assert.equal(parseAgeMs("2026-08-11T10:00:00.000Z", Date.parse("2026-08-11T10:00:30.000Z")), 30_000);
  assert.equal(parseAgeMs("not-a-time"), undefined);
});

test("freshness thresholds distinguish current, delayed, stale and unknown", () => {
  assert.equal(classifyFreshness(undefined), "UNKNOWN");
  assert.equal(classifyFreshness(30_000), "CURRENT");
  assert.equal(classifyFreshness(30_001), "DELAYED");
  assert.equal(classifyFreshness(120_001), "STALE");
});

test("connected transport does not make a stale quote analytically current", () => {
  const state = buildMarketQuoteQuality({
    transport: "CONNECTED",
    quoteTimestamp: "2026-08-11T09:15:00.000Z",
    snapshotTimestamp: "2026-08-11T09:15:00.000Z",
    now: Date.parse("2026-08-11T09:20:00.000Z")
  });
  assert.equal(state.transport, "CONNECTED");
  assert.equal(state.freshness, "STALE");
  assert.equal(qualityTone(state), "warning");
});

test("a sequence gap forces recovering readiness", () => {
  const state = buildMarketQuoteQuality({ transport: "CONNECTED", quoteTimestamp: "2026-08-11T09:20:00.000Z", gapDetected: true, now: Date.parse("2026-08-11T09:20:01.000Z") });
  assert.equal(state.readiness, "RECOVERING");
  assert.equal(state.gapDetected, true);
});
