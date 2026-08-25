# Market and OIIS WhatsApp Notifications

## Safety boundary

This is a new, independent informational pipeline. It does not change the paper-trade API,
paper-trade webhook URL, order/fill logic, positions, targets, P&L, or existing n8n workflow.
Every payload states `trading_mode=PAPER` and `environment=INFORMATIONAL`; the worker contains no
broker adapter or order action.

## Trading-day schedule (Asia/Kolkata)

| Time | Event | Contents |
|---|---|---|
| 09:16 | Market open check | NIFTY 50 level, points and percent versus previous close, opening range |
| 09:20 | F&O cash movers | Top five gainers and losers from the active stock-F&O cash universe |
| 15:30 | Day summary | NIFTY open-to-15:30 point/percent delta, range, and change versus previous close |
| After each completed OIIS run | OIIS leaders | At most three LONG and three SHORT names where both O and X are strictly greater than 70 |

The market schedules are read from `public.trading_calendar`; weekends and exchange holidays are
skipped. A scheduled event waits up to 30 minutes for a current source bar, then records a
suppression instead of sending stale or fabricated data.

## Noise controls

- An OIIS notification is not created when no row clears both strict thresholds.
- Only the LONG/SHORT symbol membership is compared. Score or rank-only changes do not generate another message.
- A changed long or short symbol set creates one durable event.
- The last-sent signature advances only after n8n returns success.
- Every scheduled event and OIIS run has a unique database event key.
- n8n also deduplicates `event_id` for 48 hours.
- Delivery retries are durable, exponentially backed off, and dead-lettered after eight attempts.
- Startup sets the OIIS watermark to the current time, preventing retrospective alert floods.

## PostgreSQL records

Migration `db/sql/036_market_notification_outbox.sql` creates:

- `market_notifications.notification_event` — immutable intent, suppression and delivery state;
- `market_notifications.delivery_attempt` — every HTTP attempt and result;
- `market_notifications.notification_state` — OIIS watermark and last delivered leader signature;
- `market_notifications.service_heartbeat` — worker health and latest activity.

## n8n route

Import `n8n/NIFTY50_Market_OIIS_WhatsApp_Low_Noise_v1.json`, attach the existing inbound Basic Auth
credential and the approved outbound `X-API-Token` credential, then activate it. The route is:

```text
POST /webhook/nifty50-market-digest
```

The workflow accepts only the four versioned market/OIIS event types, rejects non-paper payloads,
requires a non-empty formatted message, and forwards only the formatted message to WhatsApp.

## Operations

```bash
docker compose -p trading-stack-novius2 \
  -f compose/compose.base.yml -f compose/compose.paper-trading.yml \
  -f compose/compose.oiis-live.yml up -d --no-deps market-notifier

docker compose -p trading-stack-novius2 \
  -f compose/compose.base.yml -f compose/compose.paper-trading.yml \
  -f compose/compose.oiis-live.yml ps market-notifier

docker compose -p trading-stack-novius2 \
  -f compose/compose.base.yml -f compose/compose.paper-trading.yml \
  -f compose/compose.oiis-live.yml logs --tail=100 market-notifier
```

Database status:

```sql
SELECT event_type,status,suppression_reason,scheduled_for,delivered_at,last_error
FROM market_notifications.notification_event
ORDER BY created_at DESC LIMIT 30;

SELECT * FROM market_notifications.service_heartbeat;
```

The existing `/webhook/codex-paper-trade` route must remain active and unchanged.
