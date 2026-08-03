# Test Matrix

| Gate | Test | Required result |
|---|---|---|
| Schema | All strategy, suite and run JSON files validate | Pass |
| References | Every condition references a declared feature | Pass |
| Golden logic | Nine feature-snapshot strategies produce the pinned signal/fill times | 9/9 |
| Formula parity | RSI, Williams %R, EMA, MACD, Bollinger, VWAP and volume-profile golden vectors | Exact or agreed tolerance |
| Temporal | D-1 daily features only; completed-bar signals; next-bar fills | Pass |
| Cost | Complete effective-dated intraday charge breakdown | Reconciles |
| Stop | Stop trigger and stop-first path policy | Pass |
| Comparison | Individual run totals equal comparison aggregates | Exact |
| Compatibility | One changed assumption changes compatibility hash and blocks ranking | Pass |
| Zero trades | UI/API/report retain zero-trade strategy row | Pass |
| Determinism | One worker and multiple workers produce same economic output | Exact |
| Restart | Cancel/resume reuses completed shards with no duplicate trades/fees | Pass |
| Failure | Failed validation cannot publish | Pass |
| UI | Playwright routes, filters, exports and P-Diagram links | Pass |
| Performance | Time, throughput, memory and DB impact recorded | Evidence |
