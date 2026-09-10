# Scalper V2 workstation and native drawings — 10 September 2026

## Outcome

The two specifications in `/home/novius2/NIFTY50/new-lib` were read in full
and applied to the existing `view=scalper_v2`. No third terminal was created;
the existing V1 route remains available.

- Native Lightweight Charts series primitives render horizontal line/ray,
  vertical line, trend line/ray, parallel channel, rectangle, Fibonacci,
  text, free measurement, and long/short risk-reward objects.
- Drawings store canonical UTC chart time and instrument-local price. Canvas
  coordinates are projected only at render time, so resize, pan, zoom, price
  scale changes and cached timeframe switches do not rewrite domain anchors.
- One-point tools use click placement and multi-point tools use drag placement.
  Selected anchors can be dragged; locked objects reject dragging.
- The Objects inspector supports select, hide/show, lock/unlock, duplicate,
  delete, colour, width, line style, label, keyboard Delete, undo and redo.
- Non-sensitive drawing recovery is namespaced by Scalper V2 and symbol in
  browser local storage. Complete JSON includes drawings and labels this
  persistence truthfully as local workspace recovery.
- Current-OI rankings now retain CE1/CE2/CE3 and PE1/PE2/PE3. Ranking remains
  magnitude-first, deterministic, duplicate-safe and independent of which
  levels are inside the observed price range.
- Candle and EMA hydration uses incremental `series.update()` for revised-last
  and append-only data. Prepend, truncation, older corrections and context
  changes use `setData()`. Pointer movement never hydrates a series.

## Preserved contracts

V7 signals and state identities are unchanged. A/B remains exact A-open to
B-close with its exact pair context. OI and signed delta-OI keep separate
labelled Y axes; missing baseline is not zero. Existing APIs, collectors,
PostgreSQL schema, authentication, exports, read-only permissions, Trade Log,
SHAP Research, monthly views and V1 are unchanged. No broker subscription,
order path, synthetic quote, inferred IV, invented exit or proprietary
position was added.

## Source-limited items

The endpoint supplies one retained multi-strike chain snapshot plus time
history for the selected exact pair. It does not supply a timestamped
multi-strike chain cube. A truthful time-strike heatmap and historical
rank/profile replay therefore remain unavailable; latest chain evidence stays
separate from cursor-time candles. The tested chain has no comparable delta-OI
baseline (`0/20`), so the UI shows `Baseline unavailable` instead of fake bars.

No authorised account/proprietary-book position source is connected. Selected
pair, V7 entry reference, risk/reward drawing and actual holding remain
separate. Server drawing sync was not invented; local recovery is labelled.

## Verification

- Web typecheck: PASS.
- Web tests: PASS, 137/137.
- Web production build: PASS, 2,569 modules.
- API typecheck/tests/build: PASS, 193/193.
- Authenticated local Chromium: 44/44 executable checks PASS; the existing
  headed-DPR2 visual check is BLOCKED by the headless environment.
- Drawing create, anchor drag, duplicate, undo and reload persistence: PASS.
- Geometry: underlying host/native 773.03/773.03 CSS px; CE/PE
  606.97/606.97 CSS px. Plot bodies 601.22/267.22/267.22 CSS px.
- 500 pointer moves: p95 17.3 ms, zero trading-analytics requests and unchanged
  hydration counters. Cached 1m switch: 155 ms.
- Runtime evidence: `/tmp/scalper-v2-workstation-drawings-final/` and
  `/tmp/scalper-drawing-visible.png`; neither is committed.

Deployment is recorded after the canonical gate, commit, push,
dashboard-only rebuild, health checks and deployed browser rerun.
