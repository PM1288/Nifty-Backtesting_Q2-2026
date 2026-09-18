# Market workstation and coverage repair — 18 September 2026

## Scope

Latest user instruction explicitly retires the original Scalper UI, superseding
older V1 preservation requirements for that route only. V2 remains; legacy
`view=scalper` redirects with other query parameters preserved. Shared calculations,
source history, paper/live permissions and other analytics views remain. No trading
formula, historical prices or recorded trades were rewritten. No second checkout
or broker collector was added.

## Findings and changes by responsibility

- Navigation/page: V1 menu/eager import retired; old links redirect; MANEESH and
  NIFTY links use V2. Live context refresh excludes explicit historical as-of.
- V2 queries/API helper: cancel obsolete requests; serial alternate-timeframe
  prefetch after active load. Aborts are not reported as outages.
- Chart CSS: option plots were only 214px at 1920 and 190px at 1440. Mobile host
  was 485px inside a 390px screen. Corrected height, min-width containment, wrapping
  toolbar and rail tracks. Shared EChartSurface coalesces resize in one frame,
  skips unchanged/zero sizes and cleans listeners/queued frames.
- Calendar: collector only seeded seven days at startup. After nine days running,
  calendars ended September 16; September 18 bars existed but chart day selection
  stopped at September 16 and NSE scheduler failed. Collector now refreshes 31 days
  ahead every 12 hours. Verified 2026 regular holidays use NSE CMTR71775; no guessed
  2027/Muhurat hours. Insert-only writes preserve manual/special/history records.
  NSE date resolution handles verified regular holidays and explicit specials.
- Universe: stock options increase from ±3 to ±10 listed strikes around ATM for
  both CE/PE (up to 42/stock). Index radius is preserved. Current/next listed futures
  now selected for indices as well as stocks. Missing contracts/prices stay missing.
- Rate limits: validate ≤3 sockets, ≤1000 token-mode subscriptions/socket, ≤50
  symbols/FULL quote, ≤1 quote request/second. Adaptive minimum cannot raise maximum.
  Existing shared throttles/backoff remain. Runtime budgets: OPTSTK_REST 1200,
  total option rotation 1320 tokens/cycle. Overflow uses existing REST rotation,
  not tick-by-tick streaming. Collector `/coverage` discloses admission not freshness.
- Alerts: existing cooldown retained; collector health messages include source,
  event, IST time, impact and action. NSE missing-file events distinguish reports
  from live quotes and link health; missing is never zero or a trade signal.
- NSE: 17 existing cash parsers +13 supplemental cash +33 F&O archive definitions
  =63 configured reports. Official API names/established participant URLs, request
  pacing, bounded size/timeouts, per-attempt HTTP/errors, atomic staging and SHA256.
  HTML/JSON/error bodies rejected. Immutable raw archives are explicitly ARCHIVED /
  DOWNLOADED_NOT_PARSED, never analytics-ready. Specialized parsers remain owners.
- Cleanup: skip archives/symlinks; old staging requires matching loaded checksum.
  Failed/unparsed registry entries survive retention. No bulk database deletion.

## Pre-release evidence

Authenticated Chromium, real authorized data, DPR1:

| Viewport | Underlying plot | Each option plot | Width |
|---|---:|---:|---|
| 1920x1080 | 632px | 268px | reconciles within 1px |
| 1440x900 | 608px | 244px | reconciles within 1px |
| 390x844 | 508px | 258px | 338px host/native, no overflow |

Native time axes 28px, contained. Five V2 dock tabs and eight other Analytics tabs
received authenticated screenshot/navigation smoke checks. Zero page errors and
mutation requests. 500 pointer moves: zero chart/context requests and series
hydration. NOT a measured input-to-paint p95/full semantic audit. Dev first canvas
3358ms includes initial login/context, not a production performance claim.
Ignored evidence: `output/playwright/market-workstation-review/`.

Web typecheck, 195 tests and build; API typecheck, 227 tests and build; focused Go
packages; 10 Python tests; canonical gate and diff check passed.

