# UI Comparison Acceptance

## Routes

- `/dashboard/strategy-lab/suites/nifty_intraday_baseline_comparison_v1`
- `/dashboard/strategy-lab/comparisons/<comparison_run_id>`
- `/dashboard/strategy-lab/strategies/<strategy_version_id>`
- `/dashboard/strategy-lab/runs/<run_id>`
- `/dashboard/strategy-lab/runs/<run_id>/trades/<trade_id>`
- `/dashboard/p-diagram?mode=HISTORICAL&runId=<run_id>&tradeId=<trade_id>`

## Mandatory page content

1. Compatibility banner and compatibility-hash details.
2. Data snapshot, universe, calendar, cost, execution and capital identities.
3. Strategy cards including control/candidate role and research status.
4. Net P&L, charges, trade count, target-hit rate, win rate, profit factor and drawdown.
5. Overlaid net-equity and drawdown charts with selectable strategies.
6. Symbol, sector, month, entry-time and regime breakdowns.
7. Run time, bars processed, throughput, workers, memory, checkpoint and resume counts.
8. Data-quality skips, ambiguous paths, failed fills and warnings.
9. Trade table with links to individual evidence and historical P-Diagram.
10. Export links for JSON, CSV, Parquet and HTML evidence packs.
11. Zero-trade strategies shown explicitly; never silently omitted.
12. A clear `REFERENCE / NOT VALIDATED` label until walk-forward and holdout evidence exists.

The page must not rank incompatible runs or label an uncalibrated score as probability.
