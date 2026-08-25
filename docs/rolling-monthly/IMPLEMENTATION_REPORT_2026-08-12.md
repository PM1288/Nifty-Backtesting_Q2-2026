# Rolling Monthly V2 — Independent Strategy Implementation

**Implemented:** 12 August 2026 (UTC)
**Production route:** `/n50/strategy/rolling-monthly`
**Public dashboard:** `https://n50.nifty50today.co.in/n50/strategy/rolling-monthly`

## Boundary

Rolling Monthly is a separate strategy family. It does not import, extend, recalculate, or write
OIIS data. It has its own runner, factor configuration, PostgreSQL schema, API endpoints,
dashboard route, navigation entry, service heartbeat and tests. It has no Paper Trading event,
route, table, button, worker, scheduler, webhook, or broker-order integration.

The two independent components retained from the supplied methodology are:

- `rolling_candle_bullish_long_v1` → `rolling_monthly_bullish_long_quality_v2` (cash LONG research).
- `rolling_candle_bearish_short_v1` → `rolling_monthly_bearish_short_quality_v2` (futures SHORT research; current data uses the documented cash-underlying proxy).

## Source package reviewed

All files under `/home/novius2/NIFTY50/Monthly-Strat` were inspected:

- `CODEX_ROLLING_MONTHLY_TECHNICAL_QUALITY_FACTOR_V2.md`
- `ROLLING_MONTHLY_TECHNICAL_FACTOR_V2.json`
- `ROLLING_MONTHLY_TECHNICAL_FACTOR_V2_ANALYSIS.xlsx` (all ten sheets)
- `ROLLING_MONTHLY_TECHNICAL_FACTOR_V2_REPORT.docx`
- `ROLLING_MONTHLY_TECHNICAL_FACTOR_V2_SCORED_TRADES.csv` (23,069 scored trades plus header)

The implementation preserves the six exact side-specific base scanner rules, signal-after-close
and next-valid-open entry chronology, strict gap rejection, side-specific mandatory gates,
confirmation logic, quality bands, fixed-point outputs, and research-only limitations. Disabled
one-hour, monthly-colour and market-cap rules were not silently enabled.

## Architecture delivered

### Runner

`services/rolling_monthly/` reads only canonical PostgreSQL inputs:

- `public.bars_1d`
- `public.instruments`
- `market_status.effective_universe_member`
- `nse_intraday.universe_membership`

It opens no SmartAPI/WebSocket connection and consumes no broker REST rate budget. The daemon
refreshes every 900 seconds by default and persists the same governed run idempotently. Candidate
identities are deterministic for factor version, signal date, direction and symbol.

### Persistence

Migration `db/sql/038_rolling_monthly_quality.sql` adds only the `rolling_monthly` schema:

- `strategy_version`
- `run`
- `candidate`
- `reference_metric`
- `service_heartbeat`

The historical metrics are labelled supplied research-reference fixtures; they are never exposed
as current candidate output.

### API and UI

- `GET /v1/rolling-monthly/dashboard`
- `GET /v1/rolling-monthly/candidates/:symbol`
- Dashboard route `/strategy/rolling-monthly`
- Separate top-level `Rolling Monthly` workspace on desktop and a separate destination under
  mobile More.
- Filters for all, LONG, SHORT and historical research evidence.
- Current decision hero, four KPIs, nearest scanner matches, exact gate evidence, explicit
  no-trade reasons, Stock 360 links, research evidence and limitations.

The API contract asserts `strategyFamily=ROLLING_MONTHLY`, `independentFromOiis=true` and
`paperTradingConnected=false`.

## First canonical production run

| Field | Result |
|---|---:|
| Run ID | `edabc8b3-4909-422a-9765-d9d2189501b5` |
| Signal date | 11 Aug 2026 |
| Next-session entry date | 12 Aug 2026 |
| Active F&O underlyings evaluated | 219 |
| NIFTY 50 breadth coverage | 50 / 50 |
| Bullish LONG base-scanner matches | 13 |
| Bearish SHORT base-scanner matches | 29 |
| High quality | 0 |
| Medium quality | 0 |
| Low / rejected | 42 |
| Data quality | VALID |
| Governed conclusion | NO TRADE; show closest matches for diagnosis only |

The closest diagnostics were not promoted into recommendations. CUMMINSIND and HUDCO scored 80
on the SHORT scorecard but failed the authoritative SHORT mandatory gate. LTM was the nearest LONG
match at 71.25 and also failed its mandatory gate.

## Verification

- Rolling Monthly Python unit tests: **6 passed**.
- Canonical API suite: **71 passed**.
- Web component suite: **13 passed**.
- API and web TypeScript type checks: passed.
- Production Vite/API image build: passed (2,469 modules).
- Authenticated deployed Playwright: **28/28 passed** at 1920×1080 and 390×844.
- Browser checks include separate identity, no Paper Trading integration/action, completed VALID
  real run, all-F&O universe, decision/candidate content, no body overflow and no console error.
- Repeat-run database fingerprint: stable candidate IDs, 42 rows, no duplicate logical run.
- Containers: `rolling-monthly` healthy; `n50-dashboard` healthy.

Screenshots and results:

- `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/output/playwright/rolling-monthly-2026-08-12/desktop-1920x1080.png`
- `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/output/playwright/rolling-monthly-2026-08-12/mobile-390x844.png`
- `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/output/playwright/rolling-monthly-2026-08-12/results.json`

## Known research constraints

- The live screen currently applies present active F&O membership; that is not point-in-time
  membership for historical reconstruction.
- SHORT research currently uses cash-equity price as the documented futures proxy.
- Daily OHLC cannot resolve same-bar target/stop ordering; the reference fixture uses stop-first.
- The supplied quality analysis is development/research evidence, not a pristine untouched
  out-of-sample production approval.
- Therefore the dashboard remains research-only and deliberately disconnected from Paper Trading.

## Rollback

Stop only `rolling-monthly`, revert the dashboard image/route, and leave the additive schema for
audit. No OIIS, Paper Trading, SmartAPI or broker component needs to be stopped or rolled back.
