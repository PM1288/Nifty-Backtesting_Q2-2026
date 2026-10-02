import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { dataProxyTarget, registerDataProxy } from "./dataProxy";

test("proxy allowlist excludes lookalikes and arbitrary URLs", () => {
  assert.equal(dataProxyTarget("/api/v1/watchlistsevil", "exports", "intraday"), null);
  assert.equal(dataProxyTarget("/api/v1/intraday/stocks", "exports", "intraday"), "intraday");
  assert.equal(dataProxyTarget("/api/v1/exports/file", "exports", "intraday"), "exports");
  assert.equal(dataProxyTarget("//attacker.invalid/", "exports", "intraday"), null);
});

test("proxy requires authentication for GET and HEAD and streams authorized data", async () => {
  let upstreamCalls = 0;
  const upstream = express();
  upstream.get("/api/v1/dashboard/test", (_req, res) => { upstreamCalls++; res.json({ ok: true }); });
  const source = upstream.listen(0, "127.0.0.1"); await once(source, "listening");
  const base = `http://127.0.0.1:${(source.address() as AddressInfo).port}`;
  const app = express();
  registerDataProxy(app, (req, res, next) => { if (req.get("x-test-session") !== "valid") { res.sendStatus(401); return; } next(); }, base, base);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/dashboard/test`;
  try {
    for (const method of ["GET", "HEAD"]) assert.equal((await fetch(url, { method })).status, 401);
    assert.equal(upstreamCalls, 0);
    const result = await fetch(url, { headers: { "x-test-session": "valid" } });
    assert.deepEqual(await result.json(), { ok: true });
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(upstreamCalls, 1);
  } finally { server.closeAllConnections(); source.closeAllConnections(); await Promise.all([new Promise<void>(r => server.close(() => r())), new Promise<void>(r => source.close(() => r()))]); }
});
