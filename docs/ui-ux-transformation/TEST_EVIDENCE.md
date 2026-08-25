# Test Evidence

## Paper Trading admin comments — 2026-08-12 UTC

- API typecheck: passed.
- API unit suite: 71/71 passed, including strict administrator-role predicate coverage.
- Web typecheck: passed.
- Web unit suite: 13/13 passed.
- PostgreSQL disposable-schema migration/idempotency: 1/1 passed.
- Authenticated deployed Playwright regression: 65/65 passed, including comment creation and persistence after browser reload.
- Unauthenticated comment GET and POST: both HTTP 401.
- Deployed dashboard health: healthy, restart count zero.

## Phase 0 baseline — 2026-08-11

| Command | Result |
|---|---|
| `npm run typecheck --workspaces --if-present` | PASS — API and Web TypeScript typechecks |
| `npm run test --workspace=@app/api` | PASS — 68 tests, 0 failures |
| `go test ./...` | PASS — all test-bearing packages pass |
| `node tools/playwright/responsive-navigation-regression.mjs` | FAIL — 114/118 checks pass; four failures listed below |

### Retained baseline failures

1. Wide 1920×1080: Paper Trading active route assertion failed.
2. Wide 1920×1080: Derivatives active route assertion failed.
3. Wide 1920×1080: Data & Operations active route assertion failed.
4. Wide journey: five `502 Bad Gateway` console resource errors.

The failures correlate with the live `/v1/workspace/paper-trading` call returning HTTP 401 despite a successful n50 development login. They are release blockers, not warnings.

### Required viewport evidence

Home baseline screenshots exist for 1920×1080, 1366×768, 1280×720, 1024×768, 768×1024, 430×932, 390×844, 375×812 and 360×800. No document overflow was detected on the two added required sizes (1366×768 and 375×812). A failed external analytics `POST /g/collect` was observed and is separated from first-party API failures.

### Baseline data reconciliation

- `/v1/overview`: HTTP 200, as-of 2026-08-11T17:41:23.182Z, 19 sectors and 208 unique F&O stock underlyings.
- `/api/v1/intraday/stocks/RELIANCE`: HTTP 200 and canonical symbol `RELIANCE` with intraday and historical context fields.
- `/v1/oiis-live/dashboard`: HTTP 200; trade date 2026-08-11; 15 watchlist rows; 2 entries; 15 near misses; source run `bf4308d7-91d3-4092-b21c-77b8c0f41c07`.
- `/v1/workspace/paper-trading`: HTTP 401 — unresolved authentication/proxy mismatch.
- `/v1/backtesting/strategies/rsi30_willr80_closegtprev_tp125`: HTTP 200 with strategy, scenarios, evaluation and version metadata.
- `/v1/analytics/quality`: HTTP 200 with summary, freshness, module, route-dependency and diagnostics contracts.
- PostgreSQL inventory estimates: `public.instruments` 458,652; August `bars_1m` partition 5,299,164; `oiis_live.selection_run` 40; `nse_app.backtest_run` 1,515; `paper_trading.trade_groups` 3.

These checks establish transport/contract presence. Phase-specific reconciliation will verify displayed formulas and values rather than treating HTTP 200 as correctness.

## Phase 1A — shared system

| Command | Result |
|---|---|
| `npm run test --workspace=@app/web` | PASS — 6 tests, 0 failures |
| `npm run typecheck --workspace=@app/web` | PASS |
| production Docker/Vite build | PASS — 2,464 modules transformed |

The deterministic unit suite proves the three quality layers, age handling, stale-connected semantics and recovering state on sequence gaps. Daily Setups and Strategy Evaluation now use the same typed loading/error/empty primitives rather than rendering blank charts and zero-card shells.

## Phase 1B — responsive shell

| Command | Result |
|---|---|
| authenticated public HTTPS `responsive-navigation-regression.mjs` | FIRST RUN: 117/118; one transient tablet console 500 |

All 117 behavioural/layout assertions passed: sidebar absence, seven desktop workspaces, five labelled mobile destinations, active router state, body scroll lock, focus entry/restoration, Escape, 25 repeated cycles, route-selection close, command layering, presentation mode, resize close, dock clearance and body overflow. The remaining API error was traced to broad background prefetch and that request-storm code was removed before the required clean rerun.

