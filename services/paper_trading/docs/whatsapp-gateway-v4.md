# Paper Trading WhatsApp Gateway V4

## Outcome

Paper lifecycle notifications are delivered by the independent
`paper-webhook-worker` directly to the configured WhatsApp gateway. Trading,
position monitoring and PostgreSQL event persistence do not wait for WhatsApp.
The prior signed n8n delivery remains available only for explicit webhook
subscriptions and rollback.

## Configuration

| Variable | Purpose |
| --- | --- |
| `WA_GATEWAY_ENABLED` | Enables the direct adapter for the default outbox |
| `WA_GATEWAY_URL` | Full `/webhook/send` endpoint |
| `WA_GATEWAY_API_TOKEN_FILE` | Docker-secret file containing the API token |
| `WA_MYSELF_CHAT_ID` | Replaceable group or user chat ID |
| `WA_ENTRY_CHART_ENABLED` | Adds the PNG evidence chart to paper entries |
| `WA_DATA_ALERT_MIN_AFFECTED` | Minimum affected instruments for an immediate stale-data alert |
| `WA_DATA_ALERT_MIN_DURATION_SECONDS` | Minimum outage duration; default is 1,200 seconds |

The token must be stored at `secrets/whatsapp_gateway_api_token`, mode `0600`,
or supplied using `WA_GATEWAY_API_TOKEN_FILE`. It must never be committed or
printed in logs. Change `WA_MYSELF_CHAT_ID` in the deployment environment to
replace the destination; no source or workflow export needs editing.

## Low-noise policy

WhatsApp is sent for:

- paper position entry;
- analytical target hit;
- partial or full governed exit;
- rejected paper intent;
- daily or weekly summary;
- critical system error; and
- sustained or broad market-data outage.

Intent acknowledgements, pending states, duplicate group/leg lifecycle events,
per-tick observations, horizon updates and recovery chatter remain in the
durable event ledger but are marked `SUPPRESSED` in the delivery audit. A
suppressed event is not retried.

## Entry evidence image

On entry, the worker reads only evidence available at the event time:

- NSE one-minute OHLCV bars through the simulated fill;
- O factor and X factor from the latest eligible OIIS candidate snapshot;
- stored RSI 14 and ATR 14; and
- fill price, side, quantity and strategy from the paper event.

It renders a 1080 x 1080 PNG with candlesticks, a blue simulated-entry line,
RSI panel and factor labels. If evidence lookup or image rendering fails, the
compact text alert still sends; notification enhancement never blocks the
paper ledger.

## Gateway contract

The adapter sends `POST /webhook/send` with `X-API-Token`, an idempotency key,
event ID and event sequence headers. Text payloads contain `chatId` and
`message`. Entry media additionally contains:

```json
{
  "media": {
    "mimetype": "image/png",
    "data": "base64-data",
    "filename": "symbol-paper-entry.png"
  },
  "asDocument": false
}
```

The outbox and gateway both receive stable event identifiers. Retry does not
create a second logical message when the receiver honours the idempotency key.

## Validation

```bash
docker build -t trading-stack-paper-trading:whatsapp-v4 services/paper_trading
docker run --rm --entrypoint sh \
  -v "$PWD/services/paper_trading:/src:ro" \
  -e RUFF_CACHE_DIR=/tmp/ruff -e MYPY_CACHE_DIR=/tmp/mypy \
  trading-stack-paper-trading:whatsapp-v4 -c \
  'cd /src && pytest -q tests/test_whatsapp.py tests/test_events_webhook.py && \
   ruff check src tests/test_whatsapp.py tests/test_events_webhook.py && \
   mypy --cache-dir=/tmp/mypy src/papertrade/config.py \
     src/papertrade/webhook.py src/papertrade/whatsapp.py'

node services/paper_trading/n8n/test_notification_policy_v3.js
node n8n/test_market_digest_policy.js
node n8n/test_market_status_workflow.js
```

## Deployment and rollback

Deploy only from pushed `master`:

```bash
docker compose -p trading-stack-novius2 \
  -f docker-compose.yml -f compose/compose.paper-trading.yml \
  build paper-webhook-worker
docker compose -p trading-stack-novius2 \
  -f docker-compose.yml -f compose/compose.paper-trading.yml \
  up -d --no-deps paper-webhook-worker
```

Rollback by setting `WA_GATEWAY_ENABLED=false`, restoring a valid
`N8N_WEBHOOK_URL`, and recreating the worker from the recorded pre-deployment
image tag. PostgreSQL events, outbox rows and delivery attempts require no
migration or rollback.
