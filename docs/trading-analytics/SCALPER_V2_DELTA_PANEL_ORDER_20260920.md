# Scalper V2 strike-panel order — 20 September 2026

## Outcome

The Scalper V2 right-side strike stack now contains four compact panels in this
fixed order:

1. `OI by strike` — CE OI, PE OI and the independently scaled `PE − CE OI` line.
2. `ΔOI by strike` — signed CE/PE ΔOI bars and the independently scaled
   `PE ΔOI − CE ΔOI` line.
3. `Strike structure`.
4. `Strike × time positioning` heatmap.

The former bid–ask-spread chart was removed. The two timestamp-aligned
cumulative OI-difference panels retain the same widths as the price charts
above; a non-rendering side-column spacer preserves that X-axis alignment.

## Preserved contracts

- Missing ΔOI remains unavailable, never zero.
- Positive and negative ΔOI retain their sign and adaptive zero-inclusive
  domain.
- CE/PE identity, PE-minus-CE arithmetic, strike hover, time hover and the
  expanded analytics views are unchanged.
- Exact bid/ask source fields remain available in evidence/export and the
  selected-contract inspector; only the dedicated spread chart was removed.
- No strategy, signal, collector, broker, paper-order or live-order behavior
  changed.

## Validation

- Web TypeScript: pass.
- Web tests: 247/247 pass.
- Production build: pass.
- Authenticated local browser regression: 46/46 pass.
- Screenshot:
  `output/playwright/scalper-v2-delta-panel-order-local-final/scalper-v2-popout-1920x1080.png`.

