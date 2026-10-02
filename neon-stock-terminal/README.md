# Neon Stock Terminal (React + Node + Postgres)

This README is module-scoped for the `neon-stock-terminal/` workspace.

For the current deployed N50 stack and route/deployment source of truth, start at:

- [`../docs/SOURCE_OF_TRUTH.md`](../docs/SOURCE_OF_TRUTH.md)
- [`../docs/ARCHITECTURE_CURRENT.md`](../docs/ARCHITECTURE_CURRENT.md)

A strict, minimalist stock-market learning website with a **black canvas**, **white typography**, and **one semantic neon accent at a time**:
- **Neon Green** for positive movement
- **Neon Red** for negative movement

It includes:
- A landing page with **Nifty 50 KPI** (glitch effect) + **N100 stocks grouped by sector**
- A constant **header ticker tape** (scrolling)
- A constant **footer disclaimer marquee** (scrolling)
- A stock detail page with **intraday chart** and KPI summary
- A Node API connected to a database that stores **intraday bars** and **daily snapshots**

> **Education only:** This project is explicitly built as a learning platform and includes mandatory disclaimers in the UI.

---

## Repository structure

```
neon-stock-terminal/
  apps/
    api/        # Node + Express + Prisma (Postgres)
    web/        # React + Vite + TS
  docs/         # Strict UI/UX + branding guidelines (Markdown)
  docker-compose.yml
```

---

## Prerequisites

- Node.js **22 LTS**
- npm **>= 10** (canonical lockfile: `package-lock.json`)
- Docker (optional but recommended for local Postgres)

---

## Quickstart (local)

### 1) Start Postgres (Docker)

From the repo root:

```bash
docker compose up -d
```

### 2) Configure env

Copy env examples:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### 3) Install deps

```bash
npm ci
```

### 4) Generate Prisma client + migrate + seed

```bash
npm run --workspace=@app/api prisma:generate
npm run --workspace=@app/api prisma:migrate
npm run --workspace=@app/api db:seed
```

### 5) Run web + api

```bash
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:8080
- Health: http://localhost:8080/health

---

## API Access Hardening

The API now supports server-side auth enforcement for all market endpoints:

- Protected paths: `/v1/*` and WebSocket `/v1/stream`
- Public path: `/health`
- Auth model: server-issued session cookie (`HttpOnly`, `SameSite`) with CSRF token for state-changing requests.

Session endpoints:

- `GET /auth/session` (session status + user)
- `POST /auth/session/login` (exchange Firebase ID token for server session cookie)
- `POST /auth/session/logout` (CSRF-protected logout)
- `GET /auth/csrf` (fetch latest CSRF token)

Enable protected mode in `apps/api/.env`:

```bash
AUTH_REQUIRED=1
FIREBASE_WEB_API_KEY=<your-firebase-web-api-key>
SESSION_COOKIE_SECURE=1
```

In production-facing flows, the API is expected to start with explicit auth/runtime config rather than relying on hidden fallback behavior.

`docker-compose.yml` now defaults dashboard API auth to enabled (`N50_AUTH_REQUIRED` defaults to `1`).

Recommended production setup:

- Serve web + API from the same origin (no broad CORS).
- Keep `CORS_ALLOWED_ORIGINS` empty in production.
- Place Cloudflare Access and WAF in front of the hostname.

---

## Docs (strict rules)

Start here:

- `docs/01_BRANDING_AND_THEME.md`
- `docs/02_UI_UX_SPEC.md`
- `docs/05_API_SPEC.md`
- `docs/04_DATA_MODEL_AND_DB.md`

---

## Notes on “inspiration” references

The UI includes effects inspired by publicly shared demos (liquid backdrop, glitch KPI, ticker tape, neon button, oscilloscope-like chart).
This repo implements those effects **from scratch** and keeps the palette restricted to:
- black, white, and opacity whites
- neon red shades/tints
- neon green shades/tints

If you want to swap effects, do it inside:
- `apps/web/src/components/visual/`

---

## License

Internal / proprietary by default. Add a license if you intend to open-source.


## Engineering validation

Use Node 22 and npm 10+ (matching Docker). `package-lock.json` is the only
JavaScript lockfile; the obsolete pnpm lockfile has been removed. Run `npm ci`,
`npm run typecheck`, `npm test`, `npm run build`, `npm audit`, and `npm run lint`.
ESLint uses `apps/api/eslint.config.mjs`; generated Storybook output is excluded.
Existing source lint debt remains reported by `npm run lint`; no unsafe-type or
React Hooks checks are disabled. The CI checks builds, types, tests and advisories.

The root `scripts/verify/engineering-check.sh` runs the complete local sequence,
including lint (which exits nonzero while existing debt remains). Go builds use
1.26.8 and `govulncheck` 1.8.0. Python runtime audits must use the actual installed
package inventory as well as requirements, since transitive versions vary.

API reads use `src/lib/httpClient.ts`: include credentials, abort stale work,
apply a deadline, validate JSON content type, and expose sanitized HTTP errors.
React Query owns response caching. Prefetch only data a destination consumes.
Routes are protected by the shared API session guard, including proxied exports.
The private data proxy streams with backpressure and cancels disconnected clients.

`useModalFocus` handles keyboard containment/restoration for dialogs. Route errors
use `RouteErrorBoundary` and the existing `ErrorState` primitive, preserving shell
navigation. Browser checks are required for changes to shared UI or route loading.
