# Today's SmartAPI and OI data — 7 September 2026

## Root causes

1. The new workspace originally exposed only `option_chain_snapshots` / `option_chain_legs`, which are **NSE watcher** data, not SmartAPI. That data actually extended through today's 15:39:43 IST; a wall-clock stale label after close did not mean today's chain was absent.
2. `smartapi_option_chain_snapshots` is currently populated by the `NIFTY250_STOCK_DERIVATIVES` / `OPTSTK` plan. Despite its general name, it contains no NIFTY index options. NIFTY option data is present in `quote_snapshots`, populated by the existing sole SmartAPI collector.
3. The institutional report date remained 4 September because today's separate NSE report had not been pulled/loaded into the canonical report tables. The FII service health explicitly reports `scheduler_enabled=false` and `scheduler_running=false`; this one-time pull does not enable recurring automation. SmartAPI quotes do not supply FII/Client/DII/Pro participant classifications.
4. The daily chart excluded today's candle unconditionally. It now includes today's retained bar only after the existing calendar's close, retaining knowledge-time checks.

## Actual collection and one-time pull

At 16:45–16:52 UTC the running collector had 63 successful primary quote requests, 73 successful option quote requests, 106 successful Greek requests, and successful PCR/OI-buildup requests, with zero failures in those sampled groups. No new broker login or collector restart was needed.

Freshly collected 16:54:44 UTC (22:24:44 IST) FULL quotes include:

| Contract | LTP ₹ | Provider-native OI | Volume | Bid ₹ | Ask ₹ | Exchange time |
|---|---:|---:|---:|---:|---:|---|
| NIFTY08SEP2623800CE | 56.60 | 17,532,970 | 490,374,300 | 56.50 | 57.00 | 7 Sep 15:40 IST |
| NIFTY08SEP2623800PE | 71.15 | 9,647,040 | 700,211,980 | 70.60 | 71.15 | 7 Sep 15:40 IST |

Retrieval time is not exchange time. These are session-close observations, not live after-hours trades. OI units are explicitly provider-native pending independent unit verification; not labelled lots/contracts. Missing provider day-change OI is null, not zero.

Official institutional pull completed at `2026-09-07T16:54:50Z`:

```bash
curl -X POST http://127.0.0.1:8001/pull-latest -H 'Content-Type: application/json' \
  -d '{"as_of_date":"07-09-2026","max_lookback_days":1,"save_parsed":true}'
# Verify manifest, source date, parsed row counts and absence of this run first.
curl -X POST http://127.0.0.1:8001/load -H 'Content-Type: application/json' \
  -d '{"kind":"daily","run_id":"2026-09-07","truncate_tables_on_load":false}'
```

Verified zero existing rows for this run before loading. Loaded 16 derivatives activity rows, 5 participant OI rows and 5 participant volume rows. Older report dates were retained. The existing loader replaces a same-run import on rerun; do not claim immutable historical revision support.

Raw reports and manifest live in the FII service's mounted `/app/data/latest_daily/2026-09-07/` directory. Official sources:

- https://nsearchives.nseindia.com/content/fo/fii_stats_07-Sep-2026.xls
- https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_07092026.csv
- https://nsearchives.nseindia.com/content/nsccl/fao_participant_vol_07092026.csv

## Dashboard correction

New additive lens: `/n50/strategy/trading-analytics?view=smartapi` — **SmartAPI OI & Quotes**.

Nearest ten paired strikes, one selected expiry, exact master identities, OI, volume, LTP, bid/ask rates and quantities, day OHLC, total buy/sell quantities, collection time and exchange time are shown. Raw FULL quote/depth remains exportable in CSV/JSON. PCR uses this provider's selected window only; no cross-provider blending or full-chain claim. NSE watcher table remains in its original lens. Report date and quote dates remain independent.

The adapter reads recent quotes with `ts <= asOf`; every leg keeps its own timestamp and missingness. This is an asynchronous quote view, not an atomic exchange snapshot. Session-close labels require calendar close and exchange timestamp alignment; older quotes remain STALE. No provider preference changed elsewhere and no order path added.

Live database validation: report date 2026-09-07, 20 SmartAPI legs with 20 OI values, zero source query errors, completed daily candle 2026-09-07. Greek fields are not joined into this new quote view; successful Greek collection does not imply every contract has verified Greeks. SmartAPI interface review: https://raw.githubusercontent.com/angel-one/smartapi-python/main/SmartApi/smartConnect.py (FULL market quotes, historical OI, Greeks, PCR interfaces).
