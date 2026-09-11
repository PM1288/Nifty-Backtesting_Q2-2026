# Scalper V2 signed OI profile and clear drawings — 11 September 2026

## Outcome

The existing `view=scalper_v2` now has an undoable **Clear all drawings** action
inside the Objects sidebar. It clears the current symbol's drawing set and
resets the selected object; the existing Undo action restores the full cleared
set in one step.

The strike-aligned Delta OI profile now uses a true centred zero origin.
Positive changes extend right, negative changes extend left, and both directions
use one maximum absolute Delta OI from the declared comparison cohort. CE bars
are blue and PE bars are yellow. Signed numerical labels continue to distinguish
increase, decrease, observed zero and unavailable values.

The profile caption at the top of the underlying chart exposes the current
`-maximum <- 0 -> +maximum` scale, identity colours, visible-strike coverage and
the shared-maximum basis. The separate Change in OI chart uses the same symmetric
X bounds and CE/PE colours; every strike retains its signed CE/PE values on the
right Y axis.

## Root cause

The prior native profile correctly calculated absolute Delta OI widths but
always painted `anchorX - width`. As a result, positive and negative changes
occupied the same left-hand side. Geometry now records explicit `startX` and
`endX`: positive values end to the right of the zero anchor, negative values
start to its left, and zero remains at the anchor. Bar size is proportional to
`abs(value) / max(abs(all comparable values))`.

## Verification

- Focused Delta OI/profile tests: PASS, 6/6.
- Web typecheck: PASS.
- Full web tests: PASS, 147/147.
- Web production build: PASS.
- Authenticated isolated Chromium: PASS, 9/9.
  - visible top profile scale and CE/PE legend;
  - positive and negative geometry on opposite sides of one anchor;
  - positive shared maximum;
  - Clear all drawings removes the complete set;
  - Undo restores that set;
  - no page exceptions.
- Screenshot: `/tmp/scalper-v2-signed-oi-drawings/scalper-v2-signed-oi-and-clear.png`
  (runtime evidence, intentionally outside source control).

No API, collector, V7 signal, A-open/B-close measurement, order permission or
production container was changed. Deployment remains a separate authorised
release action.
