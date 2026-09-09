# UI feature preservation manifest — 25 August 2026

## Purpose

This manifest prevents additive dashboard work from silently removing shared shell capabilities. The integration tree is the deployed source of truth for this snapshot. Any shell, authentication, navigation or API refactor must run the listed regression checks before cutover.

## Critical shared features

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
