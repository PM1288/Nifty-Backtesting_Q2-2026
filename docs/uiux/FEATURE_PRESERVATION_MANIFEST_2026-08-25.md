# UI feature preservation manifest — 25 August 2026

## 2026-09-25 Scalper V2 tentative CE/PE WhatsApp references

- Live, exact completed-5m three-instrument EMA9 references from the selected
  underlying and independent exact CE/PE pair are sent through the authenticated
  dashboard API to a durable idempotent outbox. The scheduler sends fresh
  events to the configured `WA_MYSELF_CHAT_ID` used by OIIS; duplicate refreshes
  are suppressed and stale events are not delivered.
- Messages include the snapshot candle time (IST), exact instrument values,
  EMA9 and both option volume confirmations, and explicitly state that this is
  a tentative reference—not an order, trade, fill, target or exit. Replay and
  historical views do not enqueue alerts. Rule calculations, OIIS alerts,
  V1/V2 chart features, data collection and order permissions remain unchanged.
- Evidence: `docs/trading-analytics/SCALPER_V2_TENTATIVE_WHATSAPP_ALERT_20260925.md`.

2026-09-23 3Month live 5-minute confirmation: the Home Bull/Bear selector and
the full 3Month evidence table add one compact 5m group backed by two real,
mandatory session-anchored comparisons: current 5m close versus its open and
versus the immediately previous 5m open. Both must pass for the Home tick to be
green; Bear remains the exact inverse. Completed mode requires all five source
minutes, forming mode is explicitly labelled, missing evidence remains
unavailable, and M−3/M−2/M−1 still count as one OR condition. The live score is
now 13 (12 mandatory comparisons plus one OR group). The daily-only historical
report is not reclassified because it has no historical intraday evidence.
Evidence: `docs/strategy/THREE_MONTH_STRATEGY_20260919.md`.

2026-09-23 Scalper V2 OI unit display: one persistent command-bar toggle now
switches all visible strike, selected-pair, structure and cumulative OI/Delta-OI
values between canonical contracts and underlying-equivalent units calculated
as OI times the exact common expiry lot size. The multiplied view is disabled
for mixed lot sizes or provider-native/unverified units, and missing values stay
missing. Raw exports are preserved with additive display metadata; PCR, ranks,
percentages, max-pain candidates, positioning shares, strategies, collectors,
alerts and order permissions are unchanged. Evidence:
`docs/trading-analytics/SCALPER_V2_OI_LOT_UNIT_TOGGLE_20260923.md`.

2026-09-23 live refresh latency and OI freshness repair: the Home overview now
reads only the latest 22 daily observations per F&O equity once for its daily
indicators instead of repeatedly ranking full history. Identical concurrent
live Scalper chart/context/history requests are single-flight and briefly
reused at their existing browser cadence; historical as-of reads bypass the
cache. A fresh atomic SmartAPI option cohort supersedes stale individually
timed FULL OI quotes, while missing values remain unavailable. UI polling,
strategies, chart arithmetic, collectors, alerts, exports and order permissions
are unchanged. Evidence:
`docs/trading-analytics/LIVE_REFRESH_LATENCY_AND_OI_FRESHNESS_20260923.md`.

2026-09-23 Home and Scalper V2 stable hydration: both workspaces reserve their
final viewport while initial/deferred evidence loads, so async Home selectors
and the exact Scalper chart payload cannot collapse and re-expand the page.
Open tabs never auto-reload when a new dashboard build is detected; an explicit
Apply update action preserves user control, charts, drawings and inspection
state. Polling cadences, data, strategy calculations, routes, exports, alerts,
authentication and paper/live permissions are unchanged. Evidence:
`docs/uiux/HOME_SCALPER_STABLE_HYDRATION_20260923.md`.

2026-09-23 Scalper V2 entry-arrow and strategy-evidence repair: valid
three-instrument EMA references render as yellow directional arrows instead of
indistinct circles. Arrow direction follows each pane's actual EMA leg, so the
PE arrow is inverse to NIFTY/CE for CALL and inverse in the opposite direction
for PUT. The former Rules inspector is labelled Strategy and adds the exact
closed-bar methodology, retained exact-time correlation, and 1/3/6-bar
descriptive follow-through with explicit sample/session counts. Export JSON
retains the same strategy evidence. No missing timestamp is substituted, no
fill/P&L/target is reconstructed, and signal rules, collectors, orders,
contracts, charts, V1 retirement and permissions remain unchanged. Evidence:
`docs/trading-analytics/SCALPER_V2_ENTRY_ARROWS_AND_STRATEGY_EVIDENCE_20260923.md`.

2026-09-23 Scalper V2 index-option expiry rollover data repair: the SmartAPI
collector now keeps the front and next listed index-option expiries warm at the
same ATM ladder, including across month boundaries. This prevents the selected
CE/PE price panes from becoming empty solely because the UI correctly advances
to the next expiry after expiry day. Exact contract identity, the 3,000-token
WebSocket ceiling, OI missingness, chart/session logic, strategies and order
permissions remain unchanged. Uncollected historical candles/OI are never
fabricated. Evidence:
`docs/trading-analytics/SCALPER_V2_INDEX_EXPIRY_ROLLOVER_DATA_20260923.md`.

2026-09-22 Scalper V3 retirement: the evaluation workspace is no longer
selectable. Historical `view=scalper_v3` and `popout=scalper_v3` links are
canonicalized to the retained `scalper_v2` workstation. Scalper V2 data,
contracts, charts, drawings, measurements, exports and read-only permissions
remain unchanged. The historical V3 entries below are retained as an audit
record, not as active feature claims.

2026-09-22 Scalper V3 live-cockpit pass (historical): `view=scalper_v3` gains truthful
interval-aware feed age/state, a restrained NOW edge and price-direction flash,
one global delta reference, click-A/Shift-click-B comparison, exact retained
price/OI deltas, strike velocity, keyboard time/strike navigation,
changed-strike highlights, ATM-shift notice, session progress and a temporary
What Changed view. Missing historical values remain unavailable. V2, sources,
polling, strategy, alerts, exports, drawings, measurement and order contracts
remain unchanged. Evidence:
`docs/trading-analytics/SCALPER_V3_LIVE_COCKPIT_P3_20260922.md`.

2026-09-22 Scalper V3 linked-workspace pass: `view=scalper_v3` gains a shared
time cursor and value strip, click-to-pin time/strike, persisted Link time/Link
strike controls, paused/live-follow behavior, shared strike inspector, native
pane maximize controls, chart visibility toggles, range-trace modes, heatmap
scale control, keyboard help and persisted named layout/density presets. V2
keeps its existing DOM defaults and saved state. Missing exact candles and
historical chain values remain unavailable; no selection, calculation, export,
collector, strategy, alert or order contract changes. Evidence:
`docs/trading-analytics/SCALPER_V3_LINKED_WORKSPACE_P1_P2_20260922.md`.

2026-09-22 Scalper V3 compact evaluation: `view=scalper_v3` is an additive
presentation experiment backed by the exact Scalper V2 data, calculation,
cursor, drawing and measurement contracts. It uses a 41/37/22 synchronized
desktop grid, aligned 180px bottom strip, compact workspace selector, docked
strike inspector, auto-revealing drawing edge, hidden repeated refresh labels,
and persistent right/bottom collapse controls. V2 remains independently
selectable and its DOM, defaults and saved state are not replaced. Strategy,
collector, evidence, export and order behavior are unchanged. Evidence:
`docs/trading-analytics/SCALPER_V3_COMPACT_EVALUATION_20260922.md`.

2026-09-22 3Month Bull/Bear selector and downloadable backtest: the existing
bullish ten-gate contract remains backward compatible and gains an exact inverse
Bear evaluation. Both require all Month/Week/Day/1H/15m pairs, while M-1/M-2/M-3
remain one explicit ANY-1 group. Home exposes compact directional tick boards
and the shortlist maps qualified Bull to LONG and Bear to SHORT without order
permission. A new top-level Backtest Reports route serves the generated PDF and
complete CSV from the existing read-only StratLab artifact mount. The report
separates the requested same-day-open look-ahead scenario from causal next-day
open results and never claims unavailable historical intraday confirmation.
Evidence: `docs/THREE_MONTH_BULL_BEAR_BACKTEST_20260922.md`.

2026-09-23 3Month report period evidence: the same Bull/Bear calculations and
results now render qualification triangles on Daily, Weekly and Monthly
charts. Daily markers retain exact dates; Weekly/Monthly markers are explicit
period aggregates with event counts, not candle-direction labels. Daily charts
add month/week boundaries plus open and retrospective final-close segments.
The CSV adds complete M/W/D OHLC references without adding a PDF trade ledger
or changing strategy selection. Evidence remains in
`docs/THREE_MONTH_BULL_BEAR_BACKTEST_20260922.md`.

2026-09-23 3Month stock-wise report tables: every stock chart is immediately
followed by paginated stock summary and trade-evidence tables covering both
entry bases, causal outcomes, all six mandatory M/W/D equations, and exact
M-1/M-2/M-3 open-close OR evidence. The CSV remains available and strategy
logic is unchanged. Evidence:
`docs/THREE_MONTH_BULL_BEAR_BACKTEST_20260922.md`.

