import assert from "node:assert/strict";
import test from "node:test";
import { buildMobileMessage } from "./firebaseMessaging";
import { TradeNotificationEventService, targetPrice, type TradeNotificationPayload } from "./notificationSystem";

test("Firebase message is data-only and live updates are collapsible", () => {
  const now = new Date().toISOString();
  const trade: TradeNotificationPayload = {
    mode: "paper", instrumentType: "cash", side: "long", symbol: "BOSCHLTD", strategy: "configured-stock-ladder",
    quantity: 25, remainingQuantity: 25, entryPrice: 46500, ltp: 46660, openedAt: now,
    stopLoss: 46250, netPnl: 3523.13,
    targets: [0.3, 0.4, 0.5].map((percent, index) => ({ targetId: `T${index + 1}` as "T1" | "T2" | "T3", favourableMovePercent: percent, targetPrice: targetPrice("long", 46500, percent), status: "pending" }))
  };
  const event = TradeNotificationEventService.monitor({ eventId: "evt-1", notificationId: 505001, action: "update", tradeId: "paper-1", occurredAt: now, dataAsOf: now, source: "paper trading", trade });
  const message = buildMobileMessage(["token"], event);
  assert.equal(message.notification, undefined);
  assert.equal(message.android?.notification, undefined);
  assert.equal(message.android?.priority, "normal");
  assert.equal(message.android?.collapseKey, "paper:paper-1:monitor");
});

test("spoken target messages remain data-only and use high-priority FCM", () => {
  const now = new Date().toISOString();
  const target = { targetId: "T1" as const, favourableMovePercent: 0.3, targetPrice: 100.3, status: "hit" as const, netPnl: 1360 };
  const trade: TradeNotificationPayload = { mode: "paper", instrumentType: "cash", side: "long", symbol: "RELIANCE", strategy: "OIIS", quantity: 25, remainingQuantity: 25, entryPrice: 100, ltp: 100.3, openedAt: now, netPnl: 1360, targets: [target] };
  const event = TradeNotificationEventService.lifecycle({ eventId: "target-tts", notificationId: 72001, eventType: "paper_target_hit", tradeId: "paper-tts", occurredAt: now, dataAsOf: now, source: "paper trading", trade, target });
  const message = buildMobileMessage(["token"], event);
  assert.equal(message.notification, undefined);
  assert.equal(message.android?.notification, undefined);
  assert.equal(message.android?.priority, "high");
  assert.match(message.data?.tts_text ?? "", /Net paper profit/);
});
