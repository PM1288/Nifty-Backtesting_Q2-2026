# MANEESH Trade Log: implementation and preservation record

## Audit before implementation

Source: `/home/novius2/NIFTY50/Dashboards/` standalone specification and ZIP
Codex prompt/README, dated 2026-09-09. Preview data is illustrative, never imported.
Canonical source: `/home/novius2/trading-stack`, baseline `b0d66bf`, branch
`feat/maneesh-trade-log-readability`. Existing tracked worktree was clean.

Route remains `/strategy/trading-analytics?view=trade-log`. This is a read-only
observation ledger, NOT paper-order activation. The handover explicitly prohibits
orders, signal changes and deployment without separate approval.

The existing component had 13 paragraph-style columns and a 2,850px minimum
table width. Entry, conditions, indicators, future maxima and endpoint trend were
interleaved. No inspector or column presets existed. Global chain controls could
be mistaken for log filters. Existing CSV explicitly selected nested fields and
was not a lossless export. Preserve it as Legacy CSV and add lossless exports.

## Authoritative contracts and timing

GET `/v1/trading-analytics/scalper-log`: V7 only, default current IST trading day,
optional date/interval/direction/symbol, maximum limit 5,000. `count` is returned
row count, not database total. Label exports as loaded filtered records.
The existing authenticated API and 60-second React Query refresh remain owners.
No collector, DB migration, background task or notification sender is added.

`scalper_signals.py` explicitly records next-candle OPEN prices but `entry_end`
is that candle's END. Display that exact timestamp as Entry candle end, and
`setup_end` as Setup end; do not invent an entry execution timestamp. Indicators
are snapshots at setup end. Outcome extrema and endpoint timestamps are stored
one-minute bar START labels. A MATURE horizon denotes elapsed clock time, not
complete bar coverage. Always show instrument state/observed minutes separately.

V7 underlying prior two open/close positions and selected-option prior two
open/close positions are mandatory. Colour is optional. CALL underlying/CE
confirmation and PUT underlying/PE confirmation remain unchanged. Read stored
condition gates; do not assert an unrecorded gate passed. Identity conflicts are
unavailable selected-side outcomes, never an implicit PE fallback.

## Preservation mapping

| Existing evidence | New surface |
|---|---|
| Stock/date/interval/direction, rule and signal key | Monitor identity; inspector overview; Full evidence |
| Exact selected/CE/PE contract, token, strike, expiry | Contracts & sources; Full evidence |
| All entry/setup prices, EMA9, body fractions | Entries & rules; conditions inspector |
| Both precursor arrays and every stored gate | Conditions numeric matrix and complete raw section |
| Underlying/CE/PE RSI, MACD, signal, histogram | Indicators preset and inspector |
| Each 15m/30m/EOD instrument endpoint/max/min, changes and times | Outcomes inspector; selectable preset metrics |
| Maturity, coverage, trend, alignment, window end | Outcomes; Monitor; inspector |
| Delivery state/timestamps | Monitor and Delivery inspector; never conflated with profitability |
| Unknown/future API fields and nested values | Searchable Full evidence, Raw record, lossless JSON/flattened CSV |
| Existing CSV | Legacy CSV, unchanged mapping |
| Chain/report controls and PCR/max pain | Explicit market-context disclosure; not log filters |

No field is removed from the raw record. JSON is the authoritative precision and
null-preserving export. CSV escapes spreadsheet formulas; arrays remain JSON.
No realised P&L, win rate, trade fill, or synthetic maximum is inferred.

## UI state and rollback

Query parameters are isolated from the analytics chain controls:
`logDate`, `logInterval`, `logDirection`, `logSearch`, `logHorizon`, `logPreset`,
`logMetric`, `logMaturity`, `logAlignment`, `logDelivery`, `logInspect`,
`logSection`, `logDensity`. Unrelated parameters survive updates. Exact selection
uses `signal_key`. New rows are queued while an inspector/manual sort is active;
the Apply new observations button admits them. Previous evidence survives refresh
failure. Inspector selection/section are preserved and a selected record can
remain outside current filters. Global context API failure does not gate the
independent observation table.

`logLayout=legacy` mounts the original view instead, never two simultaneous
pollers. Legacy CSV retains its original filename and nested-field projection.
Initial implementation was not deployed because the handover required approval.
After the user's follow-up requesting the visible update, release `a9d4372` was
merged/pushed to master and deployed on 2026-09-09. Only the existing
`trading-stack-novius2-n50-dashboard-1` container was recreated.
Public asset changed from `index-BTeFf-13.js` to `index-CHvGx1Hh.js`.
Image: `sha256:01d1f4a335496cf49133759fd591810f3aba0da53fe7851931530aeeafb3098b`.
Container is healthy. No database migration or data/notification mutation occurred.

