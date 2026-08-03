# Phase 4 Runtime Report

This document captures the filesystem, port, hardening, and startup-migration state after Phase 4.

## Summary

- The prod-like `base+core` path no longer relies on ordinary repo bind mounts for normal runtime.
- Mutable runtime state in the prod-like path now lives in named volumes.
- Internal core APIs are no longer host-published in the prod-like path.
- `compose.dev.yml` remains intentionally broader for local debugging and convenience.
- Warm-up behavior is measured explicitly rather than treated as an automatic regression.

## Runtime Filesystem And Port Inventory

| Service | Overlay | Current mount or port | Category | Current purpose | Target prod-like treatment | Target dev treatment | Action taken | Deferred reason |
|---|---|---|---|---|---|---|---|---|
| `postgres` | `base`, `dev` | volume `pgdata` at `/var/lib/postgresql/data`; `5432` in dev only | durable state, debug port | database storage and local access | named volume, no host port | keep host port in dev | prod-like host port removed | none |
| `redis` | `base` | volume `redis_data` at `/data` | durable state/cache | redis persistence | named volume, internal only | same | kept internal-only | none |
| `nse_ingestor` | `base`, `dev` | volumes `nse_ingestor_inbound`, `nse_ingestor_staging` | inbound/staging data | runtime ingest paths | named volumes | same; file logging can stay enabled in dev | repo bind mounts removed, `ops` baked into image | startup migrations deferred |
| `nse_ingestor` | `base` | no published host port | port | internal worker only | internal only | n/a | unchanged | none |
| `nse-analytics-worker` | `base`, `dev` | no mounts in prod-like path | ops/logging | analytics worker runtime | baked image + stdout logs | dev can keep file logging via env | repo `ops` and log bind mounts removed | startup migrations deferred |
| `nse-orchestrator` | `base` | volume `nse_orchestration_exports` at `/var/lib/nse/exports` | durable exports | generated exports | named volume | same | repo bind mount removed | install-on-start deferred |
| `nse-export-api` | `base`, `dev` | volume `nse_orchestration_exports`; no host port in prod-like | durable exports, debug port | serve exports/API | named volume, internal only | keep `8091` in dev | prod-like host port removed | install-on-start deferred |
| `nse-intraday-api` | `base`, `dev` | volume `nse_intraday_exports`; no host port in prod-like | durable exports, debug port | intraday API/export state | named volume, internal only | keep `8092` in dev | prod-like host port removed | install-on-start deferred |
| `nse-intraday-scheduler` | `base` | volume `nse_intraday_exports` | durable exports | scheduled intraday jobs | named volume | same | repo bind mount removed | install-on-start deferred |
| `nse-reco-api` | `base`, `dev` | volume `nse_reco_exports`; no host port in prod-like | durable exports, debug port | reco API exports | named volume, internal only | keep `8010` in dev | prod-like host port removed | install-on-start deferred |
| `nse-reco-scheduler` | `base` | volume `nse_reco_exports` | durable exports | scheduled reco jobs | named volume | same | repo bind mount removed | install-on-start deferred |
| `market-data-gateway` | `base` | no mounts; no host port | internal API | supporting metrics service | internal only | same | unchanged | none |
| `option-chain-watcher` | `base` | no mounts; no host port | internal API | option chain backend behind nginx | internal only | same | unchanged | install-on-start deferred |
| `n50-dashboard` | `core`, `dev` | no mounts; no host port in prod-like | app runtime | serve web/API behind nginx | internal only | direct container only through compose if needed | unchanged | write-path behavior not fully audited |
| `nginx` | `core` | host port `19090`; no bind mounts | edge config/static | edge routing | baked image + edge-only host port | dev keeps old mounted nginx path | config and gateway static bind mounts removed | none |
| `nginx` | `dev` | bind-mounted `nginx.conf` and `services/gateway`; host port `19090` | dev convenience | local all-in-one edge | n/a | keep broader local path | intentionally unchanged | dev overlay is intentionally broader |
| `collector` | `dev`, `legacy` | repo config/state mounts | config/state | legacy workflows | not in prod-like path | keep local mounts | unchanged | legacy service deferred |
| `strategy`, `watchlist`, `rsi-willr-monitor` | `dev`, `legacy` | repo config mounts | config | legacy workflows | not in prod-like path | keep local mounts | unchanged | legacy service deferred |
| `institutional-flow-ingest` | `jobs` | named volumes for raw/staging/curated/logs/run_reports | job state | one-off ingest pipeline | named volumes | same | repo bind mounts removed | external storage strategy deferred |

