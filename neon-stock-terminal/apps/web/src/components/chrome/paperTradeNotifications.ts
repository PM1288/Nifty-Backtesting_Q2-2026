export type PaperTradeNotificationKind = "ENTRY" | "TARGET_HIT";

export type PaperTradeNotification = {
  id: string;
  eventType: string;
  kind: PaperTradeNotificationKind;
  title: string;
  body: string;
  symbol: string;
  stockName?: string;
  entryPrice?: number | null;
  targetPrice?: number | null;
  occurredAt: string;
  tradeId: string | null;
  deepLink: string;
  speechText: string;
};

function spokenPrice(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : null;
}

export function paperTradeSpeechText(item: PaperTradeNotification) {
  const stockName = item.stockName?.trim() || item.symbol;
  if (item.kind === "TARGET_HIT") return `Target hit. ${stockName}.`;
  const entry = spokenPrice(item.entryPrice);
  const target = spokenPrice(item.targetPrice);
  return [
    `${stockName}.`,
    entry ? `Entry price ${entry} rupees.` : null,
    target ? `Target price ${target} rupees.` : null,
  ].filter(Boolean).join(" ");
}

export function paperVoiceEnabledByDefault(storedPreference: string | null) {
  return storedPreference !== "mute";
}

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
