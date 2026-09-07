# Cash FII/DII and OI axes — 7 September 2026

Branch: `ui/cash-flow-oi-axis-20260907`. Scope: additive read-only Trading Analytics views, no order authority, source precedence changes, database writes or collector restart.

## Findings

- Cash exists in `institutional_flow.normalized_nse_fii_dii`: 126 rows / 63 reports, 2026-04-01 to 2026-09-03 at inspection. Source dataset `nse_fii_dii_nse_only`, scope NSE only. Latest FII/FPI buy 13,596.04, sell 15,941.91, net -2,345.87; DII buy 17,063.65, sell 12,086.19, net +4,977.46 (₹ crore).
- The prior UI queried only the selected derivatives date and displayed only FII net. This hid older cash evidence and DII. New independently dated Morning View cash section includes both buy/sell/net, 30-report chart, up to 740 retained source rows, raw inspector and full history CSV. Selected-date matrix logic is unchanged: older cash is never substituted into it.
- Ingestion registry records recent cash `ConnectError` / temporary DNS resolution failures. Latest successful normalized cash report remains 3 September. This change exposes age and does not invent newer reports or silently repair the ingest service.
- Cash reports have no row-level publication timestamp. They remain descriptive, not certified point-in-time research features. NSE-only and combined exchange totals must not be summed/mixed.
- SmartAPI quote UI sliced the option columns at OI, hiding ΔOI and Greeks. Full columns are restored. Prior snapshot ΔOI uses the immediately preceding retained quote for the same token within the bounded read window. Current/prior OI and both collection/feed timestamps are retained. Zero is preserved; absent baselines stay null. Repeated unchanged observations can legitimately yield zero. This is NOT previous-session change.
- Provider day ΔOI is not supplied by the persisted FULL-quote contract and remains null. Greek Delta is a distinct dimensionless sensitivity, never substituted for OI change. Chart selector separates these measures and shows explicit unavailable state.
- Greeks read the existing `public.option_greeks`, matched by NIFTY/NIFTY50 underlying, exact expiry, strike and right, timestamp bounded by as-of. Each carries collection time and unverified exchange-freshness state. At inspection the past-day retained NIFTY50 data contains only 25,250 PE (421 observations) with blank trading symbol, not the displayed near-ATM contracts. The store conflict identity `(ts, tradingsymbol)` and blank-symbol source mapping need separate collector correction; lost historical Greeks cannot be recreated by the UI. No wrong-strike Greek is filled into an ATM row.
- Shared chart styling hides value-axis lines by default. Scoped overrides now explicitly show vertical axis lines/ticks and darker readable labels in Trading Analytics without altering unrelated charts. Compact OI label formatting preserves full raw values in tables/exports/tooltips; price panes retain price labels.

## Source verification

Repository source: institutional dataset registry/normalizer, Go FULL-quote parser, `option_greeks` schema, live PostgreSQL read-only checks. No verified SmartAPI/Yahoo cash-flow adapter was found in this path. Official references: [NSE cash report](https://www.nseindia.com/reports/fii-dii), [SmartAPI FULL market data](https://smartapi.angelone.in/docs/MarketData). The old angelbroking docs URL returned an authorization page.

## Validation / rollout

Application commits `5b6dee5` and `738934f` were pushed and merged to master before build. Final deployed dashboard image: `sha256:343894630f5d029872394aa685eb955d74bd10892ce3f4679de59ec22c054ebb`. Only `n50-dashboard` was recreated, with all unrelated runtime containers and untracked reports preserved.

- API: 168 tests passed, zero failed; web: 78 passed, zero failed. Both typechecks and builds passed. Canonical repository gate passed.
- Final authenticated cash/OI harness: 28/28 passed, at 1440×900 and 390×900. Real retained rows, complete 126-row CSV parity, OI arithmetic, no fabricated day OI/Greek Delta, no page overflow and no uncaught JS. Main-content axe reports: zero violations at both widths. This does not certify unrelated application routes.
- Supplemental Scalper harness: 22/22 passed on `5b6dee5` before the final OI-only top-margin fix. Five-minute/day controls and resistance are preserved. Artifacts: `output/playwright/scalper-5m-20260907/`.
- Visual review found the inherited unspecified grid top could clip the OI axis title. Final commit sets explicit top/left/right/bottom chart margins. Desktop/mobile screenshots verify the vertical scale; compact axis names can shorten on mobile, with the full selected measure remaining above the chart.
- Evidence: `/home/novius2/trading-stack/output/playwright/cash-oi-20260907/` contains `results.json`, `1440-cash.png`, `390-cash.png`, `1440-oi-change.png`, `390-oi-change.png`, per-width source JSON, CSV and axe reports.
- Build/test command logs: `/tmp/cash-api-tests.log`, `/tmp/cash-web-tests.log`, `/tmp/cash-api-build.log`, `/tmp/cash-web-build.log`, `/tmp/cash-dashboard-final-build.log` (ephemeral).

Rerun both application typechecks/tests/builds and `bash scripts/verify/canonical-repository-gate.sh`. Authenticated browser harness: `node tools/playwright/trading-analytics-cash-oi.mjs`, using protected `PLAYWRIGHT_ADMIN_PASSWORD` without printing it.

Open [Morning View](https://n50.nifty50today.co.in/n50/strategy/trading-analytics?view=morning) for cash history; [SmartAPI OI & Quotes](https://n50.nifty50today.co.in/n50/strategy/trading-analytics?view=smartapi) for restored OI/Delta fields and measure selector. Daily cash ingestion recovery and blank-symbol Greeks persistence correction remain open source-level work; no fresh data collection or historical reconstruction is claimed.

Deploy only pushed master with `docker compose -p trading-stack-novius2 build n50-dashboard` then `docker compose -p trading-stack-novius2 up -d --no-deps n50-dashboard`. Do not remove orphan services. Rollback is scoped source revert and dashboard rebuild; no database migration is involved.
