# Scalper V2 tentative option-marker pane routing — 23 September 2026

## Defect

The three-instrument tentative setup calculation was correct, but presentation
routed every tentative CALL and PUT reference into both option panes. A valid
PUT reference therefore appeared correctly on PE and incorrectly appeared a
second time as `Tentative CE` on the CE chart.

## Repair

- The underlying pane retains every tentative CALL and PUT reference because it
  is the shared directional context.
- The CE pane receives tentative CALL references only.
- The PE pane receives tentative PUT references only.
- CALL/PUT calculation, exact timestamps, EMA9 crossover rules, five-candle
  source-side evidence, 95% option-volume confirmation and speech remain
  unchanged.
- Existing established CALL/PUT references keep their prior side filtering.

The glyph contract remains unchanged: actionable CE is a hollow yellow upward
triangle; actionable PE is a hollow blue downward triangle; both remain 60%
transparent and explicitly tentative rather than executed trades.

## Acceptance

- A PUT-only fixture produces one underlying PUT marker and one PE marker, with
  zero tentative markers on CE.
- A CALL-only fixture produces one underlying CALL marker and one CE marker,
  with zero tentative markers on PE.
- A mixed fixture routes each direction only to its matching option pane.
- Web typecheck, unit tests, production build and canonical preservation gate
  must pass before deployment.