## Before / After Port Exposure

| Service | Before Phase 4 prod-like | After Phase 4 prod-like | Dev overlay |
|---|---|---|---|
| `nginx` | `19090` | `19090` | `19090` |
| `postgres` | `5432` | internal only | `5432` |
| `nse-export-api` | `8091` | internal only | `8091` |
| `nse-intraday-api` | `8092` | internal only | `8092` |
| `nse-reco-api` | `8010` | internal only | `8010` |
| all other core services | internal only | internal only | internal only unless explicitly added in dev |

## Container Hardening Matrix

| Service | Hardened now? | Non-root | Read-only root fs | tmpfs | Dropped capabilities | Blocker / reason | Next phase recommendation |
|---|---|---|---|---|---|---|---|
| `nginx` | yes | no | yes | `/var/cache/nginx`, `/var/run`, `/tmp` | not yet | stock nginx image still runs as root master process | evaluate non-root nginx image variant later |
| `n50-dashboard` | partial | no | no | `/tmp` | `ALL` | Prisma/node runtime write paths not fully audited | audit writable paths, then test read-only rootfs |
| `market-data-gateway` | partial | no | no | `/tmp` | `ALL` | Python runtime not fully audited for read-only rootfs | audit temp/cache needs, then test read-only rootfs |
| `option-chain-watcher` | partial | no | no | `/tmp` | `ALL` | Playwright/Node runtime may need writable paths beyond `/tmp` | audit browser/cache paths before read-only rootfs |
| `nse_ingestor` | no | no | no | no | no | startup scripts and runtime data paths still mutable | revisit after migration/readiness cleanup |
| `nse-analytics-worker` | no | no | no | no | no | startup scripts and migration flow still mutable | revisit after migration/readiness cleanup |
| `nse-orchestrator`, `nse-export-api`, `nse-intraday-*`, `nse-reco-*` | no | no | no | no | no | install-on-start behavior and export volumes still need later sequencing review | revisit in Phase 5/6 |

## Startup-Migration Ledger

| Service | Startup migration/install behavior | Trigger | Phase to handle |
|---|---|---|---|
| `nse_ingestor` | migrations on container start | baked `ops/entrypoint.sh` | Phase 5 / Phase 6 |
| `nse-analytics-worker` | migrations on container start | baked `ops/entrypoint.sh` | Phase 5 / Phase 6 |
| `nse-orchestrator` | optional SQL install on start | `INSTALL_SQL_ON_START` | Phase 6 |
| `nse-export-api` | optional SQL install on start | `INSTALL_SQL_ON_START` | Phase 6 |
| `nse-intraday-api` | optional SQL install on start | `INSTALL_SQL_ON_START` | Phase 6 |
| `nse-intraday-scheduler` | optional SQL install on start | `INSTALL_SQL_ON_START` | Phase 6 |
| `nse-reco-api` | optional SQL install on start | `INSTALL_SQL_ON_START` | Phase 6 |
| `nse-reco-scheduler` | optional SQL install on start | `INSTALL_SQL_ON_START` | Phase 6 |
| `option-chain-watcher` | optional migrations on start | `NSE_OC_RUN_MIGRATIONS_ON_START` | Phase 6 |

## Warm-Up Notes

- An immediate post-recreate core smoke run previously timed out once on `/n50/`.
- Direct `curl` to `/n50/` returned `200`.
- A second steady-state smoke run passed `15/15`.
- Use `python scripts/verify/warmup_probe.py --base-url http://localhost:19090 --path /n50/` to capture first-hit versus steady-state behavior.