2026-09-22 Scalper V2 compact inspection and independent OI-direction entry
reference: the four right-side and three lower analytical charts expose bounded
compact tooltips and an on-demand viewport expansion which mounts only while
open. Strike Structure and Strike-by-Time Positioning expose their exact
calculation from keyboard/click-accessible information controls. The existing
V7 paired EMA rule remains unchanged; a separately identified V2 research rule
requires a fresh aggregate OI crossover, same-direction aggregate Delta-OI
pressure relative to the first session observation, a pure completed-bar EMA9
crossover, and named price-reference confirmation. Exact option premium remains
unavailable when the matching completed bar is absent. No order eligibility,
collector, API, V1, drawing or measurement behavior changes. Evidence:
`docs/trading-analytics/SCALPER_V2_TOOLTIP_EXPANSION_DIRECTION_ENTRY_20260922.md`.

2026-09-22 Paper Trading progressive hydration: `/paper-trading` retains every
canonical trade, chart, calculation, evidence field, export and detail drawer
while using an additive core read for first trade-row paint. Entry-session,
month-path and exact stop-path simulations hydrate afterward and remain
unavailable rather than zero until the complete read arrives. The default API
response remains complete and backward compatible; paper/live permissions and
all mutation guards are unchanged. Evidence:
`docs/paper-trading/PAPER_TRADING_PROGRESSIVE_HYDRATION_20260922.md`.

2026-09-22 Scalper V2 cumulative context and compact range chart: the two
tracked-chain PE-minus-CE history charts retain their raw difference arithmetic
and low/red, opening/black, high/green primary-line scale. Their component CE
yellow and PE blue dotted lines are now 70% visible, and a 30%-opacity band is
green where PE exceeds CE or red where CE exceeds PE. The formerly empty lower
right slot now contains all tracked exact-option prices in legacy range-normalised
coordinates (open 0, observed high +100, observed low -100), with selected
contracts darkest and distant strikes progressively faded. It shares the time
cursor/domain. Compact right-column value-axis labels are hidden except on the
positioning heatmap; source values, missingness, strategy, selection, refresh,
drawings, measurements and order behavior are unchanged. Evidence:
`docs/trading-analytics/SCALPER_V2_CUMULATIVE_BANDS_AND_COMPACT_RANGE_20260922.md`.

2026-09-22 Scalper V2 embedded-route scrolling: the normal Trading Analytics
route keeps its compact fixed-height application shell and stationary analytics
header, while the direct Scalper V2 child now owns the remaining viewport as a
vertical scroll container. This makes every lower chart and inspector reachable
without changing the separately validated pop-out document scroll, chart sizes,
data, cursor linkage, selection, drawings, measurements, refresh, strategy or
order behavior. Evidence:
`docs/trading-analytics/SCALPER_V2_EMBEDDED_SCROLL_REPAIR_20260922.md`.

2026-09-21 Scalper V2 pop-out scroll and cumulative-line context: the pop-out
route now owns a normal document scroll path instead of inheriting the embedded
fixed-height/hidden-overflow shell. Its two timestamp-aligned difference charts
retain the primary `PE − CE` axis and add faint dotted CE-yellow and PE-blue
component totals on a separate secondary axis. The primary difference line is
coloured by a session-relative low/red, opening/black, high/green scale without
changing its raw value or Y-axis. Missing values remain gaps; source data,
cursor linkage, Fit Day, strategy and order behavior are unchanged.

2026-09-21 Scalper V2 stable Fit Day and evidence archive: Fit Day reserves a
small session-capped logical buffer, so ordinary one-minute/five-minute candle
updates fill stable slots instead of shifting or stretching the three price panes.
The budget expands only after its buffer is consumed. The existing incremental refresh
continues without document reload. Underlying source volume is display-filtered
to the selected session so warm-up timestamps cannot shift the price pane. An authenticated five-minute weekday-session
job stores a readable full-page pop-out PNG and the matching exported JSON in
`/home/novius2/NIFTY50/00-Screnshots/YYYY-MM-DD/`. Last 30/60, cursor, drawings,
measurements, exact CE/PE selection, strategies, source data and order controls
are unchanged. Evidence:
`docs/trading-analytics/SCALPER_V2_REFRESH_STAMPS_AND_LIVE_FIT_20260921.md`.

2026-09-21 Scalper V2 refresh visibility and live-session fit: every chart title
shows the last successful data refresh in IST. Live Fit Day re-fits when a new
completed candle appears, identical polls do not reset ranges, and a newly
observed canonical trading day replaces the prior live session. Replay and
deliberately older historical selections remain fixed; no full-page reload,
chart remount, strategy, source-data, collector, cursor, drawing, measurement
or order change was introduced. Evidence:
`docs/trading-analytics/SCALPER_V2_REFRESH_STAMPS_AND_LIVE_FIT_20260921.md`.

2026-09-21 live market refresh repair: Scalper V2 price/context queries now
revalidate every 15 seconds and option-history context every 30 seconds without
remounting native charts. Home and the current-month MWHD screener revalidate
every 15 seconds against a single-flight 30-second shared server result. Replay
views remain fixed; strategy rules, ranks, source values, collectors, alerts,
orders, chart zoom, cursor, drawings and measurements are unchanged. Evidence:
`docs/trading-analytics/LIVE_MARKET_REFRESH_REPAIR_20260921.md`.

2026-09-20 OIIS/OISS consolidated stock research delivery: newly discovered
daily stock candidates use one final-only Tailscale research request and create
one durable WhatsApp outbox message per `(trade_date, symbol)`. OISS selection
is now limited to the first selected candidate per stock/day and guarded by a
partial database uniqueness rule, so later scans cannot enqueue another review
or alert for that stock/day. Claude, Qwen and DeepSeek are invoked and
reconciled inside the trusted consolidated API; the worker no longer sends
three provider-specific messages. Existing candidate selection, daily
idempotency, immutable inputs, historical provider evidence, WhatsApp retry
audit and paper/order boundaries remain unchanged. Evidence:
`docs/oiis-live/AI_STOCK_RESEARCH_CONSOLIDATED_WEBHOOK_20260920.md`.

2026-09-20 compact Scalper V2 OI hover repair: the three narrow strike-side
charts no longer display floating hover-value cards over their plotting area.
Strike/time hover linkage and highlighting remain active, while the expanded
analytics OI charts retain full tooltips and numerical inspection.

2026-09-23 Scalper V2 axis/space/refresh repair: the obsolete underlying-pane
OI primitive and its pointer/resize reprojection loop are removed; OI and Delta
OI remain in the dedicated strike, matrix, time and detail views. The candle
pane adds raw-session-eligible dotted rank guides using the requested opposing
labels (CE OI ranks -> PE1/PE2; PE OI ranks -> CE1/CE2) without changing the
canonical ranks. Timeframe selection is one dropdown, verified OI x lot is the
new default display, and chart/side headers remain contained. Strategy, data,
exports and order boundaries are unchanged. Evidence:
`docs/trading-analytics/SCALPER_V2_AXIS_SPACE_REFRESH_REPAIR_20260923.md`.

2026-09-20 D−1 Close and volume-EMA addition: Home MWHD Bull/Bear boards add a
compact previous-trading-day close comparison, with exact evidence in the
drawer/CSV, without changing any gate, score, qualification or rank. Scalper V2
adds exact-contract CE/PE volume panes alongside the retained underlying source
volume and overlays EMA20 on 1m/5m or EMA5 on 15m/1h. Missing volume is not zero;
collectors, chart queries, strategies, alerts and order controls are unchanged.
Evidence: `docs/trading-analytics/SCREENER_D1_AND_SCALPER_V2_VOLUME_EMA_20260920.md`.

2026-09-20 Home/screener live-refresh repair: hydrated Home and current-month
screener data remain mounted when a background request fails. A compact,
accessible status reports the 10-second Home and 60-second MWHD cadences,
detects a stalled server-generated progression snapshot, retains last-good
values, and offers in-place Retry without navigation or whole-page reload.
MWHD/Monthly/OIIS/3Month calculations, ranks, exports, collectors, strategy
alerts and order controls are unchanged. Evidence:
`docs/uiux/HOME_SCREENER_LIVE_REFRESH_20260920.md`.

2026-09-20 Scalper V2 strike-positioning refinement: the compact right column
keeps its existing OI-by-strike panel and replaces only the two lower snapshot
panels with (1) a combined strike structure chart containing CE/PE OI, signed
Delta OI, premium return, CE1-CE5/PE1-PE5 ranks and mechanical price/OI regime
labels, and (2) a 5/15-minute strike-by-time pressure heatmap. The heatmap uses
retained native chain evidence or retained SmartAPI FULL quotes, discloses the
available component count, and never converts missing OI, premium, volume or
depth evidence to zero. The expanded Delta OI, premium-strength, spread, Total
OI, cursor, drawings, V1, exports and order restrictions remain unchanged.

## Purpose

This manifest prevents additive dashboard work from silently removing shared shell capabilities. The integration tree is the deployed source of truth for this snapshot. Any shell, authentication, navigation or API refactor must run the listed regression checks before cutover.

## Critical shared features

