# N50 Product Surface Map

Last reviewed: 2026-03-31

This document is the current source of truth for:

- every unique user-facing page
- every major feature area
- every distinct way a user can interact with the product
- the visible vs hidden navigation surfaces in the deployed website

The route tree below comes from the current React app in `neon-stock-terminal/apps/web/src/App.tsx` and the current shell/navigation configuration in `AppShell.tsx`.

Current doc path:

- [Source of truth](./SOURCE_OF_TRUTH.md)
- [Current architecture](./ARCHITECTURE_CURRENT.md)

## Primary navigation structure

### Visible in the sidebar

- Overview
  - Home
- Market
  - Market Hub
  - Market Story
  - Supporting Metrics
  - Option Chain
- Heatmaps
  - % Change
  - RSI
  - WILLR
- Backtesting
  - Overview
  - Strategy Leaderboard
  - Portfolio Results
  - Regime Analysis
  - Stock Insights
  - Daily Summary
  - Compare
  - Run Monitor
- Learning
  - Strategy Lab
  - Simulator
  - Indicators

### Hidden from the sidebar but still reachable

- Feedback
  - top-bar CTA
  - direct route `/feedback`
- System Map
  - direct route `/analytics/system/map`
- Trust Board
  - direct route `/analytics/system/quality`

## Global interaction surfaces

These interactions are available across most or all pages:

- primary sidebar navigation
- mobile drawer open/close
- top-bar page context
- audience toggle
  - Beginner
  - Advanced
- language toggle
  - English
  - Hindi
  - Marathi
- digits toggle
  - English digits
  - Devanagari digits
- top ticker
- educational disclaimer ribbon
  - always visible
  - expandable via `Read more`
- auth status area
  - sign in
  - sign up
  - email verification follow-up
  - logout
- feedback CTA

## Route-by-route page inventory

### Overview

#### `/`
Home

Purpose:
- landing page
- Nifty 100 market pulse
- sector-first overview

User interactions:
- click sector/stock pills
- click index cards
- open expanded explanation blocks
- move into deeper routes from hero/summary cards

### Market

#### `/analytics`
Market Hub

Purpose:
- main market workspace
- routing page into market detail modules

User interactions:
- local section tabs
- watchlist rows/cards
- quick action cards
- strategy/market context exploration

#### `/analytics/regime`
Market Story

Purpose:
- breadth, participation, regime, and leadership context

User interactions:
- local section tabs
- table scan
- stock selection from leadership tables
- explanation drawers/cards

#### `/analytics/supporting-metrics`
Supporting Metrics

Purpose:
- macro, global, commodities, FX, and supporting context

User interactions:
- local section tabs
- metric card scan
- chart hover
- expand/collapse explanatory content

### Heatmaps

#### `/heatmap/change`
% Change Heatmap

Purpose:
- live market change heatmap

User interactions:
- sector filter chips
- row focus
- stock search
- focused-row chart hover

#### `/heatmap/rsi`
RSI Heatmap

Purpose:
- RSI surface across the tracked universe

User interactions:
- sector filter chips
- row focus
- stock search
- focused RSI chart hover

#### `/heatmap/will`
WILLR Heatmap

Purpose:
- Williams %R surface across the tracked universe

User interactions:
- sector filter chips
- row focus
- stock search
- focused WILLR chart hover

### Stocks and signals

#### `/analytics/setups`
Stocks / Setups

Purpose:
- setup-family-first stock screening

User interactions:
- family toggle
- table scan
- stock row selection
- watchlist exploration

#### `/analytics/risk`
Anomalies / Risk

Purpose:
- caution-first anomaly and event monitoring

User interactions:
- anomaly table scan
- severity/risk interpretation
- row-level inspection

#### `/analytics/flows`
Signals Archive / Flows

Purpose:
- archival and signal-family review

User interactions:
- local tabs
- archive/history table review
- score and family scan

#### `/analytics/stock/:symbol`
Stock Report

Purpose:
- per-symbol report with current state, context, signals, and related strategy evidence

User interactions:
- switch time/range controls
- inspect price/indicator charts
- review symbol-specific tables and explanations

#### `/analytics/system/map`
System Map

Purpose:
- explain the current product lifecycle in plain language
- show where to go next from market context to stock, strategy, options, and trust

User interactions:
- read lifecycle cards
- follow question-to-route guidance
- use direct route links into market, stock, strategy, and trust workspaces

### Learning

#### `/analytics/learn`
Strategy Lab

Purpose:
- explain which signal families are worth carrying into simulation/backtesting

User interactions:
- local tabs
- chart hover
- ranked evidence scan
- drill-down into historical evidence

#### `/analytics/simulator`
Simulator

Purpose:
- interactive what-if simulation and portfolio outcome review

User interactions:
- simulation form inputs
- strategy/timeframe/capital controls
- submit simulation
- inspect result charts
- inspect scenario tables

#### `/analytics/indicators`
Indicators landing

Purpose:
- indicator-led learning hub

