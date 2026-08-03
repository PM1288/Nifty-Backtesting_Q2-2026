# Operator Scripts

## RSI15 / Daily40

`run_rsi15_daily40.sh` is the accepted bounded operator entry point.

```bash
./scripts/run_rsi15_daily40.sh check
./scripts/run_rsi15_daily40.sh sample
./scripts/run_rsi15_daily40.sh reliance-small
./scripts/run_rsi15_daily40.sh last
```

For a chosen period, always name the symbol, dates, and one source CSV:

```bash
./scripts/run_rsi15_daily40.sh run SYMBOL YYYY-MM-DD YYYY-MM-DD /absolute/path.csv
```

To process every CSV in an explicitly named directory and create one consolidated
strategy folder:

```bash
./scripts/run_rsi15_daily40.sh all /absolute/data/root YYYY-MM-DD YYYY-MM-DD
```

The consolidated folder contains one `report.html`, `summary_by_symbol.csv`,
`trades.csv`, `signals.csv`, `equity_curve.csv`, `status.tsv`, and supporting
metadata/log files. Every analysis row is tagged with `strategy` and `symbol`.
Per-symbol artifacts exist only in a temporary directory while the batch runs.

The wrapper does not write to PostgreSQL or place broker orders. Output is under
`artifacts/backtests/`. Open `report.html` first.

Environment overrides are `NIFTY_STRATLAB_PYTHON`, `RSI15_STARTER_ZIP`,
`RSI15_MINUTE_CSV`, and `NIFTY_ARTIFACT_ROOT`. Do not put credentials in them.
