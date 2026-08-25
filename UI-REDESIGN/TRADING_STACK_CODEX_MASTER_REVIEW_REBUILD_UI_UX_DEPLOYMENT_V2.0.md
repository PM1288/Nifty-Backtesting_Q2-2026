# Codex Master Instruction
## Trading Stack Review, Safe Modernisation, Full Product UI/UX, Authentication, Repository Cleanup, Rebuild, Test and Deployment

**Execution mode:** Audit first, then implement and validate the safest evidence-based target architecture.
**Primary repository:** `/home/novius2/Algo_Trade_Engine`
**Expected source branch:** `DEV`
**Deployment model:** Docker Compose on Linux/Ubuntu
**Frontend:** React + Vite + TypeScript
**Reverse proxy:** **Nginx must remain**
**Database:** PostgreSQL must remain the authoritative system of record
**Broker integration:** Existing working SmartAPI implementation must be preserved as far as possible
**Default trading mode during all work and testing:** paper/simulation only
**UI/UX extension:** Version 2.0 - preserved Home, premium light analytical workspace, full strategy/backtesting/derivatives/product scope

---

# 1. Your role

Act as the principal software architect, senior backend engineer, DevOps engineer, database reliability engineer, performance engineer and test lead for this repository.

You have authority to reorganise, consolidate, replace or rewrite services and supporting code when evidence shows that doing so will improve:

- execution speed and latency consistency;
- CPU and memory utilisation;
- image size and deployment footprint;
- deployment simplicity;
- configuration and secrets management;
- modularity and maintainability;
- fault isolation and recoverability;
- structured logging and observability;
- testability;
- database efficiency;
- operational safety.

Do not blindly rewrite working code. First discover how the current stack actually works, establish a functional and performance baseline, protect all PostgreSQL data, and produce a written recommendation. Then implement the recommended architecture safely and completely.

The objective is a working, deployable trading platform—not a theoretical architecture document.

---

# 2. Non-negotiable constraints

These rules override all other optimisation goals.

## 2.1 Preserve all PostgreSQL data

No existing stock, market, strategy, paper-trade, live-trade, order, fill, position, P&L, broker, historical, backtest, audit, user, configuration or reference data may be lost.

You must preserve:

- all databases;
- all schemas;
- all tables and partitions;
- all materialised views and views;
- all sequences and current sequence values;
- all constraints and indexes;
- all functions, procedures, triggers and extensions;
- all users/roles and grants required by the application;
- all historical OHLCV and intraday data;
- stock/instrument/security-master data and broker token mappings;
- options, futures, open-interest and derivative data where present;
- all paper and live order/trade records;
- all backtest runs, metrics, ladder outcomes and strategy versions;
- all operational watermarks, ingestion checkpoints and reconciliation state;
- all audit and configuration history.

Never execute or include in an automated script:

- `docker compose down -v`;
- `docker volume rm` against a database volume;
- `docker system prune --volumes`;
- `DROP DATABASE`;
- `DROP SCHEMA ... CASCADE`;
- broad `TRUNCATE`;
- broad unqualified `DELETE`;
- a PostgreSQL major-version replacement without a separately validated upgrade procedure;
- a Compose change that silently starts PostgreSQL on a new empty volume;
- a bind-mount change that points PostgreSQL to an empty directory;
- an automatic database reset or seed operation in production.

Any migration must use an additive, backwards-compatible expand-and-contract approach unless there is a documented and validated reason not to do so.

## 2.2 Keep Nginx

Nginx remains the reverse proxy and production static-file server.

Do not replace it with Caddy, Traefik or another ingress proxy.

Audit whether Nginx currently runs:

- in Docker Compose;
- directly on the host;
- behind another load balancer;
- as a shared proxy for more than this application.

Preserve the operating model that has the lowest cutover risk. If host Nginx is shared by other applications, do not move or restart it unnecessarily. Version the relevant Nginx configuration in this repository and deploy only this application’s tested configuration fragment.

## 2.3 Preserve SmartAPI behaviour

The SmartAPI integration is reported to be working correctly. Treat it as protected working code.

Initially retain its:

- authentication flow;
- token/session generation;
- WebSocket subscriptions;
- symbol-token mapping behaviour;
- request payload mapping;
- order modification/cancellation behaviour;
- reconnect behaviour;
- dependency versions, unless a security or compatibility issue requires change.

Do not perform a language rewrite of SmartAPI during the first implementation pass.

You may add a stable adapter boundary, tests, health checks, metrics, rate limiting, idempotency, secret handling, error normalisation and reconciliation around it. Do not alter known-working broker semantics without replay and contract evidence.

## 2.4 Never place a live order during development or testing

All automated and manual tests must run in paper, simulation, replay or mocked mode.

Set the safe defaults:

```text
TRADING_MODE=paper
ALLOW_LIVE_TRADING=false
```

A production live-order path must require an explicit operator-controlled setting and a separate acknowledgement secret. A missing setting must fail closed.

Read-only SmartAPI market-data and account-state checks are allowed only when credentials and network access are already available and doing so cannot place, modify or cancel an order.

## 2.5 Do not destroy uncommitted or legacy work

Before changing the repository:

- inspect Git status;
- inventory untracked files;
- preserve any dirty changes;
- do not use `git reset --hard`;
- do not use `git clean -fdx`;
- do not overwrite unknown local configuration;
- do not force-push;
- do not rewrite shared branch history.

Create a dedicated modernisation branch or worktree. Preserve the current branch and create a pre-refactor tag or bundle where repository permissions allow.

## 2.6 Report facts, not assumptions

Do not claim a service is unused, duplicate, slow or broken without evidence from at least one of:

- source references;
- imports/call sites;
- Compose/runtime dependencies;
- logs;
- database connections;
- network traces;
- tests;
- resource measurements;
- query statistics;
- operator-facing behaviour.

If something cannot be validated, label it clearly as unresolved.

---

# 3. Required final outcome

Deliver a production-ready repository that:

1. Starts predictably through Docker Compose.
2. Keeps Nginx as the reverse proxy/static server.
3. Keeps PostgreSQL as the authoritative database without losing any existing data.
4. Preserves the working SmartAPI integration.
5. Uses a smaller, clearer set of long-running services.
6. Separates live execution from research/backtesting workloads.
7. Uses typed, validated configuration and safe secret mounting.
8. Has structured logs, health checks, metrics and operational runbooks.
9. Has automated unit, integration, contract, replay, data-preservation and deployment tests.
10. Has a tested backup, restore, upgrade and rollback process.
11. Archives genuinely obsolete source/configuration files in a controlled archive folder.
12. Removes generated artefacts, caches and accidental duplicates from the active repository.
13. Builds reproducibly from a clean checkout.
14. Has a documented one-command or single-entry deployment procedure.
15. Defaults to paper trading and cannot accidentally submit a live order.

---

# 4. Accepted target direction

The following is the preferred target unless the audit finds a strong repository-specific reason to deviate.

| Layer | Preferred target |
|---|---|
| Frontend | React + Vite + TypeScript, retained and optimised |
| Production static serving and proxy | Nginx, retained |
| Core operational API | Go modular monolith, where consolidation is justified |
| Live execution and risk | Dedicated Go service |
| SmartAPI integration | Existing working implementation retained behind a stable adapter contract |
| Research/backtesting/ML | Python workers using efficient vectorised/data-frame tooling |
| Database | Existing PostgreSQL, retained and optimised |
| Event transport | NATS Core/JetStream when an event bus is demonstrably useful |
| Connection pooling | PgBouncer only when measured connection pressure justifies it |
| Shared cache | None by default; retain Redis only for a proven requirement |
| Logging/telemetry | Structured JSON and OpenTelemetry-compatible correlation |
| Deployment | Docker Compose with default core services and optional profiles |
| Historical analytical snapshots | Optional versioned Parquet files as an additional backtest input; never as a replacement for existing PostgreSQL data |

This target is not permission to rewrite everything immediately. Each proposed change must be mapped to current behaviour, migration risk and measurable benefit.

---

# 5. Execution principles

## 5.1 Audit first, then execute

Complete an evidence-based review and write the recommendation before major implementation. After the recommendation is written, continue with safe implementation without waiting for routine approval.

Stop only when a requested operation would be destructive, would require unavailable production credentials, or cannot be made safe. In that case, complete every safe part and document the exact remaining operator action.

## 5.2 Prefer consolidation over uncontrolled microservices

The intended pattern is:

- one modular core API for ordinary application functions;
- one isolated execution/risk service;
- one protected SmartAPI adapter;
- one or a small number of Python research/backtest workers;
- PostgreSQL;
- Nginx;
- NATS only if required;
- optional observability/admin profiles.

Do not create one container per minor Python script, one service per database table, or multiple schedulers performing overlapping tasks.

## 5.3 Measure before and after

Record baseline and final values for:

- number of long-running default containers;
- total default-stack idle memory;
- CPU consumption at idle and under representative load;
- total image sizes;
- clean build time;
- cold and warm startup time;
- API latency at p50/p95/p99 for selected critical endpoints;
- WebSocket/tick processing throughput and lag;
- market-data database insert rate;
- backtest throughput on a fixed sample;
- database connection count;
- database query latency for selected critical queries;
- error/restart rate during resilience tests.

Do not optimise synthetic microbenchmarks at the expense of correctness or operational safety.

## 5.4 Keep the live path lean

The live execution path must not:

- wait for reporting queries;
- recompute full historical indicators on every tick;
- depend on the frontend;
- perform long-running backtests;
- create unbounded queues;
- make uncontrolled retry loops;
- write one PostgreSQL transaction per unnecessary event if safe batching is possible;
- rely only on an ephemeral event bus for order truth.

## 5.5 PostgreSQL remains authoritative for trading truth

NATS, in-memory state or a cache may improve speed, but the durable source of truth for order intents, broker acknowledgements, fills, positions, reconciliation and strategy-version references must remain PostgreSQL.

Use an outbox/inbox or equivalent transactional pattern for commands/events that cross process boundaries.

---

# 6. Mandatory phase sequence

Execute the work in the following order. Maintain `docs/modernisation/STATUS.md` throughout the work. After each phase, update it with findings, decisions, files changed, tests run, unresolved risks and the next action.

---

# Phase 0 — Safety, repository and environment capture

## 6.0.1 Confirm the working environment

At the start:

1. Resolve and print the actual repository root.
2. Confirm the current branch and remote.
3. Confirm whether `DEV` exists locally and remotely.
4. Record the current commit SHA.
5. Record Git status, including untracked files.
6. Inventory relevant host tools without installing replacements unnecessarily.
7. Record Docker and Compose availability.
8. Record active containers, networks, volumes and image names related to the stack.
9. Record host Nginx status if present.
10. Record PostgreSQL location: container, host or remote.
11. Record existing Compose project name and database volume name.

Do not display or save secret values in reports.

## 6.0.2 Create a safe work area

Preferred approach:

- create a branch named similar to `codex/trading-stack-modernisation-YYYYMMDD` from the verified `DEV` commit;
- use a Git worktree if the current checkout is running production services;
- create a pre-change Git tag such as `pre-modernisation-YYYYMMDD-HHMM` where appropriate;
- create a Git bundle or patch backup if there are local uncommitted changes that cannot be committed;
- never modify the production checkout in place until staging validation is complete.

## 6.0.3 Capture the current deployment

Create these files, sanitised of secrets:

```text
docs/modernisation/baseline/
├── repository-state.md
├── runtime-inventory.md
├── container-inventory.md
├── network-and-port-map.md
├── environment-variable-inventory.md
├── database-location-and-volume-map.md
├── nginx-current-state.md
└── baseline-test-results.md
```

Include names and references, but redact tokens, passwords, TOTP secrets, connection strings and personal account values.

---

# Phase 1 — Full current-stack audit

Audit all relevant repository content and the running stack before selecting changes.

## 6.1.1 Repository inventory

Produce a machine-readable and human-readable inventory of:

- top-level directories;
- services and applications;
- programming languages;
- package managers and lockfiles;
- Dockerfiles;
- Compose files and overrides;
- Nginx files;
- database migrations;
- schemas and SQL files;
- startup/deployment scripts;
- schedulers/cron jobs;
- test suites;
- generated artefacts committed by mistake;
- large files;
- duplicate or near-duplicate files;
- dead configuration files;
- secrets accidentally committed or referenced;
- data directories that should not be in source control;
- archived or versioned copies mixed into active source.

Use static dependency analysis, imports, runtime references, Compose references and Git history. Do not classify files only by filename.

## 6.1.2 Service inventory and responsibility map

For every current service/process, document:

- service name;
- language/runtime;
- entry point;
- port(s);
- internal/external dependencies;
- database schemas/tables read;
- database schemas/tables written;
- queues/topics/channels used;
- scheduler ownership;
- SmartAPI interaction;
- whether it can submit/modify/cancel orders;
- configuration sources;
- secret sources;
- health-check behaviour;
- logging destination and format;
- restart behaviour;
- approximate idle/working CPU and memory;
- whether another service duplicates its responsibility;
- recommendation: retain, harden, merge, rewrite, remove, archive or investigate.

Create:

```text
docs/modernisation/01-current-service-catalogue.md
```

## 6.1.3 Data-flow audit

Trace and document at least these flows where present:

1. SmartAPI authentication and session refresh.
2. Live market-data subscription and normalisation.
3. Tick/bar persistence.
4. Daily/reference/security-master ingestion.
5. Strategy signal generation.
6. Paper-trade creation.
7. Live-order intent and broker submission.
8. Order update, fill, position and P&L reconciliation.
9. Stop-loss and target-ladder processing.
10. Intraday, swing and 30-day horizon monitoring.
11. Backtest job creation and execution.
12. Dashboard/API/WebSocket delivery.
13. Notification/webhook/WhatsApp delivery where present.
14. End-of-day reports and summaries.
15. Configuration changes and strategy versioning.

For each flow, identify synchronous dependencies, single points of failure, duplicate writes, retry behaviour, idempotency and authoritative data.

Create:

```text
docs/modernisation/02-current-data-flows.md
```

## 6.1.4 Code-quality and correctness review

Review:

- duplicate business logic;
- strategy logic implemented differently in live and backtest paths;
- blocking calls inside async loops;
- unbounded threads, processes, queues or retry loops;
- database connection leaks;
- ORM N+1 queries;
- per-tick commits;
- broad polling instead of event/state-based processing;
- large DataFrame creation in live loops;
- repeated JSON serialisation/deserialisation;
- repeated indicator recomputation;
- shared mutable global state;
- exception swallowing;
- random exits or first-target-only ladder evaluation;
- incorrect timezone assumptions;
- silent fallback to live mode;
- implicit defaults that change trading behaviour;
- inconsistent transaction costs, tax or brokerage calculations;
- code paths that overwrite previous strategy/backtest results;
- data races in order-state processing;
- lack of idempotency on broker commands;
- duplicate schedulers;
- environment-specific hard-coded paths;
- credentials in code or logs.

Do not change strategy semantics merely because the code is untidy. First establish tests that capture current expected behaviour.

## 6.1.5 Frontend audit

Review the React/Vite frontend for:

- build configuration;
- TypeScript strictness;
- duplicated API clients;
- environment handling;
- hard-coded backend URLs;
- excessive bundle size;
- unneeded dependencies;
- unnecessary re-renders;
- polling frequency;
- WebSocket lifecycle management;
- API request cancellation;
- error states;
- route-level lazy loading;
- state-management duplication;
- production source maps and secret leakage;
- Nginx SPA fallback requirements;
- cache headers and immutable asset naming;
- health/status visibility;
- paper/live mode visibility and safeguards.

## 6.1.6 Nginx audit

Review:

- whether Nginx is host-based or containerised;
- upstream definitions;
- `/api` routing;
- WebSocket upgrade handling;
- SPA fallback;
- static asset caching;
- compression;
- request-size limits;
- proxy timeouts;
- keep-alive settings;
- security headers;
- access/error log rotation;
- TLS termination ownership;
- exposure of internal services;
- accidental caching of API or authentication responses;
- duplicate/conflicting server blocks.

## 6.1.7 Docker and deployment audit

Review every Compose file and Dockerfile for:

- duplicate services;
- development-only containers in production;
- source bind mounts in production;
- large base images;
- non-reproducible installs;
- missing lockfile enforcement;
- build tools left in runtime images;
- containers running as root;
- excessive capabilities;
- host networking;
- unnecessary published ports;
- missing health checks;
- incorrect dependency readiness;
- unbounded logs;
- missing resource limits;
- overlapping environment files;
- anonymous volumes;
- PostgreSQL volume ambiguity;
- `latest` tags;
- automatic destructive migrations;
- duplicate Nginx/frontend serving;
- duplicate schedulers/workers;
- unused Redis/RabbitMQ/Kafka services;
- orphaned networks and volumes.

## 6.1.8 Database audit

Inspect the actual PostgreSQL instance read-only at this stage.

Capture:

- PostgreSQL version;
- database sizes;
- schemas;
- tables and partitions;
- approximate and exact critical-table row counts;
- table and index sizes;
- primary/foreign/unique constraints;
- partition structure;
- extensions;
- functions/triggers;
- materialised views;
- sequence values;
- active connections;
- long-running queries;
- query statistics if available;
- dead rows and autovacuum state;
- unused or duplicate indexes;
- tables with frequent sequential scans;
- high-write/high-update tables;
- data-retention patterns;
- duplicate/overlapping market-data tables;
- timezone types and timestamp consistency;
- current migration mechanism;
- database roles and grants.

Pay special attention to any current equivalents of:

- one-minute bars;
- tick data;
- options-chain/OI snapshots;
- security-master snapshots;
- metrics tables;
- paper/live order and fill tables;
- strategy/backtest fact tables;
- symbol-performance snapshots;
- API request logs;
- ingestion watermarks;
- schemas such as `public`, `nse`, `nse_intraday`, `trading`, `backtest`, `strategy` or similarly overlapping domains.

Do not rename, merge or delete any table during the audit.

## 6.1.9 Baseline functional tests

Before refactoring, establish executable smoke/characterisation tests for as many of the following as the repository supports:

- frontend build;
- frontend route loading through Nginx;
- login/authentication if present;
- API health and version endpoints;
- database connectivity;
- schema/migration status;
- SmartAPI adapter initialisation without order placement;
- replayed or mocked market-data handling;
- one-minute bar ingestion;
- current quote retrieval;
- WebSocket delivery to the frontend;
- paper-trade entry;
- target-ladder monitoring without early exit;
- end-of-day paper-trade summary;
- a representative historical backtest;
- persistence across service restart;
- broker-response parsing through fixtures;
- current notification/webhook output;
- configuration loading.

If the current stack has defects, capture them as baseline failures rather than silently changing the expected result.

## 6.1.10 Baseline performance capture

Use representative, bounded workloads. Do not hit SmartAPI or production systems aggressively.

Capture:

- idle CPU/RAM by container/process;
- startup time to readiness;
- frontend build time and bundle size;
- API latency for selected read/write endpoints;
- market-event processing rate using replay fixtures;
- database insert rate for a safe sample;
- backtest runtime on a fixed dataset/strategy;
- number of database connections;
- total image size;
- log volume per minute under test load.

Create:

```text
docs/modernisation/03-baseline-performance.md
```

---

# Phase 2 — Database backup, restore proof and preservation controls

No structural rewrite or deployment cutover may start until this phase is complete.

## 6.2.1 Identify the real data location

Determine and document:

- PostgreSQL hostname/container;
- database name(s);
- data-directory/volume mapping;
- Compose volume name;
- whether the volume is external, named or bind-mounted;
- owner UID/GID and filesystem permissions;
- PostgreSQL major version;
- backup destination;
- available free space;
- whether WAL archiving/PITR exists;
- whether another application shares the database server.

Never infer the data volume name from a new Compose file. Verify it from the running container and Docker volume inspection.

## 6.2.2 Create backups

Use the currently supported PostgreSQL tools and credentials without printing secrets.

Create, as applicable:

- global roles/grants dump;
- custom-format logical dump for each relevant database;
- schema-only dump;
- list of extensions;
- migration/version table export;
- critical-table CSV exports only as an additional validation aid, not as the main backup;
- volume/filesystem snapshot only if the deployment environment supports a safe consistent snapshot.

Store backups outside the Git repository. Do not commit data dumps.

The backup script must:

- fail on errors;
- write a timestamped manifest;
- record PostgreSQL version and source database;
- record backup file sizes;
- use restrictive permissions;
- avoid exposing credentials in command history or process arguments where possible;
- support verification and restore.

Create a repository runbook and scripts such as:

```text
scripts/db/backup.sh
scripts/db/verify-backup.sh
scripts/db/restore-test.sh
docs/runbooks/database-backup-restore.md
```

The scripts may reference an external backup directory configured by environment variable, but must never default to a directory that is built into an application image.

## 6.2.3 Prove restoration

Restore the logical backup into a separate isolated database/container that cannot be confused with production.

Validate:

- schemas and table counts;
- extensions;
- critical exact row counts;
- partition counts;
- sequence values;
- constraints and indexes;
- representative queries;
- min/max timestamps;
- sampled row hashes or deterministic data signatures;
- critical aggregate totals;
- application read-only connectivity.

Do not call a backup valid merely because `pg_dump` returned exit code zero.

Create:

```text
docs/modernisation/04-database-backup-and-restore-proof.md
```

## 6.2.4 Create a data-preservation manifest

Create a machine-readable manifest, for example:

```text
docs/modernisation/data-preservation-manifest.json
```

It should record for each critical table/partition:

- database;
- schema;
- table;
- purpose;
- approximate row count;
- exact row count where safe/practical;
- size;
- min/max primary timestamp where applicable;
- primary key/unique key;
- important sequence value;
- selected deterministic signatures;
- pre-change migration version.

Repeat the same checks after migration and deployment. Differences must be explained and must not represent lost historical records.

## 6.2.5 Pin the existing PostgreSQL volume safely

When Compose is rewritten:

- preserve the verified existing volume or external database connection;
- explicitly name the volume only after confirming the real existing name;
- ensure `docker compose up` cannot create a second empty data volume unnoticed;
- add a startup guard that checks expected schemas/tables before the application is considered ready;
- never run database seeding automatically against a non-empty production database;
- keep PostgreSQL major version unchanged during this modernisation unless a separately tested upgrade is essential.

If the current database is external or shared, do not move it into Compose as part of this refactor.

---

# Phase 3 — Written recommendation and implementation plan

Before major code movement, write:

```text
docs/modernisation/05-recommendation-and-target-architecture.md
```

This document must contain:

## 6.3.1 Executive findings

- current architecture summary;
- major performance/resource problems;
- major reliability/data risks;
- duplicated responsibilities;
- working components that should remain;
- high-risk areas that require wrappers rather than rewrites;
- expected benefits and material trade-offs.

## 6.3.2 Component decision matrix

For every service/package/tool/configuration set, assign:

- **retain as-is**;
- **retain and harden**;
- **merge into core API**;
- **isolate as a dedicated service**;
- **rewrite with target language**;
- **remove generated/duplicate artefact**;
- **archive as legacy**;
- **retain temporarily pending evidence**.

For each decision include:

- evidence;
- replacement/target;
- data impact;
- API compatibility impact;
- migration method;
- rollback method;
- risk rating;
- test required.

## 6.3.3 Current-to-target service mapping

Prefer the following logical target where supported by evidence:

```text
Browser
   |
   v
Nginx
  - static React/Vite build
  - /api reverse proxy
  - /ws WebSocket proxy
   |
   +------------------> Core API (Go modular monolith)
   |                       |
   |                       +--> PostgreSQL
   |                       +--> NATS when needed
   |
   +------------------> WebSocket/API upstreams

SmartAPI Adapter (existing implementation, protected)
   |<---------------------> Angel One SmartAPI
   |
   +--> normalised market events
   +<-- broker commands from execution boundary

Execution/Risk Service (Go)
   - order state machine
   - pre-trade checks
   - idempotency
   - target/stop monitoring
   - broker reconciliation
   - kill switch
   - durable order audit

Research/Backtest Worker(s) (Python)
   - historical features/indicators
   - backtesting
   - strategy comparison
   - charts/reports
   - no authority to submit live orders

PostgreSQL
   - authoritative operational and historical data

NATS Core/JetStream, only if justified
   - market events
   - signal/execution notifications
   - durable commands/events where configured
   - never the only order ledger
```

## 6.3.4 Evidence-based deviations

If the actual stack makes a different choice safer or more efficient, document the deviation. Examples:

- keep an existing well-structured Node/TypeScript API instead of rewriting it immediately;
- postpone NATS if the current event volume does not justify it;
- retain Redis for a specific distributed lock/session/cache function;
- keep PgBouncer disabled if the connection count is already low;
- retain host Nginx because it serves multiple applications.

Do not introduce new infrastructure only to match a diagram.

## 6.3.5 Implementation batches

Break implementation into reversible batches. Each batch must have:

- exact scope;
- files/services affected;
- compatibility strategy;
- database migration plan;
- test plan;
- rollback point;
- success criteria.

Then continue into implementation.

---

# Phase 4 — Target repository and service architecture

## 6.4.1 Recommended active repository structure

Adapt to actual repository content, but aim for a clear layout similar to:

```text
Algo_Trade_Engine/
├── apps/
│   └── web/                       # React/Vite/TypeScript
├── services/
│   ├── core-api/                  # consolidated operational API
│   ├── execution/                 # execution and risk boundary
│   └── broker-smartapi/           # preserved working integration
├── workers/
│   ├── research/                  # Python research/feature jobs
│   └── backtest/                  # Python backtest jobs
├── packages/
│   ├── contracts/                 # OpenAPI/event/JSON schemas
│   ├── frontend-client/           # generated or typed API client
│   ├── go-common/                 # small, justified shared Go packages
│   └── python-common/             # small, justified shared Python packages
├── db/
│   ├── migrations/
│   ├── maintenance/
│   ├── views/
│   └── README.md
├── deploy/
│   ├── compose.yaml
│   ├── compose.dev.yaml
│   ├── compose.prod.yaml
│   ├── compose.ci.yaml
│   ├── nginx/
│   ├── config/
│   └── observability/
├── scripts/
│   ├── bootstrap/
│   ├── db/
│   ├── deploy/
│   ├── test/
│   └── operations/
├── tests/
│   ├── contract/
│   ├── integration/
│   ├── replay/
│   ├── end-to-end/
│   ├── performance/
│   ├── resilience/
│   └── data-preservation/
├── docs/
│   ├── architecture/
│   ├── modernisation/
│   └── runbooks/
├── archive/
│   └── legacy/YYYY-MM-DD/
├── Makefile or task runner
├── .env.example
├── .gitignore
└── README.md
```

Do not create shared libraries that couple every service to the same internal database models. Share only stable contracts, generated clients and genuinely generic utilities.

## 6.4.2 Core API

Where audit evidence supports consolidation, build a modular core API with internal modules such as:

- identity/access control;
- instruments and trading calendars;
- strategy definitions and immutable versions;
- paper-trading administration;
- dashboards and reporting APIs;
- backtest job submission/status;
- runtime settings;
- notification configuration;
- health/diagnostics;
- audit access.

Requirements:

- typed request/response models;
- OpenAPI or an equivalent machine-readable API contract;
- explicit timeouts;
- graceful shutdown;
- bounded concurrency;
- connection pooling;
- transaction boundaries;
- request IDs and trace correlation;
- structured errors with stable error codes;
- no broker credentials in this service unless absolutely required;
- no direct live-order placement from UI-facing handlers;
- no long-running backtest in a request thread;
- UTC storage and explicit IST presentation where needed;
- immutable strategy/version references on every signal/trade/backtest.

A Go rewrite is appropriate only for services being consolidated or for performance-critical operational code. Preserve public API behaviour or provide a compatibility layer while the frontend migrates.

## 6.4.3 Execution and risk service

Create or harden a dedicated execution boundary with:

- deterministic order state machine;
- unique client order intent ID;
- idempotency keys;
- pre-trade capital and exposure limits;
- per-symbol/per-strategy limits;
- paper/live mode enforcement;
- market-hours checks;
- instrument/token validation;
- stale-price guard;
- max-order-size guard;
- duplicate-order guard;
- stop-loss and target-ladder state;
- support for evaluating all configured targets rather than exiting evaluation at the first target;
- broker acknowledgement mapping;
- retry classification;
- reconciliation against broker orders/trades/positions/funds;
- kill switch;
- append-only execution audit;
- recovery after process restart;
- metrics for queue delay, submit latency, reject rate and reconciliation mismatch.

Order submission workflow should be equivalent to:

1. Receive a validated order intent with unique idempotency key.
2. Record intent durably in PostgreSQL.
3. Perform pre-trade risk checks.
4. Produce broker command through the protected SmartAPI adapter.
5. Record broker response and broker order ID.
6. Reconcile asynchronously and repeatedly until terminal state.
7. Recover incomplete intents after restart without creating duplicate broker orders.

Use an outbox/inbox or equivalent transactional mechanism where commands/events cross service boundaries.

## 6.4.4 SmartAPI adapter

Preserve existing internals initially. Add an adapter contract around the working code.

Required capabilities:

- start/authenticate;
- report authentication/session state;
- subscribe/unsubscribe market data;
- normalise ticks/quotes/bars;
- place order only when live mode is explicitly enabled;
- modify/cancel order;
- query orders/trades/positions/funds;
- expose broker error codes in normalised form;
- reconnect with bounded exponential backoff and jitter;
- respect API rate limits;
- prioritise execution/reconciliation over non-critical polling;
- redact credentials and tokens;
- report liveness/readiness;
- support fixture-based replay and contract tests;
- graceful shutdown;
- prevent two active live sessions/processes from duplicating execution unless explicitly designed.

Suggested stable logical commands/events may include:

```text
broker.session.status
broker.market.subscribe
broker.market.unsubscribe
broker.order.submit
broker.order.modify
broker.order.cancel
broker.order.query
broker.trades.query
broker.positions.query
broker.funds.query
market.tick.<exchange>.<instrument>
broker.order.update
broker.reconciliation.result
```

The actual transport may be HTTP/gRPC/NATS depending on audit findings. The contract must be versioned and tested.

Never permit another service to import SmartAPI directly after the adapter boundary is established.

## 6.4.5 Market-data path

Optimise the live path as follows where compatible:

```text
SmartAPI WebSocket
    -> decode and validate once
    -> normalised in-memory latest-state map
    -> bounded event publication
    -> bounded batch persistence to PostgreSQL
    -> UI WebSocket snapshots/deltas
```

Requirements:

- bounded queues with explicit overflow policy;
- sequence/timestamp handling;
- duplicate and out-of-order event policy;
- per-instrument latest state in memory;
- batch writes where data durability permits;
- retry/backpressure metrics;
- persistent ingestion watermark;
- UTC event timestamps plus source exchange timestamp;
- no repeated conversion through multiple untyped representations;
- incremental execution indicators rather than full-history recomputation;
- replay test from saved fixtures;
- clear retention policy for raw ticks versus bars/snapshots.

Do not let a UI outage or reporting query block market ingestion.

## 6.4.6 Research and backtesting workers

Keep research/backtesting in Python unless profiling shows a specific reason to move a small kernel.

Requirements:

- separate process/container/profile from live execution;
- no direct authority to place live orders;
- deterministic dataset and strategy version references;
- fixed random seed where stochastic methods are used;
- vectorised/batch processing;
- use Polars/NumPy and optional Numba/DuckDB only where beneficial;
- avoid row-by-row Python loops over large datasets where practical;
- support all intraday target ladders independently;
- support swing targets and adverse excursions;
- support 30-day maximum favourable/adverse excursion calculations;
- preserve historical result data;
- include brokerage, charges and tax assumptions as versioned configuration;
- write progress and results through a stable job/result contract;
- enforce memory limits and chunking/streaming for large data;
- generate reproducible summary and detail outputs;
- never block the operational API while a job runs.

Establish parity tests between current and refactored strategy calculations before changing any algorithmic semantics.

## 6.4.7 NATS decision and use

Introduce NATS only after confirming a need for cross-process event distribution, durable work queues, replay or service decoupling.

If used:

- use NATS Core for ephemeral latest-state notifications where loss of an intermediate update is acceptable;
- use JetStream for durable commands/events that require acknowledgement/replay;
- define subject naming and versioned message schemas;
- use durable consumers where required;
- set retention, storage and size limits;
- prevent unbounded streams;
- configure retry/dead-letter handling;
- monitor consumer lag;
- do not treat NATS as the only ledger for orders/trades;
- keep PostgreSQL outbox/inbox state for transactional integrity;
- protect the server from public exposure.

If the current system has Redis/RabbitMQ/Kafka, keep it only when the audit proves a required function that NATS or PostgreSQL cannot safely replace in this phase.

## 6.4.8 PostgreSQL target organisation

Do not force immediate destructive schema consolidation. First create logical ownership and a migration map.

Preferred future domains:

```text
ref       instruments, broker tokens, exchanges, calendars, corporate actions
market    bars, ticks, quotes, options, OI, Greeks, market snapshots
trading   order intents, broker orders, fills, positions, cash, risk
strategy  strategy versions, parameters, signals, paper trades
backtest  datasets, runs, trades, ladders, metrics, comparisons
ops       jobs, leases, watermarks, outbox, inbox, reconciliation
security  users, roles, grants where applicable
audit     immutable operational, configuration and execution events
```

Rules:

- do not move historic tables merely for naming consistency unless benefit exceeds risk;
- preserve compatibility views during transitions;
- use additive columns/tables first;
- backfill in resumable batches;
- validate counts and signatures;
- switch readers/writers only after tests;
- retain old tables read-only until the cutover is validated;
- remove nothing in the first production release unless it is generated/cache data and explicitly approved by the preservation checks;
- keep applied migration files immutable;
- provide schema ownership documentation.

For large time-series tables:

- evaluate range partitioning by trading date/month;
- avoid excessive per-symbol partition counts;
- evaluate composite B-tree indexes for instrument/time queries;
- evaluate BRIN indexes for naturally ordered time columns;
- batch inserts and use `COPY` for large historical loads;
- tune autovacuum per high-write table;
- use retention policies only after data classification and backup validation;
- separate immutable event history from current-state tables;
- measure every index change with representative queries.

## 6.4.9 PgBouncer decision

Add PgBouncer only if measured connection count, connection churn or process scaling justifies it.

If added:

- document transaction/session pooling implications;
- ensure application behaviour is compatible;
- preserve prepared-statement behaviour appropriately;
- expose PgBouncer only internally;
- add health checks and connection metrics;
- retain a direct database path for migrations/administration where necessary.

## 6.4.10 Configuration management

Classify configuration into:

1. **Deployment configuration** — typed files/environment with startup validation.
2. **Secrets** — mounted files/secret mechanism, never committed.
3. **Runtime trading configuration** — versioned PostgreSQL records with audit history.

Create one documented precedence order, for example:

```text
compiled safe defaults
< base configuration file
< environment-specific configuration file
< explicitly allowed environment variables
< mounted secret files
< audited runtime database settings for designated fields
```

Requirements:

- fail fast on invalid/missing required configuration;
- print only names/sources, never secret values;
- maintain `.env.example` containing placeholders only;
- prohibit frontend exposure of secrets;
- version strategy parameters and risk limits;
- record who/what changed runtime settings;
- store all timestamps in UTC and display/report IST explicitly;
- make paper mode the default;
- use feature flags for controlled migration/cutover.

## 6.4.11 Structured logging and telemetry

Standardise service logs as structured JSON to stdout/stderr.

Common fields should include where applicable:

```text
timestamp_utc
level
service
service_version
environment
host
trace_id
span_id
request_id
strategy_id
strategy_version
backtest_run_id
signal_id
order_intent_id
broker_order_id
instrument_id
symbol
exchange
event
status
latency_ms
queue_lag_ms
error_code
retry_count
message
```

Separate:

- diagnostic logs;
- immutable business/audit events;
- durable order/trade ledger events.

Never log:

- API keys;
- passwords or PINs;
- TOTP seeds or generated TOTP values;
- access/refresh tokens;
- complete authentication responses;
- database URLs containing credentials;
- authorisation headers;
- full personal account details.

Provide:

- bounded Docker log rotation;
- correlation across Nginx, API, execution and SmartAPI;
- health and readiness endpoints;
- metrics for ingestion lag, queue lag, database pool usage, broker session state, order latency, reject rate, reconciliation mismatch, backtest job duration and service restarts;
- optional observability Compose profile rather than forcing a large monitoring stack into the core deployment.

---

# Phase 5 — Nginx and frontend production design

## 6.5.1 Nginx responsibilities

Nginx must:

- serve the compiled Vite `dist` assets;
- use SPA fallback for frontend routes;
- reverse proxy `/api/` to the core API;
- reverse proxy `/ws/` or the current WebSocket endpoint with upgrade headers;
- expose a minimal application health endpoint as appropriate;
- use upstream keep-alive;
- set safe proxy timeouts based on endpoint type;
- avoid buffering WebSocket streams;
- avoid caching authentication or API responses by default;
- cache hashed immutable static assets for a long period;
- avoid long caching of `index.html`;
- enable gzip, and Brotli only if already supported and justified;
- add appropriate security headers without breaking the application;
- use request/body size limits appropriate to actual APIs;
- keep internal services unexposed;
- log request IDs and upstream latency;
- support graceful reload;
- validate configuration with `nginx -t` before reload.

## 6.5.2 Frontend build

Use a multi-stage build:

1. deterministic package install using the authoritative lockfile;
2. type check/lint/test;
3. production Vite build;
4. copy only built assets into the Nginx image or mounted deployment artefact.

Do not run the Vite development server in production.

