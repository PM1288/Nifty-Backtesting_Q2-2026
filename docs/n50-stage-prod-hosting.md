# N50 Single-Machine Stage + Prod Hosting

Last reviewed: 2026-04-03

This document now sits behind the split overlay model introduced in Phase 2.

- PROD-like deployments use `compose/compose.base.yml + compose/compose.core.yml`
- STAGE deployments use `compose/compose.base.yml + compose/compose.stage.yml`
- the old single-machine mixed-edge flow is no longer the default operator path
- use explicit `--env-file .env` for every compose invocation

This document describes the single-machine deployment flow for the N50 UI/API stack when we want:

- one stable **PROD** UI that users can rely on
- one separate **STAGE** UI for experimentation and review
- the **same PostgreSQL database**
- separate cache/session isolation so STAGE does not interfere with PROD

This setup is intentionally limited to the **N50 dashboard application layer**.

Current doc path:

- [Source of truth](./SOURCE_OF_TRUTH.md)
- [Current architecture](./ARCHITECTURE_CURRENT.md)

It does **not** duplicate the writer / scheduler / ingestion services against the same database. Those remain single-instance on purpose.

## URLs

### Local machine

- PROD: `http://localhost:19090/n50/`
- STAGE: `http://localhost:19090/n50-stage/`

### Cloudflare / public hostnames

- PROD root hostname: `https://m.nifty50today.co.in/`
  - nginx redirects this to `https://m.nifty50today.co.in/n50/`
- STAGE root hostname: `https://stage.nifty50today.co.in/`
  - nginx redirects this to `https://stage.nifty50today.co.in/n50-stage/`

This keeps the app builds path-aware while giving you hostname-based separation in front of the tunnel.

## What Is Shared vs Isolated

### Shared

- PostgreSQL data
- market data services
- analytics worker
- recommendation APIs
- supporting metrics APIs
- reverse proxy process (`nginx`)

## Canonical ingress

The active nginx config now depends on the selected overlay:

- `compose/nginx/nginx.core.conf` for the prod-like core deployment
- `compose/nginx/nginx.stage.conf` for the stage deployment
- `compose/nginx/nginx.legacy.conf` only for the legacy overlay

The old all-in-one `compose/nginx/nginx.conf` is historical reference only and must not be treated as the default ingress path for current deployments.

### Isolated

- web bundle / API container for PROD
- web bundle / API container for STAGE
- Redis cache database index
- session cookie name
- session cookie path

## Why The Database Is Shared

The user requirement is to keep one database.

That is safe only because we are splitting the **read-facing N50 app layer**, not the data writers.

We do **not** run duplicate ingestion / strategy / watcher stacks against the same DB. That would create race conditions and duplicate writes.

## Architecture

### Containers

- `n50-dashboard`
  - PROD N50 UI/API
  - base path: `/n50/`
  - Redis DB: `0`

- `n50-dashboard-stage`
  - STAGE N50 UI/API
  - base path: `/n50-stage/`
  - Redis DB: `1`

- `nginx`
  - routes `/n50/` to PROD
  - routes `/n50-stage/` to STAGE

### Why Redis Is Split

The N50 dashboard snapshot cache keys are shared by contract unless namespaced.

To avoid STAGE warming / evicting the same snapshot cache entries as PROD, the two apps use different Redis DB indexes:

- PROD: `redis://redis:6379/0`
- STAGE: `redis://redis:6379/1`

### Why Session Cookies Are Split

Both apps run on the same host, so they must not share the same browser cookie.

We isolate them with:

- different cookie names
- different cookie paths

Current defaults:

- PROD cookie name: `n50-prod-session`
- PROD cookie path: `/n50`
- STAGE cookie name: `n50-stage-session`
- STAGE cookie path: `/n50-stage`

This prevents logging into one app from clobbering the other session on the same browser.

## Cloudflare Tunnel Model

Use one tunnel and publish both hostnames to the same local nginx instance.

Example `cloudflared` ingress:

```yaml
ingress:
  - hostname: m.nifty50today.co.in
    service: http://localhost:19090
  - hostname: stage.nifty50today.co.in
    service: http://localhost:19090
  - service: http_status:404
```

Cloudflare Tunnel supports hostname-based ingress rules, and can also match by path if needed. We are using hostname-based routing at the tunnel layer and path-based routing inside nginx.

### What nginx does with those hostnames

