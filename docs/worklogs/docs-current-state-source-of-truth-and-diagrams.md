# Create One Current-State Source of Truth and Lifecycle / Network Diagrams

## Objective

Create a single current-state documentation path for engineers and product reviewers, align the core stack docs, and add lifecycle/network diagrams that match the deployed N50 stage/prod architecture.

## Repo facts verified

- The browser app is a same-origin React SPA mounted under `/n50/` for PROD and `/n50-stage/` for STAGE.
- `compose/nginx/nginx.conf` is the live ingress source of truth for prod, stage, proxied APIs, Matomo, and option-chain paths.
- The core current-state docs are `README.md`, `docs/endpoints.md`, `docs/stack-current.md`, `docs/product-surface-map.md`, and `docs/n50-stage-prod-hosting.md`.
- `docs/ARCHITECTURE.md` is stale relative to the current N50 deployment shape.
- `neon-stock-terminal/README.md` is module-scoped and not a reliable current deployed-stack source of truth by itself.
- Route inventory in `neon-stock-terminal/apps/web/src/App.tsx` matches the current React product surface documented in `docs/product-surface-map.md`.
- Sidebar/navigation behavior in `neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx` matches the visible vs hidden navigation distinctions in the product-surface docs.

## Files inspected

- `README.md`
- `docs/endpoints.md`
- `docs/stack-current.md`
- `docs/product-surface-map.md`
- `docs/n50-stage-prod-hosting.md`
- `docs/ARCHITECTURE.md`
- `docs/stack-container-inventory-2026-03-13.md`
- `docs/grafana.md`
- `docs/codex-summary.md`
- `neon-stock-terminal/README.md`
- `neon-stock-terminal/apps/web/src/App.tsx`
- `neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx`

## Plan

1. Create `docs/SOURCE_OF_TRUTH.md` as the canonical doc index and escalation order.
2. Create `docs/ARCHITECTURE_CURRENT.md` as the live current-state architecture description.
3. Add Mermaid diagrams for system context, request flow, data lifecycle, stage/prod topology, and user navigation flow.
4. Update core docs so README clearly points to the new doc chain and the core current-state docs agree on routes and deployment shape.
5. Mark stale or legacy docs as historical instead of leaving them ambiguous.
6. Validate the README -> SOURCE_OF_TRUTH -> ARCHITECTURE_CURRENT path and re-check core docs for route/path contradictions.

## Changes made

- Added the new current-state doc chain:
  - `docs/SOURCE_OF_TRUTH.md`
  - `docs/ARCHITECTURE_CURRENT.md`
- Added Mermaid diagrams:
  - `docs/diagrams/system-context.mmd`
  - `docs/diagrams/request-flow.mmd`
  - `docs/diagrams/data-lifecycle.mmd`
  - `docs/diagrams/stage-prod-topology.mmd`
  - `docs/diagrams/user-navigation-flow.mmd`
- Updated `README.md` so the main repo landing page now points engineers directly to the current-state doc chain instead of leaving them to infer it from older phase docs.
- Updated the core current-state docs to carry current-review headers and point back to the new source-of-truth path:
  - `docs/endpoints.md`
  - `docs/stack-current.md`
  - `docs/product-surface-map.md`
  - `docs/n50-stage-prod-hosting.md`
- Marked stale/ambiguous docs explicitly as historical:
  - `docs/ARCHITECTURE.md`
  - `docs/grafana.md`
  - `docs/codex-summary.md`
- Updated `neon-stock-terminal/README.md` to make it clear that it is module-scoped and not the primary deployed-stack source of truth.
- Kept useful history in place rather than deleting it; the new index doc now tells readers which docs are authoritative vs historical.

## Validation run

- Manual documentation path validation:
  - followed `README.md` -> `docs/SOURCE_OF_TRUTH.md` -> `docs/ARCHITECTURE_CURRENT.md`
  - confirmed the new chain is explicit and discoverable from the repo root
- Core current-state contradiction pass:
  - reviewed `README.md`
  - reviewed `docs/endpoints.md`
  - reviewed `docs/stack-current.md`
  - reviewed `docs/product-surface-map.md`
  - reviewed `docs/n50-stage-prod-hosting.md`
  - confirmed agreement on:
    - PROD base path `/n50/`
    - STAGE base path `/n50-stage/`
    - prod hostname `m.nifty50today.co.in`
    - stage hostname `stage.nifty50today.co.in`
    - separate `/option-chain/*` service path
    - same-origin `/matomo/*` proxy path
- Code-backed route verification:
  - checked `neon-stock-terminal/apps/web/src/App.tsx`
  - checked `neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx`
  - confirmed the route tree and visible vs hidden navigation documented in `docs/product-surface-map.md` still match the live React shell
- Mermaid validation:
  - rendered all five diagrams successfully through the Mermaid tool
  - no syntax errors in the new `.mmd` files

## Screens reviewed

- Not applicable.
- This task only adds engineering/product documentation and Mermaid source files; it does not add a new user-facing page.

## Decisions made

- Keep useful historical docs in place, but mark them explicitly as historical/deprecated instead of deleting them.
- Use `docs/SOURCE_OF_TRUTH.md` as the single onboarding/index document rather than overloading `README.md` with every operational detail.
- Use `docs/ARCHITECTURE_CURRENT.md` as the live current-state architecture doc and keep `docs/ARCHITECTURE.md` as background history only.

## Risks / follow-ups

- Several older phase/spec docs remain historical-by-context rather than individually relabeled line-by-line. The new source-of-truth index now classifies them, which is enough for navigation, but they can be relabeled individually later if needed.
- `neon-stock-terminal/docs/*` still contains feature-specific module history and implementation notes; those were intentionally left intact because they are useful, but they should continue to be treated as module-level docs rather than primary stack source of truth.

## Resume here next time

1. If a new engineer still gets lost, expand `docs/SOURCE_OF_TRUTH.md` with task-based entrypoints such as “I need routes”, “I need deployment”, and “I need schema ownership”.
2. If older phase docs start causing confusion again, add explicit historical headers to those files one by one instead of doing another broad doc sweep.
3. Keep the diagrams in sync whenever ingress, route ownership, or stage/prod topology changes.
