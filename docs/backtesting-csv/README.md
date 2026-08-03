# Per-strategy backtesting CSV exports

Backtesting remains governed by PostgreSQL. Every successful publish is also mirrored to a compact, host-persistent CSV package for independent review, spreadsheet use, Python/R processing, and reconciliation.

## Output layout

```text
services/nse_analytics_worker/runtime/exports/backtesting/
├── latest.csv
└── batch-<batch_run_id>/
    ├── batch_metadata.csv
    ├── batch_manifest.csv
    ├── all_strategies_summary.csv
    └── <strategy_id>/
        ├── strategy_summary.csv
        ├── trades.csv
        ├── open_positions.csv
        ├── daily_equity.csv
        ├── stock_summary.csv
        ├── regime_summary.csv
        ├── skipped_signals.csv
        ├── validation.csv
        └── manifest.csv
```

There is one folder per strategy, not one folder per stock or scenario. Each CSV contains all applicable scenarios and includes `batch_run_id`, `strategy_id`, `strategy_version_id`, and `scenario_key` wherever applicable. This makes files independently usable and safely concatenatable.

`strategy_summary.csv` flattens the published JSON summary into ordinary snake-case columns such as `current_value`, `realized_pnl`, `unrealized_pnl`, `total_return_pct`, and `max_drawdown_pct`. Detailed JSON audit cells in trade and validation files remain compact JSON strings.

## Automatic behavior

The worker runs the exporter after both `refresh-all` and `refresh-backtesting`. Configuration:

```text
BACKTEST_CSV_EXPORT_ENABLED=1
BACKTEST_CSV_EXPORT_DIR=/app/runtime/exports/backtesting
```

The Compose service mounts `/app/runtime/exports` to the host, so recreating the worker container does not remove exports. A batch is written to a staging directory and renamed only after all strategy files complete. Re-exporting the same published batch atomically replaces that batch directory.

## Manual commands

Export the latest published batch without running any backtest:

```bash
cd /home/novius2/trading-stack
docker compose -p trading-stack-novius2 -f docker-compose.yml exec -T \
  nse-analytics-worker python -m app.cli export-backtesting-csv
```

Export an explicit validated historical or current published batch:

```bash
docker compose -p trading-stack-novius2 -f docker-compose.yml exec -T \
  nse-analytics-worker python -m app.cli export-backtesting-csv \
  --batch-run-id 247
```

## Integrity and safety

- Every per-strategy `manifest.csv` records row count, byte size, and SHA-256 for each data CSV.
- Formula-like untrusted string cells are apostrophe-prefixed to reduce spreadsheet formula injection risk; numeric values retain their exact numeric text.
- Strategy directory names are sanitized and bounded.
- Generated CSVs are runtime data and deliberately excluded from Git. Code, contracts, tests, and this runbook are tracked.
- The exporter refuses failed, unvalidated, or unpublished batches. An explicitly selected superseded batch remains exportable for historical review.

## Batch 247 proof

The initial live export completed on 3 August 2026:

- batch: `247`
- strategies: `3`
- exported data rows: `252,753`
- manifest checksum failures: `0`
- host location: `/home/novius2/trading-stack/services/nse_analytics_worker/runtime/exports/backtesting/batch-247`
