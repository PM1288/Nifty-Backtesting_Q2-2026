# Backtesting lineage

Backtesting routes → selected page/hook → `/v1/backtesting/*` or
`/v1/backtesting/lab/*` → `backtesting.ts`/`backtestingLab.ts` → persisted run,
strategy, trade, equity, drawdown, regime and stock evidence → linked result
charts/tables.

The lab's POST run endpoint is a state-changing research action and requires
the same authorised backend contract as its visible form. Same-bar/next-bar
execution, warm-up, costs, missing sessions and point-in-time inputs are
strategy-specific; no global assumption is documented where the source does
not prove one.
