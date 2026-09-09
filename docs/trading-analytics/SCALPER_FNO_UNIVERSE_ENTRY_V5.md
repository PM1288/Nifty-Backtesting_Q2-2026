# F&O Universe Paired EMA9 Entry V5

## Production contract

- Rule: `FNO_UNDERLYING_PAIRED_BODY80_NEXT_OPEN_V5`
- Universe: every NSE cash equity with a current `OPTSTK` contract, plus every configured NSE index with current `OPTIDX` contracts
- Configured index-option families: NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY and NIFTYNXT50
- Timeframes: 1 minute, 5 minutes and 15 minutes, evaluated independently
- Execution: evidence and WhatsApp alert only; no broker order is placed
- Schedule: once per minute during the configured NSE session

The rule is unchanged from V4. A CALL requires two complete red underlying candles below EMA9, followed by a green underlying candle crossing EMA9 with at least 80% of its real body above EMA9. The exact selected CE must show the same timestamp-aligned pattern. A PUT requires two complete green underlying candles above EMA9, followed by a red underlying crossover with at least 80% of its body below EMA9; the exact selected PE must simultaneously show the bullish option reversal. The next complete underlying bar must open on the required side of the setup EMA9 and the paired option opening premium must exist.

## Data selection

Each scheduler pass bulk-loads the current instrument-master universe and current-session minute bars. For each underlying it selects the earliest non-expired expiry and the strike nearest the latest available underlying close for which both the exact CE and PE have current-session minute data. It never substitutes another timestamp, side, strike or underlying.

Missing underlying bars, incomplete aggregation buckets, fewer than 12 complete candles (EMA9 warm-up, two precursors, setup and next-open evidence), missing CE/PE minutes or a failed rule are explicit non-entries. Coverage counts are returned in every job result:

```text
universe
underlying_data
paired_option_data
evaluated
intervals[].insufficient_bars
intervals[].missing_pair
```

The evaluator uses bulk universe, bar and option-pair queries rather than one query per stock. APScheduler uses `max_instances=1` and coalescing, preventing overlapping minute jobs.

## Persistence and delivery

`nse_ops.scalper_entry_signal` stores the underlying symbol/token, exact option symbol/token, expiry, strike, setup and entry timestamps, EMA values, body fractions and entry opens. The rule version, interval, option token, direction and setup timestamp form an idempotent signal identity.

WhatsApp uses the evaluated stock or index name, exact contract, IST entry time and paired confirmation. Operational logs and errors are not sent. Only newly persisted signals inside the configured alert-age window are eligible for delivery.

## Validation on 9 September 2026

The first live bulk evaluation found 215 eligible instrument-master underlyings. Current data supported 212 underlying series and 209 exact option pairs; 209 were evaluated at 1 minute and 205 at 5 minutes. The 15-minute rule was correctly data-insufficient before its complete EMA/pattern/next-open warm-up window. No signal was fabricated.

At that validation instant the missing underlying streams were ATHERENERG, SAGILITY and NIFTYNXT50. BANKNIFTY, FINNIFTY and MIDCPNIFTY had underlying bars but no selected CE/PE minute pair because the collector had previously subscribed only to NIFTY index options. V5 expanded the collector configuration to all five supported index-option families. After deployment, 213 underlyings had configured exact pairs and observed CE/PE data; the 208 source-covered F&O equities were evaluated, while newly subscribed index pairs were admitted individually only after accumulating 12 complete candles. A production scheduler run completed in 11.76 seconds. Zero signals were emitted because no fully confirmed pattern occurred in that snapshot.

## Operations

```bash
docker exec trading-stack-novius2-nse-intraday-scheduler-1 \
  python -m nse_intraday_intelligence.manual_jobs scalper-entries

docker exec -i trading-stack-novius2-postgres-1 sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select underlying_symbol,interval_minutes,direction,option_symbol,entry_end,delivery_status from nse_ops.scalper_entry_signal order by entry_end desc limit 25"'
```

Rollback delivery independently with `SCALPER_ENTRY_WHATSAPP_ENABLED=0`. Roll back automated evaluation by disabling the `scalper_entry_evaluate` job. Neither action deletes persisted evidence.
