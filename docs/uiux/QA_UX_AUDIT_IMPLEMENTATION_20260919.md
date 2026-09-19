# QA / UX audit implementation — 19 September 2026

## Scope and status

Input: `/home/novius2/NIFTY50/UX-v2/NIFTY50_QA_UX_Audit_Evidence_and_Fixes_2026-09-19.zip`.
Extracted without overwriting existing files to
`/home/novius2/NIFTY50/UX-v2/NIFTY50_Deep_Audit_20260919`.
All package SHA-256 checks passed. Read the audit, route corrections and acceptance instructions.
Canonical baseline: `7adb4a4e47d1f010772ff852447f9564c7644d6b`.
Implementation branch: `fix/qa-ux-audit-20260919`.

This is the first containment and workflow repair package, **not closure of the
51-finding audit**. No historical database repair, strategy economic change,
permission relaxation, new collector or paper/live action is included.

## Changes and evidence

- D01: `internal/smartapi/ws.go` rejects impossible OI percentages below −100
  while retaining raw packets and unrelated quote fields. `workspace.ts` also
  quarantines invalid stored percentages and suppresses dependent build-up.
  Null/blank/non-finite inputs do not become neutral or zero. Valid −100, zero
  and large positive changes are preserved. API exposes quality/reason.
  Provider-reported percentage is explicitly not independently baseline-audited.
  Go and API failing tests reproduced the defect before the guard; now pass.
- D02: regime session metadata now comes from the same section as its metrics.
  Timeline excludes later sessions; mismatched leadership is withheld instead
  of borrowing another session. A complete selectable snapshot contract remains
  outstanding; this patch is containment, not full D02 closure.
- D03/D16: dossier combined direction becomes unavailable when required evidence
  is hidden/downgraded. Options conclusions require finite PCR, max pain and both
  walls plus an approved quality lane. The former confidence label is explicitly
  a data-quality score, not probability. Broader claim-by-claim provenance remains
  outstanding. Standalone Options Structure now also withholds wall/PCR/max-pain
  conclusions for absent inputs. A versioned dossier snapshot key prevents old
  cached conclusions bypassing new guards; archived snapshots remain unchanged.
- D05: OIIS unavailable evaluation no longer says “This is not missing data” or
  displays a completed-zero funnel. Out-of-order read results are ignored.
- U01: OIIS owns its responsive sizing, minmax grid track and scrollable tab row.
  Mobile compact specificity is repaired without global overflow concealment.
- U04: query-driven strategy definition uses existing gate definitions, preserves
  other query parameters, works without a completed live evaluation, and supports
  reload/back/forward. No strategy formula was rewritten.
- C01: removed global class-substring rules hiding assumptions, explanations,
  metadata and page-purpose text. Components retain control of their disclosures.
- C03: explicitly defined missing panel-radius/control-height/page-padding aliases.
- U03/U17/D18: shared operational pages have bounded read waits and visible titles
  and descriptions (including the broad-market versus NIFTY500 scope warning).
  The shared AnalyticsHeader previously discarded title, subtitle and metadata;
  it now renders them, including the selected regime session.
- D09/U03: paper bootstrap no longer replaces summary above older complete rows.
  Each ledger read is bounded to 60 seconds; old complete data remains intact.
  Analyzer counts/exports are unavailable before the first complete ledger.
  A deterministic atomic-snapshot unit test covers complete, empty and bootstrap.
- D17: futures percentages and quantities get readable typed formatting while
  returned raw valid values retain precision.
- Q01–Q03: added attempt-specific browser checks with primary-region assertions,
  redacted path/status failures, geometry measurements and screenshots. No
  claim that all routes are functional just because text exists.

## Source trace and limitations

Futures path: binary bytes 139:147 → SmartAPI `Tick.OIChangePct` → instrument
state/archive → workspace projection → futures table. The current official
Python SDK also interprets that slot as signed int64:
https://github.com/angel-one/smartapi-python/blob/main/SmartApi/smartWebSocketV2.py
The observed numbers resemble a representation error, but that does not prove
the provider's actual wire encoding. No speculative float reinterpretation or
historical rewrite was performed. Raw evidence remains authoritative. Existing
stored invalid observations remain quarantined at the API boundary.

## Browser evidence

External evidence folders (not committed):

- `.../UX-v2/verification-20260919-attempt01`: failed test login/proxy cookie-path
  arrangement; no screen readiness claim.
- `.../UX-v2/verification-20260919-attempt02`: definition navigation passed, but
  initial overflow assertion missed ancestor clipping. **Rejected** as mobile
  acceptance despite the original JSON pass fields. At 390px the compact hero
  was 584.16px wide. Screenshot inspection caught it.
- `.../UX-v2/verification-20260919-attempt03`: strengthened check passed 13 cases:
  definition direct/reload/history and ten viewport/density combinations. At
  390px hero widths were 350px compact / 364px standard, page overflow 0.

Candidate Vite used existing authorised read-only API data. Loopback test cookies
use `/` for the Vite API proxy; production cookie configuration is unchanged.
These checks do not establish production acceptance or performance budgets.

Run with a NEW output directory for every attempt:

```bash
PLAYWRIGHT_MODULE=/tmp/paper-audit-browser-20260918/node_modules/playwright/index.mjs \
PLAYWRIGHT_CHROMIUM=/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome \
PLAYWRIGHT_OUTPUT_DIR=/path/to/new-attempt \
node tools/playwright/qa-ux-audit-20260919.mjs
```

## Finding ledger

`PARTIAL` means a targeted repair exists but the full audit acceptance has not
passed. `OPEN` means no closure claimed. No screenshot-only production PASS.

