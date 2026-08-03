import crypto from "node:crypto";
import type { Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { createClient, type RedisClientType } from "redis";
import { marketDayIso } from "./time";
import { annotateSnapshotMetrics, getRequestMetrics } from "./requestMetrics";
import { allowApiRuntimeDdl } from "./runtimeConfig";

type SnapshotMeta = Record<string, unknown>;

type StoredSnapshot<T> = {
  snapshotKey: string;
  snapshotDate: string;
  generatedAt: string;
  etag: string;
  payload: T;
  buildMs: number | null;
  meta: SnapshotMeta;
};

type SnapshotRow = {
  snapshot_date: Date | string;
  generated_at: Date | string;
  etag: string;
  payload_json: unknown;
  build_ms: number | null;
  meta: unknown;
};

type BuildResult<T> =
  | T
  | {
      payload: T;
      snapshotDate?: string;
      meta?: SnapshotMeta;
    };

export type SnapshotDefinition<T> = {
  key: string;
  cacheControl: string;
  freshnessMs: number;
  build: (prisma: PrismaClient) => Promise<BuildResult<T>>;
  snapshotDate?: () => string;
  scheduled?: boolean;
};

type RouteErrorLike = {
  status?: number;
  code?: string;
  message?: string;
};

const DASHBOARD_CACHE_PREFIX = process.env.DASHBOARD_CACHE_PREFIX?.trim() || "n50:dash:";
const DEFAULT_REDIS_TTL_SECONDS = Number(process.env.DASHBOARD_CACHE_TTL_SECONDS ?? 300);

let ensuredTablePromise: Promise<void> | null = null;
let ensuredTableMode: "verify" | "apply" | null = null;
let redisClient: RedisClientType | null = null;
let redisConnectPromise: Promise<void> | null = null;
let redisUnavailable = false;
const inflightRefreshes = new Map<string, Promise<StoredSnapshot<unknown>>>();

function nowIso() {
  return new Date().toISOString();
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? nowIso() : parsed.toISOString();
}

function asObject(value: unknown): SnapshotMeta {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as SnapshotMeta;
}

function snapshotKey(definitionKey: string, snapshotDate: string) {
  return `${definitionKey}:${snapshotDate}`;
}

function redisKey(definitionKey: string, snapshotDate: string) {
  return `${DASHBOARD_CACHE_PREFIX}${definitionKey}:${snapshotDate}`;
}

function hashPayload(payload: unknown, generatedAt: string) {
  return `"${crypto.createHash("sha1").update(JSON.stringify({ generatedAt, payload })).digest("hex")}"`;
}

const VOLATILE_SNAPSHOT_KEYS = new Set(["asOf", "generatedAt", "refreshedAt", "requestedAt", "builtAt"]);

function stripVolatileSnapshotFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripVolatileSnapshotFields(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(input)) {
    if (VOLATILE_SNAPSHOT_KEYS.has(key)) continue;
    output[key] = stripVolatileSnapshotFields(child);
  }
  return output;
}

function sameSnapshotContent<T>(existing: StoredSnapshot<T>, payload: T, meta: SnapshotMeta) {
  return (
    JSON.stringify(stripVolatileSnapshotFields(existing.payload)) === JSON.stringify(stripVolatileSnapshotFields(payload)) &&
    JSON.stringify(stripVolatileSnapshotFields(existing.meta)) === JSON.stringify(stripVolatileSnapshotFields(meta))
  );
}

function normalizeBuildResult<T>(
  definition: SnapshotDefinition<T>,
  result: BuildResult<T>
): { payload: T; snapshotDate: string; meta: SnapshotMeta } {
  if (result && typeof result === "object" && "payload" in result) {
    const typed = result as { payload: T; snapshotDate?: string; meta?: SnapshotMeta };
    return {
      payload: typed.payload,
      snapshotDate: typed.snapshotDate ?? definition.snapshotDate?.() ?? marketDayIso(),
      meta: typed.meta ?? {}
    };
  }

  return {
    payload: result as T,
    snapshotDate: definition.snapshotDate?.() ?? marketDayIso(),
    meta: {}
  };
}

