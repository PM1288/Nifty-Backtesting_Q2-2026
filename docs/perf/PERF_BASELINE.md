# Performance Baseline

## Objective

Document the hottest read paths, their backing tables, the pool settings that bound Postgres access, and the practical performance posture for the current stack.

## Hot path inventory

| Route / surface | Current read path | Backing tables / objects | Freshness posture | Phase 5 action |
| --- | --- | --- | --- | --- |
| `/v1/overview` | Snapshot-backed via `serveSnapshotRoute` | `instrument_state`, `bars_1d`, `instrument_universe`, `index_constituents`, `nse_app.dashboard_snapshots` | 60s fresh, stale-while-revalidate | Keep snapshot-backed path. |
| `/v1/leaderboard` | Derived from stored overview snapshot | same as overview through `nse_app.dashboard_snapshots` | matches overview freshness | Removed repeated overview rebuild from request path. |
| `/v1/stocks/:symbol` | Direct live query | `instrument_universe`, `index_constituents`, `instrument_state`, `bars_1d`, `bars_1m` | live / last-known per table | Keep direct path, rely on read-model indexes and bounded Prisma pool. |
| `/v1/backtesting/*` overview-style pages | Snapshot-backed published marts | `nse_app.backtest_*`, `nse_app.dashboard_snapshots` | 5m snapshot freshness | Keep snapshot-backed path. |
| `/api/v1/intraday/*` | Precomputed intraday snapshot/read-model tables | `nse_intraday.*`, `nse_ops.dashboard_snapshot_intraday`, `nse_ops.watchlist_snapshot_intraday` | near-live scheduled refresh | Keep read-model pattern, bound Python pool. |
| `/option-chain/api/latest` | latest-snapshot read | `option_chain_snapshots`, `option_chain_legs` | live latest capture | Added explicit composite lookup index ownership. |
| `/option-chain/api/analytics` | batched intraday snapshot query | `option_chain_snapshots`, `option_chain_legs` | live latest capture with batched window query | Keep batched DB mode, bound pool and explicit index. |

## Explicit pool posture

### Node API (`neon-stock-terminal/apps/api`)

- Source: Prisma connection string in `DATABASE_URL`
- Explicit envs:
  - `N50_API_DB_CONNECTION_LIMIT`
  - `N50_API_DB_POOL_TIMEOUT`
- Default compose posture:
  - connection limit `2`
  - pool timeout `5s`
- Operator visibility:
  - `/health`
  - `/ready`

### Go services (`internal/store/postgres.go`)

- Source: `pgxpool.ParseConfig`
- Explicit envs already in use:
  - `POSTGRES_MAX_CONNS`
  - `POSTGRES_MIN_CONNS`
  - `POSTGRES_MAX_CONN_IDLE_SECONDS`
  - `POSTGRES_HEALTH_CHECK_SECONDS`
- Current compose posture:
  - collector `3`
  - strategy/watchlist/RSI services `2`

### Intraday intelligence (`services/nse_intraday_intelligence`)

- Source: `psycopg_pool.ConnectionPool`
- Explicit envs:
  - `NSE_INTRADAY_DB_POOL_MIN_SIZE`
  - `NSE_INTRADAY_DB_POOL_MAX_SIZE`
  - `NSE_INTRADAY_DB_POOL_TIMEOUT_SECONDS`
  - `NSE_INTRADAY_DB_POOL_MAX_IDLE_SECONDS`
- Default compose posture:
  - min `1`
  - max `4`
  - timeout `10s`
  - max idle `30s`
- Operator visibility:
  - `/health`

### Orchestration exports (`services/nse_orchestration_exports`)

- Source: `psycopg_pool.ConnectionPool`
- Explicit envs:
  - `NSE_EXPORT_DB_POOL_MIN_SIZE`
  - `NSE_EXPORT_DB_POOL_MAX_SIZE`
  - `NSE_EXPORT_DB_POOL_TIMEOUT_SECONDS`
  - `NSE_EXPORT_DB_POOL_MAX_IDLE_SECONDS`
- Default compose posture:
  - min `1`
  - max `4`
  - timeout `10s`
  - max idle `30s`
- Operator visibility:
  - `/health`

### Recommendation engine (`services/nse_reco_state_engine`)

- Source: SQLAlchemy queue pool
- Explicit envs:
  - `DB_POOL_SIZE`
  - `DB_POOL_MAX_OVERFLOW`
  - `DB_POOL_TIMEOUT_SECONDS`
  - `DB_POOL_RECYCLE_SECONDS`
- Default compose posture:
  - size `4`
  - max overflow `2`
  - timeout `10s`
  - recycle `1800s`
- Operator visibility:
  - `/health`

### Option-chain watcher (`services/option-chain-watcher`)

- Source: `pg.Pool`
- Explicit envs:
  - `NSE_OC_DB_MAX_CONNS`
  - `NSE_OC_DB_IDLE_TIMEOUT_MS`
  - `NSE_OC_DB_CONNECTION_TIMEOUT_MS`
  - `NSE_OC_DB_MAX_LIFETIME_SECONDS`
- Default compose posture:
  - max `2`
  - idle timeout `10s`
  - connect timeout `5s`
  - max lifetime `1800s`

## Explicit read-model indexes

### Node/API-owned deployment-time index manifest

- `db/sql/010_api_read_model_indexes.sql`
- Installed by `scripts/db_migrate_all.sh`
- Covers:
  - `public.index_constituents`
  - `public.instrument_universe`
  - `nse_app.market_summary_daily`
  - `nse_app.signal_performance_summary`
  - `nse_app.stock_analysis_signals_daily`

### Existing route-backed indexes retained

- `services/nse_intraday_intelligence/sql/063_realtime_lookup_indexes.sql`
- `services/nse_reco_state_engine/sql/077_realtime_lookup_indexes.sql`
- `services/option-chain-watcher/src/migrate.ts`
  - now includes `idx_option_chain_snapshots_symbol_expiry_time`

## Operator visibility

### Node `/health` and `/ready`

Now expose:

- DB connectivity
- database size
- Prisma pool settings
- Redis store readiness
- `pg_stat_statements` enabled status
- top statements by total execution time
- dashboard snapshot freshness summary

### Postgres host settings already enabled in compose

- `shared_preload_libraries=pg_stat_statements`
- `pg_stat_statements.track=all`
- `track_io_timing=on`
- `max_connections=50`

## Practical route guidance

- Prefer the overview snapshot for leaderboard-like UX instead of recomputing market breadth/movers on page load.
- Keep `/v1/stocks/:symbol` direct until a symbol snapshot/read-model proves necessary; it is a narrower, symbol-scoped read path.
- Keep backtesting, intraday, and export endpoints on published snapshot/read-model tables instead of live joins.
- Keep option-chain analytics in the current batched DB mode; do not fan out per-strike request-time queries.
