# OIIS/OISS multi-model stock research

This isolated worker evaluates each new daily OIIS/OISS stock once through the
final-only consolidated research API, persists the immutable input and final
result, and queues exactly one concise WhatsApp message per stock. The API calls
Claude, Qwen and DeepSeek internally and returns only their consolidated answer;
the worker no longer calls or delivers the three providers separately.

The WhatsApp research brief includes company and strategy context, decision,
news, earnings state, web sentiment, positive and negative evidence, upcoming
risk, earnings and market views, price/news alignment, catalyst, principal
risk, up to three dated sources with links, data-quality note and session
coverage. It never includes the raw provider response, input JSON or
operational diagnostics.

The consolidated wire output uses the prompt-versioned V5 labelled-line contract rather
than raw JSON. The model-facing request contains only stock identity, reference
price and a compact column-plus-row matrix holding up to one calendar year of
completed daily OHLCV. It deliberately excludes strategy direction, status,
OFactor and XFactor so the provider fleet forms an independent research view. The
prompt also prohibits indicator reconstruction and invented chart levels: OHLCV
is context only for price/news alignment. The worker validates and normalises
the labelled lines into PostgreSQL; raw provider responses are never forwarded
to WhatsApp. JSON transport remains parseable but must satisfy the V5 fields.

## Safety contract

- ChatGPT is not called (`include_chatgpt=false`).
- The research endpoint is restricted to the Tailscale final-only URL
  `http://100.120.233.3:8012/query/final`.
- OIIS inputs are `recommended=true` candidates from official run slots.
- OISS inputs are `selected=true` candidates. This worker does not enable the
  OISS scheduler.
- `(trade_date, symbol)` is the evaluation identity, so a symbol is evaluated
  only once per day even if it appears in later scans or both strategies.
- Every stock has one idempotent `CONSOLIDATED` result row.
- Only a `SUCCEEDED` consolidated row can create one delivery-outbox row. Exceptions,
  retries, logs and stack traces are never transformed into WhatsApp messages.
- The final-only endpoint must return HTTP 200 and `text/plain`; JSON error bodies
  are never treated as research. Intermediate provider responses, thinking and
  receipts are neither received nor delivered.
- A minimum of 20 completed daily bars is required. Up to one calendar year is
  included; if required by the API's 20,000-character prompt limit, only the
  oldest rows are removed and the most recent completed sessions are retained.
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

Historical `CLAUDE`, `QWEN` and `DEEPSEEK` rows remain immutable evidence. New
evaluations create only `CONSOLIDATED`; the legacy queues are not processed or
redelivered by v2.

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
