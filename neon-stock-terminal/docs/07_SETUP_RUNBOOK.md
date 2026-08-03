# Setup & runbook

---

## 1) Local development

### Start DB (recommended)

```bash
docker compose up -d
```

### Configure env

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### Install deps

```bash
pnpm install
```

### Prisma

```bash
pnpm --filter @app/api prisma:generate
pnpm --filter @app/api prisma:migrate
pnpm --filter @app/api db:seed
```

### Run

```bash
pnpm dev
```

---

## 2) Environment variables

### apps/api

- `DATABASE_URL` (Postgres connection string)
- `PORT` (default 8080)
- `TZ` (set to `Asia/Kolkata` for consistent “market day” boundaries)

### apps/web

- `VITE_API_BASE_URL` (default `http://localhost:8080`)
- `VITE_WS_URL` (default `ws://localhost:8080`)

---

## 3) Common issues

### “No data on landing page”
- Confirm DB is running
- Run seed: `pnpm --filter @app/api db:seed`
- Check API: `GET /v1/overview`

### “Websocket not updating”
- Check browser console for WS connection
- Confirm API is running on `8080`
