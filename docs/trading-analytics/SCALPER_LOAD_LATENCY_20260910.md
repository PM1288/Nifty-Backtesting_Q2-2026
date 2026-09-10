# Scalper load-latency repair — 10 September 2026

## Scope

Canonical route: `/strategy/trading-analytics?view=scalper` in
`/home/novius2/trading-stack`. This repair changes request orchestration and
read-query bounds only. V7 signals, A-open/B-close measurement, OI arithmetic,
contract selection, permissions, collectors, stored data and every other
Trading Analytics lens remain unchanged.

## Diagnosis

The deployed page first awaited the full `/v1/trading-analytics` response and
only then mounted the Scalper, which requested `/v1/trading-analytics/charts`.
Observed live timings before the repair were 8.089 seconds followed by 3.531
seconds for NIFTY; separate cold diagnostics reached 10.490 plus 9.102 seconds.
IDFCFIRSTB reached 22.971 seconds for the broad response and 6.834 seconds for
charts. All returned HTTP 200: this was latency, not a missing route.

The slowest instrument-context statement spent 15.324 seconds in the retained
option quote lookup. Its session-first and previous-session lateral lookups
filtered exchange event time but did not bound the indexed collection time, so
partition/index pruning was poor while the 245 GB database was under collector
and analytical load. A read-only equivalent with explicit collection-time
bounds completed in about 1.8 seconds under the same load.

## Repair

- Added authenticated read-only `GET /v1/trading-analytics/scalper-context`.
  It returns only the canonical underlying/universe, SmartAPI selected-pair
  context, daily structural levels, source failures and no-order state needed
  to mount the existing Scalper.
- The web route no longer requests the full institutional, archived-chain and
  morning payload for normal Scalper loading. The full payload loads lazily if
  the user explicitly opens a shared Health/Formula/Conditions drawer.
- Added collection-time bounds to current-session and prior-session OI baseline
  lookups while retaining the existing exchange-time predicates.
- The default one-day chart requests three calendar days, which retains ample
  EMA9/RSI14/MACD warm-up for the displayed session without transferring all
  15 days. `All retained days` still requests the unchanged 15-day horizon.

No production cache values, mock prices, schema changes or new indexes were
introduced.

## Validation and rollback

API and web typechecks, complete unit suites, production builds and the
canonical preservation gate are required before deployment. Live authenticated
browser evidence must confirm NIFTY and a stock-F&O symbol load exact three-pane
charts, retained OI and no page errors.

Rollback is application-only: recreate the prior dashboard image recorded in
the final handoff. No database rollback is required.
