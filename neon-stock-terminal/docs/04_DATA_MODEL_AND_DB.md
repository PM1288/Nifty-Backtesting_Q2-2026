# Data model and database

The backend database is assumed to contain **intraday performance data** (bars) and daily snapshots.

This repo uses **Postgres + Prisma**.

---

## 1) Core entities

### 1.1 Sector

- `id`
- `name` (unique)
- `sortOrder`

### 1.2 Stock

- `symbol` (unique)
- `name`
- `assetType` (`EQUITY` or `INDEX`)
- `sectorId` (nullable for INDEX)
- `isNifty50`, `isNifty100` flags

### 1.3 IntradayBar

Stores intraday time-series data.

- `stockId`
- `ts` timestamp
- `open`, `high`, `low`, `close`
- `volume` (optional)

Indexing:
- `@@index([stockId, ts])`

### 1.4 DailySnapshot

Stores daily rollups (used for prevClose and quick KPIs).

- `stockId`
- `date` (calendar day key; stored as DateTime, but treated as a day bucket)
- `prevClose`, `open`, `high`, `low`, `close`, `volume`

Uniqueness:
- `@@unique([stockId, date])`

---

## 2) “What is last price?”

We compute “last” as:
- the **latest intraday bar close** for the current day (IST)
- fallback to daily snapshot close if intraday is absent

We compute “delta” and “% change” vs:
- `prevClose` from the daily snapshot (most recent snapshot for that day)

---

## 3) Recommended ingestion approach (later)

This skeleton does not ingest real market data. In production you will:
- ingest intraday bars continuously
- write daily snapshots at EOD (or update them intraday)

Recommended:
- `intraday_bars` appended or upserted
- `daily_snapshots` updated per day

---

## 4) Prisma schema location

- `apps/api/prisma/schema.prisma`

Seed script:
- `apps/api/prisma/seed.ts`
