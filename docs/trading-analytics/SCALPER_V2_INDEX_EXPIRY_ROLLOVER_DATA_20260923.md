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
OI. A bounded recovery utility therefore restores only provider-returned
price/volume candles for an exact underlying, expiry, session and nearest-strike
window. It rate-limits requests, writes idempotently, and never supplies OI.
Future rollovers keep the following expiry warm in advance, avoiding the same
gap without requiring recovery.

For this incident the utility recovered 14,960 real one-minute price/volume
bars across 42 exact NIFTY 29 September contracts (ATM plus ten listed strikes
on each side, CE and PE) for 22 September. The selected 23,350 CE and PE each
then produced 75 completed five-minute chart bars. An authenticated production
browser check showed all three price readouts, expiry `2026-09-29`, no page
alert and no JavaScript error. Historical OI was not backfilled.

## Verification

Run:

```bash
go test ./internal/universe ./internal/config ./cmd/collector
go test ./cmd/index-option-backfill
go test ./...
bash scripts/verify/canonical-repository-gate.sh
```

The recovery utility is deliberately explicit:

```bash
index-option-backfill --config /app/config.yaml \
  --underlying NIFTY50 --expiry 2026-09-29 --session 2026-09-22 \
  --spot 23329 --strikes-each-side 10 --request-spacing 1s
```

After deployment verify that active NIFTY subscriptions include both the front
and following expiry before expiry-day close, the collector remains within
3,000 active tokens, and Scalper V2 receives new selected-contract bars without
a page reload after the market opens.

Production verification recorded 162 active NIFTY contracts for 29 September
and 162 for 6 October (81 CE plus 81 PE for each expiry), 3,000 active tokens in
total, a healthy collector with zero restarts, and image
`sha256:9843dc14fb12e9b65955c8cdaf3bccfca2feb1cbadafa25db8f387acedb9eef7`.
The preserved rollback image is
`trading-stack-novius2-collector:before-index-expiry-rollover-20260923`.

## Rollback

Revert the scoped commit and recreate only `collector`. No schema or historical
row rollback is required; retained market observations must not be deleted.
