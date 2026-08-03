# Operations runbook

## Daily expected order

1. `ingest_recent`
2. `refresh_features`
3. `refresh_summaries`
4. `refresh_watchlists`
5. `refresh_exports`
6. `refresh_quality`

## Manual trigger

```bash
curl -X POST http://localhost:8091/api/v1/ops/run/refresh_summaries
```

## Inspect recent runs

```bash
curl http://localhost:8091/api/v1/ops/runs
```

## Recovery after failure

1. inspect `nse_ops.job_run.stderr_tail`
2. confirm upstream data exists for latest trade date
3. rerun the failed job only
4. rerun `refresh_quality`

## Common causes of failure

- upstream schema drift
- wrong `JOB_CMD_*` values
- scheduler and app containers using different Python environments
- PostgreSQL permissions on `nse_ops` schema
