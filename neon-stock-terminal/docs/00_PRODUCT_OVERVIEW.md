# Product overview

## What this is

A single-page stock learning terminal (web app) that provides:

- **Landing / overview**:
  - **Nifty 50**: current value, delta today, % change (KPI style with glitch treatment)
  - **N100 universe**: stocks grouped by **sector**, showing (value, delta, % change)
  - **Top gainers / top losers** (fast scan)
  - A **sidebar leaderboard** that dynamically ranks stocks by % gain today

- **Stock detail** (on click):
  - Intraday KPI summary: last, change, change %, OHLC (day)
  - Intraday “oscilloscope” style chart (neon line) + optional candlestick module later

- **Always-on chrome**:
  - **Header ticker tape**: continuously scrolling symbols + price + change
  - **Footer disclaimer marquee**: continuously scrolling education-only disclaimer

## What this is not (explicitly)

- Not a trading platform
- Not financial advice
- Not a broker
- Not a signal service

The UI must **always** display the disclaimer in a persistent footer.

## Core design constraint

The UI palette is strictly restricted to:

- **Black**
- **White** (and white opacity levels)
- **Neon Red** (+ its shades/tints)
- **Neon Green** (+ its shades/tints)

No other hues are permitted.

## Future modules (planned)

- Backtesting / strategy reports
- Saved watchlists
- Paper-trade simulations
- Multi-timeframe scanners
