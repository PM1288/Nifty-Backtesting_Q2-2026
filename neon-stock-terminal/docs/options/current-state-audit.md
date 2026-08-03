# Option Chain Current-State Audit

## Route and component

- Route: `/options`
- Redirects: `/option-chain`, `/option-chain/*` -> `/options`
- Main page component: `apps/web/src/pages/AnalyticsOptionsPage.tsx`

## Current fetch path

The current frontend talks directly to the option watcher service rather than the main `@app/api` service.

Endpoints:

- `GET /option-chain/api/latest`
- `GET /option-chain/api/series`
- `GET /option-chain/api/analytics`

The new analytics view uses only `/option-chain/api/analytics`.

## Current stored data

Primary live tables:

- `option_chain_snapshots`
- `option_chain_legs`

Observed during audit:

- current-day snapshot data exists and is fresh
- current-day legs for the latest expiry exist
- current-day underlying spot and ATM strike are present in the latest snapshot rows

## Existing logic already in repo

### Strike selection

`services/option-chain-watcher/src/transform.ts` already selects ATM from actual listed strikes derived from the payload. The updated store path keeps the same principle and makes the tie-break explicit.

### Legacy equilibrium formula

Existing equilibrium logic was found in:

- `internal/equilibrium/runner.go`
- `compose/grafana/dashboards/trading-stack-equilibrium.json`

Legacy behavior:

- CE and PE per-strike intraday series normalized to `0..100`
- fallback to `50` when series max equals min
- aggregate basket built from the arithmetic mean of available normalized strike series

### Legacy ATM combo lineage

Existing ATM-combo/straddle behavior was found in:

- `services/lite-dashboard/src/server.js`

This confirms that `CE + PE` around ATM already existed conceptually in the stack, but not as a clean, first-class view in the current app.

## Grafana mismatch

There is a legacy equilibrium path in the repo and Grafana, but it is not safe to use directly for the current app:

- legacy equilibrium service tables are stale
- the equilibrium service container currently fails because of migration checksum drift
- live options UI data is fresher in watcher snapshot tables

## Source of truth decision

The source of truth for the current Option Chain app is:

- watcher snapshot tables for live data
- watcher analytics endpoint for derived views

Legacy equilibrium code remains a reference for formula lineage only.

## Final chosen behavior

- live source = watcher tables
- strike window = actual listed strikes around ATM ± 3
- tie-break = lower strike
- equilibrium = normalized CE/PE mean baskets
- ATM combo = dynamic ATM `CE + PE`
- expiry context = stored expiry date, not weekday assumption
