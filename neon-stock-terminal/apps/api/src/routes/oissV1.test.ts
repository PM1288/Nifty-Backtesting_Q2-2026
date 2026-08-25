import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { registerOissV1 } from "./oissV1";

const RUN_ID = "11111111-1111-4111-8111-111111111111";

async function withServer(results: unknown[], run: (baseUrl: string) => Promise<void>) {
  let call = 0;
  const prisma = { async $queryRawUnsafe() { return results[call++] ?? []; } } as any;
  const app = express();
  registerOissV1(app, prisma);
  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("OISS rejects malformed run ids before querying", async () => {
  await withServer([], async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/oiss-v1/dashboard?runId=bad`);
    assert.equal(response.status, 400);
  });
});

test("OISS full analytical export is Excel-readable and multi-sheet", async () => {
  await withServer([
    [{ run_id: RUN_ID, strategy_id: "OISS_V1_202608", formula_version: "FORMULA-OISS-1.202608.0" }],
    [{ sector: "IT", score: 82 }],
    [{ symbol: "INFY", canonical_status: "BUY NOW", ofactor: 86, xfactor: 81, tqs: 84 }],
    [{ symbol: "INFY", change_kind: "UPGRADED" }],
    [{ symbol: "INFY", outcome_state: "COMPLETE" }],
  ], async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/oiss-v1/export?runId=${RUN_ID}&format=xlsx`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /application\/vnd\.ms-excel/);
    const body = await response.text();
    assert.match(body, /Worksheet ss:Name="Run Identity"/);
    assert.match(body, /Worksheet ss:Name="Stock Radar"/);
    assert.match(body, /Worksheet ss:Name="Forward Outcomes"/);
    assert.match(body, /INFY/);
  });
});
