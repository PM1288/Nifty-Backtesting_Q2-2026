import crypto from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { sendMobileEvent, type MobileNotificationEvent } from "../services/firebaseMessaging";
import { mobileNotificationEventSchema } from "../services/notificationSystem";

type Row = Record<string, unknown>;

const deviceSchema = z.object({
  installationId: z.string().trim().min(24).max(128),
  platform: z.literal("ANDROID"),
  pushToken: z.string().trim().min(32).max(4096),
  appVersion: z.string().trim().max(40).optional(),
  buildNumber: z.string().trim().max(40).optional(),
  locale: z.string().trim().max(24).optional(),
  timezone: z.string().trim().max(80).optional(),
  deviceModel: z.string().trim().max(120).optional(),
  deviceManufacturer: z.string().trim().max(80).optional()
});

const sendEventSchema = mobileNotificationEventSchema;

const speechPreferenceSchema = z.object({
  enabled: z.boolean(), paperTradeOpened: z.boolean(), paperTargetHit: z.boolean(),
  paperStopHit: z.boolean(), paperTradeClosed: z.boolean(), marketOpen: z.boolean(),
  marketClose: z.boolean(), marketReversal: z.boolean(), marketInformation: z.boolean(),
  readWhenLocked: z.boolean(), readFinancialValuesWhenLocked: z.boolean(),
  quietHoursEnabled: z.boolean(), quietHoursStart: z.number().int().min(0).max(1439),
  quietHoursEnd: z.number().int().min(0).max(1439), allowStopDuringQuietHours: z.boolean(),
  allowTargetDuringQuietHours: z.boolean(), speechRate: z.number().min(0.5).max(1.5),
  languageTag: z.string().min(2).max(35), audioRoute: z.enum(["any", "speaker", "bluetooth_or_headset_only"])
});

