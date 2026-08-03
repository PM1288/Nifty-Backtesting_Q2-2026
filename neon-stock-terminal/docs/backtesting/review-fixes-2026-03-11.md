# Backtesting Review Fix Log - 2026-03-11

## Fix Entries

### BT-001

- Severity: `P0`
- Issue: `refresh-backtesting` crashed before publish.
- Root cause: `services/nse_analytics_worker/app/backtesting.py` referenced `DEFAULT_BACKTEST_STRATEGY_VERSION_ID`, but the module defines `DEFAULT_STRATEGY_VERSION_ID`.
- Files changed:
  - `services/nse_analytics_worker/app/backtesting.py`
- Fix summary:
  - corrected the constant reference in batch assumptions metadata generation
- Validation performed:
  - `python -m py_compile services/nse_analytics_worker/app/backtesting.py`
  - reran `python -m services.nse_analytics_worker.app.cli refresh-backtesting`

### BT-002

- Severity: `P1`
- Issue: feature-layer validation rejected valid runs due to null indicator rows in the warm-up window.
- Root cause: the validation query treated early lookback rows as if `RSI14`, `WILLR14`, `SMA50`, and MACD should already be populated.
- Files changed:
  - `services/nse_analytics_worker/app/backtesting.py`
- Fix summary:
  - added warm-up-aware feature validation and limited null checks to rows that should have full indicator coverage
- Validation performed:
  - `python -m py_compile services/nse_analytics_worker/app/backtesting.py`
  - reran `python -m services.nse_analytics_worker.app.cli refresh-backtesting`
  - confirmed published batch rows exist across feature, template, replay, and mart layers

### BT-003

- Severity: `P1`
- Issue: local browser-backed audit flows failed because the API rejected the actual dev origin.
- Root cause: the API dev CORS path only trusted configured origins and did not automatically allow loopback origins when no explicit allowlist was set.
- Files changed:
  - `neon-stock-terminal/apps/api/src/server.ts`
- Fix summary:
  - allowed local loopback origins in dev mode when `CORS_ALLOWED_ORIGINS` is unset
- Validation performed:
  - reloaded API locally
  - reran Backtesting browser route audit successfully

### BT-004

- Severity: `P0`
- Issue: Backtesting detail, results, and compare routes could crash with React hook-order violations.
- Root cause: hook-driven state derivation executed after early-return branches on loading/error paths.
- Files changed:
  - `neon-stock-terminal/apps/web/src/pages/BacktestingStrategyDetailPage.tsx`
  - `neon-stock-terminal/apps/web/src/pages/BacktestingPortfolioResultsPage.tsx`
  - `neon-stock-terminal/apps/web/src/pages/BacktestingComparePage.tsx`
- Fix summary:
  - moved scenario hook usage and hook-driven derivations above early returns so hook order is stable on every render path
- Validation performed:
  - `corepack pnpm --filter @app/web typecheck`
  - reran browser audit; no route/page errors remained

### BT-005

- Severity: `P1`
- Issue: cross-origin local dev reads targeted incorrect `/api/v1/...` paths and produced broken requests.
- Root cause: the web client prepended `VITE_API_BASE_URL` without normalizing the local Backtesting API route shape.
- Files changed:
  - `neon-stock-terminal/apps/web/src/lib/api.ts`
- Fix summary:
  - added API path normalization so `/api/v1/*` client paths resolve correctly to `/v1/*` on the local API base URL
- Validation performed:
  - verified `GET /v1/backtesting/overview` and related browser flows
  - reran Backtesting route audit cleanly

### BT-006

- Severity: `P1`
- Issue: Backtesting pages generated false console failures from unrelated unsupported prefetch requests and noisy telemetry logging.
- Root cause:
  - shared prefetch logic still warmed unavailable quality/ops/export endpoints
  - analytics logger promoted non-actionable warning events to `console.error`
- Files changed:
  - `neon-stock-terminal/apps/web/src/lib/useDashboardPrefetch.ts`
  - `neon-stock-terminal/apps/web/src/analytics/providers/logger.ts`
- Fix summary:
  - removed unsupported aux endpoint prefetches from the shared background path
  - downgraded non-fatal analytics noise away from `console.error`
- Validation performed:
  - reran browser audit
  - confirmed `console errors = 0` and `request failures = 0`

### BT-007

- Severity: `P1`
- Issue: Backtesting `GET` endpoints were not guest-readable even though the module is presented inside the public analytics shell.
- Root cause: `isGuestReadablePath()` omitted `/backtesting` and `/v1/backtesting` route families.
- Files changed:
  - `neon-stock-terminal/apps/api/src/auth/guard.ts`
- Fix summary:
  - aligned Backtesting read access with the existing public analytics pattern for unauthenticated `GET` requests
- Validation performed:
  - code inspection of auth guard
  - local route audit still passed after change

### BT-008

- Severity: `P1`
- Issue: the Backtesting API could silently materialize seeded fallback data when published snapshots were unavailable.
- Root cause: route builders fell back to seeded registry/dataset payloads without requiring an explicit development opt-in.
- Files changed:
  - `neon-stock-terminal/apps/api/src/routes/backtesting.ts`
  - `neon-stock-terminal/apps/api/src/lib/dashboardSnapshots.ts`
- Fix summary:
  - required published Backtesting snapshots by default
  - kept seeded fallback only behind explicit `BACKTESTING_ALLOW_SEEDED_FALLBACK=1`
  - added structured route error passthrough so missing published snapshots surface as truthful API failures instead of silent mock success
- Validation performed:
  - `corepack pnpm --filter @app/api typecheck`
  - verified published snapshot routes still return `200` in the audited environment
  - reran browser audit post-fix

### BT-009

- Severity: `P0`
- Issue: rerunning `refresh-backtesting` against an already-populated database failed on duplicate `trade_template_id`.
- Root cause: `trade_template_id` was generated from only `strategy_version_id + symbol + signal_date`, but the table treats that field as globally unique across batches.
- Files changed:
  - `services/nse_analytics_worker/app/backtesting.py`
  - `neon-stock-terminal/docs/backtesting/data-model.md`
  - `neon-stock-terminal/docs/backtesting/runbook.md`
- Fix summary:
  - batch-scoped `trade_template_id` generation so repeat publishes can safely materialize the same logical signal in later batches
- Validation performed:
  - `python -m py_compile services/nse_analytics_worker/app/backtesting.py`
  - reran `python -m services.nse_analytics_worker.app.cli refresh-backtesting`
  - confirmed successful published batch `9`

## Validation Summary

Post-fix validation completed:

- worker publish against local DB data
- web typecheck
- api typecheck
- browser route audit across 44 route/viewport captures
- direct API timing spot-checks
- accounting invariant checks against published batch `6`
- sample trade walkthroughs across all 3 strategies
