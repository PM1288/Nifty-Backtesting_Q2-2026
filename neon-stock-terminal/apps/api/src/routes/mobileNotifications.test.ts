import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { registerMobileNotifications } from "./mobileNotifications";

test("paper popup feed returns only the durable rows selected by the focused query", async () => {
  let sql = "";
  let queryLimit: unknown;
  const prisma = {
    async $queryRawUnsafe(statement: string, limit: unknown) {
      sql = statement;
      queryLimit = limit;
      return [{
        event_id: "event-5",
        aggregate_id: "trade-5",
        event_type: "com.papertrading.target_track.closed.v1",
        event_time: "2026-08-23T10:30:00.000Z",
        company_name: "Reliance Industries",
        payload: { data: { symbol: "RELIANCE", trade_group_id: "trade-5", notification: { title: "ANALYTICAL TARGET HIT", message: "ANALYTICAL TARGET HIT\nRELIANCE reached +0.5%" } } },
      }];
    },
  } as any;
  const app = express();
  app.use((req, _res, next) => { req.authUser = { uid: "test-user", email: "test@example.com", emailVerified: true, displayName: "Test user", role: "user" }; next(); });
  registerMobileNotifications(app, prisma);
  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/paper/notifications?limit=99`);
    assert.equal(response.status, 200);
    const payload = await response.json() as any;
    assert.equal(queryLimit, 5);
    assert.match(sql, /trade_leg\.opened\.v1/);
    assert.match(sql, /target_track\.closed\.v1/);
    assert.match(sql, /instrument_profiles/);
    assert.equal(payload.source, "paper_trading.trade_events");
    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0].kind, "TARGET_HIT");
    assert.equal(payload.items[0].deepLink, "/paper-trading?tradeId=trade-5&source=paper-alert");
    assert.equal(payload.items[0].speechText, "Target hit. Reliance Industries.");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
