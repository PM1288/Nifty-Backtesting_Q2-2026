# Secrets and Config

This repo now keeps only placeholder or example-safe values in tracked config. Real secrets must be injected outside git.

## Required secrets by service

### Root compose and Go collector services

- `SMARTAPI_API_KEY`
  Source: Angel One SmartAPI application credentials.
  Used by: root Go collector stack via `internal/config/config.go`.
- `SMARTAPI_CLIENT_CODE`
  Source: Angel One SmartAPI account credentials.
  Used by: root Go collector stack via `internal/config/config.go`.
- `SMARTAPI_PASSWORD`
  Source: Angel One SmartAPI account credentials.
  Used by: root Go collector stack via env override.
  Note: this legacy env name maps to the SmartAPI login request field that now expects your account MPIN.
- `SMARTAPI_MPIN`
  Source: Angel One SmartAPI account credentials.
  Used by: root Go collector stack via env override.
  Note: preferred explicit alias for the same SmartAPI login field as `SMARTAPI_PASSWORD`.
- `SMARTAPI_TOTP_SECRET`
  Source: Angel One TOTP seed from the SmartAPI QR/setup URI.
  Used by: root Go collector stack via env override.
  Note: preferred for unattended collector startup because the collector can generate the current 6-digit code from it.
- `SMARTAPI_TOTP_CODE`
  Source: Angel One authenticator app current 6-digit TOTP value.
  Used by: root Go collector stack via env override.
  Note: use only for immediate manual login; the value expires quickly.
- `POSTGRES_PASSWORD`
  Source: operator-managed Postgres secret.
  Used by: compose services, Go collector stack, Grafana datasource example, and `services/nse_ingestor/.env`.

### N50 dashboard API and web app

- `FIREBASE_WEB_API_KEY`
  Source: Firebase project web config.
  Used by: `neon-stock-terminal/apps/api` for token verification and `neon-stock-terminal/apps/web` build/runtime auth config.
- `FEEDBACK_SIGNING_SECRET` / `N50_FEEDBACK_SIGNING_SECRET`
  Source: operator-generated random secret.
  Used by: feedback challenge signing in `neon-stock-terminal/apps/api/src/routes/feedback.ts`.
- `SNAPSHOT_REFRESH_TOKEN` / `N50_SNAPSHOT_REFRESH_TOKEN`
  Source: operator-generated random secret.
  Used by: internal snapshot refresh endpoint and refresh callers.
- `REDIS_URL` or `SESSION_REDIS_URL`
  Source: runtime service URL.
  Used by: N50 API session storage. Required when `AUTH_REQUIRED=1` in production.
- `RATE_LIMIT_REDIS_URL` or `REDIS_URL`
  Source: runtime service URL.
  Used by: shared Redis-backed rate limiting for login, signup, feedback, and internal refresh routes. Required in production.
- `N50_FEEDBACK_WEBHOOK_URL`
  Source: feedback delivery endpoint owned by product/ops.
  Used by: feedback webhook forwarding.

### Matomo

- `MATOMO_DB_PASSWORD`
  Source: operator-managed MariaDB secret.
  Used by: `matomo-db` and companion services.
- `MATOMO_DB_ROOT_PASSWORD`
  Source: operator-managed MariaDB root secret.
  Used by: `matomo-db`.
- `MATOMO_ADMIN_PASSWORD`
  Source: operator-managed admin credential.
  Used by: Matomo bootstrap/admin login.

### Optional integrations still present in tracked examples

- `GHCR_PAT`
  Source: GitHub Container Registry personal access token.
  Used by: `config/config-use-this.txt` example only.
- `SUPABASE_KEY`
  Source: Supabase service role key.
  Used by: `config/config-use-this.txt` example only.
- `TELEGRAM_BOT_TOKEN`
  Source: Telegram bot token.
  Used by: alerting examples and optional flows.
- `N8N_WEBHOOK_SECRET`
  Source: operator-generated shared secret.
  Used by: optional n8n integration examples.

## Config ownership

- Root `.env`
  Purpose: local compose/example operator config. Tracked only with placeholder-safe values.
- `.env.collector.runtime`
  Purpose: ignored collector-only runtime overlay for live SmartAPI credentials and any collector-specific overrides that must not be tracked.

- `STOCK_WEBHOOK_URL`
  Used by: SmartAPI collector equity quote-batch forwarding.
  Source: external workflow webhook URL.
  Storage: `.env.collector.runtime` only; do not commit the live URL.
- `config/config.yaml`
  Purpose: root Go collector config. Safe placeholders only; secrets should come from env overrides.
- `config.example.yaml`
  Purpose: public example for the same collector config.
- `services/nse_ingestor/.env`
  Purpose: service-local example values for the ingestor. Safe placeholders only.
- `neon-stock-terminal/apps/api/.env.example`
  Purpose: local API example config.
- `neon-stock-terminal/apps/web/.env.example`
  Purpose: local SPA build-time example config.

## Rotation checklist after merge

Rotate or verify these immediately if they were ever real in repo history:

- SmartAPI credentials
  This includes API key, client code, MPIN/password credential, TOTP seed/code, and any issued access/feed tokens.
- Postgres password used by compose or shared services
- feedback signing secret
- snapshot refresh token
- Matomo DB and admin passwords
- GitHub registry token
- Supabase service-role key
- Telegram bot token
- n8n/shared webhook secrets

## Operational notes

- Production boot now fails if critical N50 API secrets are missing.
- Production auth/session no longer silently falls back to in-memory storage when Redis is absent or unavailable.
- Production-sensitive API rate limits no longer use per-process memory counters.
- Development-only in-memory fallbacks now require explicit opt-in through `DEV_ALLOW_IN_MEMORY_SESSION_STORE=1` and `DEV_ALLOW_IN_MEMORY_RATE_LIMIT_STORE=1`.
- Feedback signing no longer uses an ephemeral secret in production.
- Snapshot refresh automation must provide `N50_SNAPSHOT_REFRESH_TOKEN`; there is no built-in default token anymore.
- The API now exposes Redis dependency readiness via `GET /health` and `GET /ready`.
- The API no longer applies startup performance DDL unless `N50_API_ALLOW_RUNTIME_PERF_DDL=1` is set explicitly for a controlled bootstrap window.
