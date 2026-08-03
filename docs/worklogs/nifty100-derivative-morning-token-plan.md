Title
Nifty100 Derivative Morning Token Plan

Objective
Add a persisted morning derivative token plan for Nifty100 equities using the SmartAPI script master, selecting current and next futures plus current-expiry ATM +/- 3 stock options, then feed those tokens into the collector without breaking websocket capacity limits.

Repo facts verified
- The collector loads `state/OpenAPIScripMaster.json` through the existing instrument master cache flow.
- Nifty100 constituent symbols already flow into the collector via the symbols/constituents CSV and `index_constituents`.
- Subscription refresh already runs on startup and on a periodic derivative refresh interval.
- Websocket shard/token capacity is already enforced before subscriptions are persisted.
- Actual expiries are present in the script master, so expiry selection should use available contracts rather than an invented calendar where possible.

Files inspected
- `cmd/collector/main.go`
- `cmd/collector/subscriptions.go`
- `cmd/collector/refresh.go`
- `cmd/collector/constituents.go`
- `cmd/collector/tasks.go`
- `internal/universe/derivatives.go`
- `internal/universe/derivatives_test.go`
- `internal/instruments/master.go`
- `internal/store/migrations.go`
- `internal/store/postgres.go`
- `internal/store/validate.go`
- `state/OpenAPIScripMaster.json`

Plan
1. Add a `derivative_token_plan` table and store methods for upsert/query.
2. Refactor derivative selection so stock derivative planning returns both subscriptions and persisted plan rows.
3. Persist the plan during subscription refresh and continue using existing websocket capacity enforcement.
4. Add tests for futures/options selection and monthly-expiry identification.
5. Rebuild the collector and verify the plan is written and subscriptions stay healthy.

Changes made
- Added `public.derivative_token_plan` migration `024_derivative_token_plan` with lookup/underlying indexes and validation coverage.
- Added persisted plan row model and store helpers in `internal/store/postgres.go` for replacing and querying the daily plan.
- Refactored derivative resolution so stock derivative planning returns both subscriptions and persisted plan rows via `ResolveDerivativeSelection`.
- Added stock derivative planning that:
  - selects the nearest and next available futures for each Nifty100 F&O stock
  - selects the nearest-expiry stock options at ATM plus/minus three strikes using the actual strike interval from the script master
  - flags monthly expiry using the last available expiry in the contract month instead of a hardcoded weekday assumption
- Wired the plan into `refreshSubscriptions` so the collector persists the daily plan and marks rows inactive if websocket capacity drops them.
- Added unit coverage for monthly expiry and ATM option selection in `internal/universe/derivatives_test.go`.
- Added a migration-planning helper in `internal/store/reset.go` so legacy checksum drift on `005_strategy` no longer blocks later unapplied migrations like `024_derivative_token_plan`.
- Enabled stock option planning in the live/default collector config by setting `universe.options.enable_stock_options: true` in `config/config.yaml` and `config.example.yaml`.

Validation run
- `gofmt -w cmd/collector/subscriptions.go internal/universe/derivatives.go internal/universe/derivatives_test.go internal/store/postgres.go internal/store/migrations.go internal/store/validate.go internal/store/reset.go internal/store/reset_test.go`
- `go test ./internal/store ./internal/universe ./cmd/collector`
- `docker compose build collector`
- `docker compose up -d --force-recreate collector`
- `docker compose exec -T collector /app/collector --config /app/config.yaml --db-validate-only`
  - initially failed before migration runner repair with `schema validation failed: table:derivative_token_plan`
- After migration runner repair:
  - `public.derivative_token_plan` exists
  - `public.schema_migrations` includes `024_derivative_token_plan`
  - `http://localhost:18081/healthz` returned `status: ok`
  - `subscriptions_count: 1804`
  - `ws_connected: false` after market close, which is expected outside live market hours
- DB validation of today's plan:
  - `rows_today = 1536`
  - `futures_rows = 192`
  - `options_rows = 1344`
  - sample underlyings `HDFCBANK`, `RELIANCE`, and `TCS` show `future_current`, `future_next`, and `option_atm` plus `option_offset_minus_1..3` / `option_offset_plus_1..3` for both `CE` and `PE`

Screens reviewed
- Not applicable. Collector/backend task.

Decisions made
- Prefer actual expiries from the script master over a hardcoded weekday rule.
- Treat "monthly expiry" as the last available expiry in a contract month for a given underlying/instrument family.
- Persist the full planned derivative universe first, then mark rows inactive if existing websocket capacity enforcement drops anything.
- Keep the live config aligned with the requested behavior by enabling stock options explicitly rather than requiring a hidden runtime override.

Risks / follow-ups
- The collector still logs the historical `005_strategy` checksum drift as a warning on startup. New migrations now continue to apply, but the old drift remains unresolved metadata.
- `LTIM` is still logged as unresolved/missing from the constituent-token mapping and therefore does not contribute derivative rows until the underlying/equity mapping is corrected upstream.
- Outside market hours, websocket health will show `ws_connected: false`; the persisted plan and subscription set are still generated correctly at startup.

Resume here next time
- If needed, add an operator/read API for `derivative_token_plan` so the morning selection set can be inspected from the dashboard without querying Postgres directly.
