# Backtesting and Training Dashboard Architecture

Last reviewed: 2026-08-03

This is the implementation guide for adding strategies, persisted result sets, and UI dashboards to the N50 stack. Read it with `SOURCE_OF_TRUTH.md`; running code and active configuration remain authoritative.

## Current architecture

```text
CSV / PostgreSQL market data
          |
          v
services/nse_analytics_worker/app/backtesting.py
  strategy registry -> signal engine -> chronological portfolio replay
  -> costs/tax/benchmark/regime aggregation
          |
          v
nse_app.backtest_* staging tables -- atomic batch publish --> latest good batch
          |
          v
neon-stock-terminal/apps/api /v1/backtesting/*
          |
          v
React pages + reusable BacktestingChrome components
```

The live web application is `neon-stock-terminal/apps/web`. The Express/Prisma API is `neon-stock-terminal/apps/api`. The backtesting publisher and its SQL ownership live under `services/nse_analytics_worker`; do not create a second dashboard database beside it.

StratLab under `platform/nifty_stratlab` is the governed research/evidence layer. Its `catalog`, `research`, and `simulation` schemas are not read directly by the UI. A promoted experiment must pass quality gates and be adapted into the uniform `nse_app.backtest_*` published model.

## Uniform identity and storage

Every strategy has a stable `strategy_id`; every immutable rule set has a `strategy_version_id`; every execution has a unique `batch_id`/run ID. Never embed a calendar year such as 2012 in the strategy name. Store requested/actual start and end dates as separate fields so the same version remains comparable across periods.

The published model is owned by `services/nse_analytics_worker/sql/050_backtesting_precompute.sql`. It stores run audit, strategy/version identity, scenario summaries, trade logs, curves, daily summaries, regime summaries, stock summaries, heatmaps and comparison marts. A publish is successful only after all expected rows are present; readers use the latest successful published batch, so an incomplete run never replaces the last good dashboard.

Each trade row must carry the stock symbol. Consolidated exports use one strategy/run folder and one table per entity (`trades`, `daily`, `stocks`, `regimes`), not one report tree per symbol.

## Required scenario semantics

Primary finite-capital scenario:

- starting cash: INR 1,600,000
- fixed ticket: INR 200,000
- maximum open positions: 8
- a new position cannot open until cash and a slot are available
- signals rejected for lack of cash/slots are counted explicitly
- positive realized net P&L reserves 35% as the user-requested tax assumption
- only after-tax proceeds return to available cash and can compound
- losses receive no synthetic tax credit

The UI shows pre-tax net P&L, tax reserve and after-tax net P&L separately. This 35% value is a configurable analytical assumption, not a statement of tax law.

The unlimited-capital scenario accepts all otherwise valid signals, records deployed notional and is not directly comparable as a return-on-INR portfolio unless a normalization rule is displayed.

## Benchmarks and market regimes

Primary performance comparison is a normalized NIFTY 50 price curve over the exact scenario dates. Store final benchmark value and excess-over-benchmark alongside the strategy curve. An FD/cash curve may remain a secondary capital-preservation reference but must not be labelled as NIFTY performance.

The worker derives point-in-time daily regimes from NIFTY 50 and India VIX:

- `Shock`: absolute NIFTY daily return at least 1.75%, or India VIX daily jump at least 15%
- `Volatile`: VIX at or above its trailing 75th percentile
- `Rising`: NIFTY above its 20- and 50-day averages with positive 20-day return
- `Falling`: NIFTY below its 20- and 50-day averages with negative 20-day return
- `Neutral`: all other observations

No future VIX percentile, moving average or market close may influence an earlier decision. Rankings must show sample size, net P&L, after-tax P&L, win rate and drawdown per regime; suppress or flag tiny samples rather than declaring a winner.

## Existing dashboard modules

Routes are registered in `apps/web/src/App.tsx` and visible navigation in `components/chrome/AppShell.tsx`:

- `/backtesting` overview and latest run
- `/backtesting/strategies` strategy leaderboard
- `/backtesting/portfolio` finite/unlimited portfolio outcomes
- `/backtesting/regimes` NIFTY/VIX regime performance
- `/backtesting/stocks` symbol suitability
- `/backtesting/daily-summary` all-day activity
- `/backtesting/compare` cross-strategy comparison
- `/backtesting/runs` run monitor/audit
- `/backtesting/strategies/:strategyId` detailed rules, trades, curves and heatmaps

Shared selectors, chart wrappers, currency/percent formatting and scenario controls belong in `pages/BacktestingChrome.tsx`. API contracts belong in `apps/web/src/lib/types.ts`, fetchers in `lib/api.ts`, and React Query hooks in `lib/hooks.ts`. A page should compose these modules instead of copying query or chart logic.

## Add a backtesting dashboard

