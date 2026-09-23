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

## Rollback

Restore the previously tagged dashboard image and recreate only
`n50-dashboard`. No migration or data rollback is required.
