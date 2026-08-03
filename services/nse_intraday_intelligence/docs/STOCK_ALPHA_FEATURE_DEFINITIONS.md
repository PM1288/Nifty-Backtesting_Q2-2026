# Stock alpha feature definitions

## Residual return
Residual return removes index beta from the stock return:

- `residual_return_5m_pct = stock_5m_return_pct - beta * index_5m_return_pct`
- same pattern for 15m / 30m / 60m

Interpretation:
- positive residual => stock is outperforming what its index beta alone would imply
- negative residual => stock is underperforming what its index beta alone would imply

## Beta
`beta_20d` and `beta_60d` are estimated from prior daily close-to-close returns derived from the 1-minute session close series.

## VWAP hold quality
Composite score using:
- time spent above VWAP
- current VWAP position
- frequency of VWAP crosses
- VWAP distance / control quality

## Relative strength persistence
Composite score using:
- fraction of elapsed minutes with positive residual minute return
- residual 15m strength
- residual 30m strength
- slope persistence from short-vs-medium residual behavior

## Range efficiency
Measures whether the stock trended smoothly or chopped around:
- high score => smoother trend path
- low score => spike-and-revert or noisy path

## Minute volume ratio
Current minute volume divided by normal minute-of-day volume.

## Cumulative volume vs profile
Elapsed cumulative volume divided by expected cumulative volume for the same minute-of-day.

## Volume curve surprise
Scaled combination driven mainly by cumulative volume vs profile.

## Close-location quality
Rolling recent quality of minute-bar closes within each minute bar:
- near 100 => closes clustering near minute highs
- near 0 => closes clustering near minute lows

## Dominant stock signals
- `residual-leader`
- `residual-laggard`
- `vwap-control-breakout`
- `headline-spike`
- `catch-up-candidate`
- `index-beta-follower`
- legacy fallback signals remain available:
  - `intraday-strength`
  - `intraday-weakness`
  - `mean-reversion-candidate`
  - `late-reversal-candidate`
