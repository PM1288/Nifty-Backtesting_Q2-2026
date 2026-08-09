# Testing

`scripts/test.sh` runs Ruff, mypy and pytest with a real disposable PostgreSQL DSN. The suite covers Decimal P&L/tax, long and short ladders, multi-leg groups, state invariants, JSON contracts, idempotent API behaviour, migration, actual fill/close versus continued analytical observation, HMAC/Basic webhook delivery, and daily/weekly summaries. SQLite is not used.
