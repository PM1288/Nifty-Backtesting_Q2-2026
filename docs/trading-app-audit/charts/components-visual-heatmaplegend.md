# components-visual-heatmaplegend

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

## Identity

| Field | Value |
| --- | --- |
| Source | [neon-stock-terminal/apps/web/src/components/visual/HeatmapLegend.tsx](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/components/visual/HeatmapLegend.tsx) |
| Components | `HeatmapLegend` |
| Library | CSS/DOM visualisation |
| Pages | `/heatmap/change`, `/heatmap/rsi`, `/heatmap/will` |
| Titles found | Dynamic/none statically resolved |
| Direct API paths | Supplied through props/hooks |

## Business meaning and interpretation

The visible title, axes, series encodings, and surrounding copy in the linked source define what the chart says. It is descriptive/diagnostic unless the source explicitly identifies a predictive model. Do not infer executable returns from MFE, simulated, hypothetical, or interpolated surfaces.

## Configuration and data input

Inspect the linked option/series construction for axes, tooltips, legends, thresholds, null handling, timezone, colour, and precision. Where data arrives by props, follow the parent component through [component-map.json](../evidence/component-map.json).

## Accuracy considerations

Validate population, eligibility, as-of timestamp, missing-value handling, session boundaries, adjusted/unadjusted price basis, and interpolation before using the visual for decisions. Runtime and independent-calculation evidence is catalogued centrally.
