# Production UI cleanup — 2 October 2026

## Scope and release

UI, UX, navigation copy and presentation only. Starting commit: `c75b0a7`.
Branch: `ui/production-copy-cleanup-20261002`. Dashboard-only release through the canonical deployment procedure.

No pricing, strategy qualification, accounting, permissions, notification delivery,
collector, database or order-submission rules are changed.

## Implemented

- Removed page introductions that described the interface, navigation instructions,
  decorative navigation badges and animated shell backgrounds. Retained the ticker,
  target cursor, alerts, font preferences and all destinations.
- Removed the ASCII market dossier, LLM brief and machine-facts presentation.
  Market observations remain available under keyboard-accessible Market details.
  Headline and summary observation dates are explicit, including when they differ.
  Snapshot keys have readable labels; values, signs and unavailable markers are retained.
- Removed prompt-shaped eleven-part chart labels; retained definitions, units,
  bullish/bearish interpretation, limitations and current observations.
- Shortened research headings, paper trade labels, loading copy and empty states.
  Removed redundant leaderboard instructions and the artificial display-mode KPI.
- Replaced the implementation-oriented system map with a permission-aware workspace
  directory using the existing route catalog. Standardized common navigation labels.
- Made shared page subtitles optional, removed nested main landmarks, reduced nested
  market surfaces and standardized analytical body/table typography.
- Added a presentation-boundary read-error formatter. Raw server diagnostics are
  not shown in the updated read-error paths; session/access failures have actionable
  messages. Trading form validation and execution safeguards retain their behavior.
- Updated localization keys for renamed copy. Removed obsolete translations for
  rewritten long paragraphs rather than displaying the old paragraph under a new key;
  normal English fallback applies where a revised translation is not available.

## Canonical vocabulary

| Concept | UI label |
| --- | --- |
| Top-level analytics | Market overview |
| Market phase | Market regime |
| Ranked stocks | Stock leadership |
| Historical flow observations | Flow history |
| Instrument view | Stock details |
| Strategy listing | Strategy leaderboard |
| Simulated trades | Paper trading |
| Trade source review | Paper trade data quality |
| Route directory | Workspace directory |
| Data availability and freshness | Data quality |

Keep NSE, FII, DII, OI, PCR, RSI, VWAP and strategy names where they have domain
meaning. Keep source times, missing-data warnings, model eligibility, statistical
sample sizes, research limitations and paper/live restrictions. JSON/CSV export
formats and administrator diagnostics are legitimate in their respective controls.

## Evidence and validation

Evidence is outside Git at:
`/home/novius2/NIFTY50/evidence/ui-cleanup-20261002/`.

- `source-copy-before.json`, `source-copy-after.json`: source-string inventory.
- `copy-decisions.json`, `removed-introductions.json`: first-pass copy decisions.
- `before/`, `before-supplement/`: production baseline captures and extracted text.
- `preview/`: 71 authenticated route/view captures at 1440×1000 and 390×844.
- `browser-checks/`: preservation, keyboard, read-error and financial reconciliation checks.
- `web-tests.txt`, `api-tests.txt`, `web-build.txt`, `types.txt`, `canonical-gate.txt`.

Baseline route capture initially hit duplicate `main` landmarks on 21 routes;
this exposed the nested-landmark defect corrected by this release. All 71 preview
routes subsequently captured without page exceptions or whole-page horizontal
scroll. Deferred data loads require settled captures and preservation checks;
a screenshot of a loading state is not evidence that a loaded workflow passed.

Web tests: 286 before, 291 after (safe errors, snapshot display and production-copy
regressions added). API tests: 289, unchanged. Both production builds and typechecks
are required. Global frontend lint remains pre-existing debt: 227 errors / 65
warnings before this UI work; 226 errors / 65 warnings after cleanup. It is not a
clean lint gate and no suppression was added.

The initial monthly browser regression found a sentence-case label mismatch; the
rendered heading and assertion were corrected together, retaining ledger and reason
inspector assertions. Failure logs are retained in the evidence history where available.

## Reproduction

Use Node 22 and protected deployment credentials; never put passwords in scripts.

```bash
cd /home/novius2/trading-stack
npm run typecheck --workspace=@app/web --prefix neon-stock-terminal
npm test --workspace=@app/web --prefix neon-stock-terminal
npm run build --workspace=@app/web --prefix neon-stock-terminal
npm run typecheck --workspace=@app/api --prefix neon-stock-terminal
npm test --workspace=@app/api --prefix neon-stock-terminal
npm run build --workspace=@app/api --prefix neon-stock-terminal
bash scripts/verify/canonical-repository-gate.sh
# PLAYWRIGHT_ADMIN_PASSWORD supplied from protected environment:
PLAYWRIGHT_OUTPUT_DIR=/path/out node tools/playwright/ui-copy-audit.mjs
PLAYWRIGHT_OUTPUT_DIR=/path/out node tools/playwright/ui-copy-regression.mjs
```

The audit supports `UI_AUDIT_ROUTES` (JSON array) and `UI_AUDIT_SETTLE_MS` for
slow-loading states. `UI_PREVIEW_ORIGIN` can serve the canonical local preview's
HTML/assets through the authenticated public browser origin while APIs stay live.
It changes test routing only; it does not change authentication or production assets.

## Deployment and rollback

After passing checks, push the branch, fast-forward/push master, retain the running
image as `ui-cleanup-rollback-20261002:n50-dashboard`, then run:

```bash
bash scripts/deploy_n50_dashboard.sh
```

Rollback, if required, only the dashboard:

```bash
docker tag ui-cleanup-rollback-20261002:n50-dashboard trading-stack-n50-dashboard:latest
docker compose -p trading-stack-novius2 --env-file .env -f docker-compose.yml up -d --no-deps --no-build n50-dashboard
```

No database rollback applies. Keep unrelated untracked research artifacts intact.

## Final visual corrections

The first deployment was healthy. Inspection of expanded market details caught
lowercase source keys missed by the initial display formatter; matching now
handles both cases, with regression assertions on the actual rendered details.
The completed-session trade date is separate from the refresh timestamp.
Paper trading's large intermediate loading message now uses the existing shared
skeleton; the accounting and trade-loading sequence are unchanged.

Detailed chart interpretations now use native disclosure controls on six analytical
screens. Definitions and limitations remain accessible without eleven explanatory
blocks competing with each chart. Primary freshness and trading warnings remain
visible outside these disclosures.

## Accessibility and unavailable historical charts

Expanded public scans found 52 affected nodes across six screen/viewport findings:
small Home sector targets and low-contrast stock identity / paper tab metadata.
The six-route profile also caught a non-focusable Scalper loading region.
These were corrected with minimum target sizes, existing readable text colors
and keyboard access. The preview rerun was clean. A subsequent public run caught five more Home risk-list targets after live data arrived; those now also meet the minimum target size. The final 16 public scans have zero violations.

H30 historical chart endpoints return HTTP 404 at both supported URL prefixes.
The UI now shows `Chart unavailable` with a meaningful chart caption instead of
a broken image and internal artifact name. Published numerical observations and
research limitations remain visible. Restoring those archived chart files is a
separate data/runtime task; no replacement chart or synthetic data was invented.

The final institutional review removed a duplicate flow heading, a prototype
subtitle and filesystem paths from the ordinary report header/browser. Report
dates, availability counts, download controls and administrator diagnostics remain.

The source sweep also removed the remaining self-referential indicator/heatmap
introductions, database retry explanation and duplicate leaderboard heading.
Methodology disclosures accept an optional introduction, so warnings and formula
notes do not need filler prose. Source regression checks cover those exact remnants.


## Final release receipt

- Application commit: `65274892198d838ad942232665af39ad853b7639`, pushed to the
  working branch and master before deployment.
- Production: https://n50.nifty50today.co.in/n50
- Entry asset: `index-CrD9StIe.js` (public version endpoint and routed asset verified).
- Container: `trading-stack-novius2-n50-dashboard-1`, healthy, zero restarts.
- Image: `sha256:17558638295d0444e36a4ea44df1d2f723101e39efbe50070c657e77d28fda79`.
- Dashboard only redeployed; unrelated services and user research files preserved.
- Last visual correction simplified Stock mix and legacy selection headings,
  translated connection status into product language, and wrapped noncompact stock
  filters on mobile without changing filter values or behavior.

### Before and after

| Check | Before | After |
| --- | --- | --- |
| Duplicate main landmarks | 21 route variants affected | One main on all 71 captured route/views |
| Market overview initial visible words | 7,211 | 471; detailed observations available in disclosures |
| Web regression tests | 286 passing | 291 passing |
| API regression tests | 289 passing | 289 passing; backend unchanged |
| Public accessibility scans | Contrast, keyboard and target-size findings | 16 scans, zero violations |
| Frontend lint | 227 errors, 65 warnings | 226 errors, 65 warnings; existing debt retained visibly |

The text count is a hierarchy/noise measurement, not a latency benchmark. No
backend speedup or financial change is claimed in this UI-only release.

### Verification results

- Web tests: **291 pass**; API tests: **289 pass**.
- Web/API typechecks and builds: **pass**; final dashboard production build: **pass**.
- Canonical repository gate and `git diff --check`: **pass**.
- Public full route audit: **71 route/view combinations × two viewport sizes**,
  no page exceptions, no page-width overflow, one main landmark each (`after/`).
- Final changed-copy captures: **8 routes × two viewport sizes**, same checks pass
  (`release-copy/`); the slower legacy route also passed loaded desktop/mobile
  review after 65 seconds (`release-legacy-settled/`).
- Final release browser tests (`browser-accepted/`): **16 accessibility scans**,
  **6 copy/error/keyboard disclosure checks**, **9 canonical workflow checks** pass.
- Earlier release preservation suites: monthly/rolling ledger **14**, paper notifier
  **17**, Home cards **5**, keyboard **4**, ambient-background **6** pass; Paper
  Workbench six viewports, inspector/filter/export/financial reconciliation and
  Scalper V2 70-second live-refresh checks pass.
- Six-route public profile (`browser-final/`): no page exceptions, console errors
  or accessibility violations on those sampled pages. H30 missing-resource failures
  are separately documented above; this is not a claim that all remote assets exist.
- Final evidence: `deploy-final.txt`, `release-receipt.json`, `browser-accepted/`,
  `release-copy/`, `release-legacy-settled/`, `lint-final.txt`.

### Remaining limitations

1. Archived H30 chart files are absent server-side. The unavailable state is fixed;
   restoring those files requires a separate data/runtime repair.
2. Repository-wide lint is not clean; the remaining 226 errors / 65 warnings are
   documented rather than suppressed or mixed into this UI-only change.
3. Revised long-form translations use English fallback pending reviewed translations.
4. Browser coverage includes major routes, responsive states and the listed critical
   interactions; it is not exhaustive coverage of every role, locale or data condition.
   Retained research, stale-data, execution and accounting warnings are intentional.
