# Production deployment validation

Deployed 28 August 2026 to Compose project `trading-stack-novius2`, service `n50-dashboard`.

- Image manifest: `sha256:12d94aca2f69bf2e3315e3ffc4341c5a816e867d8d4008cdb47ad44c8f704401`
- Served browser bundle: `index-Cbs-gtoG.js`
- Container: `trading-stack-novius2-n50-dashboard-1`
- Container state: running / healthy
- `/?lens=story`: HTTP 200
- `/?lens=sector-matrix`: HTTP 200
- `/full-board`: HTTP 200
- Production Compose default: enabled
- Stage Compose default: disabled

The initial restart accidentally targeted the inactive default Compose project. That one newly-created dashboard container could not resolve the active Redis service and was removed. No unrelated container or data was changed. The service was then recreated in the authoritative `trading-stack-novius2` project and passed health validation.

Rollback remains available with `N50_TODAY_SUMMARY_DETAIL_V1=false` followed by a dashboard-only rebuild and recreation in the same Compose project.
