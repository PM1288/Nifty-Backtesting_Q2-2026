# OIIS/OISS consolidated stock-research delivery

Date: 20 September 2026  
Service: `ai-stock-research`  
Source API contract: `/home/novius2/NIFTY50/API--new/FINAL_RESPONSE_API.md`

## Outcome

New OIIS/OISS stock candidates now produce one research request and one
WhatsApp research brief per `(trade_date, symbol)`. The worker posts to the
trusted Tailscale endpoint:

```text
POST http://100.120.233.3:8012/query/final
Accept: text/plain
Content-Type: application/json
```

The endpoint calls Claude, Qwen and DeepSeek internally and returns only the
final consolidated text. ChatGPT remains disabled. The response must be HTTP
200 with `text/plain`; JSON error bodies and non-text success bodies are never
treated as research or delivered to WhatsApp.

## Preserved boundaries

- OIIS `recommended=true` and OISS `selected=true` discovery is unchanged.
- The daily `(trade_date, symbol)` identity remains authoritative, including a
  stock selected by both strategies.
- At least 20 completed daily bars remain required.
- Strategy direction/status/OFactor/XFactor are not sent to the research
  providers. They remain delivery context only.
- The existing direct WhatsApp gateway, credential file, delivery outbox,
  attempt ledger, bounded retries and dead-state evidence remain in place.
- Historical `CLAUDE`, `QWEN` and `DEEPSEEK` rows are retained unchanged.
- This service does not change strategy selection, paper trading or orders.

## Request policy

The final request explicitly uses:

```json
{
  "include_chatgpt": false,
  "consolidation_provider": "claude",
  "consolidation_effort": "high"
}
```

The final API limits `prompt` to 20,000 characters. The worker preserves the
system contract and newest completed sessions; only oldest OHLCV rows are
removed if the complete one-year matrix would exceed that limit. The default
timeout is 600 seconds. Because the API has no idempotency guarantee for model
work, automatic research attempts default to one; durable WhatsApp delivery
retains its independent retry policy.

## Database evolution

`db/sql/056_ai_stock_research.sql` extends the provider evidence check to allow
`CONSOLIDATED`. New evaluations create only this row, which owns at most one
delivery-outbox row. No historical provider row or market record is rewritten.

## Validation

```bash
python3 -m venv /tmp/ai-stock-research-consolidated-test
/tmp/ai-stock-research-consolidated-test/bin/pip install -e 'services/ai_stock_research[test]'
/tmp/ai-stock-research-consolidated-test/bin/pytest -q services/ai_stock_research/tests
/tmp/ai-stock-research-consolidated-test/bin/ruff check services/ai_stock_research
bash scripts/verify/canonical-repository-gate.sh
```

The live Tailscale health endpoint must list Claude, Qwen and DeepSeek. A real
final-only probe must return HTTP 200, `text/plain; charset=utf-8` and
`Cache-Control: no-store`. A health response alone does not certify generation.

Recorded result: focused pytest `21 passed`; Ruff and Python compilation passed;
Compose config and canonical repository gate passed. The real final-only probe
returned HTTP 200, `text/plain; charset=utf-8` and `Cache-Control: no-store`.
The production service is healthy with zero restarts on image
`sha256:324442335f044d33a340d521c89cf36b54c74420162ac2c177ae38cc55d28e15`.
Its idle heartbeat showed zero new discoveries/deliveries and only the
`CONSOLIDATED` work key. Historical delivery counts remained 683 delivered and
22 dead; nothing was replayed during deployment.

## Rollback

Retain the pre-release image before recreation. Recreate only
`ai-stock-research` from that image if needed. The schema extension is safely
forward-compatible and does not need destructive rollback. New consolidated
rows remain valid audit evidence even if the previous worker image is restored.