2026-09-20 Scalper V2 timeframe-tab restoration supersedes the earlier compact
layout decision that hid the lower intervals. The Time group directly exposes
`1m`, `5m`, `15m` and `1h`, with the active interval visibly selected and the
existing URL/chart query contract unchanged. Session, Fit Day, CE/PE selection,
cursor linkage, refresh, drawings and measurement behavior remain preserved.
Evidence: `docs/trading-analytics/SCALPER_V2_TIMEFRAME_TABS_20260920.md`.

2026-09-20 Scalper V2 premium/spread repair supersedes the unavailable ΔIV and
rejected volume panels in the default workspace. The active retained NIFTY
cohort has 0/20 exact IV/Greek observations but 20/20 exact LTP, bid and ask
observations. The three-panel strike column now uses exact option premium by
strike, while the lower-right slot uses exact bid-ask spread by strike. CE/PE
identity, strike hover, independent PE-minus-CE axes, missingness, IV/Greek
evidence fields, exports, cursors, drawings, measurements, OI calculations,
strategies and order guards remain unchanged. Evidence:
`docs/trading-analytics/SCALPER_V2_PREMIUM_SPREAD_REPAIR_20260920.md`.

2026-09-20 Morning View cash-date repair: Morning View and the shared top
Outlook use the latest retained NSE-only cash report on or before the selected
or current IST date instead of requiring it to equal the derivatives-report
date. Cash and derivatives dates remain separately disclosed; unavailable is
never zero. The original six-row matrix is unchanged. Bullish, bearish and
neutral/unavailable Outlook states have green, red and amber treatments.
Evidence:
`docs/trading-analytics/MORNING_VIEW_LATEST_CASH_AND_OUTLOOK_COLOUR_20260920.md`.

2026-09-20 Scalper V2 option-metric and compact-layout repair: the selected
underlying symbol leads the command row; 1m/5m/15m buttons are removed while
the existing 1h/session/fit contracts remain. Tight chart insets and matched
auxiliary-panel heights increase the painted plot area. Exact-contract IV
change is derived for both archived NSE and SmartAPI fallback cohorts, while
unavailable comparison remains missing in the dedicated IV panel. Tracked
volume occupies a separate lower-right strike chart aligned with the two
cumulative panels. Selected-pair evidence additionally exposes the already
retained volume, depth and delta/gamma/theta/vega fields. Strategies, orders,
drawings, measurements, cursor linkage, independent CE/PE selection and raw
source history remain unchanged. Evidence:
`docs/trading-analytics/SCALPER_V2_OPTION_METRICS_LAYOUT_20260920.md`.

2026-09-20 compact Today outlook header: the shared command header keeps the
permanent NIFTY level/change and adds the existing Morning View six-row market
matrix beside it. Equity cash, all-index futures and all-index options retain
their exact Buy/Sell/Neutral/unavailable state and ₹ crore value; the final
outlook is the canonical server result, not a second UI calculation. Redundant
visible `PAPER`, market-session, readiness and voice-mode words were removed
from the header while paper-only enforcement, feed-quality semantics and the
voice toggle remain functional and accessible by label/tooltip. Evidence:
`docs/uiux/HEADER_TODAY_OUTLOOK_20260920.md`.

2026-09-20 Scalper V2 shared cursor repair: physical pointer ownership remains
with the active NIFTY, CE or PE chart, while only programmatic receivers use
feedback suppression. This prevents continuous movement from sticking on a
React echo. A V2-local direct coordinator keeps React page rendering outside
the canvas-to-canvas cursor path. Canonical time follows across all three price charts and the two OI
history charts; every price pane retains its own numerical value, transient
guides clear together and locked time persists. Strike charts remain
strike-linked. Evidence:
`docs/trading-analytics/SCALPER_V2_SHARED_CURSOR_REPAIR_20260920.md`.

2026-09-20 Scalper V2 OI history source repair: native NSE option-chain history
remains preferred and provider-reported change OI remains unchanged. Sessions
missed because calendar rows arrived after market close may use an additive,
materialised SmartAPI recovery path: exact-token OI is divided by exact lot size
into contracts, change OI uses the last captured pre-session exact-token
baseline, and incomplete cohorts remain unavailable. Raw history is not
rewritten and no second broker collector is added. Evidence:
`docs/trading-analytics/SCALPER_V2_OI_HISTORY_SOURCE_REPAIR_20260920.md`.

2026-09-20 Scalper V2 tracked-chain history layout repair supersedes the
same-day side-chart/lower-pane placement below: the primary workspace contains
only the underlying plus independently selected CE and PE price charts. No
removed OI side-column width remains. The underlying native chart retains its
source-volume pane but no OI-difference pane; its ordinary semantic reference
lines remain restricted to Today open, Yesterday close and Yesterday high.
Two equal-width charts directly below show tracked-chain `sum(PE OI) - sum(CE
OI)` and `sum(PE change OI) - sum(CE change OI)` on separate timestamp axes,
and their hover time drives the same underlying/CE/PE inspection coordinator.
Missing snapshots and baselines remain unavailable. Evidence:
`docs/trading-analytics/SCALPER_V2_OI_HISTORY_LAYOUT_REPAIR_20260920.md`.

2026-09-20 market workstation flow repair: Scalper V2 removes selected-contract,
rank, hover, max-pain and strike-profile lines from the underlying price pane;
only today open, previous close and previous high remain as semantic horizontal
references. The former underlying OI primitive is no longer supplied. OI bars
use CE yellow and PE blue without changing candle direction
or signed-change colours. Morning View applies inverse directional heat for net
put values while preserving the signed values. Home adds a staged 15-minute
volume/SMA15 confirmation and a compact Morning View status headline. Stock 360
price Y bounds come only from visible OHLC. Existing strategies, ranks, evidence,
drawings, exports, source data and order permissions remain unchanged. Evidence:
`docs/trading-analytics/MARKET_WORKSTATION_FLOW_REPAIR_20260920.md`.

2026-09-19 Scalper V2 minute refresh: live cache keys no longer include moving
response timestamps; three chart instances survive polling, inactive intervals
are not prefetched repeatedly, and deployment reloads are explicit in V2.
Exchange-calendar candle freshness alerts are visible and optionally delivered
as browser notifications. Replay, exact contracts, indicators, drawings,
measurements and order controls remain. Evidence:
`docs/trading-analytics/SCALPER_V2_STABLE_REFRESH_20260919.md`.

2026-09-19 3Month light compact presentation: `/strategy/three-month` uses a
white/light workspace and 30px data rows. The sticky identity column shows only
the symbol; company, sector, result and score remain available on hover/focus,
and exact arithmetic remains in the existing gate tooltips and click-open
drawer. Formula, data, qualification, filters, CSV and missingness semantics are
unchanged. Evidence: `docs/strategy/THREE_MONTH_STRATEGY_20260919.md`.

2026-09-19 Scalper V2 side-chart geometry: the existing right-side OI and
Change-in-OI strike charts replace large fixed ECharts gutters with measured
label containment and 2px outer plot insets. Their cards and the gap beside the
underlying are compacted while both Y axes, strike ticks, CE/PE bars,
PE-minus-CE lines and NIFTY guide remain unchanged. Evidence:
`docs/trading-analytics/SCALPER_V2_SIDE_CHART_GEOMETRY_20260919.md`.

2026-09-19 Home selection consensus: the existing collapsed right-edge Trading
list combines browser-local Manual, completed same-session MWD/MWHD, selected
same-date OIIS and qualified same-session 3Month evidence. It ranks exact
symbol/direction pairs by independent-source agreement, shows maximum-agreement
leaders first, and exposes every source list separately. Stale strategy sessions
are disclosed and excluded; aggregation does not change a strategy, direction,
order, alert or permission. Evidence:
`docs/uiux/HOME_SELECTION_CONSENSUS_20260919.md`.

2026-09-19 3Month Strategy: additive read-only `/strategy/three-month` screen
for the exact ten bullish Month/Week/Day/1H/15m gates plus an OR across bearish
M-1/M-2/M-3 candles. Completed intraday candles are the default; forming candles
are explicit and marked. Missing/skipped evidence is never zero or failure. The
screen does not define trades or alter MWHD, OIIS, Monthly Strategy, paper/order
controls or source history. Current instrument-profile coverage is disclosed as
268/500 rather than claimed complete. Evidence:
`docs/strategy/THREE_MONTH_STRATEGY_20260919.md`.

2026-09-19 Home MWHD optional volume confirmation: both Bull and Bear top-ten
rank boards add a hideable `V20 opt.` cell showing projected full-session NSE
stock volume divided by the prior 20 completed daily-session volume SMA. The
quote observation time and 375-minute NSE session drive extrapolation; retained
completed sessions use actual volume and missing inputs stay unavailable. The
exact multiple and raw evidence remain in the drawer/CSV. This confirmation is
not an MWHD gate and does not alter either direction's strategy, weighted score,
qualification or rank. Evidence:
`docs/uiux/HOME_MWHD_VOLUME_CONFIRMATION_20260919.md`.

