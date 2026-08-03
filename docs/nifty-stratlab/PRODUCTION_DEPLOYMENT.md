# Operational Research Deployment

## Active bounded result

- Database: `tradingdb`
- Publication key: `research:rsi_1m_daily45_v1:RELIANCE`
- Run: `run_73281f76f5923e14d832ea232650e66a`
- Status: `published`, validation `passed`
- Evidence: 150 signals, 75 trades, 24,375 equity points, 14 metrics
- Reconciliation failures: zero trade-accounting and zero equity-accounting failures
- Pack SHA-256: `f071297ec7319d5cc82afadfceee7957468133901b3e45998cc1149457bbaed5`
- Order authority: false

The run uses an explicit one-symbol universe, WARN-quality community minute data,
and a draft TEST_ONLY delivery fee schedule. It is operational research evidence,
not an approved profitability or broker-execution result.

## Run or repeat

```bash
cd /home/novius2/trading-stack
mkdir -p /home/novius2/artifacts/nifty-stratlab/runs
docker compose --env-file .env -p trading-stack-novius2 \
  -f compose/compose.base.yml -f compose/compose.jobs.yml \
  run --rm --entrypoint python nifty-stratlab \
  /app/tools/run_rsi_intraday_backtest.py \
  --csv /data/nifty-50-minute-data/aaditya555/NIFTY50/RELIANCE.csv \
  --symbol RELIANCE --start 2025-05-01 --end 2025-07-31 --warmup-days 90 \
  --output-dir /artifacts/runs/rsi_1m_daily45_reliance_20250501_20250731_governed \
  --persist-dsn-env TRADING_DATABASE_URL
```

An identical repeat reuses the immutable published run, does not increment its
shard attempt, and produces the same research-pack hash.

## Database-backed V2 commands

```bash
docker compose --env-file .env -p trading-stack-novius2 \
  -f compose/compose.base.yml -f compose/compose.jobs.yml run --rm nifty-stratlab \
  phase1 universe-as-of --dsn-env TRADING_DATABASE_URL \
  --dates 2026-01-09,2026-07-31 --output /artifacts/universe-as-of

docker compose --env-file .env -p trading-stack-novius2 \
  -f compose/compose.base.yml -f compose/compose.jobs.yml run --rm nifty-stratlab \
  phase3 status --run-id run_73281f76f5923e14d832ea232650e66a \
  --output /artifacts/run-status

docker compose --env-file .env -p trading-stack-novius2 \
  -f compose/compose.base.yml -f compose/compose.jobs.yml run --rm nifty-stratlab \
  phase5 coverage-audit --dsn-env TRADING_DATABASE_URL \
  --output /artifacts/coverage-audit
```
