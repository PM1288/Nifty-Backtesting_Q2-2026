# Scalper V2 signed OI profile and clear drawings — 11 September 2026

## Outcome

The existing `view=scalper_v2` now has an undoable **Clear all drawings** action
inside the Objects sidebar. It clears the current symbol's drawing set and
resets the selected object; the existing Undo action restores the full cleared
set in one step.

The strike-aligned Delta OI profile now uses a true centred zero origin.
Positive changes extend right, negative changes extend left, and both directions
use one maximum absolute Delta OI from the declared comparison cohort. The
actual fills—not only the outlines—are blue for CE and yellow for PE in both the
underlying profile and the separate Change in OI chart. Signed direction and
`+`/`−` numerical labels continue to distinguish increase from decrease;
observed zero and unavailable values remain neutral.

The profile caption at the top of the underlying chart exposes the current
`-maximum <- 0 -> +maximum` scale, identity colours, visible-strike coverage and
the shared-maximum basis. The separate Change in OI chart uses the same symmetric
X bounds and CE/PE colours; every strike retains its signed CE/PE values on the
right Y axis.

The three bottom strike views now also expose the current underlying context.
OI by strike and max-pain payout draw a dotted vertical line at the nearest
listed strike and label it with the exact current NIFTY value. Because Change in
OI is intentionally horizontal (strike is its right Y axis), it draws the same
truthful context as a dotted horizontal strike line. This avoids misrepresenting
NIFTY price as a Delta OI magnitude on that chart's X axis.

## Root cause

The prior native profile correctly calculated absolute Delta OI widths but
always painted `anchorX - width`. As a result, positive and negative changes
occupied the same left-hand side. Geometry now records explicit `startX` and
`endX`: positive values end to the right of the zero anchor, negative values
start to its left, and zero remains at the anchor. Bar size is proportional to
`abs(value) / max(abs(all comparable values))`.

The earlier bottom-chart mark line passed a numeric strike directly to an
ECharts category axis. ECharts treated that number as a category index, placing
the guide outside the plotted categories. The repaired charts resolve the
nearest strike to its real category index while keeping the exact NIFTY value
and nearest strike in the visible label.

## Verification

- Focused Delta OI/profile tests: PASS, 7/7.
- Web typecheck: PASS.
- Full web tests: PASS, 162/162.
- Web production build: PASS.
- Authenticated isolated Chromium: PASS, 21/21.
  - visible top profile scale and CE/PE legend;
  - positive and negative geometry on opposite sides of one anchor;
  - positive shared maximum;
  - Clear all drawings removes the complete set;
  - Undo restores that set;
  - OI, Delta OI and max-pain panels disclose the current-NIFTY guide;
  - no page exceptions.
- Screenshots: `/tmp/scalper-v2-delta-oi-colours/`, including the isolated
  Change-in-OI panel and the complete V2 page (runtime evidence, intentionally
  outside source control).

No API, collector, V7 signal, A-open/B-close measurement, order permission or
production container was changed. Deployment remains a separate authorised
release action.
