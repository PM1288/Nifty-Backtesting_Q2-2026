# Compose topology

This repository now supports a modular Compose layout so production-like startup does not automatically pull in stage, telemetry, jobs, and legacy services.

## Files

- `compose/compose.base.yml`
  Shared stateful and backend services required across deployments.
- `compose/compose.core.yml`
  Production-like N50 dashboard and edge.
- `compose/compose.stage.yml`
  Stage dashboard and stage-focused edge.
- `compose/compose.telemetry.yml`
  Matomo and MariaDB only.
- `compose/compose.jobs.yml`
  One-off or scheduled institutional-flow ingest job.
- `compose/compose.legacy.yml`
  Legacy watchlist/collector/RSI services and their edge.
- `compose/compose.dev.yml`
  Local all-in-one development path preserving the previous mixed topology.

## Service placement

### Base

- `postgres`
- `redis`
- `option-chain-watcher`
- `nse_ingestor`
- `nse-analytics-worker`
- `nse-orchestrator`
- `nse-export-api`
- `nse-intraday-api`
- `nse-intraday-scheduler`
- `nse-reco-api`
- `nse-reco-scheduler`
- `market-data-gateway`

### Core

- `n50-dashboard`
- `nginx` with `compose/nginx/nginx.core.conf`

### Stage

- `n50-dashboard-stage`
- `nginx` with `compose/nginx/nginx.stage.conf`

### Telemetry

- `matomo-db`
- `matomo`

### Jobs

- `institutional-flow-ingest`

### Legacy

- `collector`
- `strategy`
- `watchlist`
- `rsi-willr-monitor`
- `nginx` with `compose/nginx/nginx.legacy.conf`

### Dev

All previously co-deployed services remain available through `compose/compose.dev.yml` for local parity and debugging.

## Environment files

Every overlay reads the shared repo-root `.env` and a small overlay file from `compose/env/`.

- `compose/env/core.env`
- `compose/env/stage.env`
- `compose/env/telemetry.env`
- `compose/env/jobs.env`
- `compose/env/legacy.env`
- `compose/env/dev.env`

The overlay files are intentionally minimal in this phase. They establish a stable per-deployment configuration boundary without duplicating secrets.

## Edge strategy

- `compose/nginx/nginx.core.conf` serves only the retained prod-like surface: `/n50/*`, same-origin dashboard auth/API paths, `/n50/api/v1/*`, `/api/v1/*`, `/api/v1/intraday/*`, and `/option-chain/*`.
- `compose/nginx/nginx.stage.conf` serves only the stage surface under `/n50-stage/*`.
- `compose/nginx/nginx.legacy.conf` preserves legacy watchlist and RSI/WILLR paths without keeping those upstreams in the prod-like edge.
- The original mixed edge remains documented in [`compose-route-inventory.md`](./compose-route-inventory.md); it is no longer the recommended default deployment path.

## Commands

### Core

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.core.yml config
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.core.yml up -d
python scripts/verify/route_smoke.py --base-url http://localhost:19090 --surface core
```

### Stage

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.stage.yml config
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.stage.yml up -d
```

### Telemetry

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.telemetry.yml config
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.telemetry.yml up -d
```

### Jobs

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.jobs.yml config
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.jobs.yml run --rm institutional-flow-ingest
```

### Legacy

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.legacy.yml config
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.legacy.yml up -d
```

### Dev

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.dev.yml config
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.dev.yml up --build
```

## Notes

- `docker-compose.yml` is retained in this phase for compatibility, but the modular files above are the intended deployment path.
- The core path no longer requires `n50-dashboard-stage`, `matomo`, `matomo-db`, or legacy watchlist services.
- The route smoke verifier now supports `--surface core` so core validation does not fail on legacy-only endpoints such as `/backend/healthz`.
- Detailed route ownership is recorded in [`compose-route-inventory.md`](./compose-route-inventory.md).
- Service placement justification is recorded in [`service-classification-matrix.md`](./service-classification-matrix.md).
- DB-capacity and startup-risk deferrals are recorded in [`phase2-risk-ledger.md`](./phase2-risk-ledger.md).
