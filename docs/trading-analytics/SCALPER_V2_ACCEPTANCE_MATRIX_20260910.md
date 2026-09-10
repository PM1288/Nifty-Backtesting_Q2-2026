# Scalper V2 repair acceptance matrix

Date: 10 September 2026

Scope: follow-up verification and completion pass on the existing
`view=scalper_v2`. This is not a third renderer. V1, V7 calculations, the
A-open/B-close formula, APIs, collectors and order permissions are unchanged.

## Additions in this pass

- Added explicit `Fit day`, `Last 30` and `Last 60` horizontal views. An
  ordinary data refresh cannot reapply a range request that was already used.
- Added Session, Visible and Manual Y modes plus an independent Y lock. All
  three price charts retain their own scale.
- Captured the exact panes, interval, symbol, expiry and strike when A is set.
  A/B arithmetic therefore does not rebind when only the display timeframe
  changes. Exact A/B dropdowns supplement chart-click selection.
- Added a selected-pair metric matrix for provider OI, retained-baseline
  delta OI, IV and bid-ask spread. Missing values remain dashes.
- Made Selected and ATM identities independent and added a qualified nearest
  strike spot guide to the strike/payout charts.
- Added chart hydration counters and expanded browser checks for no `setData`
  on hover, profile coordinates, range presets, Y modes, DPR2 sizing and 20
  V1/V2 mount-unmount cycles.
- Historical cursor prices remain exact. Because the current endpoint supplies
  no retained historical chain series for this context, the UI now says that
  OI/PCR/payout are latest retained snapshot evidence instead of presenting
  them as historical.

## Evidence

- Web typecheck: PASS.
- Web tests: PASS, 129/129.
- Local authenticated browser suite: PASS 37/37 executable checks; one
  environment limitation recorded separately. Headless Chromium, 1920x1080,
  DPR1 pointer profile: 500 moves, p95 17.3 ms; zero chart/context requests and
  unchanged three-series `setData` counters during the pointer loop. Cached
  1m switch: 156 ms in the recorded run.
- Geometry in the recorded local run: underlying 801.03 px host/native and
  601.22 px body; CE/PE 628.97 px host/native and 267.22 px bodies; native time
  axes 28 px.
- Ignored runtime evidence: `/tmp/scalper-v2-completion-local-10/`. It must not
  be committed.
- Deployed authenticated browser suite: PASS 37/37 executable checks with the
  same single headed-DPR limitation. Runtime evidence:
  `/tmp/scalper-v2-completion-deployed-0b073f3/`.

## Honest 70-check status

`PASS` means covered by current unit, browser or direct code evidence. `BLOCKED`
means the required source or headed-browser capability was unavailable.
`NOT_RUN` means the narrower interaction was not executed. No synthetic result
is represented as live-market proof.

