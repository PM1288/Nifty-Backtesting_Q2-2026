# Cursor and Pixel Readability Tuning — 19 August 2026

## Outcome

The market smoke trail and Home stock-tile pixel animation were reduced and made more transparent so dashboard text remains dominant.

## Changes

### Smoke trail

| Property | Before | After |
|---|---:|---:|
| Opacity range | 0.16–0.40 | 0.07–0.18 |
| Radius range | 36–84 px | 30–64 px |
| Lifetime | 780–1,080 ms | 520–680 ms |
| Maximum retained drops | 160 | 80 |
| Movement emission | 3–7 | 2–4 |
| Click burst | 20 | 10 |

Trail displacement was also reduced from 38% to 24% of pointer movement.

### Home heatmap pixel animation

| Property | Before | After |
|---|---:|---:|
| Pixel alpha range | 0.24–0.62 | 0.08–0.26 |
| Hover background colour wash | 18% | 6% |

The semantic green/red/violet/gold/grey colour mapping remains unchanged. Symbol, price and percentage layers remain above the pixel canvas.

## Validation

- Web unit tests: PASS — 31/31.
- Production build: PASS — 2,498 modules transformed.
- Live cursor Playwright: PASS — 7/7.
- Live Home pixel Playwright: PASS — 6/6.
- Current live smoke: configured alpha `0.093`, lifetime `662 ms`, sampled maximum alpha `26/255`.
- Live heatmap pixel maximum: `66/255`, matching the 26% cap.
- All 208 rendered Home stock tiles retained their pixel fields.
- Reduced-motion behaviour continues to pass.
- Production container is running and healthy.

Evidence:

- `tools/playwright/output/playwright/market-cursors-20260818/results.json`
- `tools/playwright/output/playwright/market-cursors-20260818/target-cursor-snapped-1366x768.png`
- `tools/playwright/output/playwright/home-stock-pixel-card-20260818/results.json`
- `tools/playwright/output/playwright/home-stock-pixel-card-20260818/home-negative-stock-pixel-hover-1366x768.png`

## Deployment and rollback

Pre-change backup:

`/home/novius2/trading-stack/backups/cursor-pixel-transparency-20260819T061335Z`

Restore the five backed-up files and rebuild/recreate only `n50-dashboard` to roll back. No database or API migration is involved. OpenAPI/Swagger was not changed.
