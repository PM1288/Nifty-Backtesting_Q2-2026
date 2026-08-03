# Operator and Low-Context Agent Runbook

## 1. Read first

```bash
cd /home/novius2/trading-stack
sed -n '1,260p' docs/nifty-stratlab/README.md
sed -n '1,320p' docs/nifty-stratlab/AGENT_HANDOFF.md
```

## 2. Run package tests and all phase smoke tests

```bash
cd /home/novius2/trading-stack
./scripts/nifty_stratlab_test.sh
```

## 3. Validate migrations only on the disposable database

```bash
cd /home/novius2/trading-stack
./scripts/nifty_stratlab_migrate_test.sh
```

The script applies migrations 014–019 twice to prove idempotence. Never set
`NIFTY_STRATLAB_TEST_DB=tradingdb`.

## 4. Inspect workbook structure without full processing

```bash
cd /home/novius2/trading-stack/platform/nifty_stratlab
. .venv/bin/activate
python tools/inspect_workbook.py \
  '/home/novius2/data/fii-dii-and-nifty-historical-study-july-2023/files/Indian Stock Market Chronicles FIIDII and Nifty Historical Study.xlsx' \
  --sample-rows 25
```

## 5. Run representative CSV qualification only

```bash
cd /home/novius2/trading-stack/platform/nifty_stratlab
. .venv/bin/activate
nifty-stratlab profile-csv \
  /home/novius2/data/nifty-50-minute-data/aaditya555/NIFTY50/RELIANCE.csv \
  --calendar-config config/market_rules.example.yml
```

Use a bounded copied sample for routine checks; the full 8.8 GB estate is not part
of this run.

## 6. Run one-symbol RSI 1-minute backtest

This requires one explicit CSV and will not scan other CSVs or Excel workbooks:

```bash
cd /home/novius2/trading-stack
platform/nifty_stratlab/.venv/bin/python \
  platform/nifty_stratlab/tools/run_rsi_intraday_backtest.py \
  --csv /absolute/path/to/ONE_SYMBOL.csv \
  --symbol SYMBOL \
  --start YYYY-MM-DD \
  --end YYYY-MM-DD \
  --output-dir platform/nifty_stratlab/outputs/rsi_run_name
```

The output contains `SUMMARY.md`, `summary.json`, trades, signals, equity curve,
skipped signals, `MANIFEST.json`, and a checksum-verified `research_pack.zip`.
Verify it with:

```bash
platform/nifty_stratlab/.venv/bin/python \
  platform/nifty_stratlab/tools/verify_rsi_backtest.py \
  platform/nifty_stratlab/outputs/rsi_run_name
```

## 7. Use the compose job

```bash
docker compose --env-file .env \
  -p trading-stack-novius2 \
  -f compose/compose.base.yml \
  -f compose/compose.jobs.yml \
  run --rm nifty-stratlab --help
```

## 8. Recovery

The trading-stack root has no Git metadata. Restore changed pre-existing files from:

```text
/home/novius2/backups/nifty-backtesting/trading-stack-pre-five-phase-20260802T141051Z/files/
```

New files can be disabled by removing the compose job and excluding migrations
014–019 from future deployment. Do not drop production schemas as a rollback.
