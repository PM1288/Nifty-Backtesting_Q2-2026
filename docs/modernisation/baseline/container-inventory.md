# Container inventory

Captured: 2026-08-09 UTC

The trading project had these 25 running services:

```text
postgres
redis
nginx
collector
nse_ingestor
nse-analytics-worker
nse-orchestrator
nse-export-api
nse-intraday-api
nse-intraday-scheduler
nse-reco-api
nse-reco-scheduler
market-data-gateway
nifty100-disclosures-api
nse-fii-reports-api
institutional-flow-ingest-scheduler
cdsl-fii-daily-ingest
option-chain-watcher
n50-dashboard
n50-discord-stream-dispatcher
paper-api
paper-monitor-worker
paper-webhook-worker
paper-scheduler
oiis-live
```

Third-party base images include PostgreSQL 16 and Redis Alpine. Application
images are primarily `latest`; OIIS and paper trading use `1.0.0`. Immutable
release identification and aggregate image-size measurement remain Phase 1
work. No container was stopped, recreated or removed during capture.

The host runs many unrelated Compose projects. Trading modernisation commands
must always use project name `trading-stack-novius2` and exact Compose files;
global Docker cleanup commands are prohibited.
