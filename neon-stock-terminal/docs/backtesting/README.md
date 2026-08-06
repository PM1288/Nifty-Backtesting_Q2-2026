# Backtesting Module

## Scope

The Backtesting module adds a native `Backtesting` workspace to the N50 shell for:

- structured, versioned strategy storage
- precomputed daily-data results
- single-stock and `Nifty 100` analysis
- finite-capital and no-capital-limit studies
- FD benchmark comparison
- regime-aware comparison
- stock suitability analysis
- fail-closed Rules-of-Engagement classification and rankability
- independent stock, NIFTY 50 and India VIX suitability slices

Execution is stock-only. Index instruments such as Nifty, Bank Nifty, and India VIX are context inputs only.

## Current v1 status

The current implementation provides:

- three active strategies from day one
- worker-side layered precompute using actual daily feature data
- published snapshot reads through `/v1/backtesting/*`
- published-batch serving by default; seeded fallback is development-only and must be explicitly enabled with `BACKTESTING_ALLOW_SEEDED_FALLBACK=1`
- a compare page that meaningfully contrasts archetypes
- regime and stock pages that compare all active strategies side by side
- route analytics, route monitoring thresholds, and prefetch support
- guest-readable `GET /v1/backtesting/*` endpoints aligned with the public analytics shell

## Active strategies

1. `Fast Oversold Rebound`
2. `Confirmed Oversold Recovery`
3. `MACD Trend Continuation`

## Routes

- `/backtesting`
- `/backtesting/strategies`
- `/backtesting/strategies/:strategyId`
- `/backtesting/results`
- `/backtesting/regimes`
- `/backtesting/stocks`
- `/backtesting/daily-summary`
- `/backtesting/compare`
- `/backtesting/runs`

## Code locations

Frontend:

- `apps/web/src/pages/BacktestingChrome.tsx`
- `apps/web/src/pages/BacktestingOverviewPage.tsx`
- `apps/web/src/pages/BacktestingStrategyLibraryPage.tsx`
- `apps/web/src/pages/BacktestingStrategyDetailPage.tsx`
- `apps/web/src/pages/BacktestingPortfolioResultsPage.tsx`
- `apps/web/src/pages/BacktestingRegimeAnalysisPage.tsx`
- `apps/web/src/pages/BacktestingStockInsightsPage.tsx`
- `apps/web/src/pages/BacktestingDailySummaryPage.tsx`
- `apps/web/src/pages/BacktestingComparePage.tsx`
- `apps/web/src/pages/BacktestingRunsPage.tsx`

Backend:

- `apps/api/src/routes/backtesting.ts`
- `apps/api/src/lib/backtestingPublished.ts`
- `services/nse_analytics_worker/app/backtesting.py`
- `services/nse_analytics_worker/app/refresh.py`
- `services/nse_analytics_worker/app/cli.py`
- `services/nse_analytics_worker/sql/050_backtesting_precompute.sql`

## Data flow

1. EOD ingestion refreshes the source feature data.
2. The worker computes feature, regime, candidate, template, replay, and mart layers.
3. Results are written under one `batch_run_audit` record for `backtesting_precompute`.
4. Validation runs before publish.
5. The API reads only the latest published batch.
6. The API caches shaped responses through `nse_app.dashboard_snapshots`.
7. The frontend reads cached, pre-shaped snapshot payloads.
8. `strategy_eval.run_evaluation` adds governed result type, validation gates,
   suitability and evidence lineage without mutating canonical backtest facts.

## Adding a new strategy

1. Add a new immutable strategy version in the registry.
2. Define structured `config_json` and `assumptions_json`.
3. Extend worker signal and template logic.
4. Publish through the same layered pipeline.
5. Update the registry and strategy docs.

## Non-goals

- no arbitrary browser-side strategy code execution
- no heavy live backtest compute on page load
- no intraday execution assumptions in v1
- no silent overwriting of published strategy history
