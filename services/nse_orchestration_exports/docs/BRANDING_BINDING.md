# Binding of API payloads to the branded UI

This package does not ship a second UI theme. It emits payloads designed for your existing UI shell.

## Semantic fields

Every UI-facing record uses these core fields where applicable:

- `direction`: `up` | `down` | `neutral`
- `accent_token`: `green` | `red` | `white`
- `arrow`: `▲` | `▼` | `•`

The frontend must map these to the existing token palette.

## Summary screen mapping

### Header ticker tape
Source:
- `summary.ticker_tape[]`

Each item already includes:
- `symbol`
- `last_value`
- `change_pct`
- `direction`
- `accent_token`
- `arrow`

### Main KPI card
Source:
- `summary.hero`

It includes:
- `index_name`
- `last_value`
- `delta_value`
- `change_pct`
- `as_of`
- `direction`
- `accent_token`

### Sector groups
Source:
- `summary.sector_groups[]`

Each pill includes:
- `symbol`
- `change_pct`
- `direction`
- `arrow`

### Footer disclaimer
Source:
- `summary.footer_disclaimer`

This string must remain visible and moving.

## Detail section mapping

Use `/api/v1/dashboard/sections/{section_slug}` for expandable detailed sections.
The API already returns:
- section metadata
- short summary metrics
- highlight chips
- detailed rows
- historical context if available

## Watchlist page mapping

Use:
- `/api/v1/watchlists`
- `/api/v1/watchlists/{slug}`
- `/api/v1/watchlists/{slug}/history`

Watchlist rows carry direction and accent semantics so the frontend does not need to infer styling rules.
