import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { once } from "node:events";
import { WebSocket } from "ws";
import type { PrismaClient } from "@prisma/client";
import { attachStreamServer } from "./stream";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
test("stream shares DB reads, suppresses duplicates and retains source timestamps", async () => {
  let reads = 0;
  let price = 100;
  const prisma = { $queryRaw: async (sql: { sql: string }) => {
    if (sql.sql.includes("instrument_universe")) return [{ symbol_token: "1", tradingsymbol: "ONE-EQ", symbol: "ONE" }];
    reads++;
    await pause(30);
    return [{ symbol_token: "1", last_price: price, last_close: 90, net_change: price-90, percent_change: 10, last_seen_ts: "2026-10-01T10:00:00.000Z" }];
  }} as unknown as PrismaClient;
  const server = http.createServer();
  attachStreamServer(server, prisma);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = (server.address() as {port: number}).port;
  const clients = [new WebSocket(`ws://127.0.0.1:${port}/v1/stream?symbols=ONE`), new WebSocket(`ws://127.0.0.1:${port}/v1/stream?symbols=ONE`)];
  const messages: any[][] = [[], []];
  clients.forEach((ws, i) => ws.on("message", (data) => messages[i].push(JSON.parse(String(data)))));
  try {
    await Promise.all(clients.map((ws) => once(ws, "message")));
    assert.equal(reads, 1);
    assert.equal(messages[0][0].timestamp, "2026-10-01T10:00:00.000Z");
    await pause(1200);
    assert.deepEqual(messages.map((x) => x.length), [1, 1]);
    price = 101;
    await Promise.all(clients.map((ws) => once(ws, "message")));
    assert.equal(messages[0][1].sequence, 2);
    assert.equal(messages[0][1].price, 101);
  } finally {
    clients.forEach((ws) => ws.terminate());
    server.close(); await once(server, "close");
  }
});
