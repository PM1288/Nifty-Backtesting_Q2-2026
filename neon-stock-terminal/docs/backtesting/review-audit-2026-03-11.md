# Backtesting Review Audit - 2026-03-11

## Executive Summary

Backtesting is materially stronger after this hardening pass. The worker now publishes successfully against actual local data, the API serves published snapshots instead of silently relying on seeded payloads, all audited Backtesting routes render cleanly across desktop/tablet/mobile viewports, and cross-page scenario numbers reconcile for the primary portfolio scenario.

The built application also passed a separate production-like smoke run locally using:

- built API server
- `AUTH_REQUIRED=1`
- built web preview
- guest-readable `GET /v1/backtesting/*` access

Final signoff status: `Ready`

Reason:

- no known `P0` correctness issue remains
- no known `P0/P1` cross-page data mismatch remains in the audited scope
- a real compose-deployed publish + nginx smoke was completed in this environment

## System Understanding

### Module Scope

The Backtesting workspace is mounted under the existing N50 shell and includes:

- `/backtesting`
- `/backtesting/strategies`
- `/backtesting/strategies/:strategyId`
- `/backtesting/results`
- `/backtesting/regimes`
- `/backtesting/stocks`
- `/backtesting/daily-summary`
- `/backtesting/compare`
- `/backtesting/runs`

### Active Strategies

1. `Fast Oversold Rebound`
   - strategy id: `rsi30_willr80_closegtprev_tp125`
   - archetype: `mean_reversion_fast`
2. `Confirmed Oversold Recovery`
   - strategy id: `rsi_reclaim30_willr_reclaim80_greenclose_tp200_sl200_max10`
   - archetype: `mean_reversion_confirmed`
3. `MACD Trend Continuation`
   - strategy id: `macd_bullcross_above50dma_rsi55to70_tp400_sl300_max20`
   - archetype: `trend_continuation`

### Scenario Axes

- universe modes:
  - `nifty_100`
  - `single_stock`
- capital modes:
  - `no_capital_limit`
  - `capital_10l`
  - `capital_20l`
  - `capital_50l`
- benchmark modes:
  - `finite_fd`
  - `normalized_fd`

### Precompute and Serving Model

- worker engine: `services/nse_analytics_worker/app/backtesting.py`
- schema: `services/nse_analytics_worker/sql/050_backtesting_precompute.sql`
- API published readers: `apps/api/src/lib/backtestingPublished.ts`
- API routes: `apps/api/src/routes/backtesting.ts`
- snapshot cache wrapper: `apps/api/src/lib/dashboardSnapshots.ts`

Implemented layered model verified in code and database:

1. feature layer
2. signal candidate layer
3. trade template layer
4. portfolio replay layer
5. summary marts

### Fee Engine Reuse

Backtesting uses the same delivery-equity charge model path reused from the simulator logic, rather than maintaining a separate fee engine.

## Review Scope

- Backtesting docs review
- worker publish validation against local database data
- API contract validation
- cross-page scenario consistency checks
- invariants and accounting checks
- sample trade walkthroughs
- responsive browser audit with screenshots
- route error/console audit
- performance timing spot-checks
- auth/fallback/observability hardening

## Baseline Health

### Build and Runtime

Validated:

- `python -m py_compile services/nse_analytics_worker/app/backtesting.py services/nse_analytics_worker/app/refresh.py services/nse_analytics_worker/app/cli.py`
- `corepack pnpm --filter @app/web typecheck`
- `corepack pnpm --filter @app/api typecheck`

Local stack used for review:

- web: `http://localhost:5175/n50/`
- api: `http://localhost:18088`
- auth disabled during browser audit to validate public surface behavior end to end

### Published Snapshot Evidence

The batch publish succeeded against actual local DB data:

- initial audited publish: batch `6`
- rerun-safe publish after fix: batch `9`
- `backtesting_data_as_of_date = 2026-03-10`
- `backtesting_strategy_versions = 3`
- `backtesting_compare_strategy_count = 3`

Published rows existed in:

- `backtest_feature_daily`
- `backtest_signal_candidate`
- `backtest_trade_template`
- `backtest_trade_log`
- `backtest_open_position`
- `backtest_daily_equity`
- `backtest_strategy_summary_mart`
- `backtest_stock_summary_mart`
- `backtest_regime_summary_mart`
- `backtest_compare_summary_mart`
- `backtest_daily_summary_mart`

API evidence:

- `GET /v1/backtesting/overview`
  - `200 OK`
  - `X-Snapshot-Source: db`
  - `X-Snapshot-Status: hit`
- `GET /v1/backtesting/compare`
  - returned 3 strategy rows from published compare marts

## Route and Visual Validation

### Viewport Matrix

Audited with browser-backed screenshots at:

- `1920x1080`
- `1366x768`
- `768x1024`
- `390x844`

### Route Coverage

Audited routes:

