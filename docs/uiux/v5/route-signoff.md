# Compact UI V5 route sign-off

## Source and preservation status

- Source commit audited: `6722e5ae8046206cea6152bdf75a2d233ab798bf`.
- Deployed baseline bundle: `index-Da3mAz6Z.js`.
- Candidate bundle is built with `VITE_UI_COMPACT_V5=true`.
- The named 19-page PDF remains `UNVERIFIED` because it is absent from the workspace. Every transcribed page instruction in the V5 prompt is mapped in `annotated-comment-matrix.md`.
- Strategy, selection, target, P&L, accounting, paper lifecycle, API and database code are unchanged.

## Representative route disposition

| Route | Family | V5 disposition | Preservation |
|---|---|---|---|
| `/` | Home | compact shell; board controls combined; stock-mix panel removed | live index, VIX, alerts, ticker, heatmap lenses and stock drill-through retained |
| `/strategy/oiis-live` | Strategy | compact identity, decision band and six-stage funnel | blockers, policy, run metadata and every candidate lens retained |
| `/strategy/trendlyne-summary` | Strategy | compact identity/toolbar/KPI strip; charts moved upward | all reports, houses, stocks, chart series, filters and CSV retained |
| `/strategy/monthly` | Strategy | single context row; one KPI strip; dense ledger | selected, rejected, incomplete, all-stock reasons and CSV retained |
| `/strategy/rolling-monthly` | Strategy | same Monthly grammar | all 5/10/30/60 evidence and populations retained |
| `/strategy/long-options` | Options strategy | compact policy, decision, route cells and evidence | all structures, source quality and hard gates retained |
| `/paper-trading` | Paper | current-state Overview; inactive heavy lenses unmounted | every accounting class, lens, inspector, note, audit and export retained |
| `/paper-trading?tab=simple` | Paper | dense sortable/filterable monitoring table | full filtered CSV/XLSX and full inspector retained |

All additional canonical routes inherit compact shell, compact shared page headers/status/KPIs and analytical spacing according to their family mapping in `element-disposition-map.json`. That manifest contains one disposition for each of the 55 rendered canonical route specimens. The source router also retains redirects, compatibility aliases, parameterised routes and its fallback; those do not create an independent page grammar.

## Automated route evidence

- 55 rendered route specimens × 4 required viewports = **220/220 passing checks**.
- Viewports: 1920×1080, 1440×900, 1024×768 and 390×844.
- Desktop analytical shell: **95 px**. The permission-aware Control Plane omits the primary navigation and measures **59 px** by design.
- Viewport-level horizontal overflow: **0/220**.
- Feature flag present and true: **220/220**.
- Unexpected same-origin HTTP failures: **0/220**.
- Serious/critical Axe findings across 12 representative page-family routes: **0**; timeouts: **0**.
- Paper Overview mounted heavy workbench sections: **1**; inactive Factor, Capital, Path, Reward/Pain, Scenario and Audit lenses: **0**.
- Supplemental lens/deep-link sweep: **21/21**, covering every Paper heavy lens, all 13 OISS lenses and the NIFTY weekly-options alias.
- Settled Simple View sweep: **4/4**, with all **44** filtered canonical records rendered at every required viewport.
- Final affected-route recheck after stock-mix relocation: **32/32** across the eight annotated core routes and all four viewports.

Detailed automated results are generated in `full-route-screenshots/results.json`; PNGs and runtime JSON remain local and ignored by Git under repository policy.

## Material limitations

- `Updates-required_260825_232528.pdf` is absent from `/home/novius2`; the 19 transcribed page instructions in the V5 prompt are implemented and mapped, but the original handwritten PDF remains `UNVERIFIED`.
- Two canonical H30 analytical artifact URLs return an existing explicit 404 unavailable state for each viewport. The audit records these as `expectedMissing`; V5 does not alter backend/data semantics.
- A product favicon/brand image was not present in the audited app assets. Stock-logo archives are not a product brand mark, so V5 did not invent or redraw one.
- Scripted representative workflows are complete; independent acceptance by the three human users remains an operational sign-off, not something an automated coding run can truthfully claim.
- The repository-wide ESLint baseline still contains pre-existing `any`, unused-symbol and hook-dependency debt. Changed behavior passes TypeScript, unit, Storybook, route and accessibility gates; the lint debt is not silently presented as fixed.

## Gate status

The candidate gate has passed type-check, 54/54 web tests, 128/128 API tests, Storybook build, canonical repository check and the complete 220-check Playwright sweep. Production post-deployment smoke and focused export regressions remain the final cutover gate. Material exceptions are listed rather than converted to PASS.
