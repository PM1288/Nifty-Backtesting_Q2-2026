# Today Revamp Source Reference Map

Date: 28 August 2026

Branch: `ui/today-summary-market-board-v1`

Baseline commit: `cd6ba22`

## Binding references

| Reference | Product interpretation | Implementation target |
|---|---|---|
| Prompt Slide 1 | Default market narrative | `/` with `?lens=story` |
| Prompt Slide 2 | Sector comparison plus selected-sector evidence | `/` with `?lens=sector-matrix&sector=<slug>` |
| Prompt Slide 3 | Dense full-universe board | `/full-board` |
| Prompt Slide 4 | In-place detail | One accessible sector or stock quick view |

`N50 Homepage Rvamp.pptx` was not found under `/home/novius2` during the audit. The detailed slide mapping and visual rules in the implementation prompt are therefore the binding source. Existing authenticated V5 homepage screenshots are the current-state visual baseline.

## Existing evidence reused

- `docs/uiux/v5/full-route-screenshots/home__*.png`
- `docs/uiux/v5/field-preservation-manifest.json`
- `docs/uiux/FEATURE_PRESERVATION_MANIFEST_2026-08-25.md`
- `docs/CANONICAL_REPOSITORY_AND_FEATURE_POLICY.md`
- `NIFTY50_UI_UX_REFERENCE_TOKENS.css` from the earlier handover is reference evidence only; current repository tokens remain authoritative.

## Source-to-component mapping

| Concern | Existing source | Revamp disposition |
|---|---|---|
| Router | `apps/web/src/App.tsx` | Preserve `/`; add `/full-board` |
| Current Today | `pages/LandingPage.tsx` | Retain as legacy rollback implementation |
| Global shell | `components/chrome/AppShell.tsx` | Reuse unchanged |
| Navigation | `components/chrome/workspaceRoutes.ts` | Extend Today match to `/full-board` |
| Overview data | `GET /v1/overview`, `useOverview()` | Reuse shared React Query cache |
| Live prices | `useLiveQuotesWithStatus()` | Reuse one page-owned subscription |
| Stock identity | `StockLogo`, `stock-profiles.json` | Reuse local asset resolution |
| Stock detail | `GET /v1/stocks/:symbol?range=1D`, `useStock()` | Quick-view secondary evidence |
| Stock 360 | `/analytics/stock/:symbol` | Canonical deep link |
| F&O radar | Existing derivatives routes | Canonical deep link; no duplicate route |
