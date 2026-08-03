Frontend binding:
- use /api/v1/intraday/summary for the landing hero and KPI rail
- use /api/v1/intraday/sections/{section_slug} for detailed analysis sections
- use /api/v1/intraday/stocks/{symbol} for stock detail
- use /api/v1/intraday/watchlists and /api/v1/intraday/watchlists/{slug} for side panels

Preserve the existing brand shell. The payload already emits semantic direction tokens.
