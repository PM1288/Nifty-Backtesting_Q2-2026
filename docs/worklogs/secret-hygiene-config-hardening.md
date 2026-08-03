# Secret Hygiene, Unsafe Config Cleanup, and Production-Safe Defaults

## Objective

Remove tracked live-looking secrets and unsafe fallback defaults, make production startup fail fast when critical secrets are missing, and document required secret ownership and rotation steps.

## Repo facts verified

- `config/config.yaml` and `config.example.yaml` both contain live-looking SmartAPI and Postgres credentials.
- `services/nse_ingestor/.env` contains a tracked database URL with embedded credentials.
- `neon-stock-terminal/apps/api/src/auth/guard.ts` includes a hardcoded Firebase API key fallback.
- `neon-stock-terminal/apps/api/src/auth/session.ts` falls back to default session cookie names and allows in-memory fallback when Redis is unavailable.
- `neon-stock-terminal/apps/api/src/routes/feedback.ts` falls back to an ephemeral in-memory signing secret.
- `neon-stock-terminal/apps/api/src/routes/internal.ts` already disables snapshot refresh when the token is missing, but `docker-compose.yml` injects an unsafe default token.
- `docs/adr/` did not exist before this task.
- `npx` is available locally for the required Playwright smoke checks.

## Files inspected

- `README.md`
- `docs/stack-current.md`
- `docs/n50-stage-prod-hosting.md`
- `docker-compose.yml`
- `config/config.yaml`
- `config.example.yaml`
- `config/config-use-this.txt`
- `compose/grafana/provisioning/datasources/datasources.yaml`
- `services/nse_ingestor/.env`
- `services/nse_ingestor/README.md`
- `services/bff/src/index.ts`
- `neon-stock-terminal/apps/api/src/server.ts`
- `neon-stock-terminal/apps/api/src/auth/guard.ts`
- `neon-stock-terminal/apps/api/src/auth/session.ts`
- `neon-stock-terminal/apps/api/src/routes/feedback.ts`
- `neon-stock-terminal/apps/api/src/routes/internal.ts`
- `neon-stock-terminal/apps/api/src/lib/dashboardSnapshots.ts`
- `neon-stock-terminal/apps/api/.env.example`
- `neon-stock-terminal/apps/web/.env.example`
- `neon-stock-terminal/apps/web/src/lib/firebase.ts`
- `internal/config/config.go`
- `scripts/n50-stage-prod-common.ps1`
- `services/nse_orchestration_exports/src/nse_orchestration_exports/config.py`
- `services/nse_intraday_intelligence/src/nse_intraday_intelligence/config.py`
- `services/realtime-engine/app/config.py`
- `neon-stock-terminal/package.json`
- `neon-stock-terminal/apps/web/package.json`
- `neon-stock-terminal/apps/api/package.json`
- `C:/Users/Chiu/.codex/skills/playwright/SKILL.md`

## Plan

1. Sanitize tracked config and example files with explicit placeholder values.
2. Remove unsafe auth, feedback, and refresh-token fallbacks from the Node API.
3. Add production fail-fast validation for required secrets and production-safe Redis/session behavior.
4. Add security documentation and a lightweight secret-scan config.
5. Validate with targeted scans, boot-failure checks, and Playwright smoke on key routes.

## Changes made

- Sanitized tracked config and example files so they now carry placeholders instead of live-looking credentials or webhook endpoints:
  - `config/config.yaml`
  - `config.example.yaml`
  - `config/config-use-this.txt`
  - `.env`
  - `services/nse_ingestor/.env`
  - `compose/grafana/provisioning/datasources/datasources.yaml`
- Removed unsafe production fallback defaults from the Node API stack:
  - added `neon-stock-terminal/apps/api/src/lib/runtimeConfig.ts`
  - `neon-stock-terminal/apps/api/src/server.ts` now validates runtime secrets before Prisma starts
  - `neon-stock-terminal/apps/api/src/auth/guard.ts` no longer embeds a Firebase web API key
  - `neon-stock-terminal/apps/api/src/auth/session.ts` now refuses in-memory fallback for production auth-required deployments without Redis
  - `neon-stock-terminal/apps/api/src/routes/feedback.ts` no longer permits missing signing secrets in production
  - `neon-stock-terminal/apps/web/src/lib/firebase.ts` no longer embeds the Firebase web API key in the bundle
