# Error handling & robustness

## Idempotency

- recommendations upsert by `(trade_date, index_code, horizon, symbol)`
- market regime upsert by `(trade_date, index_code)`
- anomalies de-duplicated by `(trade_date, ts, scope, key, reason)`
- scorecards upsert by `(horizon, regime, signal_family)`
- watchlists upsert by `(trade_date, index_code, slug)`

## Failure policy

- each run creates one record in `nse_ops.job_run`
- each step creates one record in `nse_ops.job_step_run`
- failures store `error_code` + `error_detail` + `meta`

## Contract enforcement

- each run starts with `nse_ops.contract_check()`
- if missing views/columns, fail fast with `CONTRACT_MISMATCH`

## Safe degradation

- if scorecards are missing or sample count is low, historical edge shrinks to 0
- if optional event view is missing, event features are ignored (no failure)

## Retention

- `nse_ops.apply_retention(RETENTION_DAYS)` deletes old reco/anomaly/ops/export rows
- export files older than retention are also removed from `EXPORT_DIR`

## Ops API

`GET /api/v1/ops/health` returns contract + last run status.
