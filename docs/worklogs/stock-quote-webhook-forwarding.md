# Stock quote webhook forwarding

## Outcome

The SmartAPI collector sends one normalized JSON batch of all successfully
collected Nifty LargeMidcap 250 equity quotes after each primary quote-snapshot
cycle. Derivatives and indices are not included in this webhook payload.

The database write remains authoritative. A webhook timeout or failure is
logged as `stock_webhook_failed` and does not stop quote persistence or the
collector. Successful deliveries are logged as `stock_webhook_sent` with the
run ID, stock count, HTTP status, and attempt number; the URL is never logged.

## Runtime configuration

Keep the live endpoint only in ignored `.env.collector.runtime`:

```dotenv
STOCK_WEBHOOK_URL=https://example.invalid/hooks/replace-me
STOCK_WEBHOOK_ENABLED=true
```

Non-secret behaviour is configured under `stock_webhook` in
`config/config.yaml`: five-second timeout, two retries, and 500 ms incremental
retry backoff.

## Payload contract

Top-level fields are `event_type=stock_quote_snapshot`, `schema_version=1.0`,
unique `run_id`, UTC `collected_at`, `source=smartapi`, `market_session`,
`stock_count`, and `stocks`.

The endpoint is a Mattermost-compatible incoming webhook, so the request also
contains a required `text` field. It renders a compact, symbol-sorted table of
symbol, LTP, percentage change, and volume for all 250 stocks. The complete
machine-readable quote objects remain present in `stocks`.

Each stock includes its symbol, trading symbol, exchange, SmartAPI token,
collection/exchange timestamps, OHLC/LTP, change, average price, volume,
last-trade quantity, buy/sell quantities, bid/ask, circuit limits, and 52-week
levels when supplied by SmartAPI. Stocks are sorted by symbol.

## Operator commands

```bash
cd /home/novius2/trading-stack
gofmt -w cmd/collector/stock_webhook.go cmd/collector/stock_webhook_test.go cmd/collector/tasks.go internal/config/config.go
go test ./cmd/collector ./internal/config
docker compose up -d --build --no-deps collector
docker compose ps collector
docker compose logs --since 5m collector | grep -E 'stock_webhook_(sent|failed)'
```

The primary snapshot interval is 60 seconds. Outside exchange hours the
collector may return the latest available SmartAPI snapshot; consumers must use
`market_session=false` plus exchange timestamps to distinguish it from a live
market quote.

## Live verification — 2026-08-08

The rebuilt `trading-stack-novius2-collector-1` container was healthy with zero
restarts. Two consecutive scheduled deliveries completed successfully:

- `2026-08-08T16:49:00Z`: 250 stocks, HTTP 200, first attempt.
- `2026-08-08T16:50:03Z`: 250 stocks, HTTP 200, first attempt.

Before adding the Mattermost `text` field, the endpoint returned HTTP 400. That
contract mismatch was corrected; no quote/database operation failed as a
result.
