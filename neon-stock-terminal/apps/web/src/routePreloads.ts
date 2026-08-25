export const preloadChangeHeatmapPage = () => import("./pages/ChangeHeatmapPage");
export const preloadRsiSurfacePage = () => import("./pages/RsiSurfacePage");
export const preloadWillSurfacePage = () => import("./pages/WillSurfacePage");
export const preloadAnalyticsOverviewPage = () => import("./pages/AnalyticsOverviewPage");
export const preloadAnalyticsLeadershipPage = () => import("./pages/AnalyticsLeadershipPage");
export const preloadAnalyticsDailySetupsPage = () => import("./pages/AnalyticsSetupsPage");
export const preloadAnalyticsEventContextPage = () => import("./pages/AnalyticsEventContextPage");
export const preloadAnalyticsMarketStatePage = () => import("./pages/AnalyticsMarketStatePage");
export const preloadAnalyticsEventsPage = () => import("./pages/AnalyticsEventsPage");
export const preloadAnalyticsFiiFlowPage = () => import("./pages/AnalyticsFiiFlowPage");
export const preloadAnalyticsFiiReportsPage = () => import("./pages/AnalyticsFiiReportsPage");
export const preloadAnalyticsSupportingMetricsPage = () => import("./pages/AnalyticsSupportingMetricsPage");
export const preloadAnalyticsQualityPage = () => import("./pages/AnalyticsQualityPage");
export const preloadAnalyticsSystemMapPage = () => import("./pages/AnalyticsSystemMapPage");
export const preloadAnalyticsRegimePage = () => import("./pages/AnalyticsRegimePage");
export const preloadAnalyticsLearnPage = () => import("./pages/AnalyticsLearnPage");
export const preloadAnalyticsSimulatorPage = () => import("./pages/AnalyticsSimulatorPage");
export const preloadAnalyticsIndicatorsPage = () => import("./pages/AnalyticsIndicatorsPage");
export const preloadAnalyticsOptionsPage = () => import("./pages/AnalyticsOptionsPage");
export const preloadAnalyticsOptionsStructurePage = () => import("./pages/AnalyticsOptionsStructurePage");
export const preloadAnalyticsStrategyEvaluationPage = () => import("./pages/AnalyticsStrategyEvaluationPage");
export const preloadAnalyticsStockPage = () => import("./pages/AnalyticsStockPage");
export const preloadBacktestingOverviewPage = () => import("./pages/BacktestingOverviewPage");
export const preloadBacktestingLabPage = () => import("./pages/BacktestingLabPage");
export const preloadBacktestingStrategyLibraryPage = () => import("./pages/BacktestingStrategyLibraryPage");
export const preloadBacktestingStrategyDetailPage = () => import("./pages/BacktestingStrategyDetailPage");
export const preloadBacktestingPortfolioResultsPage = () => import("./pages/BacktestingPortfolioResultsPage");
export const preloadBacktestingRegimeAnalysisPage = () => import("./pages/BacktestingRegimeAnalysisPage");
export const preloadBacktestingStockInsightsPage = () => import("./pages/BacktestingStockInsightsPage");
export const preloadBacktestingDailySummaryPage = () => import("./pages/BacktestingDailySummaryPage");
export const preloadBacktestingComparePage = () => import("./pages/BacktestingComparePage");
export const preloadBacktestingRunsPage = () => import("./pages/BacktestingRunsPage");
export const preloadOiisLivePage = () => import("./pages/OiisLivePage");
export const preloadRollingMonthlyPage = () => import("./pages/RollingMonthlyPage");
export const preloadMonthlyStrategiesPage = () => import("./pages/MonthlyStrategiesPage");
export const preloadLongOptionsPage = () => import("./pages/LongOptionsPage");
export const preloadNiftyWeeklyOptionsPage = () => import("./pages/NiftyWeeklyOptionsPage");
export const preloadNseIntelligencePage = () => import("./pages/NseIntelligencePage");

export function preloadCoreDashboardRoutes() {
  return Promise.allSettled([
    preloadAnalyticsOverviewPage(),
    preloadAnalyticsLeadershipPage(),
    preloadAnalyticsDailySetupsPage(),
    preloadAnalyticsEventContextPage(),
    preloadAnalyticsMarketStatePage(),
    preloadAnalyticsEventsPage(),
    preloadAnalyticsFiiFlowPage(),
    preloadAnalyticsFiiReportsPage(),
    preloadAnalyticsStrategyEvaluationPage(),
    preloadAnalyticsRegimePage(),
    preloadChangeHeatmapPage(),
    preloadRsiSurfacePage(),
    preloadWillSurfacePage()
  ]);
}

export function preloadLearningRoutes() {
  return Promise.allSettled([
    preloadAnalyticsLearnPage(),
    preloadAnalyticsSimulatorPage(),
    preloadAnalyticsIndicatorsPage(),
    preloadAnalyticsOptionsStructurePage(),
    preloadAnalyticsOptionsPage(),
    preloadAnalyticsSupportingMetricsPage(),
    preloadAnalyticsQualityPage(),
    preloadAnalyticsSystemMapPage(),
    preloadNseIntelligencePage()
  ]);
}

export function preloadBacktestingRoutes() {
  return Promise.allSettled([
    preloadBacktestingOverviewPage(),
    preloadBacktestingLabPage(),
    preloadBacktestingStrategyLibraryPage(),
    preloadBacktestingPortfolioResultsPage(),
    preloadBacktestingRegimeAnalysisPage(),
    preloadBacktestingStockInsightsPage(),
    preloadBacktestingDailySummaryPage(),
    preloadBacktestingComparePage(),
    preloadBacktestingRunsPage()
  ]);
}
