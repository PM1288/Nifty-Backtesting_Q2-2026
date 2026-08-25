# Header and ticker attachment fix — 2026-08-24

## Scope

Correct the global market ticker/header composition without changing quote data, APIs, authentication, workspace routes, or dashboard business logic.

## Root cause

- The rendered desktop header was approximately 81 px high while the sticky workspace navigation used a 74 px offset. This allowed sticky layers to overlap and made the navigation appear detached from the header.
- The market ticker used a continuously translated, duplicated marquee. It could enter the viewport mid-value and looked like a floating layer rather than part of the application chrome.
- On mobile, the NIFTY 50 quote was a separately fixed right-side slot over the moving tape. It clipped ticker content and was visually disconnected from the rail.

## Implementation

- Matched the shell's declared sticky header heights to the rendered heights: 81 px desktop and 89 px mobile.
- Gave the application bar explicit 44 px desktop and 52 px mobile heights.
- Made the ticker rail a full-height row inside the sticky header and aligned its horizontal gutters with the application bar.
- Replaced the autonomous duplicated marquee with one stable, horizontally scrollable ticker list.
- Moved the compact mobile NIFTY 50 quote to a leading rail cell so it participates in the same grid and cannot float over ticker values.
- Retained keyboard access to the ticker rail and list semantics for assistive technology.

## Files changed

- `neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx`
- `neon-stock-terminal/apps/web/src/components/chrome/AppShell.module.css`
- `neon-stock-terminal/apps/web/src/components/chrome/HeaderTicker.tsx`
- `neon-stock-terminal/apps/web/src/components/chrome/HeaderTicker.module.css`
- `neon-stock-terminal/apps/web/src/components/chrome/TickerTape.tsx`
- `neon-stock-terminal/apps/web/src/components/chrome/TickerTape.module.css`
- `tools/playwright/responsive-navigation-regression.mjs` (refreshes the mobile `More` locator after navigation)

The header/ticker attachment changes were applied to both the source tree and the deployed integration tree at `/home/novius2/trading-stack`. Pre-existing differences in the broader shell (including source-side paper voice controls and numeric-font work) were preserved rather than overwritten.

## Validation

- Production dashboard image rebuilt and `n50-dashboard` recreated.
- Local gateway returned HTTP 200 at `http://127.0.0.1:19090/n50/`.
- Desktop 1440 x 900: header 81 px; workspace navigation begins at y=81; measured seam 0 px.
- Mobile 390 x 844: header 89 px; app bar and ticker occupy one continuous sticky header.
- Both viewports: 33 ticker items, ticker transform `none`, no document-level horizontal overflow, and no captured console errors.
- Responsive navigation regression: 116/118 checks passed across nine viewports. The two failures were console-only upstream HTTP/WebSocket 502 responses during the multi-route run; no layout, route, overflow, sheet, or header check failed.
- Source-tree `git diff --check` passed for the six changed chrome files.

## Visual evidence

- `output/playwright/header-ticker-fix-20260824/desktop-1440x900.png`
- `output/playwright/header-ticker-fix-20260824/mobile-390x844.png`

## Rollback

Restore the six files listed above from the prior deployment snapshot, rebuild `trading-stack-n50-dashboard:latest`, and recreate only the `n50-dashboard` service with `--no-deps`.
