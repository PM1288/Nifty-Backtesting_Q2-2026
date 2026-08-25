# NIFTY option-chain session retention and derivatives wiring

Date: 14 August 2026

## Outcome

The NSE option-chain watcher remains the canonical persisted NIFTY weekly-chain source, but it no
longer accumulates redundant overnight rows. It now persists only inside the effective exchange
session and only when an exchange-native market field changes.

The independent NIFTY Weekly Long Options research dashboard consumes this canonical source and now
shows OI totals, PCR, OI change, walls, recent same-session change and per-strike OI change. The
strategy remains `SHADOW_NO_TRADE`; no scoring threshold or trading path was changed.

## Persistence policy

For every watcher cycle:

1. Resolve the current Asia/Kolkata trade date in `public.trading_calendar`.
2. Suppress without contacting NSE when the day is closed, session times are missing, the time is
   before `market_open_ts`, or the time is after `market_close_ts`.
3. During the session, load the latest stored chain and compare a deterministic fingerprint.
4. Persist only when an exchange-native field changed: underlying, expiry, strike, last price,
   price change, IV, volume, OI, OI change, bid/ask price or bid/ask quantity.
5. Ignore capture time, raw-response metadata and locally recalculated Greeks for deduplication.

The health endpoint exposes the suppression state and counters so no-poll outside session is
observable as a healthy state.

## Cleanup audit and recovery

Classification used the exact effective calendar predicate:

```sql
tc.is_trading_day IS TRUE
AND snapshot.captured_at >= tc.market_open_ts
AND snapshot.captured_at <= tc.market_close_ts
```

Before cleanup:

| Record | Count | UTC range |
|---|---:|---|
| Out-of-session snapshots | 1,793 | 2026-08-10 18:30:32.869 to 2026-08-14 01:31:45.171 |
| Cascading option legs | 46,618 | Parent snapshot range above |

The watcher was stopped before export. Full rows were written to:

- `/home/novius2/NIFTY50/backups/option-chain-watcher/2026-08-14-out-of-session-cleanup/option_chain_snapshots_out_of_session.csv.gz`
- `/home/novius2/NIFTY50/backups/option-chain-watcher/2026-08-14-out-of-session-cleanup/option_chain_legs_out_of_session.csv.gz`

Both archives passed `gzip -t`. Their line counts are 1,794 and 46,619 respectively, including the
CSV header. SHA-256 values are recorded in the backup manifest.

The delete ran in one transaction against the same predicate. Post-cleanup state:

| Record | Count |
|---|---:|
| Remaining snapshots | 582 |
| Remaining option legs | 15,132 |
| Remaining out-of-session snapshots | 0 |

The deleted rows are recoverable from the two exports. Restore must load snapshots first while
preserving IDs, then legs, and should only be performed in a maintenance window after stopping the
watcher.

## Strategy fields

`GET /v1/nifty-weekly-options/summary` now includes `oiAnalytics`:

- coverage by CE/PE leg and OI/OI-change availability;
- CE OI, PE OI, PCR, CE/PE/net day OI change;
- maximum call-OI and put-OI walls;
- nearest same-session comparison at least ten minutes earlier;
- an explicit interpretation and limitation.

The strike ladder now exposes `changeOi` for both CE and PE legs. The aggregation is explicitly the
persisted ATM plus/minus strike window, not a claim about the complete exchange chain.

## Validation

```text
option-chain-watcher build/unit tests: 4 passed
NIFTY weekly API tests: 5 passed
API TypeScript typecheck: passed
Web TypeScript typecheck: passed
OpenAPI validation: 18 specifications, 572 operations, 0 errors
Authenticated Playwright: 41/41 across 1920x1080 and 390x844
Production watcher: healthy, BEFORE_MARKET_OPEN suppression visible
Production dashboard: healthy
```

Screenshots and machine-readable Playwright results:

`/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/output/playwright/nifty-weekly-options/`

## Rollback

- Application rollback: restore the previous watcher image and remove `oiAnalytics` UI rendering.
- Data rollback: stop the watcher, load snapshot CSV first and leg CSV second, validate foreign keys
  and sequence values, then restart.
- No Paper Trading, OIIS, Rolling Monthly, SmartAPI ingestion or broker-order logic was changed.
