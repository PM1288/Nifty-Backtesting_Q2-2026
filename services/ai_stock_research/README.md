# OIIS/OISS multi-model stock research

This isolated worker evaluates each new daily OIIS/OISS stock once with Claude,
Qwen and DeepSeek, persists the immutable input and each provider result, and
queues one concise WhatsApp message per successful provider result.

The WhatsApp research brief includes company and strategy context, decision,
news, earnings state, web sentiment, positive and negative evidence, upcoming
risk, earnings and market views, price/news alignment, catalyst, principal
risk, up to three dated sources with links, data-quality note and session
coverage. It never includes the raw provider response, input JSON or
operational diagnostics.

Provider wire output uses the prompt-versioned V5 labelled-line contract rather
than raw JSON. The model-facing request contains only stock identity, reference
price and a compact column-plus-row matrix holding up to one calendar year of
completed daily OHLCV. It deliberately excludes strategy direction, status,
OFactor and XFactor so each provider forms an independent research view. The
prompt also prohibits indicator reconstruction and invented chart levels: OHLCV
is context only for price/news alignment. The worker validates and normalises
the labelled lines into PostgreSQL; raw provider responses are never forwarded
to WhatsApp. JSON transport remains parseable but must satisfy the V5 fields.

## Safety contract

- ChatGPT is not called.
- Provider endpoints are restricted to `100.120.233.3` ports 8009, 8010 and
  8011.
- OIIS inputs are `recommended=true` candidates from official run slots.
- OISS inputs are `selected=true` candidates. This worker does not enable the
  OISS scheduler.
- `(trade_date, symbol)` is the evaluation identity, so a symbol is evaluated
  only once per day even if it appears in later scans or both strategies.
- Every provider has its own idempotent result row.
- Only a `SUCCEEDED` provider row can create a delivery-outbox row. Exceptions,
  retries, logs and stack traces are never transformed into WhatsApp messages.
- The remote Qwen browser agent can expose its `Skip` thinking control before
  the final answer. On that exact placeholder only, the worker waits 90 seconds
  and asks the same `chat_id` for its completed labelled answer. Private
  `thinking` content remains unread, unstored and undelivered.
- A minimum of 20 completed daily bars is required; up to one calendar year is
  included in the compact matrix without repeating field names per session.
- The prompt is immutable by version and SHA-256 hash.

## Operations

Deploy:

```bash
cd /home/novius2/trading-stack
./scripts/deploy_ai_stock_research.sh
```

Status and endpoint health:

```bash
./scripts/ai_stock_research_status.sh
```

Run one discovery/processing cycle without changing the schedule:

```bash
docker exec trading-stack-novius2-ai-stock-research-1 ai-stock-research once
```

Disable delivery while retaining evaluation:

```bash
AI_STOCK_RESEARCH_DELIVERY_ENABLED=false \
docker compose --project-name trading-stack-novius2 --env-file .env \
  -f compose/compose.base.yml -f compose/compose.dev.yml \
  -f compose/compose.ai-stock-research.yml up -d ai-stock-research
```

Disable the complete worker by setting `AI_STOCK_RESEARCH_ENABLED=false` and
recreating this service. Do not stop OIIS, OISS or the canonical paper services.

## Database checks

```sql
SELECT trade_date, symbol, status, history_session_count
FROM ai_stock_research.evaluation
ORDER BY discovered_at DESC;

SELECT e.trade_date, e.symbol, p.provider, p.status, p.attempt_count,
       p.last_error_class, p.completed_at
FROM ai_stock_research.provider_evaluation p
JOIN ai_stock_research.evaluation e USING (evaluation_id)
ORDER BY p.created_at DESC;

SELECT status, count(*)
FROM ai_stock_research.delivery_outbox
GROUP BY status;
```

Operational detail remains in structured container logs and PostgreSQL. It is
deliberately absent from WhatsApp.

The direct gateway is shared with Paper Trading at
`https://wweb.noviusrailtech.com/webhook/send`. A Cloudflare `530` is an upstream
gateway/tunnel outage, not a successful delivery. It remains in the retry audit
and never becomes a WhatsApp error message.

## Tests

```bash
python3 -m venv /tmp/ai-stock-research-test
/tmp/ai-stock-research-test/bin/pip install -e 'services/ai_stock_research[test]'
/tmp/ai-stock-research-test/bin/pytest -q services/ai_stock_research/tests
/tmp/ai-stock-research-test/bin/ruff check services/ai_stock_research
```
