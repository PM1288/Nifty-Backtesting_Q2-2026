import { Pool } from 'pg';

export function createPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST ?? 'postgres',
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER ?? process.env.POSTGRES_USER,
    password: process.env.PGPASSWORD ?? process.env.POSTGRES_PASSWORD,
    database: process.env.PGDATABASE ?? process.env.POSTGRES_DB,
    max: Number(process.env.NSE_OC_DB_MAX_CONNS ?? 2),
    idleTimeoutMillis: Number(process.env.NSE_OC_DB_IDLE_TIMEOUT_MS ?? 10000),
    connectionTimeoutMillis: Number(process.env.NSE_OC_DB_CONNECTION_TIMEOUT_MS ?? 5000),
    maxLifetimeSeconds: Number(process.env.NSE_OC_DB_MAX_LIFETIME_SECONDS ?? 1800),
  });
}
