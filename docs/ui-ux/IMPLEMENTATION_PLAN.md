# Trading Platform UI/UX V2 Implementation Plan

Date: 2026-08-09

Authority: `UI-REDESIGN/` product specification, screen catalogue and design tokens

Scope: the React/Vite application in `neon-stock-terminal/apps/web`

## Product decision

The existing Home route (`/`) is a protected surface and remains visually and functionally unchanged. Every other active route is an operational or research workspace and receives the V2 design system through the scoped `data-ui-generation="trading-v2"` boundary. This prevents token leakage into Home and supports an incremental rollback.

The UI remains a presentation layer. PostgreSQL-backed APIs remain authoritative for strategy logic, validation, P&L, ladders, regimes, data freshness and paper-trade state. The browser must not recalculate these values.

## Delivery batches

1. **Design-system foundation** — scoped colour, typography, spacing, elevation, focus, density and reduced-motion tokens; reusable status, identity, freshness and failure components.
2. **Application shell** — white 64 px header, navy 216/72 px rail, responsive drawer, compact controls and a persistent PAPER/data-context strip. Home keeps the legacy shell.
3. **Information architecture** — stable, role-oriented groups backed only by implemented routes: Market, OIIS, Stocks, Strategies, Backtests, Options, Research and Operations. No placeholder destinations.
4. **Existing-screen migration** — bridge existing page variables into V2 tokens so the working analytics, OIIS and backtesting pages become consistent without changing their data contracts.
5. **Route compatibility** — add `/dashboard/*` aliases only where a real target screen exists; preserve all legacy URLs.
6. **Validation** — type-check, lint, build, route/overflow/accessibility checks and screenshots at 430, 1024, 1440 and 1920 px. Validate Home has no V2 scope.
7. **Deployment** — build and deploy through the existing Nginx/Compose project, smoke-test public routes, update handoff and push the reviewed branch.

## Acceptance criteria

- Home has no V2 scope and retains its existing navigation, header and content.
- Non-home screens use a light canvas, white panels, navy navigation and semantic non-colour status cues.
- Navigation contains no dead or invented pages.
- Keyboard focus is visible; controls meet a 44 px mobile target; motion respects `prefers-reduced-motion`.
- Pages do not introduce horizontal document overflow at the four required breakpoints.
- Existing API routes, authentication flow and business semantics remain unchanged.
- Build, lint and browser regression checks pass before deployment.

## Explicitly deferred

The supplied catalogue describes screens whose authoritative APIs do not yet exist, including full RBAC administration, a paper-trading blotter/account suite and derivatives execution workbenches. They are not represented by fake data or empty routes. They remain roadmap items until governed API contracts exist.
