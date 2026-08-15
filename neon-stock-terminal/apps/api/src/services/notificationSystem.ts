import { z } from "zod";

export const notificationDomains = [
  "trade", "paper_trade", "market_lifecycle", "market_regime", "index", "stock",
  "watchlist", "global_markets", "commodities", "currency", "volatility",
  "macro_calendar", "portfolio", "daily_summary", "data_health", "security"
] as const;

export type NotificationDomain = (typeof notificationDomains)[number];
export type NotificationPriority = "low" | "normal" | "high";
export type NotificationStyle = "progress" | "big_text" | "inbox";

export type TargetOutcome = {
  targetId: "T1" | "T2" | "T3";
  favourableMovePercent: number;
  targetPrice: number;
  status: "pending" | "hit" | "not_hit" | "expired" | "window_closed";
  hitAt?: string;
  grossPnl?: number;
  charges?: number;
  taxes?: number;
  netPnl?: number;
};

export type TradeNotificationPayload = {
  mode: "paper" | "real";
  instrumentType: "cash" | "future" | "option";
  side: "long" | "short";
  symbol: string;
  strategy: string;
  quantity: number;
  remainingQuantity: number;
  entryPrice: number;
  ltp: number;
  openedAt: string;
  stopLoss?: number;
  grossPnl?: number;
  charges?: number;
  taxes?: number;
  netPnl?: number;
  d0ClosePrice?: number;
  d0ClosePnl?: number;
  targetWindowClosed?: boolean;
  targets: TargetOutcome[];
};

export type NotificationEvent<T extends Record<string, unknown> = Record<string, unknown>> = {
  schemaVersion: 1;
  eventId: string;
  eventType: string;
  domain: NotificationDomain;
  occurredAt: string;
  dataAsOf: string;
  source?: string;
  priority: NotificationPriority;
  templateId: string;
  channelId: string;
  userId?: string;
  symbol?: string;
  exchange?: string;
  deepLink: string;
  dedupeKey: string;
  expiresAt?: string;
  payload: T;
};

export type TemplateDefinition = {
  eventType: string;
  domain: NotificationDomain;
  channelId: string;
  templateId: string;
  style: NotificationStyle;
  priority: NotificationPriority;
  sound: "none" | "default" | "critical_preference";
  vibration: "none" | "default" | "critical_preference";
  dedupe: "event" | "activity" | "state_change" | "threshold_episode";
  preferenceKey: string;
  ttlSeconds: number;
};

const define = (eventType: string, domain: NotificationDomain, channelId: string, style: NotificationStyle, priority: NotificationPriority, dedupe: TemplateDefinition["dedupe"], ttlSeconds: number): TemplateDefinition => ({
  eventType, domain, channelId, style, priority, dedupe, ttlSeconds,
  templateId: `${eventType}_v1`, preferenceKey: eventType,
  sound: priority === "high" ? "critical_preference" : priority === "low" ? "none" : "default",
  vibration: priority === "high" ? "critical_preference" : priority === "low" ? "none" : "default"
});

