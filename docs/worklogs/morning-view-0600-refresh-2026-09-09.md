# Morning View 06:00 IST refresh repair — 2026-09-09

## Root cause

Morning View reads `market_data.nse_fii_derivatives_stats`,
`market_data.nse_fii_participant_open_interest`, and the normalized cash FII/DII
dataset. The dedicated NSE report service had `AUTO_PULL_ENABLED=false`, and its
old periodic scheduler only downloaded files; it did not load them into the
PostgreSQL tables read by the dashboard. The general institutional-flow and CDSL
schedulers were set to 08:10 and 08:00 IST respectively. Therefore no coherent
06:00 Morning View refresh existed.

Before correction on 9 September, the dashboard report tables stopped at
7 September even though 8 September was the latest completed exchange session.
The existing official-source pull was tested manually and successfully retrieved
and loaded the complete 8 September set: 5 participant OI rows,
5 participant-volume rows, and 16 FII derivatives-statistics rows. The
normalized cash FII/DII dataset also contained 8 September.

## Implemented behavior

- Schedule: `06:00 Asia/Kolkata`.
- Startup catch-up after 06:00.
- Official NSE latest-complete-report pull followed by PostgreSQL load.
- PostgreSQL advisory lock prevents concurrent duplicate publication.
- The returned report date must equal the latest completed session in
  `public.trading_calendar`; an older fallback is not labelled current.
- Late/missing reports retry hourly by default.
- Loader remains rerunnable and replaces only the same deterministic daily
  `run_id`; tables are never truncated.
- `/health` exposes schedule, last attempt/success, report date, next run, and a
  non-sensitive error class.
- Morning View refetches every 60 seconds while visible and retains React Query's
  normal focus refresh behavior.
- Institutional-flow and CDSL morning schedules now default to 06:00 IST so the
  related daily context is prepared in the same morning window.

## Verification commands

```bash
docker exec trading-stack-novius2-postgres-1 sh -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off -c \
  "SELECT max(trade_date) FROM market_data.nse_fii_derivatives_stats;"'

curl -fsS http://127.0.0.1:8001/health

docker logs --since 24h \
  trading-stack-novius2-nse-fii-reports-api-1 2>&1 | \
  grep 'NSE FII morning refresh'
```

## Test evidence

- NSE report service: 31 tests passed.
- Dashboard web suite: 98 tests passed.
- Dashboard web TypeScript typecheck: passed.
- Python compile check: passed.

## Operational note

The reports are previous-session daily institutional context, not live intraday
flows. At 06:00 on 9 September the correct target report date is 8 September.
If NSE has not published the expected set, Morning View must show the older date
as stale/partial while the scheduler retries; it must not fabricate current data.
