# Login API 403 origin fix — 2026-08-24

## Incident

Browser login to `https://n50.nifty50today.co.in/n50/` returned HTTP 403 while the application shell itself remained reachable.

## Root cause

The authentication guard correctly validates state-changing authentication requests against an origin allow-list. The deployed default contained the mobile origin and localhost, but omitted the canonical dashboard origin. Consequently:

- a login request without an `Origin` header returned 200;
- the same valid login request with `Origin: https://n50.nifty50today.co.in` returned `403 ORIGIN_MISMATCH`.

This was an authentication-origin configuration defect, not an invalid credential or a stopped API.

## Correction

Updated `AUTH_ALLOWED_ORIGINS` default in `compose/compose.core.yml` to include:

- `https://n50.nifty50today.co.in`
- `https://m.nifty50today.co.in`
- `http://localhost:19090`
- `http://127.0.0.1:19090`

The public and mobile origins remain explicit; no wildcard origin was introduced.

## Deployment

Recreated only `trading-stack-novius2-n50-dashboard-1` using the existing dashboard image and updated environment. No database, paper-trading, collector, or strategy container was restarted.

## Validation

- Public home: HTTP 200.
- Public browser-origin dev login: HTTP 200 and authenticated session created.
- Session check using the issued cookie: HTTP 200 and authenticated.
- Authenticated Paper Trading workspace API: HTTP 200.
- Headless Chromium against the public URL: login 200, page 200, authenticated `ESNG Admin` header visible.
- Effective container allow-list contains the canonical public, mobile, localhost, and 127.0.0.1 origins.

## Security note

The repair preserves exact-origin validation. It does not disable CSRF/origin checks and does not broaden access with `*`.
