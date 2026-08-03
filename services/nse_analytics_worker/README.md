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

## Runtime behavior

When started through the main `docker-compose.yml`, the service:

1. applies analytics SQL migrations
2. compares raw `nse.fact_eod_prices` latest trade date to analytics latest trade date
3. runs `refresh-all` only when analytics is stale
4. repeats that check on a polling interval

This keeps analytics in sync with the ingestor without adding a separate UI runtime.
