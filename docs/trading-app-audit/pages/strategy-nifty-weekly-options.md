# NiftyWeeklyOptionsPage

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

## Page overview

| Field | Evidence |
| --- | --- |
| Route | `/strategy/nifty-weekly-options` |
| Main component | `NiftyWeeklyOptionsPage` |
| Source | [neon-stock-terminal/apps/web/src/pages/OiisRunHistoryPage.tsx](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/pages/OiisRunHistoryPage.tsx) |
| Authentication | All `/v1` gateway routes are protected by the global auth guard; public shell access may display the authentication gate. |
| URL parameters | None declared in the route pattern |
| API client dependencies | `/v1/oiis-live/run-history`, `/v1/oiis-live/candidates`, `/v1/oiis-live/candidates/` |
| CSS modules/styles | `./OiisRunHistoryPage.module.css` |

## Purpose and decisions supported

The component name, rendered headings, controls, API dependencies, and screenshots below are the authoritative evidence for this page. Business interpretation is recorded only where source labels and calculation code support it. Any intent not stated in code is **UNVERIFIED**.

## Visual structure

```text
NiftyWeeklyOptionsPage
├── 30-minute run history
```

## Component hierarchy

| Child component | Evidence |
| --- | --- |
| OiisRunHistory | Referenced by neon-stock-terminal/apps/web/src/pages/OiisRunHistoryPage.tsx |
| Link | Referenced by neon-stock-terminal/apps/web/src/pages/OiisRunHistoryPage.tsx |


## API and data flow

| Frontend function | Endpoint(s) | Evidence |
| --- | --- | --- |
| fetchOiisRunHistory | `/v1/oiis-live/run-history`, `/v1/oiis-live/candidates`, `/v1/oiis-live/candidates/` | [source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/lib/api.ts#L463) |


The canonical trace is: route → page component → imported hook/API client → authenticated gateway endpoint → route handler/service query → PostgreSQL or provider adapter → response/view model → component. Exact endpoint implementations are indexed in [API catalog](../04_API_CATALOG.md).

## Loading, empty and error behaviour

Inspect conditional branches in [the page source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/pages/OiisRunHistoryPage.tsx). Runtime captures record console errors, failed requests, page headings, overflow, and authenticated state. A missing screenshot or absent runtime record is **UNVERIFIED**, not a pass.

## Responsive and styling behaviour

CSS is controlled by `./OiisRunHistoryPage.module.css`. Viewport evidence is linked below.

## Screenshots

- [1920×1080](../screenshots/desktop/strategy-nifty-weekly-options__1920x1080__full.png)
- [1440×900](../screenshots/desktop/strategy-nifty-weekly-options__1440x900__full.png)
- [1024×768](../screenshots/tablet/strategy-nifty-weekly-options__1024x768__full.png)
- [390×844](../screenshots/mobile/strategy-nifty-weekly-options__390x844__full.png)

## Accuracy and limitations

No value is classified as accurate merely because it renders. See [Accuracy and data quality](../16_ACCURACY_AND_DATA_QUALITY.md), [metric catalog](../08_METRIC_AND_CALCULATION_CATALOG.md), and runtime request evidence in `evidence/runtime-audit.json`.

<!-- RUNTIME_AUDIT_START -->
## Runtime verification

| Viewport | HTTP | Result | First heading | Tables | Canvas | SVG | API errors | Console errors | Body overflow |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1024x768 | 200 | CAPTURED | NIFTY Weekly & Monthly Options | 0 | 1 | 32 | 0 | 1 | NO |
| 1440x900 | 200 | CAPTURED | NIFTY Weekly & Monthly Options | 0 | 1 | 32 | 0 | 0 | NO |
| 1920x1080 | 200 | CAPTURED | NIFTY Weekly & Monthly Options | 0 | 1 | 32 | 0 | 0 | NO |
| 390x844 | 200 | CAPTURED | NIFTY Weekly & Monthly Options | 0 | 1 | 32 | 0 | 0 | NO |


### Observed API dependencies

| Method | Path | Observed statuses |
| --- | --- | --- |
| GET | /n50/auth/session | 200 |
| GET | /n50/v1/overview | 200 |
| GET | /n50/v1/nifty-options/summary | 200 |
| GET | /n50/api/v1/dashboard/summary | 200 |
| GET | /n50/api/v1/dashboard/sections/regime-breadth | 200 |


### Captured evidence

- [full page — 1440x900](../screenshots/desktop/strategy-nifty-weekly-options__1440x900__full.png)
- [full page — 1920x1080](../screenshots/desktop/strategy-nifty-weekly-options__1920x1080__full.png)
- [full page — 390x844](../screenshots/mobile/strategy-nifty-weekly-options__390x844__full.png)
- [top 1 — 1920x1080](../screenshots/sections/strategy-nifty-weekly-options__top-1.png)
- [top 2 — 1920x1080](../screenshots/sections/strategy-nifty-weekly-options__top-2.png)
- [full page — 1024x768](../screenshots/tablet/strategy-nifty-weekly-options__1024x768__full.png)
<!-- RUNTIME_AUDIT_END -->
