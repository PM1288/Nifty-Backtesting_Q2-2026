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
