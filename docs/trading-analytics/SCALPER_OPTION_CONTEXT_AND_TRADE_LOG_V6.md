# MANEESH Scalper V6 — Option Context and Trade Observation Log

> Historical V6 specification. Superseded on 9 September 2026 by the stricter V7 paired-position rule in `SCALPER_PAIRED_EMA9_BODY70_V7.md`. V6 replay observations are invalid under V7 and were removed.

## Effective change

Rule version: `FNO_UNDERLYING_OPTION_CONTEXT_BODY80_NEXT_OPEN_V6`

The two underlying precursor candles remain mandatory. The two selected-option precursor candles are no longer an entry gate. Their colour, close-versus-EMA9 state, OHLC and EMA9 values are retained as decision evidence.

The selected CE for a CALL or selected PE for a PUT must still have a green setup candle that crosses its own EMA9 with at least 80% of the real body above EMA9. The next underlying candle must exist and open on the required side of the setup EMA9. Its selected option opening premium must exist.

The rule operates independently on complete 1-minute, 5-minute and 15-minute bars for every covered F&O equity and supported index. No nearest-time substitution, incomplete aggregate, or synthetic zero is accepted.

## Persisted entry evidence

Each signal retains:

- day, setup time, entry time, interval, underlying and CALL/PUT direction;
- exact expiry, strike, CE and PE contract identity;
- underlying, CE and PE entry opens from the same entry interval;
- underlying and selected-option setup close, EMA9 and body fraction;
- both underlying precursor colours and EMA positions;
- both selected-option precursor colours and EMA positions, explicitly marked context-only;
- RSI14, MACD12/26, signal9 and histogram for underlying, CE and PE at setup time;
- WhatsApp delivery state without exposing gateway errors in messages.

RSI uses rolling gains/losses over 14 close-to-close changes. MACD uses SMA-seeded EMA12/EMA26 and an EMA9 signal. Values remain null until sufficient complete history exists.

## Forward observation evidence

The scheduler refreshes a read-only observation record every minute. From the actual next-candle entry open, it records for underlying, CE and PE:

- 15-minute maximum/minimum, timestamps, absolute and percentage change;
- 30-minute maximum/minimum, timestamps, absolute and percentage change;
- end-of-day maximum/minimum, timestamps, absolute and percentage change;
- observed minute count and `DEVELOPING`/`MATURE` state.

The maximum change for each option is calculated against that option's own entry open. These are observed excursions, not fills, booked P&L, paper orders or broker orders.

## Dashboard

Open `MANEESH`, then choose `Trade Log`, or use:

```text
/strategy/trading-analytics?view=trade-log
```

The table is horizontally scrollable, keeps trade identity pinned, refreshes once per minute, supports day/interval/direction/symbol filters and exports the full filtered evidence to CSV.

## Live validation — 9 September 2026

The V6 replay evaluated 213 of 215 covered underlyings on one-minute data and produced two qualifying observations. MAXHEALTH had selected-option precursor colours `RED, GREEN`; BAJAJFINSV had `DOJI, RED`. Both were admitted, proving those colours no longer act as gates. Both records persisted CE/PE entry opens, underlying/CE/PE indicators, and 15-minute, 30-minute and EOD outcome structures. Their entries predated the alert-age policy at deployment, so they were not replayed as new WhatsApp alerts.

## Deployment and rollback

Apply `services/nse_intraday_intelligence/sql/065_scalper_trade_observations.sql`, rebuild the intraday scheduler/API and dashboard API/web services, then run `scalper-entries` once. Rollback should disable the scheduler before reverting code; retained V6 rows are auditable and need not be deleted.
