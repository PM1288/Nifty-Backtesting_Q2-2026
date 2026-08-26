# Compact UI V5 page-family templates

## Canonical page grammar

Every operational route now follows the same order:

1. compact global header, ticker and primary navigation;
2. route/lens navigation;
3. current context, source, as-of and freshness;
4. compact dynamic status or warning;
5. one horizontal KPI/funnel strip;
6. the active evidence surface;
7. a selected-entity inspector;
8. named secondary lenses and export/audit actions.

Stable methodology is not repeated above evidence. It remains reachable through an information surface, inspector or reference lens. Dynamic failures and stale states remain visible.

## Shared contracts

| Primitive | Contract | Source |
|---|---|---|
| Compact shell | 34 px app header, 24 px ticker, 36 px primary navigation | `AppShell`, `HeaderTicker`, `ResponsiveWorkspaceNavigation` |
| Lens navigation | One keyboard-accessible row; URL is canonical | `LensNavigationBar` and existing route tab controls |
| Context bar | One desktop row, 28–30 px controls, hidden active filters exposed | `UnifiedContextBar`, `StockUniverseFilterBar compact` |
| Status band | Current result/reason/as-of in 44–64 px | `CompactStatusBand`, compact `DecisionHero` |
| KPI strip | One bordered strip; no prose cards | `KpiStrip`, compact `ExecutiveKpiStrip` |
| Evidence grid | Sticky header, internal scroll, 32/42/46 px density tokens | existing ledgers plus compact table contract |
| Information | Click and keyboard access; hover is optional enhancement | `InfoPanel`, existing evidence inspectors |

## Families

### Home / Today

The live market state remains first. Sector controls and stock-universe classification share one toolbar. The previous standalone concentration panel is removed because its filtering/count context is now colocated with the board.

### Strategy

Current decision and failure reason precede the funnel. Monthly and Rolling share the same context, KPI and ledger grammar. Universe, cap and sector filtering is embedded in the same context bar. Full rejected/incomplete evidence remains selectable and exportable.

### Paper Trading

Portfolio, Simple View and explanatory mode remain distinct. Overview mounts only current-state evidence. Factor, Path, Reward & Pain, Capital Recycling, Scenario and Methodology mount only in their selected URL-addressable lens. The canonical inspector and all accounting classes are preserved.

### Analytics / Stock / Market / Backtesting

Shared analytical pages inherit compact outer spacing, compact page headers, status strips and KPI metrics. Existing route-specific evidence and calculations are unchanged. Heavy views remain route/lens based rather than being duplicated into summaries.

### Options / Institutional / Catalysts / Operations

The compact `PageHeader`, `DecisionHero`, `ExecutiveKpiStrip` and analytical page tokens standardise these families. Warnings, data quality and permission boundaries remain visible.

## Responsive rule

Desktop uses one-row controls and KPI strips. Tablet keeps priority controls and uses contained horizontal overflow. Mobile is an inspection workflow: evidence tables retain internal scrolling/focus, and full values remain available through inspectors and exports.
