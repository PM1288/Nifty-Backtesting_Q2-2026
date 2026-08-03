# ADR-005: Data-Plane Performance Pools and Explicit Read-Model Indexes

## Status

Accepted

## Context

The stack serves read-heavy live and near-live market pages across:

- the Node same-origin dashboard/API
- the Go collector and strategy services
- Python export, intraday, and recommendation APIs
- the option-chain watcher

Before this phase:

- `/v1/leaderboard` rebuilt overview data on every request instead of using the existing overview snapshot.
- two Python services opened a fresh psycopg connection per helper call.
- the recommendation service used SQLAlchemy `NullPool`.
- some justified API read-model indexes existed only as transitional runtime DDL.
- Node Prisma pool settings were encoded only inside `DATABASE_URL` literals in compose.

This was operationally ambiguous for a read-heavy deployment and made performance posture harder to audit.

## Decision

1. Hot dashboard reads should prefer snapshot-backed or precomputed read models over repeated page-time joins.
2. Every long-running service talking to Postgres must expose explicit, bounded pool settings through env/config.
3. API read-model performance indexes must be installed by the migration flow, not by runtime DDL.
4. Operator-visible health/perf metadata should expose pool settings, database sizing, and top hot queries where the service already owns the read path.

## Consequences

### Positive

- `/v1/leaderboard` now derives from the existing overview snapshot instead of recomputing the overview query stack per request.
- Node, Python, reco, and option-chain DB pool limits are explicit and documented.
- API read-model indexes are owned by `db/sql/010_api_read_model_indexes.sql` and executed by `scripts/db_migrate_all.sh`.
- `/health` and `/ready` on the Node API now expose database size, Prisma pool settings, and `pg_stat_statements` hot-query summaries.
- The intraday, export, and reco APIs now expose pool and retention settings on `/health`.

### Trade-offs

- Python services now hold small steady-state pools instead of connecting on demand, which slightly increases idle connection usage in exchange for predictable latency.
- Leaderboard freshness now follows the overview snapshot freshness contract instead of querying the live tables independently.
- Runtime `N50_API_ALLOW_RUNTIME_PERF_DDL` is now effectively a legacy compatibility flag and no longer installs indexes.

## Deferred

- Full query/result caching for `/v1/stocks/:symbol`.
- A shared migration ledger for all SQL packages.
- Moving option-chain schema out of `public`.
- Per-route benchmark automation beyond the current targeted smoke/perf checks.
