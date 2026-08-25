# UI/UX V4 critical review and controlled implementation plan

Date: 23 August 2026

## Critical review

The handover diagnosis is supported by current runtime evidence: the application has 56 canonical page patterns, 389 indexed frontend components, 56 chart surfaces and 386 retained screenshots. Its principal defect is inconsistent page grammar and excessive serial presentation, not missing analytical depth. `/analytics` reached about 27,309 px, `/options/volatility-signals` 12,415 px, `/institutional/flow` 9,593 px and `/paper-trading` 8,603 px. Home mounted as many as 209 canvases.

The proposed direction is correct, with four implementation corrections:

1. Do not rebuild foundations already present. `CommandPalette`, `NavigationStateManager`, `ResponsiveWorkspaceNavigation`, `WorkspacePrimitives`, `PaperWorkbenchPrimitives` and `EChartSurface` are extended in place.
2. Do not install the full whitelist. A dependency is added only when an accepted route cannot meet its interaction/performance requirement with current primitives.
3. Do not declare field preservation from screenshots alone. The manifest joins source metrics, page/API mappings, Paper V2’s canonical 37-field inventory, charts, runtime captures and the 198-item backlog. Parity remains `UNVERIFIED` until tested.
4. Do not cut over 56 routes at once. Page-family feature flags and rollback-capable deployments are required.

## Sequential plan and acceptance gates

### Phase A — preserve and baseline

- Generate route/visual and field manifests.
- Record all current direct-package licences and duplication boundaries.
- Reuse the current four-viewport, authenticated baseline rather than recapturing unchanged pages.
- Validate handover archive integrity and record missing advertised assets.

Gate: 56 canonical routes represented, every redirect retained, 198 backlog rows loaded, Paper canonical fields attached, baseline paths resolvable.

### Phase B — shared foundation

- Map V4 density/status/workbench roles into `styles/tokens.css`.
- Extend `WorkspacePrimitives` with compact context, Now/Attention, metric explainability, data-state and methodology primitives.
- Keep status semantics text/icon/pattern based; use no colour-only state.
- Add component/unit tests before route adoption.

Gate: typecheck, unit tests, axe component checks and no new paid dependency.

### Phase C — Paper Trading

- Reconcile the already implemented Paper Trading Evidence Workbench V2 against UIX-169–171.
- Keep its eight URL lenses, accounting taxonomy, Full Audit, inspector, comments, scenarios, heatmaps, factor surface and capital simulations.
- Close only demonstrated parity gaps; do not recalculate paper economics in React.

Gate: canonical values reconcile, 37-field registry plus every grid column remains exportable, four viewports pass, rollback documented.

### Phase D — Strategy and Backtesting

- Introduce shared `StrategyWorkbench` and `BacktestingWorkbench` shells.
- Migrate OIIS, Monthly, Rolling, Long Options and NIFTY Options without merging strategy identities.
- Replace oversized no-trade heroes with compact rule evidence; mount history/chart lenses on demand.

Gate per route: loaded/loading/empty/stale/partial/failed/permission states, value parity, deep-link restoration, axe and before/after performance.

### Phase E — Home, Analytics and Stock 360

- Replace chart-per-tile home rendering with a virtualised universe surface and visible-only sparklines.
- Split Analytics into URL lenses without deleting its evidence.
- Make Stock 360 the canonical dossier and preserve aliases/query state.

Gate: Home active charts <=16, routine pages <=2 viewport heights outside contained evidence panes, no route or data loss.

### Phase F — remaining workbench families

- Apply Options, Institutional, Catalysts, Heatmap and Operations templates.
- Standardise freshness, partial, missing, stale and failed states.
- Keep source timing explicit, particularly NSE watcher versus SmartAPI evidence.

Gate: cross-filtering, inspector, export, responsive and data-state tests per family.

### Phase G — cutover

- Run old/new side-by-side behind route-family flags.
- Reconcile fields, values, exports, route state and screenshots.
- Remove duplicate CSS/primitives only after acceptance.
- Deploy the dashboard image, verify authenticated production routes and retain prior image digest for rollback.

Gate: all 198 items have evidence, no serious/critical axe issue, no regression in canonical calculations, and operator approval.

## Rollback

Before each family deployment record the current dashboard image digest. Rollback is an image-reference change in the live Compose tree followed by an authenticated route smoke test. No database rollback should be needed because this programme does not alter schema or canonical data.

## Notification rule

The requested WhatsApp completion message is sent only after Phase G passes. A phase update must not be worded as full completion.
