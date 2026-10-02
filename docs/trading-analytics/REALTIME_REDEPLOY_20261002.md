# Collector resilience upgrade and redeployment — 2 October 2026

## Scope and defect

Follow-up to the real-time ingestion review. The sampled raw-tick archive flushed
only its current batch on cancellation and abandoned its upstream queue. A final
partial-batch failure on closed input could also return success. This caused an
avoidable gap during routine collector restarts even with a healthy database.

Bars and ticks now use the same bounded batch writer. The sole producer closes the
archive channel on exit. Cancellation opens a separate five-second drain window;
queued batches and the final partial batch are retried, with a three-second limit
per database call. Expiry returns an error and logs the pending count. The deadline
is checked before each loop so ready input cannot starve shutdown. Existing batch
sizes, tick sampling and normal flush intervals are retained.

No schema, strategy model, dashboard, dependency version, authentication, order or
notification changes are required. This is an application reliability upgrade.
The archive remains best effort: process termination, queue overflow or an outage
longer than the drain deadline can still lose sampled raw ticks; no disk WAL exists.

## Validation

`go test -race ./...` passed. Added regressions cover multi-batch tick drain after
cancellation, transient write failures, a final partial batch on closed input, and
the five-second shutdown deadline during an unresponsive database call.
The canonical gate and `git diff --check` passed. PostgreSQL integration tests that
require an explicit integration environment are not counted as run by this command.
Evidence: `/home/novius2/NIFTY50/evidence/realtime-redeploy-20261002`.

## Release commands

Run in `/home/novius2/trading-stack`, only after committing, pushing and merging
the named branch to pushed master:

```bash
go test -race ./...
bash scripts/verify/canonical-repository-gate.sh
git diff --check
docker image tag "$(docker inspect -f '{{.Image}}' trading-stack-novius2-collector-1)" trading-stack-collector:before-shutdown-drain-20261002
docker compose -p trading-stack-novius2 --env-file .env -f docker-compose.yml build collector
docker compose -p trading-stack-novius2 --env-file .env -f docker-compose.yml up -d --no-deps --no-build collector
curl --fail --silent http://127.0.0.1:18080/readyz
```

Authenticated realtime and canonical browser checks use the protected deployment
password through environment variables; never paste it into a command or document.
Use `tools/playwright/realtime-feed-regression.mjs` and
`tools/playwright/canonical-feature-regression.mjs` with
`PLAYWRIGHT_BASE_URL=https://n50.nifty50today.co.in/n50` and
`PLAYWRIGHT_ORIGIN=https://n50.nifty50today.co.in`.

Rollback only this collector image; preserve all database volumes:

```bash
docker image tag trading-stack-collector:before-shutdown-drain-20261002 trading-stack-novius2-collector:latest
docker compose -p trading-stack-novius2 --env-file .env -f docker-compose.yml up -d --no-deps --no-build collector
```

Live market latency cannot be measured while the persisted exchange calendar is
closed. Readiness and authenticated snapshot/reconnect checks do not establish
market-hour throughput. See the prior review for NSE source HTTP-404 limitations.
