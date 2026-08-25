# Target-only cursor and Paper evaluation recovery — 2026-08-19

## Outcome

- Removed the smoke/splash renderer and its canvas from the authenticated application shell.
- Desktop devices with a fine pointer now suppress the native browser cursor across the shell and show only the market-coloured target reticle. The reticle still snaps to actionable controls.
- Touch/coarse-pointer devices retain normal touch behaviour. Reduced-motion, Calm and Pause modes keep the reticle usable but remove its interpolated movement.
- Recovered `GET /v1/workspace/paper-trading` from Prisma `P2024` failures. The endpoint now returns the complete 26-trade payload under concurrent authenticated reads.

## Root cause

The Paper workspace started eight PostgreSQL queries concurrently through the shared Prisma pool. Production config limited that pool to four connections, while overview snapshots, quote work and notification dispatch used the same pool. The route therefore waited 15 seconds for a connection and returned `P2024`/HTTP 500.

Reducing the route fan-out alone was insufficient because unrelated long-running market queries could still occupy every shared connection. The final correction combines:

1. one-at-a-time query execution inside a Paper request;
2. a dedicated three-connection Prisma read pool for Paper evidence, with a 20-second acquisition timeout;
3. current marks from indexed `instrument_state` instead of searching historical quote partitions;
4. indexable exact F&O underlying lookup instead of applying `upper()` to the indexed database column.

Database inspection also found two read-only recommendation-scheduler queries running since 18 August for more than 30 hours and saturating storage I/O. Only those two exact active SELECTs (`725279`, `725448`, client `172.25.0.12`) were cancelled with `pg_cancel_backend`; no table, row, collector or service was deleted. The stale-query count was zero after cancellation.

## Files

Created:

- `neon-stock-terminal/apps/api/src/lib/boundedConcurrency.ts`
- `neon-stock-terminal/apps/api/src/lib/boundedConcurrency.test.ts`
- `neon-stock-terminal/apps/api/src/lib/prismaPoolUrl.ts`
- `neon-stock-terminal/apps/api/src/lib/prismaPoolUrl.test.ts`

Changed:

- `neon-stock-terminal/apps/api/src/routes/workspace.ts`
- `neon-stock-terminal/apps/api/src/routes/index.ts`
- `neon-stock-terminal/apps/api/src/server.ts`
- `neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx`
- `neon-stock-terminal/apps/web/src/components/visual/MarketTargetCursor.tsx`
- `neon-stock-terminal/apps/web/src/components/visual/MarketTargetCursor.module.css`
- `neon-stock-terminal/apps/web/tests/marketGradientWaves.test.ts`
- `docker-compose.yml`
- `tools/playwright/market-cursor-regression.mjs`
- `tools/playwright/market-gradient-waves-regression.mjs`

Deleted:

- `neon-stock-terminal/apps/web/src/components/visual/MarketSplashCursor.tsx`
- `neon-stock-terminal/apps/web/src/components/visual/MarketSplashCursor.module.css`
- `neon-stock-terminal/apps/web/src/components/visual/marketSplashCursor.ts`

## API and schema impact

- No response-contract or OpenAPI change. Existing Paper response fields are preserved.
- No database migration and no production-data mutation.
- New runtime settings: `N50_PAPER_DB_CONNECTION_LIMIT` (default `3`) and `N50_PAPER_DB_POOL_TIMEOUT` (default `20`).

## Validation

| Check | Result |
|---|---|
| API unit suite | PASS — 105/105 |
| Web unit suite | PASS — 30/30 |
| API/Web TypeScript | PASS |
| API/Web production builds | PASS |
| Target-only cursor browser test | PASS — 6/6 |
| Smoke canvas present | PASS — 0 instances |
| Three simultaneous authenticated Paper reads | PASS — 3/3 HTTP 200, 26 trades each, 9.05–9.33 s server time |
| Authenticated Paper page | PASS — 26 rows, no unavailable message, no failed app responses, 8.99 s browser load |
| Prisma `P2024` after final redeploy/stress | PASS — none observed |
| Container health | PASS — healthy |

Earlier failed evidence is retained: before the dedicated pool, the stress run still produced `P2024`; before cancellation of the abandoned analytics SELECTs, successful reads took 28–60 seconds. These results were not relabelled as warnings.

## Evidence

- Assertions: `output/playwright/target-only-cursor-20260819/results.json`
- Target snapped to Today: `output/playwright/target-only-cursor-20260819/target-cursor-snapped-1366x768.png`
- Loaded Paper dashboard: `output/playwright/target-only-cursor-20260819/paper-trading-1366x768.png`

## Rollback

Live-file backup: `/home/novius2/trading-stack/backups/target-cursor-paper-pool-20260819T111000Z`.

Restore the backed-up shell/cursor/API files and `docker-compose.yml`, then rebuild and recreate only `n50-dashboard`. Restoring the former cursor files re-enables smoke. The database query cancellations require no rollback; they changed no stored data. No broker order was placed.
