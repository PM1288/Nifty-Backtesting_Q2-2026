# FnoVolatilityPage

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

## Page overview

| Field | Evidence |
| --- | --- |
| Route | `/options/volatility-signals` |
| Main component | `FnoVolatilityPage` |
| Source | [neon-stock-terminal/apps/web/src/pages/FnoVolatilityPage.tsx](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/pages/FnoVolatilityPage.tsx) |
| Authentication | All `/v1` gateway routes are protected by the global auth guard; public shell access may display the authentication gate. |
| URL parameters | None declared in the route pattern |
| API client dependencies | `/v1/fno-volatility/dashboard` |
| CSS modules/styles | `./FnoVolatilityPage.module.css` |

## Purpose and decisions supported

The component name, rendered headings, controls, API dependencies, and screenshots below are the authoritative evidence for this page. Business interpretation is recorded only where source labels and calculation code support it. Any intent not stated in code is **UNVERIFIED**.

## Visual structure

```text
FnoVolatilityPage
├── F&amp;O Straddle &amp; Strangle Signals
├── Live option-value decisions
├── All F&amp;O movement candidates
```

## Component hierarchy

| Child component | Evidence |
| --- | --- |
| FnoVolatilityDashboard | Referenced by neon-stock-terminal/apps/web/src/pages/FnoVolatilityPage.tsx |


## API and data flow

| Frontend function | Endpoint(s) | Evidence |
| --- | --- | --- |
| fetchFnoVolatilityDashboard | `/v1/fno-volatility/dashboard` | [source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/lib/api.ts#L634) |


The canonical trace is: route → page component → imported hook/API client → authenticated gateway endpoint → route handler/service query → PostgreSQL or provider adapter → response/view model → component. Exact endpoint implementations are indexed in [API catalog](../04_API_CATALOG.md).

## Loading, empty and error behaviour

Inspect conditional branches in [the page source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/pages/FnoVolatilityPage.tsx). Runtime captures record console errors, failed requests, page headings, overflow, and authenticated state. A missing screenshot or absent runtime record is **UNVERIFIED**, not a pass.

## Responsive and styling behaviour

CSS is controlled by `./FnoVolatilityPage.module.css`. Viewport evidence is linked below.

## Screenshots

- [1920×1080](../screenshots/desktop/options-volatility-signals__1920x1080__full.png)
- [1440×900](../screenshots/desktop/options-volatility-signals__1440x900__full.png)
- [1024×768](../screenshots/tablet/options-volatility-signals__1024x768__full.png)
- [390×844](../screenshots/mobile/options-volatility-signals__390x844__full.png)

## Accuracy and limitations

No value is classified as accurate merely because it renders. See [Accuracy and data quality](../16_ACCURACY_AND_DATA_QUALITY.md), [metric catalog](../08_METRIC_AND_CALCULATION_CATALOG.md), and runtime request evidence in `evidence/runtime-audit.json`.

<!-- RUNTIME_AUDIT_START -->
## Runtime verification

| Viewport | HTTP | Result | First heading | Tables | Canvas | SVG | API errors | Console errors | Body overflow |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1024x768 | 200 | CAPTURED | F&O Straddle & Strangle Signals | 2 | 1 | 24 | 0 | 0 | NO |
| 1440x900 | 200 | CAPTURED | F&O Straddle & Strangle Signals | 2 | 1 | 24 | 0 | 4 | NO |
| 1920x1080 | 200 | CAPTURED | F&O Straddle & Strangle Signals | 2 | 1 | 24 | 0 | 0 | NO |
| 390x844 | 200 | CAPTURED | F&O Straddle & Strangle Signals | 2 | 1 | 24 | 0 | 0 | NO |


### Observed API dependencies

| Method | Path | Observed statuses |
| --- | --- | --- |
| GET | /n50/auth/session | 200 |
| GET | /n50/v1/overview | 200 |
| GET | /n50/v1/fno-volatility/dashboard | 200 |
| GET | /n50/v1/analytics/options-structure | 200 |
| GET | /option-chain/api/latest | 200 |
| GET | /option-chain/api/series | 200 |


### Captured evidence

- [full page — 1440x900](../screenshots/desktop/options-volatility-signals__1440x900__full.png)
- [full page — 1920x1080](../screenshots/desktop/options-volatility-signals__1920x1080__full.png)
- [full page — 390x844](../screenshots/mobile/options-volatility-signals__390x844__full.png)
- [table 1 — 1920x1080](../screenshots/sections/options-volatility-signals__table-1.png)
- [table 2 — 1920x1080](../screenshots/sections/options-volatility-signals__table-2.png)
- [top 1 — 1920x1080](../screenshots/sections/options-volatility-signals__top-1.png)
- [full page — 1024x768](../screenshots/tablet/options-volatility-signals__1024x768__full.png)
<!-- RUNTIME_AUDIT_END -->
