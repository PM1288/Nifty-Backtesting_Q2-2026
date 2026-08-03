Verification priorities:
- residual columns populated in `security_minute_feature`
- score columns populated in `stock_intraday_live`
- watchlists created for residual leaders, VWAP control, headline spikes, catch-up candidates, and index-beta followers
- `/api/v1/intraday/sections/stock-quality` returns rows and chart payload
- `/api/v1/intraday/stocks/{symbol}` returns `explanation` and `history_context`