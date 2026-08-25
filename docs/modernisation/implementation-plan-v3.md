# Full-system modernisation V3 — file-level implementation plan

Status date: 2026-08-23. The main handover prompt is authoritative. Work is delivered as reversible vertical slices against the versioned source mirror, then explicitly applied to the separate live integration tree.

## Phase A — baseline and safety

- Identity/evidence: `docs/modernisation/`, `docs/trading-app-audit/evidence/`, `scripts/audit/`.
- Runtime blockers: `neon-stock-terminal/apps/api/src/routes/workspace.ts`, `apps/web/src/pages/OiisLivePage.module.css`.
- Tests: `apps/api/src/routes/workspace.paper.test.ts`, `tools/playwright/ui-ux-accessibility.mjs`, audit validators.
- Gate: deployment correlated, preservation inventory fixed, `/futures` no 5xx, zero serious/critical Axe findings, representative golden fixtures and performance baselines recorded.

## Phase B — contracts, identity and observability

- Add bounded contract modules under `apps/api/src/contracts/` and shared/generated web types rather than extending `lib/types.ts` indefinitely.
- Register strategy/run/event/metric envelopes through additive PostgreSQL migrations and repository-specific OpenAPI sources.
- Extend current request instrumentation in `apps/api/src/server.ts`; propagate request/correlation IDs and problem details without exposing secrets.
- Add source/as-of/freshness/query policies to `apps/web/src/lib/hooks.ts` and query-key modules.

## Phase C — Paper backend fast path

- Split `apps/api/src/routes/workspace.ts` into `routes/paperTradingV2/` modules for context, summary, ledger, detail, analytics and exports.
- Add read-model migration under `services/paper_trading/migrations/` only after backup/restore proof.
- Keep `/v1/workspace/paper-trading` for parity; add authenticated `/v2/paper-trading/*` progressive contracts.
- Introduce cursor pagination, bounded queries, incremental horizon updates and sequenced snapshot/delta recovery.
- Gate: warm summary p95 ≤300 ms, cold ≤1 s, ledger/detail ≤500 ms, three-user load, no field loss.

## Phase D — strategy parity and lifecycle

- Classify rather than auto-import audit strategy candidates.
- Extend `paper_trading.strategy_registry`/`strategy_versions` and strategy-service adapters with immutable run manifests and knowledge/fill time.
- First parity target is selected only after current OIIS/monthly engine ownership and fixtures are reconciled.
- Gate: identical fixed-stream decisions across backtest/replay/paper; declared differences limited to fill/cost rules.

## Phase E — Paper Workbench

- Split `PaperTradingCommandCenter.tsx` into `features/paper-trading/{overview,trade-evidence,trade-inspector,path,reward-pain,factors,capital,scenarios,methodology}`.
- Reuse current calculations/components; do not duplicate financial logic client-side.
- Add context/story headers, eight deep-linkable sections, full-audit grid, universal inspector, saved views and complete exports.
- Gate: all current fields/surfaces mapped, accessible at four viewports, old/new reconciliation passes.

## Phase F — strategy and backtesting workbenches

- Apply shared context, identity, status, chart and export contracts to OIIS, Monthly, Rolling Monthly, Long Options, NIFTY Weekly Options and backtesting pages.
- Preserve specialised formulas and visuals. Add lifecycle/promotion evidence without connecting unapproved strategies to paper execution.

## Phase G — Home and remaining routes

- Refactor `LandingPage.tsx` and stock-tile visuals to one subscription, batched updates, viewport virtualisation and bounded render surfaces.
- Standardise remaining Markets, Stocks, Derivatives and Data & Operations shells.
- Gate: after-load interaction <100 ms, bounded canvases, one-hour soak without unbounded growth.

## Phase H — shadow validation and cutover

- Run old/new against identical data, compare all stable fields/calculations, permissions, exports, routes and performance.
- Produce test/reconciliation/performance/accessibility/security evidence and operator guide.
- Cut over only with explicit human signoff; retain rollback until the stability window completes.

## Per-slice evidence

Every slice records changed files, schema impact, exact tests/results, authenticated runtime evidence, performance, preservation status, rollback and unresolved risks in `docs/modernisation/` and `AGENT_HANDOFF.md`. Failed tests remain failed and block their gate.
