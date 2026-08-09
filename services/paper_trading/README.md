# Universal paper-trading service

This is a PAPER-only FastAPI/PostgreSQL service shared by OIIS and future strategy containers. It accepts versioned trade intents, fills from `public.bars_1m`, preserves actual execution separately from independent analytical ladders and 5/30-session observation, handles stock and multi-leg option groups, and delivers signed CloudEvents to n8n through a transactional outbox.

## Add a strategy

1. Register no code in this service; give the strategy container a unique `strategy_id`, semantic `strategy_version`, stable `signal_id`, service token and idempotency key.
2. POST a payload matching `schemas/inbound/trade-intent-v1.schema.json` to `/api/v1/trade-intents`. See `examples/requests/01_oiis_long_stock.json`.
3. Submit all option legs atomically where possible. For incremental assembly, create `/api/v1/trade-groups/building`, add each leg at `/{id}/legs`, then commit at `/{id}/commit`.
4. Send actual exits through `/{id}/close-intents`. Analytical target hits never close the position unless the execution policy explicitly says so.
5. Query the trade group or the reporting views listed in `docs/database-schema.md`. Every logical event and n8n attempt is durable in PostgreSQL.

Start and test commands are in `docs/operations-runbook.md`. Configuration is documented in `.env.example`; never commit real values.
