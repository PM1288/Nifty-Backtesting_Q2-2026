# OiisLivePage

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

## Page overview

| Field | Evidence |
| --- | --- |
| Route | `/strategy/oiis-live` |
| Main component | `OiisLivePage` |
| Source | [neon-stock-terminal/apps/web/src/pages/OiisLivePage.tsx](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/pages/OiisLivePage.tsx) |
| Authentication | All `/v1` gateway routes are protected by the global auth guard; public shell access may display the authentication gate. |
| URL parameters | None declared in the route pattern |
| API client dependencies | `/v1/oiis-live/dashboard`, `/v1/oiis-live/run-history`, `/v1/oiis-live/candidates`, `/v1/oiis-live/candidates`, `/v1/oiis-live/candidates/`, `/v1/oiis-live` |
| CSS modules/styles | `./OiisLivePage.module.css` |

## Purpose and decisions supported

The component name, rendered headings, controls, API dependencies, and screenshots below are the authoritative evidence for this page. Business interpretation is recorded only where source labels and calculation code support it. Any intent not stated in code is **UNVERIFIED**.

## Visual structure

```text
OiisLivePage
├── Every active stock F&amp;O underlying
├── Data, gate and universe diagnostics
├── Daily stock selection desk
├── Where the universe narrowed
├── Current opportunity leaderboard
├── Why stocks were rejected
├── Top recommendations and entry permissions
├── Manage the paper watchlist
├── Latest three-year evaluation
├── Live services and data freshness
├── What passed, and exactly where setups failed
```

## Component hierarchy

| Child component | Evidence |
| --- | --- |
| OiisLiveDashboard | Referenced by neon-stock-terminal/apps/web/src/pages/OiisLivePage.tsx |
| Array | Referenced by neon-stock-terminal/apps/web/src/pages/OiisLivePage.tsx |
| Record | Referenced by neon-stock-terminal/apps/web/src/pages/OiisLivePage.tsx |
| StockProfileFilters | Referenced by neon-stock-terminal/apps/web/src/pages/OiisLivePage.tsx |
| StockUniverseFilterBar | Referenced by neon-stock-terminal/apps/web/src/pages/OiisLivePage.tsx |
| StockDistribution | Referenced by neon-stock-terminal/apps/web/src/pages/OiisLivePage.tsx |
| Link | Referenced by neon-stock-terminal/apps/web/src/pages/OiisLivePage.tsx |
| RelatedJourney | Referenced by neon-stock-terminal/apps/web/src/pages/OiisLivePage.tsx |
| LearnAboutThisAnalysis | Referenced by neon-stock-terminal/apps/web/src/pages/OiisLivePage.tsx |


## API and data flow

| Frontend function | Endpoint(s) | Evidence |
| --- | --- | --- |
| fetchOiisLiveDashboard | `/v1/oiis-live/dashboard`, `/v1/oiis-live/run-history`, `/v1/oiis-live/candidates` | [source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/lib/api.ts#L446) |
| fetchOiisLiveCandidates | `/v1/oiis-live/candidates`, `/v1/oiis-live/candidates/`, `/v1/oiis-live` | [source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/lib/api.ts#L482) |


The canonical trace is: route → page component → imported hook/API client → authenticated gateway endpoint → route handler/service query → PostgreSQL or provider adapter → response/view model → component. Exact endpoint implementations are indexed in [API catalog](../04_API_CATALOG.md).

## Loading, empty and error behaviour

Inspect conditional branches in [the page source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/pages/OiisLivePage.tsx). Runtime captures record console errors, failed requests, page headings, overflow, and authenticated state. A missing screenshot or absent runtime record is **UNVERIFIED**, not a pass.

## Responsive and styling behaviour

CSS is controlled by `./OiisLivePage.module.css`. Viewport evidence is linked below.

## Screenshots

- [1920×1080](../screenshots/desktop/strategy-oiis-live__1920x1080__full.png)
- [1440×900](../screenshots/desktop/strategy-oiis-live__1440x900__full.png)
- [1024×768](../screenshots/tablet/strategy-oiis-live__1024x768__full.png)
- [390×844](../screenshots/mobile/strategy-oiis-live__390x844__full.png)

## Accuracy and limitations

No value is classified as accurate merely because it renders. See [Accuracy and data quality](../16_ACCURACY_AND_DATA_QUALITY.md), [metric catalog](../08_METRIC_AND_CALCULATION_CATALOG.md), and runtime request evidence in `evidence/runtime-audit.json`.

<!-- RUNTIME_AUDIT_START -->
## Runtime verification

| Viewport | HTTP | Result | First heading | Tables | Canvas | SVG | API errors | Console errors | Body overflow |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1024x768 | 200 | CAPTURED | Daily stock selection desk | 2 | 1 | 29 | 0 | 2 | NO |
| 1440x900 | 200 | CAPTURED | Daily stock selection desk | 2 | 1 | 29 | 0 | 4 | NO |
| 1920x1080 | 200 | CAPTURED | Daily stock selection desk | 2 | 1 | 29 | 0 | 1 | NO |
| 390x844 | 200 | CAPTURED | Daily stock selection desk | 2 | 1 | 29 | 0 | 0 | NO |


### Observed API dependencies

| Method | Path | Observed statuses |
| --- | --- | --- |
| GET | /n50/auth/session | 200 |
| GET | /n50/v1/overview | 200 |
| GET | /n50/api/v1/dashboard/summary | 200 |
| GET | /n50/api/v1/dashboard/sections/regime-breadth | 200 |
| GET | /n50/v1/oiis-live/dashboard | 200 |
| GET | /n50/v1/oiis-live/candidates | 200 |


### Captured evidence

- [full page — 1440x900](../screenshots/desktop/strategy-oiis-live__1440x900__full.png)
- [full page — 1920x1080](../screenshots/desktop/strategy-oiis-live__1920x1080__full.png)
- [full page — 390x844](../screenshots/mobile/strategy-oiis-live__390x844__full.png)
- [table 1 — 1920x1080](../screenshots/sections/strategy-oiis-live__table-1.png)
- [top 1 — 1920x1080](../screenshots/sections/strategy-oiis-live__top-1.png)
- [full page — 1024x768](../screenshots/tablet/strategy-oiis-live__1024x768__full.png)
<!-- RUNTIME_AUDIT_END -->
