# UI feature preservation manifest — 25 August 2026

## Purpose

This manifest prevents additive dashboard work from silently removing shared shell capabilities. The integration tree is the deployed source of truth for this snapshot. Any shell, authentication, navigation or API refactor must run the listed regression checks before cutover.

## Critical shared features

2026-09-10 Scalper V2 charting-upgrade v2: the existing native drawing layer now
supports click-by-click trendline preview/commit, complete cancellation, endpoint
and whole-object drag, CSS-pixel hit testing, exact UTC/price editing and one-step
undo. This is the charting specification's immediate complete-trendline slice,
not a claim that its later Strategy Lab, screener, alert or research stages are
implemented. V1, V7, A-open/B-close, exact contracts, OI/delta-OI, Trade Log,
SHAP, monthly views, collectors and no-order permissions remain unchanged. See
`docs/trading-analytics/SCALPER_V2_CHARTING_UPGRADE_V2_20260910.md`.

2026-09-10 Scalper V2 workstation drawings: the existing
`view=scalper_v2` now owns native time/price drawing primitives, a left tool
rail, Objects inspector, undo/redo and symbol-scoped local recovery. CE1-3 and
PE1-3 are retained by current-OI rank, and append-only chart updates reuse the
existing series. V1, V7, A-open/B-close, OI/delta-OI axes, Trade Log, SHAP,
monthly views, APIs, collectors and read-only permissions remain unchanged.
See `docs/trading-analytics/SCALPER_V2_WORKSTATION_DRAWINGS_20260910.md`.

2026-09-10 Scalper V2 acceptance completion: the existing V2 adds explicit
full-day/30/60-bar X views, Session/Visible/Manual Y modes, Y lock, exact A/B
time controls with immutable measurement evidence context, a selected-pair
OI/delta-OI/IV/spread matrix, and selected-versus-ATM identity. Pointer motion
does not hydrate chart data. Historical chain absence and screenshot-export
limitations are explicit. V1, V7, A-open/B-close arithmetic, Trade Log, matrix,
SHAP, APIs, collectors and no-order permissions remain unchanged. Full honest
matrix: `docs/trading-analytics/SCALPER_V2_ACCEPTANCE_MATRIX_20260910.md`.

2026-09-10 Scalper V2 geometry and inspection repair: the additive
`view=scalper_v2` now uses measured full-width chart bodies, independent
observed-session price envelopes, full-day X fitting, source-owned linked time
and strike inspection, real Latest/Cursor/Locked numerical values, truthful
delta-OI/PCR states and bounded price-coordinate OI geometry. Existing Scalper
V1, V7 events, A-open/B-close measurement, exact contracts, all Trading
Analytics routes/exports, collectors, SHAP Research and no-order permissions
remain unchanged. Evidence:
`docs/trading-analytics/SCALPER_V2_REPAIR_20260910.md`.

2026-09-10 Monthly Close vs Open comparison:
`/strategy/monthly?compare=close-open` is a read-only comparison of the two
independently versioned selected-candidate lists. It classifies each stock and
calendar month as In both, Monthly Close only or Monthly Open only, preserves
missing outcomes, exposes both underlying evidence inspectors and exports the
paired fields. It does not merge, re-rank or change either strategy.

2026-09-10 Monthly Open strategy: `/strategy/monthly?entryMethod=MONTHLY_OPEN`
adds independent `absolute_monthly_open_bullish_long_v1` selection and
same-calendar-month backtesting beside the unchanged Monthly Close strategy.
Monthly red/green context remains explicit; all cross-period decision values
and entry use opening prices, with no signal-session close used for selection.
First Session gap logic, expiry, Rolling 5/30/60, OIIS, Paper Trading, source
precedence, permissions and existing close results remain unchanged. Evidence:
`docs/rolling-monthly/MONTHLY_OPEN_STRATEGY_2026-09-10.md`.

2026-09-10 additive Scalper V2: `/strategy/trading-analytics?view=scalper_v2`
adds a separate three-chart comparison workspace while `view=scalper` remains
the default Scalper. The selected timeframe loads first, then exact-pair
1m/5m/15m/60m chart payloads preload through the existing authenticated API and
React Query cache. Current V7 signals, A-open/B-close measurement, collectors,
OI meanings, source gaps, exports, permissions and all previous tabs remain
unchanged. V2 adds current-OI leaders, price-aligned OI context, a chain rail and
four scoped option analytics blocks. Evidence:
`docs/trading-analytics/SCALPER_V2_20260910.md`.