async function ensureRedis(): Promise<RedisClientType | null> {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl || redisUnavailable) return null;
  if (redisClient?.isOpen) return redisClient;

  if (!redisClient) {
    redisClient = createClient({ url: redisUrl });
    redisClient.on("error", (err) => {
      redisUnavailable = true;
      // eslint-disable-next-line no-console
      console.warn(JSON.stringify({
        ts: nowIso(),
        level: "warn",
        event: "dashboard_snapshot_redis_error",
        error: err instanceof Error ? err.message : String(err)
      }));
    });
  }

  if (!redisConnectPromise) {
    redisConnectPromise = redisClient
      .connect()
      .then(() => undefined)
      .catch((err) => {
        redisUnavailable = true;
        redisClient = null;
        throw err;
      })
      .finally(() => {
        redisConnectPromise = null;
      });
  }

  try {
    await redisConnectPromise;
  } catch {
    return null;
  }
  return redisUnavailable ? null : redisClient;
}

type DashboardInfrastructureMode = "verify" | "apply";

function dashboardSchemaNotReady() {
  const error = new Error(
    "Dashboard snapshot schema is not installed. Run the explicit database bootstrap before starting the API."
  ) as Error & { status?: number; code?: string };
  error.status = 503;
  error.code = "DASHBOARD_SCHEMA_NOT_READY";
  return error;
}

async function verifyDashboardSnapshotInfrastructure(prisma: PrismaClient) {
  const rows = await prisma.$queryRawUnsafe<Array<{ present: boolean | null }>>(`
    SELECT to_regclass('nse_app.dashboard_snapshots') IS NOT NULL AS present
  `);
  if (rows[0]?.present) return;
  throw dashboardSchemaNotReady();
}

