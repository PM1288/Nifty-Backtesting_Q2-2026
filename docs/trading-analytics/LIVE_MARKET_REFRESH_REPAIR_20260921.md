# Live market refresh repair — 21 September 2026

## Scope

This is a refresh-lifecycle repair for Scalper V2, the Home MWHD summary and
the current-month screener. It does not change a strategy condition, ranking,
market value, collector, alert rule, order permission or historical record.

## Cause and live evidence

- At 09:10 IST the NSE regular session had not opened. The first regular
  one-minute candle starts at 09:15 and is persisted after its first observation
  interval; pre-open quotes do not form regular-session candles.
- Production `bars_1m` advanced through the 09:15 and 09:16 candles without a
  service restart. The NSE option-chain watcher began at the regular-session
  boundary and stored W0/M0 snapshots; the all-F&O SmartAPI archive stored
  8,106 rows on its first regular-session pass.
- An authenticated browser run received 45,823 Home WebSocket frames with zero
  document reloads. The Home overview and Scalper endpoints continued polling.
- The remaining visible delay was application-side: the Scalper V2 price and
  selected-contract queries revalidated every 60 seconds, while the progression
  client and its shared server cache also used 60-second cadences.

## Repair

- Scalper V2 price charts and selected-contract context revalidate every 15
  seconds. Replay/as-of views remain immutable and do not poll.
- Option positioning history revalidates every 30 seconds. This is intentionally
  slower because the source archive is not a tick stream.
- Home and screener MWHD clients revalidate every 15 seconds.
- The shared progression computation refreshes every 30 seconds, remains
  single-flight, and continues to return the last complete payload while the
  next calculation runs.
- Query keys remain stable. Existing incremental series updates preserve the
  three native chart instances, current zoom, drawings, cursor and measurement;
  unchanged payloads cause no chart write.

## Validation

- Focused web tests: 10/10 PASS.
- Full web suite: 248/248 PASS; typecheck and production build PASS.
- Full API suite: 263/263 PASS; typecheck and build PASS.
- Canonical repository gate: PASS.
- Pre-change authenticated live run: current Monday session selected, all three
  5-minute panes through 09:20 IST, OI history through 09:20:25 IST, zero page
  reloads. A post-deployment run must confirm the new 15/30-second cadence.

## Operational distinction

The consolidated stock-research endpoint is independently configured on the
Tailscale address. Its health and three diagnostic providers were reachable,
but the final-only request failed in the remote Claude consolidation stage.
This UI refresh repair does not mask or alter that external failure.

