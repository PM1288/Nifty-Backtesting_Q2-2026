# Current-State UI Audit

## Evidence reviewed

- Full V2 product specification (385 non-empty paragraphs).
- V2 token JSON.
- 64-screen catalogue: 45 P0, 16 P1 and 3 P2 screens.
- Codex review/rebuild/deployment specification.
- React routes, shared chrome, page CSS, API hooks, authentication gate and Playwright harness.
- Baseline screenshots for Home, Market, OIIS, Strategy Lab and Runs at desktop, laptop, tablet and mobile sizes.

## Findings

1. The product has two conflicting visual systems: a dark neon analytics shell and isolated light OIIS/backtesting pages.
2. The desktop navigation exposes a long implementation-oriented taxonomy rather than the stable product domains in the V2 specification.
3. The mobile header stacks audience, language, digits, feedback and authentication controls before the page content.
4. Existing pages already contain useful governed-data patterns—headers, context strips, ladders, run identity, freshness and failures—but they are not expressed consistently.
5. The Strategy Lab is the strongest existing vertical slice: it uses real APIs, governed parameters, run status, charts and consolidated CSV evidence.
6. Authentication is explicit and no longer auto-pops by default. It is not yet the Google-first/RBAC system described in the long-term specification.
7. React Query, ECharts, Lucide and a Playwright/Chromium harness are already available; replacing them would add risk without product benefit.
8. Not every catalogue screen has a backend contract. Creating placeholder routes would breach the specification and weaken operator trust.

## Safe target

Retain the current application and APIs, add a scoped V2 design-system layer, reorganise the active navigation, provide compatibility aliases, and progressively migrate working screens. Keep Home outside the new scope. This delivers a coherent operational experience without a high-risk rewrite or any business-logic change.
