## Title
Strategy leaderboard, stock report, lifecycle/system map, and camera guardrails

## Objective
Improve route discoverability and analysis quality by adding a clearer strategy leaderboard experience, a more structured stock-wise analysis report, a user-facing lifecycle/system map page, and a deny-by-default camera guardrail that keeps camera functionality out of scope until privacy review.

## Repo facts verified
- The React SPA is mounted under `/n50/` and `/n50-stage/`, with route definitions centralized in `neon-stock-terminal/apps/web/src/App.tsx`.
- Existing API contracts already expose enough data for this phase: `/v1/leaderboard`, `/v1/stocks/:symbol`, `/v1/backtesting/strategies`, `/v1/backtesting/compare`, `/v1/backtesting/strategies/:strategyId`, and `/v1/analytics/quality`.
- The system section already exists in the shell and currently points to the Trust Board route.
- Camera APIs are not currently used in app code; the current ingress policy explicitly denies camera via `Permissions-Policy: camera=()`.

## Files inspected
- `docs/endpoints.md`
- `neon-stock-terminal/apps/api/src/routes/overview.ts`
- `neon-stock-terminal/apps/api/src/routes/stocks.ts`
- `neon-stock-terminal/apps/api/src/routes/backtesting.ts`
- `neon-stock-terminal/apps/web/src/lib/api.ts`
- `neon-stock-terminal/apps/web/src/lib/hooks.ts`
- `neon-stock-terminal/apps/web/src/lib/types.ts`
- `neon-stock-terminal/apps/web/src/App.tsx`
- `neon-stock-terminal/apps/web/src/pages/LandingPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/AnalyticsStockPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/BacktestingOverviewPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/BacktestingStrategyLibraryPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/BacktestingStrategyDetailPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/BacktestingComparePage.tsx`
- `neon-stock-terminal/apps/web/src/pages/AnalyticsQualityPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/AnalyticsChrome.tsx`
- `compose/nginx/nginx.conf`
- `compose/n50-nginx/nginx.conf`
- repo-wide search for camera/webcam/media APIs

## Plan
1. Add a resumable system-map route under the existing system section and wire it into route tabs, shell discoverability, and endpoint docs.
2. Improve the strategy library into a clearer leaderboard using existing backtesting strategy and compare snapshots rather than inventing new backend metrics.
3. Rework the stock analytics page into a more structured report by combining current intraday explanation with existing historical stock detail and related strategy relevance.
4. Add a repository guardrail that fails if camera APIs are introduced, keep the existing deny-by-default header policy, and document the camera stance with an ADR/worklog.
5. Run type/build validation, then complete desktop/mobile Playwright checks for the updated routes and interlinks.

## Changes made
- Added a new user-facing lifecycle/system map route at `/analytics/system/map` and wired it through the SPA route tree, preload helpers, analytics system tabs, and shell navigation so users can discover the Collect -> Transform -> Publish -> Serve -> Trust flow from within the product.
- Created `AnalyticsSystemMapPage.tsx` with plain-language lifecycle explanations, next-route guidance, a deterministic relationship map, and cross-links to Market Hub, Strategy Leaderboard, Stock Report, Trust Board, and Option Chain without exposing sensitive implementation details.
- Reworked the backtesting strategy surface into a clearer Strategy Leaderboard using existing backtesting strategy and compare snapshots. The page now highlights the active comparison lens, key ranking cards, ranked strategy evidence, and explicit next-step links to compare and the system map.
- Reworked the stock analysis route into a structured Stock Report using existing overview, stock history, intraday signal, and strategy-fit data. The page now presents a quick read, market context, stock-specific signals, strategy relevance, and product-routing links in a report-style hierarchy.
- Standardized user-facing navigation/copy from “Strategy Library” to “Strategy Leaderboard” across the shell, backtesting tabs, and locale files.
- Added a deny-by-default camera guardrail script at `neon-stock-terminal/scripts/check-no-camera.mjs`, exposed it through `guard:camera` in `neon-stock-terminal/package.json`, and documented the privacy posture in a new ADR.
- Updated core docs so the new route appears in the public route inventory and product surface map.

