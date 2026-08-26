# OISS v1.202608 — Current State, Available Data and Limitations

Snapshot prepared **26 August 2026 UTC** from the canonical PostgreSQL database and deployed source at commit `c21bb2d`. Documentation/export follow-up is tracked separately. OISS is an independent strategy; existing OIIS behavior and records are unchanged.

## 1. Executive status

OISS is deployed and usable as an **INTELLIGENCE / SHADOW evidence workbench**. It can replay immutable OIIS decisions, score and classify every stock, retain rejected opportunities, calculate sector/carry evidence, select point-in-time option contracts where the chain passes quality gates, calculate preliminary sizing, compare scans, evaluate daily forward paths and export the result.

It is **not yet an automated paper-execution or live-execution strategy**. The scheduler, paper, assisted and live-candidate flags remain disabled. No real broker-order path exists.

Latest completed run:

| Field | Value |
|---|---|
| Run ID | `887aaa1d-688c-4e0b-99a9-cfd7de7776cf` |
| Decision timestamp | 25 August 2026, 15:00 IST |
| Stocks evaluated | 208 |
| Data-quality grade | F, 49.00 |
| Actionable | 0 |
| Rejected/data-insufficient | 208 |
| Final decision | `NO TRADE` |
| Reason | No candidate passed every actionability gate |

The F grade and no-trade result are not replaced by a more favourable estimate. Critical-source quality floors override averages.

## 2. Historical OISS evidence currently available

| Measure | Available |
|---|---:|
| Governed period | 11–25 August 2026 |
| Trading sessions | 11 |
| Official scans/session | 12 |
| Completed runs | 132/132 |
| Stock observations | 27,456 |
| Distinct symbols | 208 |
| BUY NOW observations | 11 |
| WATCH observations | 4 |
| WAIT FOR BREAKOUT observations | 2 |
| NO CHASE observations | 53 |
| NO TRADE observations | 16,657 |
| DATA INSUFFICIENT observations | 10,729 |
| Point-in-time selected option contracts | 5,782 |
| Forward outcome rows | 27,456 |
| Mature D+5 outcomes | 14,976 |
| Developing outcomes | 9,984 |
| Outcome data insufficient | 2,496 |
| Look-ahead violations | 0 |
| Duplicate run/symbol rows | 0 |

## 3. Canonical source data available

| Data | Current coverage | OISS use | Important qualification |
|---|---|---|---|
| Immutable OIIS scan snapshots | Governed OISS bootstrap from 11 August 2026 | Source features, OFactor, XFactor, setup, stop, data-quality evidence | This is the decision-time source of truth for replay |
| One-minute bars | 11 May 2026 through 26 August 2026 02:17 UTC | Available for a future minute-path outcome evaluator | Not yet used for 15/30/60-minute OISS outcomes |
| Daily bars | 9 January 2023 through 25 August 2026 | D+1 through D+5 close, daily MFE and MAE | Does not establish intrabar target/stop ordering |
| SmartAPI option-chain snapshots | 11–25 August 2026 | Point-in-time ATM/near-ATM option selection | Contract must be at/before scan and no more than 15 minutes old |
| Futures OI snapshots | 8 August 2026 through 26 August 2026 02:18 UTC | Reused indirectly through immutable OIIS participation evidence | No separate OISS futures-OI panel is persisted yet |
| Instrument profiles | 268 profiles: 208 F&O, all 268 in the profiled NIFTY 500 scope | Company, sector, membership and stock identity | Current snapshot, not historical point-in-time membership |
| Instrument master | Current exchange instruments and lot sizes | F&O eligibility and verified current lot size | Historical lot-size versioning remains limited |
| NSE event calendar | Partial/current records | Not used for historical actionability | Publication-time semantics are insufficient for safe replay |
| Canonical paper ledger | Available | OISS-originated rows can be filtered/deep-linked | No OISS paper trades exist because paper activation is off |

## 4. What is working

