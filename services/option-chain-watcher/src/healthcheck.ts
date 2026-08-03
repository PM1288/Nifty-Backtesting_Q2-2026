import { Pool } from 'pg';

async function main(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    max: 1,
  });

  try {
    await pool.query('select 1 as ok');
    process.exit(0);
  } catch (e) {
    // healthcheck output is surfaced by docker; keep it short.
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

main().catch(() => process.exit(1));
