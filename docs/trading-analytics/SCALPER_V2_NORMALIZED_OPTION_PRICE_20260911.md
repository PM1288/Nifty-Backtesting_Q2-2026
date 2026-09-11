# Scalper V2 normalised CE/PE price action — 11 September 2026

## Outcome

The existing `view=scalper_v2` now includes a sixth full-width analytical chart
for normalised CE and PE price action. The X axis is the retained option-chain
snapshot timestamp in IST. The Y axis is fixed from -100 to +100.

Each exact option contract is normalised independently with a piecewise scale:

```text
first retained session price = 0
observed session high = +100
observed session low = -100
```

Values above the opening observation are scaled by the opening-to-high span;
values below it are scaled by the opening-to-low span. This preserves the
requested three anchors without pretending one symmetric price denominator can
map unequal upside and downside spans to both +100 and -100.

Every retained CE and PE strike is plotted. CE lines are blue and PE lines are
yellow. The independently selected CE and PE strikes are fully opaque and use a
heavier line. Opacity decreases with strike distance from the selected contract;
hover emphasis restores full opacity for inspection. Missing timestamps remain
gaps. The legend is scrollable and the time axis supports inside and slider
zoom.

## Data scope

A new read-only endpoint,
`/v1/trading-analytics/option-price-history`, returns exact stored snapshot
prices for all CE and PE strikes captured for the selected underlying and
expiry. The opening anchor is therefore labelled as the first retained session
price, not an invented exchange opening trade. The captured window may move
with the underlying and is not described as the complete exchange expiry
chain. Raw points, source scope and limitations are included in Scalper V2 JSON
export.

No schema, collector, V7 rule, A-open/B-close arithmetic or order permission
changed.

## Verification

- Normalisation and opacity unit tests: PASS, 2/2.
- Web typecheck, 150/150 tests and production build: PASS.
- API typecheck, 197/197 tests and production build: PASS.
- Authenticated isolated Chromium: PASS, 18/18.
- Live-backed candidate: 30 CE/PE strike lines across 192 timestamps.
- Visual inspection: PASS; selected CE and PE lines are prominent, farther
  strikes fade, and the zero/high/low scale and time slider are visible.
- Screenshot:
  `/tmp/scalper-v2-normalized-price/scalper-v2-nifty-guides-signed-oi-and-clear.png`
  (runtime evidence outside source control).

Production deployment was not performed and remains a separate authorised
release action.