| Capability | State | Evidence/behavior |
|---|---|---|
| Independent strategy identity | WORKING | `OISS_V1_202608`, framework/formula/config versions persisted |
| Idempotent run persistence | WORKING | Unique source/version identity; reruns do not duplicate candidates |
| Data-quality calculation and grade floor | WORKING | Component weights plus critical minimum; exact boundary tests pass |
| Long/short opportunity selection | WORKING | Reuses immutable OIIS OFactor long/short and selects the stronger direction |
| Extension/no-chase | WORKING | ATR buckets and penalties are config-driven |
| XFactor and TQS | WORKING | XFactor reused; TQS `.55 × O + .45 × X + extension penalty` |
| Canonical statuses | WORKING | BUY NOW, SELL NOW, wait/watch, no-chase, no-trade and data-insufficient logic |
| Four explanations | WORKING | Why, missing confirmation, upgrade condition and invalidation persisted per stock |
| Entry zone/stop/targets | WORKING WHEN INPUTS EXIST | Derived from source reference price and structural stop; otherwise null |
| Sector rotation | WORKING | 18 current sector rows; score/state and sample size persisted per scan |
| BTST/STBT/H2/H3/H4 scoring | WORKING AS RESEARCH SCORES | Scores and qualification states persisted per stock |
| Option contract selection | WORKING WHEN DATA PASSES | 5,782 historical point-in-time selections with liquidity evidence |
| Preliminary position sizing | WORKING WITH CURRENT CONFIG | Risk-based, capital-based and maximum-lot limits calculated |
| Rejected-trade retention | WORKING | Rejected/no-chase/data-insufficient candidates remain inspectable and backtested |
| Scan-to-scan comparison | WORKING | Appeared/improved/declined/status changes persisted for every current stock |
| Historical daily outcomes | WORKING | D+1…D+5 closes and daily MFE/MAE stored separately from decision features |
| Leakage and duplicate validation | WORKING | Zero violations and zero duplicate run/symbol rows |
| Dashboard | WORKING | 13 URL lenses, selected-stock inspector, historical run selection |
| Exports | WORKING | API JSON, CSV and Excel; this handoff adds canonical database CSV extracts |
| Isolated runtime container | WORKING | Healthy shadow container; existing OIIS is not modified |

## 5. Partially working or not yet implemented

| Capability | State | Exact limitation / required work |
|---|---|---|
| Daily OISS scheduler | DISABLED | Runtime polling exists but remains off until shadow acceptance; current results depend on explicit replay/scan commands |
| Paper execution | NOT ACTIVE | Metadata/schema/deep links exist, but no OISS paper intent is emitted; complete paper-risk reconciliation and enable separately |
| Live/assisted execution | NOT IMPLEMENTED/ENABLED | No broker-order path; separate approval is mandatory |
| Full market-regime section | PARTIAL | Formula is implemented and unit-tested, but the complete NIFTY/BANKNIFTY/breadth/VIX/futures/gap result is not yet persisted into each run section |
| Critical index levels | PARTIAL | Existing source reuse is identified; current OISS run records `REUSE_EXISTING_PENDING_API_VIEW` rather than full S1/S2/R1/R2/VWAP maps |
| Macro/event risk | DATA INSUFFICIENT | No safe historical publication-time model; events are not fabricated |
| Standalone money-flow section | PARTIAL | Participation inputs exist inside candidate/sector evidence; a complete section-level money-flow package is not persisted |
| Option-quality actionability gate | PARTIAL | Contract selection runs after the initial status decision; selected-contract liquidity is not yet fed back into XFactor/actionability |
| Option position sizing | PARTIAL | Premium/lot metadata is populated, but full current margin, free-margin and economic stress-risk gating is not complete |
| Portfolio risk | PARTIAL | Configured account risk and per-candidate sizing exist; open-risk, margin, direction, overnight, daily-loss and correlation totals are not fully calculated |
| Existing-position management | NOT ACTIVE | Dashboard can list canonical OISS paper groups, but deterministic HOLD/TRAIL/PARTIAL/EXIT management has no positions to operate on and is not activated |
| Intraday 15/30/60-minute outcomes | NOT IMPLEMENTED | Minute data exists; a point-in-time evaluator still needs to be added |
| Target-before-stop chronology | NOT IMPLEMENTED | Daily bars cannot safely establish event order; minute-path reconstruction is required |
| D+1 OHLC and detailed H2–H4 path | PARTIAL | Daily closes and extrema exist; complete horizon event records are not yet persisted |
| Backtest analytics by decile/regime/sector/time | PARTIAL | Raw decisions/outcomes and a basic dashboard aggregate exist; full requested cohort panels are not yet implemented |
| Walk-forward calibration | NOT PERFORMED | Formula `.0` remains unchanged; no threshold optimisation is claimed |
| Point-in-time universe membership | UNAVAILABLE | Current F&O membership is applied retrospectively; `SURVIVORSHIP_BIAS_POSSIBLE` |
| Historical lot-size versioning | PARTIAL | Current verified master is used; past contract changes are not fully reconstructed |
| Parquet export | NOT IMPLEMENTED | JSON, CSV and Excel are available |
| OISS alert events | NOT IMPLEMENTED | No OISS-specific actionable/change notifications are published |

