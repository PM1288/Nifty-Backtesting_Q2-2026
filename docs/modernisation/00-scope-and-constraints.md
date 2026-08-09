# Trading stack modernisation scope and constraints

Captured: 2026-08-09 UTC

## Verified scope

The requested repository `/home/novius2/Algo_Trade_Engine` is absent. No `DEV`
branch exists in the only trading Git repository on this host. The verified
source and deployment pair is therefore:

- source: `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026`;
- source branch at capture: `DEV_PM_CODE` at `10fb83e5c5115b2254c6edb9ea45c10f07580851`;
- modernisation branch: `codex/trading-stack-modernisation-20260809`;
- deployed runtime mirror: `/home/novius2/trading-stack` (not a Git checkout);
- Compose project: `trading-stack-novius2`;
- authoritative database: PostgreSQL 16 in the verified existing volume
  `trading-stack-novius2_pgdata`;
- production ingress for this stack: containerised Nginx published on port
  19090, with host Nginx separately active for other host routes.

No empty replacement repository or database was created to satisfy an invalid
path assumption.

## Non-negotiable controls

- Preserve the verified PostgreSQL volume, every schema and all historical
  data. No volume deletion, broad truncation or destructive reset is allowed.
- Keep Nginx. Do not disturb the independently active host Nginx service.
- Treat `internal/smartapi` and `cmd/collector` as protected working code until
  fixture/replay evidence supports a change.
- Keep automated execution in `PAPER`; no live order tests are permitted.
- Research/backtests have no live-order authority.
- Use additive, backwards-compatible migrations and a single migration owner.
- Do not archive or remove a file until runtime/import/reference evidence is
  collected.
- Do not introduce Go rewrites, NATS, PgBouncer or new infrastructure merely to
  match the proposed target diagram.

## Product addition in scope

Add an authenticated strategy-testing workspace where an operator can choose a
versioned strategy, edit permitted parameter levels, select a bounded dataset,
submit a paper/research backtest, monitor progress and inspect consolidated
results. The UI must submit a durable job; it must not execute a backtest in an
HTTP request or gain broker authority. Historical strategy versions and results
must remain immutable.
