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
- Both the context and chart routes resolve the requested underlying through an
  indexed, F&O-eligibility-preserving selected-symbol lookup instead of making
  the selected chart wait for the complete 265-symbol universe query. The full
  selector remains available from `/v1/trading-analytics/underlying-universe`
  and loads on explicit selector focus, with a five-minute browser cache.
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

Deployed commit `696d904` produced dashboard image
`sha256:2c733181c40b540df4435c1d6fe322af99b46e4cb9a4f96c4c6a8d811dcaee1e`.
Web typecheck/build and 118/118 tests passed; API typecheck/build and 192/192
tests passed; the canonical repository gate passed.

The final authenticated NIFTY browser run passed 41/41 checks. Its observed
server timings were 1.004 seconds for Scalper context and 0.297 seconds for the
three-pane chart response. A separate authenticated IDFCFIRSTB browser run
rendered five baseline pane labels plus CE/PE with zero page errors in 9.592
seconds including application navigation/assets; its API requests were 4.316
seconds for context and 0.984 seconds for charts. Live latency still varies with
the 245 GB database's collector/analytics I/O, but the former 20–30 second
serial dependency is removed.

Ignored browser evidence:
`output/playwright/scalper-latency-deployed-final-20260910/`.

Rollback is application-only: recreate the prior dashboard image recorded in
the final handoff. No database rollback is required. Rollback tag:
`trading-stack-n50-dashboard:pre-scalper-latency-20260910`.
