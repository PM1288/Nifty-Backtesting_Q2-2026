# Positioning & Flow dashboard

Date: 12 September 2026  
Route: `/strategy/trading-analytics?view=flow`  
Scope: additive, read-only Trading Analytics view

## Data boundaries

The view combines, but never merges the identity of, three existing sources:

1. NSE participant outstanding positions for FII, Pro, Client and DII. The UI
   retains the label `Client (reported)`.
2. NSE FII derivatives report activity/value for index futures, index options,
   stock futures and stock options in INR crore.
3. Anonymous SmartAPI option observations for the selected underlying/expiry,
   including price, current OI, comparable baseline OI, signed change in OI and
   volume by exact contract.

No strike observation is attributed to a participant. No collector, broker
session, strategy rule or order permission was added.

## Main view

- Four participant cards show current, previous and previous-report change for
  the selected metric, plus net calls, net puts, futures net and futures long
  percentage.
- Current-position-versus-change quadrant and previous-to-current rotation
  charts support Options Proxy, Net Calls, Net Puts and Index Futures.
- FII activity is presented separately from outstanding participant position.
- FII/Pro, Client and anonymous market-flow comparisons are descriptive only.
- The above-fold market strip shows NIFTY, complete-cohort CE/PE OI and signed
  change coverage, OI PCR, volume PCR and indicative tracked-window max pain.
- One compact row per strike preserves exact CE/PE price, price change from day
  open, OI, comparable signed OI change, volume, mechanical contract build-up
  state, CE/PE rank, ATM, max-pain and selected-strike identities. Data bars do
  not replace exact values.

## Secondary views

- Market Flow adds the strike/Delta-OI/volume bubble map. Fill communicates
  signed OI change; blue/yellow outlines communicate CE/PE identity.
- History uses four participant small multiples and the existing 120-report
  retained dataset. Selectors include options proxy, net calls, net puts,
  futures net and futures long percentage.
- Evaluation reports descriptive correlations for participant current and
  previous-report-change values against the next completed NIFTY open-to-close
  return. It discloses that historical chain, first-30-minute and first-60-minute
  inputs are not present in this response.

## Calculation and missingness

Participant calculations reuse the canonical server functions:

```text
net_calls = call_long - call_short
net_puts = put_long - put_short
options_proxy = net_calls - net_puts
delta = current_report - previous_report
```

Participant history now receives the same preceding-report comparison fields
per report date. Missing first baselines remain null.

Contract build-up labels require both price and OI comparison values:

```text
price up / OI up     = Long build-up
price down / OI up   = Short build-up
price up / OI down   = Short covering
price down / OI down = Long unwinding
```

These labels describe the option contract; they are not an automatic NIFTY
direction or recommendation. A missing or non-comparable OI baseline remains
unavailable. Complete CE/PE totals and PCR are withheld if their tracked cohort
is incomplete.

## Evidence and exports

- JSON contains source participant/activity rows, derived strike flow, scope,
  dates and expiry.
- CSV contains participant current/previous/change fields, FII activity rows,
  and exact strike-side price/OI/change/volume/share/classification evidence.
- Complete application evidence remains in the existing Trading Analytics JSON
  and source drawers.

## Verification

- Web typecheck, 181/181 tests and production build pass.
- API typecheck, 208/208 tests and build pass.
- Authenticated candidate browser regression passes 14/14 at 1920x1080 using
  real retained source data. It verifies navigation, participant labels, two
  hero charts, strike rows, dataset separation, no ownership claim, above-fold
  matrix, JSON/CSV downloads, bubble or truthful baseline state, history,
  evaluation and absence of page errors.
- Evidence: `/tmp/positioning-flow-candidate-20260912` (not committed).

Deployment evidence is appended to `AGENT_HANDOFF.md` after the pushed release
commit is deployed.
