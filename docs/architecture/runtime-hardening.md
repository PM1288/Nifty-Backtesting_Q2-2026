# Runtime Hardening (Phase 4)

## What changed

The prod-like runtime no longer depends on checkout-mounted files for normal startup.

- `nse_ingestor` and `nse-analytics-worker` now carry their `ops/entrypoint.sh` scripts inside the image.
- `nse_ingestor`, `nse-orchestrator`, `nse-export-api`, `nse-intraday-api`, `nse-intraday-scheduler`, `nse-reco-api`, and `nse-reco-scheduler` now use named volumes for runtime state instead of repo-path bind mounts.
- The split nginx overlays now use baked images:
  - `trading-stack-nginx-core:latest`
  - `trading-stack-nginx-stage:latest`
  - `trading-stack-nginx-legacy:latest`
- Internal service ports are no longer published in the prod-like `base+core` path. They remain exposed through the dev overlay for local debugging.
- File logging for `nse_ingestor` and `nse-analytics-worker` is disabled in the prod-like path so logs go to container stdout/stderr and can be collected with `docker logs`.

## Prod-like storage layout

### Named volumes

- `pgdata`
- `redis_data`
- `nse_ingestor_inbound`
- `nse_ingestor_staging`
- `nse_orchestration_exports`
- `nse_intraday_exports`
- `nse_reco_exports`

### Jobs storage

- `institutional_flow_raw`
- `institutional_flow_staging`
- `institutional_flow_curated`
- `institutional_flow_logs`
- `institutional_flow_run_reports`

## Remaining mutable areas

These are intentionally deferred to later phases:

- `compose.dev.yml` remains a convenience-oriented local stack and still carries additional host-exposed ports and legacy tooling.
- Legacy Go services still use local bind mounts for config and state.
- The prod-like runtime is not yet fully read-only across every container; only the split nginx services are hardened with `read_only`, `tmpfs`, and `no-new-privileges`.

## Verification

Use explicit env-file compose commands:

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.core.yml up -d --build
python scripts/verify/mount_report.py --surface core
python scripts/verify/route_smoke.py --base-url http://localhost:19090 --surface core
python scripts/verify/warmup_probe.py --base-url http://localhost:19090 --path /n50/
```

See [runtime-phase4-report.md](C:\Github_sync\trading-stack\docs\architecture\runtime-phase4-report.md) for the full filesystem inventory, port comparison, hardening matrix, and startup-migration ledger.
