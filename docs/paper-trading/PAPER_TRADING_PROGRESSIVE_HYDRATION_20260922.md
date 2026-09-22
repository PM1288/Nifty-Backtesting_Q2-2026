# Paper Trading progressive hydration

Date: 22 September 2026  
Route: `/n50/paper-trading`

## Measured cause

The production route painted its lightweight heading quickly, but the canonical
complete ledger took 11.8–17.0 seconds across five server-local samples
(median 12.8 seconds) before trade rows and analytical charts were hydrated.

PostgreSQL plan evidence isolated the largest cost to the exact existing
`₹6,000 stop` counterfactual. For 95 paper trades it searched forward through
roughly 1,600 one-minute observations per trade. That sub-plan alone read about
85,000 database pages and took about nine seconds. These calculations remain
unchanged and available; they are no longer allowed to block the trade list.

## Repair

The existing read endpoint accepts `detail=core` as an additive, backward-
compatible mode. Core mode returns the canonical census, trade identities,
positions, marks, targets, horizons, quality evidence and chart inputs while
deferring only the expensive entry-session/month-path and stop-path scans.

The browser now hydrates in three truthful phases:

1. durable portfolio census;
2. canonical trade rows and primary charts from the core read;
3. complete entry-session, month-path and stop-path evidence.

The complete response replaces the core response atomically. Missing deferred
values remain unavailable during phase two; they are never represented as zero
or as completed evidence. A refresh never submits or repeats a paper action.

Complete background evidence refresh now waits 60 seconds after the preceding
request instead of immediately starting another costly read after 30 seconds.
Manual refresh and returning to the visible tab still revalidate.

## Preservation

- No trade, fill, target, horizon, P/L, quality rule or simulation formula was
  changed.
- The original complete endpoint contract remains the default when `detail` is
  omitted.
- Export and detail drawers continue to use complete evidence.
- Paper/live permissions, mutation guards and authentication are unchanged.

## Validation and rollback

Record focused tests, complete repository gates, before/after timings and the
production image in `AGENT_HANDOFF.md` after release. Rollback is application-
only: restore the preserved dashboard image and recreate only `n50-dashboard`.
