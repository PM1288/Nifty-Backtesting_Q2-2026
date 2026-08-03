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

- Node.js **>= 20**
- pnpm **>= 9** (recommended)
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
pnpm install
```

### 4) Generate Prisma client + migrate + seed

```bash
pnpm --filter @app/api prisma:generate
pnpm --filter @app/api prisma:migrate
pnpm --filter @app/api db:seed
```

### 5) Run web + api

```bash
pnpm dev
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
