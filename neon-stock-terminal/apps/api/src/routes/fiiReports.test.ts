import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { registerFiiReports } from "./fiiReports";
import type { FiiReportsClient } from "../lib/fiiReportsClient";

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());

  const client: FiiReportsClient = {
    async getHealth() {
      return { status: "ok", scheduler_enabled: false, scheduler_running: false };
    },
    async getLatestRun() {
      return {
        output_dir: "/app/data",
        latest_run_path: "/app/data/latest_run.json",
        latest_daily_path: "/app/data/latest_daily/latest_run.json",
        latest_backfill_path: "/app/data/history_backfill/latest_backfill.json",
        latest_run: { operation: "pull-latest" },
        latest_daily: null,
        latest_backfill: null
      };
    },
    async listRuns() {
      return {
        output_dir: "/app/data",
        daily_runs: [{ run_id: "2026-04-02" }],
        backfill_runs: [{ run_id: "2026-03-01__2026-03-31" }]
      };
    },
    async getRunDetail(kind, runId) {
      return {
        kind,
        run: { run_id: runId },
        summary: { reports_downloaded: 57 }
      };
    },
    async pullLatest(payload) {
      return {
        operation: "pull-latest",
        max_lookback_days: payload.max_lookback_days ?? 10
      };
    },
    async backfill(payload) {
      return {
        operation: "backfill",
        start_date: payload.start_date,
        end_date: payload.end_date
      };
    },
    async load(payload) {
      return {
        operation: "load",
        kind: payload.kind ?? "backfill",
        run_id: payload.run_id ?? "latest"
      };
    }
  };

  registerFiiReports(app, client);
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

test("FII reports routes expose latest-run metadata paths", async () =>
  withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/fii-reports/latest-run`);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { latest_run_path: string; latest_run: { operation: string } };
    assert.equal(payload.latest_run_path, "/app/data/latest_run.json");
    assert.equal(payload.latest_run.operation, "pull-latest");
  }));

test("FII reports backfill route rejects malformed request bodies", async () =>
  withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/fii-reports/backfill`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ start_date: "02-10-2023" })
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { error: { code: string } };
    assert.equal(payload.error.code, "FII_REPORTS_BACKFILL_INVALID_REQUEST");
  }));

test("FII reports routes expose runs catalog and run detail", async () =>
  withServer(async (baseUrl) => {
    const catalogResponse = await fetch(`${baseUrl}/v1/fii-reports/runs`);
    assert.equal(catalogResponse.status, 200);
    const catalogPayload = (await catalogResponse.json()) as { backfill_runs: Array<{ run_id: string }> };
    assert.equal(catalogPayload.backfill_runs[0]?.run_id, "2026-03-01__2026-03-31");

    const detailResponse = await fetch(`${baseUrl}/v1/fii-reports/runs/backfill/2026-03-01__2026-03-31`);
    assert.equal(detailResponse.status, 200);
    const detailPayload = (await detailResponse.json()) as { summary: { reports_downloaded: number } };
    assert.equal(detailPayload.summary.reports_downloaded, 57);
  }));

test("FII reports load route validates and proxies load requests", async () =>
  withServer(async (baseUrl) => {
    const invalidResponse = await fetch(`${baseUrl}/v1/fii-reports/load`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ run_id: "2026-03-01__2026-03-31" })
    });
    assert.equal(invalidResponse.status, 400);

    const response = await fetch(`${baseUrl}/v1/fii-reports/load`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ kind: "backfill", run_id: "2026-03-01__2026-03-31" })
    });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { operation: string; run_id: string };
    assert.equal(payload.operation, "load");
    assert.equal(payload.run_id, "2026-03-01__2026-03-31");
  }));
