# Option Chain Watcher

Purpose: scrape NSE NIFTY option chain using Playwright request context (cookie warmup + JSON API), store **current expiry** and **ATM ± N strikes** (CE+PE) into Postgres.

Persistence is exchange-session aware. The watcher reads the effective Asia/Kolkata session from
`public.trading_calendar`, fails closed on holidays or missing/special-session times, and does not
contact NSE or insert rows before open or after close. During a valid session it fingerprints
exchange-native quote, volume, OI, OI-change and depth fields; an unchanged chain is not inserted.
Capture time, raw response and locally recalculated Greeks do not create a new history row by
themselves.

## Docker (recommended)

This repo wires the service as `option-chain-watcher` in `docker-compose.yml`.

Key env vars (from root `.env` + service overrides in compose):

- `NSE_OC_POLL_EVERY_MS` (default `120000`)
- `NSE_OC_SYMBOL` (default `NIFTY`)
- `NSE_OC_STRIKES_AROUND` (default `6`)
- `NSE_OC_KEEP_RAW` (default `false`)
- `NSE_OC_CLEANUP_MIN_DAYS` (default `14`)
- `NSE_OC_CLEANUP_ENABLED` (default `true`)
- `NSE_OC_RISK_FREE_RATE` (default `0.06`) for Black-Scholes greeks
- `NSE_OC_DIVIDEND_YIELD` (default `0`) for Black-Scholes greeks
- `NSE_OC_SCREENSHOT_ENABLED` (default `false`) enables `/api/screenshot` (optional; heavy)

## UI / API

The service exposes a small UI + JSON APIs on the same port as health (`NSE_OC_HEALTH_PORT`, default `18182`).
In this stack it is proxied via nginx at:

- UI: `http://localhost:19090/option-chain/`
- Latest JSON: `http://localhost:19090/option-chain/api/latest` (optional compare: `?compareMinutes=10`)
- ATM series JSON: `http://localhost:19090/option-chain/api/series?minutes=120`

`/option-chain/healthz` exposes the current `sessionState`, `suppressionReason`,
`outOfSessionPollsSuppressed` and `unchangedSnapshotsSuppressed` counters. Outside the configured
session, `lastPollAt` remaining unchanged is expected and healthy.

## Verify

```sql
select *
from option_chain_snapshots
where symbol = 'NIFTY'
order by captured_at desc
limit 1;
```

```sql
select l.*
from option_chain_legs l
join option_chain_snapshots s on s.id = l.snapshot_id
where s.symbol = 'NIFTY'
order by s.captured_at desc, l.strike asc, l.option_type asc
limit 60;
```
