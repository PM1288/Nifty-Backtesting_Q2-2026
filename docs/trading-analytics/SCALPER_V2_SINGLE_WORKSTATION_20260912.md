# Scalper V2 single-workstation refinement — 12 September 2026

## Scope

This change refines only the existing authenticated
`/n50/strategy/trading-analytics?view=scalper_v2` route. The original Scalper,
V7 signal calculation, A-open/B-close measurement, independent CE/PE contract
selection, drawings, collectors, exports and order permissions are unchanged.

## Primary workstation changes

- The command bar is grouped into Time, Contract, Scale, OI, Tools and More.
- The permanent inspector now keeps NIFTY, both selected premiums, session
  return, EMA distance, OI, change in OI, IV, spread, PCR, Max Pain and CE/PE
  leaders together. Historical candle values and latest-chain metrics have
  separate scope labels.
- The underlying profile defaults to four lanes: CE OI, CE change, PE change
  and PE OI. Strike Y coordinates continue to come from the underlying native
  price transform. CE/PE identity is blue/yellow; signed change is green/red.
- Coincident or pixel-near current-price, selected-strike, Max Pain and leader
  labels are merged by priority before being attached to the right axis.
- Large vertically stacked analytics are replaced by one tabbed Analytics Dock.
  Its default Overview contains the structure ribbon and one-row-per-strike
  Option Structure Matrix with OI/change magnitude bars and selected, ATM,
  leader, Max Pain and current-NIFTY context.

## Price and OI analytics

- Option-price comparison now defaults to stable Return from Open percent.
  Indexed to 100, relative-to-selected-side and the legacy Range Normalised
  calculation remain selectable.
- The default line set contains selected contracts, CE1/CE2/PE1/PE2 and nearby
  strikes. Show All remains explicit. A complete-chain return heatmap uses time
  columns and strike rows with red/green return semantics.
- Change-in-OI uses an adaptive signed domain with zero retained, avoiding an
  unused half-chart for one-sided sessions.
- The former Cumulative OI label is now Total OI vs Time because each point is
  a snapshot total, not an accumulation of earlier snapshots.
- PCR and Max Pain are compact KPIs in the primary workspace; their deeper
  evidence remains in Analytics Dock tabs and JSON/CSV exports.

## Verification

Focused deterministic tests cover price modes, default series selection,
adaptive change-in-OI domains, semantic-level merging, structure rows/totals
and four-lane profile geometry. Authenticated local browser coverage is in
`tools/playwright/scalper-v2-single-workstation.mjs`; output remains outside
Git and checks chart/native geometry, readable pane heights, the permanent
snapshot, matrix/dock, profile alignment, hover network silence, heatmap,
Total OI naming, expanded change-in-OI and 1440px containment.

Deployment is not part of this change unless separately authorised under the
canonical release policy.
