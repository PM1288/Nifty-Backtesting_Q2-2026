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

Production public-route evidence after release, using headless Chromium at
1366x768 over the server-local network:

- first contentful paint: 360 ms;
- workbench heading: 535 ms;
- 95 canonical trade rows rendered: 1,341 ms;
- core API median: 1,565 ms across three samples;
- complete background evidence median: 6,059 ms across two samples.

The comparable pre-change complete API median was 12,767 ms across five
samples, with a 17,011 ms maximum. These are interactive server-local samples,
not an end-user broadband SLO or market-session soak.

Validation passed 257/257 web tests, 263/263 API tests, both typechecks/builds,
the canonical repository gate, and the authenticated Paper Trading browser
regression at six responsive viewport sizes. The regression reconciled all 95
equity-trade rows and preserved higher-target/lower-target and inclusive-horizon
rules.

Release `7b850f6` recreated only `n50-dashboard`. Container
`790d7f4e951f...` is healthy with zero restarts on image
`sha256:9081a32d8ecf9a676c14b81c94884c5e3196fbba55a2380ae625a2b4d46ea252`.
Rollback image:
`trading-stack-n50-dashboard:before-paper-progressive-hydration-20260922`.

Rollback is application-only: restore the preserved dashboard image and
recreate only `n50-dashboard`.