1. Define the question and exact grain: run, strategy, trade, day, symbol or regime.
2. Add/extend an `nse_app` mart in `050_backtesting_precompute.sql`; include batch and version identity.
3. Populate it in `backtesting.py` and validate expected row counts before publication.
4. Read only the latest successful published batch in `apps/api/src/lib/backtestingPublished.ts`.
5. Add a typed `/v1/backtesting/*` response and API contract test.
6. Add the TypeScript contract, fetcher and query hook.
7. Compose a page from existing primitives; register the route and intentional navigation visibility.
8. Add loading, empty, partial-data and error states. Show generated-at and actual coverage dates.
9. Build API and web, run focused worker/API tests, then smoke the route against a published batch.
10. Update this file, `product-surface-map.md` and `AGENT_HANDOFF.md`.

For very large time series, publish daily/monthly downsampled points for interactive ECharts. Generate immutable Matplotlib PNG/SVG artifacts for dense audit plots, store URI plus SHA-256 in the manifest, and let the detail page open the full image. The raw trade table remains downloadable/filterable and is the source behind every plotted aggregate.

Published database results are also mirrored to host-persistent per-strategy CSV packages by `services/nse_analytics_worker/app/backtesting_csv.py`. CSV is a review/processing artifact, not a competing source of truth. Each batch contains one folder per strategy with summary, trade, open-position, equity, stock, regime, skipped-signal, validation, and checksum-manifest files. See `docs/backtesting-csv/README.md`.

## Add a strategy

1. Create a stable registry entry and immutable versioned config containing indicators, completed-bar timing, entry/exit fill rules, costs, universe and data requirements.
2. Add a pure signal function; do not put portfolio capital allocation inside the signal.
3. Add golden-vector tests for look-ahead, warm-up, next-bar execution, target-touch and forced-exit semantics.
4. Run one symbol and a short date window. Verify trades manually against source bars.
5. Run both `capital_16l` and `no_capital_limit`; publish rejected-signal reasons.
6. Require full requested-vs-actual coverage and missing-bar gates before a run may say `SUCCESS`.
7. Publish through the uniform adapter. Only quality-passed runs enter leaderboards.

## Training dashboard extension

A training dashboard should be a separate module, not mixed into result ranking. Persist dataset snapshot, feature version, train/validation/test periods, walk-forward folds, model/config hash, metrics, calibration, drift and artifact manifest. Link a promoted model version to a backtest strategy version. Never rank an in-sample training metric beside out-of-sample after-cost portfolio P&L.

Recommended routes are `/training`, `/training/runs`, `/training/models` and `/training/models/:modelId`, following the same API/types/hooks/page pattern and latest-good publication rule.

## Derivatives and futures

`catalog.option_contract_observation` owns point-in-time expiry, strike, right and lot size. `research.option_trade_result` owns evaluated option trades. Use `platform/nifty_stratlab/config/research/nifty_atm_long_straddle_v1.yml` for the requested ATM call-plus-put experiment and run `tools/audit_derivatives_readiness.py` before any evaluation.

Historical bid/ask or timestamped premiums, effective-dated contract masters and fees are mandatory. A current broker lot-size page can help locate present contract information but cannot be applied backwards. Black-Scholes or interpolated premiums may be labelled a sensitivity study; they must never be published as an observed historical result or leaderboard entry.

Futures need the same point-in-time discipline: instrument identity, expiry, lot size, roll rule, basis, spread, margin and costs. Add them to governed research tables first and publish only after parity/coverage gates pass.

## Acceptance and review gates

The TEST-STRAT-3 review established mandatory corrections for any promoted RSI run:

- actual coverage must equal requested coverage or status is `PARTIAL`/`BLOCKED`
- a 100-symbol batch is one chronological portfolio replay, not 100 independent INR 2 lakh accounts
- run IDs and trade IDs are collision-resistant and stable
- target-hit means intrabar/observed touch under an explicit path rule, not final P&L above a threshold
- forced exits, costs and missing bars are visible in summary and drill-down
- canonical JSON/CSV/manifest paths exist and hashes/row counts reconcile
- no placeholder chart or P-diagram may be represented as evidence

## Operations

Focused verification:

```bash
docker run --rm \
  -v /home/novius2/trading-stack/services/nse_analytics_worker:/app \
  -w /app trading-stack-nse-analytics-worker:latest \
  python -m unittest -v tests.test_backtesting_contracts

cd /home/novius2/trading-stack/neon-stock-terminal
docker build --target builder -t n50-dashboard-dashboard-work-test .

cd /home/novius2/trading-stack/platform/nifty_stratlab
./tools/audit_derivatives_readiness.py --json
```

Do not relaunch a dashboard against an empty database. Apply owned migrations, load or ingest data, publish one successful backtesting batch, verify row counts and API health, and only then rebuild/restart the stage service according to `docs/n50-stage-prod-hosting.md`. Production promotion follows stage smoke tests and rollback preparation.