- Removed unsafe refresh-token defaults from operator paths:
  - `docker-compose.yml`
  - `scripts/n50-stage-prod-common.ps1`
- Tightened root Go config handling:
  - `internal/config/config.go` now uses env overrides for SmartAPI and Postgres credentials
  - removed hardcoded webhook URL defaults so operators must inject them explicitly
- Hardened adjacent auth/webhook defaults in the legacy BFF path:
  - `services/bff/src/index.ts`
- Added public-safe operator documentation and security decision records:
  - `docs/security/secrets-and-config.md`
  - `docs/adr/ADR-001-secret-hygiene-and-fail-fast-config.md`
  - `.gitleaks.toml`
- Added a minimal repo-local browser smoke harness:
  - `tools/playwright/package.json`
  - `tools/playwright/smoke.mjs`
  - `tools/playwright/README.md`

## Validation run

- `go test ./...` from repo root: passed.
- `corepack pnpm --dir .\neon-stock-terminal --filter @app/api typecheck`: failed, but on pre-existing Prisma and route typing issues outside this hardening scope.
- `rg -n "AIzaSy|master-post-request|digii4alerts|n50-internal-refresh-token|postgresql://[^\\s]+:[^@\\s]+@|bot[0-9]{8,}:[A-Za-z0-9_-]{20,}" .`: confirmed the targeted hardcoded secret values are gone from active config; remaining hits are generic env interpolation, docs, and older Python service defaults logged below.
- Production fail-fast simulation:
  - missing `FIREBASE_WEB_API_KEY` with `AUTH_REQUIRED=1`: API exited immediately with the new validation error.
  - missing `FEEDBACK_SIGNING_SECRET` in production: API exited immediately with the new validation error.
- Playwright harness validation:
  - `npm install` in `tools/playwright`: passed.
  - `npx playwright install chromium` in `tools/playwright`: passed.
  - `node tools/playwright/smoke.mjs` with `PLAYWRIGHT_BASE_URL=http://localhost:19090/n50`: passed after switching the harness from `networkidle` to a deterministic settle wait.
- Gateway health:
  - `http://localhost:19090/n50/health`: `200`
  - `http://localhost:19090/n50-stage/health`: `200`

## Screens reviewed

- Automated screenshots and metadata captured under `output/playwright/secret-hygiene-config-hardening-run2/` for desktop, laptop, tablet, and mobile on:
  - `/`
  - `/feedback`
  - `/analytics/stock/RELIANCE`
- Manual Playwright review screenshots captured under `output/playwright/secret-hygiene-config-hardening-manual/`:
  - `desktop-landing.png`
  - `mobile-feedback.png`
  - `tablet-analytics-stock.png`
- Visual review outcome:
  - no new overflow, clipping, or broken auth-state layout issues were introduced by the secret/config changes
  - current live pages still emit blocked analytics-script console errors for Matomo/Clarity on this machine
  - localized UI still contains some pre-existing mixed-language copy that is unrelated to this task

## Decisions made

- Security posture changes will be documented in a new ADR because the task tightens production startup requirements and removes permissive secret fallbacks.
- The new Playwright harness stays outside the frontend workspaces under `tools/playwright` so review tooling does not perturb the product build.
- Older Python service defaults using `postgres:postgres` are logged as follow-up instead of being broadened into this security pass because the active compose path already injects explicit DSNs.

## Risks / follow-ups

- Production deployment will require secret values to be present before restart once fail-fast validation is enabled.
- Root `.env` is now sanitized placeholder content. Any future local restart from the working tree needs valid local secret injection before use.
- Older Python service configs and README examples still include generic `postgres:postgres` development defaults:
  - `services/nse_orchestration_exports/src/nse_orchestration_exports/config.py`
  - `services/nse_intraday_intelligence/src/nse_intraday_intelligence/config.py`
  - `services/realtime-engine/app/config.py`
  - `services/nse_ingestor/README.md`
- Live pages still log third-party analytics asset failures (`matomo.js`, Clarity) during local review.
- Localized stock/overview copy has some mixed-language strings that should be cleaned in a separate UI/content pass.

## Resume here next time

If this hardening needs to continue, address the remaining Python service DSN defaults and decide whether third-party analytics assets should be suppressed in local/stage review environments.
