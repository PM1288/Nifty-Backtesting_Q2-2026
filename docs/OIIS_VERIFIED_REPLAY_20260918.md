# OIIS verified evidence and capital replay — 18 September 2026

## Scope and models

Additive Paper Trading tab `/paper-trading?tab=verified`, **Verified replay · ₹4 lakh**.
Authenticated read-only GET `/v1/workspace/paper-trading/research` runs only on
explicit Run. Existing portfolio/simple/tracked/workbench, canonical inspector,
alerts, strategies and actual ledger remain unchanged. No orders, collectors,
threshold changes, invented recorded exits or historical-row rewrites.

- S0–S4/S0–S29 verification requires every expected retained minute and final
  closing bar. Missing coverage is CENSORED; corrupt bars/incompatible entry
  evidence are DATA_INVALID. Raw legacy results stay separate. Partial MFE/MAE
  measures retained observations only, not complete maximum opportunities.
- Normal NSE cash minute-start bars 09:15–15:29 IST become available at minute
  end. Entry-day coverage starts at the next whole minute. S0 includes entry day.
  Calendar supports 2026 normal sessions only, based on
  [NSE holiday circular](https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf).
  Special sessions/later years are unsupported, never guessed.
- Independent ₹100,000/₹200,000 allocations from ₹400,000 starting capital.
  Actual closing fills release proportional capital before simultaneous entries;
  target touches/marks never force release. Entry shares are whole; scaled partial
  exits can be fractional. No timeout, stop or invented exit.
- Both sides reserve full entry notional. Cash-short borrow/delivery is unverified.
  Session-last valid marks are not executable quotes. Unmarked positions retain
  entry value explicitly. Drawdown is sampled, not maximum intraday drawdown.
- Cohorts: all OIIS; month-specific qualified monthly-symbol retrospective
  intersection; qualification created AND last updated before entry. The last
  proves only stored-before-entry, not full point-in-time source availability.
  SELL symbol membership does not certify bearish monthly direction. Monthly
  exclusion reasons/conditions remain available.
- Independent intraday 0.3/0.4/0.5/1% and swing 1/2/3% target windows; swing
  excludes S0. HIT is a retained touch, not execution; MISS requires complete
  coverage. Missing earlier bars can hide earlier touches. Stored target
  disagreement, orders/fills and capital-lock reasons remain inspectable.
- Shadow alternatives assume a full target-price fill at first retained touch-
  bar end and omit recorded exits. Alternatives must never be summed; not a
  production exit rule, executable backtest or profitability claim.
- Optional fee/slippage stress 0/5/10/20 bps per fill and one-active-issuer
  challenger. Estimated friction is not actual broker charges. Corporate actions,
  borrowing, liquidity, discrete exits and tax reconciliation remain unverified.
  Exports retain current sector metadata, not historical sector attribution.

## Source limitations found

Read-only consolidation returned 863 daily rows, earliest minute session
1 September 2026. August minute coverage is absent. Those trades and incomplete
September windows cannot be certified as complete 5-/30-session outcomes.
Monthly records revised after entry fail the stored-before-entry check.
No missing history was fabricated or ledger rewritten.

Initial correlated target SQL exceeded 60 seconds. Materialised/preaggregated
hits reduced the diagnostic query to 14.586 seconds. Endpoint query/transaction
caps are 45/50 seconds; single-flight, 60-second completed-result cache;
different concurrent replay context returns 429. Pointer/view selection does
not trigger a research request; ordinary paper refresh remains independent.
Current marks, legacy horizons and order statuses are labelled raw/current,
never used to control an earlier as-of replay.

## Files and exports

API: `lib/paperVerifiedReplay.ts` and tests; `routes/paperVerifiedResearch.ts`
and tests; additive registration in `routes/workspace.ts`.
Web: `pages/PaperVerifiedResearch.tsx`, local CSS;
`lib/paperResearchExport.ts`, export tests; additive tab in
`pages/PaperTradingCommandCenter.tsx`.
Browser: `tools/playwright/paper-verified-replay.mjs`.

Full JSON, horizons/positions/equity/source CSV, twelve-sheet styled/frozen Excel-
compatible SpreadsheetML `.xml` workbook (not falsely labelled `.xlsx`), and
Markdown with cohort/capital summaries, parameters, limitations and exclusions.
Nested source evidence survives JSON/source CSV/workbook; formula-like CSV text
is escaped while numerical signs stay numeric. Runtime exports/screenshots are
ignored under `output/playwright/paper-verified-replay/`.

## Checks, rerun and release

Pre-release web typecheck/build and 195 tests PASS; API typecheck/build and 225
tests PASS; canonical gate PASS. Tests cover holidays, coverage, invalid OHLC,
cutoff leakage, recorded-fill release, partial/simultaneous fills, fees, shorts,
late/revised monthly evidence, independent targets and export signs/escaping.

```bash
cd /home/novius2/trading-stack/neon-stock-terminal/apps/api
npm run typecheck && npm test && npm run build
cd /home/novius2/trading-stack/neon-stock-terminal/apps/web
npm run typecheck && npm test && npm run build
cd /home/novius2/trading-stack
bash scripts/verify/canonical-repository-gate.sh
# Inject PLAYWRIGHT_ADMIN_PASSWORD from the protected environment, never literal.
node tools/playwright/paper-verified-replay.mjs
# Optional PLAYWRIGHT_MODULE/PLAYWRIGHT_EXECUTABLE_PATH support installed runners.
```

Deploy pushed master only using `bash scripts/deploy_n50_dashboard.sh`; only
combined dashboard web/API container changes. Keep prior image for scoped
rollback; no database migration/rollback. Deployment/browser results follow
after execution. Full outcome validation is BLOCKED by historical coverage and
fillability evidence. No claim that all older project requests are complete.

