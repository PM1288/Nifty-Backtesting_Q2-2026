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

## Deployment

- Application commit `42404a5` is pushed to canonical `master`.
- Only `n50-dashboard` was rebuilt and recreated. API, PostgreSQL, collectors
  and other services were not restarted.
- Deployed image:
  `sha256:dfad2f4589b54f2dcd063d029ea00a2e2085794144f92c06547134fcd94c3388`.
- Container health: healthy, zero restarts. Public `/n50/` and
  `/n50/api/health` both returned HTTP 200.
- Authenticated deployed Chromium: 44/44 executable checks PASS, zero FAIL;
  headed DPR2 canvas crispness remains BLOCKED because headless Chromium
  exposes 1:1 backing dimensions even while reporting DPR2.
- Deployed geometry: underlying host/native 784.23/784.23 CSS px; CE/PE
  615.77/615.77 CSS px. Plot bodies are 601.22/267.22/267.22 CSS px.
- Deployed performance: 500 pointer moves p95 17 ms with no request or
  hydration on hover; cached timeframe switch 108 ms.
- Runtime evidence:
  `/tmp/scalper-v2-workstation-deployed-42404a5/` (not committed).
- Rollback image:
  `trading-stack-n50-dashboard:pre-scalper-v2-workstation-42404a5`.

## Horizontal delta-OI follow-up

The Change in OI panel now uses grouped horizontal CE/PE bars. Strike is the
category axis on the right-side Y edge; signed delta-OI is the X value axis
with a visible zero origin. Positive values are green, negative values red,
observed zero neutral, and CE/PE identity remains blue/yellow through borders.
Missing comparisons remain null and the existing baseline-unavailable state is
shown instead of an empty or fabricated chart.
