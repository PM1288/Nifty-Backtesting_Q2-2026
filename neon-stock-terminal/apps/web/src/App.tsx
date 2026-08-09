import { Suspense, lazy } from "react";
import { Route, Routes, Navigate, useParams } from "react-router-dom";
import { AppShell } from "./components/chrome/AppShell";
import { useI18n } from "./i18n/LocaleProvider";
import { LandingPage } from "./pages/LandingPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import {
  preloadAnalyticsIndicatorsPage,
  preloadAnalyticsDailySetupsPage,
  preloadAnalyticsEventContextPage,
  preloadAnalyticsLearnPage,
  preloadAnalyticsLeadershipPage,
  preloadAnalyticsFiiFlowPage,
  preloadAnalyticsMarketStatePage,
  preloadAnalyticsOptionsPage,
  preloadAnalyticsOptionsStructurePage,
  preloadAnalyticsStrategyEvaluationPage,
  preloadAnalyticsEventsPage,
  preloadAnalyticsFiiReportsPage,
  preloadAnalyticsOverviewPage,
  preloadAnalyticsQualityPage,
  preloadAnalyticsSystemMapPage,
  preloadAnalyticsRegimePage,
  preloadAnalyticsSupportingMetricsPage,
  preloadAnalyticsSimulatorPage,
  preloadBacktestingComparePage,
  preloadBacktestingDailySummaryPage,
  preloadBacktestingLabPage,
  preloadBacktestingOverviewPage,
  preloadBacktestingPortfolioResultsPage,
  preloadBacktestingRegimeAnalysisPage,
  preloadBacktestingRunsPage,
  preloadBacktestingStockInsightsPage,
  preloadBacktestingStrategyDetailPage,
  preloadBacktestingStrategyLibraryPage,
  preloadOiisLivePage,
  preloadChangeHeatmapPage,
  preloadRsiSurfacePage,
  preloadWillSurfacePage
} from "./routePreloads";
import styles from "./pages/AnalyticsPage.module.css";

