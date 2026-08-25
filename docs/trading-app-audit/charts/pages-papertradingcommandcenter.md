# pages-papertradingcommandcenter

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

## Identity

| Field | Value |
| --- | --- |
| Source | [neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx) |
| Components | `PaperTradingCommandCenter`, `TradeQualityGuide`, `TradeQualityEvaluator`, `Outcome`, `Metric`, `SummaryMetric`, `TargetScenarioStrip`, `HorizonCard`, `FixedCapitalPortfolioSimulator`, `PaperParallelEvidencePlot`, `OiisContourSurface`, `RewardPainAtlas`, `ConversionSummary`, `AttentionList`, `PaperDataQualityPanel`, `ConversionGroup`, `AdverseLadder`, `TradeIdentity`, `EvidenceTargetCell`, `HorizonOutcomeCell`, `TradePerformanceHeatmap`, `TradeEvidenceTotals`, `UnifiedTradeMatrix`, `TradeDrawer`, `Journey`, `DrawerTargets`, `Evidence`, `DrawerEconomics`, `DrawerCalculationTrace`, `DrawerComments`, `Audit`, `AddPaperTradeDialog`, `API_BASE_URL` |
| Library | Custom SVG/React |
| Pages | `/`, `/dashboard/stocks/:symbol`, `/analytics`, `/analytics/learn`, `/analytics/simulator`, `/analytics/indicators`, `/analytics/indicators/:slug`, `/analytics/stock/:symbol`, `/feedback`, `/backtesting`, `/backtesting/strategies/:strategyId`, `/options/structure`, `/options/snapshot`, `/strategy/oiis-live`, `/strategy/monthly`, `/strategy/rolling-monthly`, `/strategy/rolling-monthly/legacy`, `/paper-trading`, `/market/nifty-500`, `/futures`, `/control-plane`, `/heatmap/change`, `/heatmap/rsi`, `/heatmap/will`, `/stock/:symbol` |
| Titles found | Paper Trading views; Filter paper trades; Sort paper trades; Filter by entry strategy; Related evidence; Trade-quality matrix filters; Filter trade period; Filter trade quality; Inspect ${trade.symbol} trade-quality evidence; ${point.trade.symbol}: process ${point.process.toFixed(2)}%, outcome ${point.outcome.toFixed(2)}%; Inspect ${point.trade.symbol}: process ${point.process.toFixed(2)}%, outcome ${point.outcome.toFixed; ${position.symbol}, ${position.side}, ${compact(position.quantity)} shares, entry ${time(position.en; Parallel coordinates for ${rows.length} paper trades, coloured by ${colourDefinition.label}; ${row.symbol}, ${row.strategy}, ${row.availableDimensions} of ${paperParallelAxes.length} dimensions; OIIS entry factor axes; OIIS surface outcome; ${activeLens.label} by ${axes.xLabel} and ${axes.yLabel} for a fixed two-lakh investment; ${String(point.trade.symbol)}, quantity ${compact(point.trade.opened_quantity)}, entry ${money(point; ${lens} reward versus pain chart; ${trade.symbol}, quality ${qualityScore == null ? ; Paper data quality; ${displayDateKey(key)} · ${valueLabel(bucket)} · ${bucket?.trades.length ?? 0} trades; ${displayDateKey(key)}: ${valueLabel(bucket)}, ${bucket?.trades.length ?? 0} trades; Paper performance heatmap; Heatmap measure; Rolling year ending ${displayDateKey(referenceKey)}; Weekly paper performance by metric and trading day; ${displayDateKey(key)} · ${metricLabels[weekMetric]} · ${valueLabel(bucket, weekMetric)}; ${displayDateKey(key)}, ${metricLabels[weekMetric]}: ${valueLabel(bucket, weekMetric)}; Intraday event type; Intraday paper events for ${displayDateKey(selectedDate)}; Paper trade horizon totals; Capital basis comparison; Action; Open ${trade.symbol} evidence; ${trade.symbol} paper trade detail; Close trade detail; ${detail.trade.symbol} entry-normalised journey; Paper trade quantity policy |
| Direct API paths | Supplied through props/hooks |

## Business meaning and interpretation

The visible title, axes, series encodings, and surrounding copy in the linked source define what the chart says. It is descriptive/diagnostic unless the source explicitly identifies a predictive model. Do not infer executable returns from MFE, simulated, hypothetical, or interpolated surfaces.

## Configuration and data input

Inspect the linked option/series construction for axes, tooltips, legends, thresholds, null handling, timezone, colour, and precision. Where data arrives by props, follow the parent component through [component-map.json](../evidence/component-map.json).

## Accuracy considerations

Validate population, eligibility, as-of timestamp, missing-value handling, session boundaries, adjusted/unadjusted price basis, and interpolation before using the visual for decisions. Runtime and independent-calculation evidence is catalogued centrally.
