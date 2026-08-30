# AI stock research V4: independent one-year evidence

Date: 2026-08-30

Prompt: `AI-STOCK-RESEARCH-PROMPT-4.0.0`

Service: `1.2.0`

## Change

The three provider calls now receive an independent research brief rather than
the OIIS/OISS decision package. The model-facing payload contains only:

- analysis date;
- NSE stock identity;
- current reference price;
- up to one calendar year of completed point-in-time daily OHLCV.

Direction, strategy status, OFactor and XFactor remain in PostgreSQL for source
lineage and in the Paper Trading audit UI, but are deliberately excluded from
the model request. The LLM therefore researches the company and price/volume
record without being anchored to the originating strategy conclusion.

## Compact OHLCV contract

Field names occur once, followed by oldest-to-newest rows:

```json
{
  "columns": ["date", "open", "high", "low", "close", "volume"],
  "rows": [
    ["2025-08-29", 100.1, 102.0, 99.5, 101.4, 1200000],
    ["2025-09-01", 101.5, 103.2, 100.8, 102.7, 1350000]
  ]
}
```

This avoids repeating six JSON keys for approximately 248-252 sessions while
preserving dates, OHLC values and volume exactly as sourced.

## Structured response contract

Providers must return labelled plain text, never JSON or Markdown: symbol, date,
verdict, confidence, news state, summary, technical view, fundamental view,
catalyst, risk, entry condition, invalidation, up to three verified sources and
data-quality note. All fields are validated before storage or delivery.

## Delivery behavior

WhatsApp receives only validated research. Logs, errors, retries, raw JSON,
provider chatter, warnings and operational footnotes are never delivered. The
expanded brief includes Technical, Fundamental and Catalyst sections while
remaining below the 3,500-character guard.

## Compatibility and rollback

Existing V3 evaluations remain immutable and readable. The dashboard decoder
accepts both legacy `history_30d` objects and the V4 `price_history_1y` compact
matrix. Rollback uses the previous `1.1.2` worker image; the widened database
constraint is additive and does not rewrite prior snapshots.

## Qwen browser recovery

The remote Qwen Docker may return the visible thinking control `... Skip` as
its first `output` while the model is still working. Service `1.2.1` recognizes
only this exact placeholder, waits 90 seconds, and requests the completed final
answer from the same returned `chat_id`. It never reads the gateway's private
`thinking` field. Qwen's occasional missing line breaks between uppercase
contract labels are restored before the same strict field validation used by
Claude and DeepSeek. A continuation that is still unstructured fails closed and
creates no WhatsApp message.
