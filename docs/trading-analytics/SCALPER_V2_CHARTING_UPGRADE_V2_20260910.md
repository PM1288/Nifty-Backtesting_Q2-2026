# Scalper V2 charting-upgrade v2 — 10 September 2026

## Scope delivered

All three Markdown files in `/home/novius2/NIFTY50/Charting-upgrade` were read
against the canonical application. They describe a staged workstation programme,
not one safe atomic release. This pass implements the specification's immediate
Stage 2 exit condition: one complete, genuine trendline interaction in the
existing `view=scalper_v2` before expanding the broader strategy, screener,
research or execution surface.

- Multi-anchor drawings now use deliberate click-by-click placement. The first
  anchor opens a native preview; the final click commits exactly one object.
- Escape, right-click, pointer cancellation, window blur and tool changes cancel
  uncommitted gestures and restore chart navigation.
- Endpoint handles retain priority. A drawing body can now be dragged as one
  object; both anchors are recalculated from the original screen transform rather
  than accumulated pointer deltas.
- Drawing gestures temporarily own pointer navigation, then restore pan/scale.
  Locked and hidden objects retain their prior semantics.
- The Objects inspector has an exact UTC-second and instrument-local price editor
  plus colour, width, line and label editing. Apply is one undoable command.
- Segment/ray hit testing is measured in CSS pixels and handles degenerate
  geometry without division by zero. Fibonacci includes the requested 0.786 line.
- Existing local symbol-scoped recovery, duplicate, hide/show, lock/unlock,
  delete, undo/redo and complete JSON export remain available.

No chart library, API, database, collector, broker connection or order path was
added. V1, V7 signals, exact option identity, A-open/B-close arithmetic, Trade
Log, SHAP Research, monthly strategies and OI/Delta-OI views are unchanged.

## Verification before release

- Web typecheck: PASS.
- Web tests: PASS, 140/140.
- Web production build: PASS, 2,570 modules.
- API typecheck/tests/build: PASS, 193/193.
- Canonical repository gate: PASS.
- Authenticated Chromium against the production web build and authorised live
  API: 51/51 executable checks PASS, zero FAIL; headed DPR2 canvas crispness is
  BLOCKED in the headless environment.
- Drawing evidence: preview, Escape cancellation, two-click commit, endpoint
  drag, whole-object drag, exact coordinate edit, duplicate, undo and reload
  persistence all PASS.
- Geometry: underlying host/native 773.03/773.03 CSS px; CE/PE
  606.97/606.97 CSS px. Plot bodies 601.22/267.22/267.22 CSS px.
- Performance proxy: 500 pointer updates p95 17 ms, zero hover requests and
  unchanged chart hydration counters. Cached 1m switch: 105 ms.
- Runtime evidence (not committed): `/tmp/scalper-v2-charting-upgrade-v2/`.

## Production release evidence

- Application commit `6b85d04` was pushed to
  `origin/feat/scalper-v2-charting-upgrade-v2` and deployed through the
  repository dashboard deploy script.
- Dashboard image:
  `sha256:d6d8b3d3c1183a98c4c5d07a99a59f2b9458d7338beaf976ce25bf01e44d6a55`.
  Rollback image:
  `trading-stack-n50-dashboard:pre-charting-upgrade-v2-6b85d04`.
- Only `trading-stack-novius2-n50-dashboard-1` was recreated. It is healthy,
  running with zero restarts. Local gateway root/health/Scalper V2 and public
  root/health/Scalper V2 all return HTTP 200.
- The deploy script's first route probe received HTTP 502 during container
  startup. Subsequent checks recovered to HTTP 200; container logs show normal
  Redis connections, API startup and successful health requests.
- Authenticated Chromium against the deployed gateway: 51 executable checks
  PASS, zero FAIL and one BLOCKED. The only blocked check is headed DPR2 canvas
  crispness because the headless renderer reports 1:1 backing dimensions.
- Deployed geometry: underlying host/native 784.23/784.23 CSS px, CE/PE
  615.77/615.77 CSS px; plot bodies 601.22/267.22/267.22 CSS px. OI unit axes,
  the right-side strike Y-axis, horizontal signed Delta-OI bars and profile
  alignment all PASS; maximum measured profile error was 0.005 CSS px.
- Deployed performance proxy: 500 pointer moves p95 16.90 ms, zero hover API
  requests, unchanged hydration counters and 123 ms cached 1m switch.
- Runtime evidence (not committed):
  `/tmp/scalper-v2-charting-upgrade-v2-deployed-6b85d04-final/`.

## Explicit remaining stages

The documents' complete drawing suite validation, server-owned multi-account
workspace persistence, Strategy Lab, five historical OI modes, screeners,
portfolio/alert engine and source-backed company research are separate staged
deliverables. They are not represented as complete by this pass. Missing
authorised historical chain cubes, account position sources and analyst data
remain unavailable rather than fabricated.
