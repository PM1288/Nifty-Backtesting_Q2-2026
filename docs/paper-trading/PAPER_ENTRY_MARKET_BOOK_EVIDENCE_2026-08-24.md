# Paper Entry Market Book Evidence

Date: 24 August 2026

## Outcome

New Paper Trading opening fills freeze the nearest SmartAPI quote at or before
the fill, provided it is no more than five minutes old. The stored evidence
includes LTP, last traded quantity, cumulative volume, total buy/sell quantity,
best bid/ask and the first three valid bid and ask levels.

This is evidence only. It does not change order acceptance, target rules,
position quantity, entry price or the existing `BAR_OPEN_CONSERVATIVE_V1` fill
model.

## Verified SmartAPI fields

The collector's websocket parser receives five bid and five ask levels. Each
level contains price, quantity and order count. It also receives last traded
quantity, cumulative volume, total buy quantity and total sell quantity. The
REST quote adapter exposes the same book model for recovery/fallback use.

Collector persistence:

- `public.quote_snapshots`: LTP, last traded quantity, cumulative volume, total
  buy/sell quantity, best bid/ask and quantities.
- `public.depth_5_snapshots`: five bid and five ask levels with price, quantity,
  order count and cumulative depth.

Code references:

- `internal/smartapi/ws.go`
- `internal/smartapi/rest_quote.go`
- `cmd/collector/tasks.go`
- `services/paper_trading/src/papertrade/monitor.py`

## Capture rule

1. Paper opening fill is created from the established bar-open model.
2. Find the latest `quote_snapshots` row for the instrument where quote time is
   at or before fill time and within the preceding five minutes.
3. Join depth rows from the same quote timestamp.
4. Keep levels 1 through 3 only when price and quantity are positive.
5. Convert zero best bid/ask values to unavailable.
6. Store one immutable evidence record for the opening fill.

Availability states:

- `CAPTURED`: three valid levels on both sides and a two-sided touch.
- `PARTIAL_DEPTH`: two-sided touch exists but one side has fewer than three valid levels.
- `NO_TWO_SIDED_BOOK`: quote exists but a valid bid or ask is absent.
- `NO_NEARBY_QUOTE`: no qualifying quote exists in the five-minute window.

Reference touch:

- Long entry: best ask.
- Short entry: best bid.

The touch is not represented as a simulated fill. Market depth is transient,
displayed quantity is not guaranteed executable, and a snapshot cannot prove
queue position or fill probability.

## Historical handling

No historical entry depth is fabricated. Trades opened before this feature have
no entry evidence row and display `Historical entry book unavailable`. Missing,
zero and unavailable are separate states.

## Storage and API

- Migration: `services/paper_trading/migrations/013_entry_market_book_evidence.sql`
- Table: `paper_trading.entry_market_evidence`
- Overview: `GET /v1/workspace/paper-trading`
- Detail: `GET /v1/workspace/paper-trading/trades/{tradeGroupId}`
- OpenAPI: `neon-stock-terminal/docs/openapi/paper-entry-market-evidence.openapi.yaml`

## Change manifest

- `services/paper_trading/migrations/013_entry_market_book_evidence.sql`
- `services/paper_trading/src/papertrade/monitor.py`
- `services/paper_trading/tests/test_migration.py`
- `services/paper_trading/tests/test_postgres_flow.py`
- `neon-stock-terminal/apps/api/src/routes/workspace.ts`
- `neon-stock-terminal/apps/api/src/routes/workspace.paper.test.ts`
- `neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx`
- `neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.module.css`
- `neon-stock-terminal/docs/openapi/paper-entry-market-evidence.openapi.yaml`
- `tools/playwright/paper-entry-market-book-regression.mjs`
- `docs/paper-trading/PAPER_ENTRY_MARKET_BOOK_EVIDENCE_2026-08-24.md`

## UI

The complete Paper Trading ledger now places a color-coded `LONG`/`SHORT`
column between Trade and Entry strategy. The same direction appears in the
trade inspector. The inspector has a dedicated `Market Book` tab showing the
frozen quote, reference touch, spread, volume fields and top-three bid/ask
ladders. The general Evidence tab remains unchanged for calculation evidence.

## WhatsApp entry alert

The direct WhatsApp gateway formatter resolves the immutable
`entry_market_evidence` row by the event's `trade_leg_id`. A new Paper Entry
message includes, when captured:

- LTP, last-traded quantity and cumulative day volume;
- total buy and sell quantities;
- best bid/ask price and quantity;
- derived touch spread and spread percentage;
- top-three bid and ask price, quantity and order count;
- quote timestamp and age at the paper fill.

The message never substitutes a later live quote for the entry snapshot.
Unavailable historical depth is omitted from WhatsApp rather than fabricated.
The Paper Entry message no longer adds a generic monitoring sentence, strategy
footer, simulation warning or no-live-order footnote; it contains the explicit
`PAPER ENTRY` identity and the actual captured facts. Existing target, exit and
summary formats are not changed by this update.

## Rollback

Application rollback can use the pre-change files in:

`/home/novius2/trading-stack/backups/paper-entry-book-20260824T1840Z`

Database rollback should normally leave the additive evidence table in place.
If removal is explicitly required after rolling back all consumers:

```sql
DROP TABLE paper_trading.entry_market_evidence;
DELETE FROM paper_trading.schema_migrations
WHERE version = '013_entry_market_book_evidence';
```

Pre-change database dump:

`/home/novius2/trading-stack/backups/paper-entry-book-20260824T1840Z/paper_trading_before_entry_book.dump`

SHA-256:

`e4f4b1a96db2f67bff588963667154a6cfd07aa68be62dc394b2646304959b1f`

## Validation and deployment evidence

- SmartAPI persistence sample: 500 latest quote rows all contained LTP, last
  traded quantity and cumulative volume; 3,000 sampled level 1-3 depth rows
  covered 500 instruments.
- Collector configuration: depth enabled at a five-second snapshot interval for
  equity, index, futures, index options and stock options.
- API unit suite: 116/116 passed.
- Web TypeScript and production build: passed.
- Paper service PostgreSQL suite: 22/22 passed, including full three-level
  capture and durable `NO_NEARBY_QUOTE` behavior.
- OpenAPI YAML parse and required paths: passed.
- Authenticated production API regression: 40/40 paper rows had a correct
  `LONG` or `SHORT` projection.
- Authenticated browser regression: passed; the Direction column and historical
  unavailable market-book state were inspected in the canonical drawer.
- Browser evidence:
  `output/playwright/paper-entry-market-book/desktop-entry-book.png`
- Screenshot SHA-256:
  `be982aecd302e2ab4b5951e0f4ef71b8a40edc9bdb04e82beebbf731b9a4fa5f`
- Migration `013_entry_market_book_evidence` applied to the production paper
  schema. No historical rows were inserted.
- Recreated only Paper API/workers/scheduler and the N50 dashboard; PostgreSQL,
  collector and unrelated services were not restarted.

The standalone web test suite has two existing navigation-registry expectation
failures because its expected Strategy menu predates the already-deployed
Trendlyne, Monthly Strategy and Rolling Strategy entries. These failures are not
caused by the entry market-book change; web typechecking and production build
both pass.
