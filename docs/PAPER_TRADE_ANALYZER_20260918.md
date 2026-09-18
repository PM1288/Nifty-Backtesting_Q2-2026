# Paper Trade Analyzer

## Scope and navigation

Additive Paper Trading → Analyzer tab, `/n50/paper-trading?tab=analyzer`.
Uses the existing authenticated paper ledger and its serial refresh lifecycle;
no new endpoint, collector, database write, strategy rule, target/exit or order
permission change. The existing trade inspector and all other tabs remain.

## Analysis

- Separate closed realised-net, open remaining-quantity unrealised-gross and
  hypothetical entry-day EOD-gross bases. Never pooled into one accounting total.
- Mean/median return, positive/negative/flat counts, descriptive Wilson 95%
  positive-rate interval, selected-basis P/L and distinct-symbol count.
- Equal-width histogram or area-normalised probability-density histogram.
- Selected entry parameter versus outcome scatter, Pearson and tied-rank
  Spearman correlation map, matched sample/stock counts and missingness.
- Group comparison by strategy/version/entry-rule, direction, sector, IST entry
  hour, weekday and selected-parameter quartiles. Equal parameter values stay
  together, so groups need not have equal counts.
- Early/later split at approximately 70% of distinct entry dates, keeping each
  date together. This is descriptive stability, NOT an untouched validation set.
- Symbol, strategy, direction and entry-date filters; trade-level existing
  inspector; full filtered CSV and JSON, with basis, timestamp, exclusion reasons,
  parameters and raw source evidence in JSON.

## Method and safeguards

Closed return = realised_pnl / (average_entry_price × opened_quantity) × 100;
requires remaining_quantity exactly zero. Open return uses unrealised_pnl /
(average_entry_price × remaining_quantity) × 100, excluding partial realised
amounts. EOD uses the canonical hypothetical projection and its availability flag.
Invalid source evidence and missing outcomes are excluded, not zero-filled.
Permanent warning shows eligible closed and open totals separately, preventing
closed-win selection from hiding open losses. These filtered totals are NOT the
whole-account reconciliation.

RSI, volume ratio, O factor, X factor, directional edge and ATR percentage require
evidence_available_at <= opened_at. Entry spread requires a nonnegative recorded
quote no more than 60 seconds before entry. After-trade quality scores, MFE/MAE
and retrospective grades are deliberately not entry predictors. Notional and
entry price come from recorded fills.

Correlation requires at least three matched variable pairs; fewer than ten
outcomes is flagged as too small. Constant or absent values produce unavailable
correlation. There are no automatic trade recommendations or parameter changes.
Repeated stocks/session clusters, selection bias, multiple comparisons, regimes,
and varying holding periods limit interpretation. Wilson intervals assume
independence and may understate uncertainty. A positive correlation is not
automatically good; a negative one is not automatically bad.

## Initial live evidence

Read-only saved ledger had 88 equity legs. Closed basis included 35 legs across
28 symbols, excluded 29 still-open eligible legs and 24 source-invalid records.
The eligible closed sample was mostly positive while open marks were mostly
negative, making accounting separation especially important. Entry spread had
less coverage than the recorded RSI/O/X factors. These are snapshot facts, not
hard-coded expected production counts or a certified profitability result.

## Files and tests

- web/src/lib/paperAnalyzer.ts: normalisation, statistics, correlation, bins,
  grouping, temporal split, formula-safe CSV.
- web/src/pages/PaperTradeAnalyzer.tsx and CSS: visual dashboard.
- PaperTradingCommandCenter.tsx: additive tab, existing data and inspector reuse.
- web/tests/paperAnalyzer.test.ts: eight focused tests covering accounting,
  missing/late/invalid data, EOD availability, positive/negative/zero outcomes,
  correlation ties/degeneracy, density integral, temporal split and CSV safety.
- tools/playwright/paper-analyzer-review.mjs: authenticated real-ledger desktop/
  mobile, all bases, density, parameter/group filters, no-match state, CSV/JSON,
  existing inspector, tab navigation, no mutations and no page errors.

Web 203 tests and API 232 tests passed with typechecks/builds. Initial browser
run exposed ambiguous select accessible names; explicit labels fixed these.
Rerun passed. Screenshot inspection exposed a shared visual-map legend sizing
issue: this view now uses its own labelled -1/0/+1 colour scale without modifying
shared charts. Production checks/release evidence follow below.

## Repeat

```bash
cd /home/novius2/trading-stack
PLAYWRIGHT_MODULE=/tmp/paper-audit-browser-20260918/node_modules/playwright/index.mjs \
PLAYWRIGHT_EXECUTABLE_PATH=/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome \
REVIEW_ORIGIN=http://127.0.0.1:19090 \
REVIEW_OUTPUT=output/playwright/paper-analyzer-production \
node tools/playwright/paper-analyzer-review.mjs
```

Protected credentials are read in memory. Runtime snapshots/screenshots stay in
ignored output/. Required checks: web/API typecheck, test, build, canonical gate.
Deploy only dashboard via scripts/deploy_n50_dashboard.sh from pushed master;
retain the prior dashboard image for rollback. No DB migration or data cleanup.

Density rendering follow-up: the shared surface rounds number-valued plot data
to two decimals. This view passes density as ECharts numeric strings, preserving
the actual density geometry, and uses scientific tick/tooltip notation. A ninth
test verifies small densities survive the adapter and still integrate to one.
No shared renderer or other chart is changed.

## Production acceptance

- Final application commit `9cfec29` pushed and deployed from master after the
  original Analyzer commit `9a76b21`. Documentation-only follow-up does not
  require a container rebuild.
- Healthy image `sha256:3c8d31d07551ee2a5b0ddfab361c41f88691c9a36bfbdeaa1206be82eba18992`;
  entry asset `/n50/assets/index-CTkX7zlD.js`.
- Previous pre-Analyzer image retained as
  `n50-dashboard:before-paper-analyzer-20260918`. Only dashboard recreated;
  collectors, PostgreSQL, volumes and order services untouched.
- Final web 204/204 and API 232/232 tests, typechecks/builds and canonical gate
  pass. One development rerun failed during a dynamic module reload; a stable
  candidate rerun and the deployed production run passed with zero page errors.
- Authenticated production Chromium 1920×1080 and 390×844 PASS: closed/open/EOD
  selection, parameter/quartile comparison, density, empty filter state, CSV/JSON,
  existing inspector and navigation back to Simple view. No paper mutation
  requests and no page-level horizontal overflow. Visual screenshots reviewed.
- Public HTTPS login, Analyzer route and authenticated paper bootstrap all 200.
- Paper notifier preservation: 17/17 checks passed on Analyzer, including
  desktop/mobile voice and event UI. Evidence is ignored under
  `output/playwright/paper-analyzer-production/` and `paper-analyzer-notifier/`.
- Paper refresh preservation PASS: 88 rows retained through two completed
  automatic refreshes, all 88 retain audit metadata, zero mutation requests.
  Own temporary candidate Vite listener was stopped after testing.
- No claim of predictive validation, full option-trade coverage, or exhaustive
  regression of every unrelated dashboard. Source-invalid records remain stored
  and excluded from this analysis with visible reasons.
