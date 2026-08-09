Title: Nifty LargeMidcap 250 SmartAPI cash, F&O and history collection
Status: Accepted
Date: 2026-08-08

## Decision

- Treat “Nifty 250” as the official Nifty LargeMidcap 250: Nifty 100 plus Nifty Midcap 150.
- Refresh its 250 unique symbols from the official NSE archive constituent CSVs.
- Stream all 250 cash equities and the core indices Nifty 50, Bank Nifty, Fin Nifty, Midcap Select, Nifty 100, Nifty 200, Nifty 500, India VIX and Sensex.
- Resolve Sensex on BSE using token `99919000`; all configured Nifty indices resolve on NSE.
- For every constituent that has contracts in the SmartAPI instrument master, persist the nearest and next futures plus nearest-expiry CE and PE at ATM and three strikes on either side.
- Keep websocket subscriptions within the broker capacity of 3 connections by 1,000 tokens. Capacity-dropped stock options remain in the plan and are prioritized in a one-minute, 500-token batched REST quote rotation.
- Backfill three years of daily bars through the existing adaptive candle queue. Resume each token from its latest stored daily bar so restarts are idempotent and do not repeat complete history.
- Disable the one-minute REST fallback outside market hours; historical backfill owns off-session candle usage.

## Consequences

- `public.derivative_token_plan` is the audit source for every selected and capacity-dropped F&O contract.
- `public.bars_1d` contains resumable cash/index history.
- `public.quote_snapshots` retains full quote payloads, including OI, for REST-rotated contracts.
- The active websocket set may exclude some contracts when the full plan exceeds 3,000 tokens, but the full plan remains observable without breaching websocket or REST limits.