async function applyDashboardSnapshotInfrastructure(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe("CREATE SCHEMA IF NOT EXISTS nse_app");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS nse_app.dashboard_snapshots (
      snapshot_key TEXT NOT NULL,
      snapshot_date DATE NOT NULL,
      payload_json JSONB NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      etag TEXT NOT NULL,
      build_ms INTEGER,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY (snapshot_key, snapshot_date)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_dashboard_snapshots_generated
    ON nse_app.dashboard_snapshots (snapshot_key, generated_at DESC)
  `);
}

export async function ensureDashboardSnapshotInfrastructure(
  prisma: PrismaClient,
  mode: DashboardInfrastructureMode = allowApiRuntimeDdl() ? "apply" : "verify"
) {
  const mustRefreshPromise = !ensuredTablePromise || (mode === "apply" && ensuredTableMode !== "apply");
  if (mustRefreshPromise) {
    ensuredTableMode = mode;
    ensuredTablePromise = (async () => {
      if (mode === "apply") {
        // eslint-disable-next-line no-console
        console.warn(JSON.stringify({
          ts: nowIso(),
          level: "warn",
          event: "dashboard_snapshot_runtime_ddl_enabled",
          transitional: true
        }));
        await applyDashboardSnapshotInfrastructure(prisma);
        return;
      }
      await verifyDashboardSnapshotInfrastructure(prisma);
    })().catch((err) => {
      ensuredTablePromise = null;
      ensuredTableMode = null;
      throw err;
    });
  }

  await ensuredTablePromise;
}

async function readSnapshotFromRedis<T>(definitionKey: string, snapshotDate: string): Promise<StoredSnapshot<T> | null> {
  const redis = await ensureRedis();
  if (!redis) return null;
  const raw = await redis.get(redisKey(definitionKey, snapshotDate));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSnapshot<T>;
  } catch {
    await redis.del(redisKey(definitionKey, snapshotDate)).catch(() => undefined);
    return null;
  }
}

async function writeSnapshotToRedis<T>(record: StoredSnapshot<T>, ttlSeconds: number) {
  const redis = await ensureRedis();
  if (!redis) return;
  await redis.set(redisKey(record.snapshotKey, record.snapshotDate), JSON.stringify(record), {
    EX: Math.max(30, ttlSeconds)
  });
}

async function readSnapshotFromDb<T>(
  prisma: PrismaClient,
  definitionKey: string,
  snapshotDate: string
): Promise<StoredSnapshot<T> | null> {
  await ensureDashboardSnapshotInfrastructure(prisma);
  const rows = await prisma.$queryRawUnsafe<SnapshotRow[]>(
    `
      SELECT snapshot_date, generated_at, etag, payload_json, build_ms, meta
      FROM nse_app.dashboard_snapshots
      WHERE snapshot_key = $1
        AND snapshot_date = $2::date
      LIMIT 1
    `,
    definitionKey,
    snapshotDate
  );
  const row = rows[0];
  if (!row) return null;
  return {
    snapshotKey: definitionKey,
    snapshotDate,
    generatedAt: toIso(row.generated_at),
    etag: row.etag,
    payload: row.payload_json as T,
    buildMs: row.build_ms,
    meta: asObject(row.meta)
  };
}

async function upsertSnapshotInDb<T>(prisma: PrismaClient, record: StoredSnapshot<T>) {
  await ensureDashboardSnapshotInfrastructure(prisma);
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO nse_app.dashboard_snapshots (
        snapshot_key,
        snapshot_date,
        payload_json,
        generated_at,
        etag,
        build_ms,
        meta
      )
      VALUES ($1, $2::date, $3::jsonb, $4::timestamptz, $5, $6, $7::jsonb)
      ON CONFLICT (snapshot_key, snapshot_date)
      DO UPDATE SET
        payload_json = EXCLUDED.payload_json,
        generated_at = EXCLUDED.generated_at,
        etag = EXCLUDED.etag,
        build_ms = EXCLUDED.build_ms,
        meta = EXCLUDED.meta
    `,
    record.snapshotKey,
    record.snapshotDate,
    JSON.stringify(record.payload),
    record.generatedAt,
    record.etag,
    record.buildMs,
    JSON.stringify(record.meta)
  );
}

export async function getStoredSnapshot<T>(
  prisma: PrismaClient,
  definitionKey: string,
  snapshotDate: string,
  redisTtlSeconds = DEFAULT_REDIS_TTL_SECONDS
): Promise<{ record: StoredSnapshot<T> | null; source: "redis" | "db" | "none" }> {
  const redisRecord = await readSnapshotFromRedis<T>(definitionKey, snapshotDate);
  if (redisRecord) {
    return { record: redisRecord, source: "redis" };
  }

  const dbRecord = await readSnapshotFromDb<T>(prisma, definitionKey, snapshotDate);
  if (!dbRecord) {
    return { record: null, source: "none" };
  }

  await writeSnapshotToRedis(dbRecord, redisTtlSeconds).catch(() => undefined);
  return { record: dbRecord, source: "db" };
}

export async function getLatestStoredSnapshot<T>(
  prisma: PrismaClient,
  definitionKey: string,
  redisTtlSeconds = DEFAULT_REDIS_TTL_SECONDS
): Promise<{ record: StoredSnapshot<T> | null; source: "db" | "none" }> {
  await ensureDashboardSnapshotInfrastructure(prisma);
  const rows = await prisma.$queryRawUnsafe<SnapshotRow[]>(
    `
      SELECT snapshot_date, generated_at, etag, payload_json, build_ms, meta
      FROM nse_app.dashboard_snapshots
      WHERE snapshot_key = $1
      ORDER BY snapshot_date DESC, generated_at DESC
      LIMIT 1
    `,
    definitionKey
  );

  const row = rows[0];
  if (!row) {
    return { record: null, source: "none" };
  }

  const snapshotDate =
    typeof row.snapshot_date === "string" ? row.snapshot_date.slice(0, 10) : row.snapshot_date.toISOString().slice(0, 10);
  const record: StoredSnapshot<T> = {
    snapshotKey: definitionKey,
    snapshotDate,
    generatedAt: toIso(row.generated_at),
    etag: row.etag,
    payload: row.payload_json as T,
    buildMs: row.build_ms,
    meta: asObject(row.meta)
  };

  await writeSnapshotToRedis(record, redisTtlSeconds).catch(() => undefined);
  return { record, source: "db" };
}

