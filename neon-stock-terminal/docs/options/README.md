# Options Module

## Scope

The `Option Chain` route extends the existing N50 analytics shell with four local views:

- `Snapshot`
- `Equilibrium`
- `ATM Combo`
- `Diagnostics`

The module stays inside the existing `/options` route and uses the same shell, dark theme, ECharts wrapper, formatting helpers, and audience-mode behavior as the rest of the app.

## Current source of truth

The current source of truth is the option-chain watcher snapshot store:

- `option_chain_snapshots`
- `option_chain_legs`

The application **does not** use the legacy equilibrium service tables for live UI reads because those tables are stale and the old equilibrium service is currently broken by migration checksum drift.

## Current API path

The frontend reads the watcher directly through:

- `GET /option-chain/api/latest`
- `GET /option-chain/api/series`
- `GET /option-chain/api/analytics`

`/api/analytics` is the batched endpoint introduced for the new equilibrium and ATM combo views.

## Core business rules

- ATM strike is selected from the **actual listed strikes** in the latest stored expiry snapshot.
- Tie on nearest strike uses the **lower strike**.
- Strike window uses **ATM ± 3 listed strikes inclusive**.
- Equilibrium uses normalized CE and PE baskets over that strike window.
- ATM combo uses the **dynamic ATM strike** at each timestamp and plots `CE LTP + PE LTP`.
- Expiry context always comes from stored expiry dates, not weekday assumptions.

## Code locations

Frontend:

- `apps/web/src/pages/AnalyticsOptionsPage.tsx`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/types.ts`

Watcher/backend:

- `services/option-chain-watcher/src/main.ts`
- `services/option-chain-watcher/src/store.ts`
- `services/option-chain-watcher/src/transform.ts`
- `services/option-chain-watcher/src/migrate.ts`

Legacy references:

- `internal/equilibrium/runner.go`
- `compose/grafana/dashboards/trading-stack-equilibrium.json`
- `services/lite-dashboard/src/server.js`

## Data flow

1. The watcher ingests/stores option snapshots and legs.
2. `/option-chain/api/analytics` pulls one expiry-scoped, batched dataset from PostgreSQL.
3. The store aligns spot, strike-window legs, equilibrium series, ATM combo series, and diagnostics in one pipeline.
4. The frontend renders those pre-shaped series into local tabs.

## Runtime notes

- The live route is `/options`.
- `/option-chain` redirects to `/options`.
- Beginner mode keeps the page focused on the main charts and ladder.
- Advanced mode keeps diagnostics and wider strike context visible.