2026-09-10 Scalper latency repair: normal Scalper entry uses a small authenticated
read-only context route instead of blocking on the full Morning/FII/participant
payload. Selected context/chart requests use an indexed exact-symbol lookup;
the full all-stock selector loads on demand and remains available. Session OI
baseline queries retain event-time rules while adding indexed
collection-time bounds. The default one-day view requests three calendar days
for indicator warm-up; All retained days remains 15 days. Shared full evidence
loads lazily on explicit drawer access. V7 rules, A-open/B-close measurement,
exact contracts, OI semantics, exports, collectors and no-order permissions are
unchanged. Evidence: `docs/trading-analytics/SCALPER_LOAD_LATENCY_20260910.md`.

2026-09-10 MANEESH daily trade SHAP V2: the read-only Good-trade experiment now
uses a rolling 30-calendar-day population and an exact selected-option positive
15-minute net P&L label after versioned charges. The old 20-session gate is
removed; a chronological trade-level holdout remains, and same-session
correlation is disclosed as an exploratory limitation. The durable scheduler
runs once at/after 16:00 IST on trading days and catches up after a same-day
restart. Full V7 condition/indicator JSON, CE/PE 15m/30m/EOD comparisons,
exports, entry logic, paper/live permissions and notifications remain unchanged.

2026-09-09 current stock-F&O collection reconciliation: Trading Analytics and
the collector now use the same current SmartAPI stock-F&O membership boundary.
Missing cash underlyings are resolved from the real NSE master, startup prices
are seeded before ATM option selection, synthetic `NSETEST` rows are excluded,
and configured capacity remains authoritative. Existing NIFTY-250/index
subscriptions, V7 rules, chart calculations, OI meanings, orders and stored
history are unchanged. Evidence:
`docs/worklogs/current-stock-fno-coverage-2026-09-09.md`.

2026-09-09 NIFTY Model Research recovery: missed hourly capture windows are
retried every five minutes across the retained 15-day minute-data horizon.
Recovered rows retain planned and actual timestamps, delay, exact source rows
and outcomes, and remain explicitly ineligible as on-time point-in-time
forecasts. On-time/recovered counts are visible. SHAP gates, EMA9, execution,
paper trading and notifications remain unchanged. Evidence:
`docs/trading-analytics/NIFTY_EXPLAINABLE_CONTEXT.md`.

2026-09-09 observation P&L: additive exact-master CE/PE lot metadata, high/low
and hypothetical premium-delta × quantity gross/net analysis; no realised-ledger
changes. Exact-symbol/token Scalper links prohibit automatic pair substitution.
Existing presets/raw exports, rules and messaging remain unchanged. Evidence:
`docs/trading-analytics/OPTION_PNL_20260909.md`.

2026-09-09 MANEESH Trade Log (deployed from master `a9d4372`): the existing
`/strategy/trading-analytics?view=trade-log` read-only endpoint/route, V7 rules,
exact underlying/CE/PE contracts, gates, all indicator/outcome fields, delivery,
Legacy CSV and raw precision are retained. New presets, inspector and full loaded
exports add access paths; no orders or notifications are generated. Shared
market controls are explicitly distinguished from log filters. Old view available
with `logLayout=legacy`. See `docs/trading-analytics/TRADE_LOG_READABILITY_20260909.md`.

2026-09-09 MANEESH Trade Log comparison follow-up: the default table preset now
shows both exact CE and PE across 15m, 30m and EOD. Each of the six cells retains
net/gross/charges, entry-to-endpoint premium, high/low excursion, one exact lot
quantity and maturity. Monitor, Outcomes, Entries & rules, Indicators, Full
evidence, inspector and exports remain available. The local SHAP Research link
opens the separate read-only good-trade experiment; it does not alter V7 signals.