- `Host: m.nifty50today.co.in`
  - `/` -> `/n50/`
  - `/n50/` -> PROD app

- `Host: stage.nifty50today.co.in`
  - `/` -> `/n50-stage/`
  - `/n50-stage/` -> STAGE app

The browser-visible path still includes `/n50/` or `/n50-stage/` because the app builds are path-aware. The hostname split keeps the two environments operationally separate for users and reviewers.

## Edge protections and ownership split

### Enforced at nginx

- same-origin route ownership for `/n50/`, `/n50-stage/`, `/auth/*`, `/v1/*`, `/api/v1/*`, `/matomo/*`, and `/option-chain/*`
- Content-Security-Policy
- `Permissions-Policy` with camera explicitly disabled
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- strict referrer policy
- body-size and upstream timeout limits
- request filtering for unsupported methods and obvious probe/scanner patterns
- targeted rate limits for:
  - `/auth/session/login`
  - `/auth/profile/signup`
  - `/v1/feedback`
  - `/internal/snapshots/refresh`
  - the equivalent `/n50/*` and `/n50-stage/*` prefixed paths

### Better handled at Cloudflare CDN / WAF

- bot management and managed rulesets
- geo restrictions and country blocks
- IP reputation, ASN-based blocks, and challenge flows
- STAGE protection with Cloudflare Access
- public caching strategy for static assets
- DDoS absorption and network-layer attack handling

Rule of thumb:

- if the control depends on local route ownership, origin headers, or upstream safety, keep it in nginx
- if the control depends on internet-edge identity, bot detection, or global traffic policy, keep it in Cloudflare

### Cloudflare DNS / Tunnel steps

1. Create or reuse one Cloudflare Tunnel on the machine.
2. Point both public hostnames at the same tunnel:
   - `m.nifty50today.co.in`
   - `stage.nifty50today.co.in`
3. Keep the tunnel origin pointed at local nginx:
   - `http://localhost:19090`
4. Restart `cloudflared` after updating the ingress file.
5. Validate each hostname:
   - `https://m.nifty50today.co.in/`
   - `https://stage.nifty50today.co.in/`

### Example cloudflared config

```yaml
tunnel: <your-tunnel-id>
credentials-file: /etc/cloudflared/<your-tunnel-id>.json

ingress:
  - hostname: m.nifty50today.co.in
    service: http://localhost:19090
  - hostname: stage.nifty50today.co.in
    service: http://localhost:19090
  - service: http_status:404
```

### Optional hardening

Recommended for STAGE:

- protect `stage.nifty50today.co.in` with Cloudflare Access
- keep PROD public
- use the same machine and same nginx origin underneath

Reference:
- Cloudflare Tunnel configuration file / ingress rules: https://developers.cloudflare.com/tunnel/advanced/local-management/configuration-file/

## Files That Implement The Split

- [`compose/compose.base.yml`](../compose/compose.base.yml)
- [`compose/compose.core.yml`](../compose/compose.core.yml)
- [`compose/compose.stage.yml`](../compose/compose.stage.yml)
- [`compose/nginx/nginx.core.conf`](../compose/nginx/nginx.core.conf)
- [`compose/nginx/nginx.stage.conf`](../compose/nginx/nginx.stage.conf)
- [`neon-stock-terminal/apps/api/src/auth/session.ts`](../neon-stock-terminal/apps/api/src/auth/session.ts)
- [`scripts/n50-stage-prod-common.ps1`](../scripts/n50-stage-prod-common.ps1)
- [`scripts/deploy-n50-stage.ps1`](../scripts/deploy-n50-stage.ps1)
- [`scripts/promote-n50-stage-to-prod.ps1`](../scripts/promote-n50-stage-to-prod.ps1)
- [`scripts/n50-status.ps1`](../scripts/n50-status.ps1)

## Environment Variables

Optional environment variables that control the split:

### PROD

- `N50_PROD_REDIS_URL`
- `N50_PROD_SESSION_COOKIE_NAME`
- `N50_PROD_SESSION_COOKIE_NAME_INSECURE`
- `N50_PROD_SESSION_COOKIE_PATH`
- `N50_AUTH_ALLOWED_ORIGINS`
- `N50_AUTH_REQUIRED`

### STAGE

