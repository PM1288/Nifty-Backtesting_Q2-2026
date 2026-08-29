# AI stock research prompt and WhatsApp V3

Date: 29 August 2026

## Correction

Prompt `AI-STOCK-RESEARCH-PROMPT-3.0.0` replaces the long JSON-only instruction
with a short research objective and deterministic labelled-line response. The
provider is explicitly forbidden from returning JSON, Markdown, warnings or
footnotes. The browser-backed services may still occasionally violate format;
the worker validates the response and sends nothing when required fields do not
pass.

The internal PostgreSQL representation remains structured. Legacy JSON is
accepted only as transition compatibility, then validated against the same
symbol, date, verdict, confidence and news enums. Raw provider output is never
used as the WhatsApp body.

## WhatsApp format

The worker independently composes five concise evidence lines:

```text
🟠 CLAUDE · OIIS
SBIN · LONG · O 78.34 · X 74.13 · ₹1,082.40
WAIT · 72% · MIXED NEWS
Why: current verified conclusion
Risk: principal verified risk
As of 2026-08-29 · 30 sessions
```

There is no JSON, strategy disclaimer, warning, retry text, stack trace or
technical footer. Claude, Qwen and DeepSeek remain separate messages.

## Gateway diagnosis

The AI worker, Paper Trading and Trendlyne use the same configured endpoint:

```text
https://wweb.noviusrailtech.com/webhook/send
```

The live labelled test request on 29 August reached Cloudflare but received HTTP
`530` before WhatsApp. The same 48-hour Paper Trading delivery audit contains 24
HTTP 530 failures, proving this is a shared gateway-origin/tunnel outage rather
than an AI-specific payload problem. Production AI tables currently contain zero
evaluations and zero outbox rows because Saturday enablement was deliberately
non-retroactive.

The gateway adapter now also rejects false 2xx envelopes (`ok=false`, failed
status) and non-JSON 2xx responses. These states retry through PostgreSQL and
remain internal; they do not create another WhatsApp message.

## Validation

- 16/16 Python contract/runtime tests passed.
- Ruff and Python compilation passed.
- DeepSeek live probe returned the V3 labelled format and passed strict parsing.
- Claude produced the correct labelled fields after a harmless introductory
  sentence; the parser ignores non-field chatter and validates the fields.
- Qwen continues to return the remote browser-agent `Skip` placeholder and
  correctly fails closed.
- Direct shared-gateway test: HTTP 530; no WhatsApp message was delivered.

## External action still required

Restore the Cloudflare origin/tunnel for `wweb.noviusrailtech.com`. Once the
endpoint stops returning 530, queued production messages retry automatically.
No application URL, token, chat ID or webhook route change is required.