const templateDefinitions = [
  define("paper_trade_opened", "paper_trade", "paper_trade_live_v2", "big_text", "normal", "event", 3600),
  define("paper_trade_monitor", "paper_trade", "paper_trade_live_v2", "progress", "normal", "activity", 21600),
  define("paper_target_hit", "paper_trade", "trade_milestones_v2", "big_text", "high", "event", 7200),
  define("paper_target_summary", "paper_trade", "daily_summary_v1", "inbox", "low", "event", 86400),
  define("paper_stop_hit", "paper_trade", "trade_critical_v2", "big_text", "high", "event", 7200),
  define("paper_trade_closed", "paper_trade", "trade_milestones_v2", "big_text", "high", "event", 86400),
  define("real_trade_opened", "trade", "real_trade_live_v1", "big_text", "high", "event", 3600),
  define("real_trade_monitor", "trade", "real_trade_live_v1", "progress", "normal", "activity", 21600),
  define("real_target_hit", "trade", "trade_milestones_v2", "big_text", "high", "event", 7200),
  define("real_stop_hit", "trade", "trade_critical_v2", "big_text", "high", "event", 7200),
  define("real_trade_closed", "trade", "trade_critical_v2", "big_text", "high", "event", 86400),
  define("market_preopen_global_cues", "global_markets", "global_markets_v1", "inbox", "normal", "state_change", 3600),
  define("market_preopen_snapshot", "market_lifecycle", "market_lifecycle_v1", "inbox", "normal", "event", 1800),
  define("market_open", "market_lifecycle", "market_lifecycle_v1", "inbox", "normal", "event", 3600),
  define("market_first_hour", "daily_summary", "daily_summary_v1", "inbox", "normal", "event", 7200),
  define("market_midday", "daily_summary", "daily_summary_v1", "inbox", "normal", "event", 7200),
  define("market_closing_watch", "market_lifecycle", "market_lifecycle_v1", "big_text", "normal", "event", 1800),
  define("market_closed", "market_lifecycle", "market_lifecycle_v1", "inbox", "normal", "event", 21600),
  define("market_eod_summary", "daily_summary", "daily_summary_v1", "inbox", "low", "event", 86400),
  define("market_regime_changed", "market_regime", "market_regime_v1", "big_text", "normal", "state_change", 10800),
  define("bullish_reversal", "market_regime", "market_regime_v1", "big_text", "high", "state_change", 7200),
  define("bearish_reversal", "market_regime", "market_regime_v1", "big_text", "high", "state_change", 7200),
  define("breadth_extreme", "index", "market_regime_v1", "big_text", "normal", "threshold_episode", 3600),
  define("india_vix_spike", "volatility", "commodities_fx_v1", "big_text", "high", "threshold_episode", 3600),
  define("watchlist_threshold", "watchlist", "watchlist_alerts_v1", "big_text", "normal", "threshold_episode", 7200),
  define("us_market_close", "global_markets", "global_markets_v1", "inbox", "normal", "event", 21600),
  define("global_risk_off", "global_markets", "global_markets_v1", "inbox", "high", "state_change", 7200),
  define("brent_threshold", "commodities", "commodities_fx_v1", "big_text", "normal", "threshold_episode", 7200),
  define("usd_inr_threshold", "currency", "commodities_fx_v1", "big_text", "normal", "threshold_episode", 7200),
  define("macro_reminder", "macro_calendar", "macro_calendar_v1", "big_text", "normal", "event", 3600),
  define("expiry_reminder", "macro_calendar", "options_alerts_v1", "inbox", "normal", "event", 21600),
  define("option_oi_shift", "index", "options_alerts_v1", "inbox", "normal", "state_change", 3600),
  define("data_stale", "data_health", "data_health_v1", "big_text", "high", "threshold_episode", 1800),
  define("data_unavailable", "data_health", "data_health_v1", "big_text", "high", "state_change", 1800),
  define("security_event", "security", "security_v1", "big_text", "high", "event", 86400)
];

export class NotificationTemplateService {
  private static readonly templates = new Map(templateDefinitions.map((item) => [item.eventType, item]));
  static get(eventType: string) {
    const value = this.templates.get(eventType);
    if (!value) throw new Error(`No template registered for ${eventType}`);
    return value;
  }
  static all() { return [...this.templates.values()]; }
}

export const mobileNotificationEventSchema = z.record(z.string(), z.string()).and(z.object({
  schema_version: z.literal("1"), event_id: z.string().min(1), type: z.string().min(1),
  domain: z.enum(notificationDomains), action: z.enum(["standard", "start", "update", "complete", "cancel"]),
  notification_id: z.string().regex(/^\d+$/), template_id: z.string().min(1),
  template_style: z.enum(["progress", "big_text", "inbox"]), channel_id: z.string().min(1),
  priority: z.enum(["low", "normal", "high"]), title: z.string().min(1).max(100),
  body: z.string().min(1).max(900), route: z.string().startsWith("/"),
  dedupe_key: z.string().min(1), event_at: z.string().datetime({ offset: true }),
  data_as_of: z.string().datetime({ offset: true })
}));