Frontend configuration should use safe public runtime values only. Do not embed SmartAPI credentials, database credentials, internal tokens or private URLs in the browser bundle.

Optimise:

- route-level code splitting;
- lazy loading of heavy charts;
- bundle analysis;
- dependency removal where proven unused;
- WebSocket reconnect/backoff;
- request cancellation;
- polling reduction;
- clear paper/live mode indicator;
- explicit stale-data status;
- frontend error boundary and diagnostics correlation ID.

## 6.5.3 Nginx location behaviour to test

At minimum test:

- `/` returns the SPA;
- direct navigation to a nested frontend route succeeds;
- hashed assets receive immutable cache headers;
- `index.html` receives short/no cache;
- `/api/health` reaches the API;
- `/ws/` upgrades successfully;
- API errors are not converted into SPA HTML;
- oversized requests are handled predictably;
- internal container ports are not accessible externally;
- Nginx reload does not drop established service availability unnecessarily.

---

# Phase 6 — Docker Compose and image redesign

## 6.6.1 Compose layout

Create a clear deployment layout, preferably:

```text
deploy/compose.yaml          # core common definition
deploy/compose.dev.yaml      # local development overrides
deploy/compose.prod.yaml     # production hardening/resources
deploy/compose.ci.yaml       # isolated test stack
```

The default production stack should contain only services needed for normal operation.

Suggested services, subject to audit:

```text
nginx
core-api
broker-smartapi
execution
postgres or external-postgres reference
nats, if justified
pgbouncer, if justified
```

Optional profiles:

```text
research
backtest
observability
admin
maintenance
```

Do not start notebook servers, database GUIs, browsers, test generators or heavyweight monitoring by default.

## 6.6.2 Compose safety requirements

Every long-running service should have, where applicable:

- application-level liveness health check;
- readiness health check or equivalent startup gate;
- explicit restart policy;
- graceful stop signal and timeout;
- CPU/memory limits or documented deployment values;
- non-root user;
- `read_only: true` where feasible;
- writable `tmpfs` only where necessary;
- dropped Linux capabilities;
- `no-new-privileges`;
- bounded Docker log rotation;
- pinned image version/digest for third-party images;
- internal network placement;
- only necessary published ports;
- named volumes only for required state;
- secret mounts only for required services;
- deterministic environment/config mounts;
- no source bind mounts in production;
- no `container_name` unless a proven external integration requires it;
- no host network unless absolutely necessary and documented.

Use `depends_on` only with real health/readiness conditions, not as a substitute for application retry logic.

## 6.6.3 PostgreSQL Compose rules

If PostgreSQL remains containerised:

- reuse the verified existing volume;
- set the explicit volume name only after verification;
- retain the current major version;
- do not initialise/seed a non-empty database;
- mount configuration only if tested;
- keep port 5432 internal unless an existing secure operational need requires host access;
- provide a health check that verifies the expected database;
- create separate migration/backup jobs rather than embedding destructive startup actions;
- back up before every schema release;
- test restore before production cutover.

If PostgreSQL is external, Compose should not create a replacement database container in production.

## 6.6.4 One-shot jobs

Use explicit one-shot services or scripts for:

- schema migration;
- backup;
- restore verification;
- database doctor checks;
- data-preservation checks;
- administrative maintenance;
- seed/demo data in non-production only.

Migrations must not be run concurrently by every application replica.

## 6.6.5 Dockerfiles

Use multi-stage builds and minimal runtime images.

Requirements:

- deterministic dependency install;
- build/test stage separated from runtime;
- no compilers/package managers in runtime unless required;
- non-root runtime user;
- explicit working directory;
- `.dockerignore`;
- no secrets copied into image layers;
- only required artefacts copied;
- health-check binary/script small and reliable;
- correct signal forwarding;
- reproducible version metadata;
- SBOM/security scan if available without bloating runtime.

For Python:

- use a pinned lock/requirements mechanism;
- avoid copying virtual environments from the host;
- install only runtime packages in the runtime image;
- disable bytecode/cache or manage it deliberately;
- use one process model appropriate to the worker/API role.

For Go:

- compile a static or minimal binary where compatible;
- strip unnecessary debug symbols for production while retaining separate debug artefacts if needed;
- expose build version/commit through a version endpoint.

For React/Vite:

- build once;
- serve through Nginx;
- do not include Node runtime in the final Nginx image unless a real SSR requirement exists.

---

# Phase 7 — Repository cleanup and controlled archive

The user explicitly requires obsolete/non-required files to be archived and the active repository cleaned.

## 6.7.1 Classify before moving or deleting

Classify each candidate into one of four groups:

1. **Active** — required by current build/runtime/tests/deployment.
2. **Legacy source/configuration** — no longer active but useful for historical/reference purposes; archive.
3. **Generated artefact/cache** — rebuildable and not useful as source; remove and add to `.gitignore`.
4. **Sensitive material** — secrets/credentials/private dumps; remove from repository history/worktree as appropriate and require rotation; never archive in the repository.

## 6.7.2 Archive structure

Use a controlled structure such as:

```text
archive/legacy/YYYY-MM-DD/
├── README.md
├── manifest.csv
├── old-services/
├── old-compose/
├── old-scripts/
├── old-config/
└── old-docs/
```

Use `git mv` for tracked files so history remains visible.

The archive manifest must contain:

```text
original_path
archived_path
classification
reason
last_known_reference
replacement_path
risk_if_restored
archive_date
eligible_for_future_deletion
```

The archive must be excluded from:

- production Docker build contexts;
- package discovery;
- active lint/typecheck/test paths;
- deployment scripts;
- runtime imports.

## 6.7.3 Never archive these merely because they look old

Do not move/remove without specific proof:

- applied database migrations;
- scripts needed to restore historic backups;
- SmartAPI working code;
- broker symbol/token mapping logic;
- existing strategy definitions tied to historical results;
- files referenced by production cron/systemd/Nginx;
- legal/audit records;
- database data directories or volumes;
- current deployment secrets;
- fixtures required for contract/replay tests.

Applied migration history should remain immutable in the active migration chain or an explicitly supported legacy migration directory that migration tooling still recognises.

## 6.7.4 Remove, do not archive, generated clutter

After proving it is reproducible, remove from active source control where present:

- `node_modules`;
- frontend `dist`/build output;
- Python virtual environments;
- `__pycache__`, `.pyc`, test caches;
- temporary logs;
- local database dumps;
- coverage output;
- editor caches;
- OS metadata;
- duplicate downloaded dependencies;
- obsolete packaged binaries generated from source;
- stale temporary CSVs that are not authoritative input data.

Update `.gitignore` and `.dockerignore` accordingly.

## 6.7.5 Dependency and lockfile cleanup

For each language ecosystem:

- identify the authoritative manifest and lockfile;
- remove duplicate lockfiles only after determining the actual package manager;
- remove demonstrably unused dependencies;
- pin critical runtime versions;
- preserve SmartAPI dependency compatibility;
- run license/security scans where available;
- do not perform a broad dependency upgrade and architecture rewrite in the same uncontrolled change.

## 6.7.6 Reference validation before archival

Before moving any source/config file:

- search imports and dynamic imports;
- search Compose, shell, Python, Node, Go, systemd, cron and Nginx references;
- search environment files and CI scripts;
- search database functions/triggers if relevant;
- run current tests/build;
- archive in small batches;
- rerun tests after each batch.

Create:

```text
docs/modernisation/06-repository-cleanup-report.md
```

---

# Phase 8 — Test programme

Testing is a required deliverable, not an optional final step.

## 6.8.1 Test environments

Use separate environments:

- local/unit;
- CI/integration with isolated PostgreSQL/NATS;
- staging against a restored copy or safe subset of production data;
- production smoke tests in paper/read-only mode.

Never point automated destructive tests at the live PostgreSQL database.

## 6.8.2 Static and build tests

Run and fix, as applicable:

- formatting;
- linting;
- TypeScript type checking;
- frontend production build;
- Go format/vet/static analysis/tests;
- Python format/lint/type checks/tests;
- SQL migration validation;
- Dockerfile lint/security checks;
- Compose config validation;
- Nginx configuration validation;
- secret scan;
- dependency vulnerability scan;
- clean-checkout build.

## 6.8.3 Unit tests

Cover at least:

- strategy/indicator calculations;
- target ladder evaluation;
- stop-loss logic;
- transaction cost/tax/brokerage calculations;
- order state transitions;
- idempotency decisions;
- risk limits;
- market-hours/calendar logic;
- timezone conversion;
- SmartAPI error normalisation;
- retry classification;
- configuration validation;
- message schema validation;
- database mapping functions;
- frontend state reducers/hooks where relevant.

## 6.8.4 SmartAPI contract and replay tests

Create sanitised fixtures from known-working responses, excluding secrets and personal account information.

Test:

- authentication response parsing;
- token/session-expiry handling;
- WebSocket tick parsing;
- reconnect behaviour;
- symbol-token mapping;
- order request payload generation without submission;
- order acknowledgement parsing;
- rejection parsing;
- modify/cancel payloads;
- order/trade/position/fund reconciliation;
- rate-limit response handling;
- malformed/partial broker messages;
- duplicate broker updates;
- out-of-order updates.

The test suite must make it impossible to call live `placeOrder` accidentally.

## 6.8.5 Database integration tests

Use an isolated restored or test database.

Test:

- migrations from the current schema state;
- additive migration repeatability;
- application startup on existing populated data;
- no automatic reset/seed;
- all critical repository queries;
- transaction rollback;
- outbox/inbox behaviour;
- concurrent order-intent idempotency;
- batch market-data writes;
- partition routing where used;
- sequence continuity;
- database reconnection;
- PgBouncer compatibility if enabled;
- backup and restore scripts;
- data-preservation manifest comparison.

Do not rely on migration downgrade scripts that drop production data. Rollback should prefer application rollback plus compatibility schema.

## 6.8.6 Strategy and backtest parity tests

Choose fixed representative datasets and strategy versions.

Compare old and new outputs for:

- eligible stock selection;
- day-level gates;
- intraday entry signals;
- RSI/MACD/other configured indicators;
- entry prices/timestamps;
- all intraday ladder targets independently;
- swing targets through the configured horizon;
- adverse excursions;
- 30-day maximum favourable excursion;
- 30-day maximum adverse excursion;
- brokerage/charges/tax;
- trade counts;
- P&L and return metrics;
- strategy ranking;
- deterministic rerun results.

Any difference must be classified as:

- intended bug fix;
- precision/rounding difference;
- data-version difference;
- genuine regression;
- unresolved.

Do not silently change expected outputs.

## 6.8.7 API and frontend end-to-end tests

Test through Nginx, not only by calling containers directly.

Cover:

- SPA load and nested route refresh;
- API health;
- authentication if present;
- dashboard data;
- live/replayed WebSocket data;
- strategy list/version display;
- paper trade creation;
- order/trade status display;
- backtest submission/status/result;
- error handling;
- stale-data indication;
- paper/live mode indication;
- browser reconnect after service restart;
- Nginx/API correlation ID visibility.

## 6.8.8 Performance tests

Use the same representative fixtures as the baseline.

Measure:

- market-event decode and normalisation throughput;
- event-to-database latency;
- event-to-UI latency;
- batch insert throughput;
- API p50/p95/p99;
- WebSocket fan-out;
- backtest runtime and memory;
- idle and load CPU/RAM;
- image sizes;
- startup-to-readiness;
- log volume;
- database connection count;
- queue lag and recovery.

Target improvements:

- reduce default long-running service count where responsibilities were duplicated;
- materially reduce default idle memory and total image footprint;
- do not worsen critical API/execution latency;
- improve or maintain market-data throughput;
- avoid unbounded memory growth;
- maintain correctness and data safety.

Where a numerical improvement target cannot be met, document the measured reason rather than manipulating the benchmark.

## 6.8.9 Resilience and failure tests

In paper/replay mode, test:

- SmartAPI disconnect and reconnect;
- broker token expiry;
- NATS restart if used;
- PostgreSQL temporary unavailability;
- execution service restart with pending order intent;
- core API restart;
- Nginx reload/restart;
- duplicate event delivery;
- out-of-order broker updates;
- partial batch-write failure;
- disk-space warning condition;
- high queue lag/backpressure;
- failed migration;
- configuration error;
- webhook/notification outage;
- process termination during backtest;
- host reboot/startup ordering.

Verify that recovery does not duplicate orders, lose durable intents, reset strategy state or corrupt market history.

## 6.8.10 Security and safety tests

Validate:

- no secrets in Git-tracked files;
- no secrets in frontend bundle;
- no secrets in logs;
- internal database/NATS ports not publicly exposed;
- containers run non-root where feasible;
- capabilities are reduced;
- production source files are not bind-mounted;
- default live trading is disabled;
- operator must explicitly enable live mode;
- API cannot bypass execution/risk service;
- SmartAPI cannot be invoked directly by unrelated services;
- audit trail records runtime setting changes;
- Nginx headers and TLS ownership are correct;
- database roles follow least privilege.

## 6.8.11 Data-preservation test

Before and after each migration/cutover:

- run the preservation manifest;
- compare exact counts for critical tables;
- compare partition lists;
- compare min/max timestamps;
- compare sampled deterministic signatures;
- compare sequence values;
- compare important aggregate totals;
- verify latest market/trade records remain accessible;
- verify old backtest results remain viewable;
- verify no schema/table unexpectedly disappeared;
- verify backup restore remains successful.

A deployment must fail if unexplained historical-row loss is detected.

Create:

```text
docs/modernisation/07-test-plan-and-results.md
```

---

# Phase 9 — Deployment design and cutover

## 6.9.1 Deployment environments

Provide configuration and runbooks for:

- development;
- CI/test;
- staging;
- production.

Use the same images across staging and production, with configuration/secrets differing externally.

## 6.9.2 Deployment scripts

Create safe, idempotent scripts or task-runner targets for:

```text
bootstrap
validate-config
build
start
stop-without-volume-removal
status
logs
test
backup
verify-backup
restore-test
migrate
preflight
deploy-staging
smoke-staging
deploy-production
smoke-production
rollback
doctor
```

Do not hide destructive commands behind generic names.

## 6.9.3 Preflight checks

Production deployment must verify:

- correct host and environment;
- correct Git release/tag;
- required disk space;
- Docker/Compose availability;
- current services and project name;
- verified PostgreSQL location and volume;
- recent successful backup;
- successful restore proof within the defined policy;
- data-preservation baseline captured;
- configuration valid;
- required secret files exist with safe permissions;
- Nginx config passes validation;
- images are built/pulled and identified by immutable version;
- migrations are additive and pending status is known;
- default paper/live flags are correct;
- rollback artefacts are available.

## 6.9.4 Staging deployment

Deploy first to staging using:

- restored copy or safely isolated snapshot of PostgreSQL data;
- paper/simulation mode;
- replayed market data;
- no live order permission;
- production-equivalent Nginx routing;
- production-equivalent Compose topology.

Run the full functional, migration, performance, resilience and data-preservation suites.

## 6.9.5 Shadow/compatibility validation

Where practical:

- run new market-data parsing in shadow mode against saved/replayed input;
- compare normalised outputs with the current implementation;
- run new strategy/backtest calculations side-by-side;
- compare API responses;
- compare resource usage;
- keep current production writers authoritative until parity is established;
- never dual-submit broker orders.

## 6.9.6 Production cutover

Use the smallest-risk cutover based on the actual deployment.

Required sequence:

1. Announce/record maintenance or controlled change window if needed.
2. Confirm latest successful database backup and restore proof.
3. Capture data-preservation manifest.
4. Stop or pause only the minimum writers necessary.
5. Apply additive migrations through the single migration job.
6. Start new internal services in paper/no-live mode.
7. Verify health/readiness and database compatibility.
8. Validate market-data and API behaviour.
9. Validate Nginx upstream and SPA/WebSocket paths.
10. Re-run data-preservation checks.
11. Keep live-order submission disabled until operator acceptance.
12. Enable normal ingestion and paper monitoring.
13. Live trading, if ever enabled, must be a separate explicit operator action outside automated tests.
14. Monitor errors, latency, queue lag, database load and broker session state.
15. Preserve old images/configuration for rollback.

## 6.9.7 Rollback

Rollback must not require restoring the database for ordinary application rollback.

Use compatibility migrations and retain old schema/table paths long enough for the previous application version to run.

Rollback procedure should support:

- switch Nginx upstream or redeploy previous image set;
- stop new services without removing volumes;
- restart previous services;
- retain additive schema changes if harmless;
- disable new feature flags;
- reconcile any new order intents/trades;
- verify database preservation;
- restore database only for confirmed corruption, using the validated restore runbook.

Create:

```text
docs/runbooks/deployment.md
docs/runbooks/rollback.md
docs/runbooks/operations.md
docs/runbooks/incident-response.md
```

## 6.9.8 Host startup and operations

Ensure the stack recovers after host reboot.

Use Docker restart policies and, where appropriate, a small systemd unit that starts the intended Compose project. Do not create competing startup methods.

Document:

- start/stop/status;
- safe log access;
- health endpoints;
- backup status;
- database location;
- paper/live mode check;
- kill switch;
- SmartAPI session status;
- Nginx validation/reload;
- queue/worker status;
- disk-space checks;
- common recovery procedures.

---

# Phase 10 — Documentation and handover

Create or update:

```text
README.md
docs/architecture/system-overview.md
docs/architecture/service-boundaries.md
docs/architecture/data-flow.md
docs/architecture/order-lifecycle.md
docs/architecture/database-ownership.md
docs/architecture/configuration-and-secrets.md
docs/architecture/event-contracts.md
docs/runbooks/development-setup.md
docs/runbooks/deployment.md
docs/runbooks/rollback.md
docs/runbooks/database-backup-restore.md
docs/runbooks/operations.md
docs/runbooks/incident-response.md
docs/modernisation/STATUS.md
```

Documentation must match actual commands and actual file names. Test all documented primary commands from a clean checkout or isolated worktree.

---

# 7. Detailed architecture requirements

## 7.1 Order ledger and idempotency

Implement or verify the following durable concepts:

- `order_intent_id` generated before broker submission;
- idempotency key unique across retries;
- strategy version and signal reference;
- requested instrument, side, quantity, order type and price parameters;
- risk-decision record;
- broker request attempt records;
- broker order ID mapping;
- order state history;
- fill/trade records;
- reconciliation state;
- terminal state and reason;
- audit timestamps;
- paper/live mode.

A retry after timeout must first reconcile/search by known identifiers and must not blindly place a second order.

## 7.2 Outbox/inbox

Where cross-service events are used:

- write business state and outbox record in one PostgreSQL transaction;
- relay outbox events with retry and status;
- assign globally unique event IDs;
- make consumers idempotent using an inbox/deduplication record;
- record processing status and last error;
- monitor stuck outbox/inbox records;
- define replay policy;
- retain enough history for audit/recovery.

## 7.3 Strategy versioning

Every signal, paper trade, live order and backtest must point to an immutable strategy version containing:

