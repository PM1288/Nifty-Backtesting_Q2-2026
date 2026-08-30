# Paper Trading — Stocks Being Tracked Today

Date: 29 August 2026

Route: `/paper-trading?tab=tracked`

API: `GET /v1/workspace/paper-trading/tracked-stocks?date=YYYY-MM-DD`

## Purpose

This additive Paper Trading lens shows every stock accepted by the OIIS/OISS AI research orchestrator for a trading date. It is evidence and monitoring only: opening the lens, refreshing it or exporting it cannot create or alter a paper trade.

The UI requests data only while the lens is mounted. The API reads the additive `ai_stock_research` schema and does not recalculate past decisions.

## Evidence shown

- Stock, company, direction, canonical strategy status and every OIIS/OISS source/run reference.
- O Factor, X Factor, decision reference price, daily-history session count and source-through date.
- Separate Claude, Qwen and DeepSeek state, model, verdict, confidence, news signal, summary and WhatsApp delivery state.
- Side inspector with each provider's driver, risk, entry view, invalidation, source links and the immutable daily OHLCV input (up to 30 completed sessions).
- CSV export of the filtered stock set with separate provider fields.

Numeric zero remains zero. Missing values remain `—` in the interface and empty in CSV. Provider failures expose only a concise class/state; raw provider responses, stack traces, credentials and internal error details are not returned to the browser.

## Date behavior

The requested date defaults to the current India trading date. If that date has no evaluations, the API returns the latest recorded trading session on or before it and the UI shows an explicit fallback notice. It never presents a prior session as the requested session silently.

## Tests

- API serializer tests cover SBIN, INFY and RELIANCE, provider separation, numeric zero, compact one-year history and date fallback.
- Web unit tests cover three-stock filtering, full CSV export and missing-versus-zero preservation.
- Authenticated Playwright regression uses three test-only intercepted records to verify the live route, table, all provider columns, search, inspector, 30 OHLCV rows, Escape close and CSV download. No fixture data is compiled into production.

## Current operational limitation

The orchestrator was enabled on Saturday 29 August and is intentionally non-retroactive. Production can therefore show no evaluation until the next accepted OIIS candidate during a market session. OISS remains scheduler-disabled independently. The remote Qwen agent currently returns an invalid `Skip` result for stock queries; the worker records/retries that state and correctly creates neither a successful result nor a WhatsApp delivery. Claude and DeepSeek are unaffected.

## Rollback

The UI/API change is additive and requires no database rollback. Reverting the delivery commit removes the lens and route while preserving all `ai_stock_research` evidence.
