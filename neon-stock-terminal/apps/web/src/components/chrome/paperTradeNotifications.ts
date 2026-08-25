export type PaperTradeNotificationKind = "ENTRY" | "TARGET_HIT";

export type PaperTradeNotification = {
  id: string;
  eventType: string;
  kind: PaperTradeNotificationKind;
  title: string;
  body: string;
  symbol: string;
  occurredAt: string;
  tradeId: string | null;
  deepLink: string;
  speechText: string;
};

export type PaperTradeNotificationResponse = {
  asOf: string;
  source: "paper_trading.trade_events";
  items: PaperTradeNotification[];
};

export function validPaperTradeNotifications(value: PaperTradeNotificationResponse | undefined) {
  if (!value) return [];
  return value.items
    .filter((item) => item.kind === "ENTRY" || item.kind === "TARGET_HIT")
    .filter((item) => item.id && Number.isFinite(Date.parse(item.occurredAt)))
    .slice(0, 5);
}

export function unseenNotificationIds(previousIds: ReadonlySet<string>, items: PaperTradeNotification[]) {
  return items.filter((item) => !previousIds.has(item.id)).map((item) => item.id);
}
