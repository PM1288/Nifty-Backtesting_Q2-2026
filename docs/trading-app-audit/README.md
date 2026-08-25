# Trading Application — Complete Technical Documentation

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

This audit is the source-backed portal for the NIFTY 50 Trader application. It separates **code-verified**, **runtime-verified**, and **UNVERIFIED** claims. It does not change trading calculations or production behaviour.

## Inventory snapshot

- 92 route declarations (56 non-redirect page patterns)
- 332 discovered Express/FastAPI endpoint declarations
- 389 React components
- 46 source-identifiable metric cards/KPIs
- 56 chart/visual source modules
- 6605 important calculation/trading/data function records
- 422 SQL object definitions across migrations
- 51 candidate strategy identifiers requiring human classification
- 2482 test/audit files

## Start here

- [Executive overview](00_EXECUTIVE_OVERVIEW.md)
- [Application architecture](01_APPLICATION_ARCHITECTURE.md)
- [Routes and pages](02_ROUTE_AND_PAGE_INDEX.md)
- [APIs](04_API_CATALOG.md)
- [Data lineage](06_DATA_LINEAGE.md)
- [Charts](07_CHART_AND_VISUALIZATION_CATALOG.md)
- [Paper trading](10_PAPER_TRADING_ENGINE.md)
- [Accuracy](16_ACCURACY_AND_DATA_QUALITY.md)
- [Known gaps](21_KNOWN_GAPS_AND_TECHNICAL_DEBT.md)
- [Traceability](22_END_TO_END_TRACEABILITY.md)
- [Screenshots](24_SCREENSHOT_INDEX.md)
- [Repository-specific extension guides](27_EXTENSION_GUIDES.md)

## Pages

- [`/`](pages/home.md) — `LandingPage`
- [`/dashboard/stocks/:symbol`](pages/dashboard-stocks-param.md) — `LegacyStockRedirect`
- [`/analytics`](pages/analytics.md) — `AnalyticsOverviewPage`
- [`/analytics/leadership`](pages/analytics-leadership.md) — `AnalyticsLeadershipPage`
- [`/analytics/daily-setups`](pages/analytics-daily-setups.md) — `AnalyticsSetupsPage`
- [`/catalysts/context`](pages/catalysts-context.md) — `AnalyticsEventContextPage`
- [`/catalysts/events`](pages/catalysts-events.md) — `AnalyticsEventsPage`
- [`/analytics/regime`](pages/analytics-regime.md) — `AnalyticsRegimePage`
- [`/analytics/risk`](pages/analytics-risk.md) — `AnalyticsRiskPage`
- [`/analytics/learn`](pages/analytics-learn.md) — `AnalyticsLearnPage`
- [`/analytics/simulator`](pages/analytics-simulator.md) — `AnalyticsSimulatorPage`
- [`/analytics/indicators`](pages/analytics-indicators.md) — `AnalyticsIndicatorsPage`
- [`/analytics/indicators/:slug`](pages/analytics-indicators-param.md) — `AnalyticsIndicatorsPage`
- [`/analytics/stock/:symbol`](pages/analytics-stock-param.md) — `AnalyticsStockPage`
- [`/feedback`](pages/feedback.md) — `FeedbackPage`
- [`/backtesting`](pages/backtesting.md) — `BacktestingOverviewPage`
- [`/backtesting/lab`](pages/backtesting-lab.md) — `BacktestingLabPage`
- [`/backtesting/strategies`](pages/backtesting-strategies.md) — `BacktestingStrategyLibraryPage`
- [`/backtesting/strategies/:strategyId`](pages/backtesting-strategies-param.md) — `BacktestingStrategyDetailPage`
- [`/backtesting/results`](pages/backtesting-results.md) — `BacktestingPortfolioResultsPage`
- [`/backtesting/regimes`](pages/backtesting-regimes.md) — `BacktestingRegimeAnalysisPage`
- [`/backtesting/stocks`](pages/backtesting-stocks.md) — `BacktestingStockInsightsPage`
- [`/backtesting/daily-summary`](pages/backtesting-daily-summary.md) — `BacktestingDailySummaryPage`
- [`/backtesting/compare`](pages/backtesting-compare.md) — `BacktestingComparePage`
- [`/backtesting/runs`](pages/backtesting-runs.md) — `BacktestingRunsPage`
- [`/backtesting/h30`](pages/backtesting-h30.md) — `BacktestingH30Page`
- [`/institutional/flow`](pages/institutional-flow.md) — `AnalyticsFiiFlowPage`
- [`/institutional/reports`](pages/institutional-reports.md) — `AnalyticsFiiReportsPage`
- [`/institutional/nse-intelligence`](pages/institutional-nse-intelligence.md) — `NseIntelligencePage`
- [`/institutional/nse-intelligence/sectors`](pages/institutional-nse-intelligence-sectors.md) — `NseIntelligencePage`
- [`/institutional/nse-intelligence/fno`](pages/institutional-nse-intelligence-fno.md) — `NseIntelligencePage`
- [`/institutional/nse-intelligence/events`](pages/institutional-nse-intelligence-events.md) — `NseIntelligencePage`
- [`/institutional/nse-intelligence/reports`](pages/institutional-nse-intelligence-reports.md) — `NseIntelligencePage`
- [`/options/structure`](pages/options-structure.md) — `AnalyticsOptionsStructurePage`
- [`/options/snapshot`](pages/options-snapshot.md) — `AnalyticsOptionsPage`
- [`/options/volatility-signals`](pages/options-volatility-signals.md) — `FnoVolatilityPage`
- [`/options/intelligence`](pages/options-intelligence.md) — `OptionsIntelligencePage`
- [`/strategy/oiis-live`](pages/strategy-oiis-live.md) — `OiisLivePage`
- [`/strategy/oiis-live/history`](pages/strategy-oiis-live-history.md) — `OiisRunHistoryPage`
- [`/strategy/monthly`](pages/strategy-monthly.md) — `MonthlyStrategyPage`
- [`/strategy/rolling-monthly`](pages/strategy-rolling-monthly.md) — `RollingMonthlyLegacyRouter`
- [`/strategy/rolling-monthly/legacy`](pages/strategy-rolling-monthly-legacy.md) — `RollingMonthlyPage`
- [`/strategy/long-options`](pages/strategy-long-options.md) — `LongOptionsPage`
- [`/strategy/nifty-options`](pages/strategy-nifty-options.md) — `NiftyWeeklyOptionsPage`
- [`/strategy/nifty-weekly-options`](pages/strategy-nifty-weekly-options.md) — `NiftyWeeklyOptionsPage`
- [`/paper-trading`](pages/paper-trading.md) — `PaperTradingPage`
- [`/market/nifty-500`](pages/market-nifty-500.md) — `Nifty500Page`
- [`/futures`](pages/futures.md) — `FuturesPage`
- [`/control-plane`](pages/control-plane.md) — `AdminPage`
- [`/analytics/flows`](pages/analytics-flows.md) — `AnalyticsFlowsPage`
- [`/analytics/system/quality`](pages/analytics-system-quality.md) — `AnalyticsQualityPage`
- [`/analytics/system/map`](pages/analytics-system-map.md) — `AnalyticsSystemMapPage`
- [`/heatmap/change`](pages/heatmap-change.md) — `ChangeHeatmapPage`
- [`/heatmap/rsi`](pages/heatmap-rsi.md) — `RsiSurfacePage`
- [`/heatmap/will`](pages/heatmap-will.md) — `WillSurfacePage`
- [`/stock/:symbol`](pages/stock-param.md) — `LegacyStockRedirect`

