# Recommendation and target architecture

Status: audit recommendation, 2026-08-09 UTC

## Executive recommendation

Modernise incrementally around the working deployment. Do not begin with a Go
rewrite or an event-bus migration. The verified system already has explicit
operational boundaries: Go SmartAPI collection, Python analytics/research,
Node/React dashboard, universal paper trading, PostgreSQL and Nginx. The safest
first release is to harden those boundaries, remove duplicate scheduling only
after evidence, and add the missing interactive research-job contract.

The current risks are operational sprawl (25 running containers), multiple
scheduler owners, high memory pressure in two data services, generated research
artefacts occupying about 83 GiB locally, a very large shared database, and an
interactive backtesting gap. None alone proves that a language rewrite will
improve end-to-end correctness or latency.

## Accepted near-term architecture

```text
Browser
  -> Nginx (retained)
       -> React/Vite static application
       -> Node operational/read API
            -> PostgreSQL
            -> durable backtest-lab job submission/read models

SmartAPI
  <-> protected Go collector/adapter
       -> PostgreSQL market/reference data

OIIS live service
  -> daily candidates/watchlist
  -> universal PAPER API

Universal paper service (PAPER only)
  -> API / monitor / webhook / scheduler commands from one image
  -> PostgreSQL paper ledger and transactional outbox

Python analytics/backtest worker
  -> governed publication (`nse_app.backtest_*`)
  -> isolated interactive experiment queue/results (`backtest_lab`)
  -> no broker authority
```

NATS and PgBouncer are deferred. NATS is not justified until durable
cross-process throughput/lag evidence shows PostgreSQL outbox and bounded polling
cannot meet the service-level objective. PgBouncer is not justified until
connection count/churn is measured under representative load.

## Component decision matrix

| Component | Decision | Evidence and benefit | Migration/rollback |
|---|---|---|---|
| Nginx | Retain and harden | Working N50 ingress; host Nginx is independently active; current hashed assets are only proxied and receive `max-age=0` | Stage compiled static assets/immutable caching while retaining current combined image as rollback |
| React/Vite UI | Retain and extend | Existing modular backtesting routes and chart components | Add lazy lab route; prior build remains deployable |
| Node API | Retain and harden | Existing UI contract and authenticated mutation patterns | Add typed lab endpoints; additive route rollback |
| SmartAPI Go collector | Retain protected | Contract tests pass and broker semantics are reported working | Fixture tests and boundary only; previous image rollback |
| OIIS live | Retain and observe | Owns governed selection/watchlist and paper submission | No semantic change in modernisation batch |
| Paper trading | Retain | Durable PostgreSQL state, workers and outbox already deployed | Keep migration overlay and PAPER fail-closed controls |
| Analytics worker | Retain and extend | Owns `nse_app.backtest_*` and existing calculation code | Add lab command/worker while preserving publication CLI |
| API/scheduler pairs | Investigate then consolidate ownership | Same images and overlapping job domains suggest risk, not proof | One scheduler at a time with lease and rollback flag |
| Redis | Retain and bound | Node API uses it for sessions, production rate limits and dashboard snapshots | Preserve contract; measure keys/TTL/memory before any tuning |
| PostgreSQL | Retain unchanged major/volume | 111+ GiB authoritative dataset and cross-domain ledger | Additive migration; app rollback without schema downgrade |
| NATS | Defer | No measured need yet | Reassess after replay/queue metrics |
| PgBouncer | Defer | Connection pressure not yet measured | Reassess after connection baseline |
| Generated `dist`, venvs, caches, outputs | Classify and remove from active source/build contexts | Reproducible clutter and large local footprint | Evidence/archive manifest before removal |

## Interactive strategy-testing workspace

### Operator experience

The Backtesting sidebar gains **Test Strategy**. An operator can:

1. choose a governed strategy version;
2. change only schema-declared numeric/enum parameters within server limits;
3. select a bounded qualified date range, universe and capital scenario;
4. review the immutable configuration and estimated workload;
5. submit a paper/research job;
6. monitor queued/running/completed/failed/cancelled status;
7. inspect funnel, trade quality, reward/adverse ladders, D+5 and 30-session
   paths, regimes, costs/tax, equity/drawdown and consolidated trades;
8. clone a completed configuration without mutating the prior run.

### Durable contract

