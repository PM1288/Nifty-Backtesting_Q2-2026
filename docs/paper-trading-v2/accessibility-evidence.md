# Paper Trading Evidence Workbench V2 accessibility evidence

Validated: 2026-08-22 UTC

## Automated and keyboard checks completed

- No duplicate IDs.
- No unnamed buttons, links, inputs, selects or text areas.
- No unnamed dialogs.
- No positive `tabindex` values.
- Exactly one page-level `h1`.
- Reduced-motion media preference is matched.
- No body overflow at the automated 960 px reflow-equivalent check.
- Enter on a focused evidence row opens the canonical trade inspector.
- Escape closes the inspector and restores focus to the originating table row.
- Mobile 390 × 844 has no page-level horizontal overflow.
- Accounting classes are expressed as text badges, not colour alone.
- Table headers are horizontal, grouped and semantically represented by native table markup.

Machine-readable result: `accessibility/accessibility-results.json`
Reduced-motion screenshot: `accessibility/paper-workbench-v2-reduced-motion-390x844.png`

## Remaining acceptance work

This evidence does not constitute a claim of complete WCAG 2.2 AA conformance. Before that claim, complete:

1. axe or equivalent automated checks against every inspector tab and section state;
2. manual screen-reader review of the evidence grid, chart alternatives, metric definitions and live freshness state;
3. forced-colours/high-contrast review;
4. complete critical journeys at 400% zoom;
5. Firefox and WebKit keyboard/focus verification;
6. a full accessible underlying-data table for every retained SVG analytical chart.
