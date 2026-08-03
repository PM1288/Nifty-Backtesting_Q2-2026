# DB Retention and Capacity

## Objective

Make retention windows, cleanup responsibilities, and operator sizing checks explicit for the live-data stack.

## Retention ownership

| Domain | Primary tables | Retention control |
| --- | --- | --- |
| Core collector intraday warehouse | `bars_1m`, `quote_snapshots`, `option_greeks`, depth / OI / PCR snapshots | root config + cleanup scripts in the Go stack |
| Daily ingest | `nse.*` | `services/nse_ingestor` and `services/nse_analytics_worker` maintenance flow |
| Daily analytics / backtesting | `nse_app.*` marts | analytics worker refresh and retention policy |
| Orchestration/export snapshots | `nse_ops.dashboard_snapshot_daily`, `nse_ops.dashboard_section_daily`, `nse_ops.watchlist_snapshot_daily`, `nse_ops.export_manifest` | `services/nse_orchestration_exports` |
| Intraday intelligence | `nse_intraday.*`, `nse_ops.dashboard_snapshot_intraday`, `nse_ops.watchlist_snapshot_intraday` | `services/nse_intraday_intelligence` |
| Recommendation overlay | `nse_reco.*`, `nse_reco_ops.*`, `nse_exports.*` | `services/nse_reco_state_engine` |
| Option-chain capture | `option_chain_snapshots`, `option_chain_legs` | option-chain watcher cleanup flow |

## Current retention windows

### Root / Go stack

Documented in `README.md` and driven by cleanup env overrides:

- `BARS_DAYS`
- `SNAP_DAYS`
- `DEPTH5_DAYS`
- `DEPTH5_HOURS`
- `GREEKS_DAYS`
- `DEPTH5_MAX_GB`
- `RETENTION_DRY_RUN`

### Intraday intelligence

Configured via compose/env:

- `RAW_RETENTION_DAYS`
- `MINUTE_RETENTION_DAYS`
- `FEATURE_RETENTION_DAYS`
- `SNAPSHOT_RETENTION_DAYS`
- `OPS_RUN_RETENTION_DAYS`

Default main-stack posture:

- raw days `31`
- minute days `31`
- feature days `730`
- snapshot days `45`
- ops run days `365`

### Orchestration exports

Configured via compose/env:

- `EXPORT_RETENTION_DAYS`
- `OPS_RUN_RETENTION_DAYS`
- `DATA_STALE_DAYS_MAX`

### Recommendation overlay

Configured via:

- `RETENTION_DAYS`

Default main-stack posture:

- `185`

## Cleanup commands

### Root stack

```bash
./scripts/db_cleanup.sh
```

### Full explicit migration/bootstrap flow

```bash
./scripts/db_migrate_all.sh
```

### Intraday retention

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.core.yml run --rm nse-intraday-api python -m nse_intraday_intelligence.manual_jobs retention
```

### Orchestration export retention

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.core.yml run --rm nse-export-api python -m nse_orchestration_exports.manual_jobs retention
```

## Capacity / size checks

### Node operator view

Use:

- `GET /health`
- `GET /ready`

These now expose:

- current database size
- top `pg_stat_statements`
- snapshot freshness
- Redis readiness

### Direct Postgres checks

Database size:

```sql
select pg_database_size(current_database()) as database_size_bytes,
       pg_size_pretty(pg_database_size(current_database())) as database_size_pretty;
```

Largest relations:

```sql
select
  n.nspname as schema_name,
  c.relname as relation_name,
  pg_total_relation_size(c.oid) as total_bytes,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_pretty
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'm', 'p')
order by total_bytes desc
limit 20;
```

Top statements:

```sql
select
  queryid,
  calls,
  round(total_exec_time::numeric, 1) as total_exec_ms,
  round(mean_exec_time::numeric, 1) as mean_exec_ms,
  left(regexp_replace(query, '\s+', ' ', 'g'), 200) as query_text
from pg_stat_statements
order by total_exec_time desc
limit 20;
```

## Capacity guidance

- Keep `max_connections` aligned with the sum of explicit pool ceilings plus operational headroom.
- Prefer small, bounded pools at the service layer over large fan-out pools.
- Prefer snapshot/read-model tables for dashboard traffic rather than increasing pool size to compensate for heavy joins.
- Review the largest relations before increasing retention windows.
- Add indexes only for queries proven to sit on hot user-facing paths or recurring scheduled refreshes.

## Phase 5 notes

- `/v1/leaderboard` now reads from the overview snapshot rather than re-running the overview query graph.
- Python export and intraday services now use bounded `psycopg_pool` pools instead of opening one connection per helper call.
- Reco now uses a bounded SQLAlchemy queue pool instead of `NullPool`.
- API read-model indexes are now explicit deployment-time SQL, not runtime DDL.
