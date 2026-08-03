# Frontend notes

The frontend should treat this API as a view-model layer.

## Do
- bind hero summary to the central Nifty KPI card
- bind ticker_tape to the always-on header marquee
- bind footer_disclaimer to the moving footer disclaimer
- use section routes for detailed drill-down pages
- use watchlist routes for ranked watchlist screens and exports

## Do not
- add new color primitives
- infer direction from numbers if the payload already provides direction
- hide data delays: surface `is_stale`
