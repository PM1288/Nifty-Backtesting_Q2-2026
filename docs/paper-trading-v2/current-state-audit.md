# Paper Trading V2 current-state audit

Audit started: 2026-08-22 UTC
Production-equivalent route: `https://n50.nifty50today.co.in/n50/paper-trading`
Delivery source: `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal`
Runtime/deployment stack: `/home/novius2/trading-stack`

## Architecture

| Concern | Current owner | Evidence |
|---|---|---|
| Frontend | React 18, TypeScript, Vite 5 | `apps/web/package.json` |
| Route | Lazy route `/paper-trading` | `apps/web/src/App.tsx` |
| Main page | One monolithic command-centre component | `apps/web/src/pages/PaperTradingCommandCenter.tsx` |
| Styling | CSS modules plus shared design-system primitives | `PaperTradingCommandCenter.module.css`, `apps/web/src/design-system/` |
| Query state | Page-local React state and `fetch`; credentials use the server session cookie | `usePaperData()` in the page |
| Authentication | `useAuthGate()` client gate plus server session enforcement on mutations | `AuthGateProvider`, API auth guard |
| List API | `GET /v1/workspace/paper-trading` | `apps/api/src/routes/workspace.ts` |
| Detail API | `GET /v1/workspace/paper-trading/trades/:tradeGroupId` | same route module |
| Create trade | `POST /v1/workspace/paper-trading/manual-trades` with CSRF and PAPER-only service adapter | same route module |
| Comments | Admin-only GET/POST, persisted in PostgreSQL | `paper_trading.trade_comments` |
| Quality review | Admin-only POST, versioned and superseding | `paper_trading.trade_quality_reviews` |
| Audit | Immutable events plus request-audit rows | `paper_trading.trade_events`, `paper_trading.request_audit` |
| Canonical ledger | PostgreSQL `paper_trading` schema | positions, groups, legs, fills, P&L ledger, target tracks, horizon outcomes |
| Market path | Canonical one-minute bars | `public.bars_1m` |
| Latest carry mark | SmartAPI quote cache with explicit position-mark fallback | `public.instrument_state` |
| Entry evidence | Point-in-time OIIS candidate snapshot at or before entry | `oiis_live.daily_candidate` |
| Trade quality | Versioned deterministic policy/projector | `apps/api/src/lib/tradeQuality.ts` |
| Fixed capital | Chronological isolated-strategy simulator | `apps/api/src/lib/paperCapitalSimulation.ts` |
| Charts | Repository-native SVG for Paper Trading; ECharts is already available elsewhere | page and `apps/web/package.json` |
| Tables | Native semantic HTML table; no data-grid dependency | page |
| Global navigation | Existing responsive shell, workspace navigation, command palette and central shortcut registry | `apps/web/src/components/chrome`, `apps/web/src/interaction` |

## Current surfaces and ownership

The existing page exposes all of the following and V2 must preserve each one:

1. Paper/environment header and add-trade action.
2. Portfolio/quality top-level views.
3. Evidence-maturity summary and execution/observation KPIs.
4. OIIS factor contour with five factor-pair modes and five outcome modes.
5. First-governed fixed-capital simulations for ₹1L, ₹2L, ₹5L and ₹10L allocations.
6. Swing-only fixed-capital simulations using the same allocation choices.
7. Year, week and intraday-event heatmaps.
8. Five-session and thirty-session reward-versus-pain views.
9. Target conversion and attention list.
10. Complete trade-evidence table and mobile cards.
11. Low/medium/high target-exit scenarios.
12. Observation monitor, related journeys and methodology accordions.
13. Canonical trade drawer: journey, targets, evidence, comments and audit.
14. “What good looks like” policy, quality matrix, criteria, manual evidence review and all-trade quality register.

## Formula ownership and important invariants