2026-09-09 NIFTY Model Research: additive `/strategy/nifty-context` with direction,
range, validation and data/audit lenses. Lazy SVG/table explanations do not load
SHAP into the browser or alter existing MANEESH charts. Authenticated read-only
API and isolated CPU worker use only the new `nifty_context` schema for writes.
EMA9 entries, PCR/OI, source records, notifications and execution are unchanged.
Evidence and acceptance gates: `docs/trading-analytics/NIFTY_EXPLAINABLE_CONTEXT.md`.

2026-09-07 Scalper measurement: opt-in chart click callback/rectangle support,
browser-memory-only endpoints/quantity and fixed exact pair; RSI/MACD on selected
underlying. Existing chart consumers, source bars/CSV, OI, EMA9, resistance,
orders and paper data are unchanged. Evidence: SCALPER_MEASUREMENT_20260907.md.

2026-09-08 MANEESH chart-first repair: financial native-axis mode, correct
candlestick low/high extraction, explicit Fit levels, off-screen level labels,
visible-range 50-point guides and compact underlying/CE/PE layout. Generic
charts keep the prior extent policy; exact-pair A/B, RSI/MACD, EMA9, ladder, OI,
exports and read-only execution gates remain unchanged. Evidence:
`docs/trading-analytics/UI_CHART_UPGRADE_20260908.md`.

2026-09-08 MANEESH chart evidence completion: independent MR/MS, WR/WS and
DR/DS lifecycle records; calendar-qualified weekly/monthly periods;
previous-session/first-session OI baselines; fixed display-cohort composite OI;
calendar-anchored 1/5/15/60 minute OI changes; price-aligned OI profile; and
previous participant-report comparisons. Missing OI, calendars and comparison
records remain explicit. This is read-only and does not alter OIIS/OISS,
execution, source precedence or paper trading. Evidence:
`docs/trading-analytics/UI_CHART_UPGRADE_20260908.md`.

2026-09-08 MANEESH multi-timeframe matrix: additive fixed 3-by-3 comparison of
the underlying, exact selected CE and exact selected PE at 1m, 5m and 15m.
Hover time is synchronized across all nine panes. The Scalper remains unchanged;
missing bars stay explicit and the matrix has no interval selector. Evidence:
`docs/trading-analytics/MULTI_TIMEFRAME_MATRIX_20260908.md`.

2026-09-07: temporary MANEESH header link opens the existing Trading Analytics
Scalper (5m default); original Strategy menu destination remains. Pink/white
styling is scoped to this shortcut only. Desktop and mobile retain navigation,
NIFTY context, speech and paper notifier. No strategy/API/data changes.

