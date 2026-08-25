# Paper Trading authentication bootstrap repair

Date: 18 August 2026 (UTC)
Route: `https://n50.nifty50today.co.in/n50/paper-trading`

## Symptom

The page could remain in:

```text
Paper evaluation unavailable
API 401: {"error":{"code":"AUTH_REQUIRED","message":"Active session required."}}
```

## Root cause

`PaperTradingCommandCenter` mounted before `AuthGateProvider` completed the asynchronous server-session restoration. Its protected `/v1/workspace/paper-trading` request ran immediately, received the expected server-side 401, and retained that response as permanent page error state. It did not rerun when the authenticated user became available.

The backend authentication guard was correct and was not weakened.

## Change

- `usePaperData` now receives `authReady` and the authenticated user ID.
- No protected Paper request starts before both values confirm an authenticated application state.
- The data effect reruns when the authenticated user/session identity becomes available or changes.
- During unauthenticated bootstrap, stale Paper data and error state are cleared.
- The existing 20-second client abort was increased to 60 seconds because live validation found that the canonical Paper query can take approximately 26–35 seconds under current database load. The slow-loading message remains visible after three seconds and no mutation is repeated.

## Files

- `neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx`
- `tools/playwright/paper-auth-bootstrap-regression.mjs`

## Validation

The focused browser regression intentionally delays `/n50/auth/session` by 1.5 seconds, then verifies:

1. no Paper workspace request is sent before session bootstrap resolves;
2. exactly one Paper workspace response is received;
3. the response is HTTP 200;
4. the persistent 401 error state is absent.

Final result: **4/4 checks passed**.

Live evidence:

- session endpoint: HTTP 200;
- Paper workspace endpoint: HTTP 200;
- observed canonical response duration during final run: 25.943 seconds;
- dashboard container: healthy;
- TypeScript and production Vite build: passed, 2,490 modules transformed.

The first delayed-session harness run timed out while waiting for the page because it exposed the separate 20-second client abort against a 35-second live query. That failure was not suppressed: the timeout was corrected to 60 seconds and the complete regression was rerun successfully.

Evidence directory:

`/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/tools/playwright/output/playwright/paper-auth-bootstrap-20260818`

## Schema, API and safety impact

- No API contract or OpenAPI schema changed; Swagger regeneration is therefore not required for this client sequencing repair.
- No PostgreSQL schema or data changed.
- No Paper execution, target, P&L or trade-quality calculation changed.
- No broker or LIVE-order endpoint was introduced or called.
- Server-side authentication remains authoritative.

## Rollback

Pre-change file backup:

`/home/novius2/trading-stack/backups/paper-auth-race-20260818T181823Z/PaperTradingCommandCenter.tsx`

Restore that file, rebuild `n50-dashboard`, and recreate only that container with `--no-deps`. No database rollback is required.