## 6. Accuracy and interpretation

- Decision features and later outcomes are stored separately.
- `source_max_event_time <= scan_timestamp` is enforced and independently validated.
- Rejected candidates are preserved, preventing winner-only backtest bias.
- `DATA INSUFFICIENT` and null are retained; they are not converted to zero.
- Daily MFE/MAE is observational and does not prove that the extreme was executable.
- The available history is a short bootstrap sample. It is not sufficient to establish strategy superiority or stable expectancy.
- The current-universe replay can contain survivorship bias.
- Current latest-run DQ F correctly prevents actionable output.

## 7. CSV handoff files

| File | Rows including header | Purpose |
|---|---:|---|
| `OISS_CURRENT_RUN_2026-08-25.csv` | 2 | Complete latest run identity, sections and runtime |
| `OISS_CURRENT_STOCK_RADAR_2026-08-25.csv` | 209 | Latest 208-stock decision/evidence package plus current outcomes |
| `OISS_CURRENT_SECTOR_ROTATION_2026-08-25.csv` | 19 | Latest sector ranking |
| `OISS_CURRENT_SCAN_CHANGES_2026-08-25.csv` | 209 | Latest scan comparison |
| `OISS_HISTORICAL_RUNS_2026-08-11_TO_2026-08-25.csv` | 133 | All immutable OISS run records |
| `OISS_BACKTEST_DECISIONS_2026-08-11_TO_2026-08-25.csv` | 27,457 | All decision-time candidate records and evidence snapshots |
| `OISS_BACKTEST_OUTCOMES_2026-08-11_TO_2026-08-25.csv` | 27,457 | All separate forward outcomes joined to decision scores/status |
| `OISS_BACKTEST_SUMMARY_BY_STATUS_2026-08-25.csv` | 14 | Sample-size and return/extrema aggregates by status/maturity |

The large decision CSV intentionally retains the immutable feature/evidence JSON required to reconstruct a decision. These exports contain no credentials or broker secrets.

## 8. Recommended next sequence

1. Add and validate the minute-path evaluator for 15/30/60-minute returns and target/stop ordering.
2. Persist the full market-regime, index-level, event-state and portfolio-risk packages.
3. Feed point-in-time option liquidity/stress risk into final XFactor and actionability.
4. Run shadow scheduling across an agreed observation period and reconcile every daily run.
5. Add the canonical paper-intent adapter with idempotency and risk-gate tests.
6. Enable paper only after replay, shadow, sizing and duplicate-prevention acceptance.
7. Accumulate 20- and 60-session evidence before considering formula calibration.

