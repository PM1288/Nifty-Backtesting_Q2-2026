# Monthly and Rolling strategy lineage

`/strategy/monthly` → `MonthlyStrategiesPage.tsx` → monthly/absolute/first
session API functions → `rollingMonthly.ts` → `rolling_monthly` service and
`strategy_eval`/`rolling_monthly` schemas → unified monthly ledger, cohort
summaries, stock inspector and export.

`/strategy/rolling-monthly` is routed independently to rolling-window evidence.
Its rolling 5/30/60-session comparisons must not be merged with calendar-month
or expiry entry methods.

Historical Yahoo split-adjusted OHLC and current-universe membership require
the price-basis and survivorship caveats in the accuracy catalog.
