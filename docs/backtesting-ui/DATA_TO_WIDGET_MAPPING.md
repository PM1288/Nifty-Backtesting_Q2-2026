# Backtesting data-to-widget mapping

| Story/widget | DTO fields | Canonical source |
| --- | --- | --- |
| Context strip | `generatedAt`, `asOfDate`, scenario key, universe/capital mode | published batch and `nse_app.backtest_run` |
| Portfolio verdict | `currentValue`, `investedAmount`, `totalReturnPct`, `realizedPnl`, `unrealizedPnl` | scenario summary JSON and daily-equity mart |
| Economics | `preTaxRealizedPnl`, `taxDeducted`, `afterTaxRealizedPnl`, `totalCharges` | canonical trade/accounting reducer |
| Risk | `maxDrawdownPct`, `openPositions`, `exposurePct`, drawdown curve | daily-equity and portfolio-state results |
| Benchmark | `benchmarkFinalValue`, `excessOverBenchmark`, `benchmarkLabel`, equity curve | backtest benchmark result |
| Individual journey | version config/assumptions, trades, open positions, price/indicator chart | strategy version, trade log and feature snapshots |
| Comparison compatibility | common batch timestamp, as-of date, universe and capital filter | published comparison snapshot |
| Comparison objective | returned `totalReturnPct`, `realizedPnl`, `maxDrawdownPct`, `winRatePct`, trade count and costs | comparison summary mart |
| Stock/regime evidence | stock suitability and regime breakdown rows with counts | stock and regime summary marts |
| Audit | run status, warnings/errors, validations and generated timestamp | batch audit and validation rows |

No P&L, tax, benchmark, fee or drawdown formula is duplicated in the browser.
Client-side work is limited to formatting, sorting compatible returned rows and
selecting narrative display states.
