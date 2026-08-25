# Current deployment identity

Captured: 2026-08-23 13:43 UTC

## Source mirror

- Root: `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026`
- Branch: `codex/trading-stack-modernisation-20260809`
- Commit: `c0a2d747ba2c1167f32c8ecba9fb91d475fe52cf`
- Working tree at capture: 134 tracked modifications and 184 untracked entries. These pre-existing/user changes are preserved; no reset or cleanup is authorised.
- Governing package: `/home/novius2/NIFTY50/UI-UX-aug-2026/NIFTY50_TRADER_MODERNISATION_HANDOVER_2026-08-23`

## Runtime integration tree

- Root: `/home/novius2/trading-stack` (not a Git checkout)
- Compose project: `trading-stack-novius2`
- Compose file: `/home/novius2/trading-stack/docker-compose.yml`
- Public base path: `/n50`

## Decision-critical images

| Service | Image ID at capture | State |
| --- | --- | --- |
| `n50-dashboard` | `sha256:d815855601f28c38131e435765ff5ad6f71c789ad62276a9dbb8b3e27aeae2f9` | healthy; rebuilt 2026-08-23 13:48 UTC for P0-004/P0-005 |
| `paper-api` | `sha256:5f5495ff77d88e8dabd220f014d41218f2412078d06ae6470a616e192870dc68` | healthy; unchanged |
| `collector` | `sha256:21051deeb8f531a47b4d5e0a1371c0a684f798c0683e15aa37b17a2e5febbb9b` | healthy; unchanged |

PostgreSQL remains the existing `postgres:16` service and Redis remains the existing `redis:alpine` service. No database schema, collector, SmartAPI logic, paper worker, or production data was changed by the Futures repair.

## Database catalogue checkpoint

Relations at capture: `public=125`, `paper_trading=64`, `nse_app=41`, `nse=25`, `institutional_flow=22`, `rolling_monthly=18`. Migration ledgers are present in `public.schema_migrations`, `nse.schema_migrations`, `paper_trading.schema_migrations`, and `fno_volatility.schema_migration`.

## Correlation caveat

The source mirror and runtime tree are separate and may drift. Every deployed slice must be applied to both deliberately, tested in the source mirror first, and record the resulting image ID here. A source-only test is not deployment proof.
