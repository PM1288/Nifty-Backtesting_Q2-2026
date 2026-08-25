# Paper Trade WhatsApp V3 UX Review and Cutover

Date: 12 August 2026 (UTC/IST-aware implementation)

## Source reviewed

- Archive: `/home/novius2/NIFTY50/webhook-update/paper_trade_whatsapp_v3.zip`
- Validated: ZIP central directory and all eight entries passed `unzip -tq`.
- Review extraction: `/home/novius2/NIFTY50/webhook-update/review-paper-trade-whatsapp-v3/`

The supplied package was treated as a UX and policy reference. It was not imported over the active workflow because the production route, authentication and WhatsApp credential bindings were already working.

## Production behaviour adopted

- Stock symbol and lifecycle state lead each trade message.
- `trade_intent.accepted` is suppressed because it is not a fill.
- analytical target notifications are suppressed by default because they do not change the execution position.
- execution-target precursor events remain suppressed.
- actual fills, material risk events, closes and summaries remain eligible.
- open messages show side, entry price/time, quantity, notional, active executable target, swing target, strategy/version and trade reference.
- close messages show profit/loss, net result and return on entry notional, side/quantity, entry/exit times, duration, close reason, gross/cost/tax/net economics, best/worst move, strategy/version and trade reference.
- every trade lifecycle message explicitly states PAPER mode and that no broker order is involved.
- long and short returns remain direction-aware.

## Data enrichment

New events are self-contained with:

- `strategy_version`
- `client_group_id`
- `opened_at` / `closed_at`
- current MFE / MAE
- executable intraday target
- executable swing target
- latest execution target code used as the close reason

No PostgreSQL schema or paper-trading calculation was changed.

## Validation evidence

- Supplied formatter suite: 11/11 passed.
- Repository notification-policy suite: 16/16 passed.
- Paper event/domain tests: 12/12 passed.
- Python and JavaScript syntax checks passed.
- Transactional rollback test against the production schema confirmed all required event-enrichment fields without retaining a test event.
- Active n8n workflow API read/update: HTTP 200/200.
- Authenticated production webhook delivery test: HTTP 200 with gateway status `sent`.
- Anonymous webhook test: HTTP 401, confirming authentication remains enforced.
- All paper service containers were rebuilt and are running; the API reports ready.
- Production outbox at validation time: 384 delivered, zero pending/retry/dead-letter.

## Rollback

- n8n workflow backup: `/home/novius2/backups/n8n/2026-08-12-paper-whatsapp-v3-ux/workflow-before.json`
- Disable or restore only the formatter workflow if message formatting must be reverted.
- Backend change is additive event payload enrichment and can be reverted without a database migration.
