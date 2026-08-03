# Make Auth Session and Rate Limiting Production-Safe with Redis-Backed Enforcement

## Objective

Replace ambiguous in-memory fallbacks for auth/session and production-sensitive rate limiting with explicit Redis-backed enforcement in production, while preserving local development through an explicit development-only fallback and adding Redis readiness visibility.

## Repo facts verified

- `neon-stock-terminal/apps/api/src/auth/session.ts` already supports Redis-backed sessions, but non-required Redis failures can still degrade into an in-memory map.
- `neon-stock-terminal/apps/api/src/security/rateLimit.ts` is currently process-local only and has no shared store support.
- `neon-stock-terminal/apps/api/src/routes/auth.ts` applies rate limiting only to login today.
- `neon-stock-terminal/apps/api/src/routes/feedback.ts` applies multiple process-local rate limiters to feedback challenge and submission flows.
- `neon-stock-terminal/apps/api/src/routes/health.ts` only reports whether Redis is configured, not whether it is connected, required, degraded, or fail-closed.
- `docker-compose.yml` provisions a shared `redis` service and already wires `REDIS_URL` differently for prod and stage dashboard services.
- Cookie-path isolation is already env-driven through `SESSION_COOKIE_PATH`, with separate prod and stage values in `docker-compose.yml`.
- The API package currently has no meaningful automated test harness for this area.
- The dashboard container build previously depended on Corepack downloading `pnpm` during image build, which made rebuilt-container validation sensitive to external registry/network instability.
- The remaining API typecheck error after the Redis refactor was isolated to an unreachable branch in `src/lib/redisBackedStore.ts`, not a broader architectural issue.

## Files inspected

- `neon-stock-terminal/apps/api/src/auth/session.ts`
- `neon-stock-terminal/apps/api/src/security/rateLimit.ts`
- `neon-stock-terminal/apps/api/src/routes/auth.ts`
- `neon-stock-terminal/apps/api/src/routes/feedback.ts`
- `neon-stock-terminal/apps/api/src/server.ts`
- `neon-stock-terminal/apps/api/src/lib/runtimeConfig.ts`
- `neon-stock-terminal/apps/api/src/auth/guard.ts`
- `neon-stock-terminal/apps/api/src/routes/health.ts`
- `neon-stock-terminal/apps/api/src/routes/index.ts`
- `neon-stock-terminal/apps/api/package.json`
- `neon-stock-terminal/apps/api/src/lib/redisBackedStore.ts`
- `neon-stock-terminal/package-lock.json`
- `neon-stock-terminal/Dockerfile`
- `docker-compose.yml`

## Plan

1. Add a shared Redis dependency module that centralizes environment selection, connection lifecycle, readiness state, and structured logging for session/rate-limit use cases.
2. Refactor session storage to use explicit store selection rules: Redis required in production auth mode, development-only memory fallback only when explicitly enabled, and fail-closed behavior for missing/unavailable Redis.
3. Refactor rate limiting to support Redis-backed counters for login, signup, feedback submission, and optional internal refresh routes, while keeping a clearly gated development fallback.
4. Expose Redis dependency readiness and failure state through health/readiness output and startup logs.
5. Add focused tests for store selection and failure behavior, then validate auth/session/feedback flows plus browser smoke.

## Changes made

- Added `neon-stock-terminal/apps/api/src/lib/serviceDependencyError.ts` so session and rate-limit dependencies can fail closed with explicit dependency names, status codes, and machine-readable error codes.
- Added `neon-stock-terminal/apps/api/src/lib/redisBackedStore.ts` to centralize Redis-backed store mode selection (`redis`, `memory`, `fail_closed`), structured logs, readiness state, and connection lifecycle for shared auth/session and rate-limit enforcement.
- Updated `neon-stock-terminal/apps/api/src/lib/runtimeConfig.ts` to make production requirements explicit:
  - session storage must resolve `SESSION_REDIS_URL` or `REDIS_URL` when auth is required in production
  - production rate limiting must resolve `RATE_LIMIT_REDIS_URL` or `REDIS_URL`
  - development-only in-memory fallbacks are now gated by `DEV_ALLOW_IN_MEMORY_SESSION_STORE=1` and `DEV_ALLOW_IN_MEMORY_RATE_LIMIT_STORE=1`
