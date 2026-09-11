# Scalper V2 max-pain price line — 11 September 2026

## Outcome

The existing `view=scalper_v2` underlying candlestick now receives the already
calculated latest retained-snapshot max-pain candidate(s). Eligible candidates
are drawn as purple dotted horizontal price lines with visible right-axis
labels. Tied minima remain separate candidates; the renderer does not choose an
arbitrary winner.

Normal `Session Y` remains based only on the observed underlying session. A
max-pain strike outside that raw high-low range is disclosed above the chart as
`outside Session Y` and is not allowed to distort the default price scale.
Selecting the existing explicit `All strikes Y` view expands to the retained
strike cohort and plots the max-pain line. The analytics payout chart and its
source scope remain unchanged.

No max-pain formula, V7 signal rule, A-open/B-close measurement, collector,
API, order permission or Scalper V1 behavior changed.

## Verification

- Web typecheck: PASS.
- Web tests: PASS, 151/151; includes strict Session Y and explicit All strikes
  Y max-pain eligibility.
- Web production build: PASS.
- Focused authenticated Chromium: PASS, 5/5.
- Live-backed browser evidence: snapshot max pain 23,500 was outside the
  observed session, then plotted at 23,500 after selecting All strikes Y.
- Screenshot and JSON evidence (not committed):
  `/tmp/scalper-v2-max-pain/scalper-v2-max-pain-line.png` and
  `/tmp/scalper-v2-max-pain/max-pain-results.json`.

The broader signed-OI browser suite reached and passed the new max-pain checks,
then failed because the selected live-backed session currently returned zero
retained cumulative-OI timestamps. That unrelated data-dependent assertion is
not represented as passing. Production deployment was not performed.
