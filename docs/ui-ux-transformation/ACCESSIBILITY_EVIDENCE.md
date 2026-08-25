# Accessibility Evidence

Last run: 2026-08-11 19:13 UTC against the final deployed HTTPS application.

## Automated WCAG result

Command: `node tools/playwright/ui-ux-accessibility.mjs`

- Engine: Chromium with `@axe-core/playwright` 4.10.2.
- Tags: WCAG 2 A/AA, WCAG 2.1 AA and WCAG 2.2 AA.
- Destinations: Today, Markets, Stock 360, OIIS Lab, Paper Trading, Derivatives, Data & Operations and Admin.
- Viewports: 1920×1080 and 390×844.
- Reduced motion: enabled.
- Result: **16 scans, 0 violations, 0 affected nodes**.
- Machine evidence: `/home/novius2/NIFTY50/ui-ux-transformation-evidence/phase-14a-accessibility/axe-results.json`.

## Remediations verified

- Removed nested `main` landmarks.
- Added accessible names to the command palette and form controls.
- Corrected tab roles/selection in OIIS.
- Made scrollable data regions keyboard focusable and named.
- Removed invalid nested interactive SVG semantics in the Paper reward/pain atlas.
- Darkened neutral, warning and small-label roles to AA contrast without relying on red/green alone.
- Preserved router-driven `aria-current`, modal naming, Escape close, focus return and body-scroll cleanup.

## Responsive interaction evidence

The responsive navigation suite verifies labelled desktop/mobile navigation, explicit More activation, focus entry/return, Escape, backdrop/destination close, 25 repeated cycles, resize close, body-scroll cleanup, route state, presentation layering and bottom-dock clearance. Result: 118/118.

## Not yet claimed

Automated axe is not a substitute for manual assistive-technology acceptance. A manual NVDA/VoiceOver pass, forced-colours review and all critical flows at 400% zoom remain open release evidence. The application therefore has a clean automated gate, not an unconditional WCAG conformance certification.
# Navigation interaction addendum — 2026-08-12

- Universal command dialog traps focus, reports result count/selection and restores invoking focus on Escape.
- Desktop workspace arrows move focus without activating a route; Enter/Space remains the activation boundary.
- Mobile More remains modal, focus-trapped and closes on all tested lifecycle paths.
- Character shortcuts are ignored inside editable controls and all shortcuts have visible alternatives.
- Final Axe matrix across eight canonical screens at desktop and mobile: 16 scans, zero violations and zero affected nodes. The only pre-final contrast edge was remediated from the shared Paper negative colour.
