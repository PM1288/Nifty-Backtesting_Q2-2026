# Implemented Screen Specifications

## Shared workspace

All active non-home screens receive:

- compact white header and market tape;
- PAPER/page/feed/user identity strip;
- navy product-domain navigation;
- 216 px expanded and 72 px collapsed desktop rail;
- responsive drawer below 980 px;
- light canvas, white surfaces and semantic status colours;
- stable legacy and `/dashboard/*` URLs.

## Priority vertical slices

### Market

Overview, market state and regimes preserve their existing authoritative API data. Shared panels, cards and tables use V2 surfaces. Market charts retain financial semantic colours.

### OIIS

Live Selection and Strategy Evaluation retain governed stock selection, evidence and validation. They are grouped as one product domain rather than split across unrelated menus.

### Strategy Lab / Backtests

The existing four-part journey—define, scope, verify/run, evaluate—is retained. Run identity, status, tested date, realised economics, independent ladder evidence and consolidated CSV remain visible. Diagnostic targets remain separate from realised execution.

### Operations

System Map and Data Quality are the operational destinations. The global context strip exposes feed state but does not replace detailed freshness evidence.

## Deferred catalogue screens

Paper Trading, Futures and Administration require backend contracts and governed data. They are not present in navigation until an end-to-end vertical slice exists.