| ID | Status | Evidence or remaining condition |
|---|---|---|
| 001 | PASS | Host/native widths reconcile within 2 px for all three charts. |
| 002 | PASS | Native time axes remain inside measured bodies. |
| 003 | PASS | V2 native cells have zero inherited min-width/padding. |
| 004 | BLOCKED | DPR2 geometry passes; headed visual crispness remains required because headless exposes 1:1 canvas backing dimensions. |
| 005 | PASS | Underlying 601 px; CE/PE 267 px in desktop evidence. |
| 006 | PASS | 37 px tab track and independently scrolling rail body. |
| 007 | PASS | Browser-measured workspace/analytics gap is within 16 px. |
| 008 | BLOCKED | 1440/1366/1024/390 widths pass without horizontal overflow; 200% headed zoom not run. |
| 009 | PASS | Independent OHLC-only range fixture and chart instances. |
| 010 | NOT_RUN | Fit-day and Last-30 transition pass; full first/last-bar assertion at all four intervals not separately recorded. |
| 011 | NOT_RUN | Cutoff replay with later extrema was not available in this browser run. |
| 012 | PASS | Inclusive raw session eligibility unit test passes. |
| 013 | PASS | Flat-session two-tick fixture passes. |
| 014 | PASS | Manual, lock and explicit Session reset state pass in browser. |
| 015 | NOT_RUN | Session/expiry/contract leave-and-return restoration not exercised as one sequence. |
| 016 | PASS | Indicators calculate from retained history before day slicing; parity tests pass. |
| 017 | PASS | Shared time with three instrument-local values verified. |
| 018 | PASS | CE-origin reverse link verified. |
| 019 | PASS | Hover clear returns the workspace to Latest. |
| 020 | PASS | Locked time survives pointer leave/tab change; Escape unlocks. |
| 021 | PASS | Numerical grid changes with selected exact time. |
| 022 | NOT_RUN | Exact missing-bar behaviour has unit evidence, but no browser fixture in this pass. |
| 023 | NOT_RUN | Mixed-interval unfinished-bar browser fixture was unavailable. |
| 024 | NOT_RUN | Linked absolute-time range code exists; origin-by-origin drag sequence not recorded. |
| 025 | NOT_RUN | Suppression guards exist; callback-token trace was not captured. |
| 026 | PASS | 500 moves leave all three `setData` counters unchanged. |
| 027 | NOT_RUN | Measurement/click-lock conflict sequence not separately automated. |
| 028 | NOT_RUN | Boundary label screenshot inspection remains manual. |
| 029 | PASS | Latest spot is explicitly qualified against its nearest listed strike. |
| 030 | PASS | Strike hover updates underlying guide without changing selected strike. |
| 031 | BLOCKED | Endpoint supplies no eligible historical chain snapshots for switching in the tested context. |
| 032 | PASS | Historical chain absence is explicit; latest snapshot is not relabelled historical. |
| 033 | PASS | OI, delta OI, PCR and payout retain separate named units. |
| 034 | PASS | Single PCR observation is a dated value card, not a trend. |
| 035 | BLOCKED | No multi-snapshot same-scope PCR history was supplied. |
| 036 | PASS | Analytics memoize by data inputs; hover does not hydrate series. |
| 037 | PASS | Profile local coordinates reconcile within 2 px. |
| 038 | NOT_RUN | Headed price-axis drag/video evidence not captured. |
| 039 | PASS | Profile lane is capped at 180 px and 22% of plot. |
| 040 | PASS | 1:2:0/null width fixture passes. |
| 041 | PASS | Delta bars retain sign colour and CE/PE outline identity. |
| 042 | PASS | Rank-before-range behaviour is preserved. |
| 043 | PASS | Ranking tie/deduplication tests pass; scope is disclosed. |
| 044 | PASS | JSON/CSV scope is explicit; Health documents that canvas screenshot export is unavailable. |
| 045 | PASS | Missing baseline state is explicit, never a zero chart. |
| 046 | PASS | Partial comparison coverage is reported. |
| 047 | PASS | Missing and observed zero remain distinct in helpers/rendering. |
| 048 | NOT_RUN | Rapid late-response browser fixture was not executed; React Query keys are context-specific. |
| 049 | PASS | Incomplete PCR cohort unit test returns unavailable. |
| 050 | BLOCKED | Knowledge-time eligibility cannot be proven without collected-at metadata in this endpoint. |
| 051 | PASS | Selected, ATM and hovered identities are distinct. |
| 052 | BLOCKED | No authorised account/ledger position source is connected; UI truthfully shows no source. |
| 053 | BLOCKED | No strike-level Pro source exists; aggregate participant evidence remains separate elsewhere. |
| 054 | PASS | V7 helper and parity tests are unchanged. |
| 055 | NOT_RUN | Actual-fill/exit fixture unavailable; no exit is invented. |
| 056 | PASS | Canonical A-open/B-close unit tests pass. |
| 057 | PASS | A/B values persist across a display-timeframe switch in browser. |
| 058 | PASS | Candle direction, identity and signed-value colours remain separate. |
| 059 | PASS | 500-move p95 17.3 ms on the recorded machine. |
| 060 | PASS | Zero trading-analytics network requests during pointer loop. |
| 061 | PASS | Cached redraw 156 ms in recorded run. |
| 062 | PASS | Twenty V1/V2 cycles retain exactly three V2 native roots while mounted. |
| 063 | PASS | Indicator/signal/ranking inputs are memoized; cursor uses indexed rows. |
| 064 | PASS | Active interval paints first; prefetch is bounded and absent from hover path. |
| 065 | PASS | V1 route remains separate and reachable. |
| 066 | PASS | Complete nested chart/source/measurement JSON and chain CSV remain available. |
| 067 | NOT_RUN | Basic controls are semantic; complete keyboard/high-legibility/200% audit not rerun. |
| 068 | BLOCKED | Unit/build/gate and browser checks are required again after final commit/deployment; headed checks remain blocked. |
| 069 | PASS | Diff contains no API, collector, order or strategy change. |
| 070 | PASS | This matrix records PASS/BLOCKED/NOT_RUN separately from deployment state. |

## Source limitations

Historical chain/PCR switching, knowledge-time eligibility and account position
rendering cannot be completed truthfully from the current tested response.
Those are data-contract/source prerequisites, not values to infer in the UI.
The exact-price cursor, selected pair, latest retained OI evidence and no-source
states remain usable without fabrication.

## Release

- Application commit: `0b073f3` on pushed canonical `master`.
- Dashboard image:
  `sha256:4dd54f6b686d9169fd1846cc989e6dfe45209c37239c0a2195b3a707748a4fee`.
- Only `trading-stack-novius2-n50-dashboard-1` was recreated. It is healthy,
  has zero restarts, and public `/n50/` and `/n50/health` return HTTP 200.
- Rollback image:
  `trading-stack-n50-dashboard:pre-scalper-v2-acceptance-0b073f3`.
- The first public checks during proxy reconnection returned 502; five seconds
  later both routes returned 200 and remained healthy. No unrelated container
  or volume was changed.