- strategy identity;
- parameter values;
- indicator definitions;
- entry/exit rules;
- target ladders;
- stop/adverse rules;
- universe/filter version;
- transaction cost assumptions;
- source code/build version where feasible;
- dataset version for backtests;
- creation timestamp and actor.

Editing a strategy creates a new version; it must not mutate historical results.

## 7.4 Time handling

- Store authoritative timestamps in UTC with timezone-aware database types.
- Retain source exchange/broker timestamps separately.
- Present trading-day logic in `Asia/Kolkata`.
- Explicitly test market open/close, holidays, daylight-independent IST behaviour and date boundaries.
- Do not use host-local implicit time.

## 7.5 Backpressure and bounded resources

Every queue, worker pool, retry loop and cache must have:

- configured maximum size;
- timeout;
- overflow/backpressure policy;
- metrics;
- shutdown behaviour;
- retry ceiling or dead-letter handling;
- documented memory impact.

Avoid unlimited in-memory tick accumulation and unlimited log growth.

## 7.6 Health and readiness

Define:

- **liveness:** process/event loop is functioning;
- **readiness:** service can safely accept its intended traffic;
- **dependency status:** database/NATS/SmartAPI state separately reported;
- **degraded mode:** service running but limited, clearly exposed.

The SmartAPI adapter may be live but not ready for trading if authentication/session is invalid. The API may be ready for read-only dashboards even if backtest workers are unavailable. Model these states explicitly.

## 7.7 API compatibility

During migration:

- inventory existing frontend-consumed endpoints;
- capture request/response fixtures;
- preserve paths and payloads where practical;
- use a compatibility layer for changed internals;
- version genuinely incompatible contracts;
- generate/update typed frontend clients;
- test through Nginx.

## 7.8 Notifications/webhooks

If present:

- move notification delivery off the live order request path;
- persist notification jobs/status;
- use retry with limits;
- redact secrets;
- standardise JSON schemas for entry, update, exit and daily summary;
- include correlation IDs and strategy/order references;
- prevent notification failure from changing trade state;
- test payload length and truncation/summary behaviour.

---

# 8. Resource and footprint optimisation checklist

Apply only after measurement and correctness protection.

## 8.1 Service/process reductions

- merge thin CRUD services;
- remove duplicate schedulers;
- remove duplicate API gateways/proxies;
- use one Nginx serving the frontend;
- use one authoritative SmartAPI session boundary;
- use separate workers only for independently scalable/heavy workloads;
- move admin tools to optional profiles;
- stop test/demo services by default.

## 8.2 Memory reductions

- avoid loading full historical datasets in live services;
- stream/chunk backtests;
- use columnar/vectorised processing;
- bound caches and queues;
- reduce worker/process counts to measured need;
- avoid duplicate market-state copies;
- use database-side filtering/aggregation appropriately;
- release large intermediate objects;
- avoid development source maps/watchers in production.

## 8.3 CPU reductions

- incremental indicators for live execution;
- batch database writes;
- avoid tight polling loops;
- use event-driven scheduling;
- remove duplicate decoding/normalisation;
- cache stable reference data with explicit refresh;
- profile before rewriting hot paths;
- use compiled Go only for justified operational bottlenecks;
- use efficient Python libraries for research instead of premature language rewrites.

## 8.4 Image-size reductions

- multi-stage builds;
- minimal runtime images;
- `.dockerignore`;
- no tests/docs/source copied unless required at runtime;
- no Node runtime in Nginx frontend image;
- no compiler/cache in Python runtime image;
- remove duplicate dependency trees;
- use pinned base images.

## 8.5 Database reductions

Do not delete historical business data to claim a smaller footprint.

Instead:

- remove/rotate diagnostic logs under an approved retention policy;
- remove temporary/staging data only after classification;
- compress/archive optional derived exports outside primary tables where appropriate;
- optimise indexes;
- use partitions and retention for explicitly non-authoritative raw telemetry;
- vacuum/reindex only after measurement and with safe operating procedures;
- avoid duplicate ingestion copies.

---

# 9. Git and change-management rules

## 9.1 Commit discipline

Use small, reviewable commits grouped by purpose, for example:

1. baseline tests and documentation;
2. backup/restore tooling;
3. configuration and secret handling;
4. SmartAPI adapter tests/hardening;
5. Compose/Nginx changes;
6. core API consolidation;
7. execution/risk changes;
8. database additive migrations;
9. frontend integration;
10. repository archival/cleanup;
11. deployment/runbooks.

Do not mix broad formatting changes with behavioural rewrites.

## 9.2 No hidden changes

At each phase:

- update `STATUS.md`;
- record migration IDs;
- record test commands and results;
- record performance measurements;
- record archived files;
- record unresolved risk.

Do not silently skip failing tests. Fix them or document a genuine external blocker.

## 9.3 Release artefacts

Create:

- versioned release tag;
- release notes;
- image/version manifest;
- database migration list;
- configuration-change list without secret values;
- backup reference;
- rollback reference.

---

# 10. Required deliverables

The completed work must include all of the following, adapted to actual repository needs.

## 10.1 Review and recommendation

```text
docs/modernisation/00-scope-and-constraints.md
docs/modernisation/01-current-service-catalogue.md
docs/modernisation/02-current-data-flows.md
docs/modernisation/03-baseline-performance.md
docs/modernisation/04-database-backup-and-restore-proof.md
docs/modernisation/05-recommendation-and-target-architecture.md
docs/modernisation/06-repository-cleanup-report.md
docs/modernisation/07-test-plan-and-results.md
docs/modernisation/08-final-performance-comparison.md
docs/modernisation/09-data-preservation-final-report.md
docs/modernisation/STATUS.md
```

## 10.2 Working code and deployment

- updated React/Vite frontend as required;
- retained Nginx production serving and proxying;
- protected SmartAPI adapter;
- consolidated/hardened operational services;
- execution/risk service where required;
- Python research/backtest worker separation;
- PostgreSQL additive migrations;
- NATS/PgBouncer only if justified;
- production Dockerfiles;
- Compose files and profiles;
- health/readiness endpoints;
- typed configuration;
- secret mounts;
- structured logs and metrics;
- backup/restore scripts;
- migration/deploy/rollback scripts;
- test suites;
- archive folder and manifest;
- cleaned `.gitignore` and `.dockerignore`;
- accurate README and runbooks.

## 10.3 Final reports

The final report must state:

- what was retained;
- what was hardened;
- what was merged;
- what was rewritten;
- what was removed;
- what was archived;
- database backup/restore proof;
- pre/post data-preservation comparison;
- SmartAPI compatibility result;
- test results;
- performance/resource comparison;
- deployment status;
- rollback readiness;
- unresolved limitations;
- exact safe commands for normal operation.

---

# 11. Acceptance criteria

The task is complete only when all applicable criteria are met.

## 11.1 Data safety

- verified backup exists outside the repository;
- restore test succeeded;
- PostgreSQL volume/database mapping is documented and pinned safely;
- no critical table/schema/partition was lost;
- data-preservation comparison has no unexplained historical-row loss;
- sequences, constraints, indexes and critical timestamps remain valid;
- existing trade and stock data is readable after deployment;
- old backtest results remain available.

## 11.2 SmartAPI

- working SmartAPI behaviour is preserved;
- contract/replay tests pass;
- credentials are not logged or embedded;
- reconnect/session handling is observable;
- no live order was placed during testing;
- unrelated services cannot bypass the adapter;
- default live trading remains disabled.

## 11.3 Build and deployment

- clean checkout builds successfully;
- production Compose configuration validates;
- Nginx configuration validates;
- core services become healthy/readied in correct order;
- restart/reboot recovery is documented and tested;
- no production source bind mounts;
- no unnecessary public ports;
- no data volume is removed/replaced;
- deployment and rollback commands are tested.

## 11.4 Functionality

- frontend works through Nginx;
- API and WebSocket routes work;
- market data can be processed via replay/safe source;
- paper trade flow works;
- target/stop monitoring works according to captured expected behaviour;
- backtest flow works;
- strategy/backtest parity is documented;
- audit/configuration history remains available.

## 11.5 Performance/resource use

- baseline and final measurements are recorded;
- default container count is reduced where duplication existed;
- idle memory/image footprint is materially improved or justified;
- critical API/execution latency is not worse without a documented reason;
- market ingestion does not show unbounded lag or memory growth;
- backtests operate within configured resource limits;
- logs are bounded.

## 11.6 Repository quality

- active repository layout is understandable;
- obsolete source/configuration is archived with manifest;
- generated clutter is removed and ignored;
- applied migrations and required historic logic are preserved;
- no secrets or database dumps are committed;
- documentation matches actual commands;
- tests pass or external blockers are explicitly documented.

---

# 12. Prohibited shortcuts

Do not:

- replace Nginx;
- rewrite SmartAPI merely for language consistency;
- migrate PostgreSQL to another database;
- create a new empty PostgreSQL volume and call the deployment successful;
- delete historical data to improve size metrics;
- place live orders;
- run destructive tests on production;
- expose database/NATS ports publicly without a validated need;
- introduce Kubernetes;
- introduce Kafka or a large observability stack without evidence;
- create dozens of microservices;
- keep both old and new schedulers active against the same jobs;
- dual-submit broker orders;
- archive applied migrations;
- commit secrets/backups/logs/build artefacts;
- claim tests passed when they were not run;
- suppress errors to make health checks green;
- use sleeps instead of real readiness checks;
- perform unbounded retries;
- alter strategy outputs without parity evidence and documentation;
- remove unknown files before checking references and Git status.

---

# 13. Suggested operational commands and interfaces

Adapt exact commands to the repository, but provide a consistent interface. Prefer a `Makefile`, `justfile` or scripts with self-documenting help.

Example operator interface:

```bash
make help
make validate-config ENV=production
make build
make test
make backup ENV=production
make verify-backup BACKUP_ID=...
make restore-test BACKUP_ID=...
make preflight ENV=staging
make deploy ENV=staging
make smoke ENV=staging
make preflight ENV=production
make deploy ENV=production
make smoke ENV=production
make status ENV=production
make logs SERVICE=execution ENV=production
make doctor ENV=production
make rollback RELEASE=<previous-release> ENV=production
```

The implementation must ensure no command named simply `clean` or `reset` removes PostgreSQL data or Docker volumes.

---

# 14. Final Codex working protocol

Follow this protocol while executing:

1. Inspect before editing.
2. Protect Git state and PostgreSQL data.
3. Create baseline tests and measurements.
4. Write the recommendation.
5. Implement in reversible batches.
6. Run tests after every material batch.
7. Update `STATUS.md` after every phase.
8. Preserve SmartAPI behaviour.
9. Keep Nginx.
10. Default to paper trading.
11. Archive legacy source only after reference validation.
12. Remove generated clutter only after proving reproducibility.
13. Validate from a clean checkout.
14. Deploy to staging first.
15. Perform data-preservation comparison before and after cutover.
16. Provide an actual working deployment and rollback path.
17. Do not stop at recommendations if safe implementation can continue.
18. Be transparent about anything not tested or not accessible.

---

# 15. Required final response format from Codex

At completion, provide a concise executive report with these sections.

## A. Executive Summary

- final architecture and major decisions;
- database preservation result;
- SmartAPI result;
- deployment result;
- material unresolved risk.

## B. Work Completed

- review and recommendation documents;
- services retained/merged/rewritten;
- Nginx and Compose changes;
- database/migration changes;
- repository cleanup/archive;
- tests and performance results.

## C. Verification

Include a compact table:

| Area | Result | Evidence |
|---|---|---|
| PostgreSQL backup | Pass/Fail | report/path reference |
| Restore proof | Pass/Fail | report/path reference |
| Data preservation | Pass/Fail | counts/signature report |
| SmartAPI replay/contract | Pass/Fail | test suite |
| Frontend through Nginx | Pass/Fail | E2E test |
| API/WebSocket | Pass/Fail | integration/E2E test |
| Paper trade flow | Pass/Fail | test reference |
| Backtest parity | Pass/Fail/Qualified | comparison report |
| Compose validation | Pass/Fail | test reference |
| Deployment smoke test | Pass/Fail | staging/production report |
| Rollback test | Pass/Fail | runbook/test reference |
| Resource improvement | Measured result | before/after report |

## D. Files and Commands

List only:

- key documentation paths;
- key deployment/configuration paths;
- archive manifest path;
- normal start/status/backup/deploy/rollback commands.

## E. Limitations and Pending Operator Actions

List only real unresolved items, such as unavailable production credentials, external TLS ownership, operator approval to enable live trading, or a production maintenance action that cannot be executed safely by Codex.

Do not include secret values, raw database dumps, tool noise or unsupported claims.

---

---


# 16. Product UI/UX, authentication and research-workbench extension

This section is mandatory and extends every earlier architecture, data-safety, repository-cleanup, testing and deployment requirement. The existing Home screen remains unchanged. All new or redesigned authenticated pages use the premium light analytical design system defined here and in:

```text
NIFTY_TRADING_PLATFORM_FULL_UI_UX_PRODUCT_SPECIFICATION_V2.0.docx
NIFTY_TRADING_PLATFORM_DESIGN_TOKENS_V2.0.json
NIFTY_TRADING_PLATFORM_SCREEN_CATALOGUE_V2.0.csv
```

Do not start implementing these requirements until the current React/Vite frontend, router, state/query libraries, component framework, chart library, API client, authentication implementation, CSS scope and existing Home route have been inspected and documented.

## 16.1 Product intent

The application is not only a dashboard and not only a backtest runner. It is a modular trading-intelligence and research platform that must support:

- market and sector intelligence;
- any-stock search and Stock 360 analysis;
- OIIS opportunity ranking and execution qualification;
- strategy catalogue and immutable versions;
- visual creation of new strategy combinations;
- quick single-stock backtests;
- advanced point-in-time universe backtests;
- run monitoring, restart and result evidence;
- full trade replay and P-Diagram explanation;
- compatibility-gated strategy comparisons;
- component design-of-experiments and trial governance;
- cash-equity, options and futures workbenches;
- universal paper trading with target-path monitoring;
- data quality, operations, deployment and administration;
- modular addition of future strategies, market events, instruments and execution policies.

The interface must make it easy for a first-time reviewer to determine:

1. What market, stock, strategy, run or position is being viewed.
2. Whether the underlying data and calculation are admissible.
3. Whether a strategy made money after realistic friction.
4. How much risk, drawdown and capital lock were required.
5. Which stocks, sectors, regimes and events helped or hurt.
6. Why the system entered, waited, rejected or produced NO TRADE.
7. What action is justified now: observe, test, compare, paper trade, reject, repair data or seek approval.

## 16.2 Source precedence and design boundary

Use this order when the repository, database, prior specification and narrative disagree:

1. executable code and server-authoritative database results;
2. versioned configuration and run identity;
3. accepted strategy policy and formula specification;
4. accepted UI/API contracts;
5. operator documentation;
6. narrative or visual example.

The supplied ASC application pack is a historical example of consistent navigation, grouped notifications, tile-based module discovery, explicit states, character control and coherent iconography. It is not a reusable brand, layout library or asset source. Its own licence notice states that its designs and assets do not extend to another product. Therefore:

- do not copy its logo, illustrations, icon suite, exact layout, colours, fonts or proprietary assets;
- do not reproduce screenshots or trace its screens;
- use only generic principles such as consistency, state clarity and sustainable navigation;
- create an original NIFTY/trading visual system and original components;
- retain a source and licence register in `docs/ui-ux/SOURCE_AND_LICENCE_REGISTER.md`.

## 16.3 Mandatory audit before UI edits

Create `docs/ui-ux/CURRENT_STATE_UI_AUDIT.md` containing:

- current route map;
- Home route and component boundaries;
- global shell and navigation implementation;
- existing design tokens, CSS variables and raw colour usage;
- current authentication/session implementation;
- current user/role tables and APIs;
- current backtesting screens and API DTOs;
- current market, stock, OIIS, paper-trading, options and futures surfaces;
- loading, empty, stale, error and access-denied states;
- current charting and data-grid libraries;
- current desktop/tablet/mobile behaviour;
- current Lighthouse/accessibility/performance baseline;
- screenshots at 1440x900, 1920x1080, 1024x768 and 430x932;
- exact Home preservation snapshots;
- an explicit gap map against the v2 specification.

Create an ADR for every material deviation from the target rather than silently altering the requirement.

---

# 17. Home preservation and theme isolation

## 17.1 Home screen non-regression rule

The existing Home screen must remain visually and functionally unchanged unless a separate user-approved task changes it.

Implement `HomePreservationGuard` or an equivalent mechanism that proves:

- the Home route is unchanged;
- its component tree is not replaced;
- v2 page-level CSS variables do not leak into Home;
- existing Home navigation, shortcuts, data and behaviour remain intact;
- existing Home API calls and deep links remain compatible;
- screenshots match the accepted baseline within an agreed visual-regression tolerance.

The new theme must be scoped under a wrapper such as:

```html
<div data-ui-generation="trading-v2">...</div>
```

Do not place v2 token overrides on `:root` if that would restyle Home. If shared primitives must be changed, create compatibility variants or route-scoped wrappers.

## 17.2 Light-theme rule

All new or substantially redesigned screens other than the preserved Home route use a light/white analytical workspace:

- page canvas: `#F6F8FC`;
- cards/charts: `#FFFFFF`;
- primary ink: `#0B1220`;
- secondary text: `#5B6575`;
- borders: `#D9E0EA`;
- dark navigation: `#0B1F3A`;
- selected navigation: `#12315A`;
- primary action/selection: `#1E5EFF`;
- positive: `#0A8F5A`;
- negative/failure: `#C9362B`;
- warning/provisional: `#B7791F`;
- options accent: `#6D4AFF`;
- futures accent: `#008AA6`;
- NIFTY benchmark: `#C49016`.

Do not create a black page canvas, dark cards, neon gradients, metallic textures or casino-like animation.

## 17.3 Premium terminal or hacker character

The requested terminal character must come from information density and real system state, not decorative darkness:

- use a clean monospace font only for symbols, prices, quantities, timestamps, hashes and formulas;
- show explicit NSE session state, environment, feed age, queue lag, service health and decision version;
- use concise command-palette actions and keyboard shortcuts;
- use precise IDs, timestamps and state transitions;
- use restrained red/green delta indicators;
- a changed quote may pulse once for 300-600 ms and then become static;
- never continuously blink a table, chart, button, risk banner or price;
- never exceed two flashes per second;
- respect `prefers-reduced-motion` and offer a no-motion setting;
- never communicate pass/fail only by red or green: add icon, label and explanation.

---

# 18. Original design system implementation

## 18.1 Token architecture

Consume `NIFTY_TRADING_PLATFORM_DESIGN_TOKENS_V2.0.json` through a typed token compiler or directly through generated CSS variables. Do not hard-code raw colours in feature components.

Required token layers:

```text
primitive -> semantic -> component -> screen override
```

Required themes:

- `trading-light` - default and only normal theme for new pages;
- `trading-high-contrast` - accessibility mode;
- no general dark theme in this delivery.

Required density modes:

- `comfortable` - default;
- `compact` - data grids and professional terminal use.

## 18.2 Typography

Use:

```text
UI: Inter, Noto Sans or an approved equivalent system sans-serif
Data: JetBrains Mono, IBM Plex Mono, Noto Sans Mono or approved equivalent
```

Rules:

- 22-26 px page titles;
- 24-32 px KPI values;
- 14-16 px normal body text;
- 12-14 px tables, never smaller than 12 px on desktop;
- tabular numerals for prices, percentages and money;
- sentence case for headings and buttons;
- no condensed display font for body/table content;
- avoid truncation where the missing content changes meaning;
- ellipsis requires tooltip and accessible full value;
- use line-height and white space for scanability, not oversized empty canvases.

## 18.3 Components

Build original reusable components, including:

- `AppShellV2`;
- `ContextIdentityStrip`;
- `EnvironmentBadge`;
- `FeedFreshnessBadge`;
- `ResearchStatusBanner`;
- `ValidationGateStrip`;
- `MetricCard`;
- `VerdictPanel`;
- `GoodBadUglyPanel`;
- `DataGrid` with virtualisation and accessible table fallback;
- `FilterBar` with URL persistence;
- `ChartCard` with metric/period/sample contract;
- `StatusPill` with icon and text;
- `FailurePanel` with recovery action;
- `DecisionScorePanel`;
- `ComponentContributionBar`;
- `TargetLadder`;
- `TradeTimeline`;
- `EvidenceDrawer`;
- `CompatibilityBanner`;
- `CommandPalette`;
- `NotificationCentre`;
- `TaskCentre`;
- `AsyncJobProgress`;
- `EmptyState`;
- `StaleState`;
- `AccessDeniedState`;
- `PartialCoverageState`;
- `CensoredOutcomeState`.

Every component must define loading, empty, partial, stale, error, access-denied and success states as applicable.

## 18.4 Chart contract

Every chart must state:

- metric and unit;
- date/time period;
- gross, net, pre-tax or after-tax-reserve status;
- sample size and effective sample if different;
- benchmark and capital assumptions where relevant;
- missing and censored observations;
- source freshness or run identity;
- direction of a heatmap scale;
- whether the view is descriptive, diagnostic, causal or executable.

The client must not recalculate P&L, fees, targets, drawdown, rank, O/X scores or validation verdicts. The browser may format server values and derive only visual state.

---

# 19. Global shell and navigation

## 19.1 Desktop shell

Use a dark navy navigation rail and a white top bar around the light analytical canvas. The shell must show:

- product identity;
- route/module;
- PAPER, SHADOW or LIVE environment;
- NSE session state;
- selected account or research workspace where relevant;
- data/feed age;
- notifications;
- assigned tasks;
- command palette;
- current user and role;
- service degradation indicator only when material.

The first navigation level should remain stable as modules are added. Use expandable groups rather than replacing the entire navigation per module.

Recommended groups:

```text
Home (preserved)
Market
OIIS
Stocks
Strategies
Backtests
Paper Trading
Options
Futures
Research / DOE
Data Quality
Operations
Administration
```

Hide modules by entitlement/role, but never rely on hidden navigation for authorisation. Backend APIs enforce permission and object scope.

## 19.2 Navigation and filter state

- Deep links must restore screen, tab, selected run/trade/stock and non-sensitive filters.
- Use URL query parameters for shareable filters.
- Persist a user's density, visible columns and saved views server-side.
- Never persist secrets, tokens or raw credentials in browser storage or URLs.
- When a user returns from detail to a list, preserve list filters, sort and scroll where practical.
- When the underlying dataset changes materially, show a refresh indicator rather than silently replacing the user's current view.

## 19.3 Responsive model

The primary target is desktop/laptop. Tablet is fully usable. Mobile is for review, alerts and controlled actions, not dense strategy composition.

- 1440x900 and 1920x1080 are primary design targets.
- 1024x768 must remain usable without clipped actions.
- 430x932 must support login, market summary, OIIS summary, run summary, notifications, paper-position review and incident acknowledgement.
- Wide option chains, trade grids and strategy canvases may use horizontal scrolling, but must provide a compact summary or accessible table/card fallback.
- Do not render every chart or row on mobile; prioritise verdict, status, risk and next action.

---

# 20. Identity, authentication and RBAC

## 20.1 Authentication modes

Normal users sign in through Google. The local account is a controlled bootstrap/break-glass administrator only.

Required bootstrap identity:

```text
username: admin
initial one-time password: NiftyPassword1#
```

Security handling for the initial password is mandatory:

- never commit it to Git;
- never embed it in a Dockerfile, image, JavaScript bundle, migration or seed SQL;
- never place it in a normal `.env` committed or copied into an image;
- supply it through a Docker secret or a root-readable bootstrap secret file;
- use it only if no local administrator already exists;
- hash it with Argon2id or the repository's stronger approved password mechanism;
- mark the account `must_change_password=true`;
- force password replacement before any platform route is accessible;
- invalidate and remove the bootstrap secret after successful reset;
- require TOTP or passkey enrolment for the local administrator after first reset where feasible;
- rate-limit and audit all local-admin attempts;
- never reveal whether a non-admin username exists;
- never log password fields, hashes, ID tokens, access tokens or recovery codes.

If the first-admin creation command is rerun after an admin exists, it must exit without resetting the password unless an explicit, separately audited recovery workflow is invoked.

## 20.2 Google sign-in

Implement or retain standards-compliant Google OIDC/Identity Services integration:

- verify ID tokens on the backend;
- validate issuer, audience, expiry, nonce/state and signature;
- use the provider `sub` as the stable external identity key;
- map access through an invitation, allow-list or controlled organisation policy;
- do not trust a browser-supplied email or role;
- do not grant access solely because an email domain string matches;
- maintain user activation, role, entitlement and object scope in the platform database;
- support disabled users and revoked sessions;
- protect OAuth callback and redirect URIs by environment;
- keep provider secrets server-side;
- show clear recovery for blocked, uninvited, disabled and configuration-error states.

## 20.3 Roles

At minimum implement:

```text
platform_admin
operations_admin
quant_researcher
strategy_reviewer
trader_paper
risk_reviewer
data_engineer
read_only_reviewer
```

Live-trading permission is not part of normal role assignment. Any future live authority must require a separate, explicit entitlement and operational control outside this UI work.

Permissions must be enforced by the backend for:

- routes;
- APIs;
- rows/objects;
- configuration changes;
- strategy publish/deprecate actions;
- paper order creation/cancellation;
- incident and deployment actions;
- exports;
- user and role administration.

## 20.4 Session controls

Implement:

- secure, HttpOnly, SameSite cookies where compatible with the architecture;
- CSRF protection for state-changing cookie-authenticated requests;
- idle and absolute session limits;
- session rotation after authentication and privilege change;
- explicit sign-out and server-side invalidation;
- administrator session listing/revocation;
- draft preservation through session expiry where safe;
- visible environment and identity in every sensitive action;
- step-up confirmation for user/role/config/deployment/destructive actions.

---

# 21. OIIS and strategy semantics that the UI must preserve

## 21.1 OIIS separation

The interface and API must never collapse these fields:

```text
Daily HIGH/MEDIUM/LOW = empirical monitoring/screening level
OFactor = quality of the directional opportunity
XFactor = quality of the current execution
Hard gates = non-negotiable reject/wait controls
Final trade level = weaker of daily and intraday execution level
```

The UI must state that a daily HIGH candidate is not automatically tradable.

Canonical control values remain visible and immutable for the control version:

```text
OFactor full evaluation: 74
OFactor priority/Tier A: 82
XFactor Tier B: 76
XFactor Tier A: 84
```

OFactor and XFactor LONG and SHORT are calculated independently. Do not display SHORT as `100 - LONG`.

No authoritative FFactor exists. Do not create an FFactor field, score, screen or database column unless an accepted formula and version are later supplied.

## 21.2 Decision states

Support and visually distinguish at least:

```text
DATA_INSUFFICIENT
NO_OPPORTUNITY
WATCHLIST
UPGRADE_REQUIRED
SETUP_FORMING
SETUP_ARMED
WAIT_FOR_TRIGGER
TRIGGERED
ENTERABLE_TIER_A
ENTERABLE_TIER_B
WAIT
DO_NOT_CHASE
REJECT_POOR_RR
REJECT_STOP_INVALID
REJECT_NEAR_RESISTANCE
REJECT_NEAR_SUPPORT
REJECT_EXCESSIVE_GAP
REJECT_LIQUIDITY
REJECT_OPTION_CONTRACT
REJECT_EVENT_RISK
SETUP_FAILED
SETUP_EXPIRED
NO_TRADE
```

NO TRADE is a successful system outcome when evidence is inadequate. Do not style it as a software failure.

## 21.3 Entry and exit ownership

For the current long cash-equity OIIS control:

- the strategy decision uses a completed 5-minute trigger;
- fill occurs only at the next executable 1-minute open;
- no signal-candle high/low may be used after an assumed close entry;
- P0 is the original filled price and never moves;
- I030 (+0.30%) is the actual intraday target during the entry session;
- if I030 misses, S100 (+1.00%) is the actual swing target from the next session;
- I050, I070, optional I100, S200, S500 and adverse ladders are diagnostic unless a separately versioned strategy owns them;
- do not exit at the first diagnostic ladder touch;
- do not invent a stop, timeout or liquidation rule;
- an open position at source end remains open and carries net-liquidation/censoring evidence;
- all target and adverse events remain available for path analysis.

A future cash, options or futures strategy may have a different exit contract, but it must own an explicit versioned policy. Never silently reuse this cash-equity exit contract.

## 21.4 Daily shortlist and full evidence

The default OIIS screen may display up to 15 monitoring candidates, but the backend and backtest must retain every candidate, rejection and skipped signal. Display limit is presentation only.

---

# 22. Backtesting, comparison and DOE requirements

## 22.1 Backtest modes

Support:

- any single supported stock;
- supplied stock list;
- point-in-time NIFTY 50 or other accepted universe;
- unconstrained opportunity analysis;
- finite capital of INR 10 lakh with five INR 2 lakh slots;
- finite capital of INR 16 lakh with eight INR 2 lakh slots;
- configurable capital with validated slot/allocation policy;
- cash, options and futures only through their own compatible strategy and data contracts.

No capital reuse while a position is open unless the selected policy explicitly permits it. Persist accepted and rejected opportunities, cash, active positions, daily net-liquidation equity, drawdown and capital-days.

## 22.2 Run identity

Every run and comparison response must include:

```text
strategy_id and strategy_version_id
formula/config versions and hashes
code revision
source data snapshot/hash
point-in-time universe identity
calendar identity
timezone/timestamp convention
corporate-action policy
entry/fill policy
exit policy
cost profile
slippage profile
capital/portfolio policy
benchmark policy
random seed where applicable
requested and actual date/coverage
validation state
```

A run may be `RUN_COMPLETE` and still be `RESEARCH_REJECTED`, `PROVISIONAL` or `NOT_RANKABLE`.

## 22.3 Result tabs

Implement exactly these evidence tabs for one run:

1. Summary
2. Performance
3. Trades
4. Stocks & Sectors
5. Risk & Robustness
6. Market & Regimes
7. Explainability
8. Audit & Data

The Summary tab reads in this order:

```text
identity and validation -> verdict -> Good/Bad/Ugly -> net economics -> risk -> benchmarks -> action
```

## 22.4 Economics

Keep these separate:

- gross P&L;
- brokerage;
- statutory charges;
- slippage;
- pre-tax net;
- user-selected tax-reserve scenario, including the requested 35% view;
- open net-liquidation value;
- realised P&L;
- realised plus open NLV.

Do not model an unsuccessful trade as a fixed loss without an authoritative exit event. Do not present tax reserve as a brokerage charge or broker-calculated tax liability.

## 22.5 Compatibility gate

Do not rank runs unless data snapshot, date range, universe, corporate actions, calendar, capital, fees, slippage, execution, exit, benchmark and validation policies are materially compatible.

If incompatible:

- keep all runs visible;
- show exact differences;
- allow view-only overlays where meaningful;
- remove winner/rank language;
- set status to `NOT_COMPARABLE` or `VIEW_ONLY`.

Use multiple transparent leaderboards rather than one opaque score:

- net economics;
- risk-adjusted return;
- lowest drawdown/tail risk;
- regime robustness;
- stock/sector breadth;
- friction/capacity;
- capital efficiency;
- engineering runtime/resource use.

## 22.6 DOE and factor lab

The DOE interface must separate:

- Layer A: OFactor candidate qualification;
- Layer B: XFactor entry selection conditional on OFactor;
- Layer C: joint strategy and finite-capital result.

Required views:

- validation/progress banner showing executed/planned/failed trials;
- factor effect by response with causal versus descriptive tags;
- signed benefit versus confidence and stability;
- quantity-quality Pareto frontier;
- D+5 and capital-efficiency frontier;
- component interaction and redundancy maps;
- regime and event-shock stability;
- finite-capital equity, drawdown, capital-days and skipped opportunities;
- OFactor/XFactor threshold surfaces and local robustness plateau;
- factor catalogue, levels and constraints;
- immutable trial ledger including failed, rejected and economically poor trials;
- exact evidence/artifact links.

The control experiment includes O74/XB76/XA84. Tier A and Tier B must be independently parameterised subject only to Tier A > Tier B unless an accepted policy says otherwise. Do not hard-code Tier A = Tier B + 8.

Do not claim component importance from aggregate O/X threshold sweeps. Correlation and score variance are descriptive; controlled ablation, interaction and out-of-sample evidence are required for economic claims.

---

# 23. Screen-by-screen implementation contract

The following catalogue is generated from `NIFTY_TRADING_PLATFORM_SCREEN_CATALOGUE_V2.0.csv`. Implement P0 screens first as complete vertical slices. Do not create empty menu items or placeholder cards and call the module complete.

### Administration

#### ADM-001 - Administration hub

- **Route:** `/dashboard/admin`
- **Priority:** P0
- **Primary roles:** Admin
- **Purpose:** Provide role-aware tiles for users, roles, strategy governance, configurations, instruments, integrations, audit and system settings.
- **Required widgets:** Admin tile catalogue; warnings; counts; recent changes
- **Primary actions:** Open module
- **Authoritative data:** Admin APIs
- **Empty/failure states:** Insufficient role; config health unknown
- **Responsive behaviour:** Tile grid
- **Minimum tests:** Role visibility; no direct secret display

#### ADM-002 - Users and access

- **Route:** `/dashboard/admin/users`
- **Priority:** P0
- **Primary roles:** Admin
- **Purpose:** Manage Google identities, local break-glass admin, roles, status and session revocation.
- **Required widgets:** User table; provider; roles; last login; status; sessions
- **Primary actions:** Invite; role change; disable; revoke session
- **Authoritative data:** Identity/RBAC/audit
- **Empty/failure states:** Duplicate email; last admin removal; unverified domain; session revoke fail
- **Responsive behaviour:** Responsive table
- **Minimum tests:** Backend RBAC; audit; last-admin guard

#### ADM-003 - Configuration registry

- **Route:** `/dashboard/admin/configuration`
- **Priority:** P0
- **Primary roles:** Admin; operator; quant lead
- **Purpose:** Manage typed deployment and runtime configuration with version, validation, diff, approval and rollback.
- **Required widgets:** Config list; schema; diff; environment; approval; rollout
- **Primary actions:** Create version; validate; approve; rollback
- **Authoritative data:** Config registry; schemas; audit
- **Empty/failure states:** Secret in config; invalid schema; incompatible rollout; stale editor
- **Responsive behaviour:** Three-pane desktop
- **Minimum tests:** No secret values; optimistic lock; rollback

#### ADM-004 - Instrument and symbol master

- **Route:** `/dashboard/admin/instruments`
- **Priority:** P1
- **Primary roles:** Admin; data engineer
- **Purpose:** Manage securities, aliases, broker tokens, derivative contracts and effective dates without breaking historical identity.
- **Required widgets:** Instrument table; aliases; broker mapping; effective dates; validation
- **Primary actions:** Add alias; correct mapping; import
- **Authoritative data:** Security master; broker tokens
- **Empty/failure states:** Duplicate token; overlapping alias; missing effective date
- **Responsive behaviour:** Virtualised grid
- **Minimum tests:** Historical resolution; no overwrite; import validation

#### ADM-005 - Integrations

- **Route:** `/dashboard/admin/integrations`
- **Priority:** P0
- **Primary roles:** Admin; operator
- **Purpose:** Configure and health-check SmartAPI, Google OAuth, notifications and other external interfaces without exposing secrets.
- **Required widgets:** Integration cards; status; last success; scopes; rotation due
- **Primary actions:** Test connection safely; rotate secret reference; disable
- **Authoritative data:** Integration config; health events
- **Empty/failure states:** Credential missing; OAuth redirect mismatch; rate limit; webhook fail
- **Responsive behaviour:** Cards stack
- **Minimum tests:** Read-only SmartAPI test; secret redaction; fail closed

#### ADM-006 - Audit log

- **Route:** `/dashboard/admin/audit`
- **Priority:** P0
- **Primary roles:** Admin; auditor
- **Purpose:** Search security, configuration, strategy, deployment, data and trading-ledger events with immutable identities.
- **Required widgets:** Audit table; filters; before/after; correlation; actor; source
- **Primary actions:** Open event; export permitted cohort
- **Authoritative data:** Audit/event stores
- **Empty/failure states:** Audit sink delayed; payload redacted; retention boundary
- **Responsive behaviour:** Virtualised table
- **Minimum tests:** No edit/delete; role scope; timezone display

### Backtesting

#### BT-001 - Backtesting hub

- **Route:** `/dashboard/strategy-lab`
- **Priority:** P0
- **Primary roles:** Researcher; reviewer
- **Purpose:** Summarise strategy portfolio, recent runs, alerts, validation blockers and quick-start actions.
- **Required widgets:** Recent runs; statuses; strategy cards; alerts; data-health summary; quick backtest
- **Primary actions:** New run; resume; compare; open report
- **Authoritative data:** Run registry; strategies; data quality
- **Empty/failure states:** No runs; worker unavailable; stale data quality
- **Responsive behaviour:** Dashboard cards; mobile prioritises actions
- **Minimum tests:** Empty state; status reconciliation; access control

#### BT-002 - Quick single-stock backtest

- **Route:** `/dashboard/strategy-lab/quick`
- **Priority:** P0
- **Primary roles:** Trader; researcher
- **Purpose:** Run a governed test for any one stock with minimal fields and explicit assumptions.
- **Required widgets:** Symbol; strategy version; dates; timeframe; capital; cost profile; data preflight
- **Primary actions:** Validate; run; open advanced builder
- **Authoritative data:** Instrument master; strategy registry; data coverage
- **Empty/failure states:** Unsupported symbol; no coverage; invalid date; strategy incompatible
- **Responsive behaviour:** Single-column form mobile
- **Minimum tests:** Validation; no silent defaults; duplicate submission

