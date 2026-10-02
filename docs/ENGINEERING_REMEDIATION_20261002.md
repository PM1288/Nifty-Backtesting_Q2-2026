# Stack engineering remediation — 2 October 2026

## Scope and architecture

Canonical source: `/home/novius2/trading-stack`; starting production source `d49b31b`.
Evidence (not committed): `/home/novius2/NIFTY50/evidence/engineering-20261002`.
Inventory: 69 dependency manifests; 36 running project services. Other host applications are outside this release.

Execution paths:

- Smart API → Go collector (bounded ingestion, PostgreSQL persistence) → read models → Express/Prisma/Redis → authenticated WebSocket → React dashboard.
- NSE/Yahoo/Trendlyne/CDSL → Python ingestion and scheduled jobs → PostgreSQL → analytics/export/recommendation APIs → authenticated dashboard proxy.
- Paper signals → server-side validation/idempotency → paper ledger/monitor → event outbox → UI notifications. Live order permissions remain server-authoritative.
- Nginx/Cloudflare terminate public traffic; Docker DNS addresses upstream services. PostgreSQL and mounted runtime artifacts remain authoritative.

React 18/Vite/React Query owns rendering and read caching; the backend owns calculation and persistence. Redis supports session/cache/realtime recovery. Existing shared websocket subscription, source timestamps, stale-feed indicator and reconnect protections are retained. Database/query tuning from the preceding real-time release is documented separately in `trading-analytics/REALTIME_REDEPLOY_20261002.md`; this report does not count it as a new benchmark.

## Prioritized findings and implementation

| Priority | Finding | Change |
| --- | --- | --- |
| P0 | Legacy public NSE read/export proxy bypassed dashboard authentication | All three Nginx configurations route through the Node auth guard; allowlisted GET/HEAD proxy authenticates before contacting upstream |
| P0 | Database, collector, intraday and FII host ports listened on all interfaces | Bind localhost by default; explicit collector/Postgres bind overrides remain available |
| P0 | Vulnerable deployed/runtime and build dependencies | Supported targeted upgrades, lockfile regeneration, advisory scans and regression checks; detailed inventory below |
| P0 | Dormant mobile BFF contained admin/admin and nonexpiring token | Require explicit strong operator credentials, constant-time digest comparison, one-hour tokens; service remains inactive |
| P1 | Proxy buffered complete exports and did not cancel disconnected requests | Streaming pipeline with backpressure, 60-second deadline, abort on disconnect, safe gateway errors |
| P1 | Unbounded token cache and Redis offline command queue | SHA-256 cache keys, 1,024-entry/expiry bound; bounded Redis commands and deadlines |
| P1 | Browser reads could wait indefinitely and expose upstream diagnostics | Shared JSON reader, 30-second deadline through body parsing, cancellation and sanitized errors |
| P1 | Unrelated navigation prefetch issued summary/regime requests | Explicit destination prefetch only; two unused requests eliminated on non-core destinations |
| P1 | Firebase SDK was eagerly joined and landing code eagerly imported | Lazy route/auth boundaries and natural Firebase splitting; main bundle reduced |
| P1 | Scheduler captured unbounded subprocess output; timeout mishandled bytes | Bounded 8 KB stdout/stderr tails, process-group termination, launch failure status persistence |
| P1 | Production export Compose build context did not match Docker COPY paths | Correct service context; repeatable production build |
| P2 | Incorrect selection ARIA, icon-only badge label, contrast/scroll/focus defects | Pressed-button semantics, named focusable table regions, shared modal focus handling, skip link, preserved native context menu, small token contrast adjustments |
| P2 | Route rendering exceptions could blank the workspace | Shared route error boundary with reload action and accessible loading state |
| P2 | Conflicting package managers, broken API lint config and generated lint noise | npm 10/Node 22 tooling, remove obsolete pnpm lock, remove shadowing ESLint config, exclude generated Storybook output |
| P2 | Build/test tools leaked into API distribution | Separate TypeScript build config; production pruning, non-root Node runtime, remove runtime npm/corepack |

No source-data rewrite, financial-model change, destructive migration or framework replacement is included. Large strategy modules were not blindly rewritten. Safe boundaries were extracted for HTTP reads, authenticated streaming, bounded cache, focus behavior and subprocess execution.

## Baseline

- Dashboard npm audit: 31 findings (3 critical, 12 high, 14 moderate, 2 low).
- API/web tests: 280 / 283 passed. Go race tests passed.
- API lint could not load its config. Web lint: 9,009 findings, mostly generated Storybook output. After config repair, real source debt remains; lint is not waived.
- Main JS: 495,059 bytes; combined Firebase chunk: 447,852 bytes; total JS: 4,007,536 bytes.
- Old dashboard Trivy scan: 5 critical, 73 high, 132 medium, 91 low, 2 unknown across OS and packaged libraries. This includes build tooling and OS advisories and is not a count of remotely exploitable application flaws.
- Browser: six authenticated screens profiled with screenshots, network timing, LCP/CLS/long tasks and axe WCAG checks. Initial transient missing-main run was repeated; the valid baseline has all six screens visible. These single-host samples are diagnostics, not field Core Web Vitals or throughput guarantees.

