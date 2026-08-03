import test from "node:test";
import assert from "node:assert/strict";
import { createFiiReportsClient } from "./fiiReportsClient";

test("FII reports client calls the expected latest endpoint with JSON payload", async () => {
  let capturedUrl = "";
  let capturedMethod = "";
  let capturedBody = "";

  const client = createFiiReportsClient({
    baseUrl: "http://service:8000/",
    timeoutMs: 1000,
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedMethod = init?.method ?? "GET";
      capturedBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ operation: "pull-latest", trade_date: "03-04-2026" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch
  });

  const response = await client.pullLatest({ max_lookback_days: 5, save_parsed: true });

  assert.equal(capturedUrl, "http://service:8000/pull-latest");
  assert.equal(capturedMethod, "POST");
  assert.deepEqual(JSON.parse(capturedBody), { max_lookback_days: 5, save_parsed: true });
  assert.equal(response.operation, "pull-latest");
});

test("FII reports client surfaces upstream HTTP errors with route context", async () => {
  const client = createFiiReportsClient({
    baseUrl: "http://service:8000",
    timeoutMs: 1000,
    fetchImpl: (async () =>
      new Response(JSON.stringify({ detail: "missing latest run" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      })) as typeof fetch
  });

  await assert.rejects(client.getLatestRun(), /FII reports service 404 on \/latest-run/);
});

test("FII reports client sends load requests to the expected endpoint", async () => {
  let capturedUrl = "";
  let capturedBody = "";

  const client = createFiiReportsClient({
    baseUrl: "http://service:8000/",
    timeoutMs: 1000,
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ operation: "load", run_id: "2026-03-01__2026-03-31" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch
  });

  const response = await client.load({ kind: "backfill", run_id: "2026-03-01__2026-03-31" });

  assert.equal(capturedUrl, "http://service:8000/load");
  assert.deepEqual(JSON.parse(capturedBody), { kind: "backfill", run_id: "2026-03-01__2026-03-31" });
  assert.equal(response.operation, "load");
});
