# Backtesting Runbook

## Daily batch intent

The v1 production model is a full rebuild of the last three years for all active strategies after EOD data load.

This is intentionally correctness-first.

Backtesting API routes should only serve the latest published batch in normal operation. Seeded fallback is for explicit local development only via `BACKTESTING_ALLOW_SEEDED_FALLBACK=1`.

## Batch sequence

1. confirm EOD / bhav copy ingestion is complete
2. build the feature layer from `security_daily_features` and market regime inputs
3. build daily regime tags
4. build signal candidates for every active strategy version
5. build unconstrained trade templates for every candidate
6. build benchmark FD curves
7. replay portfolio scenarios for:
   - `nifty_100`
   - `single_stock`
   - `no_capital_limit`
   - `10L`
   - `20L`
   - `50L`
8. build stock, regime, compare, and daily summary marts
9. validate all layers
10. publish atomically by flipping the `batch_run_audit.published_flag`
11. preserve last known good if validation fails
12. run the Rules-of-Engagement evaluator; never convert a failed validation into a score
13. export the governed 24-sheet evidence workbook plus CSV evidence and checksums

## Rules-of-Engagement classification

- A target-only or no-timeout simulation is always `OPPORTUNITY_SCAN` and `NOT_RANKABLE`.
- A stop-and-timeout simulation may be a true isolated or portfolio backtest, but remains `NOT_RANKABLE` while point-in-time universe, complete MFE/MAE paths, effective-dated costs, independent reproduction or out-of-sample evidence fail.
- Rating and composite score must remain `NR` / null while any hard gate fails.
- Stock and NIFTY regimes are independent classifications. Never substitute one for the other.
- Historical event outcomes and inferred post-event regimes are retrospective slices. They may be trading-time inputs only when `strategy_eval.market_event.point_in_time_eligible` is true.

Ingest/evaluate:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/platform/nifty_stratlab
DATABASE_URL='postgresql://trader:<password>@100.86.108.108:5432/tradingdb' \
  .venv/bin/python tools/import_strategy_evaluation_roe.py \
  --workbook /home/novius2/NIFTY50/Rules-of-engegemnt/Nifty_50_Event_Regime_Analysis_Master_2016_2026.xlsx \
  --rules /home/novius2/NIFTY50/Rules-of-engegemnt/CODEX_IMPLEMENT_STRATEGY_EVALUATION_RULES_OF_ENGAGEMENT_V1.0.md
```

Generate a review pack:

```bash
DATABASE_URL='postgresql://trader:<password>@100.86.108.108:5432/tradingdb' \
  .venv/bin/python tools/export_strategy_evaluation_pack.py \
  --strategy-id rsi30_willr80_closegtprev_tp125 \
  --scenario nifty_100:capital_16l \
  --output-dir outputs/evaluation_packs/rsi30_willr80_closegtprev_tp125/nifty_100_capital_16l
```

## Entry points

- worker implementation: `services/nse_analytics_worker/app/backtesting.py`
- refresh pipeline hook: `services/nse_analytics_worker/app/refresh.py`
- CLI command: `services/nse_analytics_worker/app/cli.py` via `refresh-backtesting`
- schema: `services/nse_analytics_worker/sql/050_backtesting_precompute.sql`

## Layer validations

### Feature layer

- no duplicate `(trade_date, symbol)` keys
- no null RSI / WILLR / MACD / SMA values after warm-up
- regime coverage present for the evidence window

Warm-up note:

- validation must ignore the initial lookback window where `RSI14`, `WILLR14`, `SMA50`, or MACD values are not expected yet

### Signal candidate layer

- `entry_date > signal_date`
- Strategy 2 requires reclaim from below to above thresholds
- Strategy 3 requires prior-day `MACD_line <= MACD_signal` and current-day `>`
- non-stock instruments excluded

### Trade template layer

- exit reason populated for closed templates
- hold days non-negative
- same-bar stop/target conflicts use conservative stop-first logic where applicable
- open templates marked to market using latest close only
- rerunning the batch must not fail on template primary-key collisions; template ids are expected to be batch-scoped

### Portfolio replay layer

- finite-capital runs never go negative cash
- no-capital-limit runs never skip for cash reasons
- accepted + skipped counts reconcile to template counts
- one open trade per symbol per scenario

### Summary marts

- compare mart contains all three v1 strategies
- regime mart exists for all strategies
- stock mart exists for all strategies
- benchmark rows exist for finite-capital runs

## Failure handling

If a batch fails:

- do not publish the new batch
- keep the previous published batch live
- write failure state to `batch_run_audit.error_message`
- inspect `backtest_run_validation` rows for the failed batch
- do not allow the API to silently materialize seeded snapshots in place of a missing published batch

## Rollback model

Rollback means not promoting the new batch.

Do not mutate historical rows in place.

## Incremental-friendly notes

v1 does full rebuilds, but the model stores:

- `strategy_version_hash`
- `feature_data_asof`
- `universe_hash`
- `run_scope_hash`

These should be used later for targeted recompute or partial invalidation.

## Manual checks after publish

- open `/backtesting`
- verify Strategy Library shows three strategies
- verify Strategy Detail can switch among all three strategies
- verify Compare shows three strategy rows at the default capital lens
- verify Regimes and Stocks show side-by-side strategy data
- verify Runs shows the latest batch metadata
- verify `GET /v1/backtesting/overview` returns `X-Snapshot-Source: db` or `redis`, not seeded fallback
