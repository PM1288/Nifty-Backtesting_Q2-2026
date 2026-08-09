# NSE Analytics Worker

This service is the stack-native analytics backend for `trading-stack-n50-dashboard-1`.

It adapts the overlay analytics runtime into the current repo:

- reads raw data from `nse.*`
- writes compact analytics objects into `nse_app.*`
- records refresh jobs and quality checks
- does not expose a second dashboard shell

## Commands

Run migrations:

```bash
docker compose run --rm nse-analytics-worker python -m app.cli migrate
```

Refresh analytics tables and checks:

```bash
docker compose run --rm nse-analytics-worker python -m app.cli refresh-all
```

Run checks only:

```bash
docker compose run --rm nse-analytics-worker python -m app.cli run-checks
```

Check migration/readiness for the Strategy Testing Lab:

```bash
docker compose exec -T nse-analytics-worker \
  python -m app.cli health --require-strategy-lab
```

Run one queued Strategy Testing Lab request for diagnosis:

```bash
docker compose run --rm --no-deps nse-strategy-lab-worker \
  python -m app.cli strategy-lab-worker --once \
  --output-dir /app/runtime/exports/strategy-lab
```

The normal `nse-strategy-lab-worker` service continuously claims bounded runs
using PostgreSQL leases. It has no SmartAPI or broker-order dependency. One
consolidated `trades.csv` is written per run; stock, Nifty, India VIX and global
market regimes plus entry indicators are stored with each trade.

Export the latest published backtesting batch to per-strategy CSV folders without rerunning the backtest:

```bash
docker compose exec -T nse-analytics-worker \
  python -m app.cli export-backtesting-csv
```

Export a specific validated historical/current published batch or override the container output root:

```bash
python -m app.cli export-backtesting-csv \
  --batch-run-id 247 \
  --output-dir /app/runtime/exports/backtesting
```

`refresh-all` and `refresh-backtesting` automatically export CSV after a successful publish when `BACKTEST_CSV_EXPORT_ENABLED=1`, which is the default. The host-persistent output is `runtime/exports/backtesting`. See `docs/backtesting-csv/README.md` for layout and data contracts.

## Runtime behavior

When started through the main `docker-compose.yml`, the service:

1. applies analytics SQL migrations
2. compares raw `nse.fact_eod_prices` latest trade date to analytics latest trade date
3. runs `refresh-all` only when analytics is stale
4. repeats that check on a polling interval

This keeps analytics in sync with the ingestor without adding a separate UI runtime.
