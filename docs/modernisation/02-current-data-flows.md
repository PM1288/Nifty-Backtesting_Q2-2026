# Current data flows and authority boundaries

Captured: 2026-08-09 UTC

## Live market-data flow

```text
Angel One SmartAPI
  -> protected Go collector (`cmd/collector`, `internal/smartapi`)
  -> token/symbol normalisation
  -> PostgreSQL market and reference tables
  -> downstream analytics, OIIS, paper monitor and dashboard readers
```

The collector owns the known-working SmartAPI session and subscription logic.
PostgreSQL, not WebSocket memory, is the durable data boundary. Any future
adapter extraction must preserve authentication, request mapping, reconnect and
rate-limit behaviour and must pass fixture/replay tests before cutover.

## OIIS selection and paper flow

```text
market/regime/reference data
  -> OIIS daily selection and intraday eligibility
  -> durable selected-stock/watchlist records
  -> paper trade intent
  -> paper API validation and idempotency
  -> paper orders/fills/positions/target tracks
  -> monitor worker reads subsequent PostgreSQL bars
  -> webhook outbox -> webhook worker -> n8n
  -> scheduler -> daily/weekly summaries
```

Paper intent acceptance, entry fill, execution closure, independent analytical
target tracks and 5/30-session observations are separate lifecycles. Diagnostic
target hits must not silently close the execution position.

## Backtesting publication flow

```text
governed market/features/regimes
  -> `nse-analytics-worker` Python calculations
  -> immutable batch/run records and `nse_app.backtest_*` publications
  -> Node API GET `/v1/backtesting/...`
  -> React routes: overview, strategies, portfolio, regimes, stocks,
     daily, compare, runs and run detail
```

The current UI is an analytical reader. The current API route is GET-only and
the worker CLI exposes batch refresh/export operations rather than an operator
parameter experiment. Strategy definitions are currently Python-owned and
hard-coded with governed identifiers. The latest published batch observed in
the audit was batch 258 with 1,515 scenarios, 437 signal templates and 3,145
trade-log rows across three active strategy versions.

## Target strategy-testing flow

The safest additive path is:

```text
authenticated browser workspace
  -> typed Node job-creation API
  -> validated allow-listed strategy/parameter schema
  -> immutable PostgreSQL `research.experiment_run` + config/source identities
  -> dedicated Python backtest worker claim using SKIP LOCKED
  -> progress/checkpoints
  -> consolidated summary, diagnostics, trades and chart-ready series
  -> Node read API -> existing React backtesting area
```

Controls:

- no shell command, SQL identifier or arbitrary Python from the browser;
- no broker import or execution authority in the worker;
- bounded universe/date/combination limits and explicit resource budgets;
- immutable strategy version, dataset/source-batch and result identities;
- execution replay and Rules-of-Engagement diagnostic ladders reported
  separately;
- every intraday, D+5 adverse/reward and 30-session level evaluated
  independently rather than stopping at the first hit;
- a failed or cancelled job never replaces latest-good published dashboard data;
- promotion into the governed `nse_app.backtest_*` publisher remains an
  explicit, validated operation.

## Authoritative data boundaries

| Domain | Authoritative store/owner |
|---|---|
| Raw/reference/market history | Existing PostgreSQL schemas and partitions |
| Broker tokens and SmartAPI mapping | Existing collector/reference implementation |
| Order intent, fill, position and paper P&L | PostgreSQL paper/trading ledgers |
| OIIS selection/watchlist | OIIS-owned PostgreSQL records |
| Published backtest dashboard | `nse_app.backtest_*`, analytics-worker owned |
| Interactive experiments | Existing `research`/`simulation` StratLab ledger plus additive UI request/event metadata; never overwrite publication |
| Notifications | Business state plus transactional outbox in PostgreSQL |

## Failure and recovery observations

- The paper outbox prevents n8n availability from controlling trade commits.
- PostgreSQL cursors/watermarks must remain durable for bar catch-up.
- Scheduler call-site review found distinct domain ownership rather than a
  confirmed duplicate job. `nse_ingestor` and analytics polling have database
  freshness guards; intraday APScheduler jobs use `max_instances=1` and
  coalescing; the recommendation API explicitly disables its scheduler; paper
  summaries use a PostgreSQL advisory transaction lock and a unique
  account/type/period/revision key. The unresolved gap is unified last-success,
  lag and missed-run diagnostics, not proof that these workers can be merged.
- The UI must not block live ingestion, order monitoring or OIIS selection.
- A PostgreSQL outage affects all durable flows; backup, restore and recovery
  proof therefore precedes structural work.