const ChangeHeatmapPage = lazy(async () => ({ default: (await preloadChangeHeatmapPage()).ChangeHeatmapPage }));
const RsiSurfacePage = lazy(async () => ({ default: (await preloadRsiSurfacePage()).RsiSurfacePage }));
const WillSurfacePage = lazy(async () => ({ default: (await preloadWillSurfacePage()).WillSurfacePage }));
const AnalyticsOverviewPage = lazy(async () => ({ default: (await preloadAnalyticsOverviewPage()).AnalyticsOverviewPage }));
const AnalyticsLeadershipPage = lazy(async () => ({ default: (await preloadAnalyticsLeadershipPage()).AnalyticsLeadershipPage }));
const AnalyticsSetupsPage = lazy(async () => ({ default: (await preloadAnalyticsDailySetupsPage()).AnalyticsSetupsPage }));
const AnalyticsEventContextPage = lazy(async () => ({ default: (await preloadAnalyticsEventContextPage()).AnalyticsEventContextPage }));
const AnalyticsFiiFlowPage = lazy(async () => ({ default: (await preloadAnalyticsFiiFlowPage()).AnalyticsFiiFlowPage }));
const AnalyticsMarketStatePage = lazy(async () => ({ default: (await preloadAnalyticsMarketStatePage()).AnalyticsMarketStatePage }));
const AnalyticsEventsPage = lazy(async () => ({ default: (await preloadAnalyticsEventsPage()).AnalyticsEventsPage }));
const AnalyticsFiiReportsPage = lazy(async () => ({ default: (await preloadAnalyticsFiiReportsPage()).AnalyticsFiiReportsPage }));
const AnalyticsFlowsPage = lazy(async () => ({ default: (await import("./pages/AnalyticsFlowsPage")).AnalyticsFlowsPage }));
const AnalyticsSupportingMetricsPage = lazy(async () => ({ default: (await preloadAnalyticsSupportingMetricsPage()).AnalyticsSupportingMetricsPage }));
const AnalyticsQualityPage = lazy(async () => ({ default: (await preloadAnalyticsQualityPage()).AnalyticsQualityPage }));
const AnalyticsSystemMapPage = lazy(async () => ({ default: (await preloadAnalyticsSystemMapPage()).AnalyticsSystemMapPage }));
const AnalyticsRegimePage = lazy(async () => ({ default: (await preloadAnalyticsRegimePage()).AnalyticsRegimePage }));
const AnalyticsRiskPage = lazy(async () => ({ default: (await import("./pages/AnalyticsRiskPage")).AnalyticsRiskPage }));
const AnalyticsLearnPage = lazy(async () => ({ default: (await preloadAnalyticsLearnPage()).AnalyticsLearnPage }));
const AnalyticsSimulatorPage = lazy(async () => ({ default: (await preloadAnalyticsSimulatorPage()).AnalyticsSimulatorPage }));
const AnalyticsIndicatorsPage = lazy(async () => ({ default: (await preloadAnalyticsIndicatorsPage()).AnalyticsIndicatorsPage }));
const AnalyticsStockPage = lazy(async () => ({ default: (await import("./pages/AnalyticsStockPage")).AnalyticsStockPage }));
const AnalyticsOptionsStructurePage = lazy(async () => ({ default: (await preloadAnalyticsOptionsStructurePage()).AnalyticsOptionsStructurePage }));
const AnalyticsOptionsPage = lazy(async () => ({ default: (await preloadAnalyticsOptionsPage()).AnalyticsOptionsPage }));
const AnalyticsStrategyEvaluationPage = lazy(async () => ({ default: (await preloadAnalyticsStrategyEvaluationPage()).AnalyticsStrategyEvaluationPage }));
const FeedbackPage = lazy(async () => ({ default: (await import("./pages/FeedbackPage")).FeedbackPage }));
const BacktestingOverviewPage = lazy(async () => ({ default: (await preloadBacktestingOverviewPage()).BacktestingOverviewPage }));
const BacktestingLabPage = lazy(async () => ({ default: (await preloadBacktestingLabPage()).BacktestingLabPage }));
const BacktestingStrategyLibraryPage = lazy(async () => ({ default: (await preloadBacktestingStrategyLibraryPage()).BacktestingStrategyLibraryPage }));
const BacktestingStrategyDetailPage = lazy(async () => ({ default: (await preloadBacktestingStrategyDetailPage()).BacktestingStrategyDetailPage }));
const BacktestingPortfolioResultsPage = lazy(async () => ({ default: (await preloadBacktestingPortfolioResultsPage()).BacktestingPortfolioResultsPage }));
const BacktestingRegimeAnalysisPage = lazy(async () => ({ default: (await preloadBacktestingRegimeAnalysisPage()).BacktestingRegimeAnalysisPage }));
const BacktestingStockInsightsPage = lazy(async () => ({ default: (await preloadBacktestingStockInsightsPage()).BacktestingStockInsightsPage }));
const BacktestingDailySummaryPage = lazy(async () => ({ default: (await preloadBacktestingDailySummaryPage()).BacktestingDailySummaryPage }));
const BacktestingComparePage = lazy(async () => ({ default: (await preloadBacktestingComparePage()).BacktestingComparePage }));
const BacktestingRunsPage = lazy(async () => ({ default: (await preloadBacktestingRunsPage()).BacktestingRunsPage }));
const BacktestingH30Page = lazy(async () => ({ default: (await import("./pages/BacktestingH30Page")).BacktestingH30Page }));
const OiisLivePage = lazy(async () => ({ default: (await preloadOiisLivePage()).OiisLivePage }));
const PaperTradingPage = lazy(async () => ({ default: (await import("./pages/WorkspacePages")).PaperTradingPage }));
const Nifty500Page = lazy(async () => ({ default: (await import("./pages/WorkspacePages")).Nifty500Page }));
const FuturesPage = lazy(async () => ({ default: (await import("./pages/WorkspacePages")).FuturesPage }));
const AdminPage = lazy(async () => ({ default: (await import("./pages/WorkspacePages")).AdminPage }));

function RouteFallback() {
  const { t } = useI18n();
  return <div className={styles.routeFallback}>{t("ui.loadingDashboard", "Preparing your workspace…")}</div>;
}

function LegacyStockRedirect() {
  const params = useParams();
  const symbol = params.symbol ? encodeURIComponent(params.symbol) : "RELIANCE";
  return <Navigate to={`/analytics/stock/${symbol}`} replace />;
}

