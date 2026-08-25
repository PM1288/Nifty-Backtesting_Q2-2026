# Market Splash and Target Cursor — 18 August 2026

## Outcome

The authenticated application shell now provides two coordinated desktop-pointer effects on every dashboard:

- a larger market-coloured splash/smoke trail based on the ReactBits Splash Cursor interaction direction;
- a four-corner target cursor based on the ReactBits Target Cursor interaction direction, snapping to enabled buttons, links, tabs and explicitly marked cursor targets.

The implementation is application-native React/CSS/canvas code and adds no third-party runtime dependency.

## Behaviour

### Splash cursor

- Particle radius increased from `14–38 px` to `36–84 px`.
- Pointer movement emits `3–7` particles, scaled by movement distance.
- Pointer activation emits a denser `20`-particle splash.
- Maximum active particles increased to `160` with bounded lifetime and disposal.
- NIFTY direction continues to determine positive, neutral or negative colour.
- Market magnitude continues to determine brilliance.
- RSI momentum continues to influence motion/lifetime without changing trading data.

### Target cursor

- Free pointer state uses a compact `30 × 30 px` reticle.
- Hover/focus-by-pointer over an enabled action snaps four corner brackets around the action with `7 px` padding.
- Supported targets: enabled buttons, links, button roles, tab roles and `[data-cursor-target]`.
- A control may opt out with `data-target-cursor="off"`.
- The normal system cursor remains available away from targets and on form/non-action content.
- Target acquisition uses a fast easing rate and stops requesting animation frames after settling.
- The reticle colour follows the same NIFTY positive/neutral/negative state as the splash.

## Safety and accessibility

- Both effects are hidden when `prefers-reduced-motion: reduce` is active.
- Both effects are disabled on coarse pointers and non-hover/touch devices.
- Existing Calm mode and Pause motion state disables the effects.
- Both layers use `pointer-events: none` and cannot intercept actions.
- The target layer is `aria-hidden` and conveys no essential information.
- No API, PostgreSQL schema, trading calculation, order path or SmartAPI collector changed.

## Files

- `neon-stock-terminal/apps/web/src/components/visual/MarketSplashCursor.tsx`
- `neon-stock-terminal/apps/web/src/components/visual/marketSplashCursor.ts`
- `neon-stock-terminal/apps/web/src/components/visual/MarketTargetCursor.tsx`
- `neon-stock-terminal/apps/web/src/components/visual/MarketTargetCursor.module.css`
- `neon-stock-terminal/apps/web/src/components/layout/AppShell.tsx`
- `neon-stock-terminal/apps/web/tests/marketGradientWaves.test.ts`
- `tools/playwright/market-cursor-regression.mjs`

## Validation

| Check | Result |
|---|---|
| Web unit suite | PASS — 27/27 |
| TypeScript and production Vite build | PASS — 2,492 modules transformed |
| Live container health | PASS — `running healthy` |
| Live Playwright cursor checks | PASS — 7/7 |
| Measured splash alpha footprint | PASS — `110 × 108 px`, 2,379 sampled pixels |
| Target snap | PASS — snapped around the full Today navigation action |
| Reduced-motion splash | PASS — hidden |
| Reduced-motion target | PASS — hidden |

Evidence:

- `tools/playwright/output/playwright/market-cursors-20260818/results.json`
- `tools/playwright/output/playwright/market-cursors-20260818/target-cursor-snapped-1366x768.png`

## Deployment and rollback

Deployed service: `trading-stack-novius2-n50-dashboard-1`.

Pre-change backup:

`/home/novius2/trading-stack/backups/market-cursors-20260818T183122Z`

Rollback requires restoring the backed-up splash and shell files, removing the two new `MarketTargetCursor` files/import, rebuilding `n50-dashboard`, and recreating only that service. No database rollback is required.

## API documentation

OpenAPI/Swagger was not changed because this is a client-only interaction enhancement with no API contract addition or modification.

## Unrelated operational observation

Post-deployment logs contained a transient Prisma connection-pool timeout from the existing mobile notification dispatcher and slow `instrument_state` reads. The dashboard remained healthy and the authenticated cursor journey passed. This cursor change neither opens database connections nor modifies the dispatcher; the database-pool pressure remains a separate operational item.
