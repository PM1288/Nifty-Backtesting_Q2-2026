# Long-Only Options Router v2.0 implementation

## Outcome

The supplied package was extracted and reviewed from:

`/home/novius2/NIFTY50/Long-derivatives/Long_Only_Options_Implementation_Package_v2.0`

The application now exposes an independent strategy dashboard at:

`/n50/strategy/long-options`

It is listed under the Strategy menu beside OIIS Lab and Rolling Monthly. It does not read their strategy tables, reuse their scoring, or write to their persistence paths.

## Implemented boundary

- Strategy identity: `LONG_ONLY_OPTIONS_ROUTER`, policy version `2.0.0`.
- Environment: `PAPER`; `liveOrdersEnabled` is always false.
- Opening side: BUY only. Closing side: SELL only.
- PAPER routes: `BUY_ATM_STRADDLE` and `BUY_DELTA_STRANGLE`.
- Shadow-disabled routes: `BUY_CALL` and `BUY_PUT` until the package's directional promotion criteria are independently satisfied.
- Existing canonical F&O movement and option-structure evidence is reused from PostgreSQL. No second SmartAPI connection was created.
- Entry evidence uses leg asks; monitoring/exit evidence uses leg bids. LTP or midpoint is not used to claim the net target.
- Trading charges remain separate components and are included in the displayed economic evidence.
- Missing or stale hard-gate inputs result in `NO_TRADE`; aggregate scores cannot override them.

## Production data mapping

| Router input | Current source |
|---|---|
| Run identity and state | `fno_volatility.signal_run` |
| Movement ranking and live confirmation | `fno_volatility.movement_prediction` |
| Exact option structures and bid/ask evidence | `fno_volatility.option_candidate` |
| Source decision and reasons | `fno_volatility.trade_signal` |
| Underlying contract estate | SmartAPI-backed PostgreSQL option-chain/token tables used by the existing F&O service |

The production verification run found 14 persisted structures across five underlyings. At verification time all were `NO_TRADE`; the stored decision-window quotes were no longer fresh enough to support an executable decision.

## Fail-closed gaps

The existing `fno_volatility.option_candidate` contract does not yet persist every v2.0 hard-gate field. The router explicitly rejects rather than estimates these fields:

- reconciled source sequence watermark;
- scheduled/unscheduled event gate state;
- best-ask depth lots per leg;
- call and put deltas for the 25–35 delta strangle rule;
- P90-to-P75 tail ratio.

Consequently, this release is a real-data research/PAPER eligibility surface, but it will not produce a false READY result from incomplete inputs. Promoting it into automated paper-group creation requires additive persistence of those inputs, a calibrated scenario registry, the package's monitoring state machine and replay validation. No paper-trading or broker-order integration was added in this release.

## API

- `GET /v1/long-options/summary`
- `GET /v1/long-options/candidates`
- `GET /v1/long-options/candidates/{symbol}`

All endpoints use the existing authenticated dashboard boundary. The backend OpenAPI package was regenerated after these routes were added.

## Files

- `neon-stock-terminal/apps/api/src/routes/longOptions.ts`
- `neon-stock-terminal/apps/api/src/routes/longOptions.test.ts`
- `neon-stock-terminal/apps/api/src/routes/index.ts`
- `neon-stock-terminal/apps/web/src/pages/LongOptionsPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/LongOptionsPage.module.css`
- `neon-stock-terminal/apps/web/src/components/chrome/workspaceRoutes.ts`
- `neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx`
- `neon-stock-terminal/apps/web/src/lib/api.ts`
- `neon-stock-terminal/apps/web/src/routePreloads.ts`
- `neon-stock-terminal/apps/web/src/App.tsx`
- `tools/playwright/long-options-regression.mjs`

## Validation

- API TypeScript typecheck: pass.
- Web TypeScript typecheck: pass.
- API production build: pass.
- Web/Vite production build: pass.
- Long Options policy tests: 5/5 pass.
- Authenticated production Playwright: 25/25 pass at 1920×1080 and 390×844.
- Production dashboard container: healthy.
- Live summary contract: HTTP 200, independent family, PAPER environment, live orders disabled, 14 real structures.
- OpenAPI validation: pass with zero errors.

Screenshots and machine-readable browser evidence:

`/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/tools/playwright/output/playwright/long-options`

## Rollback

Redeploy the preceding `trading-stack-n50-dashboard` image. This change has no database migration, collector change, paper-trading write, or live broker-order side effect.