1. `/backtesting`
2. `/backtesting/strategies`
3. `/backtesting/strategies/rsi30_willr80_closegtprev_tp125`
4. `/backtesting/strategies/rsi_reclaim30_willr_reclaim80_greenclose_tp200_sl200_max10`
5. `/backtesting/strategies/macd_bullcross_above50dma_rsi55to70_tp400_sl300_max20`
6. `/backtesting/results`
7. `/backtesting/regimes`
8. `/backtesting/stocks`
9. `/backtesting/daily-summary`
10. `/backtesting/compare`
11. `/backtesting/runs`

### Result

Post-fix browser sweep:

- 44/44 route-viewport captures passed
- console errors: `0`
- page errors: `0`
- request failures: `0`

Artifacts:

- route report: [route-audit.md](/C:/Github_sync/trading-stack/artifacts/backtesting-review/2026-03-11/route-audit.md)
- route JSON: [route-audit.json](/C:/Github_sync/trading-stack/artifacts/backtesting-review/2026-03-11/route-audit.json)
- screenshots: [artifacts/backtesting-review/2026-03-11](/C:/Github_sync/trading-stack/artifacts/backtesting-review/2026-03-11)
- production-like built-app smoke: [prod-smoke](/C:/Github_sync/trading-stack/artifacts/backtesting-review/2026-03-11/prod-smoke)
- compose-deployed nginx smoke: [deployed-nginx-smoke](/C:/Github_sync/trading-stack/artifacts/backtesting-review/2026-03-11/deployed-nginx-smoke)

## Functional Filter Matrix

Validated scenario combinations included:

- each of the 3 strategies in `nifty_100`
- capital modes:
  - `no_capital_limit`
  - `capital_10l`
  - `capital_20l`
  - `capital_50l`
- `single_stock` scenarios present across all 3 strategies and 100 symbols

Observed behavior:

- compare page populated with all 3 strategies
- regime page compared all 3 strategies side by side
- stock page loaded strategy-scoped stock rows
- detail/results pages updated scenario payloads correctly
- no stale filter leakage or broken skeleton state was observed in the audited flows

## Data Correctness and Invariants

Validated directly against published batch `6` for `nifty_100:capital_10l` and supporting tables.

### Accounting Invariants

Verified:

- `current_equity = available_cash + market_value`
- latest `backtest_daily_equity.total_equity` matches `strategy_summary_mart.summary.currentValue`
- `realizedPnl` matches closed-trade `net_pnl` aggregation
- `unrealizedPnl` matches open-position aggregation
- `openPositions` matches open-position row count
- `closedTradeCount` matches closed trade row count
- win rate is based on closed trades only
- FD benchmark summary matches latest benchmark curve value

### Trade / Signal Reconciliation

Verified:

- `candidate_count = accepted_trades_plus_open_positions + skipped_trades`
- no cash-based skips occur in `no_capital_limit`
- finite-capital runs never produced negative cash

### Universe and Timing Safety

Verified:

- no Nifty, Bank Nifty, India VIX, or similar index instruments appeared in trade logs
- single-stock scenarios only contained the selected stock
- `entry_date` was never before or equal to `signal_date`
- `exit_date` was never before `entry_date`
- negative `holding_days` were absent
- no validation failures remained in `backtest_run_validation`

### Important Accounting Note

`summary.totalCharges` is intentionally broader than closed-trade charges alone. It includes:

- closed-trade charges
- entry-side charges already embedded in still-open positions for the same scenario

That behavior is now documented in `assumptions.md`.

## Sample Trade Verification

Nine representative trades were walked through directly from feature-layer and trade-log evidence.

### Strategy 1

| Symbol | Signal Date | Entry Date | Exit Date | Exit Reason | Result |
| --- | --- | --- | --- | --- | --- |
| `TATASTEEL` | `2025-12-01` | `2025-12-02` | `2025-12-12` | `target_intraday_hit` | conditions, entry timing, and exit matched |
| `TMPV` | `2025-12-01` | `2025-12-02` | `2026-01-01` | `target_gap_open` | conditions, entry timing, and exit matched |
| `DLF` | `2025-12-04` | `2025-12-05` | `2025-12-05` | `target_intraday_hit` | conditions, entry timing, and exit matched |

### Strategy 2

| Symbol | Signal Date | Entry Date | Exit Date | Exit Reason | Result |
| --- | --- | --- | --- | --- | --- |
| `DLF` | `2025-12-05` | `2025-12-08` | `2025-12-08` | `stop_intraday_hit` | reclaim, stop logic, and trade output matched |
| `JINDALSTEL` | `2025-12-09` | `2025-12-10` | `2025-12-12` | `target_intraday_hit` | reclaim, target logic, and trade output matched |
| `ENRIN` | `2025-12-09` | `2025-12-10` | `2025-12-11` | `stop_gap_open` | reclaim, gap-stop logic, and trade output matched |

### Strategy 3

| Symbol | Signal Date | Entry Date | Exit Date | Exit Reason | Result |
| --- | --- | --- | --- | --- | --- |
| `HINDZINC` | `2026-01-20` | `2026-01-21` | `2026-01-22` | `stop_intraday_hit` | MACD cross, trend filter, and stop logic matched |
| `BEL` | `2026-01-22` | `2026-01-23` | `2026-01-27` | `macd_bearish_cross` | MACD exit-on-next-open logic matched |
| `BEL` | `2026-01-27` | `2026-01-28` | `2026-01-28` | `target_intraday_hit` | target logic and trade output matched |

