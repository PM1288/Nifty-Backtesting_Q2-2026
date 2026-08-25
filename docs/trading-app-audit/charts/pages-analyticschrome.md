# pages-analyticschrome

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

## Identity

| Field | Value |
| --- | --- |
| Source | [neon-stock-terminal/apps/web/src/pages/AnalyticsChrome.tsx](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/pages/AnalyticsChrome.tsx) |
| Components | `AnalyticsHeader`, `ExplainThis`, `ANALYTICS_MODE_STORAGE_KEY`, `ANALYTICS_MODE_EVENT`, `SECTION_META`, `MARKET_SECTION_TABS`, `CATALYSTS_SECTION_TABS`, `INSTITUTIONAL_SECTION_TABS`, `STOCKS_SECTION_TABS`, `OPTIONS_SECTION_TABS`, `STRATEGY_SECTION_TABS`, `SIGNAL_SECTION_TABS`, `LEARNING_SECTION_TABS`, `SYSTEM_SECTION_TABS` |
| Library | CSS/DOM visualisation |
| Pages | `/analytics`, `/analytics/leadership`, `/analytics/daily-setups`, `/catalysts/context`, `/catalysts/events`, `/analytics/regime`, `/analytics/risk`, `/analytics/learn`, `/analytics/simulator`, `/analytics/indicators`, `/analytics/indicators/:slug`, `/analytics/stock/:symbol`, `/feedback`, `/institutional/flow`, `/institutional/reports`, `/options/structure`, `/options/snapshot`, `/analytics/flows`, `/analytics/system/quality`, `/analytics/system/map`, `/heatmap/change`, `/heatmap/rsi`, `/heatmap/will` |
| Titles found | Dynamic/none statically resolved |
| Direct API paths | Supplied through props/hooks |

## Business meaning and interpretation

The visible title, axes, series encodings, and surrounding copy in the linked source define what the chart says. It is descriptive/diagnostic unless the source explicitly identifies a predictive model. Do not infer executable returns from MFE, simulated, hypothetical, or interpolated surfaces.

## Configuration and data input

Inspect the linked option/series construction for axes, tooltips, legends, thresholds, null handling, timezone, colour, and precision. Where data arrives by props, follow the parent component through [component-map.json](../evidence/component-map.json).

## Accuracy considerations

Validate population, eligibility, as-of timestamp, missing-value handling, session boundaries, adjusted/unadjusted price basis, and interpolation before using the visual for decisions. Runtime and independent-calculation evidence is catalogued centrally.