const preferenceSchema = z.object({
  enabled: z.boolean(),
  domains: z.record(z.boolean()).default({}),
  quietHours: z.object({ enabled: z.boolean(), startMinutes: z.number().int().min(0).max(1439), endMinutes: z.number().int().min(0).max(1439) }),
  minimumSignificance: z.number().min(0).max(100),
  maximumAlertsPerHour: z.number().int().min(1).max(60),
  dailyBudget: z.number().int().min(1).max(500),
  digestMode: z.boolean(), sound: z.boolean(), vibration: z.boolean(), tts: z.boolean(),
  showPnlOnLockScreen: z.boolean(), includeSymbolWhenLocked: z.boolean().default(false),
  includeQuantityWhenLocked: z.boolean().default(false), speech: speechPreferenceSchema.optional()
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

export function registerMobileNotifications(app: Express, prisma: PrismaClient) {
  app.post("/v1/mobile/devices", async (req, res, next) => {
    try {
      const userUid = req.authUser?.uid;
      if (!userUid) return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Authentication is required." } });
      const input = deviceSchema.parse(req.body);
      const tokenHash = crypto.createHash("sha256").update(input.pushToken).digest("hex");
      const rows = await prisma.$queryRawUnsafe<Row[]>(`
        insert into mobile_notifications.device
          (user_uid,installation_id,platform,push_token,push_token_hash,app_version,build_number,locale,timezone,device_model,device_manufacturer,last_seen_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
        on conflict (user_uid,installation_id) do update set
          platform=excluded.platform,push_token=excluded.push_token,push_token_hash=excluded.push_token_hash,
          app_version=excluded.app_version,build_number=excluded.build_number,locale=excluded.locale,
          timezone=excluded.timezone,device_model=excluded.device_model,device_manufacturer=excluded.device_manufacturer,
          enabled=true,last_registered_at=now(),last_seen_at=now(),updated_at=now()
        returning device_id::text,enabled,last_registered_at`,
        userUid, input.installationId, input.platform, input.pushToken, tokenHash,
        input.appVersion ?? null, input.buildNumber ?? null, input.locale ?? null, input.timezone ?? null,
        input.deviceModel ?? null, input.deviceManufacturer ?? null
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

  app.get("/v1/mobile/notification-preferences", async (req, res, next) => {
    try {
      const userUid = req.authUser?.uid;
      if (!userUid) return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Authentication is required." } });
      const rows = await prisma.$queryRawUnsafe<Array<{ enabled: boolean; settings: unknown; updated_at: Date }>>(
        `select enabled,settings,updated_at from mobile_notifications.preference where user_uid=$1`, userUid);
      return res.json({ enabled: rows[0]?.enabled ?? true, settings: rows[0]?.settings ?? null, updatedAt: rows[0]?.updated_at ?? null });
    } catch (error) { next(error); }
  });

  app.put("/v1/mobile/notification-preferences", async (req, res, next) => {
    try {
      const userUid = req.authUser?.uid;
      if (!userUid) return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Authentication is required." } });
      const settings = preferenceSchema.parse(req.body);
      const rows = await prisma.$queryRawUnsafe<Array<{ enabled: boolean; settings: unknown; updated_at: Date }>>(`
        insert into mobile_notifications.preference(user_uid,enabled,settings)
        values ($1,$2,$3::jsonb)
        on conflict (user_uid) do update set enabled=excluded.enabled,settings=excluded.settings,updated_at=now()
        returning enabled,settings,updated_at`, userUid, settings.enabled, JSON.stringify(settings));
      return res.json({ enabled: rows[0]?.enabled, settings: rows[0]?.settings, updatedAt: rows[0]?.updated_at });
    } catch (error) { next(error); }
  });

  const devSend = (expectedAction: MobileNotificationEvent["action"]) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      const enabled = process.env.ENABLE_MOBILE_NOTIFICATION_DEV_ENDPOINTS === "true";
      const configuredSecret = process.env.MOBILE_NOTIFICATION_DEV_SECRET;
      const suppliedSecret = req.header("x-mobile-notification-secret") ?? "";
      if (!enabled || !configuredSecret) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found." } });
      if (!req.authUser?.uid || suppliedSecret.length !== configuredSecret.length || !crypto.timingSafeEqual(Buffer.from(suppliedSecret), Buffer.from(configuredSecret))) {
        return res.status(403).json({ error: { code: "FORBIDDEN", message: "Development notification access denied." } });
      }
      const event = sendEventSchema.parse(req.body);
      if (event.action !== expectedAction) return res.status(400).json({ error: { code: "ACTION_MISMATCH", message: `Expected action ${expectedAction}.` } });
      const devices = await prisma.$queryRawUnsafe<Array<{ device_id: string; push_token: string }>>(`
        select device_id::text,push_token from mobile_notifications.device
        where user_uid=$1 and enabled=true order by last_seen_at desc limit 20`, req.authUser.uid);
      const result = await sendMobileEvent(devices.map((device) => device.push_token), event);
      await prisma.$executeRawUnsafe(`
        insert into mobile_notifications.delivery_audit
          (event_id,user_uid,event_type,domain,channel_id,dedupe_key,outcome,reason,firebase_message_id,occurred_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz)`,
        event.event_id, req.authUser.uid, event.type, event.domain, event.channel_id, event.dedupe_key,
        result.failureCount > 0 ? "FAILED" : "SENT", result.failureCount > 0 ? `${result.failureCount} Firebase deliveries failed` : null,
        result.messageIds[0] ?? null, event.event_at);
      for (const index of result.invalidTokenIndexes) {
        const device = devices[index];
        if (device) await prisma.$executeRawUnsafe(`update mobile_notifications.device set enabled=false,updated_at=now() where device_id=$1::uuid`, device.device_id);
      }
      return res.json({ eventId: event.event_id, targeted: devices.length, ...result });
    } catch (error) { next(error); }
  };

  app.post("/api/dev/mobile-notifications/standard", devSend("standard"));
  app.post("/api/dev/mobile-notifications/live/start", devSend("start"));
  app.post("/api/dev/mobile-notifications/live/update", devSend("update"));
  app.post("/api/dev/mobile-notifications/live/complete", devSend("complete"));
  app.post("/api/dev/mobile-notifications/live/cancel", devSend("cancel"));
}
