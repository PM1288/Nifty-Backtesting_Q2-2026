# Daily Data Health dashboard

Additive route `/n50/analytics/system/data-health`, accessible from More → Daily
Data Health and the Data & Operations sub-navigation. Existing report details,
quality views, trading pages, authentication, orders and collectors are unchanged.

## Features and sources

Instrument coverage cards, missing/delayed observations, daily parsed/archive-only/
unretained report bars, calendar days without attempts, searchable paginated exact
symbol ledger, 24-hour broker failures/throttling/latency, 60-second refresh and
complete JSON export (including all instruments, not only the displayed page).

Read-only `/v1/data-health` uses canonical trading_calendar, active subscriptions,
latest NIFTY250 derivative_token_plan, instrument_state, NSE run/file registry and
indexed 24-hour api_request_log. No raw tick/depth scans or collector changes.
Plan inactive rows remain included: that flag represents WebSocket admission,
not exclusion from REST rotation. Exchange/token deduplication favours subscriptions.
30-second in-process cache shares in-flight reads. Errors return 503; failed UI
refreshes explicitly disclose older displayed evidence.

## Interpretation limits

- Operational freshness allowance: subscribed 3 minutes; plan-only 15 minutes.
- Outside session hours, green means collected since the reference session
  opened, NOT complete EOD history or exchange-event freshness. OI/volume field
  freshness is not independently certified by instrument_state timestamps.
- Unknown calendar, never observed, old session, delayed and invalid future
  timestamps are distinct. Missing numbers stay unavailable.
- Download counts cover attempted report types, not every NSE publication.
  Archive-only is not parsed analytics. Failed retries retain prior successful
  evidence. No-attempt calendar days are explicit, not silently green.
- This is a collection monitor, not a full historical candle-gap audit.

## Files

API routes/dataHealth.ts and tests; web pages/DataHealthPage.tsx/CSS;
additive App.tsx, workspaceRoutes.ts and AppShell.tsx routing;
tools/playwright/data-health-review.mjs.

## Evidence

Live queries took 119–560 ms each including docker/psql overhead. Prisma parallel
read took 657 ms on repeat. At initial test: 9,590 instruments, 6,590 plan-only.
18 September: 63 attempted reports, 14 parsed, 33 archive-only, 16 unretained;
20 latest-attempt issues included four previously retained reports.
Counts are time-specific, never hard-coded test assertions.

Web/API typecheck/build, web 195 tests, API 232 tests and canonical gate passed.
Candidate authenticated Chromium 1920×1080 and 390×844 passed search, filters,
refresh, export, no page errors and no page-level overflow. Candidate API model
was read against the live DB; browser used its saved response. Production test
must use the actual endpoint. Ignored evidence: output/playwright/data-health/.

## Repeat production browser check

```bash
cd /home/novius2/trading-stack
PLAYWRIGHT_MODULE=/tmp/paper-audit-browser-20260918/node_modules/playwright/index.mjs \
PLAYWRIGHT_EXECUTABLE_PATH=/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome \
REVIEW_ORIGIN=http://127.0.0.1:19090 \
REVIEW_OUTPUT=output/playwright/data-health-production \
node tools/playwright/data-health-review.mjs
```

Credentials are read in memory from protected .env. Optional REVIEW_FIXTURE is
for candidate UI checks only; never describe it as testing the deployed API.

## Release

Commit/push feature, merge/push master after required checks, then run
`bash scripts/deploy_n50_dashboard.sh`. Preserve previous image for scoped
dashboard rollback. No DB migration, backfill, data deletion or collector restart.
