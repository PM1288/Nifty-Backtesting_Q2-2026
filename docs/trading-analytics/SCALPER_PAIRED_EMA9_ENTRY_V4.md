# Paired NIFTY + Option EMA9 Entry V4

> Historical V4 specification. Production evaluation was superseded on 9 September 2026 by `FNO_UNDERLYING_PAIRED_BODY80_NEXT_OPEN_V5`; see `SCALPER_FNO_UNIVERSE_ENTRY_V5.md`.

## Identity

- Rule: `NIFTY_EMA9_PAIRED_BODY80_NEXT_OPEN_V4`
- Evaluation intervals: 1 minute, 5 minutes and 15 minutes (independent signals)
- Execution state: alert/reference only; no broker order is created
- Data: complete, timestamp-aligned `bars_1m` aggregated against the trading calendar

## CALL entry

1. The prior two complete NIFTY candles are red and each closes below its own EMA9.
2. The setup NIFTY candle is green, crosses EMA9, and at least 80% of its real body is above EMA9.
3. At the exact same three timestamps, the selected CE has two red closes below its own EMA9 followed by a green crossover with at least 80% of its real body above EMA9.
4. The immediately following complete bar exists for both instruments; its NIFTY open remains above the setup EMA9.

## PUT entry

1. The prior two complete NIFTY candles are green and each closes above its own EMA9.
2. The setup NIFTY candle is red, crosses EMA9, and at least 80% of its real body is below EMA9.
3. The selected PE confirms the inverse instrument response: two red closes below its EMA9 followed by a green crossover with at least 80% of its real body above EMA9.
4. The immediately following complete bar exists for both instruments; its NIFTY open remains below the setup EMA9.

## Contract selection and fail-closed behavior

The scheduled evaluator selects the earliest non-expired NIFTY expiry and nearest strike to the latest complete underlying close for which both exact CE and PE have current-session minute data. A missing minute, incomplete five-minute bucket, missing EMA warm-up, missing paired option timestamp, doji, failed 80% boundary, or missing next open produces no entry. No substitute contract or nearest-time bar is used.

## Persistence and WhatsApp

`nse_ops.scalper_entry_signal` stores the immutable values and evidence. The signal key hashes rule version, option token, direction and setup timestamp. Both the primary key and a semantic unique index prevent duplicates. Only a newly inserted signal whose entry is within the configured alert-age window is eligible for WhatsApp. Old replayed signals are stored as `SUPPRESSED_STALE`.

The WhatsApp body contains only direction, IST time, exact contract, entry premium, NIFTY entry reference and paired confirmation percentages. Operational errors and logs are never sent to WhatsApp.

## Operations

```bash
docker compose -p trading-stack-novius2 --env-file .env \
  -f compose/compose.base.yml build nse-intraday-api nse-intraday-scheduler n50-dashboard

docker compose -p trading-stack-novius2 --env-file .env \
  -f compose/compose.base.yml run --rm nse-intraday-api \
  python -m nse_intraday_intelligence.manual_jobs install-sql

docker compose -p trading-stack-novius2 --env-file .env \
  -f compose/compose.base.yml up -d nse-intraday-api nse-intraday-scheduler n50-dashboard

docker exec trading-stack-novius2-nse-intraday-scheduler-1 \
  python -m nse_intraday_intelligence.manual_jobs scalper-entries
```

Inspect without revealing secrets:

```sql
select trade_date,setup_end,direction,option_symbol,option_entry_open,
       underlying_body_fraction,option_body_fraction,delivery_status
from nse_ops.scalper_entry_signal
order by setup_end desc limit 20;
```

Configuration:

- `SCALPER_ENTRY_INTERVALS=1,5,15`
- `CRON_SCALPER_ENTRIES=*/1 9-15 * * mon-fri`

The scheduler runs once per minute. Each pass independently aggregates complete 1m, 5m and 15m candles. A signal identity includes its interval, so an otherwise identical setup on two timeframes is retained and notified separately, while retries cannot duplicate a delivered timeframe signal.

## Weekly option rollover

- The active contract is the earliest instrument-master expiry on or after the current IST trading date with an exact CE/PE pair and retained minute data.
- The chart API does not advertise already-expired contracts for a current as-of request.
- A browser `chartExpiry` left over from the expired week is automatically replaced by the canonical current expiry and its nearest available paired strike.
- Explicit pins for the current or a later active expiry remain browser-local and are not overwritten.
- Missing next-expiry contracts or missing exact CE/PE minutes remain explicit data-insufficient states; another expiry is never relabelled as the requested contract.
- `SCALPER_ENTRY_ALERT_MAX_AGE_MINUTES=10`
- `SCALPER_ENTRY_WHATSAPP_ENABLED=1`
- `WA_GATEWAY_URL`
- `WA_GATEWAY_API_TOKEN_FILE`
- `WA_MYSELF_CHAT_ID`

Rollback: set `SCALPER_ENTRY_WHATSAPP_ENABLED=0` to stop delivery, or override `NSE_INTRADAY_CRON_SCALPER_ENTRIES` with a disabled schedule and recreate the scheduler. Existing evidence remains queryable.