User interactions:
- indicator page navigation
- assumptions/limitations open
- chart hover and chart range controls

#### `/analytics/indicators/:slug`
Indicator detail

Purpose:
- one indicator/strategy walkthrough at a time

User interactions:
- scenario selector
- capital mode selector
- stock selection
- chart range changes
- table sort/filter
- CTA to simulator

### Option Chain

#### `/options`
Option Chain

Purpose:
- option chain analytics inside the main app shell

Local tabs:
- Snapshot
- Equilibrium
- ATM Combo
- Diagnostics

User interactions:
- expiry selection
- ATM combo comparison window selection
- local tab change
- ladder row focus
- manual refresh
- chart hover across CE/PE overlays

### Backtesting

#### `/backtesting`
Backtesting Overview

Purpose:
- landing page for historical strategy evidence

User interactions:
- quick-link navigation
- chart hover
- KPI review

#### `/backtesting/strategies`
Strategy Leaderboard

Purpose:
- rank published strategies under one explicit comparison lens

User interactions:
- scan ranked evidence
- compare drawdown/win-rate/regime fit
- open strategy detail

#### `/backtesting/strategies/:strategyId`
Strategy Detail

Purpose:
- one strategy’s historical behavior, rules, trades, and evidence

User interactions:
- scenario filter bar
  - strategy
  - universe
  - capital
  - date range
  - stock
- chart hover
- open-position/trade table review

#### `/backtesting/results`
Portfolio Results

Purpose:
- portfolio-level backtesting outcome review

User interactions:
- compare charts and tables
- open vs closed trade views
- filter bar interactions

#### `/backtesting/regimes`
Regime Analysis

Purpose:
- regime-aware strategy comparison

User interactions:
- grouped chart hover
- regime table review

#### `/backtesting/stocks`
Stock Insights

Purpose:
- stock-strategy fit analysis

User interactions:
- filters
- scatter/bubble chart hover
- ranked chart/table scan

#### `/backtesting/daily-summary`
Daily Summary

Purpose:
- operational daily summary of strategy behavior

User interactions:
- chart hover
- daily summary table scan

#### `/backtesting/compare`
Compare

Purpose:
- cross-strategy performance comparison

User interactions:
- compare-scope bar
  - universe
  - capital
- chart hover
- comparison table scan

#### `/backtesting/runs`
Runs / Audit

Purpose:
- operational audit surface for published runs and validations

User interactions:
- filter and review run rows
- expand details
- inspect validation state

### System and utility

#### `/analytics/system/quality`
Trust Board

Purpose:
- route freshness, operational trust, and health review

User interactions:
- trust/risk alert review
- route performance inspection
- export/report actions where available

#### `/feedback`
Feedback

Purpose:
- signed-in user feedback submission

User interactions:
- open from top bar
- complete feedback form
- accept confirmation checkbox
- submit feedback

## Unique interaction patterns across the website

These are the distinct interaction classes a user can perform across the product:

### Navigation

- sidebar link click
- mobile drawer navigation
- local section tab change
- hidden direct-route access
- redirect entry from legacy routes

### Preference and session control

- audience mode change
- language change
- digit system change
- sign in
- sign up
- logout
- feedback CTA open

### Discovery and scanning

- stock selection from lists/cards/heatmaps
- chart hover
- table scan
- status badge reading
- explanation/education expansion

### Filtering and scenario control

- date range selection
- strategy selection
- capital mode selection
- universe mode selection
- expiry selection
- stock selector changes
- option-chain compare window changes
- heatmap filter/search changes

### Table and list interaction

- table sort
- table filter
- row click/select
- sticky table review on desktop/mobile

### Model/simulation execution

- run simulation
- review simulation results
- open simulator from learning/indicator surfaces

### Operational and reporting actions

- export/report download
- open trust/ops details
- review backtesting runs and validations

### Feedback

- fetch submission challenge
- fill signed-in feedback form
- accept confirmation checkbox
- submit feedback

## Hidden but important surface notes

- `Feedback` is intentionally not in the main sidebar. It is reached from the top bar and direct route.
- `System Map` is intentionally hidden from the primary sidebar and used as a direct-route orientation page.
- `Trust Board` is intentionally hidden from the primary sidebar but remains available directly.
- `Backtesting Runs` remains a direct route even though the broader backtesting navigation emphasizes analytical views first.

## Related docs

- [Source of truth](./SOURCE_OF_TRUTH.md)
- [Current architecture](./ARCHITECTURE_CURRENT.md)
- [Current stack inventory](./stack-current.md)
- [Endpoints reference](./endpoints.md)
- [N50 stage/prod hosting](./n50-stage-prod-hosting.md)
- [Analytics and attribution](../neon-stock-terminal/docs/analytics/README.md)
- [Feedback](../neon-stock-terminal/docs/feedback/README.md)
- [Options](../neon-stock-terminal/docs/options/README.md)
- [Backtesting](../neon-stock-terminal/docs/backtesting/README.md)
