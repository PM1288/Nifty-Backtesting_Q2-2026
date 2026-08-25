import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

type RawRow = {
  outbox_id: bigint | number | string;
  event_id: string;
  aggregate_id: string;
  event_type: string;
  event_time: Date | string;
  payload: unknown;
  attempt_count: number;
};

type DeviceRow = { device_id: string; user_uid: string; push_token: string };

type EventProfile = {
  type: string;
  domain: string;
  channelId: string;
  templateId: string;
  priority: "low" | "normal" | "high";
  ttlSeconds: number;
  stage: string;
  shortText: string;
};

const EVENT_PROFILES: Array<[RegExp, EventProfile]> = [
  [/trade_leg\.opened/, { type: "paper_trade_opened", domain: "paper_trade", channelId: "paper_trade_open_v2", templateId: "paper_trade_opened_v1", priority: "high", ttlSeconds: 3600, stage: "PAPER_TRADE_OPENED", shortText: "PAPER" }],
  [/(target_track\.closed|execution_target\.hit)/, { type: "paper_target_hit", domain: "paper_trade", channelId: "paper_target_hit_v2", templateId: "paper_target_hit_v1", priority: "high", ttlSeconds: 7200, stage: "TARGET_HIT", shortText: "TARGET" }],
  [/(trade_leg\.closed|trade_group\.closed)/, { type: "paper_trade_closed", domain: "paper_trade", channelId: "paper_trade_closed_v1", templateId: "paper_trade_closed_v1", priority: "normal", ttlSeconds: 86400, stage: "PAPER_TRADE_CLOSED", shortText: "CLOSED" }],
  [/summary\.daily/, { type: "paper_target_summary", domain: "daily_summary", channelId: "daily_summary_v1", templateId: "paper_target_summary_v1", priority: "low", ttlSeconds: 86400, stage: "PAPER_DAILY_SUMMARY", shortText: "EOD" }],
  [/(market_data\.stale|system\.processing_error|webhook\.dead_lettered)/, { type: "data_stale", domain: "data_health", channelId: "data_health_v1", templateId: "data_stale_v1", priority: "high", ttlSeconds: 1800, stage: "DATA_STALE", shortText: "DATA" }]
];

function object(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = "—", max = 900): string {
  const candidate = value == null ? "" : String(value).trim();
  return (candidate || fallback).slice(0, max);
}

function field(value: unknown): string {
  return value == null || value === "" ? "—" : String(value);
}

function formattedNumber(value: unknown, maximumFractionDigits = 2): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return parsed.toLocaleString("en-IN", { maximumFractionDigits });
}

