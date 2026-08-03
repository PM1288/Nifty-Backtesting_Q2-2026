import type { PrismaClient } from "@prisma/client";
import { allowApiRuntimePerformanceDdl } from "./runtimeConfig";
import { ServiceDependencyError } from "./serviceDependencyError";

type StatementRow = {
  query_id: string | null;
  calls: bigint | number | string | null;
  total_exec_ms: number | string | null;
  mean_exec_ms: number | string | null;
  rows: bigint | number | string | null;
  shared_hit_pct: number | string | null;
  query_text: string | null;
};

type RequiredRelationRow = {
  relation_name: string;
  present: boolean | null;
};

type DatabaseSizingRow = {
  database_size_bytes: bigint | number | string | null;
  database_size_pretty: string | null;
};

function asNumber(value: number | string | bigint | null | undefined) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function verifyApiReadModelPrerequisites(prisma: PrismaClient) {
  const rows = await prisma.$queryRawUnsafe<RequiredRelationRow[]>(`
    SELECT relation_name, to_regclass(qualified_name) IS NOT NULL AS present
    FROM (
      VALUES
        ('public.index_constituents', 'public.index_constituents'),
        ('public.instrument_universe', 'public.instrument_universe')
    ) AS required_relations(relation_name, qualified_name)
  `);

  const missing = rows.filter((row) => !row.present).map((row) => row.relation_name);
  if (missing.length === 0) return;

  throw new ServiceDependencyError(
    "CORE_MARKET_SCHEMA_NOT_READY",
    "postgres/core-schema",
    `Core market schema is not installed (${missing.join(", ")}). Run scripts/db_migrate_all.sh or collector --db-migrate-only before starting the API.`
  );
}

export async function ensureDatabasePerformanceArtifacts(prisma: PrismaClient) {
  await verifyApiReadModelPrerequisites(prisma);

  if (allowApiRuntimePerformanceDdl()) {
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify({
      ts: new Date().toISOString(),
      level: "warn",
      event: "api_runtime_performance_ddl_ignored",
      transitional: false,
      reason: "Performance indexes are now owned by explicit SQL in db/sql and scripts/db_migrate_all.sh"
    }));
  }
}

function safeQueryParam(name: string) {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return null;
  try {
    const parsed = new URL(databaseUrl);
    const value = parsed.searchParams.get(name);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function getApiDbRuntimeProfile() {
  return {
    slowQueryMs: Number(process.env.SLOW_QUERY_MS ?? 250),
    prisma: {
      connectionLimit: Number(process.env.N50_API_DB_CONNECTION_LIMIT ?? safeQueryParam("connection_limit") ?? 0) || null,
      poolTimeoutSeconds: Number(process.env.N50_API_DB_POOL_TIMEOUT ?? safeQueryParam("pool_timeout") ?? 0) || null
    }
  };
}

export async function getDatabaseSizing(prisma: PrismaClient) {
  const rows = await prisma.$queryRawUnsafe<DatabaseSizingRow[]>(`
    SELECT
      pg_database_size(current_database()) AS database_size_bytes,
      pg_size_pretty(pg_database_size(current_database())) AS database_size_pretty
  `);
  const row = rows[0];
  return {
    databaseSizeBytes: asNumber(row?.database_size_bytes),
    databaseSizePretty: row?.database_size_pretty ?? "0 bytes"
  };
}

export async function isPgStatStatementsEnabled(prisma: PrismaClient) {
  const rows = await prisma.$queryRawUnsafe<Array<{ enabled: boolean }>>(
    "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS enabled"
  );
  return rows[0]?.enabled ?? false;
}

export async function getTopPgStatements(prisma: PrismaClient, limit = 5) {
  const enabled = await isPgStatStatementsEnabled(prisma);
  if (!enabled) return [];

  const safeLimit = Math.max(1, Math.min(limit, 10));
  const rows = await prisma.$queryRawUnsafe<StatementRow[]>(`
    SELECT
      queryid::text AS query_id,
      calls,
      ROUND(total_exec_time::numeric, 1) AS total_exec_ms,
      ROUND(mean_exec_time::numeric, 1) AS mean_exec_ms,
      rows,
      ROUND(
        CASE
          WHEN (shared_blks_hit + shared_blks_read) = 0 THEN 100
          ELSE (shared_blks_hit::numeric / NULLIF(shared_blks_hit + shared_blks_read, 0)) * 100
        END,
        1
      ) AS shared_hit_pct,
      LEFT(REGEXP_REPLACE(query, '\\s+', ' ', 'g'), 180) AS query_text
    FROM pg_stat_statements
    WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
    ORDER BY total_exec_time DESC
    LIMIT ${safeLimit}
  `);

  return rows.map((row) => ({
    queryId: row.query_id,
    calls: asNumber(row.calls),
    totalExecMs: asNumber(row.total_exec_ms),
    meanExecMs: asNumber(row.mean_exec_ms),
    rows: asNumber(row.rows),
    sharedHitPct: asNumber(row.shared_hit_pct),
    query: row.query_text ?? ""
  }));
}