| Feature | Runtime ownership | Required evidence |
|---|---|---|
| Paper alert launcher | `PaperTradeNotifier.tsx` mounted once by `AppShell.tsx` | Visible on authenticated desktop and mobile routes |
| Latest five paper events | `GET /v1/paper/notifications?limit=5` | Authenticated response, durable `paper_trading.trade_events` source, entry/target events only |
| Automatic event popup | notifier polling and durable event-ID deduplication | A newly intercepted browser response opens the panel; initial history stays silent |
| Native voice mode | header `Muted`/`Speak` switch and browser `speechSynthesis` | Defaults on unless explicitly muted, persists locally, speaks only governed entry/target phrases, mute cancels queued speech |
| Single-line market context | `AppShell.tsx`, `ResponsiveWorkspaceNavigation.tsx`, and `GET /v1/overview/header` | Dedicated PAPER mode, NIFTY mark, market state, data time and readiness stay visible in the single command header; the retired ticker rail stays absent |
| Global and Strategy destinations | `workspaceRoutes.ts`, route catalogue and responsive navigation | Today, Markets, Strategy and Paper remain primary; Stocks/Derivatives remain under Markets; Data & Operations remains under More; all seven Strategy workspaces remain reachable |
| Paper evidence workbench | `/paper-trading` route and `PaperTradingCommandCenter.tsx` | Existing evidence, filters and detail inspector remain present; dedicated Market Book tab exposes the immutable entry quote and top-three bid/ask ladder |
| Paper Simple View | `/paper-trading?tab=simple` | Additive compact table retains shared filters and opens the canonical trade inspector; existing Portfolio and What good looks like views remain unchanged |
| Paper WhatsApp lifecycle alerts | `paper-webhook-worker`, `papertrade/whatsapp.py` and PostgreSQL outbox | Configurable chat ID; entry/target/exit events are formatted, low-noise and idempotent; entries add company/Trendlyne/52W context, immutable SmartAPI entry touch/top-three book, plus a fail-soft candles/Bollinger/volume/RSI/MACD PNG |
| Monthly rejected ledger | `MonthlyStrategiesPage.tsx` plus `rolling_monthly.evaluation_ledger` | Selection filter exposes selected, rejected, incomplete and all evaluated stocks; rejected rows show reasons |
| Rolling rejected ledger | `MonthlyStrategiesPage.tsx`, `rollingWindow.ts` and `rolling_monthly.rolling_window_evaluation` | Population filter exposes selected, continuation, rejected and incomplete stocks; rejected rows show reasons |
| Native cursor preservation | `MarketTargetCursor.module.css` | Target overlay may snap to controls but must never apply `cursor:none` to the page |
| High-legibility font | `fontMode.ts`, `AuthStatus.tsx`, `EChartSurface.tsx` | User-menu switch selects Atkinson, persists across reload and updates charts without external font requests |
| Home stock identity | `StockPill.tsx` and stock-profile assets | Symbol, name and logo remain visible; pixel interaction cannot obscure text |
| Trendlyne Summary | `/strategy/trendlyne-summary` plus `trendlyneSummary.ts` | Six-month ledger, fund-house/stock summaries and inspector remain reachable without fixed-count assumptions |
| OISS v1.202608 | `/strategy/oiss-v1-202608`, `OissV1Page.tsx`, `oissV1.ts`, `services/oiss_v1` | Independent from OIIS; 13 URL lenses, immutable run identity, radar/rejected/carry/change/backtest evidence and full JSON/CSV/Excel exports remain reachable; scheduler and paper stay gated |
| Compact UI V5 | `VITE_UI_COMPACT_V5`, shared shell/workspace primitives and `docs/uiux/v5` | Presentation-only flag; all route data, calculations, filters, inspectors, comments, audit and full-data exports remain canonical; heavy Paper lenses mount only when selected |
| Option 4 command header | `AppShell.tsx`, `ResponsiveWorkspaceNavigation.tsx`, `workspaceRoutes.ts` | One 56 px desktop header, no second global rail, permission-filtered menus, responsive drawer, Ctrl+K, local page tabs, status, voice and user controls preserved |
| OIIS/OISS multi-model research | `services/ai_stock_research`, `ai_stock_research.*`, `compose.ai-stock-research.yml` and `/paper-trading?tab=tracked` | One stock/day immutable evaluation; Claude/Qwen/DeepSeek results, source lineage and compact one-year OHLCV inputs remain auditable in the dedicated Paper Trading table/inspector and complete filtered CSV; model-facing research excludes O/X/direction/status and uses OHLCV only for price/news alignment; V5 earnings, web sentiment, positive/negative evidence, upcoming risk and market view remain available; only successful validated research output enters the WhatsApp outbox; no ChatGPT call or strategy/paper mutation |
| MANEESH aligned terminal V3 | `/strategy/trading-analytics?view=scalper`, `AlignedScalperTerminal.tsx`, `renderer=classic` rollback | Default synchronized NIFTY/exact CE/exact PE candlesticks plus OI, signed interval delta OI, RSI and MACD; strict session levels, current PCR/indicative max-pain context, provider-native missingness, exact A-open/B-close measurement, evidence inspector and all classic ECharts evidence/exports remain available; research-only and no order path |
| MANEESH readable aligned terminal V4 | Same canonical Scalper route and renderer control | Readable-height native NIFTY/CE/PE/OI/ΔOI panes with intentional internal scrolling; independent optional RSI/MACD/PCR panes; stable refresh/resize/cursor lifecycle; current/archived-delta/composite OI profile; value-first selected-pair summary; Latest/Cursor/Locked inspection; Chain/Rules/Measure/Levels/Health sections; mobile inspector sheet; V7 signals, exact A-open/B-close arithmetic, alternate renderer, raw evidence and no-order permissions unchanged |
| MANEESH multi-timeframe matrix | `/strategy/trading-analytics?view=matrix`, `TradingAnalyticsTimeframeMatrix.tsx` | Separate no-selector 1m/5m/15m by underlying/exact CE/exact PE matrix; nine light candlestick charts share one wall-clock crosshair and latest retained IST session; original Scalper and all execution/data semantics remain unchanged |

