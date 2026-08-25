# Paper OIIS factor contour surface — 2026-08-20

## Outcome

The production Paper Trading portfolio now opens with a filled OIIS factor outcome surface above the executive KPI strip.

- Five switchable point-in-time axis combinations are available: OFactor × XFactor, RSI14 × ATR14, RSI14 × Williams %R, ATR14 × relative volume, and OFactor × RSI14.
- Capital basis: fixed ₹200,000 whole-share investment scenario.
- Actual stock observations are overlaid as labelled, keyboard-focusable points and open the existing trade evidence drawer.
- The filled field uses bounded inverse-distance interpolation only between sufficiently close observations. Unsupported areas remain grey/hatched and are not presented as financial evidence.

## Outcome lenses

1. Intraday maximum profit — entry-session maximum favourable movement.
2. Swing maximum profit — inclusive D0–D5 MFE.
3. Swing maximum drawdown — inclusive D0–D5 MAE.
4. 30D maximum profit — inclusive D0–D30 MFE.
5. 30D maximum drawdown — inclusive D0–D30 MAE.

The fixed-capital intraday value scales the stored original-quantity D0 maximum profit to the whole-share ₹2 lakh quantity. The other four lenses use the governed fixed-capital horizon fields added on 19 August.

## Colour contract

- −₹2,000 or below: neon red `#ff164f`.
- −₹100 through +₹100: neon yellow.
- +₹2,000 or above: neon dark green `#007a45`.
- Values outside ±₹2,000 are colour-capped while point tooltips retain exact amounts.
- Grey hatch: outside supported interpolation coverage.
- Dashed contour boundaries: −₹1,000, −₹100, +₹100 and +₹1,000.

## Entry-factor views and point detail

All five views use the nearest available OIIS daily-candidate snapshot at or before the trade entry. No post-entry factor is used as an axis.

1. Opportunity × execution — `evidence_ofactor` against `evidence_xfactor`.
2. RSI × ATR — `evidence_rsi14` against `evidence_atr14`.
3. RSI × Williams — `evidence_rsi14` against `evidence_willr14`.
4. ATR × relative volume — `evidence_atr14` against `evidence_volume_ratio`.
5. Opportunity × RSI — `evidence_ofactor` against `evidence_rsi14`.

Hovering or keyboard-focusing an actual stock point exposes symbol, sector, original quantity, entry price/time, fixed ₹2 lakh quantity, both active axis values, exact outcome and every intraday target level with state, hit time, profit per share and original-quantity profit. Selecting the point still opens the complete trade evidence drawer.

## Files

- `neon-stock-terminal/apps/web/src/lib/paperOiisSurface.ts`
- `neon-stock-terminal/apps/web/tests/paperOiisSurface.test.ts`
- `neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx`
- `neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.module.css`
- `/home/novius2/trading-stack/tools/playwright/paper-oiis-surface-regression.mjs`

## Validation

- Web tests: **35/35 passed**.
- Web typecheck: **passed**.
- Web production build: **passed**.
- Authenticated production Chromium: **passed**.
- Live reconciliation: **29 Paper trades, 29 O/X-qualified points, 29 rendered O/X points, five axis views, five outcome lenses and hover evidence**.
- Desktop viewport: 1920×1080.
- Mobile viewport: 390×844.
- Dashboard container healthy after deployment.

The first implementation unit run failed because JavaScript converted missing factor `null` values to numeric zero. The parser was corrected to reject null/blank factors; the failed test was retained as a real failure. During this enhancement the first loopback browser run returned 401 because secure session cookies are not valid on the HTTP test origin, two test selectors still used the old accessibility label, and the initial SVG group hover targeted its geometric centre rather than the visible circle. The production HTTPS test and selectors were corrected; the final 35/35 unit suite and full production regression pass.

## Screenshots

- Desktop swing drawdown: `/home/novius2/trading-stack/output/playwright/paper-oiis-surface/desktop-swing-drawdown.png`
- Mobile 30D profit: `/home/novius2/trading-stack/output/playwright/paper-oiis-surface/mobile-30d-profit.png`

## API/schema impact

None. The chart consumes existing point-in-time O/X, RSI14, Williams %R, ATR14, relative-volume and fixed-investment outcome fields. Swagger/OpenAPI therefore requires no contract revision for this UI-only addition.

## Rollback

Restore the Paper component, stylesheet and optional prior surface helper from:

`/home/novius2/trading-stack/backups/paper-oiis-multifactor-20260820T182919`

Remove `apps/web/src/lib/paperOiisSurface.ts` if the backup has no predecessor, then rebuild and recreate only `n50-dashboard`. No database rollback is required.
