# F&O two-gate volatility signal service

## Status

`FNO_VOLATILITY_TWO_GATE` version `1.0.0` is a paper/research-only MVP. It is separate from OIIS and cannot place a live broker order. Its daily output is one of:

- `BUY_STRADDLE`
- `BUY_STRANGLE`
- `NO_TRADE`

The engine deliberately returns `NO_TRADE` if the exchange session is closed, either CE/PE quote is missing or stale, either side lacks a positive bid and ask, or any configured value gate fails.

## Data lineage

| Evidence | Authoritative source | Usage |
| --- | --- | --- |
| Active stock F&O universe | `public.derivative_token_plan`, latest `NIFTY250_STOCK_DERIVATIVES` plan | Every underlying with active `OPTSTK` contracts is captured in the daily universe snapshot. |
| Cash contract identity | `public.instruments` | Maps the underlying to its cash-market token. |
| Daily cash OHLCV | `nse.fact_eod_prices` | Stage A uses only the last completed session strictly before `trade_date`. |
| Intraday cash OHLCV | `public.bars_1m` | Stage B opening gap, range and volume pace; queries stop at `decision_as_of`. |
| Futures and option contracts | `public.subscriptions`, `public.instruments` | Selects the nearest current expiry and actual listed strike ladder. No strike interval or expiry weekday is hard-coded. |
| Live price, depth and OI | `public.quote_snapshots` | Uses CE/PE asks for entry and bids for valuation. Freshness uses `exch_feed_time`, then `exch_trade_time`, then snapshot time. |
| Trading sessions | `public.trading_calendar` | Prevents weekend/holiday scheduling. |
| IV and Greeks | Derived from two-sided option quotes using Black-Scholes in MVP | Stored as model estimates, never as exchange-provided facts. |

The SmartAPI collector remains the sole market-data adapter. It currently subscribes to 186 stock-option underlyings and 2,200 OPTSTK contracts. The signal service reads these records and does not establish a second broker session.

## Gate A: completed-day movement shortlist

At 08:30 IST on a governed trading day, the service:

1. Freezes the latest completed EOD date before the intended trade date.
2. Snapshots every active stock-option underlying and its CE/PE contract counts.
3. Computes ATR percentage, Bollinger width, volume versus 20-session average, absolute previous return and ADX from completed daily bars.
4. Converts each value to a percentile against that stock's trailing history.
5. Applies the versioned score in `services/fno_volatility/config/policy.json`.
6. Persists all underlyings, all feature values, missing-feature flags, prediction quantiles and ranks.
7. Marks only the top 15 as the pre-market shortlist. Non-shortlisted rows are retained.

The initial quantiles are transparent empirical estimates, not claims of a trained production model. India VIX and sector breadth are explicitly marked unavailable in the MVP score until their point-in-time series are joined. The service uses a market-ATR proxy and exposes that limitation on the UI.

## Gate B: live option value

At 09:30, 09:45 and 10:00 IST, with an 11:00 entry cut-off, the service:

1. Calculates the opening gap, first-window range and volume pace only from bars at or before `decision_as_of`.
2. Rejects an incomplete or stale opening window, projects accumulated opening volume to a full session and compares it with the prior 20-session average volume.
3. Reranks the pre-market shortlist and keeps five live movement candidates.
4. Finds the actual nearest option expiry and actual listed strikes.
5. Generates ATM straddle, one-step strangle and two-step strangle candidates when complete CE/PE pairs exist.
6. Reads source-timestamped bid/ask/OI quotes for both legs and rejects stale or one-sided quotes.
7. Uses combined CE ask plus PE ask as entry premium; no LTP or midpoint is used as an executable entry.
8. Derives quote-implied volatility by bisection and estimates an explicitly labelled realised/IV mean-reversion proxy.
9. Simulates 5,000 joint remaining-return and IV scenarios with a deterministic seed and reprices both legs at the fixed 15:15 exit horizon.
10. Calculates forecast/implied ratio, expected net return, probability of profit, P10/P50/P90 P&L, expected shortfall, spread and direction entropy.
11. Chooses the best structure only from candidates generated at the decision timestamp. It never chooses a strike from hindsight.

Initial paper gates are: P75 move / implied move at least 1.15, expected return at least 5%, probability of profit at least 55%, direction entropy at least 0.90 and combined spread at most 5%. These are versioned starting values, not optimised production thresholds.

## Scheduler and operations

Start the migration once, then the scheduler:

```bash
docker compose -p trading-stack-novius2 \
  -f docker-compose.yml -f compose/compose.fno-volatility.yml \
  run --rm fno-volatility-migrate

docker compose -p trading-stack-novius2 \
  -f docker-compose.yml -f compose/compose.fno-volatility.yml \
  up -d fno-volatility
```

Manual evidence runs:

```bash
docker compose -p trading-stack-novius2 \
  -f docker-compose.yml -f compose/compose.fno-volatility.yml \
  run --rm fno-volatility premarket --trade-date 2026-08-10 --slot PREMARKET_MANUAL

docker compose -p trading-stack-novius2 \
  -f docker-compose.yml -f compose/compose.fno-volatility.yml \
  run --rm fno-volatility live --trade-date 2026-08-10 --slot LIVE_MANUAL
```

Primary explainable workspace: `/n50/options/intelligence` after authentication. It separates the immutable decision snapshot from current chain monitoring and exposes all hard-gate reasons, score anatomy, chain evidence and provenance. The original compact dashboard remains available at `/n50/options/volatility-signals`.

Database inspection:

```sql
SELECT * FROM fno_volatility.signal_run ORDER BY started_at DESC;
SELECT * FROM fno_volatility.movement_prediction WHERE shortlisted ORDER BY movement_rank;
SELECT * FROM fno_volatility.v_latest_signals ORDER BY rank;
```

## Safety and limitations

- `PAPER` and `paper_trading_only=true` are mandatory.
- Automatic paper submission is disabled in version 1.0.0. The service produces governed signals; it does not create a broker command.
- The current direct-return and IV-change layers are transparent proxy models. A production promotion requires historical two-sided option snapshots, actual bid/ask exits, charges, walk-forward calibration and several hundred out-of-sample trades.
- No historical option result is manufactured when quotes are absent.
- Option-chain contracts are discovered from current instrument data rather than expiry-weekday assumptions. NSE product and contract information should be revalidated against the [official NIFTY derivatives page](https://www.nseindia.com/static/products-services/equity-derivatives-nifty50) and [contract-wise historical data](https://www.nseindia.com/report-detail/fo_eq_security) when the collector or instrument policy changes.
- India VIX remains a market-regime input rather than a stock-option IV substitute; see the [official India VIX description](https://www.nseindia.com/static/products-services/indices-indiavix-index).
