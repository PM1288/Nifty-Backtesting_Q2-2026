# PaperTradingPage

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

## Page overview

| Field | Evidence |
| --- | --- |
| Route | `/paper-trading` |
| Main component | `PaperTradingPage` |
| Source | [neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx) |
| Authentication | All `/v1` gateway routes are protected by the global auth guard; public shell access may display the authentication gate. |
| URL parameters | None declared in the route pattern |
| API client dependencies | `/v1/workspace/paper-trading`, `/v1/workspace/paper-trading/trades/${trade.trade_group_id}/quality-review`, `/v1/workspace/paper-trading/trades/${trade.trade_group_id}`, `/v1/workspace/paper-trading/trades/${detail.trade.trade_group_id}/comments`, `/v1/workspace/paper-trading/manual-trades` |
| CSS modules/styles | `./PaperTradingCommandCenter.module.css` |

## Purpose and decisions supported

The component name, rendered headings, controls, API dependencies, and screenshots below are the authoritative evidence for this page. Business interpretation is recorded only where source labels and calculation code support it. Any intent not stated in code is **UNVERIFIED**.

## Visual structure

```text
PaperTradingPage
├── No filled paper observations yet
├── What is happening now?
├── How do entry conditions connect to every outcome horizon?
├── How did fixed-capital allocation behave?
├── When did evidence mature, improve or deteriorate?
├── How much favourable and adverse path did each trade experience?
├── Reward vs pain map
├── Outcome conversion
├── Complete trade evidence
├── How do governed and counterfactual exits differ?
├── Can this evidence be trusted and reproduced?
├── A good result is not automatically a good trade.
├── How every factor is rated
├── Final interpretation
├── GOOD HIGH
├── GOOD MEDIUM
├── GOOD LOW
├── BAD RISK
├── Trade-quality register
├── · Trade Quality Matrix
├── Available criterion evidence
├── Admin evidence review
├── Every stock from entry evidence to 30-session opportunity
├── Which entry conditions produced reward or pain
├── Needs attention
├── Canonical paper evidence trust matrix
├── ADVERSE EXCURSION LADDER
├── Paper performance heatmap
├── Trade journey · actual and analytical path
├── Favourable target chronology
```

## Component hierarchy

| Child component | Evidence |
| --- | --- |
| AnyRow | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| HTMLInputElement | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| AtlasLens | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| StockProfileFilters | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| PaperWorkbenchContext | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| CalculationTrace | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| PageView | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| K | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| PaperWorkbenchHeader | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| PaperWorkbenchSubnav | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| AnalysisContextBar | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| StockUniverseFilterBar | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| TradeQualityGuide | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| AccountingLaneOverview | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| StockDistribution | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| SummaryMetric | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| PaperParallelEvidencePlot | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| OiisContourSurface | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| FixedCapitalPortfolioSimulator | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| TradePerformanceHeatmap | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| RewardPainAtlas | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| ConversionSummary | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| AttentionList | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| TradeEvidenceTotals | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| UnifiedTradeMatrix | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| TargetScenarioStrip | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| PaperDataQualityPanel | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| RelatedJourney | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| LearnAboutThisAnalysis | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| TradeDrawer | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| AddPaperTradeDialog | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| CalculationTraceDrawer | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| TradeQualityEvaluator | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| Record | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| PaperParallelAxisId | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| SVGSVGElement | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| StockIdentity | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| OiisSurfaceLens | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| OiisAxisPreset | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| ReturnType | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| HeatmapView | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| HeatmapMetric | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| IntradayEventFilter | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| HTMLTableRowElement | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| TradeIdentity | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| EvidenceTargetCell | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| HorizonOutcomeCell | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| DrawerTab | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| Metric | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| Journey | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| DrawerTargets | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| Evidence | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| DrawerEconomics | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| DrawerComments | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| DrawerCalculationTrace | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |
| Audit | Referenced by neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx |


## API and data flow

| Frontend function | Endpoint(s) | Evidence |
| --- | --- | --- |
| direct fetch/path reference | `/v1/workspace/paper-trading`, `/v1/workspace/paper-trading/trades/${trade.trade_group_id}/quality-review`, `/v1/workspace/paper-trading/trades/${trade.trade_group_id}`, `/v1/workspace/paper-trading/trades/${detail.trade.trade_group_id}/comments`, `/v1/workspace/paper-trading/manual-trades` | [source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx#L1) |


The canonical trace is: route → page component → imported hook/API client → authenticated gateway endpoint → route handler/service query → PostgreSQL or provider adapter → response/view model → component. Exact endpoint implementations are indexed in [API catalog](../04_API_CATALOG.md).

## Loading, empty and error behaviour

Inspect conditional branches in [the page source](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx). Runtime captures record console errors, failed requests, page headings, overflow, and authenticated state. A missing screenshot or absent runtime record is **UNVERIFIED**, not a pass.

## Responsive and styling behaviour

CSS is controlled by `./PaperTradingCommandCenter.module.css`. Viewport evidence is linked below.

## Screenshots

- [1920×1080](../screenshots/desktop/paper-trading__1920x1080__full.png)
- [1440×900](../screenshots/desktop/paper-trading__1440x900__full.png)
- [1024×768](../screenshots/tablet/paper-trading__1024x768__full.png)
- [390×844](../screenshots/mobile/paper-trading__390x844__full.png)

## Accuracy and limitations

No value is classified as accurate merely because it renders. See [Accuracy and data quality](../16_ACCURACY_AND_DATA_QUALITY.md), [metric catalog](../08_METRIC_AND_CALCULATION_CATALOG.md), and runtime request evidence in `evidence/runtime-audit.json`.

<!-- RUNTIME_AUDIT_START -->
## Runtime verification

| Viewport | HTTP | Result | First heading | Tables | Canvas | SVG | API errors | Console errors | Body overflow |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1024x768 | 200 | CAPTURED | Paper Trading Evidence Workbench | 4 | 1 | 32 | 0 | 4 | NO |
| 1440x900 | 200 | CAPTURED | Paper Trading Evidence Workbench | 4 | 1 | 32 | 0 | 0 | NO |
| 1920x1080 | 200 | CAPTURED | Paper Trading Evidence Workbench | 4 | 1 | 32 | 0 | 0 | NO |
| 390x844 | 200 | CAPTURED | Paper Trading Evidence Workbench | 4 | 1 | 32 | 0 | 1 | NO |


### Observed API dependencies

| Method | Path | Observed statuses |
| --- | --- | --- |
| GET | /n50/auth/session | 200 |
| GET | /n50/v1/overview | 200 |
| GET | /n50/api/v1/dashboard/sections/regime-breadth | 200 |
| GET | /n50/api/v1/dashboard/summary | 200 |
| GET | /n50/v1/workspace/paper-trading | 200 |


### Captured evidence

- [full page — 1440x900](../screenshots/desktop/paper-trading__1440x900__full.png)
- [full page — 1920x1080](../screenshots/desktop/paper-trading__1920x1080__full.png)
- [authentication required — 1440x900](../screenshots/errors/paper-trading__auth-required.png)
- [full page — 390x844](../screenshots/mobile/paper-trading__390x844__full.png)
- [top 1 — 1920x1080](../screenshots/sections/paper-trading__top-1.png)
- [full page — 1024x768](../screenshots/tablet/paper-trading__1024x768__full.png)
<!-- RUNTIME_AUDIT_END -->
