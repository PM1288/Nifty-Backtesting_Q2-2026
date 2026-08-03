# Project skeleton

This repo is intentionally minimal but production-shaped.

---

## Root

- `docker-compose.yml` (local Postgres)
- `README.md`
- `docs/` (guidelines)

---

## apps/api

Node + Express + Prisma.

Key files:
- `src/server.ts` – app bootstrap
- `src/routes/*` – REST endpoints
- `src/ws/stream.ts` – WebSocket streaming
- `prisma/schema.prisma` – DB schema
- `prisma/seed.ts` – dev seed generator

---

## apps/web

React + Vite + TS.

Key files:
- `src/App.tsx` – layout + routes
- `src/components/chrome/*` – header ticker + footer disclaimer
- `src/components/visual/*` – liquid backdrop, glitch text, neon button
- `src/pages/LandingPage.tsx` – Nifty KPI + sector groups + leaderboards
- `src/pages/StockPage.tsx` – stock KPIs + chart

---

## Theme enforcement

Single source of truth:
- `apps/web/src/styles/tokens.css`

Rules:
- No inline hex colors in components.
- Use tokens (CSS variables) only.