## Mandatory regression commands

```bash
cd /home/novius2/trading-stack/neon-stock-terminal/apps/web
npm run typecheck
npm test

cd /home/novius2/trading-stack/neon-stock-terminal/apps/api
npm run typecheck
npx tsx --test src/routes/mobileNotifications.paperPopup.test.ts

cd /home/novius2/trading-stack
bash scripts/verify/canonical-repository-gate.sh

cd /home/novius2/trading-stack
PLAYWRIGHT_ORIGIN=https://n50.nifty50today.co.in \
PLAYWRIGHT_ADMIN_PASSWORD='<from protected deployment environment>' \
PLAYWRIGHT_OUTPUT_DIR=/tmp/paper-notifier-regression \
node tools/playwright/paper-event-notifier-regression.mjs
```

The Playwright script uses browser response interception for the synthetic new-event check. It must not insert, modify or delete a paper trade or durable event.

## Current restoration evidence

- Root cause: the Git-backed delivery tree retained the notifier implementation while the non-Git integration tree had lost its component files, shell mount, voice switch and browser endpoint.
- Production image rebuilt and only `n50-dashboard` recreated.
- Authenticated production regression: 18/18 checks passed at 1440×900, 1366×768 and 390×844.
- API and frontend typechecks passed.
- Focused notifier unit and API tests passed.
- Two stale navigation expectations were found and corrected to preserve the current six-destination Strategy navigation and `Rolling Strategy` wording. The application was not reverted to satisfy the obsolete four-item menu expectations.

## Change rule

A new dashboard is additive only when this manifest still passes. Removing a shared feature requires a separately approved product decision, an updated manifest and explicit migration notes; absence from a new page implementation is not permission to remove it from the application shell.
# 2026-09-07 additive Trading Analytics workspace

- New `/strategy/trading-analytics` route, Strategy dropdown and command search.
- Existing NIFTY Options tabs remain unchanged; one additional journey link.
- OIIS/OISS, paper ledger, global shell, speech, authentication and source
  precedence preserved. New endpoints inherit the canonical `/v1` auth guard.
- Institutional/option/price charts are read-only previews with visible missing
  data and policy gates. Feature rollback: `N50_TRADING_ANALYTICS_ENABLED=false`.
- Evidence and unimplemented stages: `docs/trading-analytics/IMPLEMENTATION_REPORT.md`.
# 2026-09-07 additive Trading Analytics IO navigation

F&O extension: a canonical-master underlying selector and `symbol=` scope all
Trading Analytics prices/EMA/resistance/exact-option evidence and JSON exports.
Scalper/Structure/API default 5m; retained one-day Scalper default. Shared window
PCR and explicitly indicative (not full-chain) max pain. Existing NIFTY strategy,
market-wide institutional data, missingness and execution gates are unchanged.
Evidence: `docs/trading-analytics/FNO_COVERAGE_20260907.md`.

`/strategy/trading-analytics` now groups nine historical query views into six primary workspaces. Old `activity`, `participants`, `options`, `smartapi`, `health` query links remain accepted. Data Health, Source / Formula and Condition Evidence are shared right drawers. All existing source JSON/CSV fields remain; weekly/monthly and exact OI history are additive read-only views. Existing NIFTY strategy, shared header, authentication, permissions and orders remain unchanged. Detailed mapping: `docs/trading-analytics/IO_UI_REVIEW_20260907.md`.

Cash/axis addition: Morning View exposes independently dated NSE cash FII/FPI and DII buy/sell/net, complete retained CSV and history. Selected-date matrix inputs are unchanged. SmartAPI restores all option columns, keeps Greek Delta separate from prior-quote and provider-day ΔOI, and exposes source timestamps/missingness. Scoped value-axis overrides do not modify the shared chart skin or other dashboards. Report: `docs/trading-analytics/CASH_OI_AXIS_20260907.md`.