2026-09-19 Scalper V2 OI time and volume: the existing Total OI dock retains
CE/PE totals and adds timestamp-aligned PE-minus-CE total OI, PE-minus-CE
provider-reported change in OI on an independent axis, and OI PCR history.
Underlying charts add exact-source volume: current-month FUTIDX for indices and
NSE cash volume for stocks. Incomplete snapshots/intervals remain unavailable,
and unmatched old chain evidence is never relabelled current. V2 selection,
pop-out, cursor, drawings, exports, signals, strategy/order guards and all other
analytics remain. Evidence:
`docs/trading-analytics/SCALPER_V2_OI_TIME_AND_VOLUME_20260919.md`.

2026-09-19 Home trading shortlist: additive collapsed right-edge tag in both Home
variants; same-day OIIS selected and complete MWHD Long/Short routes, independent
bull/bear ranks, dated quotes and per-account browser-local personal additions.
10-second inactivity close pauses for editing/keyboard focus. No strategy/order,
ledger, notifier or navigation change. See `docs/uiux/HOME_TRADING_SHORTLIST_20260919.md`.

2026-09-19 QA/UX containment: invalid futures OI percentages are unavailable, not
directional signals; raw packets and stored observations remain intact. Regime
session provenance, OIIS query-driven definitions/mobile reflow, bounded
operational reads and previously hidden assumptions are restored. No strategy,
order permission, ledger or chart capability was removed. This is a partial
audit repair, not a 51-finding completion claim. Evidence and open finding ledger:
`docs/uiux/QA_UX_AUDIT_IMPLEMENTATION_20260919.md`.

2026-09-19 Predictor: additive `/predictor` top-bar/mobile entry, morning NIFTY
and same-day selected/recommended OIIS stocks passing matching MWD gates. Three
models, append-only publication evidence, EOD scorecards, condition slices and
separate retrospective daily studies. Paper/strategy/order/collector sources remain
unchanged. No automatic trading or implied validated edge. See
`docs/PREDICTOR_WORKSTATION_20260919.md` for measured results and live-cycle limits.

2026-09-18 Paper Analyzer: additive `tab=analyzer` compares entry parameters,
return distributions/density, correlations and cohort stability using the existing
ledger. Closed net, open gross and hypothetical EOD remain separate; invalid,
missing and late evidence is disclosed. Existing inspector, tabs, refresh, exports,
alerts, rules and order controls remain. See `docs/PAPER_TRADE_ANALYZER_20260918.md`.

2026-09-18 Daily Data Health: additive `/analytics/system/data-health` and menu
entries expose daily download/parse/archive gaps, subscribed/planned instrument
observations, symbol filtering, broker request health and JSON evidence.
Collection freshness remains separate from complete exchange history.
Existing routes, data, collectors, strategy/order guards and exports remain.
Evidence: `docs/DAILY_DATA_HEALTH_20260918.md`.

2026-09-18 explicit user-approved Scalper retirement supersedes older V1 route
preservation entries below: only V2 is selectable; `view=scalper` redirects with
other parameters preserved. Shared calculations/source history remain. Other
analytics, exact contracts, drawings, measurements, exports and strategy/order
guards remain. Responsive chart containment, bounded prefetch, source-date
disclosure and coalesced resize have authenticated smoke coverage. Raw NSE
archives are separate from parsed analytics. Evidence/limits:
`docs/MARKET_WORKSTATION_COVERAGE_20260918.md`.

2026-09-18 Paper verified replay: additive `tab=verified` reconstructs qualified
5-/30-session evidence and compares ₹4 lakh recorded-fill capital across all
OIIS and monthly cohorts. Missing history stays censored; hypothetical target
fills remain separate. Excel/CSV/JSON/Markdown retain source details. Existing
views, trade inspector, refresh, alerts, authentication, strategy, orders and
authoritative ledger remain. Evidence: `docs/OIIS_VERIFIED_REPLAY_20260918.md`.

2026-09-12 MWHD Bull/Bear candidate ranks: the Home progression surface is now
split into compact `MWHD-BULL RANK` and `MWHD-BEAR RANK` boards. Every stock has
both independently weighted ranks and separately coloured `BULL #n` / `BEAR
#n` tags. Each half exposes its top 15 rows and scrolls the remaining ranked
stocks internally. Primary cells contain ticks and weighted
scores only; exact values and equations remain in the selected-stock drawer and
full CSV evidence. The visible gate order is M−2 then M−1, without changing the
M−1 sufficiency prerequisite inside the M−2 route. Bear is the exact comparison inverse over the same source
observations, M−1/M−2 sufficiency, gate order and weights. A stock identity is
green/red only when a complete Bull/Bear route passes. The shared badge exposes
both ranks in Stock 360, OIIS, Scalper V1/V2 and Trade Log. Existing market data,
strategies, collectors, permissions and missingness are unchanged. Evidence:
`docs/uiux/HOME_MWHD_BULL_BEAR_RANKS_20260912.md`.

2026-09-12 MWHD weighted progression ranking: the existing Home Scalper
Progression matrix gives the M−2 route an explicit M−1 sufficiency gate plus
its separate M pragmatic two-month gate. Stock identity is green when either
monthly starter passes; rows where both starters fail are red and collapsed by
default with an explicit expansion control. Ranking weights completed gates by
proximity (monthly 1, current week 2, previous week 3, day 4, hour 5, 15m 6,
5m 7), exposes exact weighted totals and retains pass/fail/pending evidence.
The same MWHD rank is visible in OIIS, Scalper V1/V2, Trade Observations,
legacy Trade Log and Stock 360 through the existing shared progression query.
Underlying market values, strategies, collectors, signal rules, order
permissions and missing-data semantics remain unchanged.

2026-09-12 Scalper V2 single workstation: the existing V2 route now keeps its
three price charts and permanent numerical inspector above one compact tabbed
Analytics Dock. A strike matrix combines OI and signed change, the native
underlying profile has four CE/PE OI/change lanes, coincident right-axis labels
merge by priority, one-sided change-in-OI uses an adaptive domain, option-price
comparison defaults to stable return from open with a complete-chain heatmap,
and snapshot totals are truthfully named Total OI vs Time. Latest chain
evidence is never relabelled as historical cursor evidence. Original Scalper,
V7, A-open/B-close, independent CE/PE selection, drawings, exports, collectors
and permissions remain unchanged. Evidence:
`docs/trading-analytics/SCALPER_V2_SINGLE_WORKSTATION_20260912.md`.

2026-09-12 Home progression dense matrix: the existing Monthly Open progression
above Risk & Anomaly now renders exactly one compact row per stock with grouped
M−1/M−2 route headers, unchanged seven-gate calculations, contiguous scores,
pass/fail/pending counts, a best-route strip, filters, density/column controls,
CSV evidence and a complete equation drawer. It has no fixed widget height;
horizontal overflow remains inside the matrix. Existing Quick View, Stock 360,
API contracts, strategies, collectors and permissions remain unchanged.
Evidence: `docs/uiux/HOME_SCALPER_PROGRESSION_MATRIX_20260912.md`.

2026-09-11 Home progression vertical-table refinement: the two-row-per-stock
Monthly Open progression remains above Risk & Anomaly and retains the M, W0,
W-1, D0, 1H, 15m and 5m comparisons. Conditions now stack inside a four-column
table with exact operands and pass/fail/missing state. The widget scrolls
vertically and has no horizontal table overflow at desktop or mobile widths.
All-green sorting and Stock 360 navigation remain unchanged. Evidence:
`docs/uiux/HOME_SCALPER_PROGRESSION_20260911.md`.

2026-09-11 Home scalper intraday progression: the existing Today progression
table remains read-only and now adds contiguous current-versus-prior clock-hour,
15-minute and 5-minute open gates after its two independent monthly routes and
daily/weekly gates. It appears above Risk & Anomaly, renders two compact rows
per stock, shows both operands in every green/red/missing cell, and sorts any
fully green route first without redefining Monthly Open strategy calculations.
Intraday values use canonical NSE one-minute bars and exact IST-adjacent bucket
starts; missing intervals remain unavailable. Risk/Anomaly, sector lenses,
Quick View, Monthly strategies, Scalper V1/V2, Trade Log, SHAP, collectors,
authentication and order permissions remain unchanged. Evidence:
`docs/uiux/HOME_SCALPER_PROGRESSION_20260911.md`.

2026-09-11 Scalper V2 Delta OI identity colours: both the underlying
strike-aligned profile and the separate horizontal Change-in-OI chart now fill
CE bars blue and PE bars yellow. Signed direction is preserved geometrically
(negative left, positive right) and numerically with explicit signs; zero and
missing remain neutral. OI values, baselines, proportional widths, V1, V7,
A-open/B-close measurement, collectors and order permissions are unchanged.
Evidence:
`docs/trading-analytics/SCALPER_V2_SIGNED_OI_AND_CLEAR_DRAWINGS_20260911.md`.

2026-09-11 Stock 360 MWD EMA Value drill-down: the existing shared
`/analytics/stock/:symbol` technical chart now uses only the supplied
session-aligned 15m/1H, D/W/M/3M/Y open, PDC, EMA 9/21/50/200 and VWAP-based
traded-value method. Previous D/W/M opens remain in a selectable exact-value
table. The old Bollinger/pivot/RSI technical chart is removed, while all other
Stock 360 evidence and links from Home progression, Strategy Scalper Dashboard
and monthly evidence remain. The 1D stock response additively exposes retained
pre-session indicator warm-up; it never enters the visible session. Scalper
V1/V2, monthly strategies, Trade Log, SHAP, Paper Trading, collectors,
authentication and permissions are unchanged. Evidence:
`docs/analytics/STOCK_360_MWD_EMA_VALUE_20260911.md`.

