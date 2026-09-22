# Scalper V3 live cockpit — P3 implementation pass

Date: 22 September 2026  
Scope: `view=scalper_v3` only  
Canonical source: `/home/novius2/trading-stack`

## Outcome

This pass adds a bounded live/interactive layer to the existing V3 grid. It
does not change Scalper V2, market data, strategy calculations, option
selection, alerts, exports, drawings, measurements or order permissions.

Implemented:

- interval-aware `LIVE`, `DELAYED`, `STALE` and `CLOSED` states derived from
  the latest real underlying observation; missing data is never labelled live;
- a restrained two-pixel `NOW` edge on V3 native price panes, with no candle or
  container animation;
- a 220ms value-only up/down flash when the latest completed price changes;
- a two-pixel session-progress line in the V3 command bar;
- one global comparison reference: previous close, session open, 15m, 5m or a
  pinned cursor;
- click sets comparison point A; Shift-click sets B; the shared strip reports
  NIFTY, exact CE, exact PE, selected CE OI, selected PE OI and net tracked OI
  changes. Historical OI remains unavailable where no retained observation
  exists;
- causal lookup (`at or before`) for retained comparison evidence, never a
  future or nearest-after substitution;
- direct strike locking plus Up/Down one-strike navigation and Escape clear;
- Left/Right one-candle navigation, Shift+Left/Right five-candle navigation,
  Home session-open and End latest;
- strike inspector distance from spot, five-minute OI velocity and factual
  acceleration arrows;
- brief changed-strike highlighting in OI, Delta OI and Strike Structure after
  a new profile revision;
- one-line largest absolute Delta OI header action;
- a one-second `ATM shifted` indication when the actual nearest strike changes;
- Space-triggered three-second `What changed` overlay based on the selected
  global comparison reference;
- all new interactions documented in the existing keyboard-help overlay.

## Truth and performance boundaries

- The feed age is observation age, not HTTP request age.
- The current implementation receives completed interval candles; it does not
  invent intra-candle ticks or interpolate prices between server observations.
- OI comparisons use retained option-history/cumulative-chain timestamps. A
  missing historical contract observation renders `—`, never zero.
- Changed-strike emphasis is a short ECharts highlight action. It does not
  rebuild analytical options or issue a network request.
- The five-second age clock updates status text and session progress. Market
  data queries retain their existing bounded polling cadence.
- CE remains yellow and PE blue for identity; sign continues to use
  green/red. Arrows accompany direction so colour is not the sole encoding.

## Not claimed in this pass

The supplied P3 catalogue is a long-term interaction backlog rather than one
atomic acceptance case. This pass does **not** claim delivery of draggable A/B
boundaries, free range brushing, contract switching on strike double-click,
activity rails, event/bookmark persistence, an event timeline drawer,
right-click menus, draggable reference lines, live forming-candle mutation,
current-price ghost trails, candle countdown rings, volume-percentile alerts,
regime bands, 60fps modifier scrubbing or alert acknowledgement. Those require
separate native-chart primitives, event storage and authenticated live-session
acceptance.

## Verification

Pre-release evidence:

```text
focused V3 helper tests: PASS (5/5)
web typecheck: PASS
web full unit tests: PASS (271/271)
web production build: PASS
API typecheck: PASS
API full unit tests: PASS (264/264)
API production build: PASS
canonical repository gate: PASS
git diff --check: PASS
```

Release evidence:

```text
canonical master release: 0ecf61d
production container health: healthy
production entry asset: /n50/assets/index-D1KB-WDD.js
production image: sha256:d404058d2c4c7dd2f00602fac28a4d2b2eaa6425b1497b496f2d0ace15017c09
rollback image: trading-stack-n50-dashboard:before-scalper-v3-p3-20260922
linked-workspace browser audit: PASS (16/16)
focused P3 browser audit: PASS (11/11)
uncaught browser page errors: 0
```

Authenticated production screenshots and machine-readable results:

- `/tmp/scalper-v3-live-cockpit-p3/desktop-1920-v3-p3-live-cockpit.png`
- `/tmp/scalper-v3-live-cockpit-p3/desktop-1920-v2-preservation.png`
- `/tmp/scalper-v3-live-cockpit-p3/results.json`
- `/tmp/scalper-v3-linked-workspace/desktop-1920-v3-linked.png`
- `/tmp/scalper-v3-linked-workspace/desktop-1920-v2-preserved.png`
- `/tmp/scalper-v3-linked-workspace/results.json`

The production audit ran after market hours. The dashboard correctly reported
`CLOSED` and the age of the latest retained observation; it did not claim a
live feed. Selected CE/PE historical candles were unavailable for the selected
contracts in that retained session, so their comparison values remained `—`.
The browser audit still verified exact linked-time propagation, retained OI
comparison, A/B selection across linked charts, strike pinning/navigation and
V2 isolation. Live-session animation cadence remains untested outside market
hours.