- Refactored `neon-stock-terminal/apps/api/src/auth/session.ts` to use the shared Redis dependency wrapper, expose session-store health, and fail closed on session reads/writes when Redis is required but unavailable instead of silently degrading to process-local memory.
- Updated `neon-stock-terminal/apps/api/src/auth/guard.ts` so request authentication exposes `ensureReady()` and `getHealth()` for startup/readiness integration.
- Replaced the process-local limiter implementation in `neon-stock-terminal/apps/api/src/security/rateLimit.ts` with a Redis-backed fixed-window counter for production-sensitive routes, with development-only explicit memory fallback and structured store-selection / Redis-error / fail-closed logging.
- Wired shared-store rate limiting into:
  - `neon-stock-terminal/apps/api/src/routes/auth.ts` for login and signup
  - `neon-stock-terminal/apps/api/src/routes/feedback.ts` for challenge and submission limits using the shared store
  - `neon-stock-terminal/apps/api/src/routes/internal.ts` for snapshot refresh limits
- Updated `neon-stock-terminal/apps/api/src/routes/health.ts` and `neon-stock-terminal/apps/api/src/routes/index.ts` to:
  - add `/ready`
  - report session-store and rate-limit-store readiness separately
  - mark readiness false when the database or either Redis-backed dependency is unavailable
- Updated `neon-stock-terminal/apps/api/src/server.ts` to require both auth/session and rate-limit stores to be ready before the API starts listening in production-like mode.
- Added focused API tests in:
  - `neon-stock-terminal/apps/api/src/lib/runtimeConfig.test.ts`
  - `neon-stock-terminal/apps/api/src/lib/redisBackedStore.test.ts`
- Updated supporting operator docs and config examples:
  - `neon-stock-terminal/apps/api/.env.example`
  - `neon-stock-terminal/apps/api/package.json`
  - `docs/security/secrets-and-config.md`
  - `docs/endpoints.md`
  - `docker-compose.yml` (Redis healthcheck plus `service_healthy` dependency for both dashboards)
- Updated `neon-stock-terminal/Dockerfile` to switch from `node:20-bookworm-slim` to `node:20-bookworm` and remove the brittle apt install step, because the fuller base image already includes the TLS/runtime pieces Prisma expects in this environment.
- Reworked `neon-stock-terminal/Dockerfile` to remove the Corepack dependency from image builds entirely:
  - build now uses the workspace `package-lock.json`
  - install now runs `npm ci --workspaces --include-workspace-root`
  - build steps now use npm workspace scripts for Prisma generate, API build, and web build
- Refreshed `neon-stock-terminal/package-lock.json` so containerized `npm ci` matches the current workspace dependency graph and no longer fails on missing web package entries.
- Updated `docker-compose.yml` to grant `network.host` build entitlement to the prod/stage dashboard image builds, so local rebuilds can use the host network path consistently when npm needs registry access.
- Removed the final API package typecheck blocker in `neon-stock-terminal/apps/api/src/lib/redisBackedStore.ts` by deleting an unreachable `memory` branch after the Redis readiness promise resolves.

## Validation run

- `corepack pnpm --dir neon-stock-terminal --filter @app/api test`
  - passed (`11` tests) covering production vs development store selection and Redis fail-closed behavior
- `corepack pnpm --dir neon-stock-terminal --filter @app/api prisma:generate`
  - passed
- `corepack pnpm --dir neon-stock-terminal --filter @app/api typecheck`
  - passed after removing the final unreachable branch in `src/lib/redisBackedStore.ts`
- Production-mode local API validation using a temporary Redis instance and direct API process:
  - `/health` returned `200`
  - `/ready` returned `200`
  - `/auth/session` returned an unauthenticated payload
  - `/auth/csrf` failed closed without an active session
  - `/auth/session/logout` remained functional
  - `/v1/feedback/challenge` returned `401` with rate-limit headers intact
  - malformed `/auth/session/login` input returned `400` without bypassing the limiter path
