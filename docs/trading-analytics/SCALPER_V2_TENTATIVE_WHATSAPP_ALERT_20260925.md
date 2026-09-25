# Scalper V2 tentative CE/PE WhatsApp alert — 2026-09-25

## Behavior

When the live Scalper V2 view identifies a new, completed 5-minute
three-instrument EMA9 reference for its selected underlying and exact CE/PE
pair, it submits the evidence to an authenticated, CSRF-protected API route.
The API validates the exact rule/state, direction-side mapping, both option
volume confirmations, instrument identities, current IST session date and a
ten-minute freshness window. The event is inserted into an additive PostgreSQL
outbox under a server-derived SHA-256 identity, so refreshes and duplicate tabs
cannot create another message for that same symbol/expiry/direction/pair/time.

The existing `scalper-entries` scheduler job drains this outbox and sends to the
configured `WA_MYSELF_CHAT_ID`, the same gateway destination used by the OIIS
alerts. It reuses the existing mounted WhatsApp gateway token and idempotency
header. Failed sends retry with bounded exponential delay; events older than
ten minutes are suppressed rather than sent late.

The WhatsApp text includes the snapshot candle end time in IST, expiry, exact
underlying/CE/PE values and EMA9 references, option volume-to-EMA20 ratios, and
the cross times. It says “Tentative chart reference only” and explicitly
disclaims an order, trade, fill, target or exit. It does not change the EMA
calculation, order controls or OIIS selection/deduplication.

## Changed files

- `neon-stock-terminal/apps/web/src/pages/TradingAnalyticsScalperV2.tsx`
- `neon-stock-terminal/apps/web/src/lib/api.ts`
- `neon-stock-terminal/apps/api/src/routes/tradingAnalytics.ts`
- `neon-stock-terminal/apps/api/src/routes/index.ts`
- `neon-stock-terminal/apps/api/src/routes/scalperV2TentativeAlert.test.ts`
- `services/nse_intraday_intelligence/src/nse_intraday_intelligence/scalper_v2_tentative_alerts.py`
- `services/nse_intraday_intelligence/src/nse_intraday_intelligence/manual_jobs.py`
- `services/nse_intraday_intelligence/tests/test_scalper_v2_tentative_alerts.py`
- `db/sql/062_scalper_v2_tentative_alert_outbox.sql`
- `scripts/db_migrate_all.sh`
- `docs/uiux/FEATURE_PRESERVATION_MANIFEST_2026-08-25.md`
- `AGENT_HANDOFF.md`

## Validation and deployment record

- Web typecheck and production build passed; web unit tests passed **283/283**.
- API typecheck and production build passed; API unit tests passed **274/274**,
  including the new tentative-alert endpoint tests **2/2**.
- Python source compiled; the new WhatsApp formatter fixture passed using the
  scheduler image's installed dependencies. Repository preservation gate,
  Compose configuration and `git diff --check` passed.
- The authenticated production route returned **401** for an anonymous POST,
  confirming the API auth boundary. A fetch of the deployed Scalper V2 asset
  confirmed the tentative-alert endpoint is in the current bundle.
- The additive outbox migration is applied and its table is present. The live
  scheduler outbox drain returned `COMPLETE`, 0 delivered, 0 failed, 0 stale;
  the table contained zero events at verification time.
- The deployed OIIS and intraday-scheduler containers have matching configured
  WhatsApp group destinations. Scheduler WhatsApp is enabled and its token is
  mounted. Dashboard is healthy with zero restarts; scheduler is running with
  zero restarts. Images: dashboard
  `sha256:8db85d7346e6bccdd0a8efac8b124759227c03ac8c2ed19462146ca7407043ff`,
  scheduler
  `sha256:90a87491631e78fb3f6799cbad6bd4aa01f7f71df342161094df45c2bd96137a`.
- Source code commit `1580791` was merged to pushed `master` at `6af2812`.
- No synthetic alert was broadcast to the user's WhatsApp group. Therefore
  delivery of a real alert has not been observed yet; the first genuine fresh
  qualifying signal will provide that end-to-end delivery evidence. Signals
  older than ten minutes are intentionally suppressed.
