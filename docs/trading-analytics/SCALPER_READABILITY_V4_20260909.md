# MANEESH aligned Scalper readability V4

Date: 9 September 2026
Route: `/strategy/trading-analytics?view=scalper`
Scope: frontend chart lifecycle, presentation and inspector only

## Pre-change audit

- Canonical renderer: `AlignedScalperTerminal.tsx`, using the locked
  `lightweight-charts` 5.2.1 dependency.
- The chart was recreated when candles, cursor-related callbacks, measurement,
  levels, indicators, OI, PCR or layer state changed.
- The resize observer called `fitContent()`, overwriting user navigation.
- Five panes used stretch weights `[4, 1.5, 1.5, 1.1, 1.15]`; no readable pixel
  minimum protected the exact CE/PE panes.
- Outstanding OI and signed interval delta OI shared pane 3. IV, pair PCR, RSI,
  MACD, signal and MACD histogram shared pane 4 despite incompatible units.
- Latest IV was a single snapshot but was rendered as a chart series.
- Selected premiums were 15px and OI, delta and IV were embedded in one 9px
  sentence. Cursor OHLC changed while other inspector values remained latest.
- The OI profile used proportional widths but a fixed 300px overlay height.
- V7 signal rule and browser measurement are already canonical. V7 remains
  `FNO_PAIRED_EMA9_POSITION_BODY70_NEXT_OPEN_V7`; measurement remains exact
  A-candle open to exact B-candle close for underlying, CE and PE.

## Preservation map

| Existing evidence/control | V4 destination | Export |
|---|---|---|
| Underlying/date/interval/strike/expiry | Parent command bar and sticky inspector identity | Existing complete chart JSON/CSV |
| Exact underlying, CE and PE candles | Three mandatory native price panes | Existing candle CSV/full response |
| EMA9 | Owning price pane and numerical Snapshot section | Existing bar fields |
| Current OI | Dedicated OI pane and CE/PE metric matrix | Full response |
| Interval and cumulative delta OI | Dedicated delta pane selector and metric matrix | Full response |
| IV | Timestamped inspector value; no fabricated history | Full response/current chain |
| Pair PCR | Inspector summary; optional independent PCR pane | Full response |
| RSI and MACD | Independent optional panes and Snapshot section | Existing calculated evidence |
| D/W/M resistance/support and max pain | Strict in-session underlying overlays and complete Levels section | Full response |
| V7 setup/reference states | Rules section and unchanged native markers | Existing observation/evidence export |
| A/B, quantity and pair result | Measure section and unchanged domain anchors | Existing evidence controls |
| Strike ladder | Chain section with all supplied paired strikes | Full response |
| Source rows/coverage/limitations | Persistent issue count and Health section | Complete JSON |
| Classic ECharts/KLine alternatives | Existing renderer control and routes | Unchanged |

No formula, source precedence, API meaning, database value, order permission,
paper lifecycle, alert delivery or execution path is changed by this work.

## Validation

Implemented on branch `feat/scalper-readable-inspector-v4`.

### Recorded checks

- Web typecheck: PASS.
- Web tests: PASS, 117/117.
- Web production build: PASS.
- API typecheck: PASS.
- API tests: PASS, 190/190.
- API build: PASS.
- Authenticated local-Vite/live-API browser suite: PASS, 41/41.
- Browser dimensions exercised: 1920×1080, 1440×900, 1366×768 and
  390×844. The checks include pane pixel geometry, internal chart scrolling,
  28px selected premiums, chart-root stability across cursor/divider/refetch,
  separate analytical panes, all inspector sections, responsive sheet,
  Escape/focus restoration, OI profile modes, page overflow and runtime
  errors. The expanded second-pass checks also cover labelled pane readouts,
  TradingView attribution, Session/Visible price-range changes, Price focus and
  Full analysis presets, 50 repeated layer toggles without chart recreation,
  native price-axis/profile alignment, persisted pane sizes, ladder metric
  switching and presentation-state isolation.

## Full-brief verification additions

- Presentation preferences use the versioned
  `n50.scalper.aligned.presentation.v4` key. Only inspector width/section, pane
  heights/visibility, range mode, ladder view and number presentation are
  stored; instrument, quote, contract and measurement data are excluded.
- Price focus and Full analysis are explicit reversible presets. RSI, MACD and
  selected-pair PCR are added/removed through the stable chart registry; 50
  repeated toggles retain one chart root.
- Session and Visible-candles ranges are explicit. Existing per-instrument
  manual limits now reach the aligned renderer rather than applying only to the
  classic renderer.
- Pane readouts use labelled O/H/L/C/EMA cells. Snapshot actions copy raw
  structured values and focus the exact chart time.
- The strike ladder switches between premium, current OI and snapshot delta OI
  without changing the selected pair. Compact/exact OI display is a persisted
  presentation preference.
- Export actions separately provide candle CSV, OI-observation CSV, complete
  aligned evidence JSON and measurement JSON. Fullscreen retains the same
  read-only component.
- OI profile coordinates are refreshed during price-axis/pane gestures and use
  the underlying series coordinate conversion. The displayed scale maximum is
  explicit.
- The official TradingView attribution logo is retained in normal and
  fullscreen rendering.

Browser evidence:

`output/playwright/scalper-v4-local-20260909/`

- `screenshots/scalper-v4-1920x1080.png`
- `screenshots/scalper-v4-1440x900.png`
- `screenshots/scalper-v4-1366x768.png`
- `screenshots/scalper-v4-390x844.png`
- `screenshots/scalper-v4-separated-analytics-1920x1080.png`
- `acceptance-results.json`

### Visible source limitations in the tested snapshot

- Exact selected CE/PE completed-candle closes and current provider-native OI
  were available.
- Pair PCR was available only for a matching CE/PE endpoint and remained
  labelled as selected-pair PCR.
- Selected-pair interval/cumulative OI changes and IV were unavailable in the
  tested response. They render as `—`; no zero, forward-fill or synthetic IV
  history is created.
- Max pain remains a snapshot/indicative reference and is not represented as
  a historical path.
- The chart response supplies provider-native OI units, so the UI does not
  relabel them as contracts or shares.
- Bid/ask spread is not present in this retained selected-pair response. The
  metric row therefore remains explicitly unavailable rather than deriving a
  spread from unrelated fields.

Release state is recorded after the canonical gate and feature-branch commit.
Production deployment remains a separate authorised release action; this
document does not treat a local build as a production deployment.

## Production release — 9 September 2026

The verified implementation was fast-forwarded to canonical `master` at
`1c137327769f769705ee284d761d88a4a688c61c` and deployed as dashboard image
`sha256:a1b2e6059d34aa55aa1477edbd2b103708457f85c02541c38e62e1d7b8857c2b`.
The container is healthy with zero restarts. Authenticated production browser
verification passed 41/41 checks, including responsive layouts, separate OI and
delta-OI panes, inspection modes, A-open/B-close persistence, exports and axe.
Evidence is at `output/playwright/scalper-v4-deployed-20260909/`.

Rollback tag: `trading-stack-n50-dashboard:pre-scalper-v4-complete-20260909`.