Initial live browser check found the canonical trade-drawer close button hidden
behind the global header (Paper overlay z-index 100 vs shell 1000). Scoped fix
raises only Paper modal/drawer layers to 1300, including the new evidence drawer.
Also corrected changed-control tracking when clearing the historical date;
empty monthly cohorts explicitly say unchanged starting capital is not a tested
return. Initial run loaded 88 trades, 21 retrospective monthly matches and zero
stored-before-entry matches. This is an evidence limitation, not proof that a
monthly strategy had zero returns.

## Acceptance evidence

- Final API typecheck/build and **226/226** unit tests PASS; unchanged web source
  typecheck/build and **195/195** tests PASS. Canonical gate/diff check PASS.
- Authenticated Chromium 1208 (Playwright 1.55), 1920×1080 and 1440×900 desktop,
  390×844 mobile: replay, evidence/Escape, canonical orders/fills drawer and actual
  close-button click, cohort/allocation selection, seven downloads and historical
  cutoff PASS. Mobile page overflow false. Initial uncached explicit replay
  17,784 ms; this is source/research load, not pointer latency or a p95 claim.
- 88 source trades; 21 retrospective monthly matches; zero recorded-before-entry
  matches. Exclusions: 66 no monthly candidate, 21 not recorded before entry,
  one signal after entry. Zero compatible-entry failures; 21 invalid minute rows
  across per-trade aggregates. None fully verifies 5 or 30 sessions.
- Historical cutoff 10 September 2026 15:30 IST: retained fills/bar-end times
  do not exceed cutoff. Cohort/allocation changes issue no research request;
  two requests total (explicit latest and explicit historical), zero paper writes.
- Existing Simple view: 88 rows; Portfolio section navigation and notification
  panel PASS, zero paper writes. Serial-refresh regression: 88 rows, two completed
  cycles, zero writes. Broader unrelated-route and device/speech regressions NOT_RUN.
- Generated XML parses: 12 worksheets and filters, largest cell 13,048 characters
  (below Excel cell limit), 5,467,373 bytes. Excel desktop opening NOT_RUN; export
  explicitly identifies SpreadsheetML `.xml`, not native `.xlsx`.
- Screenshots, report/historical JSON, seven exports, result/preservation JSON
  retained in ignored `output/playwright/paper-verified-replay/`. Fixture/unit
  results do not certify historical coverage or executable target fills.
- Test harness corrections: hidden metadata in collapsed details requires DOM
  attachment, not visibility; implicit dropdown labels match by prefix. These are
  separate from the genuine overlay defect, which was fixed and mouse-tested.
- Final metadata guard: known qualification lists only timely candidate IDs,
  not a superset containing later revisions; dedicated regression PASS. It does
  not change current cohort counts, strategy rules or ledger records.
- Existing dependency audit: 16 vulnerabilities (1 critical, 3 high, 11 moderate,
  1 low) remain pending; no dependencies/lockfile changed. Six isolated Python DB
  integration tests remain blocked by missing TEST_DATABASE_URL (prior repair).

Fill/entry/mark ties are deterministic: closing fill, entry, mark, then trade-leg
ID. Allocation is fixed per scenario, not optimised after seeing outcomes.
Profit is research-model gross/estimated-cost P&L, not actual booked account net.

## Final deployment

Application commit **`1f3d7bb`**, pushed master; approved dashboard-only release
healthy, image `sha256:b721baab05cfcfa67999299019bd060959b7883747154907a0d0abaf06aa5b70`,
container `db6eb7c97bf6…`, entry `/n50/assets/index-DLvrBmQF.js`.
Public `/n50/paper-trading?tab=verified` HTTP 200; unauthenticated research HTTP 401.
Final authenticated rerun PASS with the same 88/21/0 cohort counts, seven exports,
zero mutations, two intentional reads, no mobile overflow and cutoff separation.
Final uncached replay 18,958 ms (earlier run 17,784 ms); no p95 inference.
All 48 recorded/shadow capital scenarios reconcile equity both to starting
capital + realised + open marks − estimated friction and to cash + locked
notional + open marked P&L, within 0.000001 INR numerical tolerance.

Only dashboard was recreated; paper monitor/collectors/database were untouched.
Tracked source clean; pre-existing untracked report ZIPs/tools preserved, not
staged. This documentation follow-up does not change the deployed application.

Scoped rollback, **only if required**:

```bash
cd /home/novius2/trading-stack
docker image tag trading-stack-n50-dashboard:before-verified-replay-20260918 trading-stack-n50-dashboard:latest
docker compose -p trading-stack-novius2 --env-file .env -f docker-compose.yml up -d --no-deps --no-build n50-dashboard
```

Authenticated rerun used existing Chromium and temporary Playwright runner;
protected credential remains in memory/environment, never output or committed:

```bash
cd /home/novius2/trading-stack
node --input-type=module <<'JS'
import fs from 'node:fs';
import {spawn} from 'node:child_process';
const password = fs.readFileSync('.env','utf8').match(/^DEV_LOCAL_AUTH_PASSWORD=(.*)$/m)?.[1].replace(/^['"]|['"]$/g,'');
if (!password) throw new Error('Missing protected credential');
const child = spawn('node',['tools/playwright/paper-verified-replay.mjs'],{
  stdio:'inherit', env:{...process.env, PLAYWRIGHT_ADMIN_PASSWORD:password,
    PLAYWRIGHT_MODULE:'/tmp/paper-audit-browser-20260918/node_modules/playwright/index.mjs',
    PLAYWRIGHT_EXECUTABLE_PATH:'/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome'}
});
child.on('exit',code=>process.exit(code??1));
JS
```

If these test-runner paths expire, install the test runner separately and set
the two optional paths; never copy the application or commit generated binaries.
