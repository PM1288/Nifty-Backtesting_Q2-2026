## Title
Route-by-route UX hardening, mobile/tablet responsiveness, and overlay clarity

## Objective
Polish the highest-traffic routes so mobile, laptop, tablet, and desktop layouts remain readable, touch-friendly, and visually clear, especially on options, backtesting, analytics, heatmap, and feedback surfaces.

## Repo facts verified
- The React SPA routes for this phase live under `neon-stock-terminal/apps/web/src/pages`.
- Shared route chrome is centralized in `AnalyticsChrome.tsx`, `BacktestingChrome.tsx`, `AnalyticsPage.module.css`, and `AppShell.module.css`.
- The shell already uses a sticky header and sticky left navigation, which means overflow, collision, and cramped-control fixes should be applied systemically first.
- Existing Playwright artifacts from Phase 7 already cover representative desktop/tablet/mobile states and expose a few real pressure points in the shell and route headers.

## Files inspected
- `neon-stock-terminal/apps/web/src/App.tsx`
- `neon-stock-terminal/apps/web/src/pages/AnalyticsChrome.tsx`
- `neon-stock-terminal/apps/web/src/pages/BacktestingChrome.tsx`
- `neon-stock-terminal/apps/web/src/pages/AnalyticsOptionsPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/AnalyticsOverviewPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/AnalyticsRegimePage.tsx`
- `neon-stock-terminal/apps/web/src/pages/AnalyticsSupportingMetricsPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/AnalyticsStockPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/BacktestingOverviewPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/BacktestingStrategyLibraryPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/BacktestingStrategyDetailPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/BacktestingComparePage.tsx`
- `neon-stock-terminal/apps/web/src/pages/BacktestingRunsPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/ChangeHeatmapPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/FeedbackPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/AnalyticsQualityPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/AnalyticsPage.module.css`
- `neon-stock-terminal/apps/web/src/components/chrome/AppShell.module.css`
- `neon-stock-terminal/apps/web/src/components/ui/DashboardPrimitives.module.css`

## Plan
1. Audit the shared shell and route chrome for the biggest responsiveness faults: top-right header crowding, header-band collapse, tabs/filters on tablet, and dense chart/table sections on mobile.
2. Patch systemic layout rules first in the shell, page chrome, and shared primitives.
3. Apply route-specific fixes only where the shared layer does not solve the issue, prioritizing options, backtesting, stock detail, heatmaps, and feedback.
4. Run Playwright audits across desktop, laptop, tablet, and mobile, then fix any obvious overflow, clipping, or overlay dominance before stopping.

## Changes made
- Tightened the shared shell top bar so audience/language/digits controls, feedback entry, and auth status wrap cleanly instead of colliding on tablet and mobile widths.
- Split the app-shell utility area into a preference stack and utility cluster to preserve touch-target sizing and reduce cramped header density.
- Hardened the auth-status control so guest/signed-in states stay readable within narrow shells without forcing horizontal overflow.
- Converted the shared page header band to a more intentional grid collapse on tablet so page title, freshness, and action controls do not fight for the same row.
- Tuned shared analytics page chrome so chart headers, toggle rows, and control grids collapse earlier and more predictably on tablet and small mobile widths.
- Changed shared section tabs to horizontal-scroll behavior on narrower screens instead of tall multi-row wraps that weakened hierarchy and made dense pages harder to scan.
- Corrected a stock-detail formatting bug in `AnalyticsStockPage.tsx` where percentage values were being multiplied before formatting, which caused impossible signal displays and damaged product trust.
- Improved stock-detail copy rendering by humanizing underscored and hyphenated labels before they are shown in dominant-signal and market-state summaries.
- Fixed the remaining Hindi and Marathi landing-page CTA translation leaks for “Heatmaps & Signals” and the strategy-lab support-check copy.

## Validation run
- `corepack pnpm --dir neon-stock-terminal --filter @app/web typecheck`: passed
- `npm run build --workspace=@app/web` (from `neon-stock-terminal`): passed
- `docker compose build n50-dashboard n50-dashboard-stage`: passed
- `docker compose up -d n50-dashboard n50-dashboard-stage nginx`: passed
- Targeted responsive audit run across representative high-traffic routes with Playwright at desktop, laptop, tablet, and mobile widths
- Post-fix locale audit rerun on the rebuilt bundle for Hindi + Devanagari and Marathi + Devanagari landing-page states
- Horizontal overflow spot-checks on the previously risky routes returned no reproduced horizontal overflow after the shared shell/header fixes

## Screens reviewed
- `output/playwright/route-by-route-ux-hardening-mobile-tablet-overlay-clarity/desktop/home-en-latn-desktop.png`
- `output/playwright/route-by-route-ux-hardening-mobile-tablet-overlay-clarity/desktop/options-en-latn-desktop.png`
- `output/playwright/route-by-route-ux-hardening-mobile-tablet-overlay-clarity/laptop/analytics-stock-reliance-en-latn-laptop.png`
- `output/playwright/route-by-route-ux-hardening-mobile-tablet-overlay-clarity/laptop/backtesting-compare-en-latn-laptop.png`
- `output/playwright/route-by-route-ux-hardening-mobile-tablet-overlay-clarity/tablet/analytics-regime-en-latn-tablet.png`
- `output/playwright/route-by-route-ux-hardening-mobile-tablet-overlay-clarity/tablet/backtesting-strategies-en-latn-tablet.png`
- `output/playwright/route-by-route-ux-hardening-mobile-tablet-overlay-clarity/tablet/heatmap-change-en-latn-tablet.png`
- `output/playwright/route-by-route-ux-hardening-mobile-tablet-overlay-clarity/mobile/home-en-latn-mobile.png`
- `output/playwright/route-by-route-ux-hardening-mobile-tablet-overlay-clarity/mobile/supporting-metrics-en-latn-mobile.png`
- `output/playwright/route-by-route-ux-hardening-mobile-tablet-overlay-clarity/mobile/feedback-en-latn-mobile.png`
- `output/playwright/route-by-route-ux-hardening-mobile-tablet-overlay-clarity/locale/home-hi-deva-mobile.png`
- `output/playwright/route-by-route-ux-hardening-mobile-tablet-overlay-clarity/locale/home-mr-deva-mobile.png`

## Decisions made
- Fixed the shell/header systemically first instead of introducing per-page spacing hacks, because the worst crowding came from shared chrome.
- Kept dense backtesting surfaces as tables/lists instead of cardifying them, since scan speed and comparison are the core job on those routes.
- Solved the most visible trust issue in stock analytics through the shared formatting path rather than masking it in presentation copy.
- Patched the exact-string locale keys in the translation files instead of hardcoding one-off replacements inside landing-page components.

## Risks / follow-ups
- Some sector and taxonomy labels remain English or domain-canonical in localized landing-page views, for example `Oil Gas & Consumable Fuels`.
- The guest auth gate can still appear on long-lived `/n50/options` sessions, which makes unattended screenshot capture noisier even though the route remains usable.
- Expected CSP-blocked third-party analytics noise is still present in browser console output and is unrelated to these UI fixes.

## Resume here next time
- If this phase needs another pass, start with localized market taxonomy labels and then review whether the options guest gate should present a calmer timed-out state for tablet/mobile observers.
