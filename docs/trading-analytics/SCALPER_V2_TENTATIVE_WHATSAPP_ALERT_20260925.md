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

This file is updated as checks and release evidence are completed. Do not treat
an application build or a synthetic fixture as proof of a real WhatsApp
delivery. A live message is only sent in response to a genuine fresh setup; no
synthetic market event is broadcast to the user's group for testing.
