# UI feature preservation manifest — 25 August 2026

## Purpose

This manifest prevents additive dashboard work from silently removing shared shell capabilities. The integration tree is the deployed source of truth for this snapshot. Any shell, authentication, navigation or API refactor must run the listed regression checks before cutover.

## Critical shared features

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
