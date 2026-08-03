# Frontend binding notes

This package does not impose a second theme system.
It emits semantic values so the existing branded shell remains authoritative.

## Use these semantic fields

- `direction`: `up | down | neutral`
- `accent_token`: `green | red | white`
- `arrow`: `▲ | ▼ | •`

## Overview page payload usage

### Hero
Use `hero` from `/api/v1/intraday/summary`:
- index name
- last value
- change %
- as-of timestamp
- direction tokens

### State strip
Use `state` from `/api/v1/intraday/summary`:
- primary state
- confidence score
- narrative
- secondary states

### Summary table
Use `summary_table` directly as a compact KPI table or cards.

### Breadth card
Use `breadth` from `/api/v1/intraday/summary`.

### Leadership panes
Use `leaders.top_strength` and `leaders.top_weakness`.

### Ticker tape
Use `ticker_tape`.

## Detailed section pages

Render one route or panel per section slug:

- `market-state`
- `breadth-participation`
- `open-drive`
- `leadership-dispersion`
- `reversals-failures`
- `stock-opportunities`
- `history-context`

Each section payload already includes:
- `summary_metrics`
- `highlights`
- `narrative`
- `rows`
- `charts`
- `historical_context`

## Stock detail page

Use `/api/v1/intraday/stocks/{symbol}` to populate:
- current intraday status
- signal labels
- time series for the oscilloscope chart
- tags and narrative conclusion

## Empty states

If a payload returns an error or empty result:
- show a white-on-black empty state
- indicate that intraday data is missing or delayed
- do not substitute zeros
