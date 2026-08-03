# Phase 2 Route Inventory

Last reviewed: 2026-04-03

This inventory was captured before splitting the edge topology so that every nginx-routed surface could be preserved or explicitly isolated. The evidence column references the original mixed edge in [`compose/nginx/nginx.conf`](../../compose/nginx/nginx.conf), frontend callers, or explicit compose port mappings.

| External path or port | Upstream target service | Route class | Evidence | Proposed deployment layer |
|---|---|---|---|---|
| `19090` | `nginx` | prod/stage/legacy edge | original `docker-compose.yml` plus all new overlay edge definitions publish `19090:19090` | `core`, `stage`, or `legacy` overlay depending on the selected edge |
| `/` | `n50-dashboard` or `n50-dashboard-stage` via host-aware redirect | prod or stage redirect | original `nginx.conf` maps root to `/n50/` or `/n50-stage/`; `nginx.core.conf` redirects to `/n50/`; `nginx.stage.conf` redirects to `/n50-stage/` | `core` or `stage` |
| `/health` | dashboard health endpoint selected by edge | prod or stage operational | original `nginx.conf` maps `/health` to host-aware dashboard health; split edges now point to the matching dashboard service | `core` or `stage` |
| `/n50/*` | `n50-dashboard` | prod product surface | original `nginx.conf` `location ^~ /n50/`; frontend routes in [`App.tsx`](../../neon-stock-terminal/apps/web/src/App.tsx) | `core` |
| `/n50/health`, `/n50/ready` | `n50-dashboard` | prod operational | dashboard server health endpoints plus route smoke preservation list in [`runtime-baseline.md`](./runtime-baseline.md) | `core` |
| `/auth/*`, `/v1/*`, `/internal/*`, `/api/n50/*` | `n50-dashboard` | prod same-origin API/auth | original `nginx.conf` bare auth/session and same-origin API proxy locations; frontend API consumers in [`api.ts`](../../neon-stock-terminal/apps/web/src/lib/api.ts) | `core` |
| `/n50/api/v1/*`, `/api/v1/*` | `nse-export-api` | prod internal API | original `nginx.conf` `location ^~ /n50/api/v1/` and `/api/v1/`; frontend export/watchlist callers in [`api.ts`](../../neon-stock-terminal/apps/web/src/lib/api.ts) | `core` |
| `/n50/api/v1/intraday/*`, `/api/v1/intraday/*` | `nse-intraday-api` | prod internal API | original `nginx.conf` intraday proxy locations; frontend intraday callers in [`api.ts`](../../neon-stock-terminal/apps/web/src/lib/api.ts) | `core` |
| `/option-chain`, `/option-chain/` | `option-chain-watcher` via redirect to `/n50/options` | prod supporting surface | original `nginx.conf` redirects `/option-chain` to `/n50/options`; frontend option-chain calls still target `/option-chain/api/*` | `core` |
| `/option-chain/api/*`, `/option-chain/healthz`, `/option-chain/readyz` | `option-chain-watcher` | prod supporting API | original `nginx.conf` option-chain upstream and health locations; route smoke keeps these endpoints | `core` |
| `/n50-stage/*` | `n50-dashboard-stage` | stage product surface | original `nginx.conf` `location ^~ /n50-stage/`; current product surface docs; preserved in `nginx.stage.conf` | `stage` |
| `/n50-stage/auth/*`, `/n50-stage/v1/*`, `/n50-stage/internal/*`, `/api/n50-stage/*` | `n50-dashboard-stage` | stage same-origin API/auth | original `nginx.conf` stage auth, feedback, internal, and proxy locations | `stage` |
| `/matomo/*` | `matomo` | telemetry | original `nginx.conf` `matomo_upstream` and `/matomo/` locations | `telemetry` |
| `19091` | `matomo` | telemetry admin port | original compose published `19091:80`; preserved only in telemetry/dev overlays | `telemetry` |
| `/backend/*` | `watchlist` | legacy | original `nginx.conf` `location /backend/` plus legacy health checks | `legacy` |
| `/paper`, `/paper/*` | `watchlist` | legacy | original `nginx.conf` paper routes | `legacy` |
| `/watcher`, `/watcher/*` | `watchlist` | legacy | original `nginx.conf` watcher routes | `legacy` |
| `/digii4/*`, `/api/digii4/*` | `watchlist` | legacy | original `nginx.conf` digii4 routes | `legacy` |
| `/rsi-willr/*` | `rsi-willr-monitor` | legacy | original `nginx.conf` `location /rsi-willr/` | `legacy` |
| `5432` | `postgres` | shared infrastructure | compose port exposure in the current stack | `base` |
| `8010` | `nse-reco-api` | internal/operator | compose host port exposure only; not nginx-routed directly | `base` and included in the prod-like runtime |
| `8091` | `nse-export-api` | internal/operator | compose host port exposure plus nginx proxy targets | `base` and included in the prod-like runtime |
| `8092` | `nse-intraday-api` | internal/operator | compose host port exposure plus nginx proxy targets | `base` and included in the prod-like runtime |

## Topology Notes

- `option-chain-watcher` remains in the prod-like path because the live dashboard still depends on `/option-chain/*`.
- `watchlist` and `rsi-willr-monitor` are preserved behind a dedicated legacy edge instead of being dropped. Their routes are still defined in the original nginx config, so removing them in this phase would have been unsafe.
- `matomo` remains available, but only through the telemetry overlay. The prod-like edge no longer requires it.
