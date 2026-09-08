# MANEESH aligned candlestick terminal V3

Date: 8 September 2026

Route: `/strategy/trading-analytics?view=scalper`

Branch: `ui/maneesh-terminal-v3`

Feature gate: existing `N50_TRADING_ANALYTICS_ENABLED` / `VITE_TRADING_ANALYTICS_ENABLED`

## Source-pack review

The implementation reviewed the Markdown, JSON, approved reference image, and
both ZIP archives in `/home/novius2/NIFTY50/UI`. The useful product direction was
adopted additively; archive source was not copied over the canonical application.

The source pack calls for a compact, chart-first scalping terminal with synchronized
NIFTY, exact CE and exact PE candles; OI and signed change in OI; RSI and MACD;
strict session levels; a price-aligned OI profile; and an evidence rail. It also
requires missing observations to remain missing and the workspace to remain
research-only. Those are the governing contracts for this change.

The handover names both Lightweight Charts and KLineCharts. The canonical repo had
ECharts but no KLineCharts integration. This implementation preserves the complete
classic ECharts renderer and adds only `lightweight-charts@5.2.1` for the aligned
terminal. It does not claim or carry an unreviewed KLineCharts integration or the
archive's broad third-party package inventory.

## Implemented visual system

- The default `renderer=aligned` presents one synchronized Lightweight Charts
  workspace with seven price/indicator panes and one shared time scale.
- Pane 1: NIFTY green/red candlesticks, EMA9, selected-day levels, optional 50-point
  round guides, and explicitly indicative max-pain references.
- Panes 2 and 3: exact selected CE and PE green/red candlesticks with EMA9. CE uses
  blue identity labels and PE uses yellow identity labels; identity colour does not
  override candle direction semantics.
- Panes 4 and 5: provider-native CE/PE outstanding OI and signed interval change in
  OI. Missing endpoints are gaps and are labelled unavailable.
- Panes 6 and 7: RSI 14 with 30/50/70 references, and MACD 12/26/9 with signal and
  signed histogram.
- A synchronized cursor exposes exact OHLC and indicator values in the evidence
  rail. Charts pan and zoom using the library's native interaction.
- The selected CE/PE ladder, PCR, A/B measurement, setup references, strict levels,
  max-pain scope, source counts and coverage remain visible in a compact inspector.
- The NIFTY price pane includes a proportional, price-coordinate-aligned CE/PE OI
  profile. It is an application-owned DOM overlay computed from observed strikes;
  it is not represented as a native series and never creates missing strikes.
- `renderer=classic` preserves the previous complete ECharts workbench as an
  immediate URL rollback and comparison view.

## Measurement and research semantics

The fixed-pair A/B tool remains browser-memory only. A is the selected completed
candle's actual **open** and B is the selected completed candle's actual **close**.
The overlay draws the same A-to-B interval independently in the NIFTY, exact CE and
exact PE panes when those exact timestamped bars exist. The table and inspector use
the same source rows. Quantity remains editable with 65 as the visual default.
The resulting CE+PE amount is illustrative long-both-legs price change before
costs/slippage; it is not Greek delta, an order, or booked P&L.

`NIFTY_EMA9_BODY70_NEXT_OPEN_V3` is implemented only as a closed-bar research
reconstruction. CALL uses prior close below EMA, a bullish body crossing EMA with
at least 70% above it, and the immediate next scheduled bar open strictly above the
setup EMA. PUT uses prior low above EMA and the symmetric bearish rule. Missing
immediate bars are never skipped. The output is a labelled chart/reference event;
it does not enable paper or broker execution.

## Data integrity and present source evidence

All values continue to come from the existing Trading Analytics API. No ingestion,
strategy calculation, source precedence, database, paper ledger or execution policy
changed. The current validation snapshot returned retained underlying minutes but
zero exact CE/PE source minutes for the selected `2026-09-15` expiry. The new UI
therefore rendered `CANDLES UNAVAILABLE`, `OI ... UNAVAILABLE`, and em dashes for
those legs while retaining the healthy NIFTY chart. This is the intended behavior;
the UI did not splice another option, roll ATM, or synthesize zero.

Session support/resistance is plotted only when it falls inside the selected day's
observed NIFTY low/high. Off-range levels remain listed in the inspector with their
exact value and `outside range`; they cannot flatten the candle scale.

## Validation matrix

- TypeScript and production build cover the lazy renderer boundary and library API.
- Unit tests cover strict level range boundaries, OI-profile proportional width,
  CALL/PUT Body70 rules, exact next scheduled bar, strict equality failure, missing
  immediate bar, 69.99% boundary and doji rejection.
- Authenticated browser tests cover 1920x1080, 1440x900, 1024x768 and 390x844,
  aligned-default URL state, seven rendered panes, required evidence labels,
  responsive geometry, no page-level horizontal overflow and browser errors.
- Generated screenshots and `validation.json` remain untracked under
  `output/ui-validation/aligned-terminal-v3/`.

The source pack contains a 140-case acceptance catalogue. It is a forward test
inventory, not evidence that 140 production cases have run. Only the automated
checks recorded above and in `AGENT_HANDOFF.md` are claimed by this release.

Final release evidence:

- Web: typecheck passed, production build passed, **92/92** tests passed.
- API preservation: typecheck passed, build passed, **187/187** tests passed.
- Canonical repository gate: passed.
- Authenticated local-Vite browser validation: **4/4 viewports** passed.
- Authenticated deployed-gateway browser validation: **4/4 viewports** passed.
- Authenticated public browser validation: **4/4 viewports** passed.
- Each browser case verifies the aligned renderer default, at least seven chart
  canvases, evidence labels, no page-level horizontal overflow, A-open/B-close
  status text and a price-coordinate measurement rectangle.
- Public/local analytics-provider CSP messages are excluded by exact provider and
  directive patterns; the Chromium environment's transient `ERR_NETWORK_CHANGED`
  resource message is also ignored after authenticated route/data assertions.
  Application JavaScript errors and functional failures remain test failures.

## Deliberate limitations

1. Historical IV/PCR series are not exposed by the current chart endpoint, so the
   chart does not invent IV/PCR time-series panes. Current window PCR remains in the
   evidence rail.
2. Max pain is the existing selected-window indicative value, not certified full
   historical chain max pain.
3. The current selected expiry lacks retained exact CE/PE minutes in the validation
   snapshot. Exact option panes recover automatically when the source returns them.
4. The OI profile uses a price-coordinate DOM overlay rather than a custom
   Lightweight Charts primitive; its source and proportional values are still
   deterministic and tested.
5. Body70 markers are retrospective closed-bar references. A live next-open event
   processor, persisted signal lifecycle and order eligibility are outside this UI
   change and remain disabled.
6. KLineCharts was absent from the canonical repository and was not added merely to
   satisfy an archive package list. The classic ECharts renderer remains preserved.

## Rollback

For a user-level rollback, add `renderer=classic` to the Scalper URL. For a release
rollback, revert the scoped commit and rebuild only `n50-dashboard`. The existing
feature gate can disable the entire Trading Analytics workspace. No database or API
rollback is required.
