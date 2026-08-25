# LegacyStockRedirect

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

## Page overview

| Field | Evidence |
| --- | --- |
| Route | `/stock/:symbol` |
| Main component | `LegacyStockRedirect` |
| Source | [neon-stock-terminal/apps/web/src/App.tsx](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/App.tsx) |
| Authentication | All `/v1` gateway routes are protected by the global auth guard; public shell access may display the authentication gate. |
| URL parameters | :symbol |
| API client dependencies | No direct client endpoint statically resolved; inspect imported hooks and child components. |
| CSS modules/styles | `./pages/AnalyticsPage.module.css` |

## Purpose and decisions supported

The component name, rendered headings, controls, API dependencies, and screenshots below are the authoritative evidence for this page. Business interpretation is recorded only where source labels and calculation code support it. Any intent not stated in code is **UNVERIFIED**.

## Visual structure

```text
LegacyStockRedirect
└── Structure is composed dynamically; inspect the component and screenshot.
```

## Component hierarchy

| Child component | Evidence |
| --- | --- |
| Navigate | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| ShortcutProvider | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| AppShell | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| Suspense | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| RouteFallback | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| Routes | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| Route | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| LandingPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| AnalyticsOverviewPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| AnalyticsLeadershipPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| AnalyticsSetupsPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| AnalyticsEventContextPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| AnalyticsEventsPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| AnalyticsRegimePage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| AnalyticsRiskPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| AnalyticsLearnPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| AnalyticsSimulatorPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| AnalyticsIndicatorsPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| AnalyticsStockPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| FeedbackPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| BacktestingOverviewPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| BacktestingLabPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| BacktestingStrategyLibraryPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| BacktestingStrategyDetailPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| BacktestingPortfolioResultsPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| BacktestingRegimeAnalysisPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| BacktestingStockInsightsPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| BacktestingDailySummaryPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| BacktestingComparePage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| BacktestingRunsPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| BacktestingH30Page | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| AnalyticsFiiFlowPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| AnalyticsFiiReportsPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| NseIntelligencePage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| AnalyticsOptionsStructurePage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| AnalyticsOptionsPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| FnoVolatilityPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| OptionsIntelligencePage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| OiisLivePage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| OiisRunHistoryPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| MonthlyStrategyPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| RollingMonthlyLegacyRouter | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| RollingMonthlyPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| LongOptionsPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| NiftyWeeklyOptionsPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| PaperTradingPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| Nifty500Page | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| FuturesPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| AdminPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| AnalyticsFlowsPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| AnalyticsQualityPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| AnalyticsSystemMapPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| ChangeHeatmapPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| RsiSurfacePage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| WillSurfacePage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |
| NotFoundPage | Referenced by neon-stock-terminal/apps/web/src/App.tsx |


## API and data flow

_No records discovered._


The canonical trace is: route → page component → imported hook/API client → authenticated gateway endpoint → route handler/service query → PostgreSQL or provider adapter → response/view model → component. Exact endpoint implementations are indexed in [API catalog](../04_API_CATALOG.md).

## Loading, empty and error behaviour

Inspect conditional branches in [the page source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/App.tsx). Runtime captures record console errors, failed requests, page headings, overflow, and authenticated state. A missing screenshot or absent runtime record is **UNVERIFIED**, not a pass.

## Responsive and styling behaviour

CSS is controlled by `./pages/AnalyticsPage.module.css`. Viewport evidence is linked below.

## Screenshots

- [1920×1080](../screenshots/desktop/stock-param__1920x1080__full.png)
- [1440×900](../screenshots/desktop/stock-param__1440x900__full.png)
- [1024×768](../screenshots/tablet/stock-param__1024x768__full.png)
- [390×844](../screenshots/mobile/stock-param__390x844__full.png)

## Accuracy and limitations

No value is classified as accurate merely because it renders. See [Accuracy and data quality](../16_ACCURACY_AND_DATA_QUALITY.md), [metric catalog](../08_METRIC_AND_CALCULATION_CATALOG.md), and runtime request evidence in `evidence/runtime-audit.json`.

<!-- RUNTIME_AUDIT_START -->
## Runtime verification

| Viewport | HTTP | Result | First heading | Tables | Canvas | SVG | API errors | Console errors | Body overflow |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1024x768 | 200 | CAPTURED | Price context | 0 | 1 | 24 | 0 | 0 | NO |
| 1440x900 | 200 | CAPTURED | Quick read / current state | 6 | 2 | 30 | 0 | 0 | NO |
| 1920x1080 | 200 | CAPTURED | Quick read / current state | 6 | 2 | 30 | 0 | 0 | NO |
| 390x844 | 200 | CAPTURED | Price context | 0 | 1 | 24 | 0 | 0 | NO |


### Observed API dependencies

| Method | Path | Observed statuses |
| --- | --- | --- |
| GET | /n50/auth/session | 200 |
| GET | /n50/v1/overview | 200 |
| GET | /n50/v1/backtesting/compare | 200 |
| GET | /n50/api/v1/intraday/summary | 200 |
| GET | /n50/v1/stocks/RELIANCE | 200 |
| GET | /n50/v1/oiis-live/candidates/RELIANCE/context | 200 |
| GET | /n50/api/v1/intraday/stocks/RELIANCE | 200 |


### Captured evidence

- [chart 1 — 1920x1080](../screenshots/charts/stock-param__chart-1.png)
- [full page — 1440x900](../screenshots/desktop/stock-param__1440x900__full.png)
- [full page — 1920x1080](../screenshots/desktop/stock-param__1920x1080__full.png)
- [full page — 390x844](../screenshots/mobile/stock-param__390x844__full.png)
- [table 1 — 1920x1080](../screenshots/sections/stock-param__table-1.png)
- [table 2 — 1920x1080](../screenshots/sections/stock-param__table-2.png)
- [top 1 — 1920x1080](../screenshots/sections/stock-param__top-1.png)
- [full page — 1024x768](../screenshots/tablet/stock-param__1024x768__full.png)
<!-- RUNTIME_AUDIT_END -->
