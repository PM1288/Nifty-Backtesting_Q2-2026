# Option 4 single-line command header — implementation record

Date: 28 August 2026

Branch: `ui/single-line-command-header`

Scope: shared React shell only; no market, strategy, paper, database or API semantics changed.

## Outcome

The former utility header plus seven-item global navigation rail is replaced by one sticky command
header. Desktop height is 56 px. The header owns brand, command search, four primary destinations,
market/runtime context, concise paper speech, the connected user menu and a right-aligned three-dot
More menu. There is no second global navigation row.

## Canonical route mapping

| Header surface | Existing destinations |
|---|---|
| Today | `/` and `/full-board` |
| Markets | `/analytics`, `/analytics/stock/RELIANCE`, `/options/intelligence` |
| Strategy | OIIS, OISS, Trendlyne, Monthly, Rolling, Long Options and NIFTY Options |
| Paper Trading | `/paper-trading` |
| More | Data Quality, System Map, Run Monitor, NSE Intelligence and permission-filtered Administration |

Settings, Help and generic Integrations entries were not fabricated because this checkout has no
canonical routes for them. All other routes remain available through the command palette and their
existing page-local navigation.

## Preserved behavior

- The global `Ctrl+K` command palette and dynamic stock, paper-trade and run results are unchanged.
- The NIFTY mark, PAPER/ADMIN environment, market state, canonical data time and quality state remain
  in the header. Missing values remain missing.
- Paper entry/target speech remains enabled by default and retains its concise governed phrases.
- The account menu remains account-only and permission-aware.
- Strategy and analytical workspace tabs remain page-local and sticky below the 56 px header.
- Presentation mode, Paper notifier and authentication gate remain mounted once by `AppShell`.
- The removed ticker rail remains removed; this implementation does not restore it.

## Responsive and interaction contract

- At 1600 px and wider, the command launcher is expanded. Below 1600 px it becomes the same 36 px
  command button while `Ctrl+K` remains global.
- At 1280–1599 px, `Paper Trading` shortens to `Paper` and lower-priority data-time copy is hidden.
- Below 1280 px, global destinations move into a single accessible navigation drawer.
- Below 768 px, the 84 px shell contains a 52 px command row and a non-wrapping 32 px status row.
- Menus open on click, Enter, Space or Arrow Down. Arrow keys move between menu items. Escape and
  outside click close the menu; Escape restores trigger focus. Only one menu is mounted at a time.
- Header z-index is 1000 and dropdown z-index is 1100, above page-local frozen filters.

## Source files

- `apps/web/src/components/chrome/AppShell.tsx`
- `apps/web/src/components/chrome/AppShell.module.css`
- `apps/web/src/components/chrome/ResponsiveWorkspaceNavigation.tsx`
- `apps/web/src/components/chrome/ResponsiveWorkspaceNavigation.module.css`
- `apps/web/src/components/chrome/workspaceRoutes.ts`
- `apps/web/src/components/chrome/CommandPalette.module.css`
- `apps/web/src/components/chrome/AuthStatus.module.css`
- `apps/web/src/design-system/WorkspacePrimitives.tsx`
- `apps/web/src/styles/tokens.css`
- `apps/web/tests/navigationInteraction.test.ts`
- `tools/playwright/option4-command-header-regression.mjs`

## Validation

Passed:

- web typecheck, 64/64 tests and production build;
- API typecheck, 128/128 tests and build;
- focused ESLint for every changed TypeScript/test file;
- canonical repository source gate;
- 125/125 authenticated browser checks at 1920, 1440, 1280, 1024, 430, 390 and 360 px;
- public route/asset smoke checks and healthy deployed container.

The operational badge is severity-consistent: positive is `READY`, warning is `CAUTION`, negative
is `DEGRADED` and an indeterminate state is `UNKNOWN`. The browser suite verifies this mapping at
every viewport.

Browser screenshots and machine-readable results are in
`output/playwright/option4-command-header-final/` (ignored runtime evidence). Repository-wide web
lint remains blocked by inherited unrelated files and generated output; it was not represented as
passing.

## Rollback

Revert the delivery commit and rebuild only `n50-dashboard`. There is no database migration, API
contract change or data rollback.

Pre-change image: `trading-stack-n50-dashboard:rollback-pre-option4-header-20260828`.

Final deployed image: `sha256:7b133561c4d0ebbe5725a1d1d618a2c6d7afc7399d1c2e1be5469d54593a7b44`.

Final entry bundle: `index-BvzfpuHB.js`.
