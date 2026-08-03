# Promote Hardened Nginx Ingress and Add Edge-Ready Protections

## Objective

Promote one canonical nginx ingress configuration for the active N50 stack, preserve current same-origin routing for prod and stage, add edge-focused protections and rate limits, and document what belongs at nginx versus CDN/WAF.

## Repo facts verified

- `docker-compose.yml` mounts `compose/nginx/nginx.conf` into the live `nginx` service on `localhost:19090`.
- `compose/n50-nginx/nginx.conf` is not mounted by compose and still reflects an older hardening pass on port `19210`.
- The current stack must preserve `/n50/`, `/n50-stage/`, `/auth/*`, `/v1/*`, `/api/v1/*`, `/matomo/*`, and `/option-chain/*`.
- The React web app builds with `VITE_API_BASE_URL=/n50` or `/n50-stage`, so browser requests use prefixed same-origin paths such as `/n50/auth/*`, `/n50/v1/*`, and `/n50/api/v1/*`.
- `neon-stock-terminal/apps/api/src/server.ts` keeps Helmet CSP disabled today, so nginx is the correct place to enforce the effective CSP.
- The active ingress also still serves legacy localhost-only routes for the watchlist/gateway stack (`/backend`, `/paper`, `/watcher`, `/digii4`, `/rsi-willr`).
- Public host routing for `m.nifty50today.co.in` and `stage.nifty50today.co.in` is documented in `docs/n50-stage-prod-hosting.md`.

## Files inspected

- `compose/nginx/nginx.conf`
- `compose/n50-nginx/nginx.conf`
- `docker-compose.yml`
- `docs/endpoints.md`
- `docs/n50-stage-prod-hosting.md`
- `neon-stock-terminal/apps/api/src/server.ts`
- `neon-stock-terminal/apps/api/src/routes/auth.ts`
- `neon-stock-terminal/apps/api/src/routes/feedback.ts`
- `neon-stock-terminal/apps/api/src/routes/internal.ts`
- `neon-stock-terminal/apps/web/src/lib/api.ts`
- `neon-stock-terminal/apps/web/src/lib/session.ts`
- `neon-stock-terminal/docs/analytics/README.md`

## Plan

1. Make `compose/nginx/nginx.conf` the only active source of truth and mark `compose/n50-nginx/nginx.conf` deprecated.
2. Merge in security headers, request limits, timeout/body-size settings, and route comments without changing prod/stage path behavior.
3. Add targeted nginx rate limits for login, signup, feedback submit, and snapshot refresh paths on both bare and prefixed routes.
4. Document nginx versus CDN/WAF ownership and update hosting docs.
5. Validate with `docker compose config`, header checks, and Playwright smoke on `/`, `/options`, `/backtesting`, and `/feedback`.

## Changes made

- Hardened `compose/nginx/nginx.conf` as the canonical ingress with explicit route ownership comments, request filtering maps, body-size and proxy timeout controls, and standard security headers.
- Added targeted nginx rate limiting for login, signup, feedback submit, and snapshot refresh on both bare and `/n50` and `/n50-stage` prefixed paths.
- Preserved same-origin proxy behavior for `/n50/`, `/n50-stage/`, `/auth/*`, `/v1/*`, `/api/v1/*`, `/matomo/*`, `/option-chain/*`, and the legacy localhost-only gateway/watcher paths.
- Marked `compose/n50-nginx/nginx.conf` as deprecated and documented `compose/nginx/nginx.conf` as the source of truth.
- Updated hosting documentation with the split between nginx-owned protections and CDN/WAF-owned controls.
- Recorded the ingress ownership/security posture change in a new ADR.

## Validation run

- `docker compose config -q`
- `docker compose exec -T nginx nginx -t`
- `docker compose exec -T nginx nginx -s reload`
- `curl.exe -sS -D - -o NUL http://localhost:19090/n50/`
- `curl.exe -sS -D - -o NUL http://localhost:19090/n50-stage/`
- `curl.exe -sS -D - -o NUL http://localhost:19090/option-chain/api/latest`
- `curl.exe -sS -D - -o NUL http://localhost:19090/auth/csrf`
- `curl.exe -sS -D - -o NUL -H "Host: stage.nifty50today.co.in" http://localhost:19090/`
- Verified security headers on checked routes: CSP, `Permissions-Policy` with `camera=()`, `X-Frame-Options`, `X-Content-Type-Options`, strict `Referrer-Policy`, COOP/CORP.
- Verified `/auth/csrf` returns `401 Unauthorized` without an active session, which matches the application contract rather than an ingress failure.

## Screens reviewed

- Desktop: `output/playwright/ingress-hardening-edge-protection/desktop/home-desktop.png`
- Desktop: `output/playwright/ingress-hardening-edge-protection/desktop/options-desktop.png`
- Desktop: `output/playwright/ingress-hardening-edge-protection/desktop/backtesting-desktop.png`
- Desktop: `output/playwright/ingress-hardening-edge-protection/desktop/feedback-desktop.png`
- Mobile: `output/playwright/ingress-hardening-edge-protection/mobile/home-mobile.png`
- Mobile: `output/playwright/ingress-hardening-edge-protection/mobile/options-mobile.png`
- Mobile: `output/playwright/ingress-hardening-edge-protection/mobile/backtesting-mobile.png`
- Mobile: `output/playwright/ingress-hardening-edge-protection/mobile/feedback-mobile.png`
- Tablet: `output/playwright/ingress-hardening-edge-protection/tablet/options-tablet.png`
- No new ingress-caused layout regressions were observed in the audited routes. External analytics assets (`matomo.js`, Clarity, some Google tags) still show intermittent load errors that appear pre-existing or environment-specific.

## Decisions made

- `compose/nginx/nginx.conf` is the canonical ingress configuration for prod, stage, and localhost reverse-proxy flows.
- nginx is the effective CSP enforcement layer until the Node BFF enables a production-safe CSP directly.
- Rate limiting is applied narrowly to auth, feedback, and snapshot refresh paths to avoid broad regressions on normal read traffic.
- Edge controls are split so nginx owns origin-local routing and headers, while CDN/WAF owns bot management, geo/IP reputation, and higher-level edge access policy.

## Risks / follow-ups

- The CSP allowlist may need future expansion if additional third-party analytics or embeds are intentionally enabled.
- `/auth/csrf` currently returns `401` without a session; that behavior is expected but should remain documented for future smoke tests.
- Cloudflare/WAF policy is still operationally separate from repo-managed nginx config and should be reviewed together before a public rollout.
- Rate-limit thresholds are conservative and may need tuning after observing real auth and feedback traffic patterns.

## Resume here next time

If ingress scope expands again, start with `compose/nginx/nginx.conf`, then review `docs/n50-stage-prod-hosting.md` and `docs/adr/ADR-002-canonical-nginx-ingress-and-edge-hardening.md` before changing edge headers, paths, or rate limits.
