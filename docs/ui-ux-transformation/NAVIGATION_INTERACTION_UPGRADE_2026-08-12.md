# Navigation, Interaction and Strategic Journey Upgrade

Executed: 2026-08-12 23:58 UTC (2026-08-13 05:28 IST)

## Outcome

The shared interaction layer is implemented and deployed at `https://n50.nifty50today.co.in/n50` without changing trading calculations, collectors, database schemas or broker execution paths.

- The desktop/tablet shell exposes exactly seven primary workspaces: Today, Markets, Stocks, OIIS Lab, Paper Trading, Derivatives and Data & Operations.
- Rolling Monthly remains an independent, working strategy route, but is intentionally discoverable through mobile More and universal commands rather than becoming an eighth primary workspace.
- The app bar and workspace dock are compressed; permanent workspace subtitles and the inline Sign out control are removed. Sign out now lives in the user menu.
- `Ctrl/Cmd + K` opens one universal, permission-aware command palette on every route, including Home and Paper Trading.
- `/` focuses page-local search where implemented. Paper Trading no longer captures `Ctrl/Cmd + K`.
- Keyboard navigation, route chords, focus restoration, shortcut help and safe preview-only paper actions use one central registry.
- Context-aware links now carry stock, strategy, run, source, selected entity and return destination into Stock 360, OIIS, Paper Trading, backtesting and Data Quality.
- Browser Back restores recorded scroll position for the corresponding history location.
- Shared `PageHeader`, `ReturnToSource`, `RelatedJourney`, `SourceFreshness` and `LearnAboutThisAnalysis` primitives are integrated into the priority research journey.
- OIIS gate formulas and Paper Trading methodology are below current evidence in collapsed, deep-linkable learning sections.

## Universal command scope

The registry covers the complete legacy dashboard inventory plus live entities loaded on demand:

- all dashboard and strategy routes;
- every stock currently returned by the market canvas;
- paper-trade groups from the canonical Paper workspace endpoint;
- recent backtest runs from the canonical lab endpoint;
- Data Quality and help/definition destinations;
- safe actions such as Add paper trade, which open a confirmation form and do not execute directly.

Prefixes are optional: `@` stock, `#` destination, `>` action and `?` help. Recent history stores only bounded command IDs, not quantities, notes, credentials or command text.

## Shortcut safety

The central registry implements `Ctrl/Cmd+K`, `/`, `G` navigation chords, `Shift+?`, `Alt+P`, Paper `A`, Backtest `Ctrl/Cmd+Enter` and Escape handling. Character shortcuts are disabled inside editable controls. Paper and backtest shortcuts open review surfaces only. Existing server permissions, CSRF, idempotency and PAPER/LIVE boundaries remain authoritative.

## Principal changed files

- `neon-stock-terminal/apps/web/src/interaction/routeCatalog.ts`
- `neon-stock-terminal/apps/web/src/interaction/navigationContext.ts`
- `neon-stock-terminal/apps/web/src/interaction/NavigationStateManager.tsx`
- `neon-stock-terminal/apps/web/src/interaction/ShortcutRegistry.tsx`
- `neon-stock-terminal/apps/web/src/components/chrome/CommandPalette.tsx`
- `neon-stock-terminal/apps/web/src/components/chrome/ResponsiveWorkspaceNavigation.tsx`
- `neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx`
- `neon-stock-terminal/apps/web/src/components/chrome/AuthStatus.tsx`
- `neon-stock-terminal/apps/web/src/components/navigation/StrategicPrimitives.tsx`
- priority journey pages: Home, Stock 360, OIIS Live, Paper Trading and Rolling Monthly
- `neon-stock-terminal/apps/web/tests/navigationInteraction.test.ts`
- `tools/playwright/navigation-interaction-regression.mjs`

## Validation

- Web typecheck: pass.
- Web production build: pass.
- Web unit/domain tests: 17/17 pass, including new context, route-registry and RBAC tests.
- Navigation/interaction Playwright: 25/25 at 1920x1080, 768x1024 and 390x844.
- Responsive navigation Playwright: 118/118 across nine viewports from 360x800 through 1920x1080.
- Paper Trading non-regression: 65/65, including admin comments, target finalisation, profit/quantity evidence and responsive typography.
- Axe final matrix: 16/16 desktop/mobile canonical-workspace scans, zero violations and zero affected nodes. A pre-final scan found one 4.49:1 red-text edge on two Paper rows; the shared Paper negative colour was darkened before the clean final run.
- Production dashboard image rebuilt; `trading-stack-novius2-n50-dashboard-1` healthy.

## Evidence

- `tools/playwright/output/playwright/navigation-interaction/`
- `tools/playwright/output/playwright/responsive-navigation/`
- `tools/playwright/output/playwright/paper-trading-command-center/`
- `tools/playwright/output/playwright/ui-ux-accessibility-paper-final/`
- `tools/playwright/output/playwright/ui-ux-accessibility-final/`

## Preserved boundaries and rollback

No live broker order was placed. No Paper Trading calculation, OIIS formula, SmartAPI collector or PostgreSQL data was modified by this interaction upgrade. Rollback is the previous `trading-stack-n50-dashboard` image; no database rollback is required.

## Honest remaining work

The shared foundations and priority journeys are complete. A physical rewrite of every legacy table into one new `EntityTable`, universal chart-point-to-row linkage across every chart library instance, manual screen-reader review and multi-hour live-session soak remain incremental hardening items. Existing dashboards were preserved rather than destabilised for superficial uniformity.
