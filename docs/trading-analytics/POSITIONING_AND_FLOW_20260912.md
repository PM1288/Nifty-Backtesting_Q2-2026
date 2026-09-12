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
  session cumulative-volume counters and comparable interval volume by exact
  contract. Source units remain explicitly unknown where the feed contract does
  not prove a conversion.

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
  open, matched-window price change, OI, comparable signed OI change, interval
  volume, mechanical contract build-up
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

## Candidate Levels

The additive `Candidate Levels` tab ranks research candidate zones without
claiming participant ownership of a strike. Resistance uses CE evidence;
support uses PE evidence. L0 uses current-OI percentile only. L1 is the declared
activity model: current OI 40%, comparable interval volume 30%, and absolute OI
adjustment 30%. Inputs are percentile-ranked within the tracked expiry using
midranks for ties. If any mandatory L1 input is absent, the row falls back
exactly to L0; weights are never renormalised. L2 remains unavailable until
matched RVOL, past-only persistence and proximity inputs exist. Scores are not
probabilities. Adjacent listed strikes are merged using actual spacing without
bridging missing strikes, while retaining the core and source members.

Participant alignment remains a separate aggregate FII/Pro context. The
existing `market_data.nse_fii_participant_volume` current and previous reports
are now exposed by the Trading Analytics API and shown separately from
outstanding participant positions and anonymous option-chain observations.

The retained response does not yet support these claims, which remain visibly
unavailable rather than estimated:

- durable OI persistence requires three or more time-ordered chain snapshots;
- delta-weighted OI requires an authorised contract delta-factor source;
- production reach/rejection/break rates require zones persisted before each
  session and replayed without later observations.
- a 60-session chain pilot cannot be claimed from the four retained NIFTY chain
  dates currently loaded.

The deterministic outcome contract is implemented and tested: reach is a zone
touch, confirmed break requires two consecutive closes beyond the zone, and
rejection requires a touch without confirmed break followed by the configured
adverse excursion. No production probability is displayed from fixture tests.

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

The Price/OI pattern uses the same previous archived snapshot for premium and
OI. Session-open return remains a separate metric. Cumulative volume counters
are differenced only for same-session comparable endpoints; a decrease is
`RESET_OR_CORRECTION`, and cross-session or first-observation intervals remain
unavailable. `abs(DeltaOI) / intervalVolume` is not clipped; values above one
are retained and flagged for review.

## Evidence and exports

- JSON contains source participant/activity/participant-volume rows, derived
  strike flow, Candidate Levels configuration/zones/availability, data coverage,
  scope, dates and expiry.
- CSV contains participant current/previous/change fields, FII activity rows,
  and exact strike-side matched/session price, OI, cumulative and interval
  volume, ratios, units, comparison quality, timestamps and model evidence.
- Complete application evidence remains in the existing Trading Analytics JSON
  and source drawers.

## Data coverage

The `Data Coverage` tab reports retained database rows, distinct dates and date
range separately for participant OI, participant volume, FII statistics and
NIFTY chain snapshots. Downloaded, parsed and source-validated artifact counts
are not stored in the Trading Analytics response and are shown as unavailable,
not copied from loaded-row counts. At the 12 September audit the retained data
contained 25 participant-OI dates, 24 participant-volume dates, 25 FII-statistic
dates and four NIFTY-chain dates. This blocks a truthful 60-session chain pilot.

## Verification

The current acceptance run and deployment evidence is recorded in
`POSITIONING_FLOW_ACCEPTANCE_20260912_V1.md` and appended to `AGENT_HANDOFF.md`.
