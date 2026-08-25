import assert from "node:assert/strict";
import test from "node:test";
import { unseenNotificationIds, validPaperTradeNotifications, type PaperTradeNotificationResponse } from "../src/components/chrome/paperTradeNotifications";

const response: PaperTradeNotificationResponse = {
  asOf: "2026-08-23T10:00:00.000Z",
  source: "paper_trading.trade_events",
  items: [
    { id: "3", eventType: "target", kind: "TARGET_HIT", title: "Target", body: "+0.5%", symbol: "RELIANCE", occurredAt: "2026-08-23T09:59:00.000Z", tradeId: "t3", deepLink: "/paper-trading?tradeId=t3", speechText: "Paper target condition hit for RELIANCE." },
    { id: "2", eventType: "entry", kind: "ENTRY", title: "Entered", body: "Filled", symbol: "TCS", occurredAt: "2026-08-23T09:58:00.000Z", tradeId: "t2", deepLink: "/paper-trading?tradeId=t2", speechText: "Paper trade entry for TCS." },
    { id: "1", eventType: "closed", kind: "ENTRY", title: "Old", body: "Old", symbol: "INFY", occurredAt: "bad-date", tradeId: null, deepLink: "/paper-trading", speechText: "Old." },
  ],
};

test("paper alert list retains only valid entry and target events", () => {
  assert.deepEqual(validPaperTradeNotifications(response).map((item) => item.id), ["3", "2"]);
});

test("new event detection does not replay the seeded durable history", () => {
  const items = validPaperTradeNotifications(response);
  assert.deepEqual(unseenNotificationIds(new Set(items.map((item) => item.id)), items), []);
  assert.deepEqual(unseenNotificationIds(new Set(["2"]), items), ["3"]);
});
