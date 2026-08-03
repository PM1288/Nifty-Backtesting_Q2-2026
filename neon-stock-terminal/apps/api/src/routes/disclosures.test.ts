import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { registerDisclosures } from "./disclosures";
import type { DisclosuresClient } from "../lib/disclosuresClient";

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());

  const client: DisclosuresClient = {
    async getHealth() {
      return { status: "ok" };
    },
    async getLatestRun() {
      return {
        path: "/app/data/latest_run.json",
        latest_run: {
          run_id: "run_123",
          manifest_path: "/app/data/runs/run_123/audit/manifest.csv",
          error_log_path: "/app/data/runs/run_123/audit/error_log.csv"
        }
      };
    },
    async runPipeline(payload: Record<string, unknown>) {
      return {
        run_id: "run_123",
        run_root: "/app/data/runs/run_123",
        combined_dir: "/app/data/runs/run_123/combined",
        manifest_path: "/app/data/runs/run_123/audit/manifest.csv",
        error_log_path: "/app/data/runs/run_123/audit/error_log.csv",
        dataset_row_counts: {},
        effective_symbols: Array.isArray(payload.symbols) ? payload.symbols : [],
        load_results: []
      };
    },
    async loadRun(payload) {
      return {
        run_id: typeof payload.run_id === "string" ? payload.run_id : "run_123",
        combined_dir: "/app/data/runs/run_123/combined",
        manifest_path: "/app/data/runs/run_123/audit/manifest.csv",
        load_results: []
      };
    }
  };

  registerDisclosures(app, client);
  const server = app.listen(0);

  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

test("disclosures routes expose latest-run metadata paths", async () =>
  withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/disclosures/latest-run`);
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      path: string;
      latest_run: { run_id: string; manifest_path: string; error_log_path: string };
    };
    assert.equal(payload.path, "/app/data/latest_run.json");
    assert.equal(payload.latest_run.run_id, "run_123");
    assert.match(payload.latest_run.manifest_path, /manifest\.csv$/);
    assert.match(payload.latest_run.error_log_path, /error_log\.csv$/);
  }));

test("disclosures run route rejects malformed request bodies", async () =>
  withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/disclosures/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ load_postgres: "yes" })
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { error: { code: string } };
    assert.equal(payload.error.code, "DISCLOSURES_RUN_INVALID_REQUEST");
  }));
