# Modernisation status

Last updated: 2026-08-09 UTC

| Phase | Status | Evidence | Next action |
|---|---|---|---|
| 0 Safety and environment capture | COMPLETE | `baseline/` files; recovery tag and bundle | Preserve evidence and continue read-only audit |
| 1 Current-stack audit | COMPLETE FOR SAFE FIRST BATCH | service/data-flow/performance/cleanup reports; machine repository and 424-relation DB inventories; scheduler ownership matrix | Continue market-session profiling in a later operational batch |
| 2 Backup and restore proof | COMPLETE | External backup `20260809T144133Z`; isolated restore and preservation comparison PASS | Retain external backup and repeat before future structural migrations |
| 3 Recommendation | COMPLETE FOR FIRST BATCH | `05-recommendation-and-target-architecture.md` | Retain Node API, Nginx, PostgreSQL and SmartAPI; defer unsupported Go/NATS rewrite |
| 4–7 Implementation and cleanup | PARTIAL: STRATEGY LAB COMPLETE | Additive lab schema, worker, API, light UI, consolidated CSV, paper-only Compose | Broader service consolidation/archive remains a future reversible batch |
| 8–9 Validation and deployment | STRATEGY LAB DEPLOYED | Staging then production Nginx/API/UI smokes; one-stock and finite-capital runs | Resolve optional missing Nginx upstreams; run full load test separately |

## Phase 0 decisions

- The prompt's repository path and expected branch are not present. Continue
  against the verified source/runtime pair; do not fabricate a new repository.
- Created branch `codex/trading-stack-modernisation-20260809` from the verified
  `DEV_PM_CODE` commit.
- Created recovery tag `pre-modernisation-20260809-143440` and a mode-0600 Git
  bundle outside the repository at
  `/home/novius2/backups/trading-stack-modernisation/pre-modernisation-20260809-143440.bundle`.
- Existing untracked research outputs and caches were inventoried and left
  untouched.
- PostgreSQL is still running from `trading-stack-novius2_pgdata`. The only
  schema change is the seven-table additive strategy-lab migration, applied
  after a verified external backup and isolated restore proof.
- Host Nginx remains untouched. Container Nginx was configuration-tested and
  recreated once to activate the existing prod/stage route map.
- SmartAPI adapter tests pass; SmartAPI behaviour has not been modified.
- Paper API reports `environment=PAPER`. Notification health is degraded but
  allowed; this is a baseline condition for Phase 1 investigation.
- The collector runtime does not expose `TRADING_MODE` and leaves
  `ALLOW_LIVE_TRADING` false/unset. Existing Go configuration tests still prove
  `DisableLiveOrders=true`, but the modernised Compose must make the requested
  `TRADING_MODE=paper` and `ALLOW_LIVE_TRADING=false` settings explicit and
  retain the code-level fail-closed gate.
- The existing backtesting dashboard is a read-only `nse_app.backtest_*`
  publication reader. The testing workspace will be an additive, durable,
  allow-listed research job flow and will not run arbitrary code in an API
  request.
- StratLab already provides a deterministic research/shard ledger and
  SKIP-LOCKED leasing. The testing workspace will reuse it and add only missing
  UI request/event metadata rather than create a disconnected backtester.
- Scheduler call-site review found distinct domain owners. The first release
  will preserve those owners and aggregate diagnostics; it will not introduce a
  second scheduler or merge jobs without replay and missed-run evidence.
- The option watcher is healthy and its prior exit code was 0, with
  `OOMKilled=false`. Its memory stayed at about 496.9/512 MiB in repeated
  samples, so the restart is not classified as an OOM failure but the narrow
  headroom remains an unresolved capacity risk.
- Intraday scheduler evidence shows saturation rather than duplicate owners:
  raw sync averages about 174.5 seconds and feature refresh about 358.3 seconds
  on one-minute cron triggers. `max_instances=1` prevents overlap, but two stale
  `running` ledger rows require abandoned-run reconciliation and the cadence
  requires measured correction.

## Current risks requiring evidence

- The default Compose model defines 31 services and 25 are currently running.
- `option-chain-watcher` used about 496 MiB of its 512 MiB limit in the first
  point-in-time sample.
- `market-data-gateway` used about 331 MiB of its 384 MiB limit.
- PostgreSQL is published on IPv4/IPv6 wildcard port 5432, UFW permits the port
  from anywhere and HBA requires SCRAM for non-local clients. This is confirmed
  broader network exposure than the target policy. It remains unchanged during
  the safety phase; cutover must narrow it only after the operator's real remote
  access paths are tested and a rollback rule exists.
