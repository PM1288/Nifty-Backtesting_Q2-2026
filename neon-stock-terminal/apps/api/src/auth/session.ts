import crypto from "node:crypto";
import type { IncomingMessage } from "http";
import type { Request, Response } from "express";
import { RedisBackedStoreDependency, type RedisBackedStoreHealth } from "../lib/redisBackedStore";
import {
  allowDevelopmentInMemorySessionStore,
  getSessionRedisUrl,
  requirePersistentSessionStore
} from "../lib/runtimeConfig";

export type SessionUser = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
};

export type SessionRecord = {
  id: string;
  user: SessionUser;
  csrfToken: string;
  createdAt: number;
  lastSeenAt: number;
  idleExpiresAt: number;
  absoluteExpiresAt: number;
};

export type SessionStoreHealth = RedisBackedStoreHealth;

type SessionStoreOptions = {
  idleTtlMs: number;
  absoluteTtlMs: number;
  sameSite: "Lax" | "Strict";
  hostCookieName: string;
  insecureCookieName: string;
  cookiePath: string;
  forceSecureCookie: boolean;
  redisUrl: string | null;
  redisPrefix: string;
};

type CookieFlags = {
  path: string;
  maxAgeSeconds: number;
  httpOnly: boolean;
  sameSite: "Lax" | "Strict";
  secure: boolean;
};

function appendSetCookie(res: Response, cookie: string) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookie);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, cookie]);
    return;
  }
  res.setHeader("Set-Cookie", [String(existing), cookie]);
}

function parseCookies(headerValue: string | string[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!headerValue) return map;
  const raw = Array.isArray(headerValue) ? headerValue.join(";") : headerValue;
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const name = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!name) continue;
    map.set(name, decodeURIComponent(value));
  }
  return map;
}