Reuse the existing StratLab `research.experiment_run`, `research.run_shard`,
`simulation.trade_result`, `simulation.equity_point`, `research.metric_result`
and validation-gated publication contract. Add only the missing UI control
objects:

- `research.strategy_parameter_schema`: allow-listed parameters and constraints;
- `research.experiment_request`: idempotent UI request linked to deterministic
  `experiment_run` identity and source publication/snapshot;
- `research.experiment_event`: append-only request/job audit and progress;
- additive ladder/context/artifact tables only where the existing governed
  evaluation schemas cannot represent the required evidence.

Job creation must use a unique idempotency key. Claims use `FOR UPDATE SKIP
LOCKED`, bounded leases and resume-safe checkpoints. A worker records its result
and event atomically. Arbitrary code, paths, SQL and shell arguments are never
accepted from the UI.

### Strategy and exit integrity

- Strategy versions and entry rules are immutable.
- Only parameters declared by that version can be changed.
- Authoritative execution exits are reported separately from diagnostic paths.
- Intraday target levels, D+5 swing levels, adverse excursions and 30-session
  observations continue independently; the first hit does not end the ladder.
- Regime and indicator context uses point-in-time values available at entry.
- Failed validation prevents promotion but does not erase the experiment.

## Reversible implementation batches

### Batch A — preservation and characterisation

- Scope: external backup, restore proof, preservation manifest, current build,
  API/SmartAPI/paper/backtest characterisation tests.
- Database: read-only.
- Rollback: none required.
- Success: verified restorable archive and repeatable baseline.

### Batch B — additive lab contract

- Scope: idempotent additive SQL migration, typed API request/response validation, schema
  tests and read-only catalogue endpoints.
- Database: new `research` control objects and, only where required, additive
  columns/tables referencing existing run IDs; no destructive current-table change.
- Compatibility: existing dashboard and publisher untouched.
- Rollback: disable routes/worker; additive objects can remain unused.
- Success: migration repeatability and zero preservation-manifest loss.

### Batch C — bounded Python worker

- Scope: reuse the existing `PostgresRunStore` SKIP-LOCKED shard claim/resume,
  existing strategy calculation adapter, progress,
  consolidated results, independent ladder diagnostics and fixtures.
- Database: writes only to governed `research`/`simulation` experiment objects.
- Rollback: stop worker; queued jobs remain durable.
- Success: deterministic one-stock fixture, one/multi-worker parity, no broker
  imports and bounded resource use.

### Batch D — testing dashboard

- Scope: lazy React route, parameter form, workload preview, submission, status
  and result story using existing light Backtesting visual language.
- Compatibility: existing GET backtesting routes remain guest-readable; POST
  mutation remains session-protected because the auth guard exempts GET only.
- Rollback: remove navigation/route while keeping data.
- Success: production build and Nginx E2E with error/stale/cancel states.

### Batch E — staged deployment and measurement

- Scope: staging against restored data, replay load, preservation comparison,
  build/image/resource measurements and runbooks.
- Rollback: previous image set/Nginx upstream; no database restore needed for
  ordinary application rollback.
- Success: parity, health, no historical loss, no live order, resource limits.

### Batch F — evidence-based service cleanup

- Scope: stale scheduler-run reconciliation, measured intraday cadence and only
  proven scheduler duplication, generated clutter and dead config.
- Rollback: feature flags and `git mv` archive manifest.
- Success: lower default footprint without missed/duplicate jobs.
- Guardrail: do not scale out the current raw-sync/feature SQL jobs; their
  average runtimes already exceed the one-minute trigger interval and the
  database is the constrained shared resource.

## Material trade-offs and risks

- Extending the existing Python backtester yields faster parity than a rewrite,
  but its currently hard-coded entry thresholds must be extracted carefully with
  golden tests proving identical defaults.
- A shared PostgreSQL job queue avoids new infrastructure but needs indexes,
  bounded polling and retention to protect the operational database.
- The currently published daily backtester and minute-level StratLab serve
  different evidence needs. The lab must identify its dataset/engine rather than
  imply daily replay has minute ordering precision.
- Database backup/restore is time- and space-intensive because the primary
  database exceeds 111 GiB; that cost is necessary for safe structural work.

## Promotion gates

No lab or modernised component is production-ready until backup restore,
additive migration tests, deterministic replay, one/multi-worker parity,
paper-only safety, frontend-through-Nginx tests and pre/post preservation
comparison pass. Live trading remains a separate operator-controlled action and
is outside automated deployment.
