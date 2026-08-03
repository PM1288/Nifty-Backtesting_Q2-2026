# Success Criteria

## Functional
- UI renders without console errors
- Live snapshots update smoothly (no jitter on resize)
- Leaderboard reorder is smooth (no scale bounce)
- Missing data is not rendered as zeros (gaps or explicit messaging)

## Premium feel
- Ticker tape always active
- Liquid backdrop subtle and single accent
- Glitch KPI readable
- Canvas visuals crisp on high DPI

## Integration
- Replacing mock with real feed requires only:
  - sending Snapshot objects over `/ws/live`
  - implementing `/api/stock/{symbol}` to return intraday history