2026-09-20 Stock 360 chart-first repair: `/analytics/stock/:symbol` now paints
from canonical 1D OHLCV without waiting for the slower stock explainer. Its
primary order is compact KPIs, intraday price/EMA plus volume and traded value,
then a daily price/volume/traded-value/delivery chart and a one-line signal
table. Level labels are compact while exact bases remain accessible. OIIS, F&O
and backtesting evidence remains available through an explicit deferred evidence
control. Daily bars add exchange turnover and delivery percentage; missing
delivery remains missing. No unauthorised TradingView recommendation is
fabricated. All Stock 360 links, MWHD ranks, strategies, collectors, order
guards and unrelated routes remain unchanged. Evidence:
`docs/analytics/STOCK_360_CHART_FIRST_AUDIT_20260920.md`.

2026-09-11 NSE India report download health: the existing authenticated
`/institutional/nse-intelligence/reports` view now exposes per-file downloader
and loader status, source date, exact file, bytes, SHA-256, rows, timings,
recorded source attempts and failure reasons, plus the last 30 scheduled jobs.
All/Core/Ancillary/Issues filters and complete CSV/JSON evidence are additive.
Missing files remain unavailable rather than zero, while skipped/reused files
are labelled as already loaded. Existing NSE Intelligence views, institutional
report ingestion, navigation, authentication, collectors, data and permissions
remain unchanged. Evidence:
`docs/nse-reports/NSE_REPORT_DOWNLOAD_HEALTH_20260911.md`.

2026-09-11 Strategy Scalper Dashboard: `/strategy/scalper-dashboard` adds a
separate read-only current-month filter ledger for the current NSE stock F&O
universe. It exposes current price plus open and close/as-of anchors for today,
previous day, current/previous/two-weeks-ago, and current/previous/two-months-
ago, with five explicit Monthly Open v3 condition states and an Excel-readable
full export. Missing history remains unavailable. Existing Home progression,
Monthly strategies/backtests, Scalper V1/V2, Trade Log, SHAP, collectors,
authentication and order permissions are unchanged. Evidence:
`docs/strategy/SCALPER_DASHBOARD_CURRENT_MONTH_20260911.md`.

2026-09-11 Monthly Open v3: the independently versioned Monthly Open strategy
removes `Previous-month open > two-month open` and retains the explicit
`Previous-month close > previous-month open (green candle)` test. It now has
five eligibility gates. The 36-month rerun is additive: v2 remains stored with
36 runs/98 candidates and v3 adds 36 runs/2,026 candidates. Monthly Close,
Expiry, First Session, comparison identity, evidence/export fields, other
strategies, collectors and order permissions are unchanged. Evidence:
`docs/rolling-monthly/MONTHLY_OPEN_V3_GREEN_PREVIOUS_MONTH_20260911.md`.

2026-09-11 Scalper V2 underlying max-pain line: the existing V2 underlying
candlestick draws each eligible latest retained-snapshot max-pain candidate as
a purple dotted price line with a right-axis label. Normal Session Y remains
strictly based on observed underlying prices; an outside-session candidate is
disclosed and becomes visible through the explicit All strikes Y view. Tied
minima, payout evidence, V1, V7, A-open/B-close, collectors and no-order
permissions remain unchanged. Evidence:
`docs/trading-analytics/SCALPER_V2_MAX_PAIN_PRICE_LINE_20260911.md`.

2026-09-11 Scalper V2 normalised option-price chart: the existing V2 analytics
area adds a full-width timestamp view for every retained CE/PE strike. Each
contract independently maps its first retained session price to 0, observed
high to +100 and observed low to -100. Selected CE/PE strikes are opaque;
farther strikes progressively fade. Exact raw prices, gaps, captured-window
scope and limitations remain inspectable/exportable. V1, V7, A-open/B-close,
collectors and order permissions are unchanged. Evidence:
`docs/trading-analytics/SCALPER_V2_NORMALIZED_OPTION_PRICE_20260911.md`.

2026-09-11 Scalper V2 cumulative OI time chart: the existing V2 analytics area
adds a full-width timestamp chart whose blue CE and yellow PE lines separately
sum every strike retained in each canonical option-chain snapshot. Coverage,
unit and captured-window scope are explicit; incomplete sides remain missing,
and the cross-strike sum is not presented as a temporal running total or a full
exchange-chain claim. The additive API evidence remains in JSON export. V1,
V7, A-open/B-close, exact contracts, collectors and order permissions are
unchanged. Evidence:
`docs/trading-analytics/SCALPER_V2_CUMULATIVE_OI_TIME_20260911.md`.

2026-09-11 Scalper V2 bottom-chart NIFTY context: OI by strike and max-pain
payout now show a dotted vertical guide at the nearest plotted strike, labelled
with the exact current NIFTY value. The horizontal Delta OI chart shows the same
context as a dotted horizontal guide because strike is its right Y axis and
signed Delta OI is its X axis. Category indexes are resolved explicitly so a
numeric strike cannot be mistaken for an out-of-range ECharts index. Existing
signed bars, missingness, V1, V7, A-open/B-close, collectors and order
permissions remain unchanged. Evidence:
`docs/trading-analytics/SCALPER_V2_SIGNED_OI_AND_CLEAR_DRAWINGS_20260911.md`.

2026-09-11 Scalper V2 signed Delta OI and drawing cleanup: the existing
underlying-attached profile and separate Change in OI chart use one symmetric
maximum-absolute scale, positive-right/negative-left geometry, blue CE and
yellow PE identity, signed values, and an explicit top scale. The Objects rail
adds undoable Clear all drawings. Missing remains distinct from observed zero;
V1, V7, A-open/B-close, exact contracts, exports, collectors and order
permissions are unchanged. Evidence:
`docs/trading-analytics/SCALPER_V2_SIGNED_OI_AND_CLEAR_DRAWINGS_20260911.md`.

2026-09-10 Scalper V2 native strike Delta OI profile: the existing underlying
candlestick now owns a native series primitive whose horizontal Delta OI bars
are vertically aligned to actual strike coordinates on the right price scale.
One declared baseline kind, full-cohort magnitude scaling, CE/PE identity,
signed colours, zero/missing distinction and a keyboard-readable evidence table
are preserved. The separate horizontal Delta OI chart retains strike on its
right Y axis. The normal session view reports its visible/total strike count;
an explicit `All strikes Y` fit includes the complete cohort on their true
underlying-price coordinates without silently compressing the default view.
V1, V7, A-open/B-close, exact contracts, routes, collectors,
orders and permissions are unchanged. Evidence:
`docs/trading-analytics/SCALPER_V2_TEST_PACKAGE_INTEGRATION_20260910.md`.

2026-09-10 MANEESH Morning View participant comparison: the existing Morning
View now exposes FII, Pro, Client and DII index-option current/prior/change
values plus an expanded calculation audit for call/put long, short and net
contracts. Client remains the official reported participant class and is not
relabeled verified retail. Missing prior reports remain unavailable. Existing
cash, activity, participant, matrix, Scalper V1/V2, Trade Log, SHAP, exports and
read-only permissions remain unchanged. Evidence:
`docs/trading-analytics/MORNING_PARTICIPANT_YESTERDAY_COMPARISON_20260910.md`.

2026-09-10 Scalper V2 charting-upgrade v2: the existing native drawing layer now
supports click-by-click trendline preview/commit, complete cancellation, endpoint
and whole-object drag, CSS-pixel hit testing, exact UTC/price editing and one-step
undo. This is the charting specification's immediate complete-trendline slice,
not a claim that its later Strategy Lab, screener, alert or research stages are
implemented. V1, V7, A-open/B-close, exact contracts, OI/delta-OI, Trade Log,
SHAP, monthly views, collectors and no-order permissions remain unchanged. See
`docs/trading-analytics/SCALPER_V2_CHARTING_UPGRADE_V2_20260910.md`.

2026-09-10 Scalper V2 workstation drawings: the existing
`view=scalper_v2` now owns native time/price drawing primitives, a left tool
rail, Objects inspector, undo/redo and symbol-scoped local recovery. CE1-3 and
PE1-3 are retained by current-OI rank, and append-only chart updates reuse the
existing series. V1, V7, A-open/B-close, OI/delta-OI axes, Trade Log, SHAP,
monthly views, APIs, collectors and read-only permissions remain unchanged.
See `docs/trading-analytics/SCALPER_V2_WORKSTATION_DRAWINGS_20260910.md`.

2026-09-10 Scalper V2 acceptance completion: the existing V2 adds explicit
full-day/30/60-bar X views, Session/Visible/Manual Y modes, Y lock, exact A/B
time controls with immutable measurement evidence context, a selected-pair
OI/delta-OI/IV/spread matrix, and selected-versus-ATM identity. Pointer motion
does not hydrate chart data. Historical chain absence and screenshot-export
limitations are explicit. V1, V7, A-open/B-close arithmetic, Trade Log, matrix,
SHAP, APIs, collectors and no-order permissions remain unchanged. Full honest
matrix: `docs/trading-analytics/SCALPER_V2_ACCEPTANCE_MATRIX_20260910.md`.

