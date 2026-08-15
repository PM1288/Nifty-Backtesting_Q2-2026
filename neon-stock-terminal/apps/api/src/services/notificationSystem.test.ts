import assert from "node:assert/strict";
import test from "node:test";
import {
  favourableMovePercent, MarketCalendarService, MarketLifecycleScheduler,
  NotificationTemplateService, normalisedProgress, targetPrice, TradeNotificationEventService,
  NotificationSpeechFormatter,
  type ExchangeSession, type TradeNotificationPayload
} from "./notificationSystem";

test("long and short target mathematics are correct", () => {
  assert.ok(Math.abs(targetPrice("long", 100, 0.3) - 100.3) < 0.000001);
  assert.ok(Math.abs(targetPrice("short", 100, 0.3) - 99.7) < 0.000001);
  assert.equal(favourableMovePercent("long", 100, 100.5), 0.5);
  assert.ok(Math.abs(favourableMovePercent("short", 116.25, 115.82) - 0.3698924731) < 0.000001);
});

test("trade monitor is data-only, all-string and explicitly paper or real", () => {
  const now = new Date().toISOString();
  const trade: TradeNotificationPayload = {
    mode: "paper", instrumentType: "cash", side: "short", symbol: "IREDA", strategy: "OIIS",
    quantity: 4500, remainingQuantity: 4500, entryPrice: 116.25, ltp: 115.82, openedAt: now,
    stopLoss: 117.1, grossPnl: 1935, charges: 251.07, taxes: 100, netPnl: 1583.93,
    targets: [0.3, 0.4, 0.5].map((percent, index) => ({ targetId: `T${index + 1}` as "T1" | "T2" | "T3", favourableMovePercent: percent, targetPrice: targetPrice("short", 116.25, percent), status: "pending" }))
  };
  const event = TradeNotificationEventService.monitor({ eventId: "evt-1", notificationId: 505011, action: "update", tradeId: "paper-1", occurredAt: now, dataAsOf: now, source: "paper trading", trade });
  assert.equal(event.trade_mode, "PAPER");
  assert.equal(event.side, "SHORT");
  assert.match(event.title, /PAPER SHORT/);
  assert.ok(Object.values(event).every((value) => typeof value === "string"));
  assert.ok(Number(event.progress) >= 20);
});

test("market lifecycle uses the supplied exchange calendar", () => {
  const calendar = new MarketCalendarService(new Map<string, ExchangeSession>([
    ["2026-08-17", { date: "2026-08-17", isTradingDay: true, times: { market_open: "09:15", market_closed: "15:30" } }],
    ["2026-08-15", { date: "2026-08-15", isTradingDay: false, times: {} }]
  ]));
  const scheduler = new MarketLifecycleScheduler(calendar);
  assert.deepEqual(scheduler.due("2026-08-17", "09:15"), ["market_open"]);
  assert.deepEqual(scheduler.due("2026-08-15", "09:15"), []);
});

test("template registry covers every configured domain family", () => {
  assert.equal(NotificationTemplateService.get("market_regime_changed").channelId, "market_reversal_v1");
  assert.equal(NotificationTemplateService.get("brent_threshold").domain, "commodities");
  assert.equal(NotificationTemplateService.get("paper_trade_monitor").style, "progress");
});

test("paper lifecycle payload contains purpose-built private and financial speech", () => {
  const now = new Date().toISOString();
  const target = { targetId: "T1" as const, favourableMovePercent: 0.3, targetPrice: 46639.5, status: "hit" as const, netPnl: 3523.13 };
  const trade: TradeNotificationPayload = {
    mode: "paper", instrumentType: "cash", side: "long", symbol: "BOSCHLTD", strategy: "OIIS",
    quantity: 25, remainingQuantity: 25, entryPrice: 46500, ltp: 46660, openedAt: now,
    stopLoss: 46250, netPnl: 3523.13, targets: [target]
  };
  const event = TradeNotificationEventService.lifecycle({ eventId: "target-1", notificationId: 72001, eventType: "paper_target_hit", tradeId: "paper-1", occurredAt: now, dataAsOf: now, source: "paper trading", trade, target });
  assert.equal(event.channel_id, "paper_target_hit_v2");
  assert.match(event.tts_text, /Paper target one reached/);
  assert.match(event.tts_text, /three thousand five hundred twenty three/);
  assert.doesNotMatch(event.private_tts_text, /3523|profit/i);
  assert.equal(NotificationSpeechFormatter.number(1360), "one thousand three hundred sixty");
});

test("normalised progress keeps entry at 20 and T3 at 100 for shorts", () => {
  const targets = [0.3, 0.4, 0.5].map((percent, index) => ({ targetId: `T${index + 1}` as "T1" | "T2" | "T3", favourableMovePercent: percent, targetPrice: targetPrice("short", 100, percent), status: "pending" as const }));
  assert.equal(normalisedProgress({ side: "short", entryPrice: 100, ltp: 100, stopLoss: 101, targets }), 20);
  assert.equal(normalisedProgress({ side: "short", entryPrice: 100, ltp: 99.5, stopLoss: 101, targets }), 100);
});
