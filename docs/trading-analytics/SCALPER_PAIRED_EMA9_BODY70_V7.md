# MANEESH Scalper V7 — Paired EMA9 Position and 70% Body Rule

Rule version: `FNO_PAIRED_EMA9_POSITION_BODY70_NEXT_OPEN_V7`

## Hard entry conditions

The rule runs independently on complete 1-minute, 5-minute and 15-minute bars for each covered F&O equity and supported index. Candle colour is recorded but is never a precursor gate.

For a CALL:

1. Both prior underlying candles must have both their open and close strictly below their own EMA9.
2. The setup underlying candle must cross EMA9 upward and at least 70% of its real body must be above EMA9.
3. At the same timestamps, both prior selected CE candles must have both open and close strictly below their own EMA9.
4. The selected CE setup candle must cross EMA9 upward with at least 70% of its real body above EMA9.
5. The next complete underlying candle must exist and open above the setup underlying EMA9. The recorded entry is that next candle's underlying open and selected CE open.

For a PUT:

1. Both prior underlying candles must have both their open and close strictly above their own EMA9.
2. The setup underlying candle must cross EMA9 downward and at least 70% of its real body must be below EMA9.
3. The selected PE confirms the inverse option response: both prior PE candles must have open and close below their own EMA9.
4. The selected PE setup candle must cross EMA9 upward with at least 70% of its real body above EMA9.
5. The next complete underlying candle must exist and open below the setup underlying EMA9. The recorded entry is that next candle's underlying open and selected PE open.

Equality with EMA9 does not pass a strict above/below condition. Missing bars, incomplete aggregation buckets, missing EMA9, a missing exact option timestamp, a body fraction below 70%, or a missing next open produces no entry.

## Forward evidence and trend

For 15 minutes, 30 minutes and end of day, the engine retains each instrument's maximum, minimum, timestamps and changes from its own entry open. It separately retains the latest observed close in the window and labels its direction from entry as `BULLISH`, `BEARISH` or `FLAT`.

A CALL is a bullish underlying thesis and a PUT is a bearish underlying thesis. The underlying endpoint trend is classified as `ALIGNED`, `OPPOSED`, `FLAT` or `DATA_INSUFFICIENT`. CE and PE endpoint trends are retained separately. A maximum reached during a window is not treated as proof that the window ended bullish.

## Invalidated V6 observations

The two V6 replay observations were admitted under the now-rejected rule where selected-option precursor EMA position was context only. Migration `066_scalper_paired_body70_v7.sql` removes V6 signal rows and their cascade-linked observation rows. They are not valid V7 trades and must not appear on the active trade log.

## Deployment validation — 9 September 2026

- Backend detector tests: 10 passed, 0 failed, including exact 70% acceptance, below-threshold rejection, open-and-close precursor positioning, colour independence, PUT inversion, 1m/5m/15m parity and bullish/bearish/flat outcome labels.
- Browser tests: 99 passed, 0 failed. Dashboard API tests: 189 passed, 0 failed.
- The V7 replay evaluated 215 configured underlyings and their exact selected option pairs. The persisted snapshot contained 34 qualifying V7 observations: 28 on 1-minute bars and 6 on 5-minute bars; no 15-minute setup qualified at that evaluation time.
- A direct database invariant query found zero V7 hard-gate violations. The three V6 rows that appeared while the superseded scheduler was shutting down were deleted after the V7 services were active; final invalid V6 count was zero.
- All 34 persisted observations had endpoint trend evidence. At the 15-minute window, 18 underlying outcomes aligned with the entry thesis, 15 opposed it and one was flat. These are observations, not booked paper trades and not claims of profitability.
- Intraday API and dashboard health checks passed after deployment.