## Validation run
- `corepack pnpm --dir neon-stock-terminal --filter @app/web typecheck`
- `corepack pnpm --dir neon-stock-terminal --filter @app/web build`
- `node neon-stock-terminal/scripts/check-no-camera.mjs`
- `corepack pnpm --dir neon-stock-terminal guard:camera`
- `docker compose build n50-dashboard n50-dashboard-stage`
- `docker compose up -d n50-dashboard n50-dashboard-stage nginx`
- `curl.exe -s -D - http://localhost:19090/n50/ -o NUL`
- `curl.exe -s -D - http://localhost:19090/n50/analytics/system/map -o NUL`
- `curl.exe -s -D - http://localhost:19090/auth/csrf -o NUL`
- `curl.exe -s -D - http://localhost:19090/option-chain/api/latest -o NUL`
- `curl.exe -s http://localhost:19090/n50/health`
- `curl.exe -s http://localhost:19090/n50-stage/health`
- Playwright browser audit on desktop and mobile for `/`, `/analytics/system/map`, `/backtesting/strategies`, and `/analytics/stock/RELIANCE`
- Verified in-browser interlinks:
  - system map -> strategy leaderboard
  - stock report -> system map
- Confirmed `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()` is still present on the nginx-served routes.
- No camera permission prompt or camera-related console request appeared during the browser smoke run.

## Screens reviewed
- `output/playwright/strategy-leaderboard-stock-report-system-map-camera-guardrails/desktop/home-desktop-final.png`
- `output/playwright/strategy-leaderboard-stock-report-system-map-camera-guardrails/desktop/system-map-desktop-final.png`
- `output/playwright/strategy-leaderboard-stock-report-system-map-camera-guardrails/desktop/strategy-leaderboard-desktop-final.png`
- `output/playwright/strategy-leaderboard-stock-report-system-map-camera-guardrails/desktop/stock-report-desktop-final.png`
- `output/playwright/strategy-leaderboard-stock-report-system-map-camera-guardrails/mobile/home-mobile-final.png`
- `output/playwright/strategy-leaderboard-stock-report-system-map-camera-guardrails/mobile/system-map-mobile-final.png`
- `output/playwright/strategy-leaderboard-stock-report-system-map-camera-guardrails/mobile/strategy-leaderboard-mobile-final.png`
- `output/playwright/strategy-leaderboard-stock-report-system-map-camera-guardrails/mobile/stock-report-mobile-final.png`

## Decisions made
- Reused existing `/v1/backtesting/*`, `/v1/leaderboard`, `/v1/stocks/:symbol`, and overview snapshots instead of inventing new metrics or adding backend schema/routes for this phase.
- Kept the lifecycle/system map as a deterministic flow-and-routing page rather than a fake precision graph because the current product data does not justify a real relationship network.
- Treated camera support as intentionally absent product scope. The correct Phase 10 behavior is explicit denial plus a repo guardrail, not a dormant implementation path.
- Kept the ingress-level `Permissions-Policy: camera=()` as the effective enforcement layer and added an ADR requirement for any future camera introduction.

## Risks / follow-ups
- The guest auth overlay can still appear on long-idle protected/detail routes such as the stock report and intercept clicks during unattended review. It does not block direct route loads, but it remains a presentation-state issue for future UX hardening.
- New system-map and leaderboard copy is English-first. The route labels added in this phase are localized, but the long-form explanatory copy itself is not yet translated.
- Sector taxonomy labels remain domain-canonical English on the stock report, for example `Oil Gas & Consumable Fuels`.

## Resume here next time
- If you continue from here, the next sensible pass is a UX-only follow-up on the guest auth overlay behavior for long-idle detail pages plus deeper localization of the new explanatory copy.