export type MobileNotificationEvent = z.infer<typeof mobileNotificationEventSchema>;

export function favourableMovePercent(side: "long" | "short", entry: number, ltp: number) {
  if (!(entry > 0) || !(ltp > 0)) throw new Error("Entry and LTP must be positive");
  return ((side === "long" ? ltp - entry : entry - ltp) / entry) * 100;
}

export function targetPrice(side: "long" | "short", entry: number, favourablePercent: number) {
  return entry * (side === "long" ? 1 + favourablePercent / 100 : 1 - favourablePercent / 100);
}

export function normalisedProgress(input: Pick<TradeNotificationPayload, "side" | "entryPrice" | "ltp" | "stopLoss" | "targets">) {
  if (!input.stopLoss || !input.targets.length) return 20;
  const finalTarget = [...input.targets].sort((a, b) => a.favourableMovePercent - b.favourableMovePercent).at(-1)!.targetPrice;
  const favourable = input.side === "long" ? input.ltp >= input.entryPrice : input.ltp <= input.entryPrice;
  if (!favourable) return Math.max(0, Math.min(20, 20 * (1 - Math.abs(input.ltp - input.entryPrice) / Math.abs(input.entryPrice - input.stopLoss))));
  return Math.max(20, Math.min(100, 20 + 80 * Math.abs(input.ltp - input.entryPrice) / Math.abs(finalTarget - input.entryPrice)));
}

export class TradeNotificationEventService {
  static monitor(input: { eventId: string; notificationId: number; action: "start" | "update" | "complete"; tradeId: string; occurredAt: string; dataAsOf: string; source: string; trade: TradeNotificationPayload }): MobileNotificationEvent {
    const { trade } = input;
    const template = NotificationTemplateService.get(`${trade.mode}_trade_monitor`);
    const move = favourableMovePercent(trade.side, trade.entryPrice, trade.ltp);
    const progress = normalisedProgress(trade);
    const mode = trade.mode.toUpperCase();
    const side = trade.side.toUpperCase();
    const money = (value: number | undefined) => value == null ? "—" : value.toFixed(2);
    const target = (index: number) => trade.targets[index]?.targetPrice == null ? "—" : money(trade.targets[index].targetPrice);
    return mobileNotificationEventSchema.parse({
      schema_version: "1", event_id: input.eventId, type: `${trade.mode}_trade_monitor`, domain: template.domain,
      action: input.action, activity_id: input.tradeId, notification_id: String(input.notificationId),
      template_id: template.templateId, template_style: template.style, channel_id: template.channelId,
      priority: template.priority, title: `${trade.symbol} · ${mode} ${side}`,
      body: `₹${money(trade.ltp)} · ${move >= 0 ? "+" : ""}${move.toFixed(2)}% · Net P&L ${money(trade.netPnl)}`,
      lines: "", short_text: input.action === "complete" ? "DONE" : `${move >= 0 ? "+" : ""}${move.toFixed(1)}%`,
      progress: String(Math.round(progress)), stage: input.action === "complete" ? "TRADE_CLOSED" : "MONITORING",
      route: `/${trade.mode}-trades/${encodeURIComponent(input.tradeId)}`, dedupe_key: `${trade.mode}:${input.tradeId}:monitor`,
      event_at: input.occurredAt, data_as_of: input.dataAsOf, expires_at: "", source: input.source,
      symbol: trade.symbol, side, trade_mode: mode, entry: money(trade.entryPrice), ltp: money(trade.ltp),
      pnl: money(trade.netPnl), pnl_percent: move.toFixed(2), gross_pnl: money(trade.grossPnl),
      charges: money(trade.charges), taxes: money(trade.taxes), quantity: String(trade.quantity),
      remaining_quantity: String(trade.remainingQuantity), opened_at: trade.openedAt, stop_loss: money(trade.stopLoss),
      target_1: target(0), target_2: target(1), target_3: target(2), targets_json: JSON.stringify(trade.targets),
      data_freshness: "Current"
    });
  }
}

