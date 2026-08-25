# UI feature preservation manifest — 25 August 2026

## Purpose

This manifest prevents additive dashboard work from silently removing shared shell capabilities. The integration tree is the deployed source of truth for this snapshot. Any shell, authentication, navigation or API refactor must run the listed regression checks before cutover.

## Critical shared features

| Feature | Runtime ownership | Required evidence |
|---|---|---|
| Paper alert launcher | `PaperTradeNotifier.tsx` mounted once by `AppShell.tsx` | Visible on authenticated desktop and mobile routes |
| Latest five paper events | `GET /v1/paper/notifications?limit=5` | Authenticated response, durable `paper_trading.trade_events` source, entry/target events only |
| Automatic event popup | notifier polling and durable event-ID deduplication | A newly intercepted browser response opens the panel; initial history stays silent |
| Native voice mode | header `Muted`/`Speak` switch and browser `speechSynthesis` | Defaults muted, persists locally, speaks entry/target conditions, mute cancels queued speech |
| Permanent stock ticker and NIFTY quote | `HeaderTicker.tsx`, `AppShell.tsx`, and `GET /v1/overview/header` | Dedicated NIFTY context stays visible while the rigid header ticker rail shows 30 current NIFTY-500/F&O stock movers, not index-only rows |
| Strategy destinations | `workspaceRoutes.ts`, route catalogue and responsive navigation | Trendlyne Summary, OIIS Lab, Monthly Strategy, Rolling Strategy, Long Options and NIFTY Options remain reachable |
| Paper evidence workbench | `/paper-trading` route and `PaperTradingCommandCenter.tsx` | Existing evidence, filters, detail inspector and market-book fields remain present |
| Paper Simple View | `/paper-trading?tab=simple` | Additive compact table retains shared filters and opens the canonical trade inspector; existing Portfolio and What good looks like views remain unchanged |
| Paper WhatsApp lifecycle alerts | `paper-webhook-worker`, `papertrade/whatsapp.py` and PostgreSQL outbox | Configurable chat ID; entry/target/exit events are formatted, low-noise and idempotent; entries add company/Trendlyne/52W context plus a fail-soft candles/Bollinger/volume/RSI/MACD PNG |
| Monthly rejected ledger | `MonthlyStrategiesPage.tsx` plus `rolling_monthly.evaluation_ledger` | Selection filter exposes selected, rejected, incomplete and all evaluated stocks; rejected rows show reasons |
| Rolling rejected ledger | `MonthlyStrategiesPage.tsx`, `rollingWindow.ts` and `rolling_monthly.rolling_window_evaluation` | Population filter exposes selected, continuation, rejected and incomplete stocks; rejected rows show reasons |
| Native cursor preservation | `MarketTargetCursor.module.css` | Target overlay may snap to controls but must never apply `cursor:none` to the page |
| High-legibility font | `fontMode.ts`, `AuthStatus.tsx`, `EChartSurface.tsx` | User-menu switch selects Atkinson, persists across reload and updates charts without external font requests |
| Home stock identity | `StockPill.tsx` and stock-profile assets | Symbol, name and logo remain visible; pixel interaction cannot obscure text |
| Trendlyne Summary | `/strategy/trendlyne-summary` plus `trendlyneSummary.ts` | Six-month ledger, fund-house/stock summaries and inspector remain reachable without fixed-count assumptions |

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