```bash
cd /home/novius2/trading-stack
go test ./internal/ratelimit ./internal/universe ./internal/config ./cmd/collector ./internal/store
docker run --rm --network none --volume /home/novius2/trading-stack/services/nse_ingestor:/app:ro --entrypoint python trading-stack-nse-ingestor:latest -m unittest discover -s tests
(cd neon-stock-terminal/apps/web && npm run typecheck && npm test && npm run build)
(cd neon-stock-terminal/apps/api && npm run typecheck && npm test && npm run build)
bash scripts/verify/canonical-repository-gate.sh
PLAYWRIGHT_MODULE=/tmp/paper-audit-browser-20260918/node_modules/playwright/index.mjs PLAYWRIGHT_EXECUTABLE_PATH=/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome node tools/playwright/market-workstation-review.mjs
```

## Release and rollback commands

Push feature; fast-forward/push master; deploy clean tracked master. Preserve
unrelated untracked reports. Tag old images and restrict runtime config backup
before changing its two rotation budgets. Never commit credentials.

```bash
bash scripts/deploy_n50_dashboard.sh
docker compose -p trading-stack-novius2 --env-file .env -f docker-compose.yml build collector
docker compose -p trading-stack-novius2 --env-file .env -f docker-compose.yml up -d --no-deps --no-build collector
docker compose -p trading-stack-novius2 --env-file .env -f compose/compose.base.yml build nse_ingestor
docker compose -p trading-stack-novius2 --env-file .env -f compose/compose.base.yml up -d --no-deps --no-build nse_ingestor
REVIEW_ORIGIN=http://127.0.0.1:19090 REVIEW_OUTPUT=output/playwright/market-workstation-review/production PLAYWRIGHT_MODULE=/tmp/paper-audit-browser-20260918/node_modules/playwright/index.mjs PLAYWRIGHT_EXECUTABLE_PATH=/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome node tools/playwright/market-workstation-review.mjs
```

NSE MUST use compose/compose.base.yml to preserve named inbound/staging volumes;
root Compose changes mounts. No remove-orphans or volume deletion. Rollback:
retag saved image to service image, restore config backup if needed, recreate only
affected service with no-deps/no-build. Calendar additions need no destructive undo.

## Limits

- 63 configured reports does not prove 63 downloads/publications. Log actual HTTP
  outcomes; raw formats require parser work. Optional/event-driven files may not exist.
- Expanded universe exceeds streaming capacity. REST cadence depends on actual
  eligibility/shared limits. Prior 24h had two candle throttles and source no-data,
  403 and timeout errors. Cannot promise broker never throttles.
- Out-of-hours deployment cannot certify next-session tick freshness.
- Existing historical calendar entries preserved, including an incorrect September
  14 entry; historical replay correction requires separate evidenced treatment.
- 20-cycle heap plateau, production pointer p95 and all preservation scenarios
  are not certified by navigation smoke tests. Final DPR2 evidence is below.
- No broad tick/depth purge: existing approved retention gates remain authoritative.
  Disk was 60% used, approximately 677GB free at inspection.

