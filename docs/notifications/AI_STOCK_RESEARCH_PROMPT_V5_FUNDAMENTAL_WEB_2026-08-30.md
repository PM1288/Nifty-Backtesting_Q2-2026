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

WhatsApp delivery did not complete: the shared gateway returned HTTP 500 with
`Cannot read properties of undefined (reading 'getChat')` on each retry. This
indicates an uninitialised WhatsApp client/session behind the shared webhook,
not a prompt or message-format failure. The durable outbox remains retryable and
no operational error was sent to WhatsApp.
