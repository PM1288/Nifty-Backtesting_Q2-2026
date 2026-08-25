# Nifty LargeMidcap 250 plus NSE F&O capture readiness

Date: 23 August 2026
Production database: `tradingdb`
Collector: `trading-stack-novius2-collector-1`

## Finding and correction

The metadata catalogue already described the intended union correctly, but the collector's mounted cash-symbol file contained only the 250 Nifty LargeMidcap constituents. Consequently, 18 F&O stocks outside that index were absent from cash subscriptions and daily history. The derivative planner also looked up instrument-master keys using separator-normalised names while leaving cash underlyings unnormalised, omitting `BAJAJ-AUTO` and `NAM-INDIA`.

The collector boundary now:

1. Builds the cash capture file as the union of the official 250 constituents and all current, non-test `FUTSTK`/`OPTSTK` underlyings in the locally cached SmartAPI instrument master.
2. Resolves only names that also have an NSE cash instrument.
3. Uses Asia/Kolkata for the default eligibility date and excludes expired contracts and NSE test instruments.
4. Normalises stock-underlying keys consistently before derivative-chain lookup.
5. Preserves the separate 250-row index-constituent file, so the 18 F&O-only additions are not incorrectly labelled as index members.

## Production reconciliation

| Check | Result |
|---|---:|
| Instrument profiles | 268 |
| Nifty LargeMidcap 250 members | 250 |
| NSE F&O members | 208 |
| Intersection | 190 |
| F&O outside LargeMidcap 250 | 18 |
| Unique union | 268 |
| Active cash subscriptions | 268/268 |
| Cash daily-history coverage | 268/268 |
| Latest completed trading session for every symbol | 21 August 2026 |
| Daily rows across the 268-stock union | 207,590 |
| Overall history range | 9 January 2023 to 21 August 2026 |

Later-listed stocks naturally have shorter histories; this is not filled with synthetic rows. All 268 symbols have a real bar for the latest completed session.

## Derivative readiness

The 23 August plan contains:

| Contract evidence | Result |
|---|---:|
| F&O underlyings represented | 208/208 |
| Selected stock futures | 415 |
| Selected stock options | 2,848 |
| Active derivative WebSocket subscriptions | 2,557 |
| Capacity-dropped options covered by REST rotation | 706 |
| Earliest selected expiry | 25 August 2026 |
| Latest selected expiry | 29 September 2026 |

Every F&O underlying has at least one future and at least two selected options. Most have two futures and fourteen options; smaller counts reflect the contracts/strikes actually present in the SmartAPI master, not fabricated contracts.

Recent snapshot rows contain LTP, bid, ask, volume and OI fields. OI persistence is active for futures and options. SmartAPI option Greeks remain configured for the index-option underlyings, not all stock-option legs.

## Tomorrow readiness

The trading calendar marks Monday, 24 August 2026 as a trading day from 09:15 to 15:40 IST. The healthy collector has all 268 cash subscriptions and the 208-underlying derivative plan loaded. WebSocket collection supplies active contracts; the batched REST option rotation covers selected options that exceed the 3,000-token WebSocket capacity. Daily history runs immediately on restart and then at 18:00 IST, resuming from the latest stored date.

This establishes configuration and runtime readiness. Actual 24 August exchange ticks can only be confirmed after the market session begins; use the validation queries below rather than treating readiness as future-data proof.

## Historical derivative limitation

Cash OHLC history is complete for the 268-stock union. Intraday derivative history is not equivalent: the 20 newly corrected derivative underlyings (18 F&O-only stocks plus `BAJAJ-AUTO` and `NAM-INDIA`) had no stored one-minute futures/options bars on 21 August because they were absent from the previous derivative plan. They begin canonical derivative capture with this deployment. Existing derivative history for the formerly covered underlyings is preserved.

No synthetic or present-day contract data was back-projected into historical expiries.

## Validation evidence

- Collector image: `sha256:1e3a66d79012fde3d8bd5c6cdf983978edb597b26ba553d052770834b06df281`.
- Container state after deployment: running and healthy.
- Historical backfill: 54 successful SmartAPI calls, 13,352 returned daily candles, zero throttles and zero failures.
- Unit tests: `go test ./internal/universe ./internal/store ./cmd/collector` passed.
- Python universe builder compiled successfully.
- Rollback input: `/home/novius2/trading-stack/backups/equity-fno-union-20260823/nifty250.sample.csv.before`.

## Operator verification for 24 August

```sql
SELECT kind, active, count(*)
FROM public.subscriptions
GROUP BY kind, active
ORDER BY kind, active;

SELECT count(DISTINCT symbol_token), min(ts), max(ts)
FROM public.bars_1m
WHERE exchange = 'NSE'
  AND ts >= '2026-08-24 03:45:00+00'
  AND ts <= '2026-08-24 10:10:00+00';

SELECT contract_kind,
       count(*) AS planned,
       count(*) FILTER (WHERE active) AS websocket_active,
       count(*) FILTER (WHERE NOT active) AS rest_rotation
FROM public.derivative_token_plan
WHERE plan_date = (SELECT max(plan_date) FROM public.derivative_token_plan)
GROUP BY contract_kind;
```

Expected cash result after the session is up to 268 distinct equity tokens; the exact count during the opening minutes can temporarily be lower if a symbol has not produced a tick. Data-quality evaluation must use the exchange calendar and timestamps, not replace missing observations with zero.