| IDs | Status | Remaining acceptance |
|---|---|---|
| D01 | PARTIAL | live source/baseline reconciliation and downstream consumer audit |
| D02 | PARTIAL | complete session selector, frozen fixtures, delayed-response tests |
| D03 | PARTIAL | every narrative dependency, standalone options page and exports |
| D04 | OPEN | score direction and cohort labels |
| D05 | PARTIAL | complete/partial/failed scan contract across all strategy pages |
| D06–D08 | OPEN | freshness, provider/cohort manifests, breadth denominator |
| D09 | PARTIAL | refresh atomicity fixed; full census and snapshot export validation open |
| D10–D12 | OPEN | cost basis, overlap and hindsight audits |
| D13–D15 | OPEN | participant scope, effective units, source readiness stages |
| D16–D18 | PARTIAL | shared score/format/universe contract beyond touched pages |
| D19 | OPEN | event direction/classification provenance |
| U01 | PARTIAL | final build, zoom and production regression |
| U02–U03 | PARTIAL | all primary routes and bounded dependency failures |
| U04 | PARTIAL | final build and production definition validation |
| U05–U10 | OPEN | mobile hierarchy, table/navigation/notification/theme checks |
| U11–U12 | PARTIAL | global readable typography and structured narratives |
| U13–U16 | OPEN | chart fixtures, matrix readiness, indicator and feedback flows |
| U17 | PARTIAL | page-header consistency beyond operational workspace |
| U18 | OPEN | alert lifecycle and delivery distinction |
| C01 | PARTIAL | full route visibility regression |
| C02 | OPEN | palette consolidation |
| C03 | PARTIAL | final computed-token coverage |
| C04–C06 | OPEN | cascade, contrast and stacking audit |
| Q01–Q03 | PARTIAL | expand strengthened collector to complete route inventory |
| Q04–Q08 | OPEN | role, accessibility, performance, security and alias suites |

## Initial validation

- API tests: 245/245 passed, including new containment regressions.
- Web tests: 208/208 passed, including atomic paper-snapshot tests.
- API/web typechecks passed.
- API/web builds passed after final edits.
- `go test ./internal/smartapi`: passed.
- `go test ./...`: passed.
- Canonical repository gate: passed.
- Deployment: application commit `d58180f` merged/pushed to master and deployed
  through the canonical Compose procedure. Only dashboard and collector recreated.

Extended candidate capture attempt05 records 16 additional desktop/mobile views
as NOT_VALIDATED, not functional passes. Some were still loading after five
seconds and navigation aborted in-flight requests. The screenshots revealed the
discarded shared header and paper bootstrap issues above; it is discovery
evidence, not proof of fixed performance or all-route readiness.

Attempt06 repeated the 13 targeted checks successfully after final edits and
captured the same 16 discovery views. Regime screenshot inspection confirms
selected-session metadata is visible and distinct from the latest shell ticker.
Paper analyzer explicitly withholds metrics while the complete ledger loads.
Discovery views remain NOT_VALIDATED; five-second captures are not load-time or
full accounting acceptance. Evidence: `/home/novius2/NIFTY50/UX-v2/verification-20260919-attempt06`.

Pre-release image IDs: dashboard
`sha256:bc5f2b262bb18a42dd58868c3969997537135d347fa3145bbee2089e8b46af8d`;
collector `sha256:359d9aea625a7149522a161bc8d0a8b3a6b46a475a53255f0e4b633fd9eb51a5`.

## Release/rollback

Keep the previous dashboard/collector image IDs before rebuilding. Merge only
this scoped branch to master after checks and push before deploying. Recreate
only affected services. Never roll back data/volumes. A cosmetic rollback must
retain the invalid-data containment guards. Record actual deployed SHA and public
checks here after release; do not infer deployment from a successful local build.

### Actual release evidence

Released application SHA: `d58180f` (19 September 2026, approximately 04:37 UTC).
Dashboard image: `sha256:f7e8d1350aa9736ae0d9c7cd9cbe3f7050dbf6c9b7961c0ad971afe4d83faa53`.
Collector image: `sha256:e15fdfa93e7f9eed6f51f64c128db32f3492e9c145c1daaa85eac8c1bd7b0cd8`.
Both containers healthy. Collector initial instrument refresh delayed health;
it became healthy without intervention. No unrelated containers removed.

Authenticated public browser: `https://n50.nifty50today.co.in/n50`.
Protected environment login succeeded with canonical Origin and unchanged secure
cookies. `verification-20260919-production01` contains 14 passing targeted checks:
live futures boundary, direct/reload/history definition navigation, and ten
viewport/density geometry cases. API returned 430 contracts; 321 invalid supplied
percentages were quarantined, not corrected or silently replaced by zero.
Production desktop definition screenshot was visually inspected.
These counts are captured observations, not hard-coded acceptance expectations.
Production does not independently establish the correct provider baseline.

Evidence folder:
`/home/novius2/NIFTY50/UX-v2/verification-20260919-production01`.
Release/build logs: `/tmp/qa-ux-dashboard-release-20260919.log` and
`/tmp/qa-ux-collector-build-20260919.log` (temporary operational logs).
Rollback tags: `trading-stack-n50-dashboard:before-qa-ux-20260919` and
`trading-stack-collector:before-qa-ux-20260919`. Do not restore unsafe derived
values as a cosmetic rollback; retain containment fixes.

Remaining audit findings above are still OPEN/PARTIAL. Full role, paper-accounting,
all-route, chart interaction, accessibility and performance acceptance is not
claimed by this limited controlled release.
