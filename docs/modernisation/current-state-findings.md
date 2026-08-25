# Current-state findings — 23 August 2026 refresh

The authoritative baseline is `docs/trading-app-audit/`. The V3 handover was reviewed in full and reconciled with the current checkout and running Compose stack.

## Confirmed

1. The application remains a React/Vite frontend and Express/TypeScript gateway over PostgreSQL, Redis, Go collectors and Python domain services.
2. Source/deployment drift remains a live risk because `/home/novius2/trading-stack` is not a Git checkout.
3. `/v1/workspace/futures` still returned HTTP 500 on 23 August. Root cause was the PostgreSQL `row_number()` value reaching Express as JavaScript `bigint`.
4. The Futures defect is now corrected and deployed. Authenticated verification returned HTTP 200 in 212 ms with 379 contracts and 120 participant rows; rank values are JSON numbers.
5. The current monolithic Paper workspace returned a 769,962-byte response in 5,961 ms cold-ish and 3,461/3,271 ms warm during three sequential authenticated reads. It remains above the V3 performance target even though it is faster than the prior 19.3-second audit sample.
6. The Paper route performs eight database datasets serially at concurrency one, then comment aggregation, projections, scenarios and capital simulations synchronously. This avoids pool starvation but couples critical state to heavy analytics.
7. The dashboard build reported 17 dependency advisories (13 moderate, 3 high, 1 critical). No automatic breaking dependency upgrade was attempted.

## Not yet accepted

- OIIS contrast was reproduced at 4.13:1 for the desktop empty-state paragraph, corrected to a darker semantic text colour, and rerun across 16 authenticated desktop/mobile scans: 0 violations, 0 affected nodes.
- Paper p50/p95/p99 under three concurrent users is not yet measured.
- Strategy identifiers still require human-backed classification; extracted strings must not be bulk-promoted into a registry.
- Point-in-time universe and cross-provider price-basis guarantees are not complete for all strategies.
- Full old/new field parity has not yet been performed.

## Safety decision

Modernisation proceeds as reversible vertical slices. Legacy `/v1` contracts remain active. No live broker execution is introduced.
