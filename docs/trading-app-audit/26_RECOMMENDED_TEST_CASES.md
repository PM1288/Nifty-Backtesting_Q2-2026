# Recommended test cases

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

## P0/P1 calculation reconciliation

1. Long/short realised and unrealised P&L with partial exits, charges, and stale marks.
2. Intraday target ordering and impossibility checks (higher threshold cannot precede a lower threshold for the same continuous price path without missing-data evidence).
3. Swing/5D/30D inclusion and freeze boundaries using exchange sessions.
4. MFE/MAE from raw bars for long and short trades.
5. Paper idempotency for duplicate intent/command delivery.
6. Same-bar versus next-bar strategy execution to prevent look-ahead.
7. Corporate-action adjusted historical calculations.
8. Heatmap percentage change against canonical previous close/current mark.
9. Backtest equity/drawdown/trade reconciliation.
10. Direct API authorization and role enforcement.

## UI/realtime

Test every canonical route for authenticated loading, explicit stale/missing/error states, no body overflow, keyboard access, 200% zoom, WebSocket reconnect, polling cleanup, and focus stability.