## Phase 2 — trust model (implementation test pass)

| Command | Result |
|---|---|
| `npm run test --workspace=@app/api` | PASS — 68 tests, 0 failures |
| API and Web TypeScript typechecks | PASS |

The market stream now exposes an additive connection-local sequence, the client reports actual WebSocket connection state, reconnects with bounded exponential delay, detects gaps and restores a fresh stream snapshot. A connected transport with an old event timestamp is displayed as stale rather than current.

## Integrated deployed validation — 2026-08-11 19:06 UTC

| Test | Result |
|---|---|
| API unit/integration tests | PASS — 68/68 |
| Web TypeScript typecheck | PASS |
| Web unit tests | PASS — 11/11 |
| Paper PostgreSQL/domain suite | PASS — 23/23 on disposable DB; DB removed afterwards |
| Home live data | PASS — 21/21 |
| OIIS/Stock/Admin | PASS — 33/33 |
| Paper command center | PASS — 31/31 |
| Paper SHORT direction, one-lot quantity and actual P&L | PASS |
| Derivatives/Options | PASS — 14/14 |
| Canonical workspaces | PASS — 24/24 |
| Responsive navigation | PASS — 118/118 |
| Automated axe WCAG matrix | PASS — 16/16 scans, 0 violations |
| Production Docker/Vite build | PASS |
| Deployed container health | PASS — healthy |

Canonical validation covers eight destinations at 1920×1080, 1024×768 and 390×844. All 24 navigations returned HTTP 200 with no first-party response errors, no console errors and no body overflow. Machine evidence is in `/home/novius2/NIFTY50/ui-ux-transformation-evidence/phase-15-canonical-workspaces/results.json`.

Responsive validation covers nine widths from 360 to 1920 CSS pixels. All 118 assertions pass. Machine evidence is in `/home/novius2/NIFTY50/ui-ux-transformation-evidence/phase-12-responsive/results.json`.

The production dependency audit still reports inherited findings (8 moderate, 3 high, 2 critical). This is retained as an open security issue rather than hidden by the successful build.

## Global decimal precision validation — 2026-08-12 04:00 UTC

| Test | Result |
|---|---|
| Shared display and chart precision unit tests | PASS — included in 13/13 web tests |
| Web TypeScript typecheck | PASS |
| Web production build | PASS — 2,467 modules transformed |
| Focused ESLint on precision boundary files | PASS |
| Deployed all-route decimal audit | PASS — 42/42 legacy routes |
| Canonical responsive dashboards | PASS — 24/24 at 1920×1080, 1024×768 and 390×844 |
| FII/DII focused responsive check | PASS — 2/2 |
| Production container | PASS — healthy |

The audit scans visible numeric text on every legacy route and fails on any numeric value with more than two decimal places. ISO-8601 fractional seconds are excluded because they are timestamps, not displayed decimal-valued measures. Canvas-rendered chart precision is covered at the shared `EChartSurface` boundary and by deterministic axis, tooltip, data-rounding and custom-formatter unit tests.

Evidence:

- `output/playwright/ui-decimal-precision-final/results.json`
- `output/playwright/ui-decimal-canonical-final/results.json`
- `output/playwright/ui-decimal-fii-dii/results.json`
# Navigation and strategic journey — 2026-08-12

- `npm run typecheck --workspace=@app/web`: pass.
- `npm run build --workspace=@app/web`: pass.
- `npm test --workspace=@app/web`: 17/17 pass.
- `node tools/playwright/navigation-interaction-regression.mjs`: 25/25 pass at desktop, tablet and mobile.
- `node tools/playwright/responsive-navigation-regression.mjs`: 118/118 pass at nine viewports.
- `node tools/playwright/paper-trading-regression.mjs`: 65/65 pass.
- Final Axe matrix: 16 scans, 0 violations, 0 affected nodes.
- Evidence: `tools/playwright/output/playwright/navigation-interaction/`, `responsive-navigation/`, `paper-trading-command-center/` and `ui-ux-accessibility-paper-final/`.