- `N50_STAGE_REDIS_URL`
- `N50_STAGE_SESSION_COOKIE_NAME`
- `N50_STAGE_SESSION_COOKIE_NAME_INSECURE`
- `N50_STAGE_SESSION_COOKIE_PATH`
- `N50_STAGE_AUTH_ALLOWED_ORIGINS`
- `N50_STAGE_AUTH_REQUIRED`

### Shared

- `N50_SNAPSHOT_REFRESH_TOKEN`

## First-Time Setup

From the repo root:

```powershell
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.core.yml up -d --build
```

For a stage deployment on the stage host:

```powershell
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.stage.yml up -d --build
```

Then refresh the relevant snapshot cache with the helper indirectly through the deploy scripts below.

## Host Routing Behavior

The live nginx behavior is:

- `Host: m.nifty50today.co.in`
  - `/` -> `302 /n50/`
  - `/n50/` -> PROD app

- `Host: stage.nifty50today.co.in`
  - `/` -> `302 /n50-stage/`
  - `/n50-stage/` -> STAGE app

Local machine behavior remains:

- `http://localhost:19090/n50/` -> PROD
- `http://localhost:19090/n50-stage/` -> STAGE

## Day-To-Day Flow

### 1. Deploy changes to STAGE

Use STAGE when you want to test UI changes without touching PROD.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-n50-stage.ps1
```

What this does:

1. rebuilds the stage overlay with explicit env-file wiring
2. starts `n50-dashboard-stage` plus the stage nginx edge
3. refreshes STAGE snapshots

After that, review one of:

- local: `http://localhost:19090/n50-stage/`
- public: `https://stage.nifty50today.co.in/`

### 2. Validate STAGE

Typical validation:

- open `/n50-stage/`
- click through key dashboards
- verify auth/session behavior
- verify charts and data
- run Playwright capture or smoke tests if needed

### 3. Promote to PROD

When STAGE is approved, promote the current code to PROD:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\promote-n50-stage-to-prod.ps1
```

What this does:

1. rebuilds the prod-like core overlay with explicit env-file wiring
2. starts `n50-dashboard` plus the core nginx edge
3. refreshes PROD snapshots

After that, validate one of:

- local: `http://localhost:19090/n50/`
- public: `https://m.nifty50today.co.in/`

## Validation Commands

### Local services

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\n50-status.ps1
```

### Host-header simulation before Cloudflare cutover

```powershell
curl.exe -I -H "Host: m.nifty50today.co.in" http://localhost:19090/
curl.exe -I -H "Host: stage.nifty50today.co.in" http://localhost:19090/
curl.exe -s -H "Host: m.nifty50today.co.in" http://localhost:19090/n50/ | Select-String "/n50/assets/"
curl.exe -s -H "Host: stage.nifty50today.co.in" http://localhost:19090/n50-stage/ | Select-String "/n50-stage/assets/"
```

## Operational Notes

### Important limitation

STAGE and PROD are built from the **same local working tree**.

That means:

- deploying STAGE does **not** change PROD
- but promoting to PROD uses the **current code checked out locally**

Recommended flow:

1. make changes in your branch / working tree
2. deploy STAGE
3. validate STAGE
4. commit / tag if needed
5. promote to PROD from the approved state

## Status Check

To inspect the current app containers:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\n50-status.ps1
```

## Snapshot Refresh

The apps expose:

- PROD: `/n50/internal/snapshots/refresh`
- STAGE: `/n50-stage/internal/snapshots/refresh`

The helper uses header:

- `x-snapshot-refresh-token`

## Rollback

Because STAGE and PROD are separate containers, rollback is simple:

1. check out the previous known-good code state
2. rerun the PROD promote script

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\promote-n50-stage-to-prod.ps1
```

This rebuilds PROD from the older code state while leaving STAGE available for further testing.

## What We Intentionally Did Not Split

We did **not** create stage/prod duplicates for:

- collectors
- watchers
- strategy engines
- backfill jobs
- ingestion pipelines

Reason:

Those write to the same DB and would interfere with each other if duplicated on one machine.

## Recommended Next Step For Future

If later you want stronger release isolation, the next safe evolution is:

1. keep the same PROD stack
2. move STAGE to its own machine or VM
3. give STAGE its own database clone
4. optionally keep shared market-data read replicas only

For now, this single-machine split is the right trade-off for:

- one stable PROD UI
- one changeable STAGE UI
- minimal infra overhead
- shared core data