function signedRupees(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return `${parsed >= 0 ? "+" : "-"}₹${Math.abs(parsed).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function structuredCopy(
  profile: EventProfile,
  symbol: string,
  side: "LONG" | "SHORT" | "NONE",
  data: Record<string, unknown>,
  notification: Record<string, unknown>
) {
  const suppliedTitle = text(notification.title ?? data.title, `${symbol} · PAPER UPDATE`, 100);
  const suppliedMessage = text(notification.message ?? data.message, `${symbol} paper-trading event`, 900);
  const suppliedFacts = Array.isArray(notification.facts)
    ? notification.facts.map((value) => text(value, "", 180)).filter(Boolean)
    : [];

  if (profile.type === "paper_trade_opened") {
    const title = `${symbol} · PAPER ${side === "NONE" ? "TRADE" : side} OPENED`;
    const body = `${side === "NONE" ? "PAPER" : side} · Qty ${formattedNumber(data.quantity)} @ ₹${formattedNumber(data.entry_price)}`;
    return { title, body, lines: [
      data.stop_loss == null ? "" : `SL ₹${formattedNumber(data.stop_loss)}`,
      `Data source: paper trading`
    ].filter(Boolean) };
  }

  if (profile.type === "paper_target_hit") {
    const outcomes = Array.isArray(data.newly_closed_target_tracks)
      ? data.newly_closed_target_tracks.map(object)
      : [];
    const outcome = outcomes[0] ?? {};
    const targetPercent = Number(outcome.target_pct);
    const targetLabel = Number.isFinite(targetPercent)
      ? `${formattedNumber(targetPercent * 100, 2)}% TARGET`
      : "TARGET";
    const observedPrice = outcome.observed_price ?? outcome.target_price ?? data.current_price;
    const hypotheticalPnl = outcome.hypothetical_after_tax_pnl;
    const bodyParts = [
      `${side === "NONE" ? "PAPER" : side} · Qty ${formattedNumber(data.quantity)}`,
      `${targetLabel} at ₹${formattedNumber(observedPrice)}`,
      hypotheticalPnl == null ? "" : `Hypothetical after-tax ${signedRupees(hypotheticalPnl)}`
    ].filter(Boolean);
    return {
      title: `${symbol} · PAPER ${targetLabel} HIT`,
      body: bodyParts.join(" · "),
      lines: [
        `Entry ₹${formattedNumber(data.entry_price)} · Current ₹${formattedNumber(data.current_price ?? observedPrice)}`,
        data.actual_execution_position_status == null ? "" : `Actual paper position: ${text(data.actual_execution_position_status, "unknown", 32)}`,
        data.higher_tracks_remain_active === true ? "Higher analytical targets remain active" : ""
      ].filter(Boolean)
    };
  }

  if (profile.type === "paper_trade_closed") {
    return {
      title: `${symbol} · PAPER TRADE CLOSED`,
      body: `${side === "NONE" ? "PAPER" : side} · Qty ${formattedNumber(data.quantity)} · Net ${signedRupees(data.net_after_tax ?? data.net_pnl)}`,
      lines: suppliedFacts
    };
  }

  const body = text(suppliedFacts[0] ?? suppliedMessage.split("\n").find((line) => line.trim() && line.trim() !== suppliedTitle), suppliedMessage, 900);
  return { title: suppliedTitle, body, lines: suppliedFacts };
}

function profileFor(eventType: string): EventProfile | null {
  return EVENT_PROFILES.find(([pattern]) => pattern.test(eventType))?.[1] ?? null;
}

function stableNotificationId(eventId: string): string {
  return String(crypto.createHash("sha256").update(eventId).digest().readUInt32BE(0) & 0x7fffffff);
}

function sideValue(value: unknown): "LONG" | "SHORT" | "NONE" {
  const side = String(value ?? "").toUpperCase();
  if (side === "BUY" || side === "LONG") return "LONG";
  if (side === "SELL" || side === "SHORT") return "SHORT";
  return "NONE";
}

function spokenText(profile: EventProfile, symbol: string, side: "LONG" | "SHORT" | "NONE", data: Record<string, unknown>) {
  const identity = `${symbol}. ${side === "NONE" ? "" : `${side.toLowerCase()}.`}`.trim();
  if (profile.type === "paper_trade_opened") return `Paper trade opened. ${identity}`;
  if (profile.type === "paper_target_hit") return `Paper target reached. ${identity}`;
  if (profile.type === "paper_trade_closed") return `Paper trade closed. ${identity} Open N50 Today for the final result.`;
  if (profile.type === "data_stale") return "Attention. Paper trading market data is delayed. Open N50 Today for details.";
  const requests = field(object(data.summary).requests_received);
  return `Paper trading summary is ready. ${requests === "—" ? "" : `${requests} requests were evaluated.`}`.trim();
}

export function buildPaperMobileEvent(row: Omit<RawRow, "outbox_id" | "attempt_count">): Record<string, string> | null {
  const profile = profileFor(row.event_type);
  if (!profile) return null;
  const envelope = object(row.payload);
  const data = object(envelope.data);
  const notification = object(data.notification);
  const eventAt = new Date(row.event_time).toISOString();
  const expiresAt = new Date(new Date(eventAt).valueOf() + profile.ttlSeconds * 1000).toISOString();
  const symbol = text(data.symbol, profile.type === "data_stale" ? "N50 DATA" : "PAPER TRADE", 32).toUpperCase();
  const side = sideValue(data.side);
  const copy = structuredCopy(profile, symbol, side, data, notification);
  const now = Date.now();
  const ageSeconds = Math.max(0, Math.round((now - new Date(eventAt).valueOf()) / 1000));

  return {
    schema_version: "1",
    event_id: row.event_id,
    type: profile.type,
    domain: profile.domain,
    action: "standard",
    activity_id: row.aggregate_id,
    notification_id: stableNotificationId(row.event_id),
    template_id: profile.templateId,
    template_style: profile.type.includes("summary") ? "inbox" : "big_text",
    channel_id: profile.channelId,
    priority: profile.priority,
    title: copy.title,
    body: copy.body,
    tts_text: spokenText(profile, symbol, side, data),
    private_tts_text: `${profile.type.replaceAll("_", " ")}. Open N50 Today for details.`,
    lines: copy.lines.join("\n"),
    short_text: profile.shortText.slice(0, 16),
    progress: "0",
    stage: profile.stage,
    route: profile.type === "data_stale" ? "/system/data-health" : `/paper-trades/${encodeURIComponent(row.aggregate_id)}`,
    dedupe_key: `paper:${row.event_id}`,
    event_at: eventAt,
    data_as_of: eventAt,
    expires_at: expiresAt,
    source: "paper_trading.trade_events",
    symbol,
    side,
    trade_mode: profile.type === "data_stale" ? "NONE" : "PAPER",
    entry: field(data.entry_price),
    ltp: field(data.current_price ?? data.exit_price),
    pnl: field(data.net_after_tax ?? data.net_pnl),
    pnl_percent: field(data.net_pnl_pct),
    gross_pnl: field(data.gross_realised_pnl ?? data.gross_pnl),
    charges: field(data.trading_costs ?? data.charges),
    taxes: field(data.income_tax_provision ?? data.taxes),
    quantity: field(data.quantity),
    remaining_quantity: field(data.remaining_quantity ?? data.quantity),
    opened_at: field(data.opened_at),
    stop_loss: field(data.stop_loss),
    target_1: field(data.target_1),
    target_2: field(data.target_2),
    target_3: field(data.target_3),
    targets_json: JSON.stringify(data.newly_closed_target_tracks ?? data.targets ?? []),
    data_freshness: ageSeconds <= 30 ? `${ageSeconds} sec old` : `Delayed ${ageSeconds} sec`
  };
}

function firebaseMessaging() {
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault() });
  return getMessaging(app);
}

async function claim(prisma: PrismaClient): Promise<RawRow | null> {
  const rows = await prisma.$queryRawUnsafe<RawRow[]>(`
    with candidate as (
      select outbox_id
      from mobile_notifications.event_outbox
      where status in ('PENDING','RETRY')
        and available_at <= now()
        and (lease_expires_at is null or lease_expires_at < now())
      order by available_at,outbox_id
      for update skip locked
      limit 1
    )
    update mobile_notifications.event_outbox o
    set status='PROCESSING',attempt_count=attempt_count+1,
        lease_expires_at=now()+interval '60 seconds',updated_at=now()
    from candidate c, paper_trading.trade_events e
    where o.outbox_id=c.outbox_id and e.event_id=o.event_id
    returning o.outbox_id,o.event_id::text,e.aggregate_id::text,e.event_type,e.event_time,e.payload,o.attempt_count`);
  return rows[0] ?? null;
}

async function finish(prisma: PrismaClient, row: RawRow, delivered: boolean, error?: string) {
  const attempts = Number(row.attempt_count);
  const terminal = !delivered && attempts >= 8;
  await prisma.$executeRawUnsafe(`
    update mobile_notifications.event_outbox
    set status=$2,available_at=case when $2='RETRY' then now()+make_interval(secs => $3) else available_at end,
        delivered_at=case when $2='DELIVERED' then now() else delivered_at end,
        lease_expires_at=null,last_error=$4,updated_at=now()
    where outbox_id=$1`, row.outbox_id, delivered ? "DELIVERED" : terminal ? "DEAD" : "RETRY", Math.min(300, 2 ** attempts * 5), error?.slice(0, 500) ?? null);
}

export async function runMobileNotificationDispatcherTick(prisma: PrismaClient) {
  const row = await claim(prisma);
  if (!row) return { claimed: false };
  const event = buildPaperMobileEvent(row);
  if (!event) {
    await finish(prisma, row, true, "unsupported_event_type");
    return { claimed: true, delivered: false, reason: "unsupported_event_type" };
  }

  const devices = await prisma.$queryRawUnsafe<DeviceRow[]>(`
    select device_id::text,user_uid,push_token
    from mobile_notifications.device
    where enabled=true
    order by last_registered_at desc
    limit 500`);
  if (!devices.length) {
    await finish(prisma, row, false, "no_enabled_devices");
    return { claimed: true, delivered: false, reason: "no_enabled_devices" };
  }

  try {
    const response = await firebaseMessaging().sendEachForMulticast({
      tokens: devices.map((device) => device.push_token),
      data: event,
      android: { priority: event.priority === "high" ? "high" : "normal", ttl: Math.max(0, Date.parse(event.expires_at) - Date.now()) }
    });
    for (let index = 0; index < response.responses.length; index += 1) {
      const result = response.responses[index];
      const device = devices[index];
      const code = result.error?.code ?? null;
      await prisma.$executeRawUnsafe(`
        insert into mobile_notifications.delivery_audit
          (event_id,user_uid,device_id,event_type,domain,channel_id,dedupe_key,outcome,reason,firebase_message_id,occurred_at)
        values ($1,$2,$3::uuid,$4,$5,$6,$7,$8,$9,$10,$11::timestamptz)`,
        event.event_id, device.user_uid, device.device_id, event.type, event.domain, event.channel_id,
        event.dedupe_key, result.success ? "SENT" : "FAILED", code, result.messageId ?? null, event.event_at);
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
        await prisma.$executeRawUnsafe(`update mobile_notifications.device set enabled=false,updated_at=now() where device_id=$1::uuid`, device.device_id);
      }
    }
    const delivered = response.successCount > 0;
    await finish(prisma, row, delivered, delivered ? undefined : `${response.failureCount} Firebase deliveries failed`);
    console.info(JSON.stringify({ ts: new Date().toISOString(), level: delivered ? "info" : "warn", event: "mobile_notification_dispatch", eventId: event.event_id, eventType: event.type, targeted: devices.length, successCount: response.successCount, failureCount: response.failureCount }));
    return { claimed: true, delivered, successCount: response.successCount, failureCount: response.failureCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finish(prisma, row, false, message);
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", event: "mobile_notification_dispatch_failed", eventId: event.event_id, eventType: event.type, error: message }));
    return { claimed: true, delivered: false, reason: message };
  }
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startMobileNotificationDispatcher(prisma: PrismaClient) {
  if ((process.env.N50_MOBILE_NOTIFICATION_DISPATCHER_ENABLED ?? "0") !== "1" || timer) return;
  const intervalMs = Math.max(1000, Number(process.env.N50_MOBILE_NOTIFICATION_DISPATCH_INTERVAL_MS ?? 5000));
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (let count = 0; count < 20; count += 1) {
        const result = await runMobileNotificationDispatcherTick(prisma);
        if (!result.claimed) break;
      }
    } catch (error) {
      console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", event: "mobile_notification_dispatcher_tick_failed", error: error instanceof Error ? error.message : String(error) }));
    } finally {
      running = false;
    }
  };
  timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  console.info(JSON.stringify({ ts: new Date().toISOString(), level: "info", event: "mobile_notification_dispatcher_started", intervalMs }));
}

export function stopMobileNotificationDispatcher() {
  if (timer) clearInterval(timer);
  timer = null;
}