export async function materializeSnapshot<T>(
  prisma: PrismaClient,
  definition: SnapshotDefinition<T>
): Promise<StoredSnapshot<T>> {
  const refreshId = snapshotKey(definition.key, definition.snapshotDate?.() ?? marketDayIso());
  const existing = inflightRefreshes.get(refreshId) as Promise<StoredSnapshot<T>> | undefined;
  if (existing) return existing;

  const promise = (async () => {
    const startedAt = Date.now();
    const result = await definition.build(prisma);
    const normalized = normalizeBuildResult(definition, result);
    const ttlSeconds = Math.ceil(definition.freshnessMs / 1000);
    const { record: existingRecord } = await getStoredSnapshot<T>(prisma, definition.key, normalized.snapshotDate, ttlSeconds);
    const buildMs = Date.now() - startedAt;

    if (existingRecord && sameSnapshotContent(existingRecord, normalized.payload, normalized.meta)) {
      const refreshedRecord: StoredSnapshot<T> = {
        ...existingRecord,
        generatedAt: nowIso(),
        buildMs
      };
      await writeSnapshotToRedis(refreshedRecord, ttlSeconds).catch(() => undefined);
      // eslint-disable-next-line no-console
      console.info(JSON.stringify({
        ts: nowIso(),
        level: "info",
        event: "dashboard_snapshot_reused",
        snapshotKey: definition.key,
        snapshotDate: refreshedRecord.snapshotDate,
        buildMs
      }));
      return refreshedRecord;
    }

    const generatedAt = nowIso();
    const record: StoredSnapshot<T> = {
      snapshotKey: definition.key,
      snapshotDate: normalized.snapshotDate,
      generatedAt,
      etag: hashPayload(normalized.payload, generatedAt),
      payload: normalized.payload,
      buildMs,
      meta: normalized.meta
    };
    await upsertSnapshotInDb(prisma, record);
    await writeSnapshotToRedis(record, ttlSeconds).catch(() => undefined);
    // eslint-disable-next-line no-console
    console.info(JSON.stringify({
      ts: nowIso(),
      level: "info",
      event: "dashboard_snapshot_materialized",
      snapshotKey: definition.key,
      snapshotDate: record.snapshotDate,
      buildMs: record.buildMs
    }));
    return record;
  })();

  inflightRefreshes.set(refreshId, promise as Promise<StoredSnapshot<unknown>>);
  try {
    return await promise;
  } finally {
    inflightRefreshes.delete(refreshId);
  }
}

function isNotModified(req: Request, etag: string) {
  const header = req.headers["if-none-match"];
  if (typeof header === "string") return header.trim() === etag;
  if (Array.isArray(header)) {
    return (header as string[]).some((value: string) => value.trim() === etag);
  }
  return false;
}

function attachResponseMetadata(
  res: Response,
  definitionKey: string,
  status: string,
  source: string,
  generatedAt: string,
  ageMs: number,
  etag: string,
  cacheControl: string
) {
  annotateSnapshotMetrics({
    key: definitionKey,
    status,
    source,
    ageMs
  });
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("ETag", etag);
  res.setHeader("X-Snapshot-Key", definitionKey);
  res.setHeader("X-Snapshot-Status", status);
  res.setHeader("X-Snapshot-Source", source);
  res.setHeader("X-Snapshot-Generated-At", generatedAt);
  res.setHeader("X-Snapshot-Age-Sec", String(Math.max(0, Math.floor(ageMs / 1000))));
  const metrics = getRequestMetrics();
  if (metrics) {
    res.setHeader("X-DB-Queries", String(metrics.dbQueryCount));
    res.setHeader("X-DB-Query-Duration-Ms", metrics.dbQueryDurationMs.toFixed(1));
    res.setHeader(
      "Server-Timing",
      `db;dur=${metrics.dbQueryDurationMs.toFixed(1)}, snapshot;desc=\"${definitionKey}:${status}\"`
    );
  }
}

