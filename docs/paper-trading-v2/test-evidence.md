# Paper Trading Evidence Workbench V2 test evidence

Final validation: 2026-08-22 17:58 UTC
Public route: `https://n50.nifty50today.co.in/n50/paper-trading`

## Result summary

| Gate | Result | Exact evidence |
|---|---|---|
| Web unit tests | PASS, 39/39 | `../../node_modules/.bin/tsx --test tests/*.test.ts` from `apps/web` |
| Web typecheck | PASS | `../../node_modules/.bin/tsc --noEmit --pretty false` from `apps/web` |
| API tests | PASS, 114/114 | `pnpm --filter @nifty/api test` |
| Web production build | PASS, 2,499 modules | `pnpm --filter @nifty/web build` |
| Docker production build/recreate | PASS | `docker compose -p trading-stack-novius2 build n50-dashboard` followed by `up -d --no-deps n50-dashboard` |
| OpenAPI validation | PASS, 18 specifications, 602 operations, 0 errors | Existing dashboard OpenAPI validator |
| Authenticated browser regression | PASS | `screenshots/after/regression-results.json` |
| Responsive screenshots | PASS at six V2 viewports | `screenshots/after/` |
| Structural/keyboard accessibility | PASS for the executed checks | `accessibility/accessibility-results.json` |
| Production performance measurement | Measured; route/API target not met | `performance/performance-results.json` |

## Reconciliation

The authenticated production regression loaded 35 canonical paper trades and reconciled:

- Booked realised net: `₹77,055.9796` raw API value.
- Open unrealised gross: `−₹53,113.55` raw API value.
- A higher intraday target cannot be hit while a lower eligible target is not hit: PASS.
- D+5 is included in D+30 before five-session maturity, then freezes while D+30 continues: PASS.
- Every required workbench section is reachable.
- Analysis context survives URL/deep-link restoration.
- Table presets and density modes operate on the same canonical rows.
- The canonical inspector opens from the evidence table and exposes Economics and Calculation Trace.
- CSV export includes context metadata and row-level accounting-class metadata.

The raw reconciliation manifest is `screenshots/after/regression-results.json`.

## Responsive browser evidence

Authenticated Chromium passed with no viewport-level horizontal overflow at:

- 1920 × 1080
- 1600 × 900
- 1440 × 900
- 1366 × 768
- 768 × 1024
- 390 × 844

The immutable before-state was captured at 1920 × 1080, 1600 × 900, 1440 × 900 and 1366 × 768.

## Data and contract impact

- No PostgreSQL schema or production-row change.
- No Paper Trading API contract change.
- No canonical execution, target, horizon, quality or simulation formula change.
- Swagger/OpenAPI content therefore required no update; the existing documentation was revalidated successfully.
- No paper trade was created during this validation and no live broker order was placed.

## Honest failed or incomplete gates

- A final non-login-shell attempt using bare `pnpm` failed with `pnpm: command not found`; the same tests were immediately rerun through the installed repository binaries and passed 39/39 with typecheck exit code 0. The environment failure is retained here rather than omitted.
- The production API median across five samples was 2,524.3 ms and route-to-heading was 3,538.6 ms. This does not meet the proposed 1.5-second meaningful-content target.
- The accessibility pass is structural and keyboard-focused; a full axe, screen-reader, forced-colours and manual 400% critical-flow pass remains outstanding.
- A full market-session soak, Firefox/WebKit matrix and large-population table test remain outstanding.
- Repository-wide legacy lint debt was not relabelled or hidden; focused typecheck, tests and production build passed.
