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
reference, including off-session values. Its fixed endpoints are the exact
observed 30-session low and high. It includes a prominent current-underlying
readout and marker plus one labelled tick for every available selected-expiry
strike inside that range. Narrow screens scroll the scale internally instead
of dropping ticks or widening the page. Exact reference values, labels and
source dates remain available below the scale and in JSON export.

The visual hierarchy adapts the read-only linear-gauge pattern shown by the
MIT-licensed `SpinexIO/horizontal_gauge` project. No Flutter package or source
code was added to this React application; the implementation uses the existing
V2 React/CSS components and canonical market data.

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
missingness, raw-session line eligibility, the exact 30-session gauge domain
and strike filtering. The authenticated candidate browser check covers exact
range endpoints, every rendered strike label, reference rendering, off-session
chart exclusion, compact legend geometry and hover expansion. Evidence is
stored outside Git under `/tmp/scalper-v2-30d-strike-gauge-candidate`.

Full web typecheck, 193/193 tests and build pass; API typecheck, 212/212 tests
and build pass; the canonical source gate passes. Authenticated production
Chromium passes 7/7 for this feature on both the routed and public deployment,
9/9 for the Delta-OI-only profile and
20/20 for the broader V2 workstation. Production returned 14 real references
for 2026-09-11 and plotted exactly the two inside the raw session range. The
scoped N50 dashboard deployment is healthy; exact release identity and evidence
paths are recorded in `AGENT_HANDOFF.md`. No strategy, signal, measurement,
position, order, notification or Scalper V1 behavior is changed.
