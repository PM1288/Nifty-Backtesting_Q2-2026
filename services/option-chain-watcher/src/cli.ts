import { createPool } from './db';
import { migrate } from './migrate';

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== 'migrate') {
    throw new Error(`Unknown command: ${command ?? "<missing>"}. Supported commands: migrate`);
  }

  const pool = createPool();
  try {
    await pool.query('select 1 as ok');
    await migrate(pool);
    // eslint-disable-next-line no-console
    console.info(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      event: 'option_chain_schema_bootstrap_complete',
    }));
  } finally {
    await pool.end().catch(() => undefined);
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
