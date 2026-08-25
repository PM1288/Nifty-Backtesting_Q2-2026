# BacktestingLabPage

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

## Page overview

| Field | Evidence |
| --- | --- |
| Route | `/backtesting/lab` |
| Main component | `BacktestingLabPage` |
| Source | [neon-stock-terminal/apps/web/src/pages/BacktestingLabPage.tsx](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/pages/BacktestingLabPage.tsx) |
| Authentication | All `/v1` gateway routes are protected by the global auth guard; public shell access may display the authentication gate. |
| URL parameters | None declared in the route pattern |
| API client dependencies | `/v1/backtesting/lab/runs/`, `/v1/backtesting/lab/runs/`, `/v1/backtesting/lab/runs/`, `/v1/backtesting/lab/runs/`, `/v1/backtesting/lab/runs`, `/v1/backtesting/lab/runs`, `/v1/backtesting/lab/runs/`, `/v1/overview` |
| CSS modules/styles | `./AnalyticsPage.module.css`, `./BacktestingLabPage.module.css` |

## Purpose and decisions supported

The component name, rendered headings, controls, API dependencies, and screenshots below are the authoritative evidence for this page. Business interpretation is recorded only where source labels and calculation code support it. Any intent not stated in code is **UNVERIFIED**.

## Visual structure

```text
BacktestingLabPage
├── Recent experiments
├── Net-liquidation journey
├── Run inputs and provenance
├── Parameters used
```

## Component hierarchy

| Child component | Evidence |
| --- | --- |
| Record | Referenced by neon-stock-terminal/apps/web/src/pages/BacktestingLabPage.tsx |
| ResultTab | Referenced by neon-stock-terminal/apps/web/src/pages/BacktestingLabPage.tsx |
| LoadingTableCard | Referenced by neon-stock-terminal/apps/web/src/pages/BacktestingLabPage.tsx |
| ErrorState | Referenced by neon-stock-terminal/apps/web/src/pages/BacktestingLabPage.tsx |
| BacktestingHeader | Referenced by neon-stock-terminal/apps/web/src/pages/BacktestingLabPage.tsx |
| Link | Referenced by neon-stock-terminal/apps/web/src/pages/BacktestingLabPage.tsx |
| KpiCard | Referenced by neon-stock-terminal/apps/web/src/pages/BacktestingLabPage.tsx |
| BacktestingLineChart | Referenced by neon-stock-terminal/apps/web/src/pages/BacktestingLabPage.tsx |
| DataTable | Referenced by neon-stock-terminal/apps/web/src/pages/BacktestingLabPage.tsx |


## API and data flow

| Frontend function | Endpoint(s) | Evidence |
| --- | --- | --- |
| fetchBacktestingLabRun | `/v1/backtesting/lab/runs/` | [source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/lib/api.ts#L328) |
| fetchBacktestingLabTrades | `/v1/backtesting/lab/runs/` | [source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/lib/api.ts#L336) |
| fetchBacktestingLabLadders | `/v1/backtesting/lab/runs/` | [source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/lib/api.ts#L344) |
| fetchBacktestingLabEquity | `/v1/backtesting/lab/runs/`, `/v1/backtesting/lab/runs` | [source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/lib/api.ts#L352) |
| createBacktestingLabRun | `/v1/backtesting/lab/runs`, `/v1/backtesting/lab/runs/`, `/v1/overview` | [source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/lib/api.ts#L390) |


The canonical trace is: route → page component → imported hook/API client → authenticated gateway endpoint → route handler/service query → PostgreSQL or provider adapter → response/view model → component. Exact endpoint implementations are indexed in [API catalog](../04_API_CATALOG.md).

## Loading, empty and error behaviour

Inspect conditional branches in [the page source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/pages/BacktestingLabPage.tsx). Runtime captures record console errors, failed requests, page headings, overflow, and authenticated state. A missing screenshot or absent runtime record is **UNVERIFIED**, not a pass.

## Responsive and styling behaviour

CSS is controlled by `./AnalyticsPage.module.css`, `./BacktestingLabPage.module.css`. Viewport evidence is linked below.

## Screenshots

- [1920×1080](../screenshots/desktop/backtesting-lab__1920x1080__full.png)
- [1440×900](../screenshots/desktop/backtesting-lab__1440x900__full.png)
- [1024×768](../screenshots/tablet/backtesting-lab__1024x768__full.png)
- [390×844](../screenshots/mobile/backtesting-lab__390x844__full.png)

## Accuracy and limitations

No value is classified as accurate merely because it renders. See [Accuracy and data quality](../16_ACCURACY_AND_DATA_QUALITY.md), [metric catalog](../08_METRIC_AND_CALCULATION_CATALOG.md), and runtime request evidence in `evidence/runtime-audit.json`.

<!-- RUNTIME_AUDIT_START -->
## Runtime verification

| Viewport | HTTP | Result | First heading | Tables | Canvas | SVG | API errors | Console errors | Body overflow |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1024x768 | 200 | CAPTURED | Recent experiments | 0 | 2 | 24 | 0 | 0 | NO |
| 1440x900 | 200 | CAPTURED | Recent experiments | 0 | 2 | 24 | 0 | 0 | NO |
| 1920x1080 | 200 | CAPTURED | Recent experiments | 0 | 2 | 24 | 0 | 0 | NO |
| 390x844 | 200 | CAPTURED | Recent experiments | 0 | 2 | 24 | 0 | 0 | NO |


### Observed API dependencies

| Method | Path | Observed statuses |
| --- | --- | --- |
| GET | /n50/auth/session | 200 |
| GET | /n50/v1/overview | 200 |
| GET | /n50/v1/backtesting/lab/runs | 200 |
| GET | /n50/v1/backtesting/lab/runs/65600ee3-d5e6-4d21-8fba-135931f506a4 | 200 |
| GET | /n50/v1/backtesting/lab/runs/65600ee3-d5e6-4d21-8fba-135931f506a4/trades | 200 |
| GET | /n50/v1/backtesting/lab/runs/65600ee3-d5e6-4d21-8fba-135931f506a4/ladders | 200 |
| GET | /n50/v1/backtesting/lab/runs/65600ee3-d5e6-4d21-8fba-135931f506a4/equity | 200 |
| GET | /n50/api/v1/dashboard/summary | 200 |
| GET | /n50/api/v1/dashboard/sections/regime-breadth | 200 |
| GET | /n50/v1/backtesting/lab/catalogue | 200 |


### Captured evidence

- [chart 1 — 1920x1080](../screenshots/charts/backtesting-lab__chart-1.png)
- [full page — 1440x900](../screenshots/desktop/backtesting-lab__1440x900__full.png)
- [full page — 1920x1080](../screenshots/desktop/backtesting-lab__1920x1080__full.png)
- [full page — 390x844](../screenshots/mobile/backtesting-lab__390x844__full.png)
- [full page — 1024x768](../screenshots/tablet/backtesting-lab__1024x768__full.png)
<!-- RUNTIME_AUDIT_END -->
