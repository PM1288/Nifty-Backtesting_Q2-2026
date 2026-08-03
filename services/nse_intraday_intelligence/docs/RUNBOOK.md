# Runbook

## Daily runtime model

### During market hours
- sync raw minute bars
- refresh features
- refresh dashboard
- refresh watchlists
- run quality checks periodically

### After the close
- finalize session
- run retention later
- optionally backfill history on weekends

## If summary is missing
Check in this order:

1. Are compatibility views returning rows?
2. Are raw minute tables receiving data?
3. Did feature refresh run successfully?
4. Is `market_session_summary` populated?
5. Did dashboard snapshot refresh run?

## If breadth looks wrong
Check:
- universe membership view
- weight coverage
- missing minute rows in the basket
- clock skew between index and stock feeds

## If state labels look noisy
Check:
- missing prior close data
- sparse minute bars
- partial session refresh
- incorrect index code selection

## Suggested alert thresholds

- no raw minute bars for current session
- index feed missing while stock feed exists
- snapshot lag > 5 minutes
- less than 80 stock rows in live table
- missing prior-close coverage > 0

## Live guards and alerts

- `/api/v1/intraday/ops/status` now returns `guards` and `alert_states` so you can see current data freshness without checking tables manually.
- Guard checks cover source freshness, raw-sync lag, snapshot freshness, and live stock row count.
- Guard transitions are stored in `nse_ops.alert_state_intraday` even when webhook delivery is disabled.

## Alert configuration

- `NSE_INTRADAY_LIVE_SOURCE_MAX_DELAY_SECONDS`
- `NSE_INTRADAY_RAW_SYNC_MAX_LAG_MINUTES`
- `NSE_INTRADAY_SNAPSHOT_MAX_LAG_MINUTES`
- `NSE_INTRADAY_MARKET_OPEN_LIVE_STOCK_MIN_ROWS`
- `NSE_INTRADAY_ALERTS_ENABLE_WEBHOOK`
- `NSE_INTRADAY_ALERTS_WEBHOOK_URL`
- `NSE_INTRADAY_ALERTS_WEBHOOK_TIMEOUT_SECONDS`
- `NSE_INTRADAY_ALERTS_WEBHOOK_HEADERS`
- `NSE_INTRADAY_ALERTS_COOLDOWN_MINUTES`
- `NSE_INTRADAY_ALERTS_SEND_RECOVERY`

## Typical operator checks

1. Call `/api/v1/intraday/ops/status` and confirm all `guards.checks[].passed` values are `true`.
2. If a guard is failing, inspect `alert_states` to see whether the condition is new, ongoing, or recovered.
3. If `intraday_source_freshness` is failing, start with collector health and `public.bars_1m`.
4. If `intraday_raw_sync_lag` is failing, inspect recent `intraday_sync_raw` runs and raw table timestamps.
5. If `intraday_snapshot_freshness` is failing, inspect `intraday_refresh_dashboard` runs.