function serializeCookie(name: string, value: string, flags: CookieFlags): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${flags.path}`);
  parts.push(`Max-Age=${Math.max(0, Math.trunc(flags.maxAgeSeconds))}`);
  if (flags.httpOnly) parts.push("HttpOnly");
  if (flags.secure) parts.push("Secure");
  parts.push(`SameSite=${flags.sameSite}`);
  return parts.join("; ");
}

function isSecureRequest(req: Pick<Request, "secure" | "headers"> | Pick<IncomingMessage, "headers">): boolean {
  if ("secure" in req && req.secure) return true;
  const proto = req.headers["x-forwarded-proto"];
  if (typeof proto === "string") {
    return proto.split(",")[0]?.trim().toLowerCase() === "https";
  }
  if (Array.isArray(proto) && proto.length > 0) {
    return proto[0]?.trim().toLowerCase() === "https";
  }
  return false;
}

function safeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function isValidRecord(value: unknown): value is SessionRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as SessionRecord;
  return (
    typeof record.id === "string" &&
    typeof record.csrfToken === "string" &&
    typeof record.createdAt === "number" &&
    typeof record.lastSeenAt === "number" &&
    typeof record.idleExpiresAt === "number" &&
    typeof record.absoluteExpiresAt === "number" &&
    !!record.user &&
    typeof record.user.uid === "string"
  );
}

function parseRedisUrl(): string | null {
  return getSessionRedisUrl();
}

function parseCookiePath(): string {
  const raw = process.env.SESSION_COOKIE_PATH;
  if (typeof raw !== "string") return "/";
  const trimmed = raw.trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly opts: SessionStoreOptions;
  private readonly storeDependency: RedisBackedStoreDependency;

  constructor(opts?: Partial<SessionStoreOptions>) {
    const idleTtlSeconds = Number(process.env.SESSION_IDLE_TIMEOUT_SECONDS ?? 30 * 60);
    const absoluteTtlSeconds = Number(process.env.SESSION_ABSOLUTE_TIMEOUT_SECONDS ?? 12 * 60 * 60);
    const rawSameSite = String(process.env.SESSION_COOKIE_SAMESITE ?? "Lax")
      .trim()
      .toLowerCase();
    const sameSite: "Lax" | "Strict" = rawSameSite === "strict" ? "Strict" : "Lax";
    this.opts = {
      idleTtlMs: Number.isFinite(idleTtlSeconds) && idleTtlSeconds > 0 ? Math.trunc(idleTtlSeconds * 1000) : 30 * 60_000,
      absoluteTtlMs:
        Number.isFinite(absoluteTtlSeconds) && absoluteTtlSeconds > 0
          ? Math.trunc(absoluteTtlSeconds * 1000)
          : 12 * 60 * 60_000,
      sameSite,
      hostCookieName: process.env.SESSION_COOKIE_NAME?.trim() || "__Host-session",
      insecureCookieName: process.env.SESSION_COOKIE_NAME_INSECURE?.trim() || "n50-session",
      cookiePath: parseCookiePath(),
      forceSecureCookie: process.env.SESSION_COOKIE_SECURE === "1" || process.env.NODE_ENV === "production",
      redisUrl: parseRedisUrl(),
      redisPrefix: process.env.SESSION_REDIS_PREFIX?.trim() || "n50:sess:",
      ...opts
    };
    this.storeDependency = new RedisBackedStoreDependency({
      name: "session_store",
      redisUrl: this.opts.redisUrl,
      allowMemoryFallback: allowDevelopmentInMemorySessionStore(),
      unavailableCode: "SESSION_STORE_UNAVAILABLE",
      unavailableMessage: "Redis-backed session storage is unavailable.",
      logContext: {
        authRequired: requirePersistentSessionStore()
      }
    });
  }

  async ensureReady(): Promise<void> {
    await this.storeDependency.ensureReady();
  }

  getHealth(): SessionStoreHealth {
    return this.storeDependency.getHealth();
  }

  private getCookieNames() {
    return [this.opts.hostCookieName, this.opts.insecureCookieName];
  }

  private getCookieNameForRequest(req: Pick<Request, "secure" | "headers"> | Pick<IncomingMessage, "headers">) {
    const secure = this.opts.forceSecureCookie || isSecureRequest(req);
    return secure ? this.opts.hostCookieName : this.opts.insecureCookieName;
  }

  private buildCookieFlags(req: Pick<Request, "secure" | "headers"> | Pick<IncomingMessage, "headers">): CookieFlags {
    return {
      path: this.opts.cookiePath,
      maxAgeSeconds: Math.max(1, Math.floor(this.opts.idleTtlMs / 1000)),
      httpOnly: true,
      sameSite: this.opts.sameSite,
      secure: this.opts.forceSecureCookie || isSecureRequest(req)
    };
  }

  private clearExpired(now = Date.now()) {
    for (const [id, record] of this.sessions) {
      if (record.absoluteExpiresAt <= now || record.idleExpiresAt <= now) {
        this.sessions.delete(id);
      }
    }
  }

  private readSessionIdFromHeaders(req: Pick<IncomingMessage, "headers">): string | null {
    const cookies = parseCookies(req.headers.cookie);
    for (const name of this.getCookieNames()) {
      const value = cookies.get(name);
      if (value && value.trim().length > 0) return value.trim();
    }
    return null;
  }

  private issueRecord(user: SessionUser): SessionRecord {
    const now = Date.now();
    return {
      id: crypto.randomBytes(32).toString("base64url"),
      user,
      csrfToken: crypto.randomBytes(24).toString("base64url"),
      createdAt: now,
      lastSeenAt: now,
      idleExpiresAt: now + this.opts.idleTtlMs,
      absoluteExpiresAt: now + this.opts.absoluteTtlMs
    };
  }

  private touch(record: SessionRecord, now = Date.now()) {
    record.lastSeenAt = now;
    record.idleExpiresAt = Math.min(record.absoluteExpiresAt, now + this.opts.idleTtlMs);
  }

  private getTtlSeconds(record: SessionRecord, now = Date.now()) {
    const ttlMs = Math.min(record.idleExpiresAt - now, record.absoluteExpiresAt - now);
    return Math.max(1, Math.floor(ttlMs / 1000));
  }

  private redisKey(id: string) {
    return `${this.opts.redisPrefix}${id}`;
  }

  private async ensureRedis() {
    return this.storeDependency.getRedisClient();
  }

  private async loadRecordById(id: string): Promise<SessionRecord | null> {
    const redis = await this.ensureRedis();
    if (redis) {
      try {
        const raw = await redis.get(this.redisKey(id));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!isValidRecord(parsed)) {
          await redis.del(this.redisKey(id));
          return null;
        }
        return parsed;
      } catch {
        await redis.del(this.redisKey(id)).catch(() => undefined);
        return null;
      }
    }

    this.clearExpired();
    return this.sessions.get(id) ?? null;
  }

  private async saveRecord(record: SessionRecord): Promise<void> {
    const redis = await this.ensureRedis();
    if (redis) {
      const ttl = this.getTtlSeconds(record);
      await redis.set(this.redisKey(record.id), JSON.stringify(record), { EX: ttl });
      return;
    }
    this.sessions.set(record.id, record);
  }

  private async deleteRecord(id: string): Promise<void> {
    const redis = await this.ensureRedis();
    if (redis) {
      await redis.del(this.redisKey(id));
      return;
    }
    this.sessions.delete(id);
  }

  private async getSessionById(id: string, touch = true): Promise<SessionRecord | null> {
    const record = await this.loadRecordById(id);
    if (!record) return null;
    const now = Date.now();
    if (record.absoluteExpiresAt <= now || record.idleExpiresAt <= now) {
      await this.deleteRecord(id);
      return null;
    }
    if (touch) {
      this.touch(record, now);
      await this.saveRecord(record);
    }
    return record;
  }

  async getFromRequest(req: Pick<IncomingMessage, "headers">): Promise<SessionRecord | null> {
    await this.ensureReady();
    const sessionId = this.readSessionIdFromHeaders(req);
    if (!sessionId) return null;
    return this.getSessionById(sessionId, true);
  }

  async issueSession(req: Request, res: Response, user: SessionUser): Promise<SessionRecord> {
    await this.ensureReady();
    const existingId = this.readSessionIdFromHeaders(req);
    if (existingId) {
      await this.deleteRecord(existingId);
    }
    const record = this.issueRecord(user);
    await this.saveRecord(record);
    const cookieName = this.getCookieNameForRequest(req);
    appendSetCookie(res, serializeCookie(cookieName, record.id, this.buildCookieFlags(req)));
    return record;
  }

  async clearSession(req: Pick<IncomingMessage, "headers">, res: Response): Promise<void> {
    await this.ensureReady();
    const existingId = this.readSessionIdFromHeaders(req);
    if (existingId) {
      await this.deleteRecord(existingId);
    }
    const flags = this.buildCookieFlags(req);
    for (const name of this.getCookieNames()) {
      appendSetCookie(
        res,
        serializeCookie(name, "", {
          ...flags,
          maxAgeSeconds: 0
        })
      );
    }
  }

  validateCsrf(req: Pick<Request, "headers">, record: SessionRecord): boolean {
    const headerToken = req.headers["x-csrf-token"];
    const token =
      typeof headerToken === "string"
        ? headerToken.trim()
        : Array.isArray(headerToken) && headerToken.length > 0
        ? headerToken[0]!.trim()
        : "";
    if (!token) return false;
    return safeEquals(token, record.csrfToken);
  }
}
