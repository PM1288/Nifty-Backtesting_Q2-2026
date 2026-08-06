# Full-Path Ladder V2 Limitations

- The canonical universe is a current-panel Nifty 100 view and has survivorship
  bias. It is not point-in-time membership evidence.
- `M&M` and `MAXHEALTH` minute CSVs are absent. The runner skips rather than
  invents their minute paths, so data completeness is WARN.
- One-minute OHLC cannot establish ordering when reward and adverse thresholds
  first cross in the same bar; both facts are retained as order unknown.
- Corporate-action normalization is visible as a minute-to-EOD basis factor,
  but a dedicated corporate-action fixture remains to be added to the golden
  suite.
- The result is isolated per symbol. The ₹16 lakh/eight-position portfolio
  scheduler is a distinct execution simulation and was not inferred here.
- Dedicated API endpoints, UI ladder matrix, Excel/Parquet exports,
  cancel/resume equality and cross-runner equivalence remain open. Runners that
  do not emit normalized V2 evidence must remain outside V2 comparisons.
- No strategy thresholds were optimized during this correction.