Sources: [SmartAPI](https://smartapi.angelone.in/docs),
[cash reports](https://www.nseindia.com/all-reports),
[F&O reports](https://www.nseindia.com/all-reports-derivatives),
[2026 calendar](https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf).

## Executed release evidence

Initial application commit `b37e160` pushed to feature and master; dashboard,
collector and NSE ingestor deployed from clean tracked master. Unrelated services
and NSE named volumes preserved. Production browser geometry/navigation/500-hover
checks passed; first native canvas 3157ms (not cached-switch or pointer latency).
Paper refresh passed: 88 rows, two refreshes, zero mutations, 88 audit records.

Live coverage: 3000 active subscriptions: 270 equities, 10 indices, 430 futures
(420 stock +10 index), 770 index options, 1520 stock options. Stock plan contains
8110 options, with 6590 admitted to REST rotation. Five index underlyings each
have September 29 and October 27 futures. Calendar now extends through October 20.

Option-chain watcher logs confirm calendar absence also suppressed September
17–18 chain capture. After repair it correctly reports September 19 as non-trading.
Missing historical snapshots are NOT recreated; affected Total OI/price-strength
history remains unavailable. Collection resumes at the next qualified session.

Initial report catch-up: September 17: 6 parsed +30 archived, 27 unavailable out of
63. September 18 completed with 46,913 parsed rows; source failures logged. API
fallbacks were subsequently added for the original cash catalog because several
legacy direct paths returned 404; final retry results follow below. Request cutoff
date is no longer mislabeled as source date: V2 disclosure uses actual collected
timestamps, including across IST midnight/weekends.

Existing authorized collector retention ran on restart, removing **99,559 expired
rows** across its existing gated tables, including 10,000 old minute bars. No
partitions were dropped; no manual bulk purge was run. This is irreversible through
application undo; backup recovery was not tested and no new data backup was made
for this existing scheduled policy. Previous images/runtime config are saved as
`*:before-market-coverage-20260918` and ignored
`output/market-coverage-release/config.before.yaml` (mode 600).

Release logs: ignored `output/market-coverage-release/`. Production screenshots:
`output/playwright/market-workstation-review/production/`. Initial paper-notifier
test required correction for Secure cookies in loopback-only test jars and the
current wide-toolbar breakpoint; no production auth/voice behavior was changed.

### Final verified state

- Dashboard application commit `f18a48d`, image
  `sha256:da08c8b6d46da445a079bbabb82f1d5948f2ec1929a7fcc37e3f43fc6525d20e`;
  frontend asset `/n50/assets/index-CvJmJQJ4.js`.
- Collector code `b37e160`, image
  `sha256:359d9aea625a7149522a161bc8d0a8b3a6b46a475a53255f0e4b633fd9eb51a5`.
- NSE ingestor code `173be43`, image
  `sha256:cbc00d95dabe610e076e34978c5b2b7e268c80f1ba78bd94e40cf4b93e2fdff8`.
- Dashboard/collector healthy; NSE application healthcheck healthy and named data
  volumes unchanged. Only these three services were recreated.
- Public HTTPS login and authenticated paper notifications returned 200. Public
  `/n50/v1/nse-intelligence/reports` returned 200 with September 18, not the older
  scheduled job. Report-health queries now include explicit daily catch-ups.
- September 18 retained inventory: **47/63** files, **14 parsed**, **33 immutable
  raw archives**; parsed registry row counts total 153,905 (not an assertion of
  that many unique securities). Latest retry: 43 retrieved/reused, 20 failed;
  four failures already have earlier same-date archives. Health keeps these
  distinctions and the failure evidence, rather than erasing either result.
- Remaining uncaptured report IDs: cm_albm, cm_client_funding,
  cm_extreme_loss_margin, cm_mode, cm_turnover, cm_var_multiplier, fo_base_prices,
  fo_combined, fo_derivatives_update, fo_exercise, fo_mode, fo_span_2, fo_turnover,
  margin_trading, reg1_ind, var_margin_2. Attempts returned unavailable responses;
  this does not prove files were never published. Two existing NSE health outbox
  events reached SENT. No fabricated source rows were substituted.
- Observed post-release request audit: 542 quotes, 15 aggregate calls and one
  candle call; zero failed/throttled, maximum 50 requested symbols. Short observed
  window only, not a guarantee for the next trading session. Stock REST overflow
  budget is 1200 per 60-second cycle: nominal complete rotation approximately six
  minutes before failures/shared queue delay, not live tick coverage.
- Final tests: web 195, API 229, all Go packages (`go test ./...`), 10 Python,
  typechecks/builds and canonical gate passed. Paper notifier 17/17; refresh 88
  rows/two refreshes/no mutations. Original unrelated user files remain untouched.
- Authenticated production chart tests pass at 1920x1080, 1440x900, 390x844 with
  DPR1 and DPR2, native time axes/host containment and renderer-owned bitmap sizes.
  Five V2 dock views +eight Analytics routes smoke-tested. DPR2 final: 500 pointer
  moves, no chart/context requests, no hydration, no page exceptions. Evidence:
  `output/playwright/market-workstation-review/production-final/` and
  `output/playwright/market-workstation-review/production-dpr2/`.
- DPR2 harness initially failed because Chromium context-only emulation reports
  devicePixelRatio=2 but devicePixelContentBoxSize=1x. A standalone 100px-element
  check reproduced it; browser `--force-device-scale-factor=2` returns 200 physical
  pixels correctly. Tests await actual renderer resize completion. Fixed-cutoff
  pointer tests prevent a normal 60-second live refresh being misattributed to
  hover on slow runners. No canvas CSS stretch or renderer workaround was added.
- DPR2 initial canvas 4787ms in this headless run. This does NOT certify the
  proposed <50ms cursor or <250ms cached-switch p95 gates; those remain NOT_RUN.
  Screenshot/navigation checks are not a full formula/coverage audit of every
  historical chart. Missing September 17–18 chain history stays unavailable.

Final application release commands are above. Subsequent evidence/test-script-only
commits do not require recreating production services. The temporary canonical
Vite listener on 15218 is stopped after verification; no unrelated listener stopped.
