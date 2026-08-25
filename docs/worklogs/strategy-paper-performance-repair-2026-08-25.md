# Strategy and Paper Trading performance repair — 2026-08-25

## Outcome

The shared causes of blank/slow Strategy and Paper Trading pages were removed and the production stack was redeployed without changing strategy formulas, paper execution semantics, or persisted trading data.

## Root causes verified

1. `AppShell` fetched `/v1/overview` on every route. That endpoint builds the complete F&O universe, daily indicators, OIIS joins, long-horizon observations, and derivatives anomalies. Observed queries took 15–44 seconds, with one execution at 151.6 seconds.
2. `/health` and `/ready` ran `pg_database_size`, snapshot-history reads, and a ranked `pg_stat_statements` scan on every container probe. The diagnostics took 3–6 seconds and repeatedly consumed database CPU.
3. the in-process snapshot scheduler started the heaviest analytical materializers immediately after every API restart, even when the user was opening Paper or Strategy.
4. Monthly Strategy issued four multi-query endpoints concurrently and rendered nothing until all four completed.
5. Absolute Monthly transferred the 9,648-row all-stock rejection ledger on the default selected-entry view. The response was about 20 MB.
6. The running PostgreSQL container had stale 1 CPU / 1 GiB / 50-connection limits instead of the canonical runtime configuration.

## Changes

- Added authenticated `GET /v1/overview/header`, which reads only NIFTY 50, BANK NIFTY, INDIA VIX, market state, and up to 15 index bars for RSI.
- `AppShell` now uses the lightweight endpoint. Stock command entries are loaded from `/v1/instrument-profiles` only when the command palette opens.
- Replaced the F&O-to-equity lateral scan in the full overview with one normalized `instrument_universe` pass and `instrument_profiles` join.
- Made `/health` and `/ready` constant-time readiness checks. Expensive details moved to admin-only `GET /health/details`.
- Disabled the in-process analytical snapshot scheduler in production. Existing snapshot routes continue stale-while-revalidate on demand.
- Monthly Strategy loads its four sources sequentially and renders progressively.
- Added `includeEvaluations=false` to `/v1/rolling-monthly/absolute-months`; the default selected view uses it. The complete rejection ledger loads only when the user asks for rejected/all entries.
- Limited the rendered Strategy ledger to 250 rows at a time with a visible `Load 250 more` control. Filtering, counts, and CSV export continue to use the complete loaded population.
- Applied PostgreSQL runtime limits of 2 CPU, 2 GiB memory, and 80 connections. The persistent volume and tables were not replaced.

## Validation evidence

Authenticated production API timings after deployment:

| Surface | Before | After |
|---|---:|---:|
| Header market state | full overview 15–44 s under load | 0.10 s |
| Paper Trading | 29.9 s under contention | 3.25 s |
| Absolute Monthly initial selected view | 18.6 s / 20.2 MB | 2.05 s / 3.1 MB |
| Health | up to 3.95 s | 0.05–0.10 s |

Authenticated Playwright at 1440×900 confirmed:

- Paper Trading evidence rendered in 5.0 seconds.
- Monthly Strategy shell and progressive ledger rendered without an unavailable state.
- Rolling Strategy rendered its evidence ledger without an unavailable state.
- No P2024 response occurred in the validation run.

Build validation:

```text
npm run typecheck --workspace=@app/api        PASS
npm run typecheck --workspace=@app/web        PASS
npm run build --workspace=@app/api            PASS
npm run build --workspace=@app/web            PASS
docker compose -p trading-stack-novius2 build n50-dashboard  PASS
```

## Operations and rollback

The dashboard is `trading-stack-novius2-n50-dashboard-1`; the database is `trading-stack-novius2-postgres-1`. Both were healthy with zero restarts after replacement.

Rollback requires reverting this commit, rebuilding/recreating `n50-dashboard`, restoring the previous PostgreSQL resource values, and recreating `postgres` with the same named volume. No data migration or data rollback is required.
