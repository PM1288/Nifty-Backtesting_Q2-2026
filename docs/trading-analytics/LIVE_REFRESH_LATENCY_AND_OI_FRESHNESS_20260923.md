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
- Exact-contract SmartAPI FULL quotes could remain non-null but stale. That
  allowed an old individually timed OI quote to win over a newer atomic chain
  cohort. During diagnosis the selected quotes were about 22 minutes old while
  the retained SmartAPI chain cohort was about one minute old.

## Repair

- The overview now reads only the latest 22 daily rows per universe symbol once
  and reuses that materialized set for RSI, Williams %R, five-day change and
  20-day average volume.
- Live chart, Scalper context and option-positioning endpoints now coalesce
  identical concurrent requests and briefly reuse successful results for the
  same cadence already used by the browser. Explicit historical `asOf` reads
  bypass the cache.
- A fresh atomic SmartAPI chain cohort replaces stale individually timed FULL
  OI quotes. Missing or stale evidence is not converted to zero, and a cohort
  without verifiable current timing does not displace otherwise usable quotes.

## Verification contract

- API TypeScript typecheck, all API unit tests and API production build.
- Web TypeScript typecheck, all web unit tests and web production build.
- Canonical repository preservation gate.
- Production health, authenticated endpoint latency/cache headers and source
  timestamps after deployment.

## Rollback

Restore the previously tagged dashboard image and recreate only
`n50-dashboard`. No migration or data rollback is required.
