import test from "node:test";
import assert from "node:assert/strict";
import { createDisclosuresClient } from "./disclosuresClient";

test("disclosures client calls the expected run endpoint with JSON payload", async () => {
  let capturedUrl = "";
  let capturedMethod = "";
  let capturedBody = "";

  const client = createDisclosuresClient({
    baseUrl: "http://service:8000/",
    timeoutMs: 1000,
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedMethod = init?.method ?? "GET";
      capturedBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          run_id: "run_123",
          run_root: "/app/data/runs/run_123",
          combined_dir: "/app/data/runs/run_123/combined",
          manifest_path: "/app/data/runs/run_123/audit/manifest.csv",
          error_log_path: "/app/data/runs/run_123/audit/error_log.csv",
          dataset_row_counts: {},
          effective_symbols: ["RELIANCE"],
          load_results: []
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch
  });

  const response = await client.runPipeline({ symbols: ["RELIANCE"], load_postgres: true });

  assert.equal(capturedUrl, "http://service:8000/run");
  assert.equal(capturedMethod, "POST");
  assert.deepEqual(JSON.parse(capturedBody), { symbols: ["RELIANCE"], load_postgres: true });
  assert.equal(response.run_id, "run_123");
});

test("disclosures client surfaces upstream HTTP errors with route context", async () => {
  const client = createDisclosuresClient({
    baseUrl: "http://service:8000",
    timeoutMs: 1000,
    fetchImpl: (async () =>
      new Response(JSON.stringify({ detail: "missing latest run" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      })) as typeof fetch
  });

  await assert.rejects(client.getLatestRun(), /Disclosures service 404 on \/latest-run/);
});
