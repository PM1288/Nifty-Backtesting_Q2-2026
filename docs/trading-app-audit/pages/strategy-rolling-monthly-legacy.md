# RollingMonthlyPage

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

## Page overview

| Field | Evidence |
| --- | --- |
| Route | `/strategy/rolling-monthly/legacy` |
| Main component | `RollingMonthlyPage` |
| Source | [neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx) |
| Authentication | All `/v1` gateway routes are protected by the global auth guard; public shell access may display the authentication gate. |
| URL parameters | None declared in the route pattern |
| API client dependencies | `/v1/rolling-monthly/dashboard`, `/v1/rolling-strategy/dashboard`, `/v1/rolling-monthly/absolute-months`, `/v1/rolling-monthly/absolute-month-candidates/`, `/v1/rolling-monthly/absolute-first-session`, `/v1/rolling-monthly/absolute-first-session/`, `/v1/rolling-monthly/expiry-candidates/`, `/v1/rolling-monthly/absolute-months`, `/v1/rolling-monthly/absolute-month-candidates/`, `/v1/rolling-monthly/absolute-month-candidates/`, `/v1/ro`, `/v1/rolling-monthly/absolute-first-session/` |
| CSS modules/styles | `./RollingMonthlyPage.module.css` |

## Purpose and decisions supported

The component name, rendered headings, controls, API dependencies, and screenshots below are the authoritative evidence for this page. Business interpretation is recorded only where source labels and calculation code support it. Any intent not stated in code is **UNVERIFIED**.

## Visual structure

```text
RollingMonthlyPage
├── Conditions then, quality then, position now
├── Qualification and next-expiry outcome
├── Monthly quality and outcome history
├── Red month → green month → confirmed bullish entry
├── Return, opportunity and pain
├── Opportunities and gross result
├── Every recognized stock opportunity and all seven checks
├── Completed month and week setup → first-session execution
├── How many entered stocks traded at least this far above entry?
├── How many entered stocks fell at least this far below entry?
├── Final result, opportunity and drawdown
├── Threshold-specific performance
├── Every validator, execution path and outcome
├── High, Medium and Low cohort outcomes
├── High and Medium monthly cohorts
├── Pass versus fail uplift
├── Good-versus-bad descriptive relationships
├── Baseline versus High quality
├── strategy
├── Bullish LONG
├── Bearish SHORT
├── Research limitations
```

## Component hierarchy

| Child component | Evidence |
| --- | --- |
| Record | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| RollingMonthlyDashboard | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| RollingMonthlyWeeklyChart | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| AbsoluteMonthlyDashboard | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| AbsoluteMonthlyChart | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| AbsoluteFirstSessionDashboard | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| AbsoluteFirstSessionChart | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| StockProfileFilters | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| LoadingSkeleton | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| ErrorState | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| CompactEmptyState | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| ModuleStatusStrip | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| PageHeader | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| CalendarRange | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| SourceFreshness | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| ShieldAlert | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| StockUniverseFilterBar | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| StockDistribution | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| DecisionHero | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| ExecutiveKpiStrip | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| MetricTile | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| ArrowUpRight | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| ArrowDownRight | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| ChevronDown | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| Download | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| EChartSurface | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| X | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| Link | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| RelatedJourney | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |
| LearnAboutThisAnalysis | Referenced by neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx |


## API and data flow