export default function App() {
  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard/home" element={<Navigate to="/" replace />} />
          <Route path="/dashboard/market" element={<Navigate to="/analytics" replace />} />
          <Route path="/dashboard/market/state" element={<Navigate to="/analytics/market-state" replace />} />
          <Route path="/dashboard/market/regimes" element={<Navigate to="/analytics/regime" replace />} />
          <Route path="/dashboard/oiis" element={<Navigate to="/strategy/oiis-live" replace />} />
          <Route path="/dashboard/oiis/evaluation" element={<Navigate to="/strategy/evaluation" replace />} />
          <Route path="/dashboard/stocks" element={<Navigate to="/analytics/leadership" replace />} />
          <Route path="/dashboard/stocks/:symbol" element={<LegacyStockRedirect />} />
          <Route path="/dashboard/strategy-lab" element={<Navigate to="/backtesting" replace />} />
          <Route path="/dashboard/strategy-lab/quick" element={<Navigate to="/backtesting/lab" replace />} />
          <Route path="/dashboard/strategy-lab/runs" element={<Navigate to="/backtesting/runs" replace />} />
          <Route path="/dashboard/strategy-lab/compare" element={<Navigate to="/backtesting/compare" replace />} />
          <Route path="/dashboard/options" element={<Navigate to="/options/structure" replace />} />
          <Route path="/dashboard/research" element={<Navigate to="/backtesting/h30" replace />} />
          <Route path="/dashboard/data-quality" element={<Navigate to="/analytics/system/quality" replace />} />
          <Route path="/dashboard/operations" element={<Navigate to="/analytics/system/map" replace />} />
          <Route path="/analytics" element={<AnalyticsOverviewPage />} />
          <Route path="/analytics/leadership" element={<AnalyticsLeadershipPage />} />
          <Route path="/analytics/daily-setups" element={<AnalyticsSetupsPage />} />
          <Route path="/analytics/market-state" element={<AnalyticsMarketStatePage />} />
          <Route path="/analytics/strategy-evaluation" element={<Navigate to="/strategy/evaluation" replace />} />
          <Route path="/analytics/events" element={<Navigate to="/catalysts/events" replace />} />
          <Route path="/catalysts" element={<Navigate to="/catalysts/context" replace />} />
          <Route path="/catalysts/context" element={<AnalyticsEventContextPage />} />
          <Route path="/catalysts/events" element={<AnalyticsEventsPage />} />
          <Route path="/analytics/fii-reports" element={<Navigate to="/institutional/reports" replace />} />
          <Route path="/analytics/regime" element={<AnalyticsRegimePage />} />
          <Route path="/analytics/supporting-metrics" element={<AnalyticsSupportingMetricsPage />} />
          <Route path="/analytics/setups" element={<Navigate to="/analytics/daily-setups" replace />} />
          <Route path="/analytics/risk" element={<AnalyticsRiskPage />} />
          <Route path="/analytics/learn" element={<AnalyticsLearnPage />} />
          <Route path="/analytics/simulator" element={<AnalyticsSimulatorPage />} />
          <Route path="/analytics/indicators" element={<AnalyticsIndicatorsPage />} />
          <Route path="/analytics/indicators/:slug" element={<AnalyticsIndicatorsPage />} />
          <Route path="/analytics/stock/:symbol" element={<AnalyticsStockPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/backtesting" element={<BacktestingOverviewPage />} />
          <Route path="/backtesting/lab" element={<BacktestingLabPage />} />
          <Route path="/backtesting/strategies" element={<BacktestingStrategyLibraryPage />} />
          <Route path="/backtesting/strategies/:strategyId" element={<BacktestingStrategyDetailPage />} />
          <Route path="/backtesting/results" element={<BacktestingPortfolioResultsPage />} />
          <Route path="/backtesting/regimes" element={<BacktestingRegimeAnalysisPage />} />
          <Route path="/backtesting/stocks" element={<BacktestingStockInsightsPage />} />
          <Route path="/backtesting/daily-summary" element={<BacktestingDailySummaryPage />} />
          <Route path="/backtesting/compare" element={<BacktestingComparePage />} />
          <Route path="/backtesting/runs" element={<BacktestingRunsPage />} />
          <Route path="/backtesting/h30" element={<BacktestingH30Page />} />
          <Route path="/institutional" element={<Navigate to="/institutional/flow" replace />} />
          <Route path="/institutional/flow" element={<AnalyticsFiiFlowPage />} />
          <Route path="/institutional/reports" element={<AnalyticsFiiReportsPage />} />
          <Route path="/options" element={<Navigate to="/options/structure" replace />} />
          <Route path="/options/structure" element={<AnalyticsOptionsStructurePage />} />
          <Route path="/options/snapshot" element={<AnalyticsOptionsPage />} />
          <Route path="/strategy" element={<Navigate to="/strategy/evaluation" replace />} />
          <Route path="/strategy/evaluation" element={<AnalyticsStrategyEvaluationPage />} />
          <Route path="/strategy/oiis-live" element={<OiisLivePage />} />
          <Route path="/paper-trading" element={<PaperTradingPage />} />
          <Route path="/market/nifty-500" element={<Nifty500Page />} />
          <Route path="/futures" element={<FuturesPage />} />
          <Route path="/control-plane" element={<AdminPage />} />
          <Route path="/option-chain" element={<Navigate to="/options/structure" replace />} />
          <Route path="/option-chain/*" element={<Navigate to="/options/structure" replace />} />
          <Route path="/analytics/flows" element={<AnalyticsFlowsPage />} />
          <Route path="/analytics/quality" element={<Navigate to="/analytics/system/quality" replace />} />
          <Route path="/analytics/system/quality" element={<AnalyticsQualityPage />} />
          <Route path="/analytics/system/map" element={<AnalyticsSystemMapPage />} />
          <Route path="/analytics/signals/flows" element={<Navigate to="/analytics/flows" replace />} />
          <Route path="/change-heatmap" element={<Navigate to="/heatmap/change" replace />} />
          <Route path="/heatmap/change" element={<ChangeHeatmapPage />} />
          <Route path="/rsi-surface" element={<Navigate to="/heatmap/rsi" replace />} />
          <Route path="/heatmap/rsi" element={<RsiSurfacePage />} />
          <Route path="/will-surface" element={<Navigate to="/heatmap/will" replace />} />
          <Route path="/heatmap/will" element={<WillSurfacePage />} />
          <Route path="/stock/:symbol" element={<LegacyStockRedirect />} />
          <Route path="/stock" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
