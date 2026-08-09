# Modernisation test plan and results

Last updated: 2026-08-09 UTC

## Test environments

| Environment | Purpose | Production writes allowed |
|---|---|---|
| Source worktree | static checks, unit tests, builds | No |
| Isolated PostgreSQL restore | migration and data-preservation proof | Only restored copy |
| Staging Compose | Nginx/API/UI/worker replay and resilience | Paper/research only |
| Current deployment | read-only health and bounded smoke checks | Existing services only; no live orders |

## Baseline results

| Area | Result | Evidence |
|---|---|---|
| SmartAPI package | PASS | `go test ./internal/smartapi ./internal/config` |
| Node API typecheck | PASS | 6.35 s |
| React typecheck | PASS | 11.01 s |
| Node API tests | PASS | 57/57 |
| API production build | PASS | 6.40 s |
| React production build | PASS | 19.76 s, 4.4 MiB output |
| Analytics backtest tests | PASS | 6/6 |
| StratLab tests | PASS | 94/94 |
| Exit/ladder/H30 subset | PASS | 31/31 |
| Compose render | PASS | Base plus deployed overlays |
| Host Nginx syntax | PASS | `nginx -t` |
| Secret scan | PASS | Gitleaks directory scan with redaction; no findings |
| Root JS convenience scripts | FAIL (TOOLING) | Scripts require absent Corepack while Docker uses npm |

No SmartAPI order endpoint was called. Paper configuration remains fail-closed.
The paper API has `PAPER_TRADING_ONLY=true`. The collector's explicit
`TRADING_MODE` variable is currently unset and `ALLOW_LIVE_TRADING` is
false/unset; code-level SmartAPI configuration still disables live orders.
Deployment hardening must set both requested flags explicitly and retest.

## Strategy-testing workspace gates

### Contract and security

- Reject unknown strategy IDs, parameters and extra JSON properties.
- Enforce server-side min/max/enum constraints and maximum date/universe size.
- Reject arbitrary paths, SQL, shell text and non-finite numbers.
- Require an authenticated session and CSRF protection for mutations.
- Return the original run for an identical idempotency key/request hash and
  return conflict when the hash differs.
- Record requester, source batch, engine/config hash and every state change.
- Prove the worker image contains no broker-order client or credentials.

### Determinism and parity

- Default parameter values reproduce the published strategy signal candidates
  on the same source batch/date range.
- A changed threshold changes only declared conditions and run identity.
- One-worker, multi-worker and resumed result hashes match.
- T signal uses only completed T features; entry is T+1 open.
- Same-bar ambiguity is flagged rather than invented.
- Every reward/adverse/H30 ladder level is evaluated independently.
- Current strategy execution exits remain separate from diagnostic outcomes.

### Financial and portfolio correctness

- Decimal/rounding rules and charges match the governed fee profile.
- Profit tax is a separate configured research provision and applied once.
- Open liabilities are included in net-liquidation value.
- Finite capital never becomes negative, never exceeds configured concurrent
  positions and emits a reason for each skipped valid signal.
- Trade sums reconcile to daily equity and run summary.

### API/UI/Nginx

- Catalogue, create, list, detail, progress, trades and result routes validate.
- Direct refresh of `/backtesting/lab` returns the SPA.
- API errors are JSON and never rewritten to SPA HTML.
- The page shows source/run dates, status, progress, paper/research badge,
  immutable config, funnel, P&L, drawdown, regimes and ladder outcomes.
- Submit/cancel/error/retry states are keyboard-accessible and responsive.
- Polling is bounded and cancelled on unmount; historical runs remain readable.

### Migration and preservation

- Apply migration twice to an isolated restored database.
- Existing populated data starts without reset/seed.
- Compare 424-relation/352-partition baseline plus exact critical counts,
  sequences, ranges and signatures.
- Expected additive objects are the only catalogue difference.
- Application rollback works with additive objects retained.

## Performance fixtures

- Fixed one-stock/one-year acceptance run.
- Fixed Nifty100/three-year default run.
- 10 concurrent bounded UI submissions with idempotency duplicates.
- Worker restart at 25%, webhook/Nginx outage and PostgreSQL reconnect.
- Metrics: queue delay, rows/s, run duration, peak RSS, query count, DB growth,
  API p50/p95/p99 and status polling load.

## Strategy-lab implementation results

| Area | Result | Evidence |
|---|---|---|
| External backup archive | PASS | 13,039,461,367-byte `tradingdb.dump`; archive verified |
| Network-isolated restore | PASS | 519/519 restore-catalogue relations; no published ports |
| Preservation reconciliation | PASS | 424→431 expected relations; 352 partitions retained; no decreased critical counts |
| Migration repeatability | PASS | `060_strategy_lab.sql` applied twice on disposable PostgreSQL 16 |
| Analytics contract regression | PASS | 5/5 |
| Strategy-lab unit tests | PASS | 4/4 |
| API suite | PASS | 60/60 |
| API typecheck/build | PASS | TypeScript compilation and production build |
| Web typecheck/build | PASS | Vite production build; lazy lab chunk 12.90 KiB/4.65 KiB gzip |
| Compose render | PASS | Root and modular core/stage definitions with actual deployment environment |
| Nginx syntax | PASS | Isolated `nginx -t` and deployed-container `nginx -t` |
| Stage guest reads | PASS | SPA, catalogue, history, detail, ladders, equity and CSV |
| Stage unauthenticated write | PASS | JSON 401 `AUTH_REQUIRED`; no auth popup forced |
| Production route | PASS | `/n50/backtesting/lab` and catalogue through Nginx |
| Consolidated CSV | PASS | 3,776-byte finite-capital smoke export through prod and stage Nginx |
| Worker restart/start | PASS | Connected through existing Compose identity; zero worker restarts after correction |
| SmartAPI live-order safety | PASS | No SmartAPI/order API was called; lab worker has no broker adapter |

The first stage command omitted `-p trading-stack-novius2`, creating an
isolated Compose identity whose PostgreSQL/Redis names could not resolve. Both
new containers failed closed. They and only their newly created network were
removed, then the validated deployment reused the existing project identity.
This is retained as deployment evidence and the required project name is now
called out in the runbook/handoff.

### Real one-stock smoke evidence

- Unconstrained run `473807d7-7735-4f8a-be74-afc1246e461b`: RELIANCE,
  completed/PASS, one signal/trade, 15 independent ladder rows.
- Entry evidence: RSI 28.1133, Williams %R -86.7672, MACD -34.6993; stock and
  Nifty `DOWN_TREND`; India VIX `LOW`.
- H30 MFE +5.630806%; H30 MAE -7.311538%. Intraday I030/I050 hit, I070 did not;
  all H30 1/2/5% levels hit. I030/A050 same-bar ordering is explicitly
  ambiguous.
- Finite ₹16 lakh run `65600ee3-d5e6-4d21-8fba-135931f506a4`: ending capital
  ₹16,05,543.4795, return +0.3465%, max drawdown -0.5708%, 159 equity rows and
  exact trade/equity reconciliation.

## Remaining validation work

- Full Nifty100/three-year performance and concurrency benchmark.
- Browser automation across desktop/mobile. HTTP, asset and API smokes passed,
  but Chromium is not installed in this execution environment.
- Market-session CPU/RAM/latency capture rather than the current idle sample.
- Failure injection for database interruption and mid-run worker termination.
- Remediation and regression of the 13 npm dependency advisories.
- Optional Nginx upstream resolution for absent watchlist/Matomo/RSI services.
