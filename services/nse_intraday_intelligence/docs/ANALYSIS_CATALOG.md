# Analysis catalog

This package adds a new intraday analysis layer on top of the daily warehouse.

## A. Market-state conclusions

You can now conclude:

- trend day up / trend day down
- gap-and-go
- gap-fill / failed open
- high-volatility chop
- late-day reversal
- narrow leadership vs broad participation

These are the most important market-level conclusions because they help determine which downstream learning mode to emphasize:
- continuation study
- mean-reversion study
- reversal / failure study
- caution / low-trust regime

## B. Open quality analysis

Questions answered:
- Was the opening gap accepted?
- Did the first 15 minutes expand in the same direction?
- Was the open rejected later?

Metrics:
- gap %
- first 15m range %
- gap-filled flag
- failed-open flag

## C. Breadth and participation analysis

Questions answered:
- Is the move broad enough to trust?
- How many large-cap names are participating?
- Are names above VWAP or only marginally positive?

Metrics:
- breadth up %
- breadth above VWAP %
- breadth above opening range %
- weighted participation %
- sign agreement %

## D. Leadership concentration analysis

Questions answered:
- Is the index move being carried by 5–10 names?
- Is the move broad or concentrated?

Metrics:
- top10 concentration %
- dispersion %
- equal-weight breadth vs weighted participation

## E. Intraday stock-structure analysis

For each Nifty 100 name:
- relative strength vs index
- VWAP position
- open-range break
- 15m and 30m change
- continuation score
- weakness score
- mean-reversion score
- reversal score

## F. Watchlist analysis

System watchlists included:
- Intraday Strength
- Intraday Weakness
- VWAP Reclaim
- Late Reversal

These are learning surfaces, not trade instructions.

## G. Historical context analysis

Once enough history exists, the package can compare the current session to prior sessions with the same label.

Questions answered:
- How often does this state continue the next day?
- Which states have poor follow-through?
- When is broad participation more reliable than narrow leadership?

## Summary-table design for the dashboard

The summary table is meant to answer the session question at a glance.

Recommended row set:
- Primary state
- Gap %
- 15m range %
- Breadth up %
- Above VWAP %
- Weighted participation %
- Top10 concentration %
- Dispersion %

## Detailed sections in the UI

The package emits detail sections in this order:

1. Market State
2. Breadth & Participation
3. Open Drive
4. Leadership & Dispersion
5. Reversals & Failures
6. Stock Opportunities
7. History Context

## What becomes better with historical data

The following analyses improve materially:

- state reliability
- next-day follow-through
- chop vs trend discrimination
- narrow-leadership failure rate
- late-day reversal persistence
- stock-signal quality by regime

See `docs/HISTORICAL_VALUE.md`.
