# Baseline performance and footprint

Captured: 2026-08-09 UTC

These are bounded audit measurements. A point sample is labelled as such and
must not be presented as a sustained-load result.

## Runtime footprint

| Metric | Baseline | Method/qualification |
|---|---:|---|
| Running containers | 25 | Compose project label inventory |
| Base Compose services | 26 | Sanitised `docker compose config --services` |
| Total point-sample memory | about 2,150 MiB | Sum of one `docker stats --no-stream` capture |
| Total point-sample CPU | 6.82% | Sum of one `docker stats --no-stream` capture |
| PostgreSQL database size | 119,168,547,863 bytes | `pg_database_size('tradingdb')` |
| Tracked Git files | 1,789 | `git ls-files` |
| Git object footprint | about 137.46 MiB loose | `git count-objects -vH` |
| Local StratLab outputs | about 82 GiB | Untracked/ignored research outputs; not source |
| Local StratLab virtualenv | about 721 MiB | Generated environment; not source |
| API build | 6.40 s, 537,256 KiB peak RSS | Existing installed dependencies, warm host filesystem |
| Web build | 19.76 s, 738,084 KiB peak RSS | Includes TypeScript check; Vite phase 8.73 s |
| Web dist | 4.4 MiB | Existing production build |
| API dist | 936 KiB | Existing TypeScript output |
| StratLab full test suite | 4.50 s, 268,416 KiB peak RSS | 94 existing tests; not a backtest throughput benchmark |
| PostgreSQL connections during online dump | 24 total, 4 active | Includes `pg_dump` and audit `psql`; 18 ordinary idle plus 3 idle collector sessions |
| Backtesting overview through Nginx during online dump | p50 4.61 ms, p95 14.49 ms, p99 26.71 ms | 30 sequential GETs, all HTTP 200; mean 7.53 ms, max 54.67 ms |
| Intraday raw-sync job | 174.5 s average; 1,072.7 s maximum | 625 successful runs in the seven-day ledger window |
| Intraday feature-refresh job | 358.3 s average; 1,578.9 s maximum | 329 successful runs; current cron is every minute |
| Weekly intraday history backfill | 2,330.6 s | One successful run, about 38.8 minutes |

Selected local image sizes from the deployed image inventory:

| Image | Baseline size |
|---|---:|
| option-chain-watcher | 3.19 GiB |
| N50 dashboard | 861 MiB |
| disclosures pipeline | 752 MiB |
| institutional-flow ingest | 742 MiB |
| StratLab | 712 MiB |
| PostgreSQL 16 | 636 MiB |
| market-data gateway | 553 MiB |
| analytics worker | 447 MiB |
| Nginx core | 92.7 MiB |

The option-chain image is the first image-layer audit target. No rebuild or base
image switch is justified until its Dockerfile, native/browser dependencies and
runtime requirements are measured.

The 82 GiB output directory and 721 MiB virtual environment are active local
research artefacts. They are cleanup candidates only after evidence manifests
and reproducibility checks; they are not part of the Git object database and
must not be copied into Docker build contexts.

## Health and functional baseline

| Check | Result |
|---|---|
| Base Compose configuration | PASS |
| PostgreSQL container health | PASS, zero restarts at capture |
| Container Nginx `/n50/health` | PASS |
| Container Nginx root `/health` | BASELINE 404 |
| Paper API live/ready | PASS; `PAPER` environment |
| SmartAPI Go package tests | PASS |
| Host `nginx -t` | PASS |
| Paper notification health | DEGRADED_ALLOWED baseline |
| API TypeScript/test | PASS; 57/57 tests |
| Web TypeScript/build | PASS |
| Repository Compose verification helpers | BASELINE FAIL | Require a source-root `.env`; the protected source checkout intentionally has none, while the runtime mirror owns deployment configuration |
| Hashed asset caching | BASELINE FAIL | Nginx-proxied Vite asset returned `public, max-age=0`, not immutable caching |
| Nested SPA route through Nginx | PASS | `/n50/backtesting/lab` currently falls back to SPA HTML |

## Database footprint concentration

Largest observed relations include:

| Relation | Approximate total size | Approximate rows when available |
|---|---:|---:|
| `research.security_minute_technical` | 46.5 GiB | 85.2 million |
| `oiis.decision_snapshot` | 18.8 GiB | 6.9 million |
| legacy minute-bar migration backup | 6.69 GiB | 23.6 million |
| `nse.dim_security_master_snapshot` | 5.44 GiB | catalogue estimate |
| `nse_app.backtest_daily_equity` | 3.74 GiB | 10.77 million |
| `public.instruments` | 3.29 GiB | 1.09 million |

No deletion or repartitioning conclusion is implied. Query workload, index use,
retention classification and preservation proof are required first.

## Measurements still required

- 15-minute idle and representative replay CPU/RAM time series.
- Per-image compressed/uncompressed footprint and clean build duration.
- Repeat Nginx-to-API p50/p95/p99 after the dump and for authenticated mutation
  endpoints; the initial read baseline above was captured under dump load.
- WebSocket delivery and market replay throughput/lag.
- Fixed-dataset backtest runtime, peak RSS and output hash.
- PostgreSQL connection count and selected-query execution plans at idle/load.
- Re-sample PostgreSQL connections after the online dump; the first figure is a
  dump-time upper-context sample and does not justify PgBouncer.
- Log bytes per minute and restart/recovery time.

The intraday cron/runtime mismatch is a real optimisation target. It must be
corrected through cadence, incremental-watermark and SQL-plan work rather than
by launching overlapping copies of the same database-heavy job.

Final comparison must repeat the same fixtures and sampling window. It must not
claim an improvement solely from a different workload or warm cache.
