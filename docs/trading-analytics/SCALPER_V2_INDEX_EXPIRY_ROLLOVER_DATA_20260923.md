# Scalper V2 index-option expiry rollover data repair

Date: 23 September 2026 (IST)

## Incident

Before the Wednesday session following the 22 September NIFTY weekly expiry,
Scalper V2 correctly selected the next listed expiry, 29 September, but its
selected CE and PE price panes contained no completed session candles.

The authenticated production contracts were correct. At the investigation
cutoff, the context endpoint returned expiry `2026-09-29`, 20 observed option
legs and current OI values. The chart endpoint returned 762 underlying bars and
1,523 cumulative OI snapshots, but zero valid session bars for the selected
29 September CE/PE. Each newly selected token had only three observations,
none inside a completed regular-session candle.

## Root cause

The collector option plan subscribed only to `expiry_rank_index: 0`. During
Tuesday it therefore retained the expiring 22 September option ladder, not the
following 29 September ladder. After midnight IST the instrument resolver
correctly advanced to 29 September, exposing contracts whose preceding-session
price history had never been captured.

This was a collection-coverage defect, not a chart geometry, date-filter or
expiry-selector defect.

## Repair

- Add `universe.options.index_expiry_count`, defaulting to `2`.
- Keep both the configured front expiry and the immediately following listed
  index-option expiry subscribed around the same real ATM price.
- Give both ladders priority ahead of stock-option capacity rows. The existing
  SmartAPI ceiling remains unchanged at three connections and 1,000 tokens per
  connection.
- Permit the following index expiry across a month boundary. Exact contract
  tokens, expiry, strike and CE/PE identity remain authoritative.
- Add a deterministic rollover regression covering current and next expiries,
  including a next expiry in the following calendar month.

## Data truth and current-session behaviour

This change does not fabricate Tuesday candles or historical OI for contracts
that were not collected. SmartAPI historical candles do not provide historical
OI. Before Wednesday's first completed candle, the latest OI snapshot remains
available while the new-expiry price panes correctly have no completed session
bar. From the Wednesday open onward the existing WebSocket and bounded REST
fallback paths populate the selected contracts normally. Future rollovers keep
the following expiry warm in advance, avoiding the same blank-history gap.

## Verification

Run:

```bash
go test ./internal/universe ./internal/config ./cmd/collector
go test ./...
bash scripts/verify/canonical-repository-gate.sh
```

After deployment verify that active NIFTY subscriptions include both the front
and following expiry before expiry-day close, the collector remains within
3,000 active tokens, and Scalper V2 receives new selected-contract bars without
a page reload after the market opens.

## Rollback

Revert the scoped commit and recreate only `collector`. No schema or historical
row rollback is required; retained market observations must not be deleted.
