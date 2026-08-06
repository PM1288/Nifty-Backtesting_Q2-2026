# Strategy Evaluation Rules of Engagement — Integration Guide

## Outcome

Rules document `NIFTY-SEROE-V1.0` is implemented as a fail-closed evaluation layer. It does not rewrite canonical backtest facts and it does not place broker orders.

The central behavioral correction is deliberate: a strategy is not successful merely because price eventually touches a target. A target-only run with no loss boundary or timeout is an `OPPORTUNITY_SCAN`, is rated `NR`, and cannot appear in a deployable leaderboard.

## Source review

The supplied package contains one canonical Markdown implementation prompt, one byte-identical DOCX, one ZIP containing the same two documents plus README/checksums, and one historical event/regime workbook. ZIP integrity passed. Standalone and ZIP copies have identical SHA-256 hashes.

The event workbook has nine source sheets, 52 unique events, 208 event-window rows and 30 registered sources. Its 24-sheet language describes the required generated strategy-evaluation workbook, not the source workbook. Source formulas distinguish contained, transition, directional, major-shock and extreme zones and multi-horizon bullish/bearish/sideways/transition conditions.

## Database design

`db/sql/020_strategy_evaluation_roe.sql` creates the additive `strategy_eval` schema:

- policy and lineage: `evaluation_policy`, `artifact_manifest`;
- historical context: `market_event`, `event_window`, `source_register`;
- point-in-time daily context: `market_regime_daily` for `INDEX` and `STOCK`;
- evaluation: `run_evaluation`, `period_metric`, `slice_metric`, `strategy_score_dimension`, `strategy_suitability`;
- path evidence: `trade_path_summary`, `trade_target_event`, `trade_adverse_event`, `trade_context_snapshot`;
- governance: `no_trade_rule`, `comparison_run`.

The schema references `nse_app.backtest_run` and `nse_app.backtest_trade_log`; existing facts remain authoritative.

## Regime rules

Returns are calculated from observations available through that trading date. No future row is used to label the current row.

| Horizon | Upward | Downward | Sideways core | Otherwise |
| --- | ---: | ---: | ---: | --- |
| 1 session | at least +1.0% | at most -1.0% | absolute return at most 0.5% | Transition |
| 5 sessions | at least +2.5% | at most -2.5% | absolute return at most 1.25% | Transition |
| 21 sessions | at least +5.0% | at most -5.0% | absolute return at most 2.5% | Transition |
| 63 sessions | at least +10.0% | at most -10.0% | absolute return at most 5.0% | Transition |

Primary trend uses 21 sessions, then 5, then 1 only where a longer horizon is unavailable. Stock and NIFTY 50 labels are stored separately. Twenty-session realized volatility and same-date India VIX levels form an explicit market zone; missing VIX remains `NOT_AVAILABLE`.

Historical event outcomes are never silently used as entry features. The source workbook is retrospective and its current review states mean all 52 events are stored with `point_in_time_eligible=false`. Analysts may slice results by those events, but the evaluator will not claim they were known at trade time.

## Rankability gates

Each validation dimension retains its own `PASS`, `WARN`, `FAIL` or `NOT_ASSESSED` state. Current hard checks cover pre-registration, point-in-time universe, loss exit, timeout, complete paths, finite capital, open-position valuation, sample size, effective-dated costs, out-of-sample evidence and independent reproduction.

Any failed hard gate yields `NOT_RANKABLE`, a null score and rating `NR`. This prevents high return or win rate from hiding incomplete trade paths, survivor bias or omitted losses.

## UI story

The strategy-detail page now leads with:

1. research classification and policy version;
2. rankability, rating and overall validation state;
3. every mandatory gate and its reason;
4. `GOOD WHEN`, `AVOID WHEN`, and `WATCH / UNKNOWN` slices;
5. independent stock trend, NIFTY trend, stock/NIFTY matrix and India VIX regimes;
6. the existing portfolio, P&L, tax reserve, drawdown, equity, trades and assumptions.

If no governed evaluation exists for the selected scenario, the UI fails closed and displays “evaluation pending / not rankable.”

## Current live coverage and limitations

On 6 August 2026 the live ingestion produced 19,730 regime rows: NIFTY 50, Bank NIFTY and India VIX from 8 March 2021 through 5 August 2026, plus 100 stock symbols from 10 November 2025 through 5 August 2026 for the latest published backtest batch.

The historical event ledger spans 29 February 2016 through 4 August 2026, but it is event context rather than continuous price coverage. The implementation does not claim ten-year daily regime coverage where the live DB does not have it. Longer CSV replays can use the same policy module, but must persist aligned stock/NIFTY series and point-in-time membership before becoming rankable.

The current published runs do not have complete per-trade MFE, MAE and underwater-time facts, effective-dated cost certification, untouched out-of-sample evidence or independent reproduction. Scores correctly remain blank.

## Tests and operation

The importer supports `--dry-run`, uses one transaction, validates all required workbook sheets, is idempotent and records source hashes. The exporter creates the exact 24 required sheets, frozen headers, filters, typed cells, a monthly chart, CSV evidence, Markdown/JSON summaries and SHA-256 checksums.

See `neon-stock-terminal/docs/backtesting/runbook.md` for copy-paste commands.
