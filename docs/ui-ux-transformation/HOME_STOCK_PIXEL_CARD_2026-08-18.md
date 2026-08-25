# Home Stock Pixel Card — 18 August 2026

## Outcome

The Home sector heatmap now gives every rendered stock tile a ReactBits Pixel Card-inspired hover and keyboard-focus interaction. Pixels reveal progressively beneath the stock content while preserving the symbol, price, lens value, indicators and click behaviour.

## Data-driven colour rules

The effect does not invent a separate decorative status. It inherits the active Home lens state:

| Lens state | Pixel colour |
|---|---|
| Positive | Green `#159766` |
| Negative | Red `#d2485b` |
| High | Violet `#7558d5` |
| Medium | Gold `#c68a0b` |
| Neutral | Slate `#64748b` |
| Missing | Grey `#8996a8` |

Switching Price, Volume, RSI, Williams %R, OIIS or 30D Opportunity therefore also updates the semantic pixel colour. Missing data never receives a positive colour.

## Performance and accessibility

- Each tile has a small canvas, but animation frames run only for the currently hovered or keyboard-focused tile.
- The animation stops after reveal/conceal settles.
- Canvas resolution is capped at 2× device pixel ratio.
- Pixel size adapts to tile width.
- Canvas is non-interactive, `aria-hidden` and below the text layer.
- The effect is disabled for reduced motion, touch/coarse pointers and Home Calm mode.
- Live quote updates do not recreate a global animation loop or reorder tiles.

## Files

- `neon-stock-terminal/apps/web/src/components/market/StockPill.tsx`
- `neon-stock-terminal/apps/web/src/components/market/StockPill.module.css`
- `neon-stock-terminal/apps/web/src/components/market/StockPixelField.tsx`
- `neon-stock-terminal/apps/web/src/components/market/StockPixelField.module.css`
- `neon-stock-terminal/apps/web/src/components/market/stockPixelField.ts`
- `neon-stock-terminal/apps/web/tests/stockPixelField.test.ts`
- `tools/playwright/home-stock-pixel-card-regression.mjs`

## Validation

| Check | Result |
|---|---|
| Web unit suite | PASS — 29/29 |
| Production TypeScript/Vite build | PASS — 2,495 modules transformed |
| Live container | PASS — running and healthy |
| Authenticated Playwright | PASS — 6/6 |
| Home tile coverage | PASS — 208/208 rendered stock tiles |
| Positive semantic colour | PASS — green-dominant pixels |
| Negative semantic colour | PASS — red-dominant pixels |
| Reduced motion | PASS — pixel field hidden |

Evidence:

- `tools/playwright/output/playwright/home-stock-pixel-card-20260818/results.json`
- `tools/playwright/output/playwright/home-stock-pixel-card-20260818/home-negative-stock-pixel-hover-1366x768.png`

## Deployment and rollback

Deployed service: `trading-stack-novius2-n50-dashboard-1`.

Pre-change backup:

`/home/novius2/trading-stack/backups/home-stock-pixel-card-20260818T184259Z`

Rollback restores the two backed-up `StockPill` files, removes the three new pixel-field files/import, then rebuilds and recreates only `n50-dashboard`. No database rollback is needed.

OpenAPI/Swagger was not changed because no backend or API contract changed.