## Cross-Page Consistency

Spot-checked on `rsi30_willr80_closegtprev_tp125` with scenario `nifty_100:capital_10l`.

The following matched across overview/detail/compare payloads where applicable:

- `asOfDate = 2026-03-10`
- `currentValue = 1012805.323`
- `winRatePct = 100`
- `maxDrawdownPct = -4.6302`
- `openPositions = 9`
- `totalCharges = 11705.73`

No misleading benchmark mismatch was found for the audited scenario.

## Performance Notes

Backtesting API reads were fast and snapshot-backed. Median response times recorded locally:

- overview: `0.0203s`
- strategy detail: `0.0266s`
- compare: `0.0989s`
- stocks: `0.1692s`
- regimes: `0.1012s`
- runs: `0.0815s`

Timing artifact:

- [api-timing-notes.md](/C:/Github_sync/trading-stack/artifacts/backtesting-review/2026-03-11/api-timing-notes.md)

Findings:

- no route triggered heavy recomputation on request
- the compare, stock, regime, and run pages remained within acceptable snapshot-read latency locally
- shared prefetch noise was reduced by removing unsupported background requests from the Backtesting path
- production web build still emits a chunk-size warning for the shared ECharts vendor bundle; this is a `P2` follow-up, not a release blocker for the audited Backtesting scope

## Accessibility and UX Notes

Validated or spot-checked:

- keyboard focus reaches primary shell and Backtesting navigation controls
- no keyboard trap was observed in the audited flows
- major mobile/desktop layout overlap issues were absent after rerun
- legends and footer/disclaimer did not overlap visible Backtesting chart areas in the captured routes

Important fixes applied:

- hook-order crashes removed on detail/results/compare pages
- browser console noise eliminated from dead background requests and non-actionable analytics logging
- local dev CORS behavior corrected so real-browser review can run against the API

## Observability and Operations

Validated:

- latest batch metadata visible in `/backtesting/runs`
- published batch id and counts visible from the database
- route response headers expose snapshot source/status metadata
- published-batch-only serving is enforced by default in the Backtesting API
- nginx-backed deployed route `http://localhost:19090/n50/v1/backtesting/overview` returned `X-Snapshot-Source: redis` and `X-Snapshot-Status: hit` after publish batch `9`

Operational hardening completed:

- Backtesting `GET` endpoints are guest-readable like the public analytics shell
- seeded fallback no longer masquerades as live production data unless explicitly enabled for local development

## Issue Summary

| ID | Severity | Area | Issue | Status |
| --- | --- | --- | --- | --- |
| BT-001 | P0 | Worker | publish crash caused by undefined batch metadata constant | Fixed |
| BT-002 | P1 | Worker | feature validation incorrectly failed on indicator warm-up rows | Fixed |
| BT-003 | P1 | API | local browser audit blocked by dev-origin CORS mismatch | Fixed |
| BT-004 | P0 | Web | hook-order route crashes on detail/results/compare | Fixed |
| BT-005 | P1 | Web/API | cross-origin `/api/v1` path shaping caused broken local API reads | Fixed |
| BT-006 | P1 | Web | unsupported shared prefetch calls and noisy telemetry created false console failures | Fixed |
| BT-007 | P1 | API/Auth | Backtesting guest-readable access inconsistent with public analytics shell | Fixed |
| BT-008 | P1 | API/Data | seeded fallback could silently materialize misleading snapshots | Fixed |
| BT-009 | P0 | Worker | repeat Backtesting publishes failed on duplicate `trade_template_id` | Fixed |

## What Was Fixed

- worker publish correctness
- warm-up-aware validation
- Backtesting route stability
- dev browser/API integration
- snapshot-serving truthfulness
- guest access policy for public Backtesting reads
- noisy request/telemetry cleanup
- audit packaging and documentation

## Remaining Risks

- broader non-Backtesting analytics endpoints removed from shared prefetch are still absent and should be handled separately if those pages are in release scope
- the production web build still carries a large shared `vendor-echarts` chunk and may benefit from later bundle splitting

## Artifacts

- screenshots and route report: [artifacts/backtesting-review/2026-03-11](/C:/Github_sync/trading-stack/artifacts/backtesting-review/2026-03-11)
- fix log: [review-fixes-2026-03-11.md](/C:/Github_sync/trading-stack/neon-stock-terminal/docs/backtesting/review-fixes-2026-03-11.md)

## Final Signoff

Decision: `Ready`

Release-hardening criteria met in the audited local environment:

- all major Backtesting routes load
- no major broken UI remains in the audited routes
- no known `P0` correctness issue remains
- compare works meaningfully with 3 strategies
- finite-capital accounting is validated
- no non-stock instrument is tradable in Backtesting
- no look-ahead bias evidence was found in audited trades
- summary endpoints read published precomputed data
- Playwright artifacts exist
- audit report and fix log exist
- built-app smoke with `AUTH_REQUIRED=1` also passed locally
- compose-deployed nginx smoke also passed after a real rerun-safe publish in this environment
