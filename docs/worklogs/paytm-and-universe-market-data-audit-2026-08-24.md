# PAYTM and NIFTY 250 + F&O Market-Data Audit — 24 August 2026

## Outcome

The production collection and Stock 360 path was audited during the live NSE session. PAYTM cash, daily, minute, futures and stock-option data are present. PAYTM now returns HTTP 200 from the Stock 360 intraday API.

The display defect was not missing PAYTM market data. `integration.v_source_security_1m` was restricted to the legacy NIFTY 100 universe, so PAYTM bars never reached the derived intraday dashboard tables. The view now uses the canonical union of NIFTY LargeMidcap 250 and current NSE F&O membership.

## Required universe

| Population | Expected | Present/covered |
|---|---:|---:|
| NIFTY LargeMidcap 250 members | 250 | 250 |
| Current NSE F&O underlyings | 208 | 208 |
| Distinct cash-universe union | 268 | 268 |
| Current-session derived stock rows | 268 | 268 |
| Active F&O underlyings with futures | 208 | 208 |
| Active F&O underlyings with stock options | 208 | 208 |

Derivative data is expected only for the 208 current F&O underlyings. A NIFTY 250 constituent that is not an F&O security correctly has cash equity history and minute data but no stock future or stock option.

## Live contract coverage

The production `public.subscriptions` to `public.instrument_state` reconciliation returned:

| Kind | Active contracts | State | Price | Bid/ask | Volume | OI |
|---|---:|---:|---:|---:|---:|---:|
| Cash equity | 268 | 268 | 268 | 268 | 268 | 268* |
| Stock/index futures | 419 | 419 | 419 | 419 | 419 | 419 |
| Stock options | 2,142 | 2,142 | 2,142 | 2,142 | 2,142 | 2,142 |

`*` The provider exposes an OI-shaped field for cash state, but cash-equity OI is not an economically meaningful derivative measure and must not be presented as such.

At the audit instant, all equity and future subscriptions had updated inside two minutes. A small number of illiquid option contracts had not printed inside the last two minutes, but none lacked a state record, price, bid/ask, volume or OI.

## PAYTM evidence

PAYTM is classified as both NIFTY LargeMidcap 250 and NSE F&O.

- Daily bars: present and current through 24 August 2026.
- Completed 21 August bar: open 1603.30, high 1638.40, low 1598.00, close 1632.00, volume 5,129,938.
- Current minute-derived Stock 360 row: present with per-symbol as-of timestamp.
- Stock 360 API: `GET /api/v1/intraday/stocks/PAYTM` returns HTTP 200.
- Active cash subscription: PAYTM-EQ with live price, bid/ask and volume.
- Active futures: 25 August 2026 and 29 September 2026.
- Active options: ten selected near-money 25 August contracts, CE and PE across 1580, 1600, 1620, 1640 and 1660 strikes at the audit instant.
- Calculated beta in the verified Stock 360 response: beta 20D 1.58525 and beta 60D 1.67763.

## Daily-history coverage

All 268 cash-universe symbols have daily history and a current 24 August record. Of these, 262 have at least 252 sessions. Six recent listings legitimately have shorter histories:

| Symbol | Sessions |
|---|---:|
| ICICIAMC | 167 |
| GROWW | 194 |
| TMCV | 194 |
| LENSKART | 196 |
| LGEINDIA | 213 |
| TATACAP | 214 |

These are not ingestion gaps; history cannot predate listing. Calculations requiring longer warm-up must expose insufficient-history status rather than substituting zero.

## Corrections deployed

1. Added `sql/007_nifty250_fno_union_views.sql` and applied it to production. The intraday source universe is now NIFTY LargeMidcap 250 union current F&O, using active cash subscription tokens.
2. Limited derived minute ingestion to valid weekday NSE session times, 09:15–15:30 IST.
3. Changed raw-minute synchronisation to explicit UTC session bounds for partition pruning and predictable session handling.
4. Corrected derivative selection to choose real common CE/PE strikes and the first expiry with a complete ladder. This restored option coverage for affected underlyings including HINDPETRO and MPHASIS.
5. Corrected APScheduler weekday configuration from numeric `1-5` to `mon-fri`; APScheduler numbers Monday as zero, so the former configuration skipped Monday collection.
6. Optimised beta, market feature, volume-profile and stock-alpha refreshes so the expanded 268-stock universe can complete on schedule.
7. Changed live-row persistence to upsert before pruning, preventing a transient empty Stock 360 response during refresh.
8. Changed dashboard selection to the latest completed common market/security minute.
9. Changed Stock 360 construction to select each symbol's latest row at or before that minute. Illiquid names are no longer removed merely because they had no tick in the exact index minute, and each row retains its own real as-of timestamp.

## Files changed

- `services/nse_intraday_intelligence/sql/007_nifty250_fno_union_views.sql`
- `services/nse_intraday_intelligence/src/nse_intraday_intelligence/pipeline.py`
- `services/nse_intraday_intelligence/src/nse_intraday_intelligence/config.py`
- `services/nse_intraday_intelligence/sql/040_seed_jobs.sql`
- `compose/compose.base.yml`
- `docker-compose.yml`
- `internal/universe/derivatives.go`
- `internal/universe/derivatives_test.go`

The same source changes were mirrored into the active runtime tree at `/home/novius2/trading-stack` and deployed from there.

## Validation performed

- Go derivative-universe tests passed: `go test ./internal/universe`.
- Python sources passed `compileall`.
- Production migration applied successfully.
- Collector image rebuilt and collector remained healthy with zero restarts.
- Intraday API and scheduler images rebuilt and redeployed.
- Monday scheduler jobs were observed executing successfully.
- Manual dashboard refresh completed successfully.
- The refreshed `stock_intraday_live` ledger contained all 268 symbols.
- PAYTM API returned HTTP 200 with a current price, timestamp and non-fallback beta values.
- All 208 F&O underlyings had at least one active future and at least ten active selected stock options; the current selection range was 10–14 options per underlying.

## Remaining monitored limitations

1. Historical intraday minute-volume profiles initially cover the 99-stock legacy population. The additional 169 names have current minute data and daily history now, and their retained intraday profiles will mature as sessions accumulate. This does not block current price/minute visibility.
2. SmartAPI historical-candle requests intermittently return provider-side HTTP 403/access-denied responses. Successful calls and the alternate collection path currently keep all 268 daily ledgers current. Continue monitoring relogin/retry metrics; do not silently turn a failed request into zero.
3. Raw collector tables can contain unchanged/out-of-session observations from older behavior. The derived analytical view now filters to valid NSE session windows. Historical cleanup should remain a separate, explicitly scoped retention operation.

## API documentation impact

No request or response contract changed. This work corrected universe selection, scheduling, feature derivation and refresh semantics; therefore no OpenAPI/Swagger schema change was required.

## Repeatable checks

```bash
cd /home/novius2/trading-stack

go test ./internal/universe

docker exec trading-stack-novius2-postgres-1 \
  psql -U trader -d tradingdb -c \
  "select count(*) from nse_intraday.stock_intraday_live where trade_date=current_date;"

docker exec trading-stack-novius2-nse-intraday-api-1 \
  curl -fsS http://127.0.0.1:8092/api/v1/intraday/stocks/PAYTM
```