- Multiple inactive-looking volumes include `trading-stack_pgdata` as well as
  the verified active `trading-stack-novius2_pgdata`. Nothing may remove either
  until provenance and contents are proven.
- `GET /health` at the container-Nginx root returned 404 while
  `/n50/health` passed. Record as a baseline route characteristic.
- Three optional Nginx upstreams are currently absent: `watchlist`, `matomo`
  and `rsi-willr-monitor`. N50 prod/stage routes pass, but this remains an
  all-stack diagnostic warning.
- `https://n50.nifty50today.co.in/n50/backtesting/lab` passes publicly. The
  stage app passes via local Nginx but `stage.nifty50today.co.in` currently
  returns Cloudflare 502; its remotely managed tunnel ingress needs correction.
- The Node dependency audit reports 13 advisories. Remediation requires a
  separate dependency-upgrade branch and full regression.

## Strategy-testing workspace deployment

- Public routes: `/n50/backtesting/lab` and `/n50-stage/backtesting/lab`.
- Guest GET catalogue/history/detail/trade/ladder/equity routes pass through
  Nginx. Mutations remain authenticated and an anonymous POST returns JSON 401
  without opening the login popup.
- Governed strategies and bounded parameters are allow-listed. Arbitrary code,
  SQL and paths are not accepted.
- Independent I030/I050/I070, D+5 S100/S200/S500, adverse and H30 ladders are
  all persisted; the engine does not stop at the first hit.
- Every run stores one consolidated trade CSV and PostgreSQL result rows.
- Actual tested feature coverage is 2025-11-10 through 2026-08-06 for 100
  stocks. The UI reports this rather than promising unavailable history.
- Smoke run `473807d7-7735-4f8a-be74-afc1246e461b` completed for RELIANCE in
  unconstrained diagnostic mode. Finite-capital run
  `65600ee3-d5e6-4d21-8fba-135931f506a4` reconciled ₹16,00,000 to
  ₹16,05,543.4795 with a -0.5708% maximum drawdown.
- Nifty, stock, India VIX and global-market regime context is retained with
  RSI, Williams %R, moving-average and MACD evidence.
- The lab worker is paper/research only and contains no broker execution path.

## UI/UX V2 deployment — 2026-08-09

- Reviewed every supplied artefact in `UI-REDESIGN`: the full specification,
  token JSON, 64-screen catalogue and implementation prompt.
- Implemented a scoped `[data-ui-generation="trading-v2"]` light operational
  workspace. Home is deliberately outside the scope and its component/styles
  were not changed.
- Added navy product-domain navigation, PAPER/feed/user context, responsive
  216/72 px rail/drawer, semantic status primitives, reduced-motion handling
  and governed `/dashboard/*` aliases to real screens only.
- Added the UI audit, implementation plan, design system, IA, accessibility,
  failure, auth, performance, screen, source and limitation documents under
  `docs/ui-ux/` plus `specs/route-map.json`.
- TypeScript and the production build pass. The Playwright matrix passes 20/20
  locally, 20/20 through stage Nginx and 20/20 on public production at 430,
  1024, 1440 and 1920 px. Home isolation and no document overflow are asserted.
- Repository-wide lint remains blocked by the pre-existing 36 errors/39
  warnings in unrelated files. It was recorded, not suppressed.
- Built/recreated only `n50-dashboard-stage` and `n50-dashboard` with
  `-p trading-stack-novius2`; all market, paper-trading, OIIS, worker,
  PostgreSQL and Nginx containers remained running.
- Dashboard health is HTTP 200, ready and PostgreSQL connected. Public Strategy
  Lab and `/dashboard/strategy-lab/quick` alias both return HTTP 200.
- No database migration, trading-rule change, SmartAPI change or live order was
  made. Pre-deploy runtime UI files are backed up at
  `/home/novius2/backups/ui-v2/20260809T181329Z`.

## Authentication boundary and production UI verification — 2026-08-09

- Corrected the production-origin allowlist and redeployed the dashboard.
- Made authentication mandatory before any application content or data request
  is rendered. Local admin and verified Firebase sessions are the two supported
  routes.
- Completed Firebase disposable-account verification testing and removed all
  generated test identity/profile data afterwards.
- Removed residual grey index overlays and set the document canvas to the
  universal light palette.
- Type checks pass and API tests pass 60/60.
- Production browser validation passes for Home, Nifty 500, Paper Trading and
  Administration. Anonymous users see only the non-dismissible auth modal;
  authenticated routes render live database results with no relevant API error.
- Rebuilt and recreated only `n50-dashboard` under Compose project
  `trading-stack-novius2`; it is healthy. No data or schema changed.
