# Nifty 250 SmartAPI collector implementation and operator handoff

Date: 2026-08-08

## Scope implemented

- Official Nifty LargeMidcap 250 universe (250 unique equities).
- Cash websocket collection for all resolved equities.
- F&O planning for every constituent with SmartAPI NFO contracts.
- Stock options: nearest expiry, ATM, ATM minus 1/2/3 strikes and ATM plus 1/2/3 strikes, for both CE and PE.
- Stock futures: nearest and next available expiries.
- Indices: Nifty 50, Bank Nifty, Fin Nifty, Midcap Select, Nifty 100, Nifty 200, Nifty 500, India VIX and Sensex.
- Resumable three-year daily historical backfill.
- REST collection for capacity-dropped stock options.

## Main files

- `scripts/update_nifty250_universe.py`: downloads and validates Nifty 100 + Nifty Midcap 150 official files and writes exactly 250 unique symbols.
- `samples/nifty250.sample.csv`: collector cash symbols.
- `docs/source/ind_niftylargemidcap250list.csv`: constituent metadata.
- `internal/universe/universe.go`: per-index exchange routing, including Sensex/BSE.
- `internal/universe/derivatives.go`: current/next futures and ATM +/- 3 stock-option selection.
- `cmd/collector/tasks.go`: incremental history and capacity-dropped option REST rotation.
- `internal/store/postgres.go`: `LatestBar1DDate` resume checkpoint.
- `config/config.yaml`: production universe and rate-limit configuration.

## Commands

Refresh the official universe:

```bash
cd /home/novius2/trading-stack
python3 scripts/update_nifty250_universe.py
```

Test:

```bash
go test ./internal/universe ./internal/store ./cmd/collector
python3 -m py_compile scripts/update_nifty250_universe.py
docker compose --env-file .env -p trading-stack-novius2 -f compose/compose.base.yml -f compose/compose.core.yml config --quiet
```

Build and deploy only the collector:

```bash
docker compose --env-file .env -p trading-stack-novius2 -f compose/compose.base.yml -f compose/compose.core.yml build collector
docker compose --env-file .env -p trading-stack-novius2 -f compose/compose.base.yml -f compose/compose.core.yml up -d --no-deps --force-recreate collector
```

Monitor:

```bash
docker logs -f --since 5m trading-stack-novius2-collector-1
docker inspect trading-stack-novius2-collector-1 --format '{{.State.Health.Status}} {{.State.Status}}'
```

Database checks:

```sql
SELECT kind, count(*) FROM subscriptions WHERE active GROUP BY kind ORDER BY kind;
SELECT plan_name, count(*), count(*) FILTER (WHERE active), count(*) FILTER (WHERE NOT active)
FROM derivative_token_plan
WHERE plan_date = (SELECT max(plan_date) FROM derivative_token_plan)
GROUP BY plan_name;
SELECT count(*), count(DISTINCT symbol_token), min(trade_date), max(trade_date) FROM bars_1d;
SELECT name, success, throttled, count(*) FROM api_request_log
WHERE ts > now() - interval '10 minutes' GROUP BY name, success, throttled;
```

## Initial deployment evidence

- Collector resolved `base=259`: 250 equities plus 9 indices.
- Full derivative selection was `3119`; stock derivative plan contained `2953` rows across 188 F&O-eligible constituent underlyings: 375 futures and 2,576 options.
- Broker websocket capacity retained 3,000 total active subscriptions. The latest plan marked 376 stock options as capacity-dropped.
- Capacity-dropped stock options are included first in the one-minute batched REST option quote rotation. Live evidence: 10 API calls requested and returned 496 contracts, including all 376 capacity-dropped stock options, with zero throttles and zero failures.
- Historical backfill completed for all 259 cash/index tokens: 250 equities and 9 indices. `bars_1d` contains 198,852 rows spanning 2023-01-09 through 2026-08-07.
- The final backfill verification recorded zero failed and zero throttled daily-history calls.
- Outside-market one-minute REST fallback was disabled to prevent repeated weekend/overnight quota use.
- Websocket read timeouts now return to the reconnect manager; this fixed the Gorilla websocket `repeated read on failed websocket connection` panic observed during deployment.

## Tables to monitor

- `public.subscriptions`
- `public.derivative_token_plan`
- `public.instrument_state`
- `public.bars_1m`
- `public.bars_1d`
- `public.quote_snapshots`
- `public.oi_snapshots_options`
- `public.oi_snapshots_futures`
- `public.api_request_log`

## Monthly partition convention

High-volume timestamp tables remain consolidated logical parents, but their physical storage is split monthly using readable `table_YYYY_MM` names. Examples are `bars_1m_2026_08`, `quote_snapshots_2026_08` and `oi_snapshots_options_2026_08`.

The production conversion command is:

```bash
docker compose --env-file .env -p trading-stack-novius2 -f compose/compose.base.yml -f compose/compose.core.yml stop collector
docker exec -i trading-stack-novius2-postgres-1 psql -U trader -d tradingdb < scripts/migrate_timeseries_monthly_partitions.sql
docker compose --env-file .env -p trading-stack-novius2 -f compose/compose.base.yml -f compose/compose.core.yml up -d --no-deps collector
```

Converted parents: `bars_1m`, `quote_snapshots`, `option_greeks`, `oi_snapshots_equity`, `oi_snapshots_index`, `oi_snapshots_futures` and `oi_snapshots_options`. Existing `depth_5_snapshots` partitions were renamed to the same convention. `bars_1d` remains one indexed table because its volume is small and daily cross-stock analysis benefits from one compact relation.

Validation completed on 2026-08-08:

- `bars_1m`: 23,574,269 rows before and after.
- `quote_snapshots`: 99,938 rows before and after.
- `option_greeks`: 18,345 rows before and after.
- All four OI tables matched their recovery-copy counts.
- Live writes subsequently landed in `quote_snapshots_2026_08` and `oi_snapshots_options_2026_08`.
- Recovery originals are retained under schema `migration_backup_20260808`, outside the normal `public` table list.