#### BT-003 - Advanced backtest wizard

- **Route:** `/dashboard/strategy-lab/run`
- **Priority:** P0
- **Primary roles:** Quant researcher
- **Purpose:** Configure strategy, universe, point-in-time data, execution, capital, costs, benchmarks, validation and outputs.
- **Required widgets:** Seven-step wizard; identity summary; preflight; draft autosave; review page
- **Primary actions:** Save draft; validate step; start run
- **Authoritative data:** Server-side config schemas; coverage APIs; policy registry
- **Empty/failure states:** Data gap; universe leakage; cost uncertified; invalid capital; config mismatch
- **Responsive behaviour:** Stepper becomes accordion mobile
- **Minimum tests:** All gates; resume draft; exact run identity; safe cancellation

#### BT-004 - Runs and monitor list

- **Route:** `/dashboard/strategy-lab/runs`
- **Priority:** P0
- **Primary roles:** Researcher; operator
- **Purpose:** Monitor queued/running/completed/failed/cancelled runs and expose progress, ETA, warnings and restart state.
- **Required widgets:** Run table; progress; worker/shard status; filters; warnings; retry eligibility
- **Primary actions:** Open; pause/cancel if safe; resume; clone configuration
- **Authoritative data:** Run/job registry; worker telemetry
- **Empty/failure states:** Worker lost; heartbeat stale; partial shard; cancelled; retry not safe
- **Responsive behaviour:** Virtualised table; mobile cards
- **Minimum tests:** State machine; restart idempotency; no duplicate results

#### BT-005 - Single-run result shell

- **Route:** `/dashboard/strategy-lab/runs/:runId`
- **Priority:** P0
- **Primary roles:** Reviewer; researcher; management
- **Purpose:** Present trust, economics, risk, explanation, stability and action in a fixed eight-tab evidence sequence.
- **Required widgets:** Sticky identity/validation strip; eight tabs; compare/export
- **Primary actions:** Change tab; deep link; compare; export
- **Authoritative data:** Server-authoritative result DTOs
- **Empty/failure states:** Partial run; provisional costs; zero trades; failed validation; censored positions
- **Responsive behaviour:** Tabs scroll; summary cards stack
- **Minimum tests:** URL state; counts reconcile; failure states visible

#### BT-006 - Run summary

- **Route:** `/dashboard/strategy-lab/runs/:runId?tab=summary`
- **Priority:** P0
- **Primary roles:** All reviewers
- **Purpose:** Give a two-minute answer: trustworthy, profitable after friction, risk bounded, where it works and what action is justified.
- **Required widgets:** Verdict; Good/Bad/Ugly; KPI cards; equal-capital benchmarks; cost waterfall; positive/negative timeline
- **Primary actions:** Open evidence; compare; export
- **Authoritative data:** Run summary; benchmarks; costs; validation
- **Empty/failure states:** No verdict inputs; incomplete capital; benchmark unavailable
- **Responsive behaviour:** Cards stack; chart simplification
- **Minimum tests:** Gross/net distinction; benchmark parity; no false winner

#### BT-007 - Performance

- **Route:** `/dashboard/strategy-lab/runs/:runId?tab=performance`
- **Priority:** P0
- **Primary roles:** Researcher; financial analyst
- **Purpose:** Explain equity, drawdown, monthly returns, expectancy, target ladders, holding and capital efficiency.
- **Required widgets:** Equity/drawdown; monthly heatmap; trade distribution; target/adverse ladders; capital-days
- **Primary actions:** Brush period; choose gross/net; open trade cohort
- **Authoritative data:** Daily equity; trades; ladder events
- **Empty/failure states:** Zero trades; open positions; censored horizon; sparse months
- **Responsive behaviour:** Linked charts; mobile limits series
- **Minimum tests:** No first-ladder exit error; event ordering; censored labels

#### BT-008 - Trade explorer within run

- **Route:** `/dashboard/strategy-lab/runs/:runId?tab=trades`
- **Priority:** P0
- **Primary roles:** Researcher; auditor
- **Purpose:** Inspect every signal, skip, entry, target, adverse event, exit/update and open position.
- **Required widgets:** Trade table; signal/skipped tables; filters; status; MFE/MAE; holding; P&L
- **Primary actions:** Open replay; export cohort; compare symbols
- **Authoritative data:** Signals; skipped ledger; trades; events
- **Empty/failure states:** Missing minute data; no next open; duplicate; capital rejection; open at end
- **Responsive behaviour:** Virtualised grid; detail drawer
- **Minimum tests:** Signals-to-trades reconciliation; skip reason; open NLV

#### BT-009 - Stocks and sectors

- **Route:** `/dashboard/strategy-lab/runs/:runId?tab=stocks`
- **Priority:** P0
- **Primary roles:** Researcher; reviewer
- **Purpose:** Show contribution, breadth, concentration, heatmaps, sector dependence and symbol consistency.
- **Required widgets:** Symbol/sector heatmaps; contribution; hit breadth; concentration; sample labels
- **Primary actions:** Open stock; filter sector; exclude for sensitivity
- **Authoritative data:** Stock/sector summaries; PIT mapping
- **Empty/failure states:** Latest-only sector map; low sample; no coverage
- **Responsive behaviour:** Heatmap with table fallback
- **Minimum tests:** Scale and sample visible; PIT mapping; no hidden missing values

#### BT-010 - Risk and robustness

- **Route:** `/dashboard/strategy-lab/runs/:runId?tab=risk`
- **Priority:** P0
- **Primary roles:** Risk manager; researcher
- **Purpose:** Evaluate drawdown, tail loss, path risk, cost/slippage stress, parameter stability and capital lock.
- **Required widgets:** Drawdown; MAE tails; underwater; sensitivity; robustness plateau; stress table
- **Primary actions:** Select stress; open cohort; compare configuration
- **Authoritative data:** Risk summaries; stress runs; H30 paths
- **Empty/failure states:** Insufficient sample; stress missing; unstable neighbourhood
- **Responsive behaviour:** Charts stack; table first mobile
- **Minimum tests:** Tail metrics; cost stress; delayed entry; neighbour stability

#### BT-011 - Market and regimes

- **Route:** `/dashboard/strategy-lab/runs/:runId?tab=regimes`
- **Priority:** P0
- **Primary roles:** Researcher; reviewer
- **Purpose:** Explain when a strategy works across NIFTY/stock direction, VIX, breadth, sectors, events, time and expiry proximity.
- **Required widgets:** Regime matrix; event shocks; time-of-day; VIX; liquidity; monthly consistency
- **Primary actions:** Open cohort; compare regime; export
- **Authoritative data:** Regime/event facts; trade cohorts
- **Empty/failure states:** Regime cell below sample minimum; missing VIX; event overlap
- **Responsive behaviour:** Heatmaps scroll; table fallback
- **Minimum tests:** Sample gating; named shock as context not causal claim

#### BT-012 - Explainability

- **Route:** `/dashboard/strategy-lab/runs/:runId?tab=explain`
- **Priority:** P0
- **Primary roles:** Researcher; auditor
- **Purpose:** Reconstruct strategy logic, decision funnel, factor values and controls for the run and selected trade.
- **Required widgets:** Decision funnel; P-Diagram; component contributions; rejection reasons; formula versions
- **Primary actions:** Select trade; open source; export evidence
- **Authoritative data:** Decision matrix; config/formula hashes
- **Empty/failure states:** Component missing; static factor; contradictory gate
- **Responsive behaviour:** Master-detail; text fallback
- **Minimum tests:** No browser-side business calculation; full traceability

#### BT-013 - Audit and data

- **Route:** `/dashboard/strategy-lab/runs/:runId?tab=audit`
- **Priority:** P0
- **Primary roles:** Auditor; operator; researcher
- **Purpose:** Establish admissibility through engine, data, coverage, economics, portfolio, model and research gates.
- **Required widgets:** Validation gates; requested/actual coverage; lineage; snapshots; hashes; runtime; artifacts; logs
- **Primary actions:** Open artifact; rerun failed shard; download manifest
- **Authoritative data:** Run validations; source identities; artifacts
- **Empty/failure states:** Missing hash; partial session; migration mismatch; artifact absent
- **Responsive behaviour:** Dense tables with horizontal scroll
- **Minimum tests:** A completed run may still fail research; all totals reconcile

#### BT-014 - Trade replay and evidence

- **Route:** `/dashboard/strategy-lab/runs/:runId/trades/:tradeId`
- **Priority:** P0
- **Primary roles:** Researcher; auditor; trader
- **Purpose:** Replay candles, completed trigger, next-bar fill, target/adverse order, diagnostics and context without look-ahead.
- **Required widgets:** Candles; trigger/fill; target/adverse ladder; event timeline; O/X; position state; H30 strip
- **Primary actions:** Step bars; toggle evidence; open decision/P-Diagram
- **Authoritative data:** Minute/daily bars; trade events; decision matrix
- **Empty/failure states:** Missing bars; ambiguous intrabar order; corporate action; open/censored
- **Responsive behaviour:** Desktop replay; mobile read-only summary
- **Minimum tests:** No signal-candle leakage; gap-open ordering; event timestamp accuracy

#### BT-015 - Cross-run trade explorer

- **Route:** `/dashboard/strategy-lab/trades`
- **Priority:** P1
- **Primary roles:** Researcher; auditor
- **Purpose:** Search stock and trade evidence across compatible runs without losing run identity.
- **Required widgets:** Global trade table; run/version filters; symbol/date/regime filters
- **Primary actions:** Open replay; save cohort; export
- **Authoritative data:** Cross-run trade mart
- **Empty/failure states:** Incompatible economics; duplicate event identity
- **Responsive behaviour:** Virtualised grid
- **Minimum tests:** Compatibility label; pagination; deep links

#### BT-016 - Comparison builder

- **Route:** `/dashboard/strategy-lab/comparisons`
- **Priority:** P0
- **Primary roles:** Researcher; reviewer
- **Purpose:** Select runs and test compatibility before any ranking or winner language appears.
- **Required widgets:** Run picker; identity diff; compatibility gates; reason list
- **Primary actions:** Create comparison; view-only incompatible runs
- **Authoritative data:** Run identities; validation; policies
- **Empty/failure states:** Different snapshots/universe/capital/fees/execution; failed run
- **Responsive behaviour:** Wizard mobile
- **Minimum tests:** Material incompatibility removes rank; explicit override impossible

#### BT-017 - Comparison workspace

- **Route:** `/dashboard/strategy-lab/comparisons/:comparisonId`
- **Priority:** P0
- **Primary roles:** Management; researcher; reviewer
- **Purpose:** Compare compatible strategies through transparent economics, risk, robustness, breadth, friction and runtime leaderboards.
- **Required widgets:** Compatibility banner; multiple leaderboards; equity overlay; sector matrix; parameter stability
- **Primary actions:** Change leaderboard; open run; export
- **Authoritative data:** Comparison DTO; compatible run marts
- **Empty/failure states:** Not comparable; zero-trade strategy; low sample; missing benchmark
- **Responsive behaviour:** Tables first; overlays simplified mobile
- **Minimum tests:** No opaque best score; zero-trade remains visible; ranks reconcile

#### BT-018 - Reports and evidence packs

- **Route:** `/dashboard/strategy-lab/reports`
- **Priority:** P1
- **Primary roles:** Researcher; reviewer; operator
- **Purpose:** Generate controlled DOCX/PDF/ZIP/CSV/Parquet exports with run identity, limitations and manifests.
- **Required widgets:** Report catalogue; export job status; artifact list; expiry
- **Primary actions:** Generate; download; revoke link
- **Authoritative data:** Artifact registry; export jobs
- **Empty/failure states:** Renderer failed; artifact missing; partial export; access denied
- **Responsive behaviour:** Responsive list
- **Minimum tests:** Export totals reconcile; no secrets; signed manifest when supported

### Data Quality

#### DQ-001 - Data quality control centre

- **Route:** `/dashboard/strategy-lab/data-quality`
- **Priority:** P0
- **Primary roles:** Data engineer; researcher; operator
- **Purpose:** Show source coverage, freshness, consistency, point-in-time universe, corporate actions, quarantine and admission status.
- **Required widgets:** Coverage matrix; freshness; gaps; source families; PIT membership; corporate actions; quarantine
- **Primary actions:** Open issue; rerun qualification; export gap list
- **Authoritative data:** Data qualification tables; source inventory
- **Empty/failure states:** Source unavailable; stale; unknown family; unresolved timestamp; survivorship risk
- **Responsive behaviour:** Dense responsive tables
- **Minimum tests:** Missing minute becomes skipped signal; no silent admission

#### DQ-002 - Symbol-date coverage

- **Route:** `/dashboard/strategy-lab/data-quality/symbols/:symbol`
- **Priority:** P1
- **Primary roles:** Data engineer; researcher
- **Purpose:** Explain exactly which sessions/intervals are present, partial, quarantined or adjusted for one symbol.
- **Required widgets:** Calendar heatmap; interval coverage; corporate actions; basis checks; aliases
- **Primary actions:** Requalify; open source record
- **Authoritative data:** Bars; calendars; actions; aliases
- **Empty/failure states:** Partial session; zero OHLCV; split mismatch; alias gap
- **Responsive behaviour:** Calendar scroll; list mobile
- **Minimum tests:** Session counts; adjustment identity; timezone

### Futures

#### FUT-001 - Futures market overview

- **Route:** `/dashboard/futures`
- **Priority:** P1
- **Primary roles:** Futures trader; researcher
- **Purpose:** Show contracts, basis, OI, volume, expiry and OIIS alignment.
- **Required widgets:** Contract rank; basis/OI; roll calendar; liquidity; data freshness
- **Primary actions:** Open workbench; run test
- **Authoritative data:** Futures facts; decisions
- **Empty/failure states:** Contract stale; roll mapping missing; margin unavailable
- **Responsive behaviour:** Responsive table
- **Minimum tests:** Expiry identity; basis formula; no cash-policy reuse

#### FUT-002 - Futures workbench

- **Route:** `/dashboard/futures/:underlying`
- **Priority:** P1
- **Primary roles:** Futures trader; risk reviewer
- **Purpose:** Analyse spot-futures basis, OI build-up, contract liquidity, margin, rollover and strategy evidence.
- **Required widgets:** Price/OI chart; contract intelligence; calendar; margin; risk gates
- **Primary actions:** Paper ticket; run futures backtest
- **Authoritative data:** Futures quotes/OI; contract master; margin profile
- **Empty/failure states:** Expiry near; roll risk; insufficient liquidity; stale OI
- **Responsive behaviour:** Two-column; mobile summary
- **Minimum tests:** Contract/expiry exactness; margin-aware capital; no silent roll

#### FUT-003 - Futures backtest builder

- **Route:** `/dashboard/strategy-lab/futures/run`
- **Priority:** P2
- **Primary roles:** Quant researcher
- **Purpose:** Run a dedicated, versioned futures policy with margin, roll and expiry rules.
- **Required widgets:** Underlying strategy; futures confirmation; roll rule; margin; costs; fill
- **Primary actions:** Validate; run
- **Authoritative data:** Historical futures; policy registry
- **Empty/failure states:** Missing roll; no next contract; margin model uncertified
- **Responsive behaviour:** Wizard
- **Minimum tests:** Policy isolation; roll event ordering; finite capital

### Home

#### HOME-001 - Existing Home screen

- **Route:** `/dashboard/home`
- **Priority:** P0
- **Primary roles:** Authenticated users
- **Purpose:** Preserve the current Home screen exactly as the accepted visual and navigation baseline.
- **Required widgets:** Existing implementation only
- **Primary actions:** Existing actions only
- **Authoritative data:** Existing APIs
- **Empty/failure states:** Existing behaviour; no new failure interpretation
- **Responsive behaviour:** Unchanged
- **Minimum tests:** Visual regression; route parity; CSS isolation

### Identity

#### AUTH-001 - Login and access selection

- **Route:** `/login`
- **Priority:** P0
- **Primary roles:** All
- **Purpose:** Authenticate normal users through Google and expose a controlled local-admin route.
- **Required widgets:** Brand mark; Google button; local-admin form; environment label; support link
- **Primary actions:** Google sign-in; local-admin sign-in
- **Authoritative data:** OIDC configuration; local identity store
- **Empty/failure states:** OAuth unavailable; account not allowed; local route disabled; rate limit; clock skew
- **Responsive behaviour:** Single centred card; no horizontal scroll
- **Minimum tests:** OIDC nonce/state; invalid token; keyboard; 200% zoom; forced reset

#### AUTH-002 - Administrator password reset

- **Route:** `/auth/first-login`
- **Priority:** P0
- **Primary roles:** Local admin
- **Purpose:** Force the bootstrap administrator to replace the one-time secret before any platform access.
- **Required widgets:** Password rules; strength guidance; confirm field; recovery warning
- **Primary actions:** Set new password; cancel and sign out
- **Authoritative data:** Local identity and password policy
- **Empty/failure states:** Secret file missing; password reused; weak password; update conflict
- **Responsive behaviour:** Narrow form; mobile-safe validation summary
- **Minimum tests:** Argon2id hash; one-time credential invalidation; no password in logs

#### AUTH-003 - Google sign-in callback

- **Route:** `/auth/callback`
- **Priority:** P0
- **Primary roles:** Google users
- **Purpose:** Complete backend-verified Google identity exchange without exposing tokens in URLs or logs.
- **Required widgets:** Progress state; organisation check; error recovery
- **Primary actions:** Continue; retry; contact administrator
- **Authoritative data:** Google ID token; invite/allow-list; role mapping
- **Empty/failure states:** Expired token; invalid audience/issuer; uninvited account; missing email
- **Responsive behaviour:** Full-screen progress; accessible status
- **Minimum tests:** Token verification; CSRF/state; replay rejection; error redaction

#### AUTH-004 - Session expired

- **Route:** `/auth/session-expired`
- **Priority:** P0
- **Primary roles:** All
- **Purpose:** Protect unsaved work and guide reauthentication without silent action loss.
- **Required widgets:** Expiry explanation; draft status; sign-in action
- **Primary actions:** Reauthenticate; discard draft
- **Authoritative data:** Session and draft store
- **Empty/failure states:** Server unavailable; draft save failed
- **Responsive behaviour:** Modal on desktop; full page on mobile
- **Minimum tests:** Idle timeout; absolute timeout; draft restoration

### Market Intelligence

#### MKT-001 - Market overview

- **Route:** `/dashboard/market`
- **Priority:** P0
- **Primary roles:** Trader; researcher; reviewer
- **Purpose:** Show market regime, NIFTY/VIX, breadth, sectors, flows, events and data freshness before stock selection.
- **Required widgets:** Regime banner; NIFTY/VIX cards; breadth; sector heatmap; event strip; feed health
- **Primary actions:** Open sector; open OIIS scan; pin event
- **Authoritative data:** Market summaries; index/sector/VIX; regime snapshots
- **Empty/failure states:** Stale feed; partial breadth; market closed; event source unavailable
- **Responsive behaviour:** Cards stack; heatmap scrolls horizontally with table fallback
- **Minimum tests:** Freshness; market-closed; partial data; WebSocket reconnect

