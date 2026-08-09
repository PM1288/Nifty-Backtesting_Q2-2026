# Runtime inventory

Captured: 2026-08-09 UTC

## Trading deployment

- Compose project: `trading-stack-novius2`.
- Runtime working directory: `/home/novius2/trading-stack`.
- Active Compose files reported by the PostgreSQL container:
  `docker-compose.yml`, `compose.paper-trading.yml` and
  `compose.oiis-live.yml`.
- Additional `compose.base.yml` and `compose.core.yml` were supplied to a
  read-only service-list audit.
- Defined services across that inspected configuration: 31.
- Running project containers: 25.
- One-point aggregate resource sample: approximately 2,150 MiB memory and
  6.82% summed container CPU. This is not a time-series benchmark.

High-memory point samples:

| Service | Memory | Configured limit | Observation |
|---|---:|---:|---|
| option-chain-watcher | 496.4 MiB | 512 MiB | 96.96%; investigate first |
| market-data-gateway | 330.7 MiB | 384 MiB | 86.12%; investigate |
| PostgreSQL | 368.8 MiB | 1 GiB | normal point sample; measure over time |
| collector | 191.9 MiB | 512 MiB | protected SmartAPI owner |
| n50-dashboard | 95.7 MiB | 512 MiB | API plus bundled client serving |

The paper API, monitor, scheduler and webhook worker share one image but run as
separate commands. Several ingestion APIs and schedulers similarly share image
families. Phase 1 must distinguish process isolation from responsibility
duplication before recommending consolidation.

## Safety state

- Paper API liveness: `PAPER`.
- Paper API readiness: ready at migration `002_target_lifecycle`.
- Paper notification health: `DEGRADED_ALLOWED` at capture.
- OIIS and paper containers expose `PAPER_TRADING_ONLY` configuration.
- Collector has no broker-order service role in its container name and the
  code-level default forces `smartapi.disable_live_orders=true`; verify the
  resolved non-secret configuration during Phase 1.
