# Scalper V3 linked workspace — P1/P2 pass

Date: 22 September 2026  
Scope: `view=scalper_v3` only  
Canonical source: `/home/novius2/trading-stack`

## Outcome

This pass keeps the accepted V3 41/37/22 canvas and adds the interaction
foundation that makes its native and ECharts panels behave as one workstation.
Scalper V2 keeps its existing defaults, layout and saved state.

Implemented:

- one shared time context across NIFTY, CE, PE, the positioning heatmap and all
  three bottom time charts;
- click-to-pin on native candles and ECharts time plots, with Escape/unpin;
- `Link time` and `Link strike` controls, both enabled by default and persisted;
- linked strike hover and click-to-pin across OI, Delta OI and Strike Structure;
- heatmap cells update the same strike inspector and pin both strike and time;
- one compact shared cursor strip for time, NIFTY OHLC, CE/PE close, latest
  snapshot OI/net OI and matching underlying volume;
- explicit latest/cursor/pinned state and a disclosure boundary: the OI values
  in the strip remain latest-snapshot values rather than fabricated historical
  values;
- live-follow state. Physical pan changes V3 to `Return live`; new candles no
  longer force-fit while paused. `L` or the button restores Fit Day;
- native pane maximize buttons plus keys `1`, `2`, `3`; `Esc` restores;
- `B` bottom-strip toggle, `K` time lock, `?` keyboard help;
- chart settings for EMA, volume EMA, signal markers and approved reference
  lines, without deleting the underlying data;
- six-candle right-edge breathing room on all three native price charts;
- Range-normalised panel modes `Current only`, `Context` and `All`, defaulting
  to Context;
- fixed/automatic positioning-heatmap colour scale toggle;
- named Trading, Options Analysis and Market Structure width presets;
- Standard, Ultra dense and Readable header-density modes;
- persistent layout, density, link, rail, bottom-strip and bottom-height state.

## Exact interaction contracts

- `Candle` snap selects the nearest exact underlying candle time.
- `Exact time` and `Free` retain the selected chart timestamp; a receiving
  instrument without an exact completed bar remains unavailable rather than
  borrowing a nearby value.
- A pinned strike is shown as `PIN` in the shared inspector and survives pointer
  leave. Hover takes temporary visual priority without changing the selected CE
  or PE contract.
- Unlinking time stops receiver crosshair and range propagation. Unlinking strike
  stops cross-panel hover propagation; an explicit pin remains visible.
- V3 reference toggles affect only rendering. They do not change session bounds,
  calculations, signals, exports, selection or order permissions.

## P2 status

Delivered P2 foundations: subtle focus borders, ultra-dense/readable modes,
Indian-number formatting already shared by the workspace, fixed-width tabular
numerals, persisted named layouts and controlled visual update paths.

Not claimed complete in this pass: free drag-reordering, command palette,
context menus, per-panel screenshot export, browserless fullscreen, layout undo,
adaptive tab replacement at narrow widths, user-defined KPI slots, advanced
annotation level-of-detail and separate rendering-priority scheduling. Those
remain follow-on work because they require independent interaction and browser
acceptance rather than cosmetic flags.

## Validation

Pre-release checks:

```text
web typecheck: PASS
web unit tests: PASS (266/266)
web production build: PASS
API typecheck: PASS
API unit tests: PASS (264/264)
API build: PASS
canonical repository gate: PASS
git diff --check: PASS
```

Production browser and deployment evidence is appended after the pushed master
release is deployed. No database migration, collector, strategy calculation,
alert eligibility, paper/live order permission or V2 default was changed.

