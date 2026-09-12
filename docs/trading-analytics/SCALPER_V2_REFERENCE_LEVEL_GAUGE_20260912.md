# Scalper V2 underlying reference levels and compact Delta OI key

Date: 2026-09-12
Scope: existing `view=scalper_v2` only

## Outcome

The underlying chart now receives a canonical reference-level model containing
the current underlying, today open, previous-session open/close, current and
previous week open/close, current and previous month open/close, and complete
5-session and 30-session high/low windows.

Only a reference whose raw price is inside the active session's observed
`[low, high]` is eligible for a normal underlying price line. The chart's five
percent display padding does not make an outside reference eligible, and a
reference never expands or shrinks the session price scale. Close or identical
levels use the existing semantic label merger.

A separate compact horizontal reference tracker preserves every available
reference, including off-session values. Its scale is independent from the
candlestick price scale, and exact values, labels and source dates remain
available through the tracker and JSON export.

The price-aligned side overlay remains signed Delta OI only. Its legend is now
compact at rest (`Delta OI`, CE, PE) and expands on hover or keyboard focus to
show sign, colour, coverage and max-pain evidence. CE and PE identities remain
blue and yellow; positive/negative change remains green/red.

## Data truthfulness

- Daily OHLC comes from the existing canonical daily-bar query.
- The active session open/high/low/current comes from the existing SmartAPI
  quote snapshot; no collector or database write was added.
- Five/30-session extrema are emitted only when the full required number of
  valid observed sessions exists.
- Missing daily/session observations remain absent rather than becoming zero.
- The quote exchange timestamp selects the active IST session, preventing a
  weekend request timestamp from manufacturing a new session.

## Verification

Focused deterministic tests cover period/window derivation, incomplete-window
missingness, raw-session line eligibility and the independent gauge domain.
The authenticated candidate browser check covers reference rendering,
off-session exclusion, compact legend geometry and hover expansion. Evidence is
stored outside Git under `/tmp/scalper-v2-reference-levels-candidate`.

Full web typecheck, 192/192 tests and build pass; API typecheck, 212/212 tests
and build pass; the canonical source gate passes. Authenticated production
Chromium passes 5/5 for this feature, 9/9 for the Delta-OI-only profile and
20/20 for the broader V2 workstation. Production returned 14 real references
for 2026-09-11 and plotted exactly the two inside the raw session range. The
scoped N50 dashboard deployment is healthy; exact release identity and evidence
paths are recorded in `AGENT_HANDOFF.md`. No strategy, signal, measurement,
position, order, notification or Scalper V1 behavior is changed.
