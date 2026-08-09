# Environment-variable inventory

Captured: 2026-08-09 UTC. Values are intentionally omitted.

## Source files

- `/home/novius2/trading-stack/.env`: deployed secret/config source; ignored
  and not committed.
- repository `.env.example`: currently contains no simple `NAME=value` entries
  detected by the inventory command; template quality requires Phase 1 review.
- `.env.collector.runtime`: documented ignored SmartAPI-specific overlay; its
  contents were not printed.

## Variable groups detected by name

- PostgreSQL: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `PG_DSN`.
- SmartAPI: `SMARTAPI_API_KEY`, `SMARTAPI_CLIENT_CODE`,
  `SMARTAPI_PASSWORD`, `SMARTAPI_TOTP_SECRET`.
- Paper/webhooks: `N8N_USER`, `N8N_PASSWORD`, `N8N_WEBHOOK_SECRET`.
- Authentication: Firebase/JWT and local-development authentication variables.
- N50 UI/telemetry: authentication, feedback, Discord, Clarity and optional
  Matomo variables.
- Schedulers: multiple `CRON_*` and `JOB_CMD_*` variables.
- NSE ingestion and option-chain: `NSE_*` and `NIFTY100_DISCLOSURES_*` groups.
- Runtime: host/port, log level, timezone, retention and output locations.

The deployed file contains sensitive names and values and must remain outside
Git. Phase 1 must define typed ownership and precedence without copying values
into reports, logs or browser bundles.