export type QualifiedDomainResult = {
  eventId: string; eventType: string; occurredAt: string; dataAsOf: string; source: string;
  title: string; body: string; lines?: string[]; deepLink: string; dedupeKey: string;
  symbol?: string; notificationId: number;
};

function qualifiedEvent(result: QualifiedDomainResult): MobileNotificationEvent {
  const template = NotificationTemplateService.get(result.eventType);
  return mobileNotificationEventSchema.parse({
    schema_version: "1", event_id: result.eventId, type: result.eventType, domain: template.domain,
    action: "standard", activity_id: result.eventId, notification_id: String(result.notificationId),
    template_id: template.templateId, template_style: template.style, channel_id: template.channelId,
    priority: template.priority, title: result.title, body: result.body, lines: (result.lines ?? []).join("\n"),
    short_text: "N50", progress: "0", stage: result.eventType.toUpperCase(), route: result.deepLink,
    dedupe_key: result.dedupeKey, event_at: result.occurredAt, data_as_of: result.dataAsOf,
    expires_at: "", source: result.source, symbol: result.symbol ?? "NIFTY", side: "NONE", trade_mode: "NONE",
    entry: "—", ltp: "—", pnl: "—", pnl_percent: "—", gross_pnl: "—", charges: "—", taxes: "—",
    quantity: "—", remaining_quantity: "—", opened_at: "—", stop_loss: "—", target_1: "—", target_2: "—",
    target_3: "—", targets_json: "[]", data_freshness: "Current"
  });
}

export class MarketRegimeEventService { static fromQualifiedResult(result: QualifiedDomainResult) { return qualifiedEvent(result); } }
export class GlobalCuesService { static fromApprovedSnapshot(result: QualifiedDomainResult) { return qualifiedEvent(result); } }
export class MarketSnapshotService { static fromSnapshot(result: QualifiedDomainResult) { return qualifiedEvent(result); } }
export class CommodityAlertService { static fromQualifiedThreshold(result: QualifiedDomainResult) { return qualifiedEvent(result); } }
export class MacroCalendarService { static fromApprovedEvent(result: QualifiedDomainResult) { return qualifiedEvent(result); } }
export class TargetEvaluationService {
  static target(side: "long" | "short", entry: number, favourablePercent: number) { return targetPrice(side, entry, favourablePercent); }
}

export type ExchangeSession = { date: string; isTradingDay: boolean; specialSession?: boolean; times: Record<string, string> };
export class MarketCalendarService {
  constructor(private readonly sessions: Map<string, ExchangeSession>) {}
  session(date: string) { return this.sessions.get(date); }
  isTradingDay(date: string) { return this.sessions.get(date)?.isTradingDay === true; }
}

export class MarketLifecycleScheduler {
  constructor(private readonly calendar: MarketCalendarService) {}
  due(date: string, time: string) {
    const session = this.calendar.session(date);
    if (!session?.isTradingDay) return [];
    return Object.entries(session.times).filter(([, configured]) => configured === time).map(([eventType]) => eventType);
  }
}

export type PreferencePolicy = { enabled: boolean; domains: Partial<Record<NotificationDomain, boolean>>; quiet: boolean; maximumPerHour: number; dailyBudget: number };
export class NotificationPreferenceService {
  static allows(event: NotificationEvent, policy: PreferencePolicy) {
    if (!policy.enabled || policy.domains[event.domain] === false) return false;
    return !policy.quiet || event.priority === "high";
  }
}

export class NotificationAuditService {
  static record(input: { eventId: string; userId?: string; outcome: "sent" | "suppressed" | "failed"; reason?: string }) {
    return { ...input, recordedAt: new Date().toISOString() };
  }
}

export class NotificationDeduplicationService {
  static key(event: NotificationEvent) { return `${event.userId ?? "broadcast"}:${event.dedupeKey}`; }
  static inCooldown(lastDeliveredAt: Date | null, now: Date, cooldownSeconds: number) {
    return lastDeliveredAt != null && now.valueOf() - lastDeliveredAt.valueOf() < cooldownSeconds * 1000;
  }
}

export class NotificationEventRouter {
  static toMobile(event: QualifiedDomainResult) { return qualifiedEvent(event); }
}
