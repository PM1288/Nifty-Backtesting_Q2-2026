# Scalper V2 OI history layout repair

Date: 20 September 2026

## Outcome

The Scalper V2 price workspace retains the three price charts and its dedicated
strike-OI side pane:

- the underlying occupies the left side;
- the exact selected CE and PE remain stacked on the right;
- the compact side pane continues to show OI by strike and Change in OI by
  strike, including their PE-minus-CE difference line;
- the top price-grid height is bounded at 640 CSS px on desktop.

Only the obsolete overlay/subplot inside the underlying chart was removed. The
separate side charts were restored after the scope was clarified. The
underlying native chart keeps
the exact-source volume pane. Its normal semantic horizontal references are
limited to Today open, Yesterday close and Yesterday high when those values are
inside the raw observed-session range. Drawings and explicit A/B measurement
lines remain user-owned tools rather than automatic market levels.

## New tracked-chain history row

Two separate, equal-width charts now sit directly below the price workspace:

1. `sum(PE OI) - sum(CE OI)` versus retained snapshot timestamp;
2. `sum(PE change OI) - sum(CE change OI)` versus retained snapshot timestamp.

Both calculations use all strikes in the API's retained tracked cohort for the
snapshot. They do not claim full-exchange-chain coverage. The second chart uses
the reported comparable OI baseline; absent baselines remain unavailable and
are never replaced with zero.

Hovering either time chart publishes the nearest available underlying candle
time to the existing inspection coordinator. Underlying, exact CE and exact PE
therefore retain their own price values while sharing the inspected timestamp.
Locked time still owns the cursor until it is explicitly cleared.

## Scope boundary

This is a read-only layout and inspection repair. It does not change option
selection, strategy rules, signals, OI arithmetic, collection, orders,
permissions, exports or stored source evidence. The expanded OI analytics tab
remains available separately.

## Verification

- Focused OI-time tests cover the two independent series and exact difference
  arithmetic; 3/3 passed.
- Web typecheck, 226/226 tests and production build passed.
- API typecheck, 254/254 tests and production build passed.
- `bash scripts/verify/canonical-repository-gate.sh` passed.
- The initial local pass measured the three-price grid before the side pane was
  restored. After scope clarification, authenticated local Chromium passed
  22/22 checks and verified a bounded `300–360px` side pane containing two
  separate charts, a 640px-aligned top row, two equal history panels below, the
  shared native price cursors and no page errors.
- The latest retained weekend context had no comparable timestamped chain-total
  samples. Both new panels therefore showed explicit unavailable states. This
  proves missingness handling and layout, not a painted live-market OI line.
- A second deterministic browser run injected three labelled tracked-cohort
  fixture points at real retained candle timestamps and passed 21/21 checks,
  including painted lines and lower-chart hover propagation to the same time on
  underlying, CE and PE. The fixture validates interaction mechanics, not live
  OI data correctness.
- Browser screenshots and JSON evidence are outside Git at
  `/home/novius2/NIFTY50/evidence/scalper-v2-oi-history-layout-20260920-final/`
  and `/home/novius2/NIFTY50/evidence/scalper-v2-oi-history-layout-20260920-synthetic-pass/`.
- The original history-row repair is commit `485e3f0`; corrective commit
  `e843aba` restores the required side pane and is pushed to its feature branch
  and `master`. The
  approved dashboard-only deployment is healthy on image
  `sha256:b6d5b03b42c3170c52ca2914c702e4768ceac661aec2da144a8504473937d904`
  with entry asset `/n50/assets/index-hwv5hmyf.js`.
- Authenticated production Chromium passed 22/22 checks with no page errors.
  Production screenshots and results are outside Git at
  `/home/novius2/NIFTY50/evidence/scalper-v2-side-oi-restored-20260920-production/`.
  The production session also truthfully showed unavailable OI-history states;
  it did not fabricate lines from current-only OI.
