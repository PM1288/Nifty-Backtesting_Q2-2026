# Compact UI V5 annotated comment matrix

Status: baseline recorded before V5 layout changes on 2026-08-26.

## Source status

- `Updates-required_260825_232528.pdf`: `UNVERIFIED` — the named PDF is not present under `/home/novius2` after an exact filename and broad `Updates-required*.pdf` search.
- The 19-page directions transcribed in the V5 implementation prompt are treated as the provisional binding annotation source.
- V4 preservation baseline reviewed from `UX-rehaul-v2/CODEX_PROMPT_NIFTY50_UI_UX_STANDARDISATION_FREE_STACK_V4.md` and the page-by-page critical review.
- Handover ZIP integrity passed `unzip -tq`.

| PDF page | Represented route/surface | Annotation interpreted from V5 prompt | Implementation disposition | Shared primitive | Preservation risk | Required evidence |
|---:|---|---|---|---|---|---|
| 1 | `/` Today / sector heatmap | Remove duplicate transport band and stock-mix panel; combine board controls; move evidence upward | Compact global shell and one heatmap toolbar; relocate unique coverage counts | `CompactAppHeader`, `UnifiedContextBar` | High: live feed/freshness and 209 stock visuals | Before/after Y position, tile count, ticker and alert checks |
| 2 | `/strategy/oiis-live` Daily selection | Remove hero; compact no-trade state; convert six funnel cards to a stage strip | Current-state band plus clickable funnel and evidence-first layout | `CompactStatusBand`, `KpiStrip` | High: blockers, policy and run metadata | Funnel reconciliation and blocker drill-through |
| 3 | `/strategy/trendlyne-summary` | Remove hero/static source tile; one toolbar; one KPI strip; charts directly below | Compact strategy workspace | `UnifiedContextBar`, `KpiStrip`, `InfoPanel` | Medium: source/freshness semantics | Report count, filters, exports, chart series |
| 4 | `/strategy/monthly` context | Remove hero/loading card and duplicate filter rows | One context row with inline progress | `UnifiedContextBar` | High: all-stock/rejected population | Selected and not-selected row parity |
| 5 | `/strategy/monthly` evidence | Dense complete ledger with pinned identity | Internal-scroll evidence grid | `DenseEvidenceGrid` contract | High: all existing strategy columns | Column manifest and CSV parity |
| 6 | `/strategy/rolling-monthly` | Same shared grammar as Monthly | Shared monthly/rolling shell and KPI strip | Strategy compact primitives | High: rolling window distinctions | Population/status/target parity |
| 7 | `/strategy/long-options` router | Remove hero and static policy prose | Compact tabs/context/status | Strategy compact primitives | High: no-trade reason and data readiness | Rule and hard-gate reconciliation |
| 8 | `/strategy/long-options` funnel/routes | Replace route cards with segmented row | Compact funnel and route-status row | `KpiStrip`, `CompactStatusBand` | Medium: route-specific explanations | Route count and status details |
| 9 | `/strategy/long-options` evidence | Move executable structures into first viewport | Dense evidence table immediately after status | `DenseEvidenceGrid` contract | High: hard-gate fields | Column/export parity |
| 10 | `/paper-trading` header | Remove hero/four fact tiles; combine modes, lenses, counts and actions | Compact paper command row | `LensNavigationBar` | Critical: notifier, voice, add/export/save | Interaction and route-state tests |
| 11 | `/paper-trading` context/overview | Merge filter rows; one current-state overview | Unified context, compact status and KPI strip | `UnifiedContextBar`, `KpiStrip` | Critical: accounting-class distinction | Accounting-lane and URL-state tests |
| 12 | Paper Factor Analysis | Dedicated URL lens only | Mount parallel/factor visuals only for active lens | `LensNavigationBar` | High: export and selected trade linkage | Active canvas count and export test |
| 13 | Paper capital recycling | Dedicated lens; compact selectors/outcomes | Active-lens simulation workbench | `KpiStrip`, `InfoPanel` | High: two exit policies cannot mix | Simulation comparison parity |
| 14 | Paper capital timeline | Timeline remains primary evidence | Internal chart workspace and inspector links | Chart frame contract | Medium: all intervals/trades | Underlying data/export check |
| 15 | Paper Reward & Pain | Dedicated lens and less framing | Compact local toolbar plus selectable plot | Chart frame contract | High: observed versus booked semantics | Bubble selection and denominator check |
| 16 | Paper trade summary | One toolbar and one 8-cell metric strip | Compact evidence header | `KpiStrip` | High: aggregation basis | Summary reconciliation |
| 17 | Paper full evidence grid | Reduce whitespace, sticky grouped headers and pinned identity/actions | Full-height internal-scroll grid | `DenseEvidenceGrid` contract | Critical: no column/raw precision loss | 8–12 row target and Full Audit parity |
| 18 | Paper scenario/methodology area | Move scenario and audit to dedicated lenses | Conditional lens mounting | `LensNavigationBar`, `InfoPanel` | High: scenario/accounting separation | URL/deep-link and inactive-mount checks |
| 19 | Paper Simple View | Compact additional mode; unchanged full inspector; CSV/XLSX all filtered rows | Preserve existing Simple View and densify toolbar/table | Simple grid preset | High: current-price hypothetical label | Existing Simple View tests and export parity |

## Interpretation rule

No item described as removed is deleted until its unique fields are mapped in the preservation manifests. Dynamic warnings, source/freshness, accounting class and current run state remain directly visible. Stable prose moves to keyboard-accessible information surfaces.
