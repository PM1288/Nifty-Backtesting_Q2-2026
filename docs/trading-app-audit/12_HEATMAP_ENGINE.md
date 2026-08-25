# Heatmap engine

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

Primary heatmap routes are `/heatmap/change`, `/heatmap/rsi`, and `/heatmap/will`; the Home board also renders a stock/sector canvas. Dedicated APIs are `/v1/change-heatmap`, `/v1/rsi-surface`, and `/v1/will-surface`.

The exact universe, previous-close source, latest price source, sector grouping, tile sizing, semantic scale, missing-state rules, and click behaviour are defined in the corresponding backend route and React visual component. See their chart dossiers and route files. A tile is not assumed live unless its source timestamp/freshness state confirms it.

Sample mathematical reconciliation is recorded in the Playwright/runtime audit and [accuracy catalog](16_ACCURACY_AND_DATA_QUALITY.md).