export async function serveSnapshotRoute<T>(
  req: Request,
  res: Response,
  prisma: PrismaClient,
  definition: SnapshotDefinition<T>
) {
  const expectedSnapshotDate = definition.snapshotDate?.() ?? marketDayIso();
  try {
    const { record, source } = await getStoredSnapshot<T>(
      prisma,
      definition.key,
      expectedSnapshotDate,
      Math.ceil(definition.freshnessMs / 1000)
    );

    if (!record) {
      const built = await materializeSnapshot(prisma, definition);
      attachResponseMetadata(res, definition.key, "miss", "build", built.generatedAt, 0, built.etag, definition.cacheControl);
      if (isNotModified(req, built.etag)) {
        return res.status(304).end();
      }
      return res.json(built.payload);
    }

    const ageMs = Date.now() - new Date(record.generatedAt).getTime();
    const isFresh = ageMs <= definition.freshnessMs;
    const status = isFresh ? "hit" : "stale";
    attachResponseMetadata(res, definition.key, status, source, record.generatedAt, ageMs, record.etag, definition.cacheControl);
    if (!isFresh) {
      void materializeSnapshot(prisma, definition).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(JSON.stringify({
          ts: nowIso(),
          level: "warn",
          event: "dashboard_snapshot_refresh_failed",
          snapshotKey: definition.key,
          snapshotDate: expectedSnapshotDate,
          error: err instanceof Error ? err.message : String(err)
        }));
      });
    }
    if (isNotModified(req, record.etag)) {
      return res.status(304).end();
    }
    return res.json(record.payload);
  } catch (err) {
    const routeError =
      err && typeof err === "object"
        ? (err as RouteErrorLike)
        : null;
    const status =
      routeError && typeof routeError.status === "number" && Number.isFinite(routeError.status)
        ? Math.max(400, Math.min(599, Math.trunc(routeError.status)))
        : 500;
    const code =
      routeError && typeof routeError.code === "string" && routeError.code.trim().length > 0
        ? routeError.code.trim()
        : "SNAPSHOT_ROUTE_FAILED";
    const message =
      routeError && typeof routeError.message === "string" && routeError.message.trim().length > 0
        ? routeError.message.trim()
        : "Unable to load dashboard snapshot.";
    return res.status(status).json({
      error: {
        code,
        message
      }
    });
  }
}

export async function getDashboardSnapshotHealth(prisma: PrismaClient) {
  await ensureDashboardSnapshotInfrastructure(prisma);
  const latest = await prisma.$queryRawUnsafe<Array<{
    snapshot_key: string;
    snapshot_date: Date | string;
    generated_at: Date | string;
    age_seconds: number | null;
  }>>(`
    SELECT
      snapshot_key,
      snapshot_date,
      generated_at,
      EXTRACT(EPOCH FROM (NOW() - generated_at))::double precision AS age_seconds
    FROM nse_app.dashboard_snapshots
    ORDER BY generated_at DESC
    LIMIT 10
  `);

  return latest.map((row) => ({
    snapshotKey: row.snapshot_key,
    snapshotDate: typeof row.snapshot_date === "string" ? row.snapshot_date : row.snapshot_date.toISOString().slice(0, 10),
    generatedAt: toIso(row.generated_at),
    ageSeconds: row.age_seconds == null ? null : Math.round(row.age_seconds)
  }));
}