2026-09-10 Scalper V2 geometry and inspection repair: the additive
`view=scalper_v2` now uses measured full-width chart bodies, independent
observed-session price envelopes, full-day X fitting, source-owned linked time
and strike inspection, real Latest/Cursor/Locked numerical values, truthful
delta-OI/PCR states and bounded price-coordinate OI geometry. Existing Scalper
V1, V7 events, A-open/B-close measurement, exact contracts, all Trading
Analytics routes/exports, collectors, SHAP Research and no-order permissions
remain unchanged. Evidence:
`docs/trading-analytics/SCALPER_V2_REPAIR_20260910.md`.

2026-09-10 Monthly Close vs Open comparison:
`/strategy/monthly?compare=close-open` is a read-only comparison of the two
independently versioned selected-candidate lists. It classifies each stock and
calendar month as In both, Monthly Close only or Monthly Open only, preserves
missing outcomes, exposes both underlying evidence inspectors and exports the
paired fields. It does not merge, re-rank or change either strategy.

2026-09-10 Monthly Open strategy: `/strategy/monthly?entryMethod=MONTHLY_OPEN`
adds independent `absolute_monthly_open_bullish_long_v2` selection and
same-calendar-month backtesting beside the unchanged Monthly Close strategy.
Monthly red/green context remains explicit; all cross-period decision values
and entry use opening prices, with no signal-session close used for selection.
Version 2 has six eligibility gates and intentionally removes only the former
signal-open-above-previous-session-close gate.
First Session gap logic, expiry, Rolling 5/30/60, OIIS, Paper Trading, source
precedence, permissions and existing close results remain unchanged. Evidence:
`docs/rolling-monthly/MONTHLY_OPEN_STRATEGY_2026-09-10.md`.

2026-09-10 additive Scalper V2: `/strategy/trading-analytics?view=scalper_v2`
adds a separate three-chart comparison workspace while `view=scalper` remains
the default Scalper. The selected timeframe loads first, then exact-pair
1m/5m/15m/60m chart payloads preload through the existing authenticated API and
React Query cache. Current V7 signals, A-open/B-close measurement, collectors,
OI meanings, source gaps, exports, permissions and all previous tabs remain
unchanged. V2 adds current-OI leaders, price-aligned OI context, a chain rail and
four scoped option analytics blocks. Evidence:
`docs/trading-analytics/SCALPER_V2_20260910.md`.

2026-09-10 Scalper latency repair: normal Scalper entry uses a small authenticated
read-only context route instead of blocking on the full Morning/FII/participant
payload. Selected context/chart requests use an indexed exact-symbol lookup;
the full all-stock selector loads on demand and remains available. Session OI
baseline queries retain event-time rules while adding indexed
collection-time bounds. The default one-day view requests three calendar days
for indicator warm-up; All retained days remains 15 days. Shared full evidence
loads lazily on explicit drawer access. V7 rules, A-open/B-close measurement,
exact contracts, OI semantics, exports, collectors and no-order permissions are
unchanged. Evidence: `docs/trading-analytics/SCALPER_LOAD_LATENCY_20260910.md`.

2026-09-10 MANEESH daily trade SHAP V2: the read-only Good-trade experiment now
uses a rolling 30-calendar-day population and an exact selected-option positive
15-minute net P&L label after versioned charges. The old 20-session gate is
removed; a chronological trade-level holdout remains, and same-session
correlation is disclosed as an exploratory limitation. The durable scheduler
runs once at/after 16:00 IST on trading days and catches up after a same-day
restart. Full V7 condition/indicator JSON, CE/PE 15m/30m/EOD comparisons,
exports, entry logic, paper/live permissions and notifications remain unchanged.

2026-09-09 current stock-F&O collection reconciliation: Trading Analytics and
the collector now use the same current SmartAPI stock-F&O membership boundary.
Missing cash underlyings are resolved from the real NSE master, startup prices
are seeded before ATM option selection, synthetic `NSETEST` rows are excluded,
and configured capacity remains authoritative. Existing NIFTY-250/index
subscriptions, V7 rules, chart calculations, OI meanings, orders and stored
history are unchanged. Evidence:
`docs/worklogs/current-stock-fno-coverage-2026-09-09.md`.

2026-09-09 NIFTY Model Research recovery: missed hourly capture windows are
retried every five minutes across the retained 15-day minute-data horizon.
Recovered rows retain planned and actual timestamps, delay, exact source rows
and outcomes, and remain explicitly ineligible as on-time point-in-time
forecasts. On-time/recovered counts are visible. SHAP gates, EMA9, execution,
paper trading and notifications remain unchanged. Evidence:
`docs/trading-analytics/NIFTY_EXPLAINABLE_CONTEXT.md`.

2026-09-09 observation P&L: additive exact-master CE/PE lot metadata, high/low
and hypothetical premium-delta × quantity gross/net analysis; no realised-ledger
changes. Exact-symbol/token Scalper links prohibit automatic pair substitution.
Existing presets/raw exports, rules and messaging remain unchanged. Evidence:
`docs/trading-analytics/OPTION_PNL_20260909.md`.

2026-09-09 MANEESH Trade Log (deployed from master `a9d4372`): the existing
`/strategy/trading-analytics?view=trade-log` read-only endpoint/route, V7 rules,
exact underlying/CE/PE contracts, gates, all indicator/outcome fields, delivery,
Legacy CSV and raw precision are retained. New presets, inspector and full loaded
exports add access paths; no orders or notifications are generated. Shared
market controls are explicitly distinguished from log filters. Old view available
with `logLayout=legacy`. See `docs/trading-analytics/TRADE_LOG_READABILITY_20260909.md`.

2026-09-09 MANEESH Trade Log comparison follow-up: the default table preset now
shows both exact CE and PE across 15m, 30m and EOD. Each of the six cells retains
net/gross/charges, entry-to-endpoint premium, high/low excursion, one exact lot
quantity and maturity. Monitor, Outcomes, Entries & rules, Indicators, Full
evidence, inspector and exports remain available. The local SHAP Research link
opens the separate read-only good-trade experiment; it does not alter V7 signals.

2026-09-09 NIFTY Model Research: additive `/strategy/nifty-context` with direction,
range, validation and data/audit lenses. Lazy SVG/table explanations do not load
SHAP into the browser or alter existing MANEESH charts. Authenticated read-only
API and isolated CPU worker use only the new `nifty_context` schema for writes.
EMA9 entries, PCR/OI, source records, notifications and execution are unchanged.
Evidence and acceptance gates: `docs/trading-analytics/NIFTY_EXPLAINABLE_CONTEXT.md`.

2026-09-07 Scalper measurement: opt-in chart click callback/rectangle support,
browser-memory-only endpoints/quantity and fixed exact pair; RSI/MACD on selected
underlying. Existing chart consumers, source bars/CSV, OI, EMA9, resistance,
orders and paper data are unchanged. Evidence: SCALPER_MEASUREMENT_20260907.md.

2026-09-08 MANEESH chart-first repair: financial native-axis mode, correct
candlestick low/high extraction, explicit Fit levels, off-screen level labels,
visible-range 50-point guides and compact underlying/CE/PE layout. Generic
charts keep the prior extent policy; exact-pair A/B, RSI/MACD, EMA9, ladder, OI,
exports and read-only execution gates remain unchanged. Evidence:
`docs/trading-analytics/UI_CHART_UPGRADE_20260908.md`.

2026-09-08 MANEESH chart evidence completion: independent MR/MS, WR/WS and
DR/DS lifecycle records; calendar-qualified weekly/monthly periods;
previous-session/first-session OI baselines; fixed display-cohort composite OI;
calendar-anchored 1/5/15/60 minute OI changes; price-aligned OI profile; and
previous participant-report comparisons. Missing OI, calendars and comparison
records remain explicit. This is read-only and does not alter OIIS/OISS,
execution, source precedence or paper trading. Evidence:
`docs/trading-analytics/UI_CHART_UPGRADE_20260908.md`.

2026-09-08 MANEESH multi-timeframe matrix: additive fixed 3-by-3 comparison of
the underlying, exact selected CE and exact selected PE at 1m, 5m and 15m.
Hover time is synchronized across all nine panes. The Scalper remains unchanged;
missing bars stay explicit and the matrix has no interval selector. Evidence:
`docs/trading-analytics/MULTI_TIMEFRAME_MATRIX_20260908.md`.

2026-09-07: temporary MANEESH header link opens the existing Trading Analytics
Scalper (5m default); original Strategy menu destination remains. Pink/white
styling is scoped to this shortcut only. Desktop and mobile retain navigation,
NIFTY context, speech and paper notifier. No strategy/API/data changes.

