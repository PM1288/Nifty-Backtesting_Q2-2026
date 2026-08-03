## Title
System-first UI foundation: shell, tokens, templates, copy, and formatting discipline

## Objective
Tighten the shared design system and formatting layer so the app reads as one coherent product across prod and stage, with consistent shell behavior, page headers, primitives, copy tone, and locale-safe number formatting.

## Repo facts verified
- The React SPA lives under `neon-stock-terminal/apps/web` and is mounted at `/n50/` and `/n50-stage/`.
- Shared visual tokens already exist in `src/styles/tokens.css` but are thin and inconsistently applied.
- Shared primitives already exist in `src/components/ui/DashboardPrimitives.tsx`.
- App-level chrome is centered in `src/components/chrome/AppShell.tsx`.
- Most locale formatting is already routed through `src/lib/format.ts`; the remaining direct offender in the web app is a single `toLocaleString("en-IN")` call in `BacktestingStrategyDetailPage.tsx`.
- The current page-header pattern is split between `AnalyticsHeader` and a custom header implementation in `FeedbackPage.tsx`.

## Files inspected
- `neon-stock-terminal/apps/web/src/styles/tokens.css`
- `neon-stock-terminal/apps/web/src/styles/global.css`
- `neon-stock-terminal/apps/web/src/lib/format.ts`
- `neon-stock-terminal/docs/i18n/formatting-rules.md`
- `neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx`
- `neon-stock-terminal/apps/web/src/components/chrome/AppShell.module.css`
- `neon-stock-terminal/apps/web/src/components/chrome/AuthStatus.tsx`
- `neon-stock-terminal/apps/web/src/components/chrome/HeaderTicker.tsx`
- `neon-stock-terminal/apps/web/src/components/ui/DashboardPrimitives.tsx`
- `neon-stock-terminal/apps/web/src/components/ui/DashboardPrimitives.module.css`
- `neon-stock-terminal/apps/web/src/pages/AnalyticsChrome.tsx`
- `neon-stock-terminal/apps/web/src/pages/AnalyticsOverviewPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/AnalyticsStockPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/BacktestingOverviewPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/BacktestingChrome.tsx`
- `neon-stock-terminal/apps/web/src/pages/BacktestingStrategyDetailPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/FeedbackPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/LandingPage.tsx`
- `neon-stock-terminal/apps/web/src/App.tsx`

## Plan
1. Harden tokens with explicit spacing, radius, shadow, control-height, and surface semantics while preserving backward-compatible aliases.
2. Tighten shell and primitive CSS so spacing, radii, controls, and tables align visually.
3. Standardize header usage by reusing shared header patterns where pages still use custom markup.
4. Remove filler/internal copy in the shell and improve product-facing labels where needed.
5. Eliminate remaining ad hoc number formatting.
6. Run locale-aware Playwright QA in desktop, tablet, and mobile on representative routes and fix obvious defects before stopping.

## Changes made
- Tightened `src/styles/tokens.css` into a more explicit design-token layer for surfaces, semantic text colors, spacing, radii, shadows, and control heights without breaking existing token aliases.
- Hardened `src/styles/global.css` with inherited control colors, a consistent dark `color-scheme`, and stronger shared focus-visible treatment.
- Retuned `AppShell.module.css`, `DashboardPrimitives.module.css`, and `AnalyticsPage.module.css` to use the shared tokens more consistently, reduce overly soft rounding, and normalize control sizing and spacing across shell and page sections.
- Standardized shell/product copy in `AppShell.tsx`, `App.tsx`, and `index.html` so the brand line, fallback loading text, and locale-control labels read like one product instead of mixed internal/dev phrasing.
- Reused the shared `AnalyticsHeader` pattern in `FeedbackPage.tsx` instead of maintaining a separate page-header implementation.
- Hardened formatter usage in `src/lib/format.ts` by adding shared helpers for whole numbers, decimals, compact numbers, signed numbers, and day-duration display.
- Removed remaining visible ad hoc numeric formatting in:
  - `BacktestingStrategyDetailPage.tsx`
  - `AnalyticsFlowsPage.tsx`
  - `AnalyticsRegimePage.tsx`
  - `AnalyticsSimulatorPage.tsx`
  - `IndicatorEducationBlocks.tsx`
