import crypto from "node:crypto";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

type Row = Record<string, unknown>;

const deviceSchema = z.object({
  installationId: z.string().trim().min(24).max(128),
  platform: z.literal("ANDROID"),
  pushToken: z.string().trim().min(32).max(4096),
  appVersion: z.string().trim().max(40).optional(),
  buildNumber: z.string().trim().max(40).optional(),
  locale: z.string().trim().max(24).optional(),
  timezone: z.string().trim().max(80).optional()
});

const limitSchema = z.coerce.number().int().min(1).max(100).default(50);

function text(value: unknown, fallback: string, max: number) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return (candidate || fallback).slice(0, max);
}

function finite(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function paperEvent(row: Row) {
  const payload = (row.payload && typeof row.payload === "object" ? row.payload : {}) as Record<string, unknown>;
  const data = (payload.data && typeof payload.data === "object" ? payload.data : {}) as Record<string, unknown>;
  const notification = (data.notification && typeof data.notification === "object" ? data.notification : {}) as Record<string, unknown>;
  const eventType = text(row.event_type, "paper.event", 120);
  const symbol = text(data.symbol, "Paper trade", 24);
  const tradeId = text(data.trade_group_id ?? data.client_group_id ?? row.aggregate_id, "", 80);
  const isStale = eventType.includes("market_data.stale");
  const isRecovery = eventType.includes("market_data.recovered");
  const isTarget = eventType.includes("target");
  const isClosed = eventType.includes("closed");
  const category = isStale || isRecovery ? "SYSTEM" : "TRADES";
  const occurredAt = new Date(String(row.event_time)).toISOString();
  const title = text(notification.title ?? data.title, `${symbol} · ${isTarget ? "Target update" : isClosed ? "Trade closed" : "Trade update"}`, 80);
  const body = text(notification.message ?? data.message, `${symbol} paper-trading lifecycle changed.`, 160);
  const facts: Array<{ label: string; value: string; semantic: string }> = [];
  const entry = finite(data.entry_price);
  const quantity = finite(data.quantity);
  if (entry !== null) facts.push({ label: "Entry", value: `₹${entry.toLocaleString("en-IN")}`, semantic: "price" });
  if (quantity !== null) facts.push({ label: "Qty", value: String(quantity), semantic: "quantity" });
  if (data.side) facts.push({ label: "Side", value: text(data.side, "—", 12), semantic: "direction" });
  return {
    notificationId: String(row.event_id), eventId: String(row.event_id), schemaVersion: "1.0", eventType,
    category, severity: isStale ? "CRITICAL" : isRecovery ? "RECOVERY" : isTarget || isClosed ? "ATTENTION" : "INFO",
    channelId: isStale || isRecovery ? "market_data_health_v2" : "trade_lifecycle_v2",
    groupKey: isStale || isRecovery ? "n50.data_health" : "n50.trades",
    collapseKey: tradeId ? `paper:${tradeId}` : `paper:${String(row.aggregate_id)}`,
    dedupeKey: `paper:${String(row.event_id)}`, occurredAt, createdAt: occurredAt, expiresAt: null,
    title, body, summary: text(data.display_label, eventType, 160),
    privacyTitle: category === "TRADES" ? "Paper trade update" : "Market data update",
    privacyBody: "Unlock N50 to view details.", badge: category === "TRADES" ? "TRADE" : isRecovery ? "LIVE" : "DATA",
    deepLink: tradeId ? `/paper/${encodeURIComponent(tradeId)}` : "/paper", facts,
    actions: [{ id: "open", label: "Open", kind: "OPEN", requiresUnlock: true, requiresAuth: true }],
    presentation: { headsUp: !isRecovery, ongoing: false, autoCancel: true, privateOnLockScreen: true, onlyAlertOnce: true },
    state: { read: Boolean(row.read_at), acknowledged: Boolean(row.acknowledged_at), snoozedUntil: null }
  };
}

function paperPopupEvent(row: Row) {
  const event = paperEvent(row);
  const payload = (row.payload && typeof row.payload === "object" ? row.payload : {}) as Record<string, unknown>;
  const data = (payload.data && typeof payload.data === "object" ? payload.data : {}) as Record<string, unknown>;
  const tradeId = text(data.trade_group_id ?? data.client_group_id ?? row.aggregate_id, "", 80);
  const eventType = String(row.event_type ?? "");
  const kind = eventType.endsWith("trade_leg.opened.v1") ? "ENTRY" : "TARGET_HIT";
  const body = event.body.startsWith(event.title)
    ? event.body.slice(event.title.length).replace(/^\s+/, "")
    : event.body;
  const numberText = (value: unknown) => {
    const parsed = finite(value);
    return parsed === null ? null : parsed.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  };
  const activeTarget = (data.active_exit_target && typeof data.active_exit_target === "object" ? data.active_exit_target : {}) as Record<string, unknown>;
  const swingTarget = (data.swing_exit_target && typeof data.swing_exit_target === "object" ? data.swing_exit_target : {}) as Record<string, unknown>;
  const tracks = Array.isArray(data.newly_closed_target_tracks) ? data.newly_closed_target_tracks as Array<Record<string, unknown>> : [];
  const targetLevels = tracks.map((track) => {
    const pct = finite(track.target_pct);
    if (pct === null) return null;
    return `${(Math.abs(pct) < 0.1 ? pct * 100 : pct).toLocaleString("en-IN", { maximumFractionDigits: 2 })} percent`;
  }).filter(Boolean);
  const speechParts = kind === "ENTRY"
    ? [
        `Paper trade entry. ${text(data.symbol, "Paper trade", 24)} ${text(data.side, "", 12)} position entered.`,
        numberText(data.fill_price ?? data.entry_price) ? `Entry price ${numberText(data.fill_price ?? data.entry_price)} rupees.` : null,
        numberText(data.fill_quantity ?? data.quantity) ? `Quantity ${numberText(data.fill_quantity ?? data.quantity)}.` : null,
        data.strategy_name ?? data.strategy_id ? `Entry conditions satisfied by ${text(data.strategy_name ?? data.strategy_id, "the configured strategy", 80)}.` : "Configured entry conditions were satisfied.",
        numberText(activeTarget.target_price) ? `First governed exit condition is the intraday target at ${numberText(activeTarget.target_price)} rupees.` : "Governed exit conditions remain active.",
        numberText(swingTarget.target_price) ? `Swing exit condition is ${numberText(swingTarget.target_price)} rupees.` : null,
      ]
    : [
        `Paper trade target condition hit for ${text(data.symbol, "paper trade", 24)}.`,
        targetLevels.length ? `Target levels reached: ${targetLevels.join(", ")}.` : "A configured target level was reached.",
        numberText(data.current_price) ? `Observed price ${numberText(data.current_price)} rupees.` : null,
        data.actual_execution_position_status ? `Actual paper execution position is ${text(data.actual_execution_position_status, "unchanged", 24)}.` : null,
        data.higher_tracks_remain_active ? "Higher analytical targets remain active." : "No higher analytical target is currently reported by this event.",
      ];
  return {
    id: String(row.event_id),
    eventType,
    kind,
    title: event.title,
    body,
    symbol: text(data.symbol, "Paper trade", 24),
    occurredAt: event.occurredAt,
    tradeId: tradeId || null,
    deepLink: tradeId
      ? `/paper-trading?tradeId=${encodeURIComponent(tradeId)}&source=paper-alert`
      : "/paper-trading?source=paper-alert",
    speechText: speechParts.filter(Boolean).join(" "),
  };
}

export function registerMobileNotifications(app: Express, prisma: PrismaClient) {
  app.post("/v1/mobile/devices", async (req, res, next) => {
    try {
      const userUid = req.authUser?.uid;
      if (!userUid) return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Authentication is required." } });
      const input = deviceSchema.parse(req.body);
      const tokenHash = crypto.createHash("sha256").update(input.pushToken).digest("hex");
      const rows = await prisma.$queryRawUnsafe<Row[]>(`
        insert into mobile_notifications.device
          (user_uid,installation_id,platform,push_token,push_token_hash,app_version,build_number,locale,timezone)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        on conflict (user_uid,installation_id) do update set
          platform=excluded.platform,push_token=excluded.push_token,push_token_hash=excluded.push_token_hash,
          app_version=excluded.app_version,build_number=excluded.build_number,locale=excluded.locale,
          timezone=excluded.timezone,enabled=true,last_registered_at=now(),updated_at=now()
        returning device_id::text,enabled,last_registered_at`,
        userUid, input.installationId, input.platform, input.pushToken, tokenHash,
        input.appVersion ?? null, input.buildNumber ?? null, input.locale ?? null, input.timezone ?? null
      );
      return res.status(200).json({ deviceId: rows[0]?.device_id, enabled: rows[0]?.enabled, registeredAt: rows[0]?.last_registered_at });
    } catch (error) { next(error); }
  });

  app.get("/v1/mobile/notifications", async (req, res, next) => {
    try {
      const userUid = req.authUser?.uid;
      if (!userUid) return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Authentication is required." } });
      const limit = limitSchema.parse(req.query.limit);
      const rows = await prisma.$queryRawUnsafe<Row[]>(`
        select e.event_id::text,e.aggregate_id::text,e.event_type,e.event_time,e.payload,
               s.read_at,s.acknowledged_at
        from paper_trading.trade_events e
        left join mobile_notifications.notification_state s on s.event_id=e.event_id and s.user_uid=$1
        where e.payload->'data'->'notification' is not null
        order by e.event_time desc,e.sequence desc
        limit $2`, userUid, limit);
      return res.json({ asOf: new Date().toISOString(), source: "paper_trading.trade_events", items: rows.map((row) => ({ event: paperEvent(row) })) });
    } catch (error) { next(error); }
  });

  app.get("/v1/paper/notifications", async (req, res, next) => {
    try {
      const userUid = req.authUser?.uid;
      if (!userUid) return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Authentication is required." } });
      const limit = Math.min(limitSchema.parse(req.query.limit), 5);
      const rows = await prisma.$queryRawUnsafe<Row[]>(`
        select e.event_id::text,e.aggregate_id::text,e.event_type,e.event_time,e.payload,
               null::timestamptz as read_at,null::timestamptz as acknowledged_at
        from paper_trading.trade_events e
        where e.payload->'data'->'notification' is not null
          and e.event_type in (
            'com.papertrading.trade_leg.opened.v1',
            'com.papertrading.target_track.closed.v1'
          )
        order by e.event_time desc,e.sequence desc
        limit $1`, limit);
      return res.json({
        asOf: new Date().toISOString(),
        source: "paper_trading.trade_events",
        items: rows.map(paperPopupEvent),
      });
    } catch (error) { next(error); }
  });
}