| Feature | Runtime ownership | Required evidence |
|---|---|---|
| Paper alert launcher | `PaperTradeNotifier.tsx` mounted once by `AppShell.tsx` | Visible on authenticated desktop and mobile routes |
| Latest five paper events | `GET /v1/paper/notifications?limit=5` | Authenticated response, durable `paper_trading.trade_events` source, entry/target events only |
| Automatic event popup | notifier polling and durable event-ID deduplication | A newly intercepted browser response opens the panel; initial history stays silent |
| Native voice mode | icon-only header switch and browser `speechSynthesis` | Defaults on unless explicitly muted, persists locally, speaks only governed entry/target phrases, mute cancels queued speech; accessible name and tooltip expose the state without consuming header width |
| Single-line market context | `AppShell.tsx`, `ResponsiveWorkspaceNavigation.tsx`, `GET /v1/overview/header`, and `GET /v1/trading-analytics/morning-summary` | NIFTY mark plus canonical Equity/Futures/Options values, states and original market-matrix outlook stay visible in the command header; paper enforcement and feed quality remain active without redundant text badges; the retired ticker rail stays absent |
| Global and Strategy destinations | `workspaceRoutes.ts`, route catalogue and responsive navigation | Today, Markets, Strategy and Paper remain primary; Stocks/Derivatives remain under Markets; Data & Operations remains under More; all seven Strategy workspaces remain reachable |
| NSE FOVOLT futures-volatility screener | `/futures/volatility`, `futuresVolatility.ts`, `nse_fii_reports_service` FOVOLT family | Exact reported current-minus-previous daily futures-volatility rule, all 16 source fields, immutable revisions, bounded archive backfill, verified-calendar next-session outcomes, same-report matched/nonmatched historical evaluation and JSON/CSV evidence remain read-only; existing Volatility Signals and original three-report bundle remain separate |
| Paper evidence workbench | `/paper-trading` route and `PaperTradingCommandCenter.tsx` | Existing evidence, filters and detail inspector remain present; dedicated Market Book tab exposes the immutable entry quote and top-three bid/ask ladder |
| Paper Simple View | `/paper-trading?tab=simple` | Additive compact table retains shared filters and opens the canonical trade inspector; existing Portfolio and What good looks like views remain unchanged |
| Paper WhatsApp lifecycle alerts | `paper-webhook-worker`, `papertrade/whatsapp.py` and PostgreSQL outbox | Configurable chat ID; entry/target/exit events are formatted, low-noise and idempotent; entries add company/Trendlyne/52W context, immutable SmartAPI entry touch/top-three book, plus a fail-soft candles/Bollinger/volume/RSI/MACD PNG |
| Monthly rejected ledger | `MonthlyStrategiesPage.tsx` plus `rolling_monthly.evaluation_ledger` | Selection filter exposes selected, rejected, incomplete and all evaluated stocks; rejected rows show reasons |
| Rolling rejected ledger | `MonthlyStrategiesPage.tsx`, `rollingWindow.ts` and `rolling_monthly.rolling_window_evaluation` | Population filter exposes selected, continuation, rejected and incomplete stocks; rejected rows show reasons |
| Native cursor preservation | `MarketTargetCursor.module.css` | Target overlay may snap to controls but must never apply `cursor:none` to the page |
| High-legibility font | `fontMode.ts`, `AuthStatus.tsx`, `EChartSurface.tsx` | User-menu switch selects Atkinson, persists across reload and updates charts without external font requests |
| Home stock identity | `StockPill.tsx` and stock-profile assets | Symbol, name and logo remain visible; pixel interaction cannot obscure text |
| Trendlyne Summary | `/strategy/trendlyne-summary` plus `trendlyneSummary.ts` | Six-month ledger, fund-house/stock summaries and inspector remain reachable without fixed-count assumptions |
| OISS v1.202608 | `/strategy/oiss-v1-202608`, `OissV1Page.tsx`, `oissV1.ts`, `services/oiss_v1` | Independent from OIIS; 13 URL lenses, immutable run identity, radar/rejected/carry/change/backtest evidence and full JSON/CSV/Excel exports remain reachable; scheduler and paper stay gated |
| Compact UI V5 | `VITE_UI_COMPACT_V5`, shared shell/workspace primitives and `docs/uiux/v5` | Presentation-only flag; all route data, calculations, filters, inspectors, comments, audit and full-data exports remain canonical; heavy Paper lenses mount only when selected |
| Option 4 command header | `AppShell.tsx`, `ResponsiveWorkspaceNavigation.tsx`, `workspaceRoutes.ts` | One 56 px desktop header, no second global rail, permission-filtered menus, responsive drawer, Ctrl+K, local page tabs, status, voice and user controls preserved |
| OIIS/OISS multi-model research | `services/ai_stock_research`, `ai_stock_research.*`, `compose.ai-stock-research.yml` and `/paper-trading?tab=tracked` | One stock/day immutable evaluation; Claude/Qwen/DeepSeek results, source lineage and compact one-year OHLCV inputs remain auditable in the dedicated Paper Trading table/inspector and complete filtered CSV; model-facing research excludes O/X/direction/status and uses OHLCV only for price/news alignment; V5 earnings, web sentiment, positive/negative evidence, upcoming risk and market view remain available; only successful validated research output enters the WhatsApp outbox; no ChatGPT call or strategy/paper mutation |
| MANEESH aligned terminal V3 | `/strategy/trading-analytics?view=scalper`, `AlignedScalperTerminal.tsx`, `renderer=classic` rollback | Default synchronized NIFTY/exact CE/exact PE candlesticks plus OI, signed interval delta OI, RSI and MACD; strict session levels, current PCR/indicative max-pain context, provider-native missingness, exact A-open/B-close measurement, evidence inspector and all classic ECharts evidence/exports remain available; research-only and no order path |
| MANEESH readable aligned terminal V4 | Same canonical Scalper route and renderer control | Readable-height native NIFTY/CE/PE/OI/ΔOI panes with intentional internal scrolling; independent optional RSI/MACD/PCR panes; stable refresh/resize/cursor lifecycle; current/archived-delta/composite OI profile; value-first selected-pair summary; Latest/Cursor/Locked inspection; Chain/Rules/Measure/Levels/Health sections; mobile inspector sheet; V7 signals, exact A-open/B-close arithmetic, alternate renderer, raw evidence and no-order permissions unchanged |
| MANEESH multi-timeframe matrix | `/strategy/trading-analytics?view=matrix`, `TradingAnalyticsTimeframeMatrix.tsx` | Separate no-selector 1m/5m/15m by underlying/exact CE/exact PE matrix; nine light candlestick charts share one wall-clock crosshair and latest retained IST session; original Scalper and all execution/data semantics remain unchanged |
| Independent Scalper contracts | `view=scalper`, `view=scalper_v2`, `ceStrike`, `peStrike` | V1 and V2 select exact CE and PE strikes independently under one selected expiry; legacy same-strike links, exact identities, V7, A-open/B-close measurement, missing-data truthfulness, exports and read-only permissions remain preserved |
| Scalper V2 underlying reference tracker | `view=scalper_v2`, `tradingAnalyticsReferenceLevels.ts`, `scalperV2ReferenceLevels.ts` | Current/day/week/month and complete 5/30-session references remain exact and exportable; only raw-session-eligible prices draw on the underlying without changing its scale; the independent compact gauge uses exact 30-session low/high endpoints, marks current and labels every available in-range expiry strike while retaining off-range reference evidence; the signed Delta OI strike key stays compact and keyboard/hover expandable; V1 and strategy/order behavior remain unchanged |
| Scalper V2 pop-out and strike comparison | `view=scalper_v2`, `popout=scalper_v2`, `scalperV2Analytics.ts` | Same authenticated live workstation can open without global chrome while retaining symbol/expiry/timeframe/exact CE/PE, tools and evidence; the right column uses vertical CE/PE OI and signed Delta OI strike bars plus independently scaled PE-minus-CE lines; numerical inspector and 30-session gauge move below; missingness, exact-time cursor truth, strategy rules, exports and read-only permissions remain unchanged |
| Scalper V2 four-panel strike stack | `view=scalper_v2`, `TradingAnalyticsScalperV2.tsx`, `ScalperV2.module.css` | Right-side order remains OI, signed Delta OI with PE-minus-CE Delta OI, Strike Structure, then Strike x Time Positioning; the dedicated bid-ask spread chart stays removed while raw quote evidence and the selected-contract spread metric remain available; timestamp panels remain width-aligned with their price panes and no strategy/order behavior changes |

## Mandatory regression commands

```bash
cd /home/novius2/trading-stack/neon-stock-terminal/apps/web
npm run typecheck
npm test

cd /home/novius2/trading-stack/neon-stock-terminal/apps/api
npm run typecheck
npx tsx --test src/routes/mobileNotifications.paperPopup.test.ts

cd /home/novius2/trading-stack
bash scripts/verify/canonical-repository-gate.sh

cd /home/novius2/trading-stack
PLAYWRIGHT_ORIGIN=https://n50.nifty50today.co.in \
PLAYWRIGHT_ADMIN_PASSWORD='<from protected deployment environment>' \
PLAYWRIGHT_OUTPUT_DIR=/tmp/paper-notifier-regression \
node tools/playwright/paper-event-notifier-regression.mjs
```

The Playwright script uses browser response interception for the synthetic new-event check. It must not insert, modify or delete a paper trade or durable event.

## Current restoration evidence

