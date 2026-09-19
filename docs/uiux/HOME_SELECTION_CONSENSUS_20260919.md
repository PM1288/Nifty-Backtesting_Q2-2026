# Home selection consensus — 19 September 2026

## Scope

The existing collapsed Home `Trading list` sidebar now combines four explicitly
separate stock-selection sources:

- authenticated user's browser-local Manual list;
- fully completed same-session MWHD Bull or Bear route (the Home MWD progression);
- same-date `selected=true` OIIS candidates with an exact Long/Short direction;
- completed-mode, same-session qualified 3Month Strategy rows (Long only).

This is an evidence aggregation view. It does not alter any strategy, manufacture
a direction, place an order, or relabel a stale strategy response as today's
selection.

## Ranking and display contract

One source counts at most once for one exact `symbol + direction`. The sidebar
sorts first by independent source agreement, then by the existing directional
MWHD rank, then symbol. The top `Today's selection consensus` block shows every
tie at the maximum agreement and names each contributing source. `4/4` means the
same symbol and direction appeared in Manual, MWHD, OIIS and 3Month; it does not
mean a trade was approved.

The source ledger beneath it expands to show every current selection separately
for Manual, MWD/MWHD, OIIS and 3Month. Overall unique-stock and directional-pick
counts remain distinct because one stock may legitimately occur as both Long and
Short across user/strategy evidence. Existing Long and Short detail cards retain
price, daily change, Bull/Bear ranks, incomplete-input warning, source timestamps
and Stock 360 links.

## Date and missingness rules

- MWHD requires the response session and all H/15m/5m source timestamps to be the
  current IST calendar day.
- OIIS requires a completed same-date run, `selected=true`, exact same-date row
  and Long/Short direction.
- 3Month requires the response and row session dates to be current plus
  `qualification=QUALIFIED`; stale completed sessions are disclosed, not counted.
- Manual selections are intentionally persistent and are labelled Manual rather
  than being presented as a strategy result.
- Unavailable source responses remain visible as loading/error/no-current-run
  states and never become zero selections silently.

## Preservation and validation

No API, database, strategy calculation, paper/live order, alert or permission
contract changed. The existing lazy-open data behavior remains: OIIS and 3Month
are fetched only while the sidebar is open, while the Home progression and quote
models are reused.

Automated unit coverage verifies four-source agreement ordering, exact source
deduplication, recommendation rejection, stale date rejection and qualified-only
3Month inclusion. Browser coverage in
`tools/playwright/home-trading-shortlist.mjs` verifies all four source groups,
the consensus block, manual persistence/removal, mobile containment, idle-close
and keyboard behavior.

