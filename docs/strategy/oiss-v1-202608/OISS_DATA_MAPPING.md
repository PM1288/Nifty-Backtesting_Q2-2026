# OISS data mapping

| OISS Field | Classification | Existing Source | Existing Field/API/Table | Calculation Required | Formula Version | Historical Coverage | Freshness | Fallback | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Universe/symbol | REUSE_EXISTING | SmartAPI instrument master | `oiis_live.universe_member`, `public.instruments` | None | source-owned | Point-in-time membership unavailable | Daily | none | Current F&O membership; survivorship warning applies |
| Company/sector/membership | REUSE_EXISTING | stock profile import | `public.instrument_profiles` | None | source-owned | Current snapshot | profile `source_as_of` | UNCLASSIFIED | No invented sector |
| OHLCV/indicators | REUSE_EXISTING | NSE/SmartAPI/Yahoo fallback | immutable `oiis_live.daily_candidate.evidence.feature` | None | OIIS 3.9 | 11 Aug 2026 onward for governed intraday snapshots | each scan | null | Snapshot is retained, not recomputed from current data |
| OFactor long/short | REUSE_EXISTING | OIIS directional engine | `evidence.ofactor_long/short` | select stronger direction | OIIS 3.9 | governed snapshot history | each scan | null | OISS does not duplicate canonical OIIS component math |
| XFactor | REUSE_EXISTING | OIIS execution engine | `xfactor_snapshot`, `evidence.xfactor` | None | OIIS 3.9 | governed snapshot history | each scan | null | setup, stop, R:R and extension reused |
| DQ components | DERIVE_FROM_EXISTING_RAW_DATA | OIIS DQ evidence | `evidence.dq` | OISS weights + critical minimum | OISS .0 | governed snapshot history | each scan | DATA_INSUFFICIENT | critical floor prevents averaging away failure |
| TQS | NEW_DERIVED_FIELD | OFactor/XFactor/extension | `oiss.candidate` | `.55O + .45X + penalty` | OISS .0 | all replayed scans | each scan | null | hard gates override score |
| Sector rotation | DERIVE_FROM_EXISTING_RAW_DATA | directional component evidence | candidate sector components | cross-stock sector aggregation | OISS .0 | all replayed scans | each scan | DATA_INSUFFICIENT | sample size persisted |
| Entry/stop/targets | REUSE_EXISTING + DERIVE | OIIS setup/structural stop | `evidence.xfactor` | 10% risk buffer zone; 1.5R/2R targets | OISS .0 | all eligible snapshots | each scan | null | every entry is a zone |
| Lot size | REUSE_EXISTING | SmartAPI master | `public.instruments.lotsize` | latest valid contract | source-owned | current instrument master | daily | null | never hard-coded |
| Options/depth/Greeks | REUSE_EXISTING + DERIVE | SmartAPI chain | `smartapi_option_chain_snapshots` | ATM-nearby relative liquidity score | OISS .0 | 11 Aug 2026 onward | quote timestamp | DATA_INSUFFICIENT | only quotes at/before scan; 15-minute maximum age |
| Events | UNAVAILABLE for full historical replay | NSE event calendar | `market_data.nse_event_calendar` | no safe point-in-time publication model | — | partial | event feed | DATA_INSUFFICIENT | never fabricated |
| Futures participation | REUSE_EXISTING | OIIS money-flow component | immutable OFactor evidence; raw `oi_snapshots_futures` | no duplicate in v0 | OIIS 3.9 | raw begins 8 Aug 2026 | live snapshots | null | exact raw lineage retained in source snapshot |
| Paper positions | REUSE_EXISTING | canonical paper engine | `paper_trading.trade_groups` | strategy filter | paper policy | after activation | event-driven | NONE | paper flag remains off |
| Forward outcomes | NEW_DERIVED_FIELD | canonical daily bars | `public.bars_1d` | separate D+1..D+5 pass | OISS .0 | bars through current date | post-scan | DATA_INSUFFICIENT | never enters feature snapshot |
