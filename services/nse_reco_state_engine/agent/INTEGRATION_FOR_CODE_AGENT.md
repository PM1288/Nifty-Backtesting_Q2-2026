# Integration guide (for coding agent)

This package is an **overlay** that adds:
- state-aware recommendations (regime + signal + action)
- 3-layer anomalies
- regime-conditioned scorecards
- export APIs
- scheduler + job logging

## 0) Assumptions

- Postgres exists in your compose stack.
- Intraday data exists and is queryable.
- You can create Postgres views in the `integration` schema.

This package never touches UI styles; it emits semantic UI tokens:
`direction`, `accent_token`, `arrow`.

## 1) Add code

Copy this folder into your repo (recommended under `services/nse-reco-state-engine/`) OR merge `src/` into your python monorepo.

If your main app is already FastAPI:
- prefer **mounting routers** from `nse_reco_state_aware_engine.api.router:router`
- alternative: run as a sidecar on port 8010

## 2) Add SQL

Run:
```bash
python scripts/install_sql.py --database-url "$DATABASE_URL"
```

This creates:
- `nse_ops.*` (job logs, step logs, quality checks, contract checks)
- `nse_reco.*` (regime snapshots, anomalies, recommendations, scorecards, watchlists)
- `nse_exports.*` (export manifest)
- `integration` schema (empty; you create compatibility views)

## 3) Create compatibility views (critical)

Create the following views in Postgres, mapping to your existing intraday tables:

- `integration.v_security_minute_feature`
- `integration.v_market_minute_feature`
- `integration.v_universe_membership`
- `integration.v_index_daily_history`
- `integration.v_events_daily` (optional)

Exact required columns are listed in `agent/DATA_CONTRACT.md`.

**Do this first**: if these views are missing or columns mismatch, the engine fails fast with `CONTRACT_MISMATCH`.

## 4) Wire jobs

You can run jobs via:
- CLI: `nse-reco-cli run ...`
- Scheduler service: `nse-reco-scheduler`

Env cron strings:
- `CRON_REFRESH_BASELINES`
- `CRON_REFRESH_ANOMALIES`
- `CRON_REFRESH_RECOMMENDATIONS`
- `CRON_REFRESH_SCORECARDS`
- `CRON_REFRESH_QUALITY`

## 5) Acceptance check

Run on a known trade date with intraday data:

```bash
nse-reco-cli run --trade-date YYYY-MM-DD --index-code "NIFTY 50" \
  --steps baselines,regime,anomalies,recommendations,scorecards,quality
```

Validate:
- `SELECT count(*) FROM nse_reco.recommendation_snapshot WHERE trade_date='YYYY-MM-DD';`
- `SELECT * FROM nse_reco.market_regime_snapshot WHERE trade_date='YYYY-MM-DD';`
- `GET /api/v1/reco/summary?trade_date=YYYY-MM-DD`

## 6) Where the app should read from

- `GET /api/v1/reco/summary`
- `GET /api/v1/reco/recommendations?horizon=30m`
- `GET /api/v1/reco/anomalies?scope=single_stock`
- `GET /api/v1/reco/scorecards?horizon=30m`
- `GET /api/v1/reco/watchlists`
- `GET /api/v1/reco/watchlists/{slug}`
- `GET /api/v1/exports/manifest`

## 7) Robustness

- runs and steps are logged (`nse_ops.job_run`, `nse_ops.job_step_run`)
- contract check blocks unsafe runs (`nse_ops.contract_check()`)
- idempotent upserts by key
- scorecards degrade gracefully with thin history

See `agent/ERROR_HANDLING.md`.