## How to trace any number

1. Locate the visible label in the relevant page/component source with `rg`.
2. Identify its prop, selector, hook, or local calculation.
3. Follow the imported API-client function in `apps/web/src/lib/api.ts` or the imported service.
4. Match the HTTP path in [api-map.json](evidence/api-map.json).
5. Inspect the route handler and every query/service/helper it calls.
6. Resolve SQL objects through [storage-map.json](evidence/storage-map.json).
7. Resolve provider adapters through [data-source-map.json](evidence/data-source-map.json).
8. Recompute from raw inputs without adopting UI fallbacks.
9. Compare timestamp, timezone, precision, eligibility, gross/net, and capital basis.
10. If any link cannot be proven, mark the value **UNVERIFIED**.

<!-- RUNTIME_AUDIT_START -->
## Runtime audit snapshot

| Measure | Count |
| --- | --- |
| declaredRoutes | 92 |
| canonicalPagePatterns | 56 |
| uniquePageComponents | 49 |
| browserCaptures | 224 |
| screenshots | 385 |
| captured | 220 |
| degraded | 4 |
| failed | 0 |
| horizontalOverflow | 0 |
| apiResponseErrors | 4 |
| consoleErrors | 154 |
| endpoints | 332 |
| charts | 56 |
| components | 389 |
| metrics | 46 |
| backendServicePackages | 21 |
| importantFunctionRecords | 6605 |
| sqlDefinitions | 422 |
| strategyIdentifierCandidates | 51 |
| dataSourceSystems | 9 |
| calculationChecks | 43 |
| calculationPasses | 43 |
| calculationFailures | 0 |
| deployedPostgresRelations | 563 |
| deployedPostgresColumns | 9710 |
| accessibilityScans | 16 |
| accessibilityViolations | 1 |


Runtime evidence is in [runtime-audit.json](evidence/runtime-audit.json), screenshot metadata in [screenshot-map.json](evidence/screenshot-map.json), and independent calculations in [calculation-validation.json](evidence/calculation-validation.json).
<!-- RUNTIME_AUDIT_END -->
