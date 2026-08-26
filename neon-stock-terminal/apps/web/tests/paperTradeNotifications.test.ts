import assert from "node:assert/strict";
import test from "node:test";
import { paperTradeSpeechText, paperVoiceEnabledByDefault, unseenNotificationIds, validPaperTradeNotifications, type PaperTradeNotificationResponse } from "../src/components/chrome/paperTradeNotifications";

const response: PaperTradeNotificationResponse = {
  asOf: "2026-08-23T10:00:00.000Z",
  source: "paper_trading.trade_events",
  items: [
    { id: "3", eventType: "target", kind: "TARGET_HIT", title: "Target", body: "+0.5%", symbol: "RELIANCE", stockName: "Reliance Industries", entryPrice: 2941.5, targetPrice: 2998.5, occurredAt: "2026-08-23T09:59:00.000Z", tradeId: "t3", deepLink: "/paper-trading?tradeId=t3", speechText: "legacy verbose speech" },
    { id: "2", eventType: "entry", kind: "ENTRY", title: "Entered", body: "Filled", symbol: "TCS", stockName: "Tata Consultancy Services", entryPrice: 3210, targetPrice: 3250.25, occurredAt: "2026-08-23T09:58:00.000Z", tradeId: "t2", deepLink: "/paper-trading?tradeId=t2", speechText: "legacy verbose speech" },
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

test("browser speech says only stock, entry and target for an entry", () => {
  assert.equal(paperTradeSpeechText(response.items[1]!), "Tata Consultancy Services. Entry price 3,210.00 rupees. Target price 3,250.25 rupees.");
});

test("browser speech says only target hit and stock name for a target", () => {
  assert.equal(paperTradeSpeechText(response.items[0]!), "Target hit. Reliance Industries.");
});

test("paper speech is enabled by default while an explicit mute remains respected", () => {
  assert.equal(paperVoiceEnabledByDefault(null), true);
  assert.equal(paperVoiceEnabledByDefault("speak"), true);
  assert.equal(paperVoiceEnabledByDefault("mute"), false);
});
