# AI stock research V5: fundamental, news and web evidence

Date: 2026-08-30

Prompt: `AI-STOCK-RESEARCH-PROMPT-5.0.0`

Service: `1.3.0`

## Purpose

V5 replaces the active V4 system prompt. The providers no longer perform chart
analysis, recalculate indicators, invent support/resistance or propose technical
entry triggers. The existing quantitative systems remain responsible for stock
selection and entry timing.

Each provider independently researches current public evidence and returns:

- news state;
- earnings state and latest earnings direction;
- web/research sentiment;
- strongest verified positive and negative evidence;
- upcoming company, earnings, regulatory or event risk;
- reputable analyst/research-site synthesis;
- price/volume versus news-sentiment alignment;
- catalyst, principal risk and up to three dated sources;
- explicit data-quality limitations.

## Model-facing input

The request contains only the analysis date, stock identity, reference price and
a compact point-in-time one-year OHLCV matrix. It does not contain OIIS/OISS
direction, strategy status, OFactor or XFactor. The OHLCV series is contextual
evidence only and cannot be used to recreate RSI, MACD, moving averages or
invented technical levels.

## Storage and compatibility

New JSONB results use `earnings_state`, `web_sentiment`, `positive_evidence`,
`negative_evidence`, `upcoming_risk`, `earnings_view`, `market_view` and
`price_news_alignment`. Existing V4 evaluations remain immutable and readable
in the tracked-stock inspector through explicitly labelled historical fields.

## Delivery safety

Only a successfully validated V5 result enters the WhatsApp outbox. Model
reasoning, raw JSON, warnings, footnotes, retries, exceptions and logs are never
sent. The Qwen exact-`Skip` same-chat recovery remains enabled and its private
thinking field remains unread and unstored.

## Rollback

Restore service image `trading-stack-ai-stock-research:1.2.1` and the prior
prompt version. No schema rollback is required because provider output is stored
as versioned JSONB and prior records are not rewritten.

## Validation evidence

- Worker contract/provider tests: 18/18 passed.
- Web tests: 67/67 passed; API tests: 130/130 passed.
- Ruff, compileall, web/API typechecks and production builds, canonical source
  gate and the 25-check authenticated tracked-stock browser regression passed.
- Delivery-disabled live validation used the immutable 28 August JINDALSTEL
  248-session input. Claude, Qwen and DeepSeek all returned valid V5 results
  with earnings state, web sentiment and three sources. Qwen completed through
  the existing same-chat recovery and no private thinking was stored.
- No WhatsApp message was created for the validation replay, avoiding a duplicate
  stock/day notification. The production WhatsApp formatter is covered by the
  contract suite and remains enabled for the next new daily candidate.

## Production retest: CROMPTON

A second controlled test created the normal one-stock/day evaluation
`0665ce75-379c-4b3a-9928-2e66d383e878` from genuine OIIS 28 August CROMPTON
evidence. It used 248 point-in-time sessions and Prompt V5.

| Provider | Provider attempts | Verdict | Confidence | Earnings | Web sentiment | Sources |
|---|---:|---|---:|---|---|---:|
| Claude | 2 | WAIT | 55 | IMPROVING | MIXED | 3 |
| DeepSeek | 1 | WAIT | 72 | MIXED | MIXED | 3 |
| Qwen | 1 | WAIT | 75 | MIXED | MIXED | 3 |

All three model inputs excluded O/X, direction and strategy status. Qwen used
same-chat recovery. No provider thinking was stored, and the three formatted
messages contained no warning, footnote, traceback, exception, `Skip` or
`Thought stopped` text.

The shared WhatsApp gateway initially returned HTTP 500 with
`Cannot read properties of undefined (reading 'getChat')`. After the gateway
session recovered, the same three durable outbox records were reopened; no
provider research was rerun and no duplicate delivery identities were created.
All three attempt-9 deliveries then returned HTTP 200 with gateway
`status=sent`:

| Provider | Delivery ID | Delivered UTC | Gateway record | Duration |
|---|---|---|---:|---:|
| Claude | `6c504c15-6b90-4983-8cbc-e36baf9c86d0` | 2026-08-30 11:55:27.187 | 6329 | 5,212 ms |
| DeepSeek | `42ef2e88-9e18-474e-875c-e3cb6bdbaacf` | 2026-08-30 11:55:13.979 | 6327 | 2,498 ms |
| Qwen | `2e9d6db0-f7c7-4211-9de0-5d655753b6f1` | 2026-08-30 11:55:21.961 | 6328 | 7,968 ms |

The gateway response did not expose a `sentMessageId`, but each response was
`ok=true`, carried the configured group chat ID, provided a durable gateway
record ID and reported `sent`. The research database records all three outbox
rows as `DELIVERED`.

## Final authenticated UI/API retest

The deployed Paper Trading tracked-stock surface was tested through a real
authenticated Chromium session against `http://127.0.0.1:19090/n50`:

- login: HTTP 200;
- page-owned tracked-stock request: HTTP 200;
- authenticated in-page request for `2026-08-28`: HTTP 200;
- effective session: `2026-08-28`;
- CROMPTON present with Claude, DeepSeek and Qwen all `SUCCEEDED` and
  `DELIVERED`;
- search reduced the table to the single CROMPTON row;
- inspector exposed three Earnings state fields and three Web sentiment fields;
- browser console errors: 0.

Final controlled end-to-end verdict: **PASS** for immutable OIIS input, Prompt
V5 research across all three providers, validated concise formatting, durable
storage, WhatsApp delivery and Paper Trading API/UI visibility.
