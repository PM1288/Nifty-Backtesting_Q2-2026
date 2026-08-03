# Strategy Catalogue

| Tier | Role | Strategy | Archetype | Entry concept | Native exit |
|---:|---|---|---|---|---|
| 1 | Control | Fixed-Time Intraday Control | control | 10:00 fixed-time entry | 15:00 time exit |
| 1 | Candidate | Extreme RSI Mean Reversion: Daily RSI > 40, Minute RSI < 15 | mean reversion | Minute RSI < 15 after D-1 RSI > 40 | RSI > 70 |
| 1 | Candidate | Confirmed RSI and Williams %R Recovery | confirmed mean reversion | RSI and Williams %R oversold reclaim | RSI >= 60 or WillR >= -20 |
| 1 | Candidate | EMA 9/21 Trend with VWAP Confirmation | trend following | EMA9/EMA21 bull cross above VWAP | Bear EMA cross or VWAP loss |
| 1 | Candidate | 15-Minute Opening-Range Breakout with Volume | breakout | 15-minute range break with volume | VWAP loss or weak bar close |
| 1 | Candidate | Bollinger Lower-Band Re-entry with RSI | mean reversion | Re-entry above lower Bollinger band | Middle band or RSI >= 55 |
| 2 | Candidate | VWAP Pullback Continuation in Daily Uptrend | vwap continuation | VWAP reclaim in D-1 uptrend | VWAP loss or RSI >= 75 |
| 2 | Candidate | MACD Histogram Momentum with VWAP and Index Filter | momentum | MACD histogram positive cross | MACD negative cross or VWAP loss |
| 2 | Candidate | Relative-Strength and Volume Momentum | relative strength momentum | Residual return plus volume momentum | Residual <= 0 or VWAP loss |

All candidate thresholds are frozen starting hypotheses. A new threshold requires a new immutable strategy version.
