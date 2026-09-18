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
- DPR2, 20-cycle heap plateau, production pointer p95 and all preservation scenarios
  are not certified by navigation smoke tests.
- No broad tick/depth purge: existing approved retention gates remain authoritative.
  Disk was 60% used, approximately 677GB free at inspection.

Sources: [SmartAPI](https://smartapi.angelone.in/docs),
[cash reports](https://www.nseindia.com/all-reports),
[F&O reports](https://www.nseindia.com/all-reports-derivatives),
[2026 calendar](https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf).

## Executed release evidence

Pending at initial implementation commit; append measured deployment outcomes here.
