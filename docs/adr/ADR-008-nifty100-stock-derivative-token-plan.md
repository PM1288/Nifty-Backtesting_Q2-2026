Title: Nifty100 Stock Derivative Token Plan
Status: Accepted
Date: 2026-04-01

Context
- The collector already subscribes to equities, indices, and a derived F&O universe.
- The product now needs all Nifty100 stock derivatives that are actually available in the SmartAPI script master, not a small ad hoc stock-options subset.
- Operators need an auditable table showing which futures/options tokens were selected each trading day and whether they were active or dropped by websocket capacity limits.

Decision
- Add a persisted `derivative_token_plan` table in the collector schema.
- Generate the stock derivative plan during collector subscription refresh using the cached SmartAPI script master plus live/seeded underlying prices.
- For each Nifty100 stock underlying with available F&O contracts:
  - select the nearest and next futures expiries
  - select the nearest stock-option expiry and ATM +/- 3 strikes for both CE and PE
- Determine "monthly expiry" from actual available expiries in the script master by taking the last available expiry in a contract month, instead of hardcoding a weekday calendar.
- Continue to rely on existing websocket capacity enforcement. Persist all selected rows, but mark rows inactive with `capacity_drop` when they do not fit into active websocket subscriptions.

Consequences
- The collector now exposes an auditable daily derivative selection plan without changing the websocket shard model.
- Actual available expiries are used as the source of truth, so the plan stays aligned with the broker instrument master.
- If the derivative universe grows past websocket capacity, lower-priority derivatives can still be dropped safely while remaining visible in the plan table.
