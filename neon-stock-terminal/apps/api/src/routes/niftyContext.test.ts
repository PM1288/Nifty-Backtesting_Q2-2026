import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "@prisma/client";
import { registerNiftyContext } from "./niftyContext";

test("research API is read-only, parameterized, explicit when absent, and fail-safe", async () => {
  const calls: string[] = [];
  let fail = false;
  const prisma = {
    $queryRawUnsafe: async (sql: string) => {
      calls.push(sql);
      if (fail) throw new Error("SECRET_DSN");
      return [];
    },
  } as unknown as PrismaClient;
  const app = express();
  registerNiftyContext(app, prisma);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/nifty-context`;
  try {
    assert.equal((await fetch(`${base}?run=invalid`)).status, 400);
    assert.equal((await fetch(`${base}/trade-quality?run=invalid`)).status, 400);
    assert.equal(calls.length, 0);
    const body = (await (await fetch(base)).json()) as {
      state: string;
      executionEnabled: boolean;
      predictions: unknown[];
    };
    assert.equal(body.state, "NOT_RUN");
    assert.equal(body.executionEnabled, false);
    assert.deepEqual(body.predictions, []);
    assert.equal((await fetch(base, { method: "POST" })).status, 404);
    const trade = (await (await fetch(`${base}/trade-quality`)).json()) as {
      state: string; executionEnabled: boolean; rows: unknown[];
    };
    assert.equal(trade.state, "NOT_RUN");
    assert.equal(trade.executionEnabled, false);
    assert.deepEqual(trade.rows, []);
    assert.equal((await fetch(`${base}/trade-quality`, { method: "POST" })).status, 404);
    assert.equal((await fetch(`${base}/export/${"a".repeat(64)}`)).status, 404);
    fail = true;
    const response = await fetch(base);
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes("SECRET_DSN"));
    assert.ok(calls.every((sql) => /^SELECT/.test(sql)));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