| Frontend function | Endpoint(s) | Evidence |
| --- | --- | --- |
| fetchRollingMonthlyDashboard | `/v1/rolling-monthly/dashboard`, `/v1/rolling-strategy/dashboard` | [source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/lib/api.ts#L686) |
| fetchAbsoluteMonthlyDashboard | `/v1/rolling-monthly/absolute-months`, `/v1/rolling-monthly/absolute-month-candidates/` | [source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/lib/api.ts#L790) |
| fetchAbsoluteFirstSessionDashboard | `/v1/rolling-monthly/absolute-first-session`, `/v1/rolling-monthly/absolute-first-session/` | [source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/lib/api.ts#L832) |
| fetchRollingMonthlyWeeklyChart | `/v1/rolling-monthly/expiry-candidates/`, `/v1/rolling-monthly/absolute-months`, `/v1/rolling-monthly/absolute-month-candidates/` | [source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/lib/api.ts#L762) |
| fetchAbsoluteMonthlyChart | `/v1/rolling-monthly/absolute-month-candidates/`, `/v1/ro` | [source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/lib/api.ts#L798) |
| fetchAbsoluteFirstSessionChart | `/v1/rolling-monthly/absolute-first-session/` | [source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/lib/api.ts#L839) |


The canonical trace is: route → page component → imported hook/API client → authenticated gateway endpoint → route handler/service query → PostgreSQL or provider adapter → response/view model → component. Exact endpoint implementations are indexed in [API catalog](../04_API_CATALOG.md).

## Loading, empty and error behaviour

Inspect conditional branches in [the page source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/pages/RollingMonthlyPage.tsx). Runtime captures record console errors, failed requests, page headings, overflow, and authenticated state. A missing screenshot or absent runtime record is **UNVERIFIED**, not a pass.

## Responsive and styling behaviour

CSS is controlled by `./RollingMonthlyPage.module.css`. Viewport evidence is linked below.

## Screenshots

- [1920×1080](../screenshots/desktop/strategy-rolling-monthly-legacy__1920x1080__full.png)
- [1440×900](../screenshots/desktop/strategy-rolling-monthly-legacy__1440x900__full.png)
- [1024×768](../screenshots/tablet/strategy-rolling-monthly-legacy__1024x768__full.png)
- [390×844](../screenshots/mobile/strategy-rolling-monthly-legacy__390x844__full.png)

## Accuracy and limitations

No value is classified as accurate merely because it renders. See [Accuracy and data quality](../16_ACCURACY_AND_DATA_QUALITY.md), [metric catalog](../08_METRIC_AND_CALCULATION_CATALOG.md), and runtime request evidence in `evidence/runtime-audit.json`.

<!-- RUNTIME_AUDIT_START -->
## Runtime verification

| Viewport | HTTP | Result | First heading | Tables | Canvas | SVG | API errors | Console errors | Body overflow |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1024x768 | 200 | CAPTURED | Rolling Monthly | 1 | 1 | 56 | 0 | 4 | NO |
| 1440x900 | 200 | CAPTURED | Rolling Monthly | 1 | 1 | 56 | 0 | 0 | NO |
| 1920x1080 | 200 | CAPTURED | Rolling Monthly | 1 | 1 | 56 | 0 | 0 | NO |
| 390x844 | 200 | CAPTURED | Rolling Monthly | 1 | 1 | 56 | 0 | 0 | NO |


### Observed API dependencies

| Method | Path | Observed statuses |
| --- | --- | --- |
| GET | /n50/auth/session | 200 |
| GET | /n50/v1/overview | 200 |
| GET | /n50/api/v1/dashboard/sections/regime-breadth | 200 |
| GET | /n50/api/v1/dashboard/summary | 200 |
| GET | /n50/v1/rolling-monthly/dashboard | 200 |


### Captured evidence

- [full page — 1440x900](../screenshots/desktop/strategy-rolling-monthly-legacy__1440x900__full.png)
- [full page — 1920x1080](../screenshots/desktop/strategy-rolling-monthly-legacy__1920x1080__full.png)
- [full page — 390x844](../screenshots/mobile/strategy-rolling-monthly-legacy__390x844__full.png)
- [table 1 — 1920x1080](../screenshots/sections/strategy-rolling-monthly-legacy__table-1.png)
- [top 1 — 1920x1080](../screenshots/sections/strategy-rolling-monthly-legacy__top-1.png)
- [top 2 — 1920x1080](../screenshots/sections/strategy-rolling-monthly-legacy__top-2.png)
- [full page — 1024x768](../screenshots/tablet/strategy-rolling-monthly-legacy__1024x768__full.png)
<!-- RUNTIME_AUDIT_END -->