- `paperTradeProjection()` is the single API projection for displayed per-trade economics and evidence.
- `realised_pnl` is net of modelled costs/tax; `unrealised_pnl` is a gross open mark. Their compatibility sum is mixed basis and must never be labelled as booked total.
- D0 15:30 uses the final accepted entry-session one-minute close only when the entry-session series is complete.
- D+5 and D+30 both begin at entry. Until D+5 matures they use the same current carry mark; D+5 then freezes while the inclusive D+30 observation continues.
- Intraday target windows close on D0; missed intraday targets cannot remain pending on the next trading day.
- Swing target tracking begins after D0 and follows its versioned window.
- Target first-hit chronology comes from durable target tracks/hits, not component inference.
- Never-closed carry and the ₹6,000 stop are counterfactual gross paths and remain outside booked accounting.
- Fixed ₹2 lakh values use whole cash-equity shares. Captured trade quantity remains the F&O-derived quantity recorded when the paper trade opened.
- Fixed ₹10 lakh simulations use isolated entry-strategy ledgers; capital never crosses between strategies.
- The swing-only simulation ignores all intraday hits.

## Permissions and safety

- Viewing the workspace uses the authenticated application session.
- Paper trade creation uses the same server-side session/CSRF path as the existing button and calls only the configured paper service.
- Comment and quality-review operations require the `admin` role server-side and write audit records.
- Comments are omitted from list/detail responses for non-admin users.
- The UI does not expose a LIVE order endpoint and no development test may place a broker order.

## Current loading, error, empty and freshness behaviour

- Initial state: `Loading durable PAPER observations…`.
- Slow state starts at three seconds; the request is aborted safely after sixty seconds.
- API failures expose the exact status/body and an explicit retry.
- An empty durable ledger shows one compact paper-only state.
- The response exposes a workspace `asOf`, latest position mark, open data incidents, observation statuses and per-trade source timestamps.
- Missing and zero are distinguished in most table/path fields, but the legacy `number()` helper still coerces missing values to zero in selected aggregate-only code. V2 metric presentation must use explicit availability metadata.

## Existing tests

| Layer | Current evidence |
|---|---|
| API unit/route | `workspace.paper.test.ts`, `paperCapitalSimulation.test.ts`, `tradeQuality.test.ts` |
| Web unit | `paperAtlas.test.ts`, `paperOiisSurface.test.ts` |
| Browser regression | `/home/novius2/trading-stack/tools/playwright/paper-*.mjs` |
| Build/type | workspace pnpm scripts |
| OpenAPI | dashboard OpenAPI validation suite |

## Baseline screenshots

The immutable before-state is stored under:

`/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/docs/paper-trading-v2/screenshots/before`

Captured viewports:

- 1920 × 1080
- 1600 × 900
- 1440 × 900
- 1366 × 768

The capture manifest is `baseline-results.json`. It records route success, viewport/body widths, page height, headings, console errors and failed requests. External analytics collection is ignored as non-product traffic; product API/console failures remain fatal.

## Current usability findings

1. The page is a long sequence rather than a persistent workspace; section state is not shareable.
2. Unlike accounting classes have similar weight and their definitions are often remote from the number.
3. The evidence table contains the required evidence but uses a very wide single header row and rotated target labels.
4. The drawer is strong but lacks explicit Economics and Calculation Trace tabs.
5. Paper-specific export and saved-view behaviour are absent.
6. Several SVG charts expose an accessible name but not a colocated complete underlying-data inspector.
7. Chart selection generally opens the canonical inspector, but cross-filter state is not represented in the URL.
8. The page-local state/query code is large and should migrate incrementally to tested view models instead of duplicating canonical formulas in components.

## V2 migration and rollback

- Keep `/paper-trading` and every API contract stable.
- Add typed metric metadata, URL-backed context, section navigation and reusable workbench components around the existing canonical surfaces.
- Preserve the existing Portfolio and What Good Looks Like views.
- Do not change PostgreSQL schema or collector behaviour for this UI phase.
- Deployment rollback is the prior dashboard image/source backup; no data rollback is required for frontend-only structural changes.
- Remove no existing surface until field and screenshot reconciliation confirms it remains accessible in V2.
