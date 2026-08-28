# Current Today State Audit

## Repository state

- Canonical repository: `/home/novius2/trading-stack`
- Canonical release branch at audit: `master`
- Baseline commit: `cd6ba22`
- Implementation branch: `ui/today-summary-market-board-v1`
- Pre-existing ignored/untracked runtime reports were preserved and are outside this UI change.

## Route and component tree

```text
/
└── AppShell
    └── LandingPage
        ├── index strip (NIFTY 50, BANK NIFTY, INDIA VIX)
        ├── F&O anomaly flash
        ├── sector heatmap and seven stock lenses
        │   ├── StockUniverseFilterBar
        │   └── StockPill × covered stock
        ├── complete F&O anomaly radar
        ├── supporting market metrics
        ├── folded market story/movers
        └── explanatory/next-step content
```

Aliases: `/dashboard/home` redirects to `/` and `/stock` redirects to `/`.

## Current data ownership

| Surface | Hook/client | Endpoint/source | Refresh |
|---|---|---|---|
| Market canvas | `useOverview()` | `GET /v1/overview` | 10 seconds |
| Header context | `useHeaderMarketSummary()` | `GET /v1/overview/header` | 30 seconds |
| Live prices | `useLiveQuotesWithStatus()` | canonical WS/stream | central hook |
| Supporting metrics | `useSupportingMetrics()` | analytics supporting-metrics API | hook-owned |
| Stock profiles/logos | `useProfileIndex()` | `/n50/stock-profiles.json` | cached once |
| Stock quick detail | `useStock()` | `GET /v1/stocks/:symbol` | 10 seconds for 1D |

## Existing stable and dynamic ordering

- Sector groups are arranged using a hard-coded visual column template, then unmatched sectors are appended.
- Stocks are stable/symbol ordered unless the user selects strength sorting.
- The old implementation animates stock movement between positions when order changes.
- Revamp requirement: stable physical order by default, live rank labels, no automatic physical movement.

## Current freshness behavior

- Snapshot freshness is derived through `buildMarketQuoteQuality` from snapshot timestamp, WS transport, receive timestamp, sequence gaps and request failure.
- Last valid React Query data is retained during normal refresh.
- Current screenshot showed degraded/disconnected transport while preserving the snapshot.

## Current visual baseline

Authenticated screenshots already exist for all required viewports under `docs/uiux/v5/full-route-screenshots/` and are copied into this audit's `current-screenshots/` directory.

At 1920×1080 the current first viewport contains the shell, index strip, anomaly strip and only a portion of the sector board. The page continues substantially below the viewport into the complete contract radar, supporting metrics and explanatory folds. Browser-level scrolling is therefore routine. Exact historical scroll pixels are `UNVERIFIED` because protected Playwright credentials were not available in the current shell.

## Reference/data mismatches

- No canonical market-regime value exists in `OverviewResponse`; render `Not classified` rather than infer one.
- No authoritative sector/index contribution-point field exists; use the required `Sector Leadership` fallback.
- No canonical conviction field exists; omit the decorative conviction visualization and render `—` only where column preservation requires it.
- Existing overview does contain OIIS score/state and anomalies; `Trade Opportunities` may be used only for rows with canonical OIIS classification, otherwise use `Strongest/Weakest Movers`.
- No previous sector-rank snapshot is exposed; rank delta is unavailable and must render `—`.
- Index and sector intraday series are not present in the overview payload; cards must not fabricate sparklines. Stock detail may supply a quick-view chart when available.