## Dependency/security verification

See `ENGINEERING_SECURITY_20261002.md` for package/advisory inventory, exposure analysis and remaining findings. No audit ignore rules were added. npm overrides are constrained to compatible grpc-js 1.x and UUID 11 (`gaxios` uses v4 only). React Router 7 retains the existing React 18 declarative route structure. FastAPI/Starlette/Pydantic upgrades are exercised with unit tests, OpenAPI generation and disposable database tests.

## Reproduction and release procedure

Use Node 22/npm 10 and Go 1.26.8; the host's default Node 18 is unsupported.

```bash
cd /home/novius2/trading-stack
bash scripts/verify/canonical-repository-gate.sh
git diff --check
GOTOOLCHAIN=go1.26.8 go test -race ./cmd/... ./internal/...
cd neon-stock-terminal
npm ci --no-fund
npm run prisma:generate --workspace=@app/api
npm run typecheck
npm test
npm run build
npm audit
npm run lint # remaining source debt is visible; currently nonzero
```

`engineering-check.sh` combines local gates. The GitHub Actions template at `docs/ci/engineering.github-actions.yml` covers Node installation/types/tests/build/audit and Go race/vulnerability gates. GitHub rejected workflow creation because the installed OAuth credential lacks `workflow` scope; the template is not active remote CI. Local validation remains executable.

Python tests use candidate containers and a disposable `n50-engineering-postgres` on an isolated Docker network. Never point destructive fixture tests at production. Paper fixtures drop synthetic schemas. Retention fixtures require a database name ending in `_fixture` and apply the existing safety SQL only there. The archival prerequisite is mocked in the retention/idempotency test; archive behavior has separate tests.

Release only from committed, pushed `master`, using each running service's original Compose file combination. Preserve image IDs and volume mounts in `release-before.json`; tag rollback images before replacing tags. Deploy only affected services with `up -d --no-deps --no-build`. Dashboard builds use `scripts/deploy_n50_dashboard.sh` so `/n50/` asset arguments are preserved. Run `nginx -t` before reloading its mounted config. Do not run `down -v`.

PostgreSQL network rebinding must retain its exact image and named data volume. Source data and unrelated containers are preserved. No SQL migration is required by this release.

## Operational configuration

- `POSTGRES_BIND_ADDRESS` / `COLLECTOR_BIND_ADDRESS`: default `127.0.0.1`; use SSH forwarding for host administration. Docker services continue to use internal service names.
- Production dashboard requires `AUTH_REQUIRED=1`. Existing intentionally public routes retain their established policy.
- Dormant `services/bff`: `BFF_LOGIN_USERNAME`, `BFF_LOGIN_PASSWORD` (minimum 32 characters), `JWT_SECRET`, `N8N_WEBHOOK_SECRET` required. Mock refresh tokens are removed. Use the canonical dashboard identity path for new mobile work.
- Firebase credential source permissions repaired from 0644 to 0600; Node UID 1000 read access checked. No credential content was changed or logged.

## Limitations / final evidence

Final release measurements and validation results are appended after deployment. Market-open Smart API throughput cannot be established during the 2 October exchange holiday; historical replay/unit/reconnect checks do not prove live exchange acceptance. Existing source lint/type-escape debt and installer advisories in unaffected worker images must remain explicit. Existing historical report availability is a data operational concern; missing files must not be fabricated.

## Additional findings from production verification

- An authenticated monthly all-stock request returned **20,278,780 bytes**, 9,648 evaluations and 1,133 candidates, taking **20,840 ms** in the recorded public API probe. Added `/v1/rolling-monthly/absolute-evaluations` for table identities/status/reasons and `/absolute-evaluations/:evaluationId` for complete persisted condition evidence. The original full dashboard/export contract remains available. No stock-month rows are dropped from the table.
- The monthly rejection loader had competing state ownership: initial candidate loading could clear an already-loaded rejection ledger, and effect cleanup could strand its loading flag. The rejection request now uses the existing React Query cache with cancellation, deduplication, one retry, 60-second freshness and five-minute retention. Inspector detail is loaded on demand with visible loading/error states.
- Server session restoration previously waited for Firebase SDK initialization. A browser fixture holding Firebase chunks timed out after eight seconds. Server-authoritative restoration now starts immediately, shares its first request with the SDK callback, and handles SDK loading failure. A valid-session fixture subsequently rendered main content in 597 ms while two SDK chunks remained held; final reruns are recorded separately.
- 148 bare asynchronous Express handlers across 45 files were wrapped with the existing `asyncRoute` helper. Express 4 now forwards rejected promises to the error middleware. An AST regression check covers route registration, and an HTTP test confirms storage rejection produces a completed error response.
- Visual inspection found the Paper overview using a percentage metric definition for the rupee-valued `analytical_upside` total. Added a distinct INR metric definition, matching the existing server formula `SUM(max(0, entry_notional * mfe_30d_pct / 100))`, currency formatting and two-decimal precision. Calculation and financial source values are unchanged.
