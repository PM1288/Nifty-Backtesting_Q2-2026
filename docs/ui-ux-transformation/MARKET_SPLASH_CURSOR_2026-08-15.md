# NIFTY-driven Splash Cursor

## Outcome

Deployed 15 August 2026. A ReactBits Splash Cursor-inspired interaction layer is mounted once in the
authenticated application shell and is available across every dashboard on fine-pointer devices.

The upstream ReactBits component uses a continuously simulated WebGL fluid framebuffer. The trading UI
uses a deliberately bounded Canvas 2D adaptation: it performs no animation-frame work while idle, paints
only in response to mouse/pen movement or click, and retains the product's existing accessibility and
performance controls.

## Market semantics

- Splash hue uses the same NIFTY scale as the shared gradient waves: positive green, neutral amber within
  inclusive `±0.20%`, and negative red.
- Absolute NIFTY movement increases splash opacity and radius, using the same bounded brilliance value.
- NIFTY RSI distance from 50 shortens splash lifetime at momentum extremes.
- Missing quote/RSI data uses the neutral/calm fallback; no value is invented.

## Interaction and safety

- `pointer-events: none`; the canvas cannot block links, charts, tables, dialogs or controls.
- Touch pointers are ignored so scrolling and chart gestures remain unchanged.
- `prefers-reduced-motion`, coarse-pointer devices, Calm mode, Pause motion and hidden browser tabs disable
  the effect and clear outstanding droplets.
- Animation frames run only while droplets exist and stop automatically afterwards.
- Maximum live droplet count is 120.
- Device pixel ratio is capped at 2 to bound canvas memory.
- Window/media/document listeners and pending animation frames are removed on unmount.
- No API, schema, collector or trading-path change was introduced.

## Changed files

- `neon-stock-terminal/apps/web/src/components/visual/marketSplashCursor.ts`
- `neon-stock-terminal/apps/web/src/components/visual/MarketSplashCursor.tsx`
- `neon-stock-terminal/apps/web/src/components/visual/MarketSplashCursor.module.css`
- `neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx`
- `neon-stock-terminal/apps/web/tests/marketGradientWaves.test.ts`
- `tools/playwright/market-gradient-waves-regression.mjs`

## Validation

- Web tests: 27/27 passed.
- TypeScript and Vite production build: passed, 2,490 modules transformed.
- Final authenticated browser matrix: 166/166 passed.
- Matrix covers eight representative routes at desktop and mobile widths.
- Every route contains one shared cursor, it remains click-through, and reduced motion hides it.
- An ordinary-motion desktop pass painted 653 sampled non-transparent pixels and then navigated to Markets
  through the canvas layer successfully.
- The first expanded run recorded one transient `ERR_NETWORK_CHANGED` console event and remains recorded as
  165/166; the clean rerun passed all 166 checks.

Evidence:

- `output/playwright/market-splash-cursor-20260815-pass/results.json`
- `output/playwright/market-splash-cursor-20260815-pass/desktop-1366x768-splash-cursor.png`
- `output/playwright/market-splash-cursor-20260815-pass/desktop-1366x768-dashboard.png`
- `output/playwright/market-splash-cursor-20260815-pass/mobile-390x844-dashboard.png`

## Deployment and rollback

- Image: `sha256:866d83030844325c6be01d17d0cde4c441d40d892132e0410eacfb10ef5ef4e2`
- Container: `trading-stack-novius2-n50-dashboard-1` — healthy
- Public application: HTTP 200
- Backup: `/home/novius2/trading-stack/backups/market-splash-cursor-20260815T083500Z`

Rollback restores the backed-up `AppShell.tsx`, removes the three splash files, and rebuilds/recreates only
the N50 dashboard service. No database operation is required.