Live route: `https://n50.nifty50today.co.in/n50/strategy/trading-analytics?view=trade-log`.
This is MANEESH → Trade Log, not a redesign of the separate Scalper chart view.
Authenticated deployed acceptance: 34/34 checks, including axe across target
widths and inspector sections. Evidence: `output/playwright/trade-log-deployed/`.
Canonical shell regression: 8/8. Paper notifier regression on the MANEESH route:
17/17 (desktop/mobile, speech, history and browser-only simulated alert).
The first parallel legacy `/analytics` notifier attempt timed out waiting for
the launcher; its partial results are retained, not counted as a pass. The
subsequent sequential MANEESH-route run passed in full.
Web 105/105, API 190/190 and both builds passed
again before release. The existing image is retained under
`trading-stack-n50-dashboard:pre-trade-log-20260909` for rollback.

Release command (canonical source, pushed master only):
```bash
PUBLIC_BASE_URL=https://n50.nifty50today.co.in \
ROUTE_PATH='/n50/strategy/trading-analytics?view=trade-log' \
bash scripts/deploy_n50_dashboard.sh
PLAYWRIGHT_BASE_URL=https://n50.nifty50today.co.in/n50 \
PLAYWRIGHT_OUTPUT_DIR=output/playwright/trade-log-deployed \
node tools/playwright/trade-log-readability.mjs
```

## Validation and evidence

Authenticated production GET evidence: 55 observations on 2026-09-09, 33 CALL /
22 PUT. Delivery: 2 FAILED and 53 SUPPRESSED_STALE at inspection time. These are
observations, not executed paper trades. Counts are runtime evidence, not fixtures
or production constants. Complete raw response and browser screenshots are ignored
artifacts under `/home/novius2/trading-stack/output/playwright/trade-log-readability/`.

Checks: web 105/105, API 190/190; web/API typechecks and builds passed; Storybook
build passed (existing upstream bundle-size/eval warnings); canonical gate passed.
Final browser run: 34/34 checks passed, process exit 0. The suite checks authenticated real data, five presets, exact full-JSON row
parity against the actual displayed response, numeric row geometry, all inspector
sections, keyboard Escape/focus restoration, URL reload and density, no mutation
requests, no JavaScript exceptions, and axe at 1920/1440/1280/768/390. A 720×450
layout viewport exercises 1440×900 at 200%-zoom-equivalent reflow, not a claim of
manual OS/browser zoom acceptance. `results.json` is the definitive final count.

Row geometry is 72px comfortable / 60px compact with unchanged font sizes and
columns. No page-level horizontal overflow at tested widths. At 1440×900 the
measured full document height is approximately 1,200px versus 1,051px legacy:
larger readable values and explicit filters cost vertical space; this is NOT a
no-vertical-scroll implementation. The evidence table has its own scroll region.
No prediction/collector/evaluation latency was changed or claimed. Dedicated FPS
and React-commit profiling were not performed.

### Reproduce

```bash
cd /home/novius2/trading-stack/neon-stock-terminal/apps/web
npm run typecheck
npm test
npm run build
npm run build-storybook
npm run dev -- --host 127.0.0.1 --port 5178 --strictPort
# Separate shell; uses protected existing credential, never writes it to output:
cd /home/novius2/trading-stack
node tools/playwright/trade-log-readability.mjs
cd neon-stock-terminal/apps/api
npm run typecheck
npm test
npm run build
cd /home/novius2/trading-stack
bash scripts/verify/canonical-repository-gate.sh
```

The browser bridge permits production GETs only. It authenticates normally,
captures the original live UI, then exercises the local frontend using those
authenticated APIs. It injects one test-only market-context failure, never writes
market records, and blocks mutating browser requests. Storybook fixtures are
isolated from production imports and cover developing, missing/failed, empty,
zero indicators and unknown fields. Tests do not enable paper/live execution or
resend existing failed WhatsApp notifications.

## Material limitations / pending acceptance

- The new UI is deployed; actual paper-order execution remains disabled as specified.
- This endpoint has a 5,000-row ceiling and no total-count/pagination contract;
  exports explicitly cover matching loaded rows, not all database history.
- Last-snapshot freshness is shown, but full exchange publication lineage and
  expected-versus-observed coverage are not supplied by this read model. Stored
  MATURE and OBSERVED labels are not promoted to completeness guarantees.
- The shell currently owns a light theme; no second global theme system was
  introduced. A future global dark-theme migration needs separate contrast UAT.
- Manual operator UAT, exhaustive screen-reader testing and simulated refresh
  race/failure coverage beyond the documented tests remain follow-up checks.
- Actual paper fills, position sizing, exits and realised accounting require a
  separately approved execution specification. This handover prohibits them.