#### MKT-002 - Sector 360

- **Route:** `/dashboard/market/sectors/:sectorId`
- **Priority:** P1
- **Primary roles:** Trader; researcher
- **Purpose:** Explain leadership, money flow, constituents, relative strength and regime sensitivity for one sector.
- **Required widgets:** Sector chart; constituent rank; breadth; flow; event list; comparison
- **Primary actions:** Open stock; add sector filter; run list backtest
- **Authoritative data:** Sector indices; membership; daily/minute features
- **Empty/failure states:** No sector proxy; latest mapping only; sparse history
- **Responsive behaviour:** Two-column desktop; single-column tablet
- **Minimum tests:** Point-in-time mapping; empty sector; sorting and filters

### Notifications

#### NTF-001 - Notifications and tasks

- **Route:** `/dashboard/notifications`
- **Priority:** P1
- **Primary roles:** All
- **Purpose:** Group trade updates, data/operations alerts, announcements and user-owned tasks with deep links and acknowledgement.
- **Required widgets:** Notification groups; tasks; filters; unread counts; delivery state
- **Primary actions:** Open; acknowledge; mute rule; dismiss permitted
- **Authoritative data:** Notification store; task assignments
- **Empty/failure states:** Delivery fail; stale deep link; permission changed
- **Responsive behaviour:** Drawer desktop; full page mobile
- **Minimum tests:** Group counts; read state per user; retry state

### OIIS

#### OIIS-001 - OIIS opportunity board

- **Route:** `/dashboard/oiis`
- **Priority:** P0
- **Primary roles:** Trader; researcher; reviewer
- **Purpose:** Rank daily HIGH/MEDIUM/LOW monitoring candidates while displaying canonical O/X permission and no-trade states separately.
- **Required widgets:** Market state; ranked candidates; O/X scores; direction; setup state; hard gates; data quality
- **Primary actions:** Open decision; add watch; create paper ticket; run backtest
- **Authoritative data:** OIIS decision snapshots; market/sector context; data quality
- **Empty/failure states:** No candidates; stale O/X; directional conflict; data insufficient
- **Responsive behaviour:** Master-detail; virtualised candidate list
- **Minimum tests:** O<74 cannot enter; high X cannot rescue low O; zero candidates

#### OIIS-002 - OIIS decision evidence

- **Route:** `/dashboard/oiis/decisions/:decisionId`
- **Priority:** P0
- **Primary roles:** Trader; researcher; auditor
- **Purpose:** Reconstruct the exact point-in-time OIIS decision, component contributions, penalties, hard gates, trigger and versions.
- **Required widgets:** OFactor long/short; XFactor long/short; components; penalties; setup state; trigger; entry zone; targets; versions
- **Primary actions:** Open stock; replay; export evidence; create paper ticket when allowed
- **Authoritative data:** Immutable decision matrix; formula/config/data hashes
- **Empty/failure states:** Missing component; stale evidence; hard gate; setup failed/expired; option rejected
- **Responsive behaviour:** Tabbed detail; sticky identity strip
- **Minimum tests:** Long/short independence; version traceability; failure code exactness

#### OIIS-003 - Live and historical P-Diagram

- **Route:** `/dashboard/p-diagram`
- **Priority:** P0
- **Primary roles:** Researcher; auditor; reviewer
- **Purpose:** Show inputs, system, controls, noise factors, intended output, error states and observed outcome.
- **Required widgets:** Input/system/control/noise/output lanes; factor trace; source/time/version/freshness; observed path
- **Primary actions:** Switch live/historical; open source; compare decisions
- **Authoritative data:** Decision matrix; event path; outcomes
- **Empty/failure states:** Evidence missing; source unavailable; outcome censored
- **Responsive behaviour:** Scrollable lanes; text fallback
- **Minimum tests:** Every factor traceable; no browser calculation; historical outcome match

### Operations

#### OPS-001 - Operations overview

- **Route:** `/dashboard/operations`
- **Priority:** P0
- **Primary roles:** Operator; admin
- **Purpose:** Give operators one view of Nginx, frontend, APIs, workers, SmartAPI adapter, PostgreSQL, queues, data feeds and backups.
- **Required widgets:** Service health; readiness; latency; resource use; queue lag; feed age; backup status
- **Primary actions:** Open service; run safe diagnostic; acknowledge incident
- **Authoritative data:** Health/metrics; deployment registry
- **Empty/failure states:** Dependency down; partial outage; unknown health; backup stale
- **Responsive behaviour:** Responsive cards
- **Minimum tests:** Health semantics; no secret exposure; degraded mode

#### OPS-002 - Incident detail

- **Route:** `/dashboard/operations/incidents/:incidentId`
- **Priority:** P1
- **Primary roles:** Operator; admin; auditor
- **Purpose:** Correlate alerts, logs, traces, deployment changes, affected jobs and recovery actions.
- **Required widgets:** Timeline; affected services; evidence; runbook; actions; audit
- **Primary actions:** Execute allowed runbook; add note; close incident
- **Authoritative data:** Incident/audit/log indexes
- **Empty/failure states:** Logs unavailable; action failed; incident duplicate
- **Responsive behaviour:** Timeline stacks
- **Minimum tests:** Permissioned actions; audit; correlation IDs

#### OPS-003 - Deployments and rollback

- **Route:** `/dashboard/operations/deployments`
- **Priority:** P0
- **Primary roles:** Operator; admin
- **Purpose:** Show release identity, migration state, preflight, smoke tests, data preservation and rollback eligibility.
- **Required widgets:** Release list; gates; migration; data signatures; smoke tests; rollback status
- **Primary actions:** Preflight; deploy staged; rollback with reason
- **Authoritative data:** Deployment registry; tests; DB signatures
- **Empty/failure states:** Backup unverified; migration fail; smoke fail; rollback blocked
- **Responsive behaviour:** Table plus detail
- **Minimum tests:** No deploy without backup/restore proof; rollback test

### Options

#### OPT-001 - Options market overview

- **Route:** `/dashboard/options`
- **Priority:** P1
- **Primary roles:** Options trader; researcher
- **Purpose:** Show optionable underlyings, expiry health, IV regime, liquidity and OIIS-qualified opportunities.
- **Required widgets:** Underlying rank; expiry cards; IV/OI map; data freshness; contract rejects
- **Primary actions:** Open workbench; run option backtest
- **Authoritative data:** Options chain/snapshots; OIIS decisions
- **Empty/failure states:** Chain stale; missing Greeks; illiquid contracts; market closed
- **Responsive behaviour:** Table/card hybrid
- **Minimum tests:** Underlying qualification separate from contract quality

#### OPT-002 - Options workbench

- **Route:** `/dashboard/options/:underlying`
- **Priority:** P1
- **Primary roles:** Options trader; risk reviewer
- **Purpose:** Analyse chain, strikes, Greeks, spread/depth, payoff and contract quality after underlying qualification.
- **Required widgets:** Chain grid; expiry/strike filters; Greeks; OI/volume; contract gate; payoff builder
- **Primary actions:** Select contract; build spread; paper ticket; backtest
- **Authoritative data:** Options snapshots; underlying decision; cost/margin profiles
- **Empty/failure states:** Poor contract; no alternative; stale chain; expiry unsupported
- **Responsive behaviour:** Wide grid horizontal; mobile summary only
- **Minimum tests:** Contract rejection does not reject underlying; quote freshness

#### OPT-003 - Options backtest builder

- **Route:** `/dashboard/strategy-lab/options/run`
- **Priority:** P2
- **Primary roles:** Quant researcher; options trader
- **Purpose:** Backtest versioned option selection and payoff rules against historical chain availability.
- **Required widgets:** Underlying strategy; expiry/strike rule; fill/slippage; Greeks; capital/margin; data coverage
- **Primary actions:** Validate; run
- **Authoritative data:** Historical option chain; selection policy
- **Empty/failure states:** No historical chain; survivorship strikes; spread unavailable
- **Responsive behaviour:** Wizard
- **Minimum tests:** No synthetic fill without label; contract identity; expiry calendar

### Paper Trading

#### PT-001 - Paper trading dashboard

- **Route:** `/dashboard/paper-trading`
- **Priority:** P0
- **Primary roles:** Trader; operator; reviewer
- **Purpose:** Show daily paper performance, active slots, orders, positions, targets, drawdown and notification health.
- **Required widgets:** Mode banner; capital/slots; positions; order state; daily summary; webhook health
- **Primary actions:** New ticket; open position; reconcile; close only by policy
- **Authoritative data:** Paper order ledger; marks; notifications
- **Empty/failure states:** Market data stale; webhook fail; position mismatch; source end open
- **Responsive behaviour:** Responsive dashboard
- **Minimum tests:** No live authority; mark-to-market; daily reconciliation

#### PT-002 - Paper entry ticket

- **Route:** `/dashboard/paper-trading/ticket`
- **Priority:** P0
- **Primary roles:** Trader
- **Purpose:** Create a paper order only from an eligible strategy decision and risk-approved position plan.
- **Required widgets:** Decision identity; instrument; quantity; fill model; targets; hard gates; risk; confirmation
- **Primary actions:** Submit paper order; save draft
- **Authoritative data:** Decision snapshot; position sizing; paper ledger
- **Empty/failure states:** Decision stale; hard gate; capital slot unavailable; duplicate order
- **Responsive behaviour:** Form stacks mobile
- **Minimum tests:** Idempotency; stale decision rejection; exact targets

#### PT-003 - Paper orders

- **Route:** `/dashboard/paper-trading/orders`
- **Priority:** P0
- **Primary roles:** Trader; operator
- **Purpose:** Track intent, validation, simulated submission, acknowledgement, fill, modification/cancel eligibility and reconciliation.
- **Required widgets:** Order state table; idempotency key; timestamps; reasons; reconciliation
- **Primary actions:** Open order; cancel if policy permits; retry notification
- **Authoritative data:** Paper order ledger; outbox/inbox
- **Empty/failure states:** Duplicate; outbox backlog; no fill price; state divergence
- **Responsive behaviour:** Virtualised table
- **Minimum tests:** State machine; duplicate prevention; restart recovery

#### PT-004 - Paper position evidence

- **Route:** `/dashboard/paper-trading/positions/:positionId`
- **Priority:** P0
- **Primary roles:** Trader; reviewer
- **Purpose:** Monitor targets and diagnostics independently, capital occupancy, mark-to-market and exit/update contract.
- **Required widgets:** Entry; current mark; target ladder; adverse ladder; MFE/MAE; capital-days; events
- **Primary actions:** Open replay; export; add note
- **Authoritative data:** Position/trade events; bars; marks
- **Empty/failure states:** Source end open; missing mark; target ambiguity; stale data
- **Responsive behaviour:** Master-detail
- **Minimum tests:** No exit at first diagnostic target; open NLV; event ordering

### Research DOE

#### DOE-001 - Factor and experiment lab

- **Route:** `/dashboard/strategy-lab/doe`
- **Priority:** P0
- **Primary roles:** Quant researcher; auditor
- **Purpose:** Govern component ablations, interactions, weights, gates, thresholds, folds, regimes and finite-capital trials.
- **Required widgets:** Experiment plan; validation banner; trial status; factor catalogue; response selection
- **Primary actions:** Create plan; run allowed trial; freeze design; open ledger
- **Authoritative data:** Experiment/trial registry; decision matrix
- **Empty/failure states:** Design incomplete; holdout touched; insufficient sample; blocked factor
- **Responsive behaviour:** Desktop analytical layout; read-only mobile
- **Minimum tests:** Canonical control included; Tier A/B independent; holdout protection

#### DOE-002 - Factor effects

- **Route:** `/dashboard/strategy-lab/doe/effects`
- **Priority:** P0
- **Primary roles:** Quant researcher
- **Purpose:** Show Layer A candidate, Layer B conditional-entry and Layer C joint-strategy effects separately with causal/descriptive labels.
- **Required widgets:** Effect plot; confidence/stability; response selector; layer selector; regime breakdown
- **Primary actions:** Open trial pair; export; flag redundancy
- **Authoritative data:** Trial effects; event outcomes
- **Empty/failure states:** Only aggregate scores; missing component rerun; low effective sample
- **Responsive behaviour:** Chart plus table
- **Minimum tests:** No causal claim from correlation; layer separation

#### DOE-003 - Interaction and redundancy map

- **Route:** `/dashboard/strategy-lab/doe/interactions`
- **Priority:** P1
- **Primary roles:** Quant researcher
- **Purpose:** Expose duplicate/static components, interactions and cluster experiments before weight optimisation.
- **Required widgets:** Correlation/redundancy map; 2x2 interaction; cluster tests; static factor warnings
- **Primary actions:** Open component; schedule experiment
- **Authoritative data:** Component samples; trial matrix
- **Empty/failure states:** Constant component; identical proxy; sparse interaction cell
- **Responsive behaviour:** Heatmap plus accessible matrix
- **Minimum tests:** SIS/TCS; LTS/LSQ; cluster test fixtures

#### DOE-004 - Quantity-quality and capital frontiers

- **Route:** `/dashboard/strategy-lab/doe/frontiers`
- **Priority:** P1
- **Primary roles:** Quant researcher; management
- **Purpose:** Visualise Pareto trade-offs among trade count, clean target, MFE/MAE, D+5, capital-days, drawdown and net economics.
- **Required widgets:** Pareto plot; finite-capital overlays; confidence intervals; selected configuration card
- **Primary actions:** Select point; compare neighbours; export
- **Authoritative data:** Trial result vectors; portfolio runs
- **Empty/failure states:** Dominated all trials; open NLV; provisional costs
- **Responsive behaviour:** Chart and sortable table
- **Minimum tests:** Effective sample intervals; no single-metric winner

#### DOE-005 - Threshold surfaces and robustness plateau

- **Route:** `/dashboard/strategy-lab/doe/thresholds`
- **Priority:** P1
- **Primary roles:** Quant researcher
- **Purpose:** Test OFactor, XFactor Tier B and Tier A independently and identify broad stable regions rather than sharp optima.
- **Required widgets:** Response surface; slice controls; canonical point; neighbour stability; fold selector
- **Primary actions:** Pin candidate; open trials; compare folds
- **Authoritative data:** Threshold DOE trials
- **Empty/failure states:** Sparse surface; Tier A≤Tier B; holdout leakage
- **Responsive behaviour:** Desktop first; table fallback
- **Minimum tests:** O74/X76/X84 included; no fixed +8 assumption

#### DOE-006 - Immutable trial ledger

- **Route:** `/dashboard/strategy-lab/doe/trials`
- **Priority:** P0
- **Primary roles:** Researcher; auditor
- **Purpose:** Retain successful, failed, rejected and poor trials with exact identities, reasons and full result vector.
- **Required widgets:** Ledger; config/data/code hashes; fold/regime; status; failure reason; artifacts
- **Primary actions:** Open; clone as new trial; export
- **Authoritative data:** Trial registry; artifacts
- **Empty/failure states:** Missing identity; incomplete output; failed shard; rejected design
- **Responsive behaviour:** Virtualised grid
- **Minimum tests:** No deletion; exact identity; failed trial visibility

### Stocks

#### STK-001 - Stock explorer

- **Route:** `/dashboard/stocks`
- **Priority:** P0
- **Primary roles:** All analysts
- **Purpose:** Search any supported stock and review price, data quality, strategy coverage and recent decisions.
- **Required widgets:** Search; filters; watchlists; compact market cards; strategy badges
- **Primary actions:** Open Stock 360; quick backtest; add watchlist
- **Authoritative data:** Instrument master; latest quote; feature snapshots
- **Empty/failure states:** Unknown alias; delisted/suspended; missing minute data
- **Responsive behaviour:** Virtualised list; mobile cards
- **Minimum tests:** Alias resolution; pagination; unsupported symbol

#### STK-002 - Stock 360

- **Route:** `/dashboard/stocks/:symbol`
- **Priority:** P0
- **Primary roles:** Trader; researcher; reviewer
- **Purpose:** Provide one coherent stock-level view across price, fundamentals/context, OIIS, strategies, events, futures/options and historical outcomes.
- **Required widgets:** Candles; indicators; O/X; regime; events; target ladders; recent backtests; derivatives availability
- **Primary actions:** Run quick/advanced backtest; open derivatives; paper trade; compare
- **Authoritative data:** Daily/minute OHLCV; features; decisions; events; derivative facts
- **Empty/failure states:** Stale quote; corporate action unresolved; no F&O; partial history
- **Responsive behaviour:** Chart first; lower panels collapse on mobile
- **Minimum tests:** Point-in-time evidence; lazy minute load; cross-tab identity

#### STK-003 - Watchlists and revalidation

- **Route:** `/dashboard/watchlists`
- **Priority:** P1
- **Primary roles:** Trader; researcher
- **Purpose:** Maintain reasoned watchlists with expiry, source decision, upgrade conditions and current revalidation.
- **Required widgets:** Lists; reason; state transition; expiry; alert rule
- **Primary actions:** Create list; add/remove; revalidate; export
- **Authoritative data:** Watchlist versions; live decisions
- **Empty/failure states:** Decision expired; symbol inactive; stale revalidation
- **Responsive behaviour:** Table desktop; cards mobile
- **Minimum tests:** State transition; permission; stale badge

### Strategies

#### STR-001 - Strategy catalogue

- **Route:** `/dashboard/strategy-lab/strategies`
- **Priority:** P0
- **Primary roles:** Researcher; admin; reviewer
- **Purpose:** List strategy families, immutable versions, validation status, ownership and permitted instruments.
- **Required widgets:** Catalogue; filters; version status; instrument badges; validation gates; run counts
- **Primary actions:** Open; fork; compare; deprecate with reason
- **Authoritative data:** Strategy/version registry; validation results
- **Empty/failure states:** Missing implementation; incompatible version; deprecated dependency
- **Responsive behaviour:** Responsive table; compact cards
- **Minimum tests:** Version immutability; role controls; zero-run strategy

#### STR-002 - Strategy detail

- **Route:** `/dashboard/strategy-lab/strategies/:versionId`
- **Priority:** P0
- **Primary roles:** Researcher; reviewer
- **Purpose:** Explain exact rule, entry ownership, exit policy, costs, capital, data prerequisites and validation evidence.
- **Required widgets:** Plain rule; JSON/YAML; parameters; dependencies; test status; run history; P-Diagram
- **Primary actions:** Fork; run; compare; export contract
- **Authoritative data:** Strategy registry; config; tests; policies
- **Empty/failure states:** Unresolved policy; missing data source; invalid configuration
- **Responsive behaviour:** Tabbed detail
- **Minimum tests:** Schema validation; policy resolution; hash display

