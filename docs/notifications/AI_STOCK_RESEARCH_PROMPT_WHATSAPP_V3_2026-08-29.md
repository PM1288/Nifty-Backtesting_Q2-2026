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

The first live labelled test request on 29 August reached Cloudflare but received
HTTP `530` before WhatsApp. The same 48-hour Paper Trading delivery audit contains
24 HTTP 530 failures, proving this is a shared gateway problem rather than an
AI-specific payload problem. After the public origin resumed answering, an
authenticated production `POST /webhook/send` still timed out after 20 seconds;
an unauthenticated `GET` reached the origin and returned its expected JSON 404 in
0.10 seconds. This narrows the remaining failure to the gateway's authenticated
send/WhatsApp path. Production AI tables currently contain zero evaluations and
zero outbox rows because Saturday enablement was deliberately non-retroactive.

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
- Initial shared-gateway test: HTTP 530.
- Post-deployment authenticated retry: 20-second `ReadTimeout`; delivery was not
  acknowledged and must not be treated as delivered.

## Gateway blocker observed before recovery

The authenticated send/WhatsApp session behind `wweb.noviusrailtech.com` needed
restoration. The recovery retest below confirms that this external action was
subsequently completed; no application URL, token, chat ID or route change was
required.

## Recovery retest

At 29 August 2026 after the gateway was re-enabled, the deployed `1.1.0` worker
sent one concise end-to-end test through its production URL, Docker secret and
configured group. The gateway returned HTTP 200 in 496 ms with `ok=true` and
`status=sent` (gateway record 6257). Worker research and delivery flags were both
enabled, its container remained healthy, and no diagnostic/error text was sent.

This direct transport test intentionally did not create a synthetic stock
evaluation or outbox row. Normal AI messages will be created only by a genuine
first-session or newly appearing OIIS/OISS candidate.

## Full provider-chain test

A controlled replay then used the genuine 28 August OIIS `OPEN_0930` rank-1
candidate SAIL with its exact O/X/reference values and 30 completed daily bars.
Evaluation `f8f4d9f7-489a-46b1-9944-27782e9f15ec` persisted the V3 prompt and
immutable JSON input hash
`dc4a12df56fa31188fdaedf8b4ef844973b37c7177e09a6bc566dcea41189e93`.

- DeepSeek passed attempt 1 (`WAIT`, 70%, mixed) and WhatsApp acknowledged HTTP
  200 as gateway record 6258.
- Claude's first response failed the immutable-date gate; attempt 2 passed
  (`WAIT`, 62%, mixed) and WhatsApp acknowledged HTTP 200 as gateway record 6259.
- Qwen failed all five governed attempts. Four responses did not satisfy the
  labelled contract; attempt 5 returned HTTP 500 from the remote query service,
  and a diagnostic call then timed out connecting to port 8010. No Qwen or error
  message was sent.

The durable evaluation is correctly `PARTIAL`, with two delivered provider
messages and one explicit Qwen failure. Exact evidence and a validated ZIP are
under `/home/novius2/NIFTY50/AI-API-CHECK/FULL_E2E_TEST_20260829_SAIL/`.

## Richer message retest

Service `1.1.1` adds the verified `Driver` and `Entry` condition to the concise
WhatsApp body. A fresh controlled replay used genuine OIIS morning rank-2
HYUNDAI and its 30-session snapshot. Claude (`WAIT`, 55%) and DeepSeek (`WAIT`,
65%) both produced expanded messages containing Why, Driver, Risk and Entry;
the gateway acknowledged them as records 6261 and 6260. Qwen again failed all
five contract attempts and produced no message. Evidence is under
`/home/novius2/NIFTY50/AI-API-CHECK/FULL_E2E_RETEST_20260829_HYUNDAI/`.
