# Scalper V2 stable minute refresh

## Cause and repair

The parent context polls every minute and returns a new `asOf`. That timestamp
was part of both chart and option-price-history query keys, so every context
response replaced the active query with an empty cache entry. The early loading
return unmounted all three charts. A data-dependent prefetch effect then fetched
the other three intervals again. The global version guard also automatically
reloaded open charts after a deployment.

Live chart requests now omit `asOf` and let the server resolve the current time.
Explicit replay cutoffs remain in the request/key. Active charts and context
poll every 60 seconds without focus-triggered fetches. React Query retains the
previous successful response during same-context refreshes. The automatic
interval sweep is removed; other intervals load on selection. Price strength
history loads/polls only while its dock is selected. The existing incremental
series update implementation continues handling new candle data.

In Scalper V2 only, an available app release displays an Apply update button;
it does not automatically reload the document.

## Freshness alerts

The view checks each exact underlying/CE/PE last completed candle against the
latest opened session from the API's authoritative exchange calendar. Tolerance
is the selected interval plus two minutes. The opening period waits for a
completed candle. After the close/weekends, the last exchange session is used.
Missing calendar evidence displays unknown, not current. Deliberately selected
older sessions/replay are disclosed as historical and do not raise live alarms.

Missing/delayed data or request failures show a persistent in-page alert. Browser
notifications are sent once per issue while the view is mounted when permission
is granted; an Enable data alerts control requests that permission. These are
active-workstation alerts, not a new unattended server/WhatsApp monitoring job.

## Verification

Web typecheck, 221 tests and production build pass. API typecheck, 252 tests and
build pass. Canonical repository gate passes. New freshness tests cover missing
and stale contracts, opening grace, absent calendar and weekend session rules.
The browser regression observes 70 real seconds, checks native chart node
identity, document navigations, selected-interval request count, lazy history
loading, and a simulated deployment version mismatch.

## Production evidence

Release `bc3e42b` is pushed to the feature branch and master. The dashboard-only
deploy passed health and routed-page checks. Rollback source:
`before-scalper-v2-stable-refresh-20260919`.

Authenticated Chromium at 1920×1080 observed a full 70-second polling window:
one initial document navigation, zero automatic reloads, the same three native
chart DOM instances throughout, and one initial candle setData per pane with no
additional history hydration. Only one context request and one selected 5m
chart request occurred during the window. Hidden option-price history and the
other three intervals made no requests. The chart requests took 2454ms initially
and 2518ms on refresh; context requests took 1093ms and 1095ms. These are observed
network timings, not input-latency percentiles or an open-market performance
guarantee. Existing data stayed visible during the requests.

A browser-only missing-candle fixture showed a stale alert and one notification
constructor call with permission mocked granted. This validates the dispatch
path; it is not evidence of an OS notification delivered to the user's device.
No synthetic data was written to the server. The real check ran on Saturday and
correctly used Friday 18 September as the most recent exchange session.
The existing authenticated pop-out, cursor, side-chart and volume preservation
suite also passed 14/14 checks.

Evidence (outside Git):
`/home/novius2/NIFTY50/evidence/scalper-refresh-20260919/` and
`/home/novius2/NIFTY50/evidence/scalper-refresh-preservation-20260919/`.
Live image: `sha256:7ccc697bf967e09de75f9d25b6b8887d6f564f9fc49fc5847f447b0711b30d8b`.
Entry asset: `/n50/assets/index-DAEIAePK.js`.
