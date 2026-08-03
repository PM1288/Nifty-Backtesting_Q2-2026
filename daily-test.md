# Daily Test Checklist (Market Hours)

Use this when the market is open to confirm ingestion and dashboards quickly.

## 1) Docker + services
- `docker info --format "{{.ServerVersion}}"`
- `docker compose ps`

Expected: collector, postgres, grafana, nginx (and optional loki/promtail) are Up/healthy.

## 2) Collector health + recent logs
- `docker compose logs --since 5m collector`

Expected: no repeating errors; WS connected during market hours; REST fallback only on WS gaps.

## 3) Data flowing into Postgres
- `docker compose exec -T postgres psql -U trader -d tradingdb -c "SELECT now() AS ts;"`
- `docker compose exec -T postgres psql -U trader -d tradingdb -c "SELECT max(ts) AS latest_bar_utc FROM bars_1m;"`
- `docker compose exec -T postgres psql -U trader -d tradingdb -c "SELECT count(*) AS bars_last_5m FROM bars_1m WHERE ts > now() - interval '5 minutes';"`
- `docker compose exec -T postgres psql -U trader -d tradingdb -c \"SELECT coverage_ratio, bars_written, bars_missing FROM metrics_1m WHERE source_name='equity_bars_1m' ORDER BY minute_ts DESC LIMIT 1;\"`
- `docker compose exec -T postgres psql -U trader -d tradingdb -c \"SELECT coverage_ratio, staleness_max_sec FROM metrics_1m WHERE source_name='equity_ticks' ORDER BY minute_ts DESC LIMIT 1;\"`

Expected during market hours:
- `bars_last_5m` should be > 0.
- `coverage_ratio` should be near 1.0.
- `bars_missing` should be 0 or very small (within 2 minutes of close).

## 4) Strategy + backtest services
- `docker compose logs --since 5m strategy`
- `docker compose logs --since 5m backtest`
- `curl -s <BASE_URL>/backend/strategy/params?scope=backtest_a02`

Expected: backtest service emits daily run logs; params endpoint returns JSON list.

## 5) Grafana dashboards
- Grafana: `<BASE_URL>` (admin/admin1234)
- Dashboards:
  - Trading Stack Overview
  - Trading Stack SLA
  - Backtest A02 (live heartbeat age panel should be updating)
  - Strategy (A02 parameter editor panel should load)

Expected: panels populate within 30-60 seconds.

## 6) Quick failure triage
- If `bars_last_5m = 0`, check WS connection errors in collector logs.
- If coverage is low, confirm subscriptions table and instrument_universe are populated.
- If Grafana panels are empty, verify datasource `postgres` exists and points to `postgres:5432`.