#### STR-003 - OIIS strategy studio

- **Route:** `/dashboard/strategy-lab/oiis-studio/:versionId`
- **Priority:** P0
- **Primary roles:** Quant researcher; admin
- **Purpose:** Expose OIIS components, thresholds, hard gates, horizons and outputs without conflating daily screening with entry permission.
- **Required widgets:** OFactor/XFactor editors; locked control values; component metadata; direction/horizon; diff; validation
- **Primary actions:** Fork research version; save draft; validate; run DOE
- **Authoritative data:** OIIS formula/config registry
- **Empty/failure states:** Weights do not sum; mandatory component missing; gate conflict; unsupported horizon
- **Responsive behaviour:** Three-pane desktop; sequential mobile
- **Minimum tests:** Canonical lock; long/short independence; threshold ordering

#### STR-004 - Visual combination strategy builder

- **Route:** `/dashboard/strategy-lab/composer`
- **Priority:** P1
- **Primary roles:** Quant researcher
- **Purpose:** Create modular AND/OR combinations from approved strategy blocks while preserving deterministic JSON and version identity.
- **Required widgets:** Node canvas; condition groups; timeframe; universe; entry/exit policy; validation; generated JSON
- **Primary actions:** Add block; group; simulate; save draft; publish version
- **Authoritative data:** Strategy block catalogue; schemas; policy registry
- **Empty/failure states:** Circular logic; incompatible timeframe; missing exit; unbounded expression
- **Responsive behaviour:** Canvas desktop; list editor fallback mobile
- **Minimum tests:** Cycle detection; deterministic serialisation; undo/redo; accessibility fallback

#### STR-005 - Advanced rule editor

- **Route:** `/dashboard/strategy-lab/composer/code`
- **Priority:** P2
- **Primary roles:** Quant researcher; developer
- **Purpose:** Allow controlled YAML/JSON editing with schema, lint and visual diff for expert users.
- **Required widgets:** Code editor; schema errors; preview; diff; generated test cases
- **Primary actions:** Validate; format; apply to draft
- **Authoritative data:** Versioned schema; block catalogue
- **Empty/failure states:** Parse error; unknown field; unsafe expression; policy mismatch
- **Responsive behaviour:** Desktop-only recommended; read-only mobile
- **Minimum tests:** Round-trip composer parity; invalid input; no code execution in browser

# 24. Failure-mode and recovery contract

Do not use a generic red toast as the only failure treatment. Every important failure has detection, user-visible state, safety action, recovery and an automated test. Persist reason codes server-side.

| Domain | Failure | Detection | Required UI and safety behaviour | Recovery | Minimum proof |
|---|---|---|---|---|---|
| Authentication | Google provider unavailable | Callback/network error and provider health | Show retry and local-admin route only to authorised operators; preserve requested route | Retry with bounded backoff; operator checks OAuth config | OIDC outage E2E |
| Authentication | Invalid/expired Google token | Backend issuer/audience/expiry/nonce validation | Block access; generic secure message; no token detail | Restart sign-in | Forged, wrong audience and expired tokens |
| Authentication | Uninvited or disabled user | RBAC/invitation lookup | Access denied with support reference; no role leakage | Admin invitation/enablement | Disabled user and invite tests |
| Authentication | Bootstrap admin secret missing | First-admin command/preflight | Fail closed; do not create a default password | Supply Docker secret and rerun explicit bootstrap | Secret absent/present/idempotent |
| Authentication | Bootstrap password not reset | must_change_password flag | Only password reset route is accessible | Complete reset and MFA enrolment | Route restriction and token rotation |
| Session | Session expired during edited draft | 401/session expiry event | Save local/server draft where safe; reauthenticate modal | Restore draft after login | Idle/absolute expiry and draft restore |
| Data | Market feed stale | Quote age exceeds policy | Show STALE; disable new decision/order actions; keep last value timestamped | Reconnect; switch to read-only historical mode | Freshness threshold and recovery |
| Data | Missing minute file/session | Coverage preflight/runner skip | Skipped signal, not a losing trade; visible reason and affected dates | Load/repair source and rerun affected shard | Missing coverage golden test |
| Data | Partial session | Expected versus observed bars | Quarantine or skip per policy; provisional coverage banner | Repair or accept explicit qualified exception | Partial open/midday/close |
| Data | Corporate action unresolved | Action/basis reconciliation | Block affected symbol-date and ranking | Resolve adjustment identity and rerun | Split/bonus mismatch |
| Data | Point-in-time universe unavailable | Membership qualification | Prominent survivorship-risk block; not rankable where required | Load effective-dated membership | Current-universe leakage test |
| Data | Symbol or broker token unresolved | Alias/token resolver | Exclude affected instrument; exact reason; no fallback to similar symbol | Correct effective-dated mapping | Alias collision and token mismatch |
| Strategy | Invalid configuration | Schema and semantic validation | Inline field errors plus summary; no publish/run | Correct draft; compare to control | Weights, thresholds, missing policy |
| Strategy | Unsupported FFactor | Schema rejects unknown authoritative factor | Show undefined terminology; do not calculate | Supply accepted formula/version before adding | FFactor absent test |
| OIIS | Daily HIGH but O<74 | Canonical opportunity gate | UPGRADE_REQUIRED; no paper ticket | Continue monitoring for fresh O upgrade | Golden O gate |
| OIIS | High XFactor with weak OFactor | OFactor eligibility gate | NO_OPPORTUNITY; explain X cannot rescue O | Wait for opportunity evidence | O<65 + high X |
| OIIS | Trigger not completed | Completed 5m close state | WAIT_FOR_TRIGGER; no intrabar entry | Reevaluate after completed bar | No same-candle entry |
| OIIS | Hard gate fails | Gate code and evidence | Exact REJECT/WAIT/DO_NOT_CHASE state; no order event | Show upgrade/invalidation condition | Each hard-gate fixture |
| Backtest | Worker heartbeat lost | Job lease/heartbeat | Run DEGRADED; stop ETA; preserve completed shards | Reclaim only expired lease; resume idempotently | Kill/restart worker |
| Backtest | Run produces zero trades | Completed valid result | Visible zero-trade result; not software failure; include funnel/skips | Adjust research question only through new version/run | Zero-trade run E2E |
| Backtest | Shard fails | Shard status/checkpoint | Run PARTIAL/FAILED; completed data not ranked as complete | Retry only failed/incomplete shard | Atomic outputs and restart |
| Backtest | Source changes during run | Snapshot/hash mismatch | Fail affected run; no mixed-source final result | Create new immutable snapshot and rerun | Source mutation test |
| Backtest | Open position at source end | No exit event by end date | OPEN/CENSORED with NLV and capital-days; no invented close | Refresh when new eligible session closes | Open-at-end golden test |
| Comparison | Runs incompatible | Compatibility diff | View only; remove winner/rank | Rerun under common policy or compare descriptively | Every material identity field |
| Economics | Cost profile provisional | Cost certification status | Mark net economics provisional; retain gross diagnostic | Certify profile and rerun/augment if identities allow | Unknown cost state |
| Options | Underlying passes but selected contract fails | Spread/OI/volume/depth gate | Reject contract, retain underlying opportunity and search alternatives | Choose qualified contract/instrument | Poor option contract fixture |
| Options | Historical chain unavailable | Coverage preflight | Block option P&L; allow underlying-only backtest with clear scope | Load chain or choose cash test | No synthetic fill without label |
| Futures | Roll mapping missing | Contract calendar/roll rule | Block affected rollover path; no silent continuous-contract substitution | Repair mapping and rerun | Expiry/roll fixtures |
| Paper Trading | Duplicate order request | Idempotency key/unique intent | Return existing order state; never create second position | Open existing order | Concurrent duplicate submissions |
| Paper Trading | Capital slot unavailable | Portfolio allocator | Reject/skip with capital reason; do not queue hidden order | Wait for release or create new run policy | Five-slot contention |
| Paper Trading | Webhook/WhatsApp delivery fails | Notification delivery state | Trading ledger remains correct; show notification retry warning | Bounded retry/dead-letter; manual resend | Gateway timeout/retry |
| Broker/SmartAPI | WebSocket disconnect | Adapter readiness and last tick | Market actions fail closed; historical pages remain available | Reconnect with backoff and reconcile subscriptions | Disconnect/reconnect replay |
| Database | PostgreSQL unavailable | Readiness/query error | Read-only cached context only if explicitly safe; no state changes | Restore DB connectivity; replay outbox safely | DB outage and recovery |
| Database | Migration incomplete | Migration lock/version | New release not ready; Nginx keeps previous healthy release where deployment supports it | Rollback or complete validated migration | Migration failure smoke |
| API | Response version incompatible | DTO version negotiation | Block affected widget with contract error; do not guess fields | Deploy compatible API/client or adapter | Contract tests |
| Frontend | Chart dataset too large | Point count/payload budget | Server downsample; lazy load detail; never freeze browser | Drill down on demand | 5000 point limit and memory |
| Frontend | WebSocket reconnect storm | Connection/backoff telemetry | Show degraded live state; use bounded reconnect | Recover after jittered backoff | Network flap test |
| Deployment | Backup or restore proof missing | Preflight gate | Block production cutover | Create backup and isolated restore verification | Deployment preflight |
| Deployment | Smoke test fails | Post-deploy checks | Stop promotion; rollback to last proven release | Rollback and investigate | Automated rollback exercise |
| Security | User attempts unauthorised route/action | Backend RBAC | 403 with no sensitive detail; audit event | Request appropriate role through admin process | Horizontal/vertical privilege tests |
| Security | Secret appears in log/config response | Secret scanner/redaction test | Block release and rotate exposed credential | Redact, rotate, retest | Static and runtime secret tests |


---

# 25. Frontend, API and data implementation rules

## 25.1 Frontend architecture

Use the repository's existing React/Vite architecture where sound. Do not introduce a second frontend application merely to implement the new screens.

Required patterns:

- TypeScript strict mode for new code;
- route-level code splitting;
- typed versioned API clients generated or validated against OpenAPI where practical;
- one server-state/query library rather than ad hoc fetch effects;
- one lightweight UI-state approach for local filters/selections;
- feature folders by domain, not one giant components folder;
- reusable design-system package or folder;
- error boundaries at route and major panel level;
- virtualised grids and lists;
- server-side pagination, filtering, sorting and downsampling for large results;
- WebSocket/SSE only for live deltas and job progress, not full repeated datasets;
- abort stale requests when symbol/run/filter changes;
- cache immutable run/version evidence aggressively by identity;
- do not cache live permission or risk decisions beyond their expiry;
- never put broker-order logic or authoritative P&L calculation in the browser.

Recommended feature structure, adapted to actual repository:

```text
src/
  app/
    shell/
    routing/
    providers/
  design-system/
    tokens/
    components/
    charts/
    states/
  features/
    auth/
    market/
    oiis/
    stocks/
    strategies/
    backtests/
    doe/
    options/
    futures/
    paper-trading/
    data-quality/
    operations/
    admin/
  api/
  contracts/
  test/
```

## 25.2 API requirements

Reconcile paths with existing routes and preserve compatibility. Add versioned DTOs for at least:

```text
GET  /api/v2/auth/me
GET  /api/v2/market/overview
GET  /api/v2/oiis/opportunities
GET  /api/v2/oiis/decisions/{decision_id}
GET  /api/v2/stocks/{symbol}/overview
GET  /api/v2/strategies
GET  /api/v2/strategies/{version_id}
POST /api/v2/backtests/preflight
POST /api/v2/backtests/runs
GET  /api/v2/backtests/runs
GET  /api/v2/backtests/runs/{run_id}
GET  /api/v2/backtests/runs/{run_id}/summary
GET  /api/v2/backtests/runs/{run_id}/performance
GET  /api/v2/backtests/runs/{run_id}/trades
GET  /api/v2/backtests/runs/{run_id}/trades/{trade_id}
GET  /api/v2/backtests/runs/{run_id}/stocks
GET  /api/v2/backtests/runs/{run_id}/risk
GET  /api/v2/backtests/runs/{run_id}/regimes
GET  /api/v2/backtests/runs/{run_id}/explainability
GET  /api/v2/backtests/runs/{run_id}/audit
POST /api/v2/backtests/comparisons
GET  /api/v2/backtests/comparisons/{comparison_id}
GET  /api/v2/doe/plans/{plan_id}
GET  /api/v2/doe/trials
GET  /api/v2/options/{underlying}/chain
GET  /api/v2/futures/{underlying}/contracts
POST /api/v2/paper/orders
GET  /api/v2/paper/orders
GET  /api/v2/paper/positions
GET  /api/v2/operations/health-summary
GET  /api/v2/admin/audit
```

Every response must include `request_id`, API version, generated-at timestamp, source/decision/run identity as applicable and explicit stale/partial/censored flags.

## 25.3 PostgreSQL reuse

Extend existing strategy, validation, candidate, skipped-signal, trade, equity, regime, market-feature, universe and audit structures. Do not create a disconnected UI-only result store.

Create read models/materialised views only where measured queries require them. Every read model must document:

- source tables;
- refresh policy;
- staleness semantics;
- indexes;
- role access;
- reconciliation query;
- rollback/removal procedure.

## 25.4 Nginx

Keep Nginx as required earlier. Add and test:

- SPA fallback only for client routes;
- immutable cache headers for hashed static assets;
- no-cache for `index.html` where required for safe release activation;
- WebSocket/SSE proxy settings;
- API/body/timeout limits appropriate to exports and backtests;
- security headers compatible with Google sign-in and chart workers;
- compression without double compression;
- request correlation ID forwarding;
- no direct exposure of PostgreSQL, NATS, internal workers or admin diagnostics;
- a maintenance/rollback response that does not pretend a failed API is healthy.

---

# 26. UI, authentication and research acceptance tests

## 26.1 Test families

Implement:

- design-token unit tests;
- component-state tests;
- route and permission tests;
- Google OIDC callback and token-validation tests;
- local-admin bootstrap, forced-reset, rate-limit and MFA tests;
- API contract tests;
- PostgreSQL reconciliation tests;
- OIIS golden decision tests;
- backtest entry/target/adverse ordering tests;
- compatibility-gate tests;
- zero-trade, partial-coverage and open-position result tests;
- options-contract and futures-roll negative tests;
- paper-order idempotency and restart tests;
- WebSocket disconnect/reconnect tests;
- Nginx route/cache/WebSocket tests;
- Playwright end-to-end tests;
- accessibility tests;
- visual-regression tests;
- performance/load tests;
- deployment smoke and rollback tests.

## 26.2 Mandatory OIIS golden tests

- Daily HIGH with O below 74 remains UPGRADE_REQUIRED and cannot enter.
- High XFactor cannot rescue O below 65.
- O at or above 74 with X 68-75 returns WAIT, not entry.
- A completed 5-minute trigger fills only at the next executable 1-minute open.
- An intrabar trigger without a completed close does not enter.
- High daily plus medium intraday produces final MEDIUM.
- Every hard-gate failure returns its exact decision and no order/trade event.
- I030 and S100 use gap-open then high-touch ordering where the accepted policy specifies it.
- Missing minute coverage creates a skipped signal, not a failed trade.
- A position open at source end remains open with NLV/censoring evidence.
- Database, API, UI and export counts reconcile.

## 26.3 Visual regression

Capture at least:

```text
1440x900
1920x1080
1024x768
430x932
```

Cover:

- Home unchanged;
- login normal/error/first-reset;
- market overview live/stale/closed;
- OIIS board normal/no-candidates/data-insufficient;
- Stock 360 normal/no-F&O/partial-history;
- strategy studio control/fork/invalid config;
- backtest builder valid/blocked;
- run result good/bad/invalid/zero-trade/open-position;
- comparison compatible/incompatible;
- options contract pass/reject;
- paper ticket eligible/rejected;
- operations healthy/degraded.

## 26.4 Accessibility

Meet WCAG 2.2 AA as an engineering acceptance target:

- keyboard-operable navigation, tabs, grids, menus, dialogs and command palette;
- visible focus;
- 44x44 px touch targets where applicable;
- contrast checks for normal, selected, disabled and error states;
- non-colour status cues;
- screen-reader names for icon controls;
- field-level error links and form error summary;
- semantic headings and landmarks;
- table fallback for charts/heatmaps;
- 200% zoom without loss of function;
- reduced-motion mode.

## 26.5 Performance targets

Measure and document actual infrastructure. Initial targets:

- cached overview API p95 <= 1.5 seconds;
- overview page interactive p95 <= 2.5 seconds on the target internal network;
- paginated trade API p95 <= 1.0 second;
- linked filter/chart response <= 200 ms after data is loaded;
- default plotted points <= 5,000 per series;
- virtualised grids remain responsive with at least 100,000 server-filterable records;
- browser memory remains bounded during 30-minute live monitoring;
- frontend/UI queries do not degrade SmartAPI collector or execution service levels;
- WebSocket reconnect is bounded and jittered;
- no unnecessary full-page rerender on one quote/event update.

Record deviations with evidence rather than altering thresholds silently.

---

# 27. Additional repository deliverables

Create or update:

```text
docs/ui-ux/CURRENT_STATE_UI_AUDIT.md
docs/ui-ux/PRODUCT_INTENT_AND_INFORMATION_ARCHITECTURE.md
docs/ui-ux/AUTHENTICATION_AND_RBAC.md
docs/ui-ux/DESIGN_SYSTEM.md
docs/ui-ux/SCREEN_SPECIFICATIONS.md
docs/ui-ux/FAILURE_MODES_AND_RECOVERY.md
docs/ui-ux/ACCESSIBILITY.md
docs/ui-ux/PERFORMANCE_BUDGET.md
docs/ui-ux/SOURCE_AND_LICENCE_REGISTER.md
docs/ui-ux/HOME_PRESERVATION_EVIDENCE.md
docs/ui-ux/IMPLEMENTATION_STATUS.md
docs/ui-ux/KNOWN_LIMITATIONS.md
```

Add:

```text
specs/design-tokens.json
specs/screen-catalogue.csv
specs/route-map.json
specs/api-contracts/
```

Provide original clickable/wireframe or Storybook examples for the critical P0 screens. Do not flatten the production interface into screenshots; components remain editable and implemented in React.

At completion include:

- before/after screenshots except Home, where before/after must match;
- route map;
- role/permission matrix;
- API contract report;
- reconciliation report;
- Playwright report;
- accessibility report;
- visual-regression report;
- frontend bundle report;
- API/query performance report;
- service resource comparison;
- unresolved limitation register.

---

# 28. Begin now

Start with Phase 0 and the UI audit. Verify the real repository, runtime, routes, authentication and database rather than assuming the paths or libraries in this prompt. Protect Git state and PostgreSQL data. Keep Nginx. Preserve SmartAPI. Keep paper trading as the safe default. Freeze the existing Home screen. Build the original light analytical design system, robust Google/local-admin authentication and the P0 vertical slices before broad screen rollout. Do not place live orders.
