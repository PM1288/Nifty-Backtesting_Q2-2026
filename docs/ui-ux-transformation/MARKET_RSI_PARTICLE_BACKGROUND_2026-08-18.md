# Market RSI Particle Background — 18 August 2026

## Outcome

A ReactBits Particles-inspired background is now mounted once in the authenticated application shell and remains available across dashboard navigation. It renders exactly 400 lightweight canvas particles behind the application content and existing market-gradient waves.

## Governed RSI mapping

The animation uses the NIFTY 50 RSI already supplied by the canonical overview API. It does not calculate RSI in the browser.

### Speed

| NIFTY RSI | Speed |
|---:|---:|
| 20 or below | 1.80 |
| 30 | 1.30 |
| 40 | 0.80 |
| 60 | 1.30 |
| 80 or above | 1.80 |

The 20→40 segment interpolates linearly from 1.80 down to 0.80. The 40→80 segment interpolates linearly from 0.80 up to 1.80. Values outside the end anchors are capped.

### Colour

| NIFTY RSI | Colour |
|---:|---|
| 30 or below | Red `#c2384a` |
| 45 | Yellow `#c68a0b` |
| 70 or above | Green `#0b7a53` |

Colour interpolates linearly from red to yellow between RSI 30–45 and from yellow to green between RSI 45–70.

If RSI is unavailable, the canvas uses honest slate `#52647a` at speed `0.80`; it does not fabricate an RSI state.

## Performance and accessibility

- One fixed canvas is shared by the application shell; it is not recreated per dashboard card.
- Exactly 400 particles are updated in a single animation frame loop.
- Device-pixel ratio is capped at 1.75×.
- Frame delta is capped after suspension to prevent a large jump.
- Background/hidden tabs stop requesting frames and reconcile when visible.
- Calm mode and Pause motion freeze the particle field.
- Reduced-motion mode hides the non-essential particle layer.
- Canvas is non-interactive and `aria-hidden`.
- Foreground text, controls and charts retain their existing stacking and contrast.

## Files

- `neon-stock-terminal/apps/web/src/components/visual/MarketRsiParticles.tsx`
- `neon-stock-terminal/apps/web/src/components/visual/MarketRsiParticles.module.css`
- `neon-stock-terminal/apps/web/src/components/visual/marketRsiParticles.ts`
- `neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx`
- `neon-stock-terminal/apps/web/tests/marketGradientWaves.test.ts`
- `tools/playwright/market-rsi-particles-regression.mjs`

## Validation

| Check | Result |
|---|---|
| Web unit suite | PASS — 31/31 |
| Production TypeScript/Vite build | PASS — 2,498 modules transformed |
| Live container | PASS — running and healthy |
| Authenticated Playwright | PASS — 5/5 |
| Particle count | PASS — 400 |
| Particle movement | PASS — canvas signature changed across frames |
| Cross-dashboard persistence | PASS — Today to Paper Trading |
| Reduced motion | PASS — hidden |

Live validation observed canonical NIFTY RSI `55.63`, producing speed `1.191` and interpolated colour `#76832a`.

Evidence:

- `tools/playwright/output/playwright/market-rsi-particles-20260818/results.json`
- `tools/playwright/output/playwright/market-rsi-particles-20260818/home-rsi-particles-1366x768.png`
- `tools/playwright/output/playwright/market-rsi-particles-20260818/paper-dashboard-rsi-particles-1366x768.png`

## Deployment and rollback

Deployed service: `trading-stack-novius2-n50-dashboard-1`.

Pre-change backup:

`/home/novius2/trading-stack/backups/market-rsi-particles-20260818T185059Z`

Rollback restores the backed-up `AppShell.tsx`, removes the three new particle files/import, then rebuilds and recreates only `n50-dashboard`. No database rollback is required.

OpenAPI/Swagger was not changed because no backend or API contract changed.