- Root cause: the Git-backed delivery tree retained the notifier implementation while the non-Git integration tree had lost its component files, shell mount, voice switch and browser endpoint.
- Production image rebuilt and only `n50-dashboard` recreated.
- Authenticated production regression: 18/18 checks passed at 1440×900, 1366×768 and 390×844.
- API and frontend typechecks passed.
- Focused notifier unit and API tests passed.
- Two stale navigation expectations were found and corrected to preserve the current six-destination Strategy navigation and `Rolling Strategy` wording. The application was not reverted to satisfy the obsolete four-item menu expectations.

## Change rule

A new dashboard is additive only when this manifest still passes. Removing a shared feature requires a separately approved product decision, an updated manifest and explicit migration notes; absence from a new page implementation is not permission to remove it from the application shell.
# 2026-09-07 additive Trading Analytics workspace

- New `/strategy/trading-analytics` route, Strategy dropdown and command search.
- Existing NIFTY Options tabs remain unchanged; one additional journey link.
- OIIS/OISS, paper ledger, global shell, speech, authentication and source
  precedence preserved. New endpoints inherit the canonical `/v1` auth guard.
- Institutional/option/price charts are read-only previews with visible missing
  data and policy gates. Feature rollback: `N50_TRADING_ANALYTICS_ENABLED=false`.
- Evidence and unimplemented stages: `docs/trading-analytics/IMPLEMENTATION_REPORT.md`.
# 2026-09-07 additive Trading Analytics IO navigation

F&O extension: a canonical-master underlying selector and `symbol=` scope all
Trading Analytics prices/EMA/resistance/exact-option evidence and JSON exports.
Scalper/Structure/API default 5m; retained one-day Scalper default. Shared window
PCR and explicitly indicative (not full-chain) max pain. Existing NIFTY strategy,
market-wide institutional data, missingness and execution gates are unchanged.
Evidence: `docs/trading-analytics/FNO_COVERAGE_20260907.md`.

`/strategy/trading-analytics` now groups nine historical query views into six primary workspaces. Old `activity`, `participants`, `options`, `smartapi`, `health` query links remain accepted. Data Health, Source / Formula and Condition Evidence are shared right drawers. All existing source JSON/CSV fields remain; weekly/monthly and exact OI history are additive read-only views. Existing NIFTY strategy, shared header, authentication, permissions and orders remain unchanged. Detailed mapping: `docs/trading-analytics/IO_UI_REVIEW_20260907.md`.

Cash/axis addition: Morning View exposes independently dated NSE cash FII/FPI and DII buy/sell/net, complete retained CSV and history. Selected-date matrix inputs are unchanged. SmartAPI restores all option columns, keeps Greek Delta separate from prior-quote and provider-day ΔOI, and exposes source timestamps/missingness. Scoped value-axis overrides do not modify the shared chart skin or other dashboards. Report: `docs/trading-analytics/CASH_OI_AXIS_20260907.md`.
2026-09-12 Positioning & Flow: additive Trading Analytics view
`/strategy/trading-analytics?view=flow` keeps participant outstanding position,
FII report activity/value and anonymous exact-option strike flow explicitly
separate. It adds participant position/change quadrants, rotation, FII/Pro and
Client comparisons, a compact strike OI/change/volume matrix, contract-level
build-up states, an OI/volume bubble map, four participant-history small
multiples, next-session descriptive evaluation and complete JSON/CSV evidence.
Client remains `Client (reported)`; missing baselines remain null; no strike is
attributed to a participant. Morning View, OI & PCR, Scalper V1/V2, Trade Log,
collectors, strategy calculations, exports and order permissions remain intact.
Evidence: `docs/trading-analytics/POSITIONING_AND_FLOW_20260912.md`.

2026-09-18 Paper audit repair: serial authenticated refresh retains hydrated
rows; returning to the tab revalidates. Open-position marks are independent of
completed analytical trackers, with valid forward OHLC only. Additive
`evidence_audit` warns about corrupt prices and unverified legacy horizons.
Recorded fills, strategy/targets, costs, reserves, comments, exports and
permissions remain unchanged. Historical research replay is explicitly pending.
Evidence: `docs/OIIS_PAPER_AUDIT_REPAIR_20260918.md`.

2026-09-19 Home MWHD staged funnel: the existing Bull/Bear strategy comparisons,
weights and full evidence export remain unchanged. Home initially renders ten
ranks per direction, with all remaining rows available explicitly. The Trading
shortlist adds separate staged counts and passed-candidate lists for MWD, H, 15m
and 5m. Failed prerequisites leave deeper stages unavailable; they are not
relabelled as failures or zeros. Existing OIIS qualification, personal picks,
Stock 360 links, orders, V1/V2 analytics and notification controls are preserved.
Evidence: `docs/uiux/HOME_MWHD_STAGED_FUNNEL_20260919.md`.

2026-09-20 Scalper V2 time-axis and IV extension: the existing underlying, CE,
PE, OI and ΔOI views remain intact. Timestamp analytics use the same explicit
session/linked X domain and shared cursor; the lower OI-difference pair aligns
to the price-grid columns and marks Day open on X. A third compact strike chart
adds exact-contract ΔIV only when a prior retained IV observation exists.
Missing IV remains unavailable. Health, Formula, Conditions, freshness alerts,
exports, drawings, A-B measurement, independent CE/PE selection and pop-out
remain accessible in two compact header rows. No strategy or order behavior is
changed. Evidence: `docs/trading-analytics/SCALPER_V2_AXIS_IV_HEADER_REPAIR_20260920.md`.
# Superseding note — 20 September 2026 — Scalper V2 parent header

- On `view=scalper_v2` only, hide the redundant parent title, NIFTY strategy
  link, Health, Formula and Conditions controls to recover vertical space.
- Preserve the remaining compact parent controls and all evidence in the
  Scalper V2 workspace/export. Other Trading Analytics views retain the shared
  title and evidence controls.
- Implementation record:
  `docs/trading-analytics/SCALPER_V2_PARENT_HEADER_REDUCTION_20260920.md`.

## 2026-09-22 Scalper V2 three-instrument EMA potential reference

- The existing `scalper_v2` three-pane workstation adds a yellow potential
  reference star from exact, completed 5-minute underlying + selected CE +
  selected PE EMA9 alignment.
- CALL requires underlying/CE below-to-above and PE above-to-below; PUT is the
  exact inverse. Each leg crosses on the current or prior bar and retains at
  least two source-side closes in its five-bar pre-cross history.
- The signal is evidence only. Existing V7 and OI-direction rules, independent
  CE/PE selection, measurements, drawings, exports and execution restrictions
  are unchanged. Missing exact bars remain missing.
- Voice uses the existing opt-in browser preference, announces only a newly
  generated current-day reference and is locally deduplicated.
- Evidence:
  `docs/trading-analytics/SCALPER_V2_THREE_INSTRUMENT_EMA_REFERENCE_20260922.md`.

## 2026-09-23 Scalper V2 OI source consistency

- Selected values, profile, ranking, strike structure and cumulative analytics
  use one current atomic NSE option-chain snapshot for NIFTY.
- OI is displayed in contracts. Delta OI is the exchange/provider-reported
  session change from that same snapshot; missing/stale values remain missing.
- SmartAPI quote/depth evidence remains retained and accessible, but its
  underlying-unit OI and local one-minute OI difference are not mixed into the
  NSE contract/session-change cohort.
- Existing chart layout, selection, drawings, signals, exports, collectors and
  order restrictions remain unchanged.

## 2026-09-23 Scalper V2 tentative marker pane routing

- Three-instrument tentative calculations remain unchanged.
- The underlying displays CALL and PUT context; CE displays tentative CALL only;
  PE displays tentative PUT only. A valid PE/PUT reference can no longer be
  duplicated as a false `Tentative CE` marker.
- Marker shapes/colours, volume confirmation, speech, established signals,
  exports and order restrictions remain unchanged.
- Evidence: `docs/trading-analytics/SCALPER_V2_TENTATIVE_PANE_ROUTING_20260923.md`.

## 2026-09-23 3Month stock-wise page evidence

- `/strategy/three-month` retains the current-session Bull/Bear screener,
  completed/forming policy, exact live arithmetic, Stock 360 links and CSV.
- An additive historical section presents the already-generated report's
  overall results, all 500 stock summaries and on-demand per-stock trade rows.
- Selected-stock evidence retains causal and look-ahead entry labels, all six
  Month/Week/Day equations, M−1/M−2/M−3 open-close values and the ANY-1 OR
  state. Missing outcomes remain unavailable.
- The UI consumes the mounted report CSV through a cached read-only endpoint;
  strategy calculations, report files, live screening and order permissions
  are unchanged.
- Evidence: `docs/THREE_MONTH_BULL_BEAR_BACKTEST_20260922.md`.

## 2026-09-23 Header Today Outlook containment

- The existing Morning View market-matrix result remains the source of the
  header outlook and retains its positive/negative/neutral colour semantics.
- The header control is now two rows: the final result remains prominent on the
  first row, while Equity/Futures/Options activity and values occupy a smaller
  second row. The complete source/date disclosure remains in the accessible
  title and label.
- Desktop and mobile containment checks prevent the outlook from overflowing
  its header slot. Morning View calculations, reports and navigation are
  unchanged.
