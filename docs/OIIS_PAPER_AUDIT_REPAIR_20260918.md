# OIIS paper audit repair — 18 September 2026

## Source precedence and scope

Reviewed the forensic review (v1, 101 pages) and revised opportunity/backtest plan (v2, 156 pages) in `/home/novius2/NIFTY50/AUDIT`. The revised main report supersedes the original interpretation; its Appendix A preserves the original review. PDF statistics refer to the 15 September export, not today's ledger.

The reports support retaining recorded executions and the current strategy baseline. They do not establish profitable new target/stop/admission rules. A favourable excursion or target touch is opportunity evidence, not an executed exit, capital release, or an amount that can be added across alternative targets.

## Implemented first repair

- Serial UI revalidation 30 seconds after a request finishes; focus/tab return also revalidates. No overlapping requests; loaded rows remain while summary/detail requests run. Successful refresh time is visible in the evidence panel.
- Open positions receive forward canonical market marks independently of observation-tracker completion. This path changes no target, order, fill, horizon, capital or session counter. Locks protect quantity while marking; marks cannot move backwards or into the future.
- Finite, positive, coherent OHLC is required for new monitor evaluations and entry candidates. Invalid observations remain in their source tables, but cannot manufacture extrema or target hits. An invalid earliest entry candidate fails closed rather than choosing a later favourable entry.
- Additive API audit metadata identifies invalid stored prices, legacy completed horizons needing reconciliation, and still-open capital after observation completion. No stored outcome or accounting calculation was rewritten.
- Evidence panel separates touches from execution, discloses unverified horizons and lists research challengers as unvalidated.

## Explicitly not completed by this repair

Qualified S0–S4/S0–S29 reconstruction and coverage reconciliation, disputed target/extrema repairs, historical prediction replay, execution-friction modelling, borrow feasibility, finite-capital challenger replay, and out-of-sample indicator/target evaluation remain pending. Existing horizon completion logic remains legacy and must not be certified from session counters. Audit metadata marks completed records unverified; existing figures remain accessible for source parity.

The database calendar was observed to classify 14 September as open although the official NSE 2026 holiday circular lists Ganesh Chaturthi that day. Calendar coverage also needs extending/reconciliation. No global calendar or historical data was rewritten. Source: https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf

Research register: R00 version-specific recorded replay; R01 canonical I030→S100; R02 independent opportunity shadows. Candidates: C01 fresh qualification; C02 one active issuer; C03 equal 30/60-minute exposure; C04 I050→S100; C05 I100→S100; C06 feature ablation; C07 matched controls; C08 execution/cost stress; C09 finite capital. These specifications must not alter actual trades before independently validated. HIT/MISS/CENSORED/DATA_INVALID and EXECUTED need separate evidence.

## Validation and rerun commands

```bash
cd /home/novius2/trading-stack/neon-stock-terminal/apps/web
npm run typecheck && npm test && npm run build
cd /home/novius2/trading-stack/neon-stock-terminal/apps/api
npm run typecheck && npm test && npm run build
cd /home/novius2/trading-stack
docker run --rm --network none --entrypoint python -v /home/novius2/trading-stack/services/paper_trading:/work:ro -e PYTHONPATH=/work/src trading-stack-paper-trading:1.0.0 -m pytest /work/tests -q -p no:cacheprovider
bash scripts/verify/canonical-repository-gate.sh
# Supply PLAYWRIGHT_ADMIN_PASSWORD from protected environment, never a script.
node tools/playwright/paper-audit-refresh.mjs
```

If Playwright is not installed in the repository, install it in a temporary
tools environment rather than changing the application lockfile:
`npm install --prefix /tmp/paper-audit-browser-20260918 playwright@1.55.0 --no-audit --no-fund`.
Set `PLAYWRIGHT_MODULE=file:///tmp/paper-audit-browser-20260918/node_modules/playwright/index.mjs`
and `PLAYWRIGHT_EXECUTABLE_PATH` to an existing compatible Chromium executable.
The run used `/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`.

Database integration tests require an isolated TEST_DATABASE_URL; never supply the production DSN because those fixtures reset their schema. Runtime screenshots and generated result JSON remain in ignored `output/playwright/paper-audit-refresh`, not Git.

## Release and rollback

Commit/push and merge the feature branch into master before release. Dashboard uses `bash scripts/deploy_n50_dashboard.sh`. Monitor uses the existing project's two Compose files and recreates only `paper-monitor-worker`, leaving unrelated workers/collectors untouched. Rollback by reverting the scoped commit, rerunning checks and rebuilding these services. Forward valuation rows are source-derived evidence, not fabricated recovery; do not delete ledger/source data during rollback.

Validation results and deployment status are recorded in AGENT_HANDOFF.md after execution. This document is not a claim that all PDF research/backtests were completed.

## Executed release evidence

Application commit `51e7e12` was pushed to the feature branch and master before
release. Web: 193 tests passed; API: 215 passed; both typechecks/builds passed.
Python: 28 passed, 6 database integration tests skipped. Preservation gate passed.
Dashboard is healthy with entry asset `/n50/assets/index-BgQfLh9_.js`.
Only the dashboard and monitor containers were recreated. All 31 open positions
now have the latest available canonical timestamp, 18 September 10:38 UTC;
this mark is not evidence of a continuous-session executable fill.

Production-build npm audit reported 16 dependency vulnerabilities (including
one critical and three high). No dependencies were added/changed by this repair;
dependency remediation remains separate pending reviewed upgrades.

Browser test initially used an obsolete table selector, then an incorrect
proxied extra API URL (401). The final test uses the current Simple view and
the authenticated response received by the page. Neither error is hidden as a
passed application check. Mobile and full feature-by-feature browser regression
were not performed in this repair.

Final authenticated desktop test: PASS, 88 visible rows, two successful refresh
responses, zero paper mutations, audit metadata on all 88 rows. Screenshot was
visually inspected. Evidence: ignored `output/playwright/paper-audit-refresh/`.
