# app

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

## Identity

| Field | Value |
| --- | --- |
| Source | [neon-stock-terminal/apps/web/src/App.tsx](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/App.tsx) |
| Components | `RouteFallback`, `LegacyStockRedirect`, `App`, `ChangeHeatmapPage`, `RsiSurfacePage`, `WillSurfacePage`, `AnalyticsOverviewPage`, `AnalyticsLeadershipPage`, `AnalyticsSetupsPage`, `AnalyticsEventContextPage`, `AnalyticsFiiFlowPage`, `AnalyticsMarketStatePage`, `AnalyticsEventsPage`, `AnalyticsFiiReportsPage`, `AnalyticsFlowsPage`, `AnalyticsSupportingMetricsPage`, `AnalyticsQualityPage`, `AnalyticsSystemMapPage`, `AnalyticsRegimePage`, `AnalyticsRiskPage`, `AnalyticsLearnPage`, `AnalyticsSimulatorPage`, `AnalyticsIndicatorsPage`, `AnalyticsStockPage`, `AnalyticsOptionsStructurePage`, `AnalyticsOptionsPage`, `AnalyticsStrategyEvaluationPage`, `FeedbackPage`, `BacktestingOverviewPage`, `BacktestingLabPage`, `BacktestingStrategyLibraryPage`, `BacktestingStrategyDetailPage`, `BacktestingPortfolioResultsPage`, `BacktestingRegimeAnalysisPage`, `BacktestingStockInsightsPage`, `BacktestingDailySummaryPage`, `BacktestingComparePage`, `BacktestingRunsPage`, `BacktestingH30Page`, `OiisLivePage`, `RollingMonthlyPage`, `MonthlyStrategyPage`, `RollingMonthlyLegacyRouter`, `LongOptionsPage`, `NiftyWeeklyOptionsPage`, `NseIntelligencePage`, `OiisRunHistoryPage`, `FnoVolatilityPage`, `OptionsIntelligencePage`, `PaperTradingPage`, `Nifty500Page`, `FuturesPage`, `AdminPage` |
| Library | CSS/DOM visualisation |
| Pages | `/dashboard/stocks/:symbol`, `/analytics`, `/analytics/leadership`, `/analytics/daily-setups`, `/catalysts/context`, `/catalysts/events`, `/analytics/regime`, `/analytics/risk`, `/analytics/learn`, `/analytics/simulator`, `/analytics/indicators`, `/analytics/indicators/:slug`, `/analytics/stock/:symbol`, `/feedback`, `/backtesting`, `/backtesting/lab`, `/backtesting/strategies`, `/backtesting/strategies/:strategyId`, `/backtesting/results`, `/backtesting/regimes`, `/backtesting/stocks`, `/backtesting/daily-summary`, `/backtesting/compare`, `/backtesting/runs`, `/backtesting/h30`, `/institutional/flow`, `/institutional/reports`, `/institutional/nse-intelligence`, `/institutional/nse-intelligence/sectors`, `/institutional/nse-intelligence/fno`, `/institutional/nse-intelligence/events`, `/institutional/nse-intelligence/reports`, `/options/structure`, `/options/snapshot`, `/options/volatility-signals`, `/options/intelligence`, `/strategy/oiis-live`, `/strategy/oiis-live/history`, `/strategy/monthly`, `/strategy/rolling-monthly`, `/strategy/rolling-monthly/legacy`, `/strategy/long-options`, `/strategy/nifty-options`, `/strategy/nifty-weekly-options`, `/market/nifty-500`, `/futures`, `/control-plane`, `/analytics/flows`, `/analytics/system/quality`, `/analytics/system/map`, `/heatmap/change`, `/heatmap/rsi`, `/heatmap/will`, `/stock/:symbol` |
| Titles found | Dynamic/none statically resolved |
| Direct API paths | Supplied through props/hooks |

## Business meaning and interpretation

The visible title, axes, series encodings, and surrounding copy in the linked source define what the chart says. It is descriptive/diagnostic unless the source explicitly identifies a predictive model. Do not infer executable returns from MFE, simulated, hypothetical, or interpolated surfaces.

## Configuration and data input

Inspect the linked option/series construction for axes, tooltips, legends, thresholds, null handling, timezone, colour, and precision. Where data arrives by props, follow the parent component through [component-map.json](../evidence/component-map.json).

## Accuracy considerations

Validate population, eligibility, as-of timestamp, missing-value handling, session boundaries, adjusted/unadjusted price basis, and interpolation before using the visual for decisions. Runtime and independent-calculation evidence is catalogued centrally.
