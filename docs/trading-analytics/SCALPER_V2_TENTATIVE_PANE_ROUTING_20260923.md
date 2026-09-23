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

## Completion evidence

- Source commit: `06baeaa` (`fix(scalper): route tentative markers by option side`).
- Web typecheck: PASS.
- Focused tentative-reference tests: PASS, 11/11.
- Full web test suite: PASS, 277/277.
- Web production build: PASS.
- Canonical repository preservation gate: PASS.
- Production image: `trading-stack-n50-dashboard:scalper-tentative-routing-20260923-06baeaa`.
- Production container health and public `/n50/health`: PASS.
- Authenticated live browser check on 23 September 2026: READY with one CALL
  reference; marker counts were underlying 1, CE 1, PE 0, with no page errors.
  This proves the live CALL-side routing. The deterministic PUT fixture proves
  the inverse routing because the retained live session did not contain a PUT
  reference at the validation instant.
- Browser capture:
  `/home/novius2/NIFTY50/00-Screnshots/2026-09-23/scalper-v2-nifty-fit-day-2026-09-23_10-52-10_IST.png`.
- Rollback image:
  `trading-stack-n50-dashboard:before-scalper-tentative-routing-20260923`.
