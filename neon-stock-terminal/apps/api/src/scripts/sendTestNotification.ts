import { sendMobileEvent, type MobileNotificationEvent } from "../services/firebaseMessaging";
import { MarketSnapshotService, TradeNotificationEventService, targetPrice, type TradeNotificationPayload } from "../services/notificationSystem";

const modes = ["standard", "live-start", "live-update", "live-complete", "live-cancel"] as const;
const mode = process.argv[2] as (typeof modes)[number] | undefined;
const token = process.env.FCM_TEST_TOKEN;
if (!mode || !modes.includes(mode) || !token) {
  console.error("Usage: FCM_TEST_TOKEN=<token> pnpm notification:test <standard|live-start|live-update|live-complete|live-cancel>");
  process.exit(2);
}

const now = new Date().toISOString();
const action = mode === "standard" ? "standard" : mode.replace("live-", "") as MobileNotificationEvent["action"];
const liveAction = action === "start" || action === "update" || action === "complete" ? action : "update";
const progressLtp = action === "update" ? 46660 : action === "complete" ? 46732.5 : 46500;
const trade: TradeNotificationPayload = {
  mode: "paper", instrumentType: "cash", side: "long", symbol: "BOSCHLTD", strategy: "configured-stock-ladder",
  quantity: 25, remainingQuantity: action === "complete" ? 0 : 25, entryPrice: 46500, ltp: progressLtp,
  openedAt: now, stopLoss: 46250, grossPnl: (progressLtp - 46500) * 25, charges: 248, taxes: 80,
  netPnl: (progressLtp - 46500) * 25 - 328,
  targets: [0.3, 0.4, 0.5].map((percent, index) => ({
    targetId: `T${index + 1}` as "T1" | "T2" | "T3", favourableMovePercent: percent,
    targetPrice: targetPrice("long", 46500, percent), status: progressLtp >= targetPrice("long", 46500, percent) ? "hit" : "pending"
  }))
};

const event: MobileNotificationEvent = mode === "standard"
  ? MarketSnapshotService.fromSnapshot({
      eventId: `cli-${Date.now()}`, eventType: "market_open", notificationId: 506010,
      occurredAt: now, dataAsOf: now, source: "development sender", title: "MARKET OPEN",
      body: "NIFTY 24,866 · +0.41% · Data as of 09:15:08 IST",
      lines: ["Breadth 36 advance / 14 decline", "India VIX 13.84 · -1.2%", "Strong: Auto · Metal"],
      deepLink: "/market/pulse", dedupeKey: `dev:market-open:${now.slice(0, 10)}`
    })
  : action === "cancel"
    ? { ...TradeNotificationEventService.monitor({ eventId: `cli-${Date.now()}`, notificationId: 505001, action: "update", tradeId: "cli-paper-trade", occurredAt: now, dataAsOf: now, source: "development sender", trade }), action: "cancel" }
    : TradeNotificationEventService.monitor({ eventId: `cli-${Date.now()}`, notificationId: 505001, action: liveAction, tradeId: "cli-paper-trade", occurredAt: now, dataAsOf: now, source: "development sender", trade });

async function main() {
  const result = await sendMobileEvent([token!], event);
  console.log(JSON.stringify({ mode, eventType: event.type, notificationId: event.notification_id, ...result }));
  if (result.failureCount) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
