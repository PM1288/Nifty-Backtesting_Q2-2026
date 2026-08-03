# Acceptance

## Milestone 1 (Phase-1: NIFTY100 equities + indices live stream to 1m bars)
Status: Complete

### Success Criteria
- [x] Go collector implements Phase-1 requirements from `docs/phase-1.md`
- [x] Dockerfile builds and runs non-root collector
- [x] `docker-compose.yml` brings up Postgres + collector with healthcheck
- [x] Auto-creates schema and tables; idempotent upserts for `bars_1m`
- [x] Unit tests for CSV parsing, time bucketing, and symbol resolution
- [x] README includes run steps and config placement

### Sanity Checks
- [x] `docker compose config`
- [x] `docker compose build`
- [x] `docker compose up --build`
- [x] `go test ./...`
Last verified: 2026-02-01 11:33 (go test ./..., docker compose -p trading-stack down/up --build -d, manual straddle profit target in ₹)
Last verified: 2026-02-01 11:22 (go test ./..., docker compose -p trading-stack down/up --build -d, manual straddle monitor enabled)
Last verified: 2026-02-01 11:08 (docker compose -p trading-stack down/up --build -d, loosened event/straddle gates)
Last verified: 2026-02-01 10:29 (go test ./..., docker compose -p trading-stack down/up --build -d, docker compose ps)
Last verified: 2026-02-01 10:22 (go test ./..., docker compose -p trading-stack down/up --build -d, docker compose ps)
Last verified: 2026-02-01 09:21 (go test ./..., docker compose -p trading-stack down/up --build -d, docker compose ps)
Last verified: 2026-02-01 09:16 (go test ./..., docker compose -p trading-stack down/up --build -d, docker compose ps)
Last verified: 2026-02-01 08:53 (go test ./..., docker compose -p trading-stack down/up --build -d, docker compose ps)
Last verified: 2026-02-01 08:47 (go test ./..., docker compose -p trading-stack down/up --build -d, docker compose ps)
Last verified: 2026-02-01 08:12 (go test ./..., docker compose down/up --build -d, docker compose ps)
Last verified: 2026-02-01 08:18 (go test ./..., docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-14 11:10 (go test ./..., docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-14 10:54 (daily-test checks: docker compose ps/logs, DB metrics)
Last verified: 2026-01-13 17:36 (docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-13 17:27 (docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-13 17:14 (docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-13 17:05 (docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-13 14:17 (docker compose up --build -d, docker compose ps)
Last verified: 2026-01-13 12:56 (docker compose down/up --build -d; daily-test checks)
Last verified: 2026-01-13 12:48 (docker compose down/config/build/up --build -d, go test ./...)
Last verified: 2026-01-13 12:41 (docker compose down/config/build/up --build -d, go test ./...)
Last verified: 2026-01-13 12:01 (go test ./..., docker compose config/build, docker compose up --build -d)
Last verified: 2026-01-13 11:29 (go test ./..., docker compose config/build, docker compose up --build -d)
Last verified: 2026-01-13 10:50 (go test ./..., docker compose config/build, docker compose up --build -d)
Last verified: 2026-01-11 22:53 (go test ./..., docker compose config/build, docker compose up --build -d)

## Milestone 2 (Phase-2: F&O + snapshots + daily history + retention)
Status: In progress (metrics rollups + SLA dashboards wired; validation pending)

### Success Criteria
- [x] Phase-2 subscriptions (futures/options current month only) and WS sharding implemented
- [x] Quote snapshots, OI snapshots, PCR, option greeks, daily history loader implemented
- [x] REST market aggregates (gainers/losers, OI buildup, putCallRatio) snapshots implemented
- [x] Quote snapshot rotation budget for secondary kinds implemented
- [x] Max pain service computes per-strike pain curve + summary and triggers webhook on change
- [x] Intraday retention cleanup implemented
- [x] README and config updated for Phase-2
- [x] Live data validation for NIFTY100 + indices + F&O subscriptions (market hours) - WS streaming active (bars_1m source=ws)

### Sanity Checks
- [x] `docker compose config`
- [x] `docker compose build`
- [x] `docker compose up --build`
- [x] `go test ./...`
Last verified: 2026-02-01 09:21 (go test ./..., docker compose -p trading-stack down/up --build -d, docker compose ps)
Last verified: 2026-02-01 09:16 (go test ./..., docker compose -p trading-stack down/up --build -d, docker compose ps)
Last verified: 2026-02-01 08:53 (go test ./..., docker compose -p trading-stack down/up --build -d, docker compose ps)
Last verified: 2026-02-01 08:47 (go test ./..., docker compose -p trading-stack down/up --build -d, docker compose ps)
Last verified: 2026-02-01 08:12 (go test ./..., docker compose down/up --build -d, docker compose ps)
Last verified: 2026-02-01 08:18 (go test ./..., docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-14 11:10 (go test ./..., docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-14 10:54 (daily-test checks: docker compose ps/logs, DB metrics)
Last verified: 2026-01-14 10:38 (docker compose down/up --build -d, go test ./..., collector logs clean)
Last verified: 2026-01-13 23:17 (docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-13 17:36 (docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-13 17:27 (docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-13 17:14 (docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-13 17:05 (docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-13 14:17 (docker compose up --build -d, docker compose ps)
Last verified: 2026-01-13 12:56 (docker compose down/up --build -d; daily-test checks)
Last verified: 2026-01-13 12:48 (docker compose down/config/build/up --build -d, go test ./...)
Last verified: 2026-01-13 12:41 (docker compose down/config/build/up --build -d, go test ./...)
Last verified: 2026-01-13 12:01 (docker compose config/build/up --build -d, go test ./...)
Last verified: 2026-01-12 17:39 (docker compose config/build/up --build -d).

## Milestone 3 (Phase-3: Strategy + paper trading + alerts)
Status: In progress (signals/paper trades + exits implemented; runtime validation pending)

### Success Criteria
- [x] Strategy engine service runs in Docker (`cmd/strategy`)
- [x] Strategy/paper tables created via migrations
- [x] Strategy signals + paper trades stored in Postgres
- [x] Webhook alerts sent to n8n on new signals
- [x] Grafana dashboard `trading-stack-strategy` provisioned
- [x] Live orders disabled via config guardrail (no order/GTT REST calls)

### Sanity Checks
- [x] `docker compose config`
- [x] `docker compose build`
- [x] `docker compose up --build`
- [x] `go test ./...`
Last verified: 2026-02-01 09:21 (go test ./..., docker compose -p trading-stack down/up --build -d, docker compose ps)
Last verified: 2026-02-01 09:16 (go test ./..., docker compose -p trading-stack down/up --build -d, docker compose ps)
Last verified: 2026-02-01 08:53 (go test ./..., docker compose -p trading-stack down/up --build -d, docker compose ps)
Last verified: 2026-02-01 08:47 (go test ./..., docker compose -p trading-stack down/up --build -d, docker compose ps)
Last verified: 2026-02-01 08:12 (go test ./..., docker compose down/up --build -d, docker compose ps)
Last verified: 2026-02-01 08:18 (go test ./..., docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-14 11:10 (go test ./..., docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-14 10:54 (daily-test checks: docker compose ps/logs, DB metrics)
Last verified: 2026-01-13 17:36 (docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-13 17:27 (docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-13 17:14 (docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-13 17:05 (docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-13 14:17 (docker compose up --build -d, docker compose ps)
Last verified: 2026-01-13 12:56 (docker compose down/up --build -d; daily-test checks)
Last verified: 2026-01-13 12:48 (docker compose down/config/build/up --build -d, go test ./...)
Last verified: 2026-01-13 12:41 (docker compose down/config/build/up --build -d, go test ./...)
Last verified: 2026-01-13 12:01 (docker compose config/build/up --build -d, go test ./...)
Last verified: 2026-01-12 17:39 (docker compose config/build/up --build -d).

## Milestone 4 (Phase-3: A02 backtest + live signals)
Status: In progress (service + schema + dashboard live; awaiting data and alert wiring)

### Success Criteria
- [x] A02 backtest service builds and runs in Docker (`cmd/backtest`)
- [x] A02 backtest tables created via migrations (results, runs, daily stats)
- [ ] Daily close percentile table populated from `bars_1d`
- [ ] Daily backtest run executes on last trading day and persists summary
- [ ] Live backtest signals written and deduped during market hours
- [ ] Backtest webhook alerts sent to n8n (summary + live signals)
- [x] Grafana dashboard `trading-stack-backtest` provisioned

### Sanity Checks
- [x] `docker compose config`
- [x] `docker compose build`
- [x] `docker compose up --build`
- [x] `go test ./...`
Last verified: 2026-02-01 08:53 (go test ./..., docker compose -p trading-stack down/up --build -d, docker compose ps)
Last verified: 2026-02-01 08:47 (go test ./..., docker compose -p trading-stack down/up --build -d, docker compose ps)
Last verified: 2026-02-01 08:12 (go test ./..., docker compose down/up --build -d, docker compose ps)
Last verified: 2026-02-01 08:18 (go test ./..., docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-14 11:10 (go test ./..., docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-14 10:54 (daily-test checks: docker compose ps/logs, DB metrics)
Last verified: 2026-01-13 17:36 (docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-13 17:27 (docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-13 17:14 (docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-13 17:05 (docker compose down/up --build -d, docker compose ps)
Last verified: 2026-01-13 14:17 (docker compose up --build -d, docker compose ps)
Last verified: 2026-01-13 12:56 (docker compose down/up --build -d; daily-test checks)
Last verified: 2026-01-13 12:48 (docker compose down/config/build/up --build -d, go test ./...)
Last verified: 2026-01-13 12:41 (docker compose down/config/build/up --build -d, go test ./...)
Last verified: 2026-01-13 12:01 (docker compose config/build/up --build -d, go test ./...)

## Milestone 5 (Phase-3: A02 archive swing backtest)
Status: In progress (schema + runner in place; validation pending)

### Success Criteria
- [ ] Archive swing tables created via migrations
- [ ] `backtest --archive-swing` runs against local CSV minute bars
- [ ] Grafana dashboard shows latest swing runs and trades

### Sanity Checks
- [ ] `docker compose config`
- [ ] `docker compose build`
- [ ] `docker compose up --build`

## Milestone 6 (Phase-4.1: OHLCV-only strategy backtest)
Status: In progress (schema + runner wired; dashboards updated, validation pending)

### Success Criteria
- [x] Strategy backtest tables created via migrations
- [x] Strategy backtest runs alongside daily A02 run when enabled
- [x] Grafana dashboard includes strategy backtest runs + trades panels
- [ ] Strategy backtest produces trades and equity curve for last trading day

### Sanity Checks
- [x] `docker compose config`
- [x] `docker compose build`
- [x] `docker compose up --build`
- [x] `go test ./...`
Last verified: 2026-02-01 08:47 (go test ./..., docker compose -p trading-stack down/up --build -d, docker compose ps)
Last verified: 2026-02-01 08:12 (go test ./..., docker compose down/up --build -d, docker compose ps)
Last verified: 2026-02-01 08:18 (go test ./..., docker compose down/up --build -d, docker compose ps)
