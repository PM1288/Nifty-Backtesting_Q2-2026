# Live refresh latency and OI freshness repair — 23 September 2026

## Scope

This repair keeps Home and Scalper V2 live reads responsive without changing
strategy, chart arithmetic, contract selection, collectors, alerts, exports or
order permissions.

## Cause found

- The Home overview refreshed a query which scanned and window-ranked the full
  retained daily history three separate times for the complete F&O equity
  universe. One observed production execution remained active for more than
  225 seconds.
- The dashboard Prisma pool has four connections. The long overview execution
  occupied scarce capacity while live Scalper chart/context/history reads
  queued; observed route times reached approximately 25–40 seconds and emitted
  Prisma pool timeout `P2024` errors.
- Multiple open live tabs could start identical chart, context and positioning
  reads at the same time.
- Exact-contract SmartAPI FULL quotes could remain non-null but stale. The V2
  profile then displayed those provider-native values while the strike and
  cumulative panels displayed the newer NSE chain archive. The two sources also
  used different Delta OI definitions. During diagnosis the selected FULL
  quotes were more than 18 minutes behind the latest atomic NSE chain snapshot.

## Repair

- The overview now reads only the latest 22 daily rows per universe symbol once
  and reuses that materialized set for RSI, Williams %R, five-day change and
  20-day average volume.
- Live chart, Scalper context and option-positioning endpoints now coalesce
  identical concurrent requests and briefly reuse successful results for the
  same cadence already used by the browser. Explicit historical `asOf` reads
  bypass the cache.
- The production dashboard pool default is eight, matching the existing stage
  default. The four overview subqueries can run without consuming every API
  connection, leaving capacity for live chart reads.
- A current atomic NSE option-chain snapshot is now the canonical V2 OI cohort.
  Selected-strike values, profile bars, rankings, strike charts and cumulative
  analytics therefore use the same timestamp, contract unit and strike set.
- Delta OI uses the provider-reported `change_in_oi` from that same snapshot.
  The comparison baseline is represented as `current OI - reported Delta OI`,
  so the profile cannot silently switch to a prior-quote or first-session
  definition. Missing or stale evidence is not converted to zero.
- SmartAPI does provide per-strike OI, LTP, volume, bid/ask and depth. Its OI is
  stored in underlying units (65 units per NIFTY contract on the inspected
  expiry), while the NSE chain uses contracts. The collector's stored
  `oi_change` is the change from its prior one-minute cache observation, not the
  exchange session Delta OI. SmartAPI remains quote/depth corroboration; those
  differently scoped values are not relabelled or mixed into the canonical V2
  OI/Delta OI cohort.

## Verification contract

- API TypeScript typecheck, all API unit tests and API production build.
- Web TypeScript typecheck, all web unit tests and web production build.
- Canonical repository preservation gate.
- Production health, authenticated endpoint latency/cache headers and source
  timestamps after deployment.

## Live OI reconciliation evidence

At 10:24–10:40 IST on 23 September, consecutive atomic NIFTY snapshots for
23,350 CE advanced on the expected two-minute cadence. Examples:

| Captured IST | OI contracts | Provider session Delta OI |
|---|---:|---:|
| 10:24:25 | 75,178 | +39,495 |
| 10:28:25 | 72,166 | +36,483 |
| 10:34:25 | 70,325 | +34,642 |
| 10:38:25 | 67,033 | +31,350 |
| 10:40:25 | 64,845 | +29,162 |

The deployed `loadSmartApiNifty` adapter returned the exact 10:40:25 row:
source `nse_option_chain_snapshots`, unit `contracts`, OI `64845`, Delta OI
`29162`, state `OBSERVED`.

SmartAPI was independently healthy in the inspected ten-minute window: 318
NIFTY option tokens had OI, volume and two-sided quote observations; 324 tokens
had current one-minute OI observations. A 23,400 CE comparison demonstrated the
unit mismatch: SmartAPI OI `12,918,945` underlying units versus NSE OI `194,265`
contracts, approximately the 65-unit lot conversion plus observation-time
movement. The collector's SmartAPI `oi_change` is calculated against its prior
one-minute cache value, so it is not substituted for NSE session Delta OI.

The watcher logs confirmed successful 26-leg snapshots every two minutes with
20–23 ms provider fetches. Public `/n50/health` and `/n50/` returned HTTP 200.
Three long-running read-only `psql` diagnostics created during the first audit
query were identified by exact PID/query text and terminated; no application,
collector or watcher process was stopped.

## Release

- Commit: `562c730` (`fix(scalper): align OI to atomic chain cohort`).
- Image: `trading-stack-n50-dashboard:scalper-oi-cohort-20260923-562c730`.
- Digest: `sha256:aaf8256f4389807dbfbe31f843c4cc0ca98c01ee51ffd6c71bc0bbc130d21b38`.
- Rollback image: `trading-stack-n50-dashboard:before-scalper-oi-cohort-20260923`.
- API: 269 tests passed; web: 276 tests passed; both typechecks and production
  builds passed; canonical repository gate passed.

## Rollback

Restore the previously tagged dashboard image and recreate only
`n50-dashboard`. No migration or data rollback is required.