- Fail-closed validation with bad Redis URLs:
  - API startup exited with code `1`
  - logs emitted `session_store_redis_error` and `session_store_fail_closed`
  - startup did not silently continue with in-memory session storage
- Container and package-manager validation:
  - `docker run --rm node:20-bookworm sh -lc "command -v openssl && openssl version && test -d /etc/ssl/certs && echo certs-ok"` passed
  - `docker run --rm --network host node:20-bookworm sh -lc "npm view react version"` passed, confirming registry access through the host-network path
- End-to-end dashboard rebuild and rebuilt-container validation:
  - `docker compose build n50-dashboard n50-dashboard-stage` passed after the Dockerfile/npm workspace changes and lockfile refresh
  - the rebuilt dashboard containers initially failed local database auth because the tracked root `.env` intentionally contains placeholder credentials
  - local validation was completed with a shell-only operator secret override rather than changing tracked config
  - `docker compose up -d n50-dashboard n50-dashboard-stage nginx` succeeded with that local override in place
  - `docker compose restart nginx` cleared stale upstream connections after dashboard recreation
  - `curl http://localhost:19090/n50/health` returned `200`
  - `curl http://localhost:19090/n50/ready` returned `200`
  - `curl http://localhost:19090/auth/session` returned an unauthenticated payload
  - `curl http://localhost:19090/v1/feedback/challenge` returned `401` with rate-limit headers intact

## Screens reviewed

- `output/playwright/redis-session-rate-limit-production-safe/desktop/feedback-auth-gate-desktop.png`
  - reviewed the existing frontend against the updated auth/session API behavior to confirm the feedback sign-in gate remained visually stable on desktop
- `output/playwright/redis-session-rate-limit-production-safe/final/prod-feedback-desktop.png`
  - rebuilt prod container path rendered the feedback sign-in gate correctly at `/n50/feedback`
- `output/playwright/redis-session-rate-limit-production-safe/final/prod-backtesting-desktop.png`
  - rebuilt prod container path rendered `/n50/backtesting` without obvious overflow or layout breakage in the reviewed viewport
- `output/playwright/redis-session-rate-limit-production-safe/final/prod-feedback-mobile.png`
  - rebuilt prod mobile feedback view remained usable with stacked controls and no clipped auth gate
- `output/playwright/redis-session-rate-limit-production-safe/final/stage-feedback-desktop.png`
  - rebuilt stage container path rendered the sign-in-gated feedback screen correctly under `/n50-stage/` with stage-specific cookie/path isolation intact
- Browser console/network noise observed during that smoke:
  - `matomo.js` load failure
  - Clarity timeout
  - both appear pre-existing / external and not introduced by this phase

## Decisions made

- This change affects production auth/session enforcement and operational readiness, so it will be recorded in a dedicated ADR.
- Redis is now the canonical shared store for production auth/session behavior and production-sensitive API rate limiting.
- In-memory fallbacks remain available only in non-production mode and only through explicit development-only flags.
- Readiness is intentionally strict: a database-only healthy API is not considered ready when Redis-backed auth/session or rate limiting is unavailable.

## Risks / follow-ups

- The tracked root `.env` remains intentionally sanitized. Local rebuilt-container validation therefore still requires operator-provided secret overrides at runtime rather than relying on checked-in placeholder credentials.
- Browser console noise from proxied Matomo and external analytics endpoints (`matomo.js`, Clarity, Google ad/analytics calls) is still present and should be triaged separately from auth/session enforcement.
- The web build still emits Vite chunk-size warnings. They are not blocking, but bundle-splitting can be tuned separately if frontend performance work is prioritized.
- Temporary validation resources created during the phase were cleaned up after verification:
  - removed the host-published Redis container `trading-stack-temp-redis`
  - stopped the direct API validation process on port `18186`

## Resume here next time

1. Triage the remaining external analytics/proxy console noise (`matomo.js`, Clarity, Google ad/analytics calls`) without weakening the hardened ingress or CSP posture.
2. If frontend performance becomes a priority, address the non-blocking Vite chunk-size warnings with intentional bundle splitting rather than broad dependency churn.
