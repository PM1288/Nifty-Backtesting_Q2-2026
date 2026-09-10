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

## Explicit remaining stages

The documents' complete drawing suite validation, server-owned multi-account
workspace persistence, Strategy Lab, five historical OI modes, screeners,
portfolio/alert engine and source-backed company research are separate staged
deliverables. They are not represented as complete by this pass. Missing
authorised historical chain cubes, account position sources and analyst data
remain unavailable rather than fabricated. No deployment is claimed in this
pre-release record.
