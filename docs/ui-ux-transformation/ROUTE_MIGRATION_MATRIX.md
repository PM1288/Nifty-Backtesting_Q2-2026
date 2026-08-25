# Route Migration Matrix

Verified against `neon-stock-terminal/apps/web/src/App.tsx` on 2026-08-11. All listed routes currently require an authenticated application session. Admin visibility is client-filtered today and must gain/retain server-side capability enforcement.

Final validation note (19:06 UTC): the seven canonical workspace destinations and separate Admin destination pass direct authenticated loading at desktop/tablet/mobile. All legacy route definitions remain present or redirect through the router; no sidebar route state is used. Specialist Backtesting routes remain separate physical components behind the OIIS Lab workspace identity and are the principal remaining consolidation item.

| # | Legacy route | Current component | Principal current data contract | Target canonical view | Compatibility |
|---:|---|---|---|---|---|
| 01 | `/` | `LandingPage` | `/v1/overview`, supporting metrics, quote WS | Today / Market Canvas | Keep canonical |
| 02 | `/analytics` | `AnalyticsOverviewPage` | board brief, dashboard summary/sections | Markets / Market Story | Deep link selects tab |
| 03 | `/analytics/leadership` | `AnalyticsLeadershipPage` | `/v1/analytics/leadership` | Markets / Leadership | Deep link selects tab |
| 04 | `/analytics/daily-setups` | `AnalyticsSetupsPage` | `/v1/analytics/daily-setups` | Today / Setups | Deep link selects view |
| 05 | `/analytics/market-state` | `AnalyticsMarketStatePage` | `/v1/analytics/market-state` | Markets / Regime | Deep link selects tab |
| 06 | `/analytics/regime` | `AnalyticsRegimePage` | dashboard summary/regime | Markets / Regime | Canonical tab path |
| 07 | `/analytics/supporting-metrics` | `AnalyticsSupportingMetricsPage` | `/v1/analytics/supporting-metrics` | Markets / Story evidence | Deep link selects evidence |
| 08 | `/analytics/risk` | `AnalyticsRiskPage` | events/flows and anomaly/risk sections | Markets / Risk | Deep link selects tab |
| 09 | `/analytics/indicators` | `AnalyticsIndicatorsPage` | indicator education and strategy snapshot | Stocks / Indicator Explorer | Canonical tab path |
| 10 | `/analytics/stock/:symbol` | `AnalyticsStockPage` | intraday stock, overview, history, OIIS context, backtests | Stocks / Stock 360 | Keep canonical symbol route |
| 11 | `/catalysts/context` | `AnalyticsEventContextPage` | `/v1/analytics/event-context` | Stocks / Events | Deep link selects context |
| 12 | `/catalysts/events` | `AnalyticsEventsPage` | `/v1/analytics/events` | Stocks / Events | Deep link selects timeline |
| 13 | `/institutional/flow` | `AnalyticsFiiFlowPage` | `/v1/analytics/fii-flow` | Markets/Stocks institutional context | Deep link selects dated context |
| 14 | `/institutional/reports` | `AnalyticsFiiReportsPage` | `/v1/fii-reports/runs*` | Data & Operations / Ingestion | Deep link selects tab |
| 15 | `/options/structure` | `AnalyticsOptionsStructurePage` | `/v1/analytics/options-structure` | Derivatives / Structure | Deep link selects tab |
| 16 | `/options/snapshot` | `AnalyticsOptionsPage` | option-chain latest/series/analytics | Derivatives / Options Overview | Deep link selects tab |
| 17 | `/options/volatility-signals` | `FnoVolatilityPage` | `/v1/fno-volatility/dashboard` | Derivatives / Volatility Signals | Deep link selects tab |
| 18 | `/strategy/evaluation` | `AnalyticsStrategyEvaluationPage` | `/v1/analytics/strategy-evaluation` | OIIS Lab / Definition or Results | Redirect after replacement |
| 19 | `/strategy/oiis-live` | `OiisLivePage` | `/v1/oiis-live/dashboard` | OIIS Lab / Live Selection | Keep canonical |
| 20 | `/paper-trading` | `PaperTradingCommandCenter` | `/v1/workspace/paper-trading*` | Paper Trading / Portfolio | Keep canonical |
| 21 | `/market/nifty-500` | `Nifty500Page` | workspace breadth contract | Markets / Breadth | Deep link selects true universe |
| 22 | `/futures` | `FuturesPage` | workspace futures contract | Derivatives / Futures | Deep link selects tab |
| 23 | `/analytics/flows` | `AnalyticsFlowsPage` | `/v1/analytics/flows` | Markets / Advanced Flows | Deep link selects tab |
| 24 | `/analytics/system/quality` | `AnalyticsQualityPage` | `/v1/analytics/quality` | Data & Operations / Trust | Keep canonical quality path |
| 25 | `/analytics/system/map` | `AnalyticsSystemMapPage` | ops runs/quality/export manifests | Data & Operations / Documentation | Deep link selects tab |
| 26 | `/heatmap/change` | `ChangeHeatmapPage` | `/v1/change-heatmap` | Markets / Heatmaps / Change | Deep link sets lens |
| 27 | `/heatmap/rsi` | `RsiSurfacePage` | `/v1/rsi-surface` | Markets / Heatmaps / RSI | Deep link sets lens |
| 28 | `/heatmap/will` | `WillSurfacePage` | `/v1/will-surface` | Markets / Heatmaps / Williams | Deep link sets lens |
| 29 | `/backtesting` | `BacktestingOverviewPage` | `/v1/backtesting/overview` | OIIS Lab / Selected Run Overview | Deep link selects tab |
| 30 | `/backtesting/lab` | `BacktestingLabPage` | `/v1/backtesting/lab/*` | OIIS Lab / Builder | Keep builder path |
| 31 | `/backtesting/strategies` | `BacktestingStrategyLibraryPage` | `/v1/backtesting/strategies` | OIIS Lab / Catalogue | Deep link selects tab |
| 32 | `/backtesting/strategies/:id` | `BacktestingStrategyDetailPage` | strategy detail/scenarios | OIIS Lab / Strategy Detail | Keep ID context |
| 33 | `/backtesting/results` | `BacktestingPortfolioResultsPage` | fixed strategy scenario detail | OIIS Lab / Results / Portfolio | Deep link selects tab |
| 34 | `/backtesting/regimes` | `BacktestingRegimeAnalysisPage` | strategy scenario detail | OIIS Lab / Diagnostics / Regime | Deep link selects subtab |
| 35 | `/backtesting/stocks` | `BacktestingStockInsightsPage` | `/v1/backtesting/compare` | OIIS Lab / Diagnostics / Stock Fit | Deep link selects subtab |
| 36 | `/backtesting/daily-summary` | `BacktestingDailySummaryPage` | `/v1/backtesting/daily-summary` | OIIS Lab / Latest Session | Deep link selects tab |
| 37 | `/backtesting/compare` | `BacktestingComparePage` | `/v1/backtesting/compare` | OIIS Lab / Compare | Keep canonical compare path |
| 38 | `/backtesting/runs` | `BacktestingRunsPage` | `/v1/backtesting/runs` | Data & Operations / Run Monitor | Deep link selects operations tab |
| 39 | `/backtesting/h30` | `BacktestingH30Page` | backtesting scenario evidence | OIIS Lab / Diagnostics / 30-Day | Deep link selects subtab |
| 40 | `/analytics/learn` | `AnalyticsLearnPage` | learner/regime/watchlist sections | OIIS Lab / Research Evidence | Deep link selects subtab |
| 41 | `/analytics/simulator` | `AnalyticsSimulatorPage` | `/v1/analytics/simulator*` | OIIS Lab / Simulator | Keep simulator path |
| 42 | `/control-plane` | `AdminPage` | workspace/admin operational contracts | Separate Admin shell | Keep path; enforce capability |

## Existing compatibility routes

`/dashboard/*`, `/stock/*`, `/option-chain/*`, `/change-heatmap`, `/rsi-surface`, `/will-surface`, `/analytics/quality`, `/analytics/signals/flows`, `/analytics/events`, `/analytics/fii-reports`, `/analytics/setups`, `/analytics/strategy-evaluation` currently redirect. They remain part of route regression coverage; query/symbol/run context must be retained where meaningful.
# Command and context compatibility addendum — 2026-08-12

All entries in this matrix are indexed by the universal command registry. Legacy routes remain direct-loadable. The seven canonical workspace destinations stay in the primary dock; the independent Rolling Monthly route remains available through Commands and mobile More. Instrument, strategy, run, trade, horizon, source, selected entity and safe return destination can be carried in URL state.