- Updated locale resources in `src/locales/en/common.json`, `src/locales/hi/common.json`, `src/locales/mr/common.json`, `src/locales/en/market.json`, `src/locales/hi/market.json`, and `src/locales/mr/market.json` so shell copy and the landing-page guidance blocks no longer fall back to English for the targeted Phase 7 strings.
- Updated `docs/i18n/formatting-rules.md` so the current-state note matches the remaining formatter debt: visible page-level formatting now routes through `src/lib/format.ts`, while the few remaining `.toFixed(...)` calls are internal calculations or CSS-value generation.

## Validation run
- `corepack pnpm --dir neon-stock-terminal --filter @app/web typecheck` passed.
- `npm run build --workspace=@app/web` passed.
- `docker compose build n50-dashboard n50-dashboard-stage` passed.
- `docker compose up -d n50-dashboard n50-dashboard-stage nginx` passed.
- Health checks passed:
  - `http://localhost:19090/n50/health`
  - `http://localhost:19090/n50-stage/health`
  - `http://localhost:19090/option-chain/api/latest`
- Playwright shell/product QA completed for representative routes across desktop, tablet, and mobile:
  - home
  - stock detail
  - backtesting overview
  - options
  - feedback
- Locale QA completed on the landing page for:
  - English + Latin digits
  - Hindi + Latin digits
  - Marathi + Devanagari digits
- Targeted locale leak checks passed for the previously uncovered strings such as `Open the visual guide`, `Use this before the simulator`, `Leading sector`, `Market story and leadership`, and `Broad weakness`.

## Screens reviewed
- Desktop:
  - `output/playwright/system-first-ui-foundation-shell-tokens-formatting/desktop/home-en-desktop.png`
  - `output/playwright/system-first-ui-foundation-shell-tokens-formatting/desktop/stock-reliance-en-desktop.png`
  - `output/playwright/system-first-ui-foundation-shell-tokens-formatting/desktop/backtesting-en-desktop.png`
  - `output/playwright/system-first-ui-foundation-shell-tokens-formatting/desktop/options-en-desktop.png`
  - `output/playwright/system-first-ui-foundation-shell-tokens-formatting/desktop/feedback-en-desktop.png`
- Tablet:
  - `output/playwright/system-first-ui-foundation-shell-tokens-formatting/tablet/home-en-tablet.png`
  - `output/playwright/system-first-ui-foundation-shell-tokens-formatting/tablet/backtesting-en-tablet.png`
- Mobile:
  - `output/playwright/system-first-ui-foundation-shell-tokens-formatting/mobile/home-en-mobile.png`
  - `output/playwright/system-first-ui-foundation-shell-tokens-formatting/mobile/feedback-en-mobile.png`
- Locale:
  - `output/playwright/system-first-ui-foundation-shell-tokens-formatting/locale/home-hi-latn-desktop.png`
  - `output/playwright/system-first-ui-foundation-shell-tokens-formatting/locale/home-mr-deva-desktop.png`

## Decisions made
- Use a safe Phase 1 consolidation pass: strengthen shared primitives and shell first instead of rewriting many pages.
- Treat a few remaining `.toFixed(...)` calls as acceptable because they feed analytics payloads, chart bounds, or CSS alpha values rather than customer-facing text.
- Treat sector taxonomy labels and canonical sector names as follow-up localization work instead of trying to translate domain naming heuristically during this design-system pass.

## Risks / follow-ups
- The landing page still exposes some English/domain taxonomy labels in Hindi and Marathi, especially `STRONGEST SECTOR`, `WEAKEST SECTOR`, and canonical sector names such as `Oil Gas & Consumable Fuels`. Those are now isolated follow-up localization debt rather than fallback-copy bugs.
- Guest review on `/n50/options` can surface the auth gate after idle time, which makes clean long-lived mobile/tablet screenshot capture fragile. The route itself remained functional during the Phase 7 checks.
- Console noise from blocked Google analytics/tag-manager calls remains under the hardened CSP but is not caused by the Phase 7 UI changes.

## Resume here next time
- If Phase 7 needs a follow-up pass, start with localized taxonomy labels on the landing page and then audit whether those labels should remain canonical market English or receive translated display aliases.
