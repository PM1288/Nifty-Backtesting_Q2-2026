# Paper market-data sustained-outage threshold — 2026-08-24

## Change

The paper-monitor market-data freshness threshold was doubled from 180 seconds to 360 seconds. A paper market-data stale/outage incident will now require six minutes without a fresh monitored bar during the NSE session before the monitor opens a new incident.

This is deliberately scoped to the paper-trading freshness gate. Strategy rules, quote display freshness, collector SLAs, option-chain checks, and other data-quality thresholds were not changed.

## Configuration

- Runtime setting: `MARKET_DATA_STALE_SECONDS=360`
- Compose override: `PAPER_MARKET_DATA_STALE_SECONDS`
- Compose default: `360`
- Application default: `360`

## Files

- `services/paper_trading/src/papertrade/config.py`
- `services/paper_trading/.env.example`
- `compose/compose.paper-trading.yml`

The same scoped changes were applied to `/home/novius2/trading-stack` for deployment.

## Deployment and validation

- Rebuilt image: `trading-stack-paper-trading:1.0.0`
- Recreated only: `trading-stack-novius2-paper-monitor-worker-1`
- Container environment reports `MARKET_DATA_STALE_SECONDS=360`.
- Loaded Pydantic settings report `360`.
- Baked image default reports `360` even without the compose override.
- Worker remains running after recreation.
- `git diff --check` passes for the three source files.

## Rollback

Set `PAPER_MARKET_DATA_STALE_SECONDS=180`, recreate only `paper-monitor-worker`, and restore the source/config defaults to 180 if the change is to be permanently reverted.
