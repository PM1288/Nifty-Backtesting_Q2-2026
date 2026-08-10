# OIIS Live Complete Calculation and Selection Report — 10 August 2026

**Scope:** Complete per-stock calculation evidence for the corrected OIIS Live V3 directional snapshot.
**Environment:** PAPER ONLY. No live broker order is represented by this report.
**Run ID:** `bda6a133-0348-4c41-bb3b-e1ab580520ce`
**Run slot:** `AFTERNOON_1500`
**Policy:** `OIIS_DAILY_SELECTION_INTRADAY_ENTRY_V1.0` version `3.3`
**Signal/base daily date:** `2026-08-07`
**Trade date:** `2026-08-10`
**Decision as-of:** `2026-08-10T15:00:00+05:30`
**Physical execution timestamp:** `2026-08-10T23:15:47.879100+05:30`
**Requested universe:** `NIFTY50_FNO_INTERSECTION`
**Result hash:** `e70f2758c06c429eebd1dc4f2486a385280c979a7c2036fb62a983b24ff61a19`

## Executive conclusion

The run evaluated **50** symbols in the point-in-time NIFTY 50 and active-F&O intersection. **0** had FULL execution-grade evidence and **50** were retained as explicit data-insufficient rows. It produced **15** ranked research recommendations, **0** O/X-qualified rows, and **0** fully selected rows.

A recommendation is not a trade. The full directional scanner keeps LONG and SHORT opportunities visible. Automatic long-pullback paper entry remains a separate policy and requires FULL data, OFactor at least 74, XFactor at least 76, LONG direction and every blocking gate to pass.

## Time and source interpretation

1. The most recent completed cash-equity daily inputs were from 7 August 2026.
2. Each slot uses its governed point-in-time cutoff: 08:30, 09:30 or 15:00 IST. Physical backfill time is stored separately and never changes the data cutoff.
3. Intraday volume was compared with volume accumulated by the same IST clock time on previous sessions. It was not compared with prior full-day volume.
4. Daily history came from `nse.fact_eod_prices`, with `strategy_eval.stock_daily_regime` only as the governed fallback/regime source.
5. Live partial bars came from `public.bars_1m`; instruments came from `public.instruments`; sector context came from `public.index_constituents`; NIFTY/VIX and stock regimes came from `strategy_eval.market_regime_daily` and `strategy_eval.stock_daily_regime`.
6. All calculations are reproducible from the JSONB evidence stored on `oiis_live.daily_candidate` for the run ID above.

## Complete decision flow

1. Refresh the eligible universe as the intersection of active SmartAPI F&O underlyings and official NSE NIFTY 50 constituents.
2. Load at least 180 calendar days of daily OHLCV and the current partial intraday bar aggregation when available.
3. Calculate returns, SMA20, SMA50, EMA61, ATR14, RSI14, Williams %R14, MACD, volume history, prior 20-session barriers, relative strength and regime joins.
4. Calculate data-quality coverage, freshness, OHLC consistency and source reliability. Require DQ >= 85 and permission FULL.
5. Calculate all nine LONG OFactor components and weighted contributions.
6. Calculate all nine SHORT OFactor components independently. SHORT is never `100 - LONG`.
7. Subtract explicit OFactor penalties from each raw weighted score.
8. Calculate daily structural bias and current-session direction independently. A strong session direction controls the actionable direction; disagreement is explicitly labelled counter-trend.
9. Assign research cohorts LOW 54–<64, MEDIUM 64–<74 and HIGH >=74. Only HIGH satisfies canonical trade permission.
10. Create one canonical immutable setup result and use it for both XFactor and hard-gate evaluation.
11. Evaluate every V3.2 gate independently and store its rule, actual inputs, pass/fail result, blocking status and evidence table.
12. Rank the opportunity leaderboard by OFactor and its quality components. Rank execution readiness separately; failure count never hides a strong opportunity.
13. Set `selected=true` only for the separate long-pullback execution policy when direction is LONG, O >=74, X >=76, DQ is FULL and every blocking gate passes.
14. Only selected rows may become entry-enabled. Intraday entry subsequently requires RSI14 <30 and Williams %R14 <-80, with one entry per symbol per trade date.

## Shared scoring functions

- `clamp(x) = min(100, max(0, x))`.
- `linear(value, bad, good) = clamp((value - bad) × 100 / (good - bad))`; a missing value contributes neutral 50.
- `directional(value, LONG, magnitude) = linear(value, -magnitude, +magnitude)`.
- `directional(value, SHORT, magnitude) = linear(-value, -magnitude, +magnitude)`.
- `weighted score = Σ(component score × component weight / 100)`.
- `final OFactor = clamp(raw weighted OFactor - explicit penalties)`.
- `directional edge = LONG final OFactor - SHORT final OFactor`; the absolute value controls the 6/7/8 tier and the sign controls direction.

## OFactor definition

| Component | Weight | Exact meaning |
|---|---|---|
| Market Regime Support | 8% | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector and Industry Support | 14% | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Trend Quality | 18% | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Relative Strength | 10% | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Money Flow and Participation | 18% | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Momentum Quality | 12% | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Institutional Confirmation | 10% | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |
| Liquidity and Tradability | 6% | linear score of cross-sectional turnover percentile from 5% to 80% |
| Catalyst and Context | 4% | 50 when no event-risk flag is present; 0 when event risk is present |

Possible explicit OFactor penalties are exhaustion 8 points, conflicting price/volume flow 7, event risk 12, and timeframe conflict 5. Each stock section shows the penalties actually applied.

## XFactor definition

| Component | Weight | Exact meaning |
|---|---|---|
| Setup Integrity | 18% | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Entry Location Quality | 20% | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Trigger Confirmation | 16% | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Stop and Invalidation Quality | 14% | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Reward and Path Quality | 14% | linear score of reward/risk from 0.5 to 2.5 |
| Market and Sector Synchronisation | 6% | mean of the selected-direction OFactor market-regime and sector-support components |
| Liquidity and Slippage Quality | 6% | linear score of cross-sectional turnover percentile from 5% to 80% |
| Timing and Session Quality | 3% | fixed at 80 in this daily/live baseline |
| Instrument Quality | 3% | fixed at 100 for admitted cash-equity instruments |

## V3 gates and tiers

| Gate | Blocking? | Rule |
|---|---|---|
| Data quality | Yes | DQ >=85 and permission FULL |
| OFactor | Yes | canonical permission O >=74; LOW 54 and MEDIUM 64 remain research cohorts |
| Directional edge | Yes | absolute LONG/SHORT difference >=6; LOW 6, MEDIUM 7, HIGH 8 |
| Valid setup | Yes | directional breakout/breakdown or SMA20/SMA50 pullback with good volume |
| Setup volume | Yes through valid setup | volume/20D average >=1.2 OR comparable 90-session volume percentile >=30% |
| Liquidity | Yes | primary: volume ratio >=0.75 AND turnover percentile >=10%; fallback when a primary input is missing: volume percentile >=30% |
| Volume tier | Recorded | LOW 20%, MEDIUM 30%, HIGH 50% of comparable 90-session volume |
| Reward/risk | Yes | reward/risk >=1.5 from the canonical setup stop and real opposing barrier; otherwise NOT_CALCULATED |
| Extension | Yes | MoveATR=abs(current-session price-session open)/previous completed ATR <=1.8; VWAP distance stored separately |
| Stop width | No | risk per share / ATR14 <=2.5; failure is recorded but does not block in V3.2 |
| XFactor | Yes | XFactor >=76 |
| Trigger confirmation | Removed | `TRIGGER_CONFIRMATION_MISSING` is disabled and absent from V3.2 reasons |

## Run ledger for 10 August

| Run slot | Run ID | Status | Decision as-of | Executed at | Evaluated | Qualified | Selected | Result hash |
|---|---|---|---|---|---|---|---|---|
| LEGACY | 691f0f62-8c9b-4992-b94c-aa36589c48d4 | COMPLETED | NOT AVAILABLE | 2026-08-09T12:52:47.410257+00:00 | 500 | 0 | 0 | 03c4ee2129c694337e2f7e84267d30be1b631340207ffc5fb20b47065b62f271 |
| PREOPEN_0830 | b9d7f032-e6af-4172-ba39-cdab896bb10a | COMPLETED | 2026-08-10T14:25:48.424569+00:00 | 2026-08-10T14:25:48.424569+00:00 | 190 | 2 | 0 | 4adacfb424bc651048b8a99a25861079f61a4e64712e79121e12e74d18f80da7 |
| OPEN_0930 | 5558a95c-0e88-4057-8c33-8599496a051d | COMPLETED | 2026-08-10T14:25:57.304392+00:00 | 2026-08-10T14:25:57.304392+00:00 | 190 | 2 | 0 | 4adacfb424bc651048b8a99a25861079f61a4e64712e79121e12e74d18f80da7 |
| AFTERNOON_1500 | 25e329c5-577a-4e2e-917e-7024f46a7a28 | COMPLETED | 2026-08-10T14:26:05.253542+00:00 | 2026-08-10T14:26:05.253542+00:00 | 190 | 2 | 0 | 4adacfb424bc651048b8a99a25861079f61a4e64712e79121e12e74d18f80da7 |
| MANUAL_DEBUG | 1c051458-61f6-42e6-86d8-7779551d58cc | COMPLETED | 2026-08-10T14:38:52.017226+00:00 | 2026-08-10T14:38:52.017226+00:00 | 208 | 2 | 0 | 95eab5100e454692e0626f1d52125b87a55636944e0b7239a14a43941282a2a8 |
| MANUAL_V2_FINAL | a6744eb7-af21-4ca0-8ffe-b892801722cf | COMPLETED | 2026-08-10T14:41:52.748955+00:00 | 2026-08-10T14:41:52.748955+00:00 | 208 | 2 | 0 | 677ac36993ce7dad485a6fd1c0474a5c4a0088b7b5a86b84bebb652c129027bc |
| PREOPEN_0830 | 2640f39e-9b58-4420-8c7d-9197d187e996 | COMPLETED | 2026-08-10T03:00:00+00:00 | 2026-08-10T17:30:54.955854+00:00 | 500 | 3 | 0 | 3a9fc7c2336a27e206a10ffa23256e6fd6ee9e1ab01fa5d96fd3494741078a61 |
| OPEN_0930 | d2006614-2f3b-4d5c-82f5-f23936b9122a | COMPLETED | 2026-08-10T04:00:00+00:00 | 2026-08-10T17:31:03.395841+00:00 | 50 | 0 | 0 | 8bd06bfe148fad301d104136425f4bf70fdc13d403528192d207eaf0e0aa84ef |
| AFTERNOON_1500 | 54097e40-0f73-4ba5-ad58-429bf49fbe6a | COMPLETED | 2026-08-10T09:30:00+00:00 | 2026-08-10T17:31:25.204452+00:00 | 50 | 0 | 0 | 944775489ab91d93d934c57eb5cfa89b2af0e511667276a1fb052ec09fff3930 |
| PREOPEN_0830 | b2ff4f50-be54-43e9-ae27-13151b4e3733 | COMPLETED | 2026-08-10T03:00:00+00:00 | 2026-08-10T17:33:52.253746+00:00 | 50 | 0 | 0 | e521452a80dc9138c222c65550139e7e06c77000d9fd1bc0f369d85971fce875 |
| OPEN_0930 | eef2cc28-e77f-43fb-bad1-8109f57ccf49 | COMPLETED | 2026-08-10T04:00:00+00:00 | 2026-08-10T17:33:56.367995+00:00 | 50 | 0 | 0 | 8bd06bfe148fad301d104136425f4bf70fdc13d403528192d207eaf0e0aa84ef |
| AFTERNOON_1500 | 4e1f3e7d-fb5f-4473-ad91-8977d503269d | COMPLETED | 2026-08-10T09:30:00+00:00 | 2026-08-10T17:34:10.880287+00:00 | 50 | 0 | 0 | 944775489ab91d93d934c57eb5cfa89b2af0e511667276a1fb052ec09fff3930 |
| PREOPEN_0830 | 1b5dad41-74d1-4b5f-a7fe-b80acb5b0452 | COMPLETED | 2026-08-10T03:00:00+00:00 | 2026-08-10T17:36:29.382075+00:00 | 50 | 0 | 0 | f248fa47aa15aedd96a0e4d4868dd09eb0e7ce9c66e04ef993420a399fc89816 |
| OPEN_0930 | 56298554-48c3-4d14-8de4-01a2cc60dd45 | COMPLETED | 2026-08-10T04:00:00+00:00 | 2026-08-10T17:36:33.529172+00:00 | 50 | 0 | 0 | 6a5f8d2e3095fa8caf8b68aba9af993e4352554a7cc1bbbed3eb326327ce386d |
| AFTERNOON_1500 | bab905d9-39a9-466b-b479-eaf3f84b51eb | COMPLETED | 2026-08-10T09:30:00+00:00 | 2026-08-10T17:36:49.628194+00:00 | 50 | 0 | 0 | 217d9bfca2c399e87a158ff4206a35b68f2c2e9bf534559a003ec60a620427f9 |
| MANUAL_CORRECTED_FINAL | 73b19d4c-cab4-4cbb-80ba-3ac451c4ecfe | COMPLETED | 2026-08-10T09:30:00+00:00 | 2026-08-10T17:38:46.848029+00:00 | 50 | 0 | 0 | 217d9bfca2c399e87a158ff4206a35b68f2c2e9bf534559a003ec60a620427f9 |
| MANUAL_PARITY | e0fb8073-ef94-42c5-b880-b05f519e316c | COMPLETED | 2026-08-10T09:30:00+00:00 | 2026-08-10T17:39:47.628755+00:00 | 50 | 0 | 0 | 217d9bfca2c399e87a158ff4206a35b68f2c2e9bf534559a003ec60a620427f9 |
| PREOPEN_0830 | c321d7a6-d72a-440b-88fa-5c3da97a6fe9 | COMPLETED | 2026-08-10T03:00:00+00:00 | 2026-08-10T17:45:31.493468+00:00 | 50 | 0 | 0 | c58628a28e33c4a462b3b13aecd2ce81502f87458e2bb3a5a3adcf940a27c807 |
| OPEN_0930 | 847d6855-3e5e-431d-b2d3-74eb1ebed14a | COMPLETED | 2026-08-10T04:00:00+00:00 | 2026-08-10T17:45:34.874710+00:00 | 50 | 0 | 0 | 6ad0f98a6378921ca9b8540f70393d96987ee911fd604f42d18d9ffd0cbf130a |
| AFTERNOON_1500 | bda6a133-0348-4c41-bb3b-e1ab580520ce | COMPLETED | 2026-08-10T09:30:00+00:00 | 2026-08-10T17:45:47.879100+00:00 | 50 | 0 | 0 | e70f2758c06c429eebd1dc4f2486a385280c979a7c2036fb62a983b24ff61a19 |

The `AFTERNOON_1500` row is authoritative for the stock-by-stock report below. Earlier validation and V2 rows remain immutable operational evidence and are not silently overwritten.

## Aggregate results

### OFactor tiers

| Tier | Stocks |
|---|---|
| BELOW_MINIMUM | 21 |
| HIGH | 1 |
| LOW | 21 |
| MEDIUM | 7 |

### Selected directions

| Direction | Stocks |
|---|---|
| LONG | 28 |
| NEUTRAL | 4 |
| SHORT | 18 |

### Number of failed gates per stock

| Failed-gate count | Stocks |
|---|---|
| 6 | 1 |
| 7 | 41 |
| 8 | 8 |

### Gate failures by direction

| Failure reason | LONG | SHORT | NEUTRAL | Total |
|---|---|---|---|---|
| DATA_QUALITY_BELOW_MINIMUM | 28 | 18 | 4 | 50 |
| INSUFFICIENT_LIQUIDITY | 28 | 18 | 4 | 50 |
| NO_VALID_SETUP | 28 | 18 | 4 | 50 |
| REWARD_RISK_NOT_CALCULATED | 28 | 18 | 4 | 50 |
| STOP_TOO_WIDE | 28 | 18 | 4 | 50 |
| XFACTOR_BELOW_MINIMUM | 28 | 18 | 4 | 50 |
| OFACTOR_BELOW_MINIMUM | 27 | 18 | 4 | 49 |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | 2 | 2 | 4 | 8 |

## Active ranked watchlist

| Rank | Symbol | Daily level | Canonical status | Entry enabled | Buy reference | No-chase reference | Source |
|---|---|---|---|---|---|---|---|
| 1 | M&M | HIGH | WAIT_FOR_XFACTOR | FALSE | 3525.3 | 3560.553 | DAILY_SELECTION |
| 2 | HCLTECH | MEDIUM | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 1360.1 | 1373.701 | DAILY_SELECTION |
| 3 | ETERNAL | MEDIUM | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 314.85 | 317.9985 | DAILY_SELECTION |
| 4 | TECHM | MEDIUM | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 1649.8 | 1666.298 | DAILY_SELECTION |
| 5 | BAJAJ-AUTO | MEDIUM | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 11700.0 | 11817.0 | DAILY_SELECTION |
| 6 | INFY | MEDIUM | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 1184.3 | 1196.143 | DAILY_SELECTION |
| 7 | TITAN | MEDIUM | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 5060.7 | 5111.307 | DAILY_SELECTION |
| 8 | EICHERMOT | MEDIUM | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 7972.5 | 8052.225 | DAILY_SELECTION |
| 9 | GRASIM | LOW | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 3380.9 | 3414.709 | DAILY_SELECTION |
| 10 | POWERGRID | LOW | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 269.65 | 272.3465 | DAILY_SELECTION |
| 11 | SHRIRAMFIN | LOW | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 1126.8 | 1138.068 | DAILY_SELECTION |
| 12 | ADANIPORTS | LOW | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 1679.6 | 1696.396 | DAILY_SELECTION |
| 13 | BAJAJFINSV | LOW | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 2032.8 | 2053.128 | DAILY_SELECTION |
| 14 | COALINDIA | LOW | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 412.25 | 416.3725 | DAILY_SELECTION |
| 15 | HDFCBANK | LOW | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 734.3 | 741.643 | DAILY_SELECTION |

All ten rows above are recommendations. `entry_enabled=FALSE` confirms they were not authorised trades.

## All-stock decision table

| Opportunity rank | Execution rank | Symbol | F&O | NIFTY50 | Structural | Session | Resolved | State | O | O tier | X | DQ | Coverage | MoveATR | VWAP distance ATR | R:R | Blocking failures | Recommended | Selected | Reasons |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | M&M | TRUE | TRUE | LONG | LONG | LONG | ALIGNED | 77.7190 | HIGH | 61.8230 | 49.0000 | 0.4667 | 0.2058 | 0.0430 | NOT AVAILABLE | 5 | TRUE | FALSE | NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 2 | 7 | HCLTECH | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 73.3386 | MEDIUM | 55.5818 | 49.0000 | 0.4667 | 0.1039 | 0.0585 | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 3 | 3 | ETERNAL | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 72.7395 | MEDIUM | 56.4716 | 49.0000 | 0.4667 | 0.0802 | 0.3007 | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 4 | 4 | TECHM | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 72.1317 | MEDIUM | 56.4250 | 49.0000 | 0.4667 | 0.1432 | 0.2315 | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 5 | 10 | BAJAJ-AUTO | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 71.5031 | MEDIUM | 53.7742 | 49.0000 | 0.4667 | 0.0896 | 0.1141 | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 6 | 5 | INFY | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 70.0402 | MEDIUM | 56.1367 | 49.0000 | 0.4667 | 0.1691 | 0.0582 | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 7 | 41 | TITAN | TRUE | TRUE | LONG | LONG | LONG | ALIGNED | 68.8187 | MEDIUM | 41.1779 | 49.0000 | 0.4638 | 1.5218 | NOT AVAILABLE | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 8 | 6 | EICHERMOT | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 68.4494 | MEDIUM | 55.9422 | 49.0000 | 0.4667 | 0.1681 | 0.1221 | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 9 | 30 | GRASIM | TRUE | TRUE | LONG | LONG | LONG | ALIGNED | 63.7653 | LOW | 48.7277 | 49.0000 | 0.4638 | 0.7870 | NOT AVAILABLE | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 10 | 33 | POWERGRID | TRUE | TRUE | SHORT | NEUTRAL | SHORT | STRUCTURAL_ONLY | 63.7233 | LOW | 48.2647 | 49.0000 | 0.4667 | 0.2526 | 0.0288 | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 11 | 38 | SHRIRAMFIN | TRUE | TRUE | LONG | LONG | LONG | ALIGNED | 63.3433 | LOW | 46.4016 | 49.0000 | 0.4638 | 0.3560 | NOT AVAILABLE | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 12 | 24 | ADANIPORTS | TRUE | TRUE | SHORT | NEUTRAL | SHORT | STRUCTURAL_ONLY | 63.2430 | LOW | 49.7214 | 49.0000 | 0.4667 | 0.2734 | 0.0691 | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 13 | 21 | BAJAJFINSV | TRUE | TRUE | LONG | LONG | LONG | ALIGNED | 63.1306 | LOW | 50.0010 | 49.0000 | 0.4667 | 0.4713 | 0.7273 | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 14 | 25 | COALINDIA | TRUE | TRUE | SHORT | SHORT | SHORT | ALIGNED | 62.3606 | LOW | 49.4781 | 49.0000 | 0.4667 | 0.3195 | 0.0941 | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 15 | 14 | HDFCBANK | TRUE | TRUE | SHORT | NEUTRAL | SHORT | STRUCTURAL_ONLY | 61.7031 | LOW | 52.2030 | 49.0000 | 0.4667 | 0.2088 | 0.4702 | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 16 | 31 | NTPC | TRUE | TRUE | SHORT | SHORT | SHORT | ALIGNED | 60.3781 | LOW | 48.4291 | 49.0000 | 0.4667 | 0.4394 | 0.2858 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 17 | 8 | LT | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 60.1851 | LOW | 55.4924 | 49.0000 | 0.4667 | 0.0618 | 0.4650 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 18 | 15 | ONGC | TRUE | TRUE | SHORT | NEUTRAL | SHORT | STRUCTURAL_ONLY | 59.8030 | LOW | 51.8913 | 49.0000 | 0.4667 | 0.0159 | 0.2017 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 19 | 28 | DRREDDY | TRUE | TRUE | SHORT | NEUTRAL | SHORT | STRUCTURAL_ONLY | 59.6580 | LOW | 49.0442 | 49.0000 | 0.4667 | 0.1526 | 0.1941 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 20 | 2 | BAJFINANCE | TRUE | TRUE | LONG | LONG | LONG | ALIGNED | 58.9875 | LOW | 58.5857 | 49.0000 | 0.4667 | 0.2513 | 0.2112 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 21 | 23 | AXISBANK | TRUE | TRUE | SHORT | NEUTRAL | SHORT | STRUCTURAL_ONLY | 58.7483 | LOW | 49.7880 | 49.0000 | 0.4667 | 0.3829 | 0.0708 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 22 | 13 | MARUTI | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 58.5737 | LOW | 52.3915 | 49.0000 | 0.4667 | 0.1565 | 0.0356 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 23 | 9 | JIOFIN | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 58.2035 | LOW | 53.9981 | 49.0000 | 0.4667 | 0.0827 | 0.0728 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 24 | 26 | HDFCLIFE | TRUE | TRUE | SHORT | NEUTRAL | SHORT | STRUCTURAL_ONLY | 58.0261 | LOW | 49.2867 | 49.0000 | 0.4667 | 0.2408 | 0.3932 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 25 | 11 | TRENT | TRUE | TRUE | LONG | LONG | LONG | ALIGNED | 57.7490 | LOW | 53.4356 | 49.0000 | 0.4667 | 0.2526 | 0.2767 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 26 | 18 | ULTRACEMCO | TRUE | TRUE | LONG | LONG | LONG | ALIGNED | 56.2107 | LOW | 50.7897 | 49.0000 | 0.4667 | 0.1424 | 0.2713 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 27 | 27 | TMPV | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 55.6840 | LOW | 49.0583 | 49.0000 | 0.4638 | 0.2909 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 28 | 29 | JSWSTEEL | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 54.7418 | LOW | 48.8349 | 49.0000 | 0.4667 | 0.2497 | 0.1013 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 29 | 16 | ASIANPAINT | TRUE | TRUE | LONG | LONG | LONG | ALIGNED | 54.0482 | LOW | 51.5347 | 49.0000 | 0.4667 | 0.2171 | 0.1264 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 30 | 39 | ADANIENT | TRUE | TRUE | SHORT | SHORT | SHORT | ALIGNED | 52.2529 | BELOW_MINIMUM | 45.6027 | 49.0000 | 0.4667 | 0.4093 | 0.1547 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 32 | 12 | BHARTIARTL | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 51.2575 | BELOW_MINIMUM | 53.1575 | 49.0000 | 0.4667 | 0.2204 | 0.0839 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 33 | 34 | HINDUNILVR | TRUE | TRUE | SHORT | NEUTRAL | SHORT | STRUCTURAL_ONLY | 51.0471 | BELOW_MINIMUM | 47.9132 | 49.0000 | 0.4638 | 0.1036 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 36 | 35 | INDIGO | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 47.3442 | BELOW_MINIMUM | 47.8893 | 49.0000 | 0.4638 | 0.1793 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 37 | 37 | KOTAKBANK | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 46.3217 | BELOW_MINIMUM | 46.7539 | 49.0000 | 0.4638 | 0.3243 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 41 | 22 | CIPLA | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 45.3464 | BELOW_MINIMUM | 50.0009 | 49.0000 | 0.4638 | 0.0125 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 44 | 42 | SBIN | TRUE | TRUE | LONG | SHORT | SHORT | COUNTER_TREND_SHORT | 42.5077 | BELOW_MINIMUM | 39.8833 | 49.0000 | 0.4667 | 1.3175 | 0.1745 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 45 | 32 | MAXHEALTH | TRUE | TRUE | SHORT | LONG | LONG | COUNTER_TREND_LONG | 42.3311 | BELOW_MINIMUM | 48.3455 | 49.0000 | 0.4667 | 0.2407 | 0.4038 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 46 | 20 | BEL | TRUE | TRUE | SHORT | LONG | LONG | COUNTER_TREND_LONG | 41.9232 | BELOW_MINIMUM | 50.6072 | 49.0000 | 0.4667 | 0.2251 | 0.5259 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 47 | 19 | NESTLEIND | TRUE | TRUE | LONG | SHORT | SHORT | COUNTER_TREND_SHORT | 40.9909 | BELOW_MINIMUM | 50.7141 | 49.0000 | 0.4667 | 0.1611 | 0.2254 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 48 | 40 | HINDALCO | TRUE | TRUE | LONG | SHORT | SHORT | COUNTER_TREND_SHORT | 40.4037 | BELOW_MINIMUM | 45.1104 | 49.0000 | 0.4667 | 0.8281 | 0.6439 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 49 | 36 | WIPRO | TRUE | TRUE | LONG | SHORT | SHORT | COUNTER_TREND_SHORT | 30.7831 | BELOW_MINIMUM | 46.7745 | 49.0000 | 0.4667 | 0.1881 | 0.1522 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 50 | 17 | TCS | TRUE | TRUE | LONG | SHORT | SHORT | COUNTER_TREND_SHORT | 24.6291 | BELOW_MINIMUM | 51.0060 | 49.0000 | 0.4667 | 0.1240 | 0.1843 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 31 | 43 | RELIANCE | TRUE | TRUE | NEUTRAL | NEUTRAL | NEUTRAL | NEUTRAL | 51.9274 | BELOW_MINIMUM | 54.4472 | 49.0000 | 0.4667 | 0.1049 | 0.1082 | NOT AVAILABLE | 7 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 34 | 50 | TATASTEEL | TRUE | TRUE | NEUTRAL | LONG | LONG | SESSION_LONG | 50.1622 | BELOW_MINIMUM | 43.9096 | 49.0000 | 0.4667 | 0.9665 | 0.7418 | NOT AVAILABLE | 7 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 35 | 48 | ITC | TRUE | TRUE | NEUTRAL | SHORT | SHORT | SESSION_SHORT | 48.2186 | BELOW_MINIMUM | 48.4749 | 49.0000 | 0.4667 | 0.3770 | 0.1397 | NOT AVAILABLE | 7 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 38 | 45 | SUNPHARMA | TRUE | TRUE | NEUTRAL | NEUTRAL | NEUTRAL | NEUTRAL | 45.4798 | BELOW_MINIMUM | 52.4296 | 49.0000 | 0.4667 | 0.0028 | 0.0240 | NOT AVAILABLE | 7 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 39 | 49 | TATACONSUM | TRUE | TRUE | NEUTRAL | LONG | LONG | SESSION_LONG | 45.4757 | BELOW_MINIMUM | 46.9906 | 49.0000 | 0.4667 | 0.5351 | 0.5548 | NOT AVAILABLE | 7 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 40 | 46 | ICICIBANK | TRUE | TRUE | NEUTRAL | SHORT | SHORT | SESSION_SHORT | 45.4579 | BELOW_MINIMUM | 51.9340 | 49.0000 | 0.4667 | 0.2330 | 0.3319 | NOT AVAILABLE | 7 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 42 | 44 | APOLLOHOSP | TRUE | TRUE | NEUTRAL | NEUTRAL | NEUTRAL | NEUTRAL | 45.3262 | BELOW_MINIMUM | 53.5740 | 49.0000 | 0.4638 | 0.2580 | NOT AVAILABLE | NOT AVAILABLE | 7 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 43 | 47 | SBILIFE | TRUE | TRUE | NEUTRAL | NEUTRAL | NEUTRAL | NEUTRAL | 45.0867 | BELOW_MINIMUM | 49.1657 | 49.0000 | 0.4638 | 0.1073 | NOT AVAILABLE | NOT AVAILABLE | 7 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

# Per-stock calculation evidence

## 1. M&M

| Decision field | Actual value |
|---|---|
| Opportunity rank | 1 |
| Execution-readiness rank | 1 |
| Recommendation rank | 1 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | LONG |
| Resolved actionable direction | LONG |
| Direction state | ALIGNED |
| Session-direction score | 20.7459 |
| OFactor final | 77.7190 |
| OFactor tier | HIGH |
| LONG OFactor | 77.7190 |
| SHORT OFactor | 22.2810 |
| Directional edge LONG minus SHORT | 55.4380 |
| Directional-edge tier | HIGH |
| XFactor final | 61.8230 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | BREAKOUT_ACCEPTANCE / AWAITING_VOLUME |
| Failed gates / blocking gates | 6 / 5 |
| Canonical status | WAIT_FOR_XFACTOR |
| Daily level | HIGH |
| Reasons | NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 88.9000 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.7507 |
| close_price | 3,525.3000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 3,534.6000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 3,497.3000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 3,507.0000 |
| prev_close | 3,502.0000 |
| prior_high_20 | 3,504.9000 |
| prior_low_20 | 3,079.3999 |
| return_1d_pct | 0.6653 |
| return_21d_pct | 12.6510 |
| return_5d_pct | 2.8204 |
| return_63d_pct | 13.2881 |
| rsi_14 | 69.9611 |
| sector_return_21d_pct | 8.1666 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 3,507.0000 |
| session_volume | 13,595.0000 |
| session_vwap | 3,521.4766 |
| sma20 | 3,260.3000 |
| sma50 | 3,153.1920 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | M&M |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.8000 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0470 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 88.9000 |
| close | 3,525.3000 |
| close_vs_ema61_pct | 9.6086 |
| ema61 | 3,205.9623 |
| high | 3,534.6000 |
| low | 3,497.3000 |
| macd_line | 93.8248 |
| move_atr | 0.2058 |
| open | 3,507.0000 |
| previous_close | 3,502.0000 |
| prior_high_20 | 3,504.9000 |
| prior_low_20 | 3,079.3999 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 69.9611 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 3,521.4766 |
| sma20 | 3,260.3000 |
| sma50 | 3,153.1920 |
| turnover_lacs | 479.2645 |
| turnover_percentile | 0.8000 |
| volume_average_20 | 289,337.4000 |
| volume_current | 13,595.0000 |
| volume_median_90 | 2,200.5000 |
| volume_percentile_90 | 0.5882 |
| volume_previous_1d | 196,892.0000 |
| volume_previous_2d | 45,446.0000 |
| volume_ratio_20 | 0.0470 |
| vwap_distance_atr | 0.0430 |
| willr14 | -2.3279 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 98.5735 | 18.00% | 17.7432 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 81.7128 | 12.00% | 9.8055 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 87.0984 | 10.00% | 8.7098 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 93.1416 | 14.00% | 13.0398 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 43.9516 | 18.00% | 7.9113 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **77.7190** minus penalties **0.0000** = final **77.7190**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 1.4265 | 18.00% | 0.2568 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 18.2872 | 12.00% | 2.1945 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 12.9016 | 10.00% | 1.2902 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 6.8584 | 14.00% | 0.9602 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 22.7151 | 18.00% | 4.0887 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **22.2810** minus penalties **0.0000** = final **22.2810**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 55.0000 | 18.00% | 9.9000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 88.5639 | 20.00% | 17.7128 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 93.5037 | 6.00% | 5.6102 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **61.8230**. Setup `BREAKOUT_ACCEPTANCE` / state `AWAITING_VOLUME`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2058`; VWAP-distance ATR `0.0430`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 88.89999999999999, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["VOLUME_NOT_CONFIRMED"], "setup_type": "BREAKOUT_ACCEPTANCE", "state": "AWAITING_VOLUME", "structural_stop": 3504.9, "trigger_price": 3525.3, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 88.89999999999999, "close": 3525.3, "level": "LOW", "move_atr": 0.2058, "session_open": 3507.0, "session_vwap": 3521.4766164030893, "vwap_distance_atr": 0.043} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | TRUE | TRUE | {"long": 77.719, "screening_level": "HIGH", "selected": 77.719, "short": 22.281} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 61.823} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.8, "volume_level": "HIGH", "volume_percentile_90": 0.5882352941176471, "volume_ratio_20": 0.04698666677726419} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 55.438, "edge": 55.438, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. It was included in the top-ten research review because it ranked closest under the governed ordering. The recorded reasons were: NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 5.

## 2. HCLTECH

| Decision field | Actual value |
|---|---|
| Opportunity rank | 2 |
| Execution-readiness rank | 7 |
| Recommendation rank | 2 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | 5.8126 |
| OFactor final | 73.3386 |
| OFactor tier | MEDIUM |
| LONG OFactor | 73.3386 |
| SHORT OFactor | 19.1014 |
| Directional edge LONG minus SHORT | 54.2372 |
| Directional-edge tier | HIGH |
| XFactor final | 55.5818 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | MEDIUM |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 33.6929 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.4752 |
| close_price | 1,360.1000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,367.5000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,353.4000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,356.6000 |
| prev_close | 1,356.6000 |
| prior_high_20 | 1,377.0000 |
| prior_low_20 | 1,144.5000 |
| return_1d_pct | 0.2580 |
| return_21d_pct | 16.8370 |
| return_5d_pct | -1.2273 |
| return_63d_pct | 18.9731 |
| rsi_14 | 68.6052 |
| sector_return_21d_pct | 13.1211 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 1,356.6000 |
| session_volume | 16,701.0000 |
| session_vwap | 1,358.1293 |
| sma20 | 1,280.3950 |
| sma50 | 1,193.5980 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | HCLTECH |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.6400 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0593 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 33.6929 |
| close | 1,360.1000 |
| close_vs_ema61_pct | 9.4327 |
| ema61 | 1,238.9561 |
| high | 1,367.5000 |
| low | 1,353.4000 |
| macd_line | 51.5559 |
| move_atr | 0.1039 |
| open | 1,356.6000 |
| previous_close | 1,356.6000 |
| prior_high_20 | 1,377.0000 |
| prior_low_20 | 1,144.5000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 68.6052 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 1,358.1293 |
| sma20 | 1,280.3950 |
| sma50 | 1,193.5980 |
| turnover_lacs | 227.1503 |
| turnover_percentile | 0.6400 |
| volume_average_20 | 281,620.7500 |
| volume_current | 16,701.0000 |
| volume_median_90 | 708.0000 |
| volume_percentile_90 | 0.6765 |
| volume_previous_1d | 95,182.0000 |
| volume_previous_2d | 67,595.0000 |
| volume_ratio_20 | 0.0593 |
| vwap_distance_atr | 0.0585 |
| willr14 | -11.3195 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 100.0000 | 18.00% | 18.0000 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 63.4915 | 12.00% | 7.6190 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 86.6122 | 10.00% | 8.6612 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 78.6667 | 6.00% | 4.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 100.0000 | 14.00% | 14.0000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 32.3841 | 18.00% | 5.8291 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **73.3386** minus penalties **0.0000** = final **73.3386**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 0.0000 | 18.00% | 0.0000 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 36.5085 | 12.00% | 4.3810 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 13.3878 | 10.00% | 1.3388 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 78.6667 | 6.00% | 4.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 0.0000 | 14.00% | 0.0000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 34.2826 | 18.00% | 6.1709 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **24.1014** minus penalties **5.0000** = final **19.1014**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 94.2289 | 20.00% | 18.8458 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 78.6667 | 6.00% | 4.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 96.9330 | 6.00% | 5.8160 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **55.5818**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1039`; VWAP-distance ATR `0.0585`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 33.692857142857164, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 33.692857142857164, "close": 1360.1, "level": "LOW", "move_atr": 0.1039, "session_open": 1356.6, "session_vwap": 1358.1293156098436, "vwap_distance_atr": 0.0585} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 73.3386, "screening_level": "MEDIUM", "selected": 73.3386, "short": 19.1014} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 55.5818} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.64, "volume_level": "HIGH", "volume_percentile_90": 0.6764705882352942, "volume_ratio_20": 0.059303158591829615} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 54.2372, "edge": 54.2372, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. It was included in the top-ten research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 3. ETERNAL

| Decision field | Actual value |
|---|---|
| Opportunity rank | 3 |
| Execution-readiness rank | 3 |
| Recommendation rank | 3 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | 9.8506 |
| OFactor final | 72.7395 |
| OFactor tier | MEDIUM |
| LONG OFactor | 72.7395 |
| SHORT OFactor | 27.2605 |
| Directional edge LONG minus SHORT | 45.4790 |
| Directional-edge tier | HIGH |
| XFactor final | 56.4716 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | MEDIUM |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 9.9786 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.7404 |
| close_price | 314.8500 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 316.2000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 311.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 315.6500 |
| prev_close | 315.0000 |
| prior_high_20 | 319.7000 |
| prior_low_20 | 275.5500 |
| return_1d_pct | -0.0476 |
| return_21d_pct | 8.7002 |
| return_5d_pct | 1.4010 |
| return_63d_pct | 32.3900 |
| rsi_14 | 66.8823 |
| sector_return_21d_pct | 6.5187 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 315.6500 |
| session_volume | 324,286.0000 |
| session_vwap | 311.8492 |
| sma20 | 297.8925 |
| sma50 | 276.2010 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | ETERNAL |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.8600 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0920 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 9.9786 |
| close | 314.8500 |
| close_vs_ema61_pct | 12.2619 |
| ema61 | 279.3140 |
| high | 316.2000 |
| low | 311.0000 |
| macd_line | 10.6929 |
| move_atr | 0.0802 |
| open | 315.6500 |
| previous_close | 315.0000 |
| prior_high_20 | 319.7000 |
| prior_low_20 | 275.5500 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 66.8823 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 311.8492 |
| sma20 | 297.8925 |
| sma50 | 276.2010 |
| turnover_lacs | 1,021.0145 |
| turnover_percentile | 0.8600 |
| volume_average_20 | 3,524,223.1000 |
| volume_current | 324,286.0000 |
| volume_median_90 | 22,568.5000 |
| volume_percentile_90 | 0.6471 |
| volume_previous_1d | 660,275.0000 |
| volume_previous_2d | 1,827,164.0000 |
| volume_ratio_20 | 0.0920 |
| vwap_distance_atr | 0.3007 |
| willr14 | -10.9853 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 100.0000 | 18.00% | 18.0000 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 72.7197 | 12.00% | 8.7264 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 67.5554 | 10.00% | 6.7555 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 78.2131 | 14.00% | 10.9498 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 43.3250 | 18.00% | 7.7985 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **72.7395** minus penalties **0.0000** = final **72.7395**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 0.0000 | 18.00% | 0.0000 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 27.2803 | 12.00% | 3.2736 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 32.4446 | 10.00% | 3.2445 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 21.7869 | 14.00% | 3.0502 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 23.3416 | 18.00% | 4.2015 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **27.2605** minus penalties **0.0000** = final **27.2605**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 95.5460 | 20.00% | 19.1092 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 86.0395 | 6.00% | 5.1624 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **56.4716**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.0802`; VWAP-distance ATR `0.3007`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 9.978571428571424, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 9.978571428571424, "close": 314.85, "level": "LOW", "move_atr": 0.0802, "session_open": 315.65, "session_vwap": 311.84915028709224, "vwap_distance_atr": 0.3007} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 72.7395, "screening_level": "MEDIUM", "selected": 72.7395, "short": 27.2605} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 56.4716} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.86, "volume_level": "HIGH", "volume_percentile_90": 0.6470588235294118, "volume_ratio_20": 0.09201630850214902} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 45.479, "edge": 45.479, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. It was included in the top-ten research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 4. TECHM

| Decision field | Actual value |
|---|---|
| Opportunity rank | 4 |
| Execution-readiness rank | 4 |
| Recommendation rank | 4 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | 1.6100 |
| OFactor final | 72.1317 |
| OFactor tier | MEDIUM |
| LONG OFactor | 72.1317 |
| SHORT OFactor | 27.8683 |
| Directional edge LONG minus SHORT | 44.2634 |
| Directional-edge tier | HIGH |
| XFactor final | 56.4250 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | MEDIUM |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 40.5071 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.2710 |
| close_price | 1,649.8000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,665.4000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,644.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,644.0000 |
| prev_close | 1,635.0000 |
| prior_high_20 | 1,686.6000 |
| prior_low_20 | 1,444.2000 |
| return_1d_pct | 0.9052 |
| return_21d_pct | 13.4039 |
| return_5d_pct | 0.0485 |
| return_63d_pct | 19.9855 |
| rsi_14 | 67.5853 |
| sector_return_21d_pct | 13.1211 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 1,644.0000 |
| session_volume | 85,302.0000 |
| session_vwap | 1,659.1780 |
| sma20 | 1,589.4350 |
| sma50 | 1,505.6300 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | TECHM |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.9000 |
| vix_regime | LOW |
| volume_ratio_20 | 0.2799 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 40.5071 |
| close | 1,649.8000 |
| close_vs_ema61_pct | 8.3117 |
| ema61 | 1,518.9758 |
| high | 1,665.4000 |
| low | 1,644.0000 |
| macd_line | 46.0267 |
| move_atr | 0.1432 |
| open | 1,644.0000 |
| previous_close | 1,635.0000 |
| prior_high_20 | 1,686.6000 |
| prior_low_20 | 1,444.2000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 67.5853 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 1,659.1780 |
| sma20 | 1,589.4350 |
| sma50 | 1,505.6300 |
| turnover_lacs | 1,407.3124 |
| turnover_percentile | 0.9000 |
| volume_average_20 | 304,796.8000 |
| volume_current | 85,302.0000 |
| volume_median_90 | 1,409.0000 |
| volume_percentile_90 | 0.7353 |
| volume_previous_1d | 611,144.0000 |
| volume_previous_2d | 53,143.0000 |
| volume_ratio_20 | 0.2799 |
| vwap_distance_atr | 0.2315 |
| willr14 | -23.6656 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 96.4640 | 18.00% | 17.3635 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 67.7874 | 12.00% | 8.1345 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 75.8837 | 10.00% | 7.5884 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 100.0000 | 14.00% | 14.0000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 25.2002 | 18.00% | 4.5360 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **72.1317** minus penalties **0.0000** = final **72.1317**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 3.5360 | 18.00% | 0.6365 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 32.2126 | 12.00% | 3.8655 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 24.1164 | 10.00% | 2.4116 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 0.0000 | 14.00% | 0.0000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 41.4664 | 18.00% | 7.4640 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **27.8683** minus penalties **0.0000** = final **27.8683**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 92.0453 | 20.00% | 18.4091 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 96.9330 | 6.00% | 5.8160 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **56.4250**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1432`; VWAP-distance ATR `0.2315`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 40.50714285714285, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 40.50714285714285, "close": 1649.8, "level": "LOW", "move_atr": 0.1432, "session_open": 1644.0, "session_vwap": 1659.1780274788398, "vwap_distance_atr": 0.2315} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 72.1317, "screening_level": "MEDIUM", "selected": 72.1317, "short": 27.8683} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 56.425} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.9, "volume_level": "HIGH", "volume_percentile_90": 0.7352941176470589, "volume_ratio_20": 0.27986514294113324} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 44.2634, "edge": 44.2634, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. It was included in the top-ten research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 5. BAJAJ-AUTO

| Decision field | Actual value |
|---|---|
| Opportunity rank | 5 |
| Execution-readiness rank | 10 |
| Recommendation rank | 5 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | 3.6740 |
| OFactor final | 71.5031 |
| OFactor tier | MEDIUM |
| LONG OFactor | 71.5031 |
| SHORT OFactor | 17.4169 |
| Directional edge LONG minus SHORT | 54.0862 |
| Directional-edge tier | HIGH |
| XFactor final | 53.7742 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | MEDIUM |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 278.8929 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.4971 |
| close_price | 11,700.0000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 11,786.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 11,615.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 11,675.0000 |
| prev_close | 11,662.0000 |
| prior_high_20 | 11,856.0000 |
| prior_low_20 | 10,030.5000 |
| return_1d_pct | 0.3258 |
| return_21d_pct | 15.2028 |
| return_5d_pct | -1.3158 |
| return_63d_pct | 14.0129 |
| rsi_14 | 67.6113 |
| sector_return_21d_pct | 8.1666 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 11,675.0000 |
| session_volume | 841.0000 |
| session_vwap | 11,731.8300 |
| sma20 | 11,068.4250 |
| sma50 | 10,457.9000 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | BAJAJ-AUTO |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.4200 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0297 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 278.8929 |
| close | 11,700.0000 |
| close_vs_ema61_pct | 10.3538 |
| ema61 | 10,565.6694 |
| high | 11,786.0000 |
| low | 11,615.0000 |
| macd_line | 393.1905 |
| move_atr | 0.0896 |
| open | 11,675.0000 |
| previous_close | 11,662.0000 |
| prior_high_20 | 11,856.0000 |
| prior_low_20 | 10,030.5000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 67.6113 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 11,731.8300 |
| sma20 | 11,068.4250 |
| sma50 | 10,457.9000 |
| turnover_lacs | 98.3970 |
| turnover_percentile | 0.4200 |
| volume_average_20 | 28,303.5000 |
| volume_current | 841.0000 |
| volume_median_90 | 164.0000 |
| volume_percentile_90 | 0.5294 |
| volume_previous_1d | 3,980.0000 |
| volume_previous_2d | 4,719.0000 |
| volume_ratio_20 | 0.0297 |
| vwap_distance_atr | 0.1141 |
| willr14 | -12.1780 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 99.1774 | 18.00% | 17.8519 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 62.1289 | 12.00% | 7.4555 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 96.9883 | 10.00% | 9.6988 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 49.3333 | 6.00% | 2.9600 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 93.1416 | 14.00% | 13.0398 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 33.2653 | 18.00% | 5.9878 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **71.5031** minus penalties **0.0000** = final **71.5031**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 0.8226 | 18.00% | 0.1481 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 37.8711 | 12.00% | 4.5445 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 3.0116 | 10.00% | 0.3012 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 49.3333 | 6.00% | 2.9600 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 6.8584 | 14.00% | 0.9602 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 33.4014 | 18.00% | 6.0122 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **22.4169** minus penalties **5.0000** = final **17.4169**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 95.0200 | 20.00% | 19.0040 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 49.3333 | 6.00% | 2.9600 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 93.5037 | 6.00% | 5.6102 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **53.7742**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.0896`; VWAP-distance ATR `0.1141`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 278.89285714285717, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 278.89285714285717, "close": 11700.0, "level": "LOW", "move_atr": 0.0896, "session_open": 11675.0, "session_vwap": 11731.82996432818, "vwap_distance_atr": 0.1141} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 71.5031, "screening_level": "MEDIUM", "selected": 71.5031, "short": 17.4169} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 53.7742} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.42, "volume_level": "HIGH", "volume_percentile_90": 0.5294117647058824, "volume_ratio_20": 0.02971363965587295} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 54.0862, "edge": 54.0862, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. It was included in the top-ten research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 6. INFY

| Decision field | Actual value |
|---|---|
| Opportunity rank | 6 |
| Execution-readiness rank | 5 |
| Recommendation rank | 6 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | 12.9988 |
| OFactor final | 70.0402 |
| OFactor tier | MEDIUM |
| LONG OFactor | 70.0402 |
| SHORT OFactor | 29.9598 |
| Directional edge LONG minus SHORT | 40.0804 |
| Directional-edge tier | HIGH |
| XFactor final | 56.1367 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | MEDIUM |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 34.2929 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.4596 |
| close_price | 1,184.3000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,195.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,175.2000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,178.5000 |
| prev_close | 1,175.1000 |
| prior_high_20 | 1,187.7000 |
| prior_low_20 | 1,013.9000 |
| return_1d_pct | 0.7829 |
| return_21d_pct | 10.8895 |
| return_5d_pct | 0.3644 |
| return_63d_pct | 5.4492 |
| rsi_14 | 63.3417 |
| sector_return_21d_pct | 13.1211 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 1,178.5000 |
| session_volume | 166,463.0000 |
| session_vwap | 1,182.3055 |
| sma20 | 1,111.9500 |
| sma50 | 1,106.7860 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | INFY |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.9400 |
| vix_regime | LOW |
| volume_ratio_20 | 0.1238 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 34.2929 |
| close | 1,184.3000 |
| close_vs_ema61_pct | 4.5108 |
| ema61 | 1,131.4802 |
| high | 1,195.0000 |
| low | 1,175.2000 |
| macd_line | 25.2322 |
| move_atr | 0.1691 |
| open | 1,178.5000 |
| previous_close | 1,175.1000 |
| prior_high_20 | 1,187.7000 |
| prior_low_20 | 1,013.9000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 63.3417 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 1,182.3055 |
| sma20 | 1,111.9500 |
| sma50 | 1,106.7860 |
| turnover_lacs | 1,971.4213 |
| turnover_percentile | 0.9400 |
| volume_average_20 | 1,344,423.1000 |
| volume_current | 166,463.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7059 |
| volume_previous_1d | 319,922.0000 |
| volume_previous_2d | 225,363.0000 |
| volume_ratio_20 | 0.1238 |
| vwap_distance_atr | 0.0582 |
| willr14 | -5.9083 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 88.2954 | 18.00% | 15.8932 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 64.8601 | 12.00% | 7.7832 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 60.6061 | 10.00% | 6.0606 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 100.0000 | 14.00% | 14.0000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 32.1884 | 18.00% | 5.7939 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **70.0402** minus penalties **0.0000** = final **70.0402**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 11.7046 | 18.00% | 2.1068 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 35.1399 | 12.00% | 4.2168 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 39.3939 | 10.00% | 3.9394 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 0.0000 | 14.00% | 0.0000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 34.4783 | 18.00% | 6.2061 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **29.9598** minus penalties **0.0000** = final **29.9598**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 90.6038 | 20.00% | 18.1208 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 96.9330 | 6.00% | 5.8160 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **56.1367**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1691`; VWAP-distance ATR `0.0582`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 34.292857142857144, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 34.292857142857144, "close": 1184.3, "level": "LOW", "move_atr": 0.1691, "session_open": 1178.5, "session_vwap": 1182.305527354427, "vwap_distance_atr": 0.0582} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 70.0402, "screening_level": "MEDIUM", "selected": 70.0402, "short": 29.9598} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 56.1367} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.94, "volume_level": "HIGH", "volume_percentile_90": 0.7058823529411765, "volume_ratio_20": 0.12381742027491197} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 40.0804, "edge": 40.0804, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. It was included in the top-ten research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 7. TITAN

| Decision field | Actual value |
|---|---|
| Opportunity rank | 7 |
| Execution-readiness rank | 41 |
| Recommendation rank | 7 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | LONG |
| Resolved actionable direction | LONG |
| Direction state | ALIGNED |
| Session-direction score | 62.8320 |
| OFactor final | 68.8187 |
| OFactor tier | MEDIUM |
| LONG OFactor | 68.8187 |
| SHORT OFactor | 20.1413 |
| Directional edge LONG minus SHORT | 48.6774 |
| Directional-edge tier | HIGH |
| XFactor final | 41.1779 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4638 |
| Canonical setup | BREAKOUT_ACCEPTANCE / AWAITING_VOLUME |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | MEDIUM |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 85.8857 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.7432 |
| close_price | 5,060.7000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 5,121.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 4,886.2000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 4,930.0000 |
| prev_close | 4,941.0000 |
| prior_high_20 | 5,005.0000 |
| prior_low_20 | 4,524.3999 |
| return_1d_pct | 2.4226 |
| return_21d_pct | 10.3896 |
| return_5d_pct | 1.2140 |
| return_63d_pct | 23.7123 |
| rsi_14 | 73.6266 |
| sector_return_21d_pct | 6.3207 |
| session_bar_coverage | 0.4638 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 4,930.0000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 4,769.4050 |
| sma50 | 4,497.0120 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | TITAN |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.1100 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 85.8857 |
| close | 5,060.7000 |
| close_vs_ema61_pct | 10.9680 |
| ema61 | 4,543.8295 |
| high | 5,121.0000 |
| low | 4,886.2000 |
| macd_line | 138.8122 |
| move_atr | 1.5218 |
| open | 4,930.0000 |
| previous_close | 4,941.0000 |
| prior_high_20 | 5,005.0000 |
| prior_low_20 | 4,524.3999 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 73.6266 |
| session_bar_coverage | 0.4638 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 4,769.4050 |
| sma50 | 4,497.0120 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.1100 |
| volume_average_20 | 114,649.5500 |
| volume_current | 0.0000 |
| volume_median_90 | 819.5000 |
| volume_percentile_90 | 0.4706 |
| volume_previous_1d | 8,359.0000 |
| volume_previous_2d | 36,443.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -11.6657 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4638 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 100.0000 | 18.00% | 18.0000 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 78.6849 | 12.00% | 9.4422 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 78.7330 | 10.00% | 7.8733 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 76.3573 | 14.00% | 10.6900 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 43.4661 | 18.00% | 7.8239 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **68.8187** minus penalties **0.0000** = final **68.8187**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 0.0000 | 18.00% | 0.0000 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 21.3151 | 12.00% | 2.5578 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 21.2671 | 10.00% | 2.1267 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 23.6427 | 14.00% | 3.3100 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 23.2006 | 18.00% | 4.1761 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **20.1413** minus penalties **0.0000** = final **20.1413**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 55.0000 | 18.00% | 9.9000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 15.4561 | 20.00% | 3.0912 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 85.1116 | 6.00% | 5.1067 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **41.1779**. Setup `BREAKOUT_ACCEPTANCE` / state `AWAITING_VOLUME`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `1.5218`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 85.88571428571433, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["VOLUME_NOT_CONFIRMED"], "setup_type": "BREAKOUT_ACCEPTANCE", "state": "AWAITING_VOLUME", "structural_stop": 5005.0, "trigger_price": 5060.7, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 85.88571428571433, "close": 5060.7, "level": "ABOVE_MAXIMUM", "move_atr": 1.5218, "session_open": 4930.0, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 68.8187, "screening_level": "MEDIUM", "selected": 68.8187, "short": 20.1413} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 41.1779} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.11, "volume_level": "MEDIUM", "volume_percentile_90": 0.47058823529411764, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 48.6774, "edge": 48.6774, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": false,
    "ofactor": false,
    "volume_percentile": false
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": false,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": false,
    "ofactor": true,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. It was included in the top-ten research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 8. EICHERMOT

| Decision field | Actual value |
|---|---|
| Opportunity rank | 8 |
| Execution-readiness rank | 6 |
| Recommendation rank | 8 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | -11.9108 |
| OFactor final | 68.4494 |
| OFactor tier | MEDIUM |
| LONG OFactor | 68.4494 |
| SHORT OFactor | 26.5506 |
| Directional edge LONG minus SHORT | 41.8988 |
| Directional-edge tier | HIGH |
| XFactor final | 55.9422 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | MEDIUM |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 163.5714 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.4758 |
| close_price | 7,972.5000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 8,005.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 7,943.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 8,000.0000 |
| prev_close | 8,020.0000 |
| prior_high_20 | 8,067.5000 |
| prior_low_20 | 7,140.0000 |
| return_1d_pct | -0.5923 |
| return_21d_pct | 8.2411 |
| return_5d_pct | -0.9627 |
| return_63d_pct | 14.3585 |
| rsi_14 | 61.6445 |
| sector_return_21d_pct | 8.1666 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 8,000.0000 |
| session_volume | 8,826.0000 |
| session_vwap | 7,992.4745 |
| sma20 | 7,714.3250 |
| sma50 | 7,501.4900 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | EICHERMOT |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.8400 |
| vix_regime | LOW |
| volume_ratio_20 | 0.1865 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 163.5714 |
| close | 7,972.5000 |
| close_vs_ema61_pct | 5.8048 |
| ema61 | 7,520.5216 |
| high | 8,005.0000 |
| low | 7,943.0000 |
| macd_line | 152.2164 |
| move_atr | 0.1681 |
| open | 8,000.0000 |
| previous_close | 8,020.0000 |
| prior_high_20 | 8,067.5000 |
| prior_low_20 | 7,140.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 61.6445 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 7,992.4745 |
| sma20 | 7,714.3250 |
| sma50 | 7,501.4900 |
| turnover_lacs | 703.6528 |
| turnover_percentile | 0.8400 |
| volume_average_20 | 47,332.4000 |
| volume_current | 8,826.0000 |
| volume_median_90 | 577.0000 |
| volume_percentile_90 | 0.7353 |
| volume_previous_1d | 6,838.0000 |
| volume_previous_2d | 12,849.0000 |
| volume_ratio_20 | 0.1865 |
| vwap_distance_atr | 0.1221 |
| willr14 | -19.2893 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 90.6807 | 18.00% | 16.3225 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 57.6331 | 12.00% | 6.9160 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 59.5368 | 10.00% | 5.9537 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 93.1416 | 14.00% | 13.0398 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 31.7117 | 18.00% | 5.7081 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **68.4494** minus penalties **0.0000** = final **68.4494**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 9.3193 | 18.00% | 1.6775 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 42.3669 | 12.00% | 5.0840 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 40.4632 | 10.00% | 4.0463 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 6.8584 | 14.00% | 0.9602 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 34.9550 | 18.00% | 6.2919 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **31.5506** minus penalties **5.0000** = final **26.5506**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 90.6599 | 20.00% | 18.1320 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 93.5037 | 6.00% | 5.6102 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **55.9422**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1681`; VWAP-distance ATR `0.1221`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 163.57142857142858, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 163.57142857142858, "close": 7972.5, "level": "LOW", "move_atr": 0.1681, "session_open": 8000.0, "session_vwap": 7992.474507138001, "vwap_distance_atr": 0.1221} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 68.4494, "screening_level": "MEDIUM", "selected": 68.4494, "short": 26.5506} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 55.9422} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.84, "volume_level": "HIGH", "volume_percentile_90": 0.7352941176470589, "volume_ratio_20": 0.18646846557537752} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 41.8988, "edge": 41.8988, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. It was included in the top-ten research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 9. GRASIM

| Decision field | Actual value |
|---|---|
| Opportunity rank | 9 |
| Execution-readiness rank | 30 |
| Recommendation rank | 9 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | LONG |
| Resolved actionable direction | LONG |
| Direction state | ALIGNED |
| Session-direction score | 52.3100 |
| OFactor final | 63.7653 |
| OFactor tier | LOW |
| LONG OFactor | 63.7653 |
| SHORT OFactor | 25.1947 |
| Directional edge LONG minus SHORT | 38.5706 |
| Directional-edge tier | HIGH |
| XFactor final | 48.7277 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4638 |
| Canonical setup | BREAKOUT_ACCEPTANCE / AWAITING_VOLUME |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 72.3000 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.9989 |
| close_price | 3,380.9000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 3,381.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 3,292.6000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 3,324.0000 |
| prev_close | 3,323.0000 |
| prior_high_20 | 3,349.6000 |
| prior_low_20 | 3,060.0000 |
| return_1d_pct | 1.7424 |
| return_21d_pct | 5.2060 |
| return_5d_pct | 3.7086 |
| return_63d_pct | 14.7780 |
| rsi_14 | 67.5896 |
| sector_return_21d_pct | 4.1357 |
| session_bar_coverage | 0.4638 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 3,324.0000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 3,146.5400 |
| sma50 | 3,138.0180 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | GRASIM |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.1100 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 72.3000 |
| close | 3,380.9000 |
| close_vs_ema61_pct | 8.7831 |
| ema61 | 3,098.8279 |
| high | 3,381.0000 |
| low | 3,292.6000 |
| macd_line | 42.2796 |
| move_atr | 0.7870 |
| open | 3,324.0000 |
| previous_close | 3,323.0000 |
| prior_high_20 | 3,349.6000 |
| prior_low_20 | 3,060.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 67.5896 |
| session_bar_coverage | 0.4638 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 3,146.5400 |
| sma50 | 3,138.0180 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.1100 |
| volume_average_20 | 74,977.7500 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.5294 |
| volume_previous_1d | 62,024.0000 |
| volume_previous_2d | 10,361.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -0.0318 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4638 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 92.6243 | 18.00% | 16.6724 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 83.0420 | 12.00% | 9.9650 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 53.1636 | 10.00% | 5.3164 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 55.8731 | 14.00% | 7.8222 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.0000 | 18.00% | 9.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **63.7653** minus penalties **0.0000** = final **63.7653**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 7.3757 | 18.00% | 1.3276 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 16.9580 | 12.00% | 2.0350 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 46.8364 | 10.00% | 4.6836 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 44.1268 | 14.00% | 6.1778 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.6667 | 18.00% | 3.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **25.1947** minus penalties **0.0000** = final **25.1947**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 55.0000 | 18.00% | 9.9000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 56.2779 | 20.00% | 11.2556 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 74.8695 | 6.00% | 4.4922 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **48.7277**. Setup `BREAKOUT_ACCEPTANCE` / state `AWAITING_VOLUME`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.7870`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 72.30000000000003, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["VOLUME_NOT_CONFIRMED"], "setup_type": "BREAKOUT_ACCEPTANCE", "state": "AWAITING_VOLUME", "structural_stop": 3349.6, "trigger_price": 3380.9, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 72.30000000000003, "close": 3380.9, "level": "LOW", "move_atr": 0.787, "session_open": 3324.0, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 63.7653, "screening_level": "LOW", "selected": 63.7653, "short": 25.1947} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 48.7277} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.11, "volume_level": "HIGH", "volume_percentile_90": 0.5294117647058824, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 38.5706, "edge": 38.5706, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. It was included in the top-ten research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 10. POWERGRID

| Decision field | Actual value |
|---|---|
| Opportunity rank | 10 |
| Execution-readiness rank | 33 |
| Recommendation rank | 10 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | SHORT |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | -18.5866 |
| OFactor final | 63.7233 |
| OFactor tier | LOW |
| LONG OFactor | 28.5967 |
| SHORT OFactor | 63.7233 |
| Directional edge LONG minus SHORT | -35.1266 |
| Directional-edge tier | HIGH |
| XFactor final | 48.2647 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 5.5429 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.2963 |
| close_price | 269.6500 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 271.5500 |
| is_intraday_snapshot | 1.0000 |
| low_price | 268.8500 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 271.0500 |
| prev_close | 271.6000 |
| prior_high_20 | 294.1000 |
| prior_low_20 | 268.3500 |
| return_1d_pct | -0.7180 |
| return_21d_pct | -4.7510 |
| return_5d_pct | -6.0453 |
| return_63d_pct | -10.5638 |
| rsi_14 | 31.1515 |
| sector_return_21d_pct | -2.9560 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 271.0500 |
| session_volume | 25,686.0000 |
| session_vwap | 269.4906 |
| sma20 | 284.0650 |
| sma50 | 285.3630 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | POWERGRID |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.3200 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0266 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 5.5429 |
| close | 269.6500 |
| close_vs_ema61_pct | -6.2210 |
| ema61 | 288.1340 |
| high | 271.5500 |
| low | 268.8500 |
| macd_line | -3.4085 |
| move_atr | 0.2526 |
| open | 271.0500 |
| previous_close | 271.6000 |
| prior_high_20 | 294.1000 |
| prior_low_20 | 268.3500 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 31.1515 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 269.4906 |
| sma20 | 284.0650 |
| sma50 | 285.3630 |
| turnover_lacs | 69.2623 |
| turnover_percentile | 0.3200 |
| volume_average_20 | 965,349.9000 |
| volume_current | 25,686.0000 |
| volume_median_90 | 24,032.0000 |
| volume_percentile_90 | 0.5294 |
| volume_previous_1d | 509,781.0000 |
| volume_previous_2d | 592,014.0000 |
| volume_ratio_20 | 0.0266 |
| vwap_distance_atr | 0.0288 |
| willr14 | -94.9515 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 14.3905 | 18.00% | 2.5903 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 6.1515 | 12.00% | 0.7382 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 19.3906 | 10.00% | 1.9391 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 36.0000 | 6.00% | 2.1600 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 15.7627 | 14.00% | 2.2068 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 24.7395 | 18.00% | 4.4531 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **28.5967** minus penalties **0.0000** = final **28.5967**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 85.6095 | 18.00% | 15.4097 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 93.8485 | 12.00% | 11.2618 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 80.6094 | 10.00% | 8.0609 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 36.0000 | 6.00% | 2.1600 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 84.2373 | 14.00% | 11.7932 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 41.9271 | 18.00% | 7.5469 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **63.7233** minus penalties **0.0000** = final **63.7233**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 85.9679 | 20.00% | 17.1936 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 36.0000 | 6.00% | 2.1600 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 45.1857 | 6.00% | 2.7111 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **48.2647**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2526`; VWAP-distance ATR `0.0288`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 5.542857142857149, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 5.542857142857149, "close": 269.65, "level": "LOW", "move_atr": 0.2526, "session_open": 271.05, "session_vwap": 269.49056684575254, "vwap_distance_atr": 0.0288} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 28.5967, "screening_level": "LOW", "selected": 63.7233, "short": 63.7233} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 48.2647} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.32, "volume_level": "HIGH", "volume_percentile_90": 0.5294117647058824, "volume_ratio_20": 0.02660796877898884} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 35.1266, "edge": -35.1266, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. It was included in the top-ten research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 11. SHRIRAMFIN

| Decision field | Actual value |
|---|---|
| Opportunity rank | 11 |
| Execution-readiness rank | 38 |
| Recommendation rank | 11 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | LONG |
| Resolved actionable direction | LONG |
| Direction state | ALIGNED |
| Session-direction score | 37.6220 |
| OFactor final | 63.3433 |
| OFactor tier | LOW |
| LONG OFactor | 63.3433 |
| SHORT OFactor | 25.6167 |
| Directional edge LONG minus SHORT | 37.7266 |
| Directional-edge tier | HIGH |
| XFactor final | 46.4016 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4638 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 33.1429 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.9897 |
| close_price | 1,126.8000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,127.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,107.5000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,115.0000 |
| prev_close | 1,115.0000 |
| prior_high_20 | 1,153.7000 |
| prior_low_20 | 992.9000 |
| return_1d_pct | 1.0583 |
| return_21d_pct | 7.9207 |
| return_5d_pct | 3.3572 |
| return_63d_pct | 22.4051 |
| rsi_14 | 64.5297 |
| sector_return_21d_pct | 1.1896 |
| session_bar_coverage | 0.4638 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 1,115.0000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,054.7650 |
| sma50 | 1,015.6960 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | SHRIRAMFIN |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.1100 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 33.1429 |
| close | 1,126.8000 |
| close_vs_ema61_pct | 9.4655 |
| ema61 | 1,026.1176 |
| high | 1,127.0000 |
| low | 1,107.5000 |
| macd_line | 26.7453 |
| move_atr | 0.3560 |
| open | 1,115.0000 |
| previous_close | 1,115.0000 |
| prior_high_20 | 1,153.7000 |
| prior_low_20 | 992.9000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 64.5297 |
| session_bar_coverage | 0.4638 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,054.7650 |
| sma50 | 1,015.6960 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.1100 |
| volume_average_20 | 747,586.8000 |
| volume_current | 0.0000 |
| volume_median_90 | 14,212.0000 |
| volume_percentile_90 | 0.4706 |
| volume_previous_1d | 139,293.0000 |
| volume_previous_2d | 482,250.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -16.7289 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4638 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 99.8761 | 18.00% | 17.9777 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 78.5179 | 12.00% | 9.4221 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 79.3371 | 10.00% | 7.9337 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 28.7175 | 14.00% | 4.0205 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.0000 | 18.00% | 9.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **63.3433** minus penalties **0.0000** = final **63.3433**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 0.1239 | 18.00% | 0.0223 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 21.4821 | 12.00% | 2.5779 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 20.6629 | 10.00% | 2.0663 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 71.2824 | 14.00% | 9.9795 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.6667 | 18.00% | 3.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **25.6167** minus penalties **0.0000** = final **25.6167**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 80.2203 | 20.00% | 16.0441 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 61.2917 | 6.00% | 3.6775 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **46.4016**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.3560`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 33.14285714285717, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 33.14285714285717, "close": 1126.8, "level": "LOW", "move_atr": 0.356, "session_open": 1115.0, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 63.3433, "screening_level": "LOW", "selected": 63.3433, "short": 25.6167} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 46.4016} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.11, "volume_level": "MEDIUM", "volume_percentile_90": 0.47058823529411764, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 37.7266, "edge": 37.7266, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": false
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. It was included in the top-ten research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 12. ADANIPORTS

| Decision field | Actual value |
|---|---|
| Opportunity rank | 12 |
| Execution-readiness rank | 24 |
| Recommendation rank | 12 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | SHORT |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | -17.4615 |
| OFactor final | 63.2430 |
| OFactor tier | LOW |
| LONG OFactor | 32.2770 |
| SHORT OFactor | 63.2430 |
| Directional edge LONG minus SHORT | -30.9660 |
| Directional-edge tier | HIGH |
| XFactor final | 49.7214 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 38.0429 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.3846 |
| close_price | 1,679.6000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,690.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,673.1000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,690.0000 |
| prev_close | 1,693.5000 |
| prior_high_20 | 1,859.7000 |
| prior_low_20 | 1,650.0000 |
| return_1d_pct | -0.8208 |
| return_21d_pct | -8.1232 |
| return_5d_pct | -1.2581 |
| return_63d_pct | -3.3491 |
| rsi_14 | 32.9745 |
| sector_return_21d_pct | -3.8922 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 1,690.0000 |
| session_volume | 8,074.0000 |
| session_vwap | 1,676.9712 |
| sma20 | 1,765.1700 |
| sma50 | 1,796.6460 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | ADANIPORTS |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.5200 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0367 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 38.0429 |
| close | 1,679.6000 |
| close_vs_ema61_pct | -4.1001 |
| ema61 | 1,753.8034 |
| high | 1,690.0000 |
| low | 1,673.1000 |
| macd_line | -33.8873 |
| move_atr | 0.2734 |
| open | 1,690.0000 |
| previous_close | 1,693.5000 |
| prior_high_20 | 1,859.7000 |
| prior_low_20 | 1,650.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 32.9745 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 1,676.9712 |
| sma20 | 1,765.1700 |
| sma50 | 1,796.6460 |
| turnover_lacs | 135.6109 |
| turnover_percentile | 0.5200 |
| volume_average_20 | 220,103.4000 |
| volume_current | 8,074.0000 |
| volume_median_90 | 1,245.0000 |
| volume_percentile_90 | 0.5588 |
| volume_previous_1d | 67,607.0000 |
| volume_previous_2d | 41,644.0000 |
| volume_ratio_20 | 0.0367 |
| vwap_distance_atr | 0.0691 |
| willr14 | -84.9899 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 14.4465 | 18.00% | 2.6004 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 27.7325 | 12.00% | 3.3279 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 11.7781 | 10.00% | 1.1778 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 62.6667 | 6.00% | 3.7600 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 12.8370 | 14.00% | 1.7972 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 28.3584 | 18.00% | 5.1045 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **32.2770** minus penalties **0.0000** = final **32.2770**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 85.5535 | 18.00% | 15.3996 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 72.2675 | 12.00% | 8.6721 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 88.2219 | 10.00% | 8.8222 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 62.6667 | 6.00% | 3.7600 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 87.1630 | 14.00% | 12.2028 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 38.3083 | 18.00% | 6.8955 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **63.2430** minus penalties **0.0000** = final **63.2430**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 84.8125 | 20.00% | 16.9625 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 62.6667 | 6.00% | 3.7600 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 46.6486 | 6.00% | 2.7989 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **49.7214**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2734`; VWAP-distance ATR `0.0691`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 38.042857142857166, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 38.042857142857166, "close": 1679.6, "level": "LOW", "move_atr": 0.2734, "session_open": 1690.0, "session_vwap": 1676.9711667079514, "vwap_distance_atr": 0.0691} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 32.277, "screening_level": "LOW", "selected": 63.243, "short": 63.243} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 49.7214} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.52, "volume_level": "HIGH", "volume_percentile_90": 0.5588235294117647, "volume_ratio_20": 0.03668275910322149} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 30.966, "edge": -30.966, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. It was included in the top-ten research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 13. BAJAJFINSV

| Decision field | Actual value |
|---|---|
| Opportunity rank | 13 |
| Execution-readiness rank | 21 |
| Recommendation rank | 13 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | LONG |
| Resolved actionable direction | LONG |
| Direction state | ALIGNED |
| Session-direction score | 48.4349 |
| OFactor final | 63.1306 |
| OFactor tier | LOW |
| LONG OFactor | 63.1306 |
| SHORT OFactor | 30.5894 |
| Directional edge LONG minus SHORT | 32.5412 |
| Directional-edge tier | HIGH |
| XFactor final | 50.0010 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 50.5000 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.9242 |
| close_price | 2,032.8000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 2,036.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,993.8000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 2,009.0000 |
| prev_close | 2,008.9000 |
| prior_high_20 | 2,118.5000 |
| prior_low_20 | 1,822.0000 |
| return_1d_pct | 1.1897 |
| return_21d_pct | 6.0960 |
| return_5d_pct | -3.0153 |
| return_63d_pct | 17.5777 |
| rsi_14 | 61.9197 |
| sector_return_21d_pct | 1.1896 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 2,009.0000 |
| session_volume | 15,166.0000 |
| session_vwap | 1,996.0727 |
| sma20 | 1,940.4900 |
| sma50 | 1,840.6800 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | BAJAJFINSV |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.7200 |
| vix_regime | LOW |
| volume_ratio_20 | 0.1426 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 50.5000 |
| close | 2,032.8000 |
| close_vs_ema61_pct | 8.1763 |
| ema61 | 1,874.0332 |
| high | 2,036.0000 |
| low | 1,993.8000 |
| macd_line | 60.7627 |
| move_atr | 0.4713 |
| open | 2,009.0000 |
| previous_close | 2,008.9000 |
| prior_high_20 | 2,118.5000 |
| prior_low_20 | 1,822.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 61.9197 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 1,996.0727 |
| sma20 | 1,940.4900 |
| sma50 | 1,840.6800 |
| turnover_lacs | 308.2944 |
| turnover_percentile | 0.7200 |
| volume_average_20 | 106,349.7500 |
| volume_current | 15,166.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.6471 |
| volume_previous_1d | 82,575.0000 |
| volume_previous_2d | 32,223.0000 |
| volume_ratio_20 | 0.1426 |
| vwap_distance_atr | 0.7273 |
| willr14 | -33.4504 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 96.4177 | 18.00% | 17.3552 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 49.3561 | 12.00% | 5.9227 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 67.9330 | 10.00% | 6.7933 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 89.3333 | 6.00% | 5.3600 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 28.7175 | 14.00% | 4.0205 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.9425 | 18.00% | 9.1697 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **63.1306** minus penalties **0.0000** = final **63.1306**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 3.5823 | 18.00% | 0.6448 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 50.6439 | 12.00% | 6.0773 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 32.0671 | 10.00% | 3.2067 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 89.3333 | 6.00% | 5.3600 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 71.2824 | 14.00% | 9.9795 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 15.7241 | 18.00% | 2.8303 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **35.5894** minus penalties **5.0000** = final **30.5894**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 73.8174 | 20.00% | 14.7635 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 89.3333 | 6.00% | 5.3600 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 61.2917 | 6.00% | 3.6775 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **50.0010**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.4713`; VWAP-distance ATR `0.7273`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 50.5, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 50.5, "close": 2032.8, "level": "LOW", "move_atr": 0.4713, "session_open": 2009.0, "session_vwap": 1996.0727152841882, "vwap_distance_atr": 0.7273} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 63.1306, "screening_level": "LOW", "selected": 63.1306, "short": 30.5894} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 50.001} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.72, "volume_level": "HIGH", "volume_percentile_90": 0.6470588235294118, "volume_ratio_20": 0.1426049426538379} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 32.5412, "edge": 32.5412, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. It was included in the top-ten research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 14. COALINDIA

| Decision field | Actual value |
|---|---|
| Opportunity rank | 14 |
| Execution-readiness rank | 25 |
| Recommendation rank | 14 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | ALIGNED |
| Session-direction score | -23.5563 |
| OFactor final | 62.3606 |
| OFactor tier | LOW |
| LONG OFactor | 34.1194 |
| SHORT OFactor | 62.3606 |
| Directional edge LONG minus SHORT | -28.2412 |
| Directional-edge tier | HIGH |
| XFactor final | 49.4781 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 6.2607 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.1618 |
| close_price | 412.2500 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 415.1000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 411.7000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 414.2500 |
| prev_close | 415.2500 |
| prior_high_20 | 436.5000 |
| prior_low_20 | 406.2500 |
| return_1d_pct | -0.7225 |
| return_21d_pct | -3.9716 |
| return_5d_pct | -0.9014 |
| return_63d_pct | -10.8167 |
| rsi_14 | 33.0010 |
| sector_return_21d_pct | -1.6384 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 414.2500 |
| session_volume | 48,510.0000 |
| session_vwap | 412.8392 |
| sma20 | 422.2925 |
| sma50 | 437.9020 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | COALINDIA |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.5800 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0400 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 6.2607 |
| close | 412.2500 |
| close_vs_ema61_pct | -5.0965 |
| ema61 | 435.1267 |
| high | 415.1000 |
| low | 411.7000 |
| macd_line | -6.3266 |
| move_atr | 0.3195 |
| open | 414.2500 |
| previous_close | 415.2500 |
| prior_high_20 | 436.5000 |
| prior_low_20 | 406.2500 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 33.0010 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 412.8392 |
| sma20 | 422.2925 |
| sma50 | 437.9020 |
| turnover_lacs | 199.9825 |
| turnover_percentile | 0.5800 |
| volume_average_20 | 1,213,422.1000 |
| volume_current | 48,510.0000 |
| volume_median_90 | 6,927.0000 |
| volume_percentile_90 | 0.6176 |
| volume_previous_1d | 247,878.0000 |
| volume_previous_2d | 99,836.0000 |
| volume_ratio_20 | 0.0400 |
| vwap_distance_atr | 0.0941 |
| willr14 | -76.4244 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 21.5129 | 18.00% | 3.8723 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 29.2450 | 12.00% | 3.5094 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 17.7087 | 10.00% | 1.7709 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 70.6667 | 6.00% | 4.2400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 19.8801 | 14.00% | 2.7832 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 19.0797 | 18.00% | 3.4344 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **34.1194** minus penalties **0.0000** = final **34.1194**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 78.4871 | 18.00% | 14.1277 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 70.7550 | 12.00% | 8.4906 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 82.2912 | 10.00% | 8.2291 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 70.6667 | 6.00% | 4.2400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 80.1200 | 14.00% | 11.2168 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 47.5869 | 18.00% | 8.5656 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **62.3606** minus penalties **0.0000** = final **62.3606**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 82.2526 | 20.00% | 16.4505 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 70.6667 | 6.00% | 4.2400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 43.1271 | 6.00% | 2.5876 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **49.4781**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.3195`; VWAP-distance ATR `0.0941`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 6.260714285714288, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 6.260714285714288, "close": 412.25, "level": "LOW", "move_atr": 0.3195, "session_open": 414.25, "session_vwap": 412.83919398062255, "vwap_distance_atr": 0.0941} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 34.1194, "screening_level": "LOW", "selected": 62.3606, "short": 62.3606} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 49.4781} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.58, "volume_level": "HIGH", "volume_percentile_90": 0.6176470588235294, "volume_ratio_20": 0.039977844478026235} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 28.2412, "edge": -28.2412, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. It was included in the top-ten research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 15. HDFCBANK

| Decision field | Actual value |
|---|---|
| Opportunity rank | 15 |
| Execution-readiness rank | 14 |
| Recommendation rank | 15 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | SHORT |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | 16.9148 |
| OFactor final | 61.7031 |
| OFactor tier | LOW |
| LONG OFactor | 38.2969 |
| SHORT OFactor | 61.7031 |
| Directional edge LONG minus SHORT | -23.4062 |
| Directional-edge tier | HIGH |
| XFactor final | 52.2030 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 11.0179 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.6409 |
| close_price | 734.3000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 737.5500 |
| is_intraday_snapshot | 1.0000 |
| low_price | 728.5000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 732.0000 |
| prev_close | 731.0000 |
| prior_high_20 | 823.7000 |
| prior_low_20 | 728.2000 |
| return_1d_pct | 0.4514 |
| return_21d_pct | -10.9885 |
| return_5d_pct | -2.4834 |
| return_63d_pct | -2.0411 |
| rsi_14 | 36.3093 |
| sector_return_21d_pct | 1.1896 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 732.0000 |
| session_volume | 411,134.0000 |
| session_vwap | 729.1194 |
| sma20 | 763.6750 |
| sma50 | 774.7430 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | HDFCBANK |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.9600 |
| vix_regime | LOW |
| volume_ratio_20 | 0.1257 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 11.0179 |
| close | 734.3000 |
| close_vs_ema61_pct | -5.3014 |
| ema61 | 776.7774 |
| high | 737.5500 |
| low | 728.5000 |
| macd_line | -14.7729 |
| move_atr | 0.2088 |
| open | 732.0000 |
| previous_close | 731.0000 |
| prior_high_20 | 823.7000 |
| prior_low_20 | 728.2000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 36.3093 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 729.1194 |
| sma20 | 763.6750 |
| sma50 | 774.7430 |
| turnover_lacs | 3,018.9570 |
| turnover_percentile | 0.9600 |
| volume_average_20 | 3,271,267.0500 |
| volume_current | 411,134.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.6471 |
| volume_previous_1d | 620,220.0000 |
| volume_previous_2d | 1,565,747.0000 |
| volume_ratio_20 | 0.1257 |
| vwap_distance_atr | 0.4702 |
| willr14 | -81.5988 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 19.6576 | 18.00% | 3.5384 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 25.9618 | 12.00% | 3.1154 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 0.0000 | 10.00% | 0.0000 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 28.7175 | 14.00% | 4.0205 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 39.5187 | 18.00% | 7.1134 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **38.2969** minus penalties **0.0000** = final **38.2969**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 80.3424 | 18.00% | 14.4616 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 74.0383 | 12.00% | 8.8846 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 100.0000 | 10.00% | 10.0000 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 71.2824 | 14.00% | 9.9795 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 27.1480 | 18.00% | 4.8866 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **61.7031** minus penalties **0.0000** = final **61.7031**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 88.4027 | 20.00% | 17.6805 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 38.7082 | 6.00% | 2.3225 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **52.2030**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2088`; VWAP-distance ATR `0.4702`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 11.017857142857142, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 11.017857142857142, "close": 734.3, "level": "LOW", "move_atr": 0.2088, "session_open": 732.0, "session_vwap": 729.1193902717848, "vwap_distance_atr": 0.4702} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 38.2969, "screening_level": "LOW", "selected": 61.7031, "short": 61.7031} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 52.203} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.96, "volume_level": "HIGH", "volume_percentile_90": 0.6470588235294118, "volume_ratio_20": 0.12568035373327288} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 23.4062, "edge": -23.4062, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. It was included in the top-ten research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 16. NTPC

| Decision field | Actual value |
|---|---|
| Opportunity rank | 16 |
| Execution-readiness rank | 31 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | ALIGNED |
| Session-direction score | -29.0288 |
| OFactor final | 60.3781 |
| OFactor tier | LOW |
| LONG OFactor | 36.4219 |
| SHORT OFactor | 60.3781 |
| Directional edge LONG minus SHORT | -23.9562 |
| Directional-edge tier | HIGH |
| XFactor final | 48.4291 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 5.8036 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.1286 |
| close_price | 340.5500 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 343.6000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 340.1000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 343.1000 |
| prev_close | 342.5000 |
| prior_high_20 | 355.0000 |
| prior_low_20 | 340.2500 |
| return_1d_pct | -0.5693 |
| return_21d_pct | -1.1609 |
| return_5d_pct | -2.9496 |
| return_63d_pct | -12.7801 |
| rsi_14 | 40.6452 |
| sector_return_21d_pct | -2.9560 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 343.1000 |
| session_volume | 62,429.0000 |
| session_vwap | 342.2089 |
| sma20 | 346.6375 |
| sma50 | 353.2330 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | NTPC |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.6000 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0396 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 5.8036 |
| close | 340.5500 |
| close_vs_ema61_pct | -4.6331 |
| ema61 | 357.6462 |
| high | 343.6000 |
| low | 340.1000 |
| macd_line | -2.9490 |
| move_atr | 0.4394 |
| open | 343.1000 |
| previous_close | 342.5000 |
| prior_high_20 | 355.0000 |
| prior_low_20 | 340.2500 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 40.6452 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 342.2089 |
| sma20 | 346.6375 |
| sma50 | 353.2330 |
| turnover_lacs | 212.6020 |
| turnover_percentile | 0.6000 |
| volume_average_20 | 1,574,638.0000 |
| volume_current | 62,429.0000 |
| volume_median_90 | 14,168.5000 |
| volume_percentile_90 | 0.6176 |
| volume_previous_1d | 96,872.0000 |
| volume_previous_2d | 219,927.0000 |
| volume_ratio_20 | 0.0396 |
| vwap_distance_atr | 0.2858 |
| willr14 | -96.5116 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 28.6574 | 18.00% | 5.1583 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 28.3554 | 12.00% | 3.4026 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 35.5318 | 10.00% | 3.5532 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 73.3333 | 6.00% | 4.4000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 15.7627 | 14.00% | 2.2068 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 17.7317 | 18.00% | 3.1917 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **36.4219** minus penalties **0.0000** = final **36.4219**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 71.3426 | 18.00% | 12.8417 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 71.6446 | 12.00% | 8.5974 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 64.4682 | 10.00% | 6.4468 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 73.3333 | 6.00% | 4.4000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 84.2373 | 14.00% | 11.7932 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 48.9349 | 18.00% | 8.8083 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **60.3781** minus penalties **0.0000** = final **60.3781**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 75.5897 | 20.00% | 15.1179 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 73.3333 | 6.00% | 4.4000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 45.1857 | 6.00% | 2.7111 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **48.4291**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.4394`; VWAP-distance ATR `0.2858`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 5.803571428571416, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 5.803571428571416, "close": 340.55, "level": "LOW", "move_atr": 0.4394, "session_open": 343.1, "session_vwap": 342.20890051098047, "vwap_distance_atr": 0.2858} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 36.4219, "screening_level": "LOW", "selected": 60.3781, "short": 60.3781} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 48.4291} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.6, "volume_level": "HIGH", "volume_percentile_90": 0.6176470588235294, "volume_ratio_20": 0.03964657273608283} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 23.9562, "edge": -23.9562, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 17. LT

| Decision field | Actual value |
|---|---|
| Opportunity rank | 17 |
| Execution-readiness rank | 8 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | 18.1610 |
| OFactor final | 60.1851 |
| OFactor tier | LOW |
| LONG OFactor | 60.1851 |
| SHORT OFactor | 39.4949 |
| Directional edge LONG minus SHORT | 20.6902 |
| Directional-edge tier | HIGH |
| XFactor final | 55.4924 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 61.4571 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.8822 |
| close_price | 4,059.5000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 4,064.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 4,025.8000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 4,055.7000 |
| prev_close | 4,056.0000 |
| prior_high_20 | 4,074.0000 |
| prior_low_20 | 3,720.0000 |
| return_1d_pct | 0.0863 |
| return_21d_pct | 2.8815 |
| return_5d_pct | 0.8571 |
| return_63d_pct | 3.6697 |
| rsi_14 | 61.9755 |
| sector_return_21d_pct | 2.8815 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 4,055.7000 |
| session_volume | 8,423.0000 |
| session_vwap | 4,030.9210 |
| sma20 | 3,893.3900 |
| sma50 | 3,990.7080 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | LT |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.7800 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0394 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 61.4571 |
| close | 4,059.5000 |
| close_vs_ema61_pct | 2.2244 |
| ema61 | 3,968.2218 |
| high | 4,064.0000 |
| low | 4,025.8000 |
| macd_line | 23.3913 |
| move_atr | 0.0618 |
| open | 4,055.7000 |
| previous_close | 4,056.0000 |
| prior_high_20 | 4,074.0000 |
| prior_low_20 | 3,720.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 61.9755 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 4,030.9210 |
| sma20 | 3,893.3900 |
| sma50 | 3,990.7080 |
| turnover_lacs | 341.9317 |
| turnover_percentile | 0.7800 |
| volume_average_20 | 213,871.7500 |
| volume_current | 8,423.0000 |
| volume_median_90 | 2,209.5000 |
| volume_percentile_90 | 0.5294 |
| volume_previous_1d | 18,205.0000 |
| volume_previous_2d | 44,524.0000 |
| volume_ratio_20 | 0.0394 |
| vwap_distance_atr | 0.4650 |
| willr14 | -4.0960 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 70.3814 | 18.00% | 12.6687 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 65.5469 | 12.00% | 7.8656 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 42.5551 | 10.00% | 4.2555 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 97.3333 | 6.00% | 5.8400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 44.1150 | 14.00% | 6.1761 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 49.2772 | 18.00% | 8.8699 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **60.1851** minus penalties **0.0000** = final **60.1851**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 29.6186 | 18.00% | 5.3313 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 34.4531 | 12.00% | 4.1344 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 57.4449 | 10.00% | 5.7445 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 97.3333 | 6.00% | 5.8400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 55.8850 | 14.00% | 7.8239 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 17.3895 | 18.00% | 3.1301 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **39.4949** minus penalties **0.0000** = final **39.4949**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 96.5649 | 20.00% | 19.3130 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 97.3333 | 6.00% | 5.8400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 68.9904 | 6.00% | 4.1394 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **55.4924**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.0618`; VWAP-distance ATR `0.4650`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 61.4571428571429, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 61.4571428571429, "close": 4059.5, "level": "LOW", "move_atr": 0.0618, "session_open": 4055.7, "session_vwap": 4030.9209901460285, "vwap_distance_atr": 0.465} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 60.1851, "screening_level": "LOW", "selected": 60.1851, "short": 39.4949} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 55.4924} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.78, "volume_level": "HIGH", "volume_percentile_90": 0.5294117647058824, "volume_ratio_20": 0.03938341552823129} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 20.6902, "edge": 20.6902, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 18. ONGC

| Decision field | Actual value |
|---|---|
| Opportunity rank | 18 |
| Execution-readiness rank | 15 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | SHORT |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | -12.9354 |
| OFactor final | 59.8030 |
| OFactor tier | LOW |
| LONG OFactor | 34.7570 |
| SHORT OFactor | 59.8030 |
| Directional edge LONG minus SHORT | -25.0460 |
| Directional-edge tier | HIGH |
| XFactor final | 51.8913 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 4.4121 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.1538 |
| close_price | 238.9400 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 241.2500 |
| is_intraday_snapshot | 1.0000 |
| low_price | 238.5200 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 239.0100 |
| prev_close | 238.8500 |
| prior_high_20 | 254.2000 |
| prior_low_20 | 236.0900 |
| return_1d_pct | 0.0377 |
| return_21d_pct | -2.4575 |
| return_5d_pct | -1.2645 |
| return_63d_pct | -19.5894 |
| rsi_14 | 39.5456 |
| sector_return_21d_pct | -1.6384 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 239.0100 |
| session_volume | 45,064.0000 |
| session_vwap | 239.8301 |
| sma20 | 244.5910 |
| sma50 | 246.4280 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | ONGC |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.4600 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0260 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 4.4121 |
| close | 238.9400 |
| close_vs_ema61_pct | -5.0569 |
| ema61 | 252.0907 |
| high | 241.2500 |
| low | 238.5200 |
| macd_line | -2.4998 |
| move_atr | 0.0159 |
| open | 239.0100 |
| previous_close | 238.8500 |
| prior_high_20 | 254.2000 |
| prior_low_20 | 236.0900 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 39.5456 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 239.8301 |
| sma20 | 244.5910 |
| sma50 | 246.4280 |
| turnover_lacs | 107.6759 |
| turnover_percentile | 0.4600 |
| volume_average_20 | 1,730,952.5000 |
| volume_current | 45,064.0000 |
| volume_median_90 | 2,118.5000 |
| volume_percentile_90 | 0.6176 |
| volume_previous_1d | 400,787.0000 |
| volume_previous_2d | 408,114.0000 |
| volume_ratio_20 | 0.0260 |
| vwap_distance_atr | 0.2017 |
| willr14 | -84.2628 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 24.0858 | 18.00% | 4.3354 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 34.2770 | 12.00% | 4.1132 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 23.3105 | 10.00% | 2.3311 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 54.6667 | 6.00% | 3.2800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 19.8801 | 14.00% | 2.7832 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 18.9157 | 18.00% | 3.4048 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **34.7570** minus penalties **0.0000** = final **34.7570**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 75.9142 | 18.00% | 13.6646 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 65.7230 | 12.00% | 7.8868 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 76.6894 | 10.00% | 7.6689 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 54.6667 | 6.00% | 3.2800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 80.1200 | 14.00% | 11.2168 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 47.7510 | 18.00% | 8.5952 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **59.8030** minus penalties **0.0000** = final **59.8030**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 99.1186 | 20.00% | 19.8237 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 54.6667 | 6.00% | 3.2800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 43.1271 | 6.00% | 2.5876 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **51.8913**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.0159`; VWAP-distance ATR `0.2017`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 4.412142857142854, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 4.412142857142854, "close": 238.94, "level": "LOW", "move_atr": 0.0159, "session_open": 239.01, "session_vwap": 239.83010962187112, "vwap_distance_atr": 0.2017} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 34.757, "screening_level": "LOW", "selected": 59.803, "short": 59.803} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 51.8913} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.46, "volume_level": "HIGH", "volume_percentile_90": 0.6176470588235294, "volume_ratio_20": 0.026034221043038444} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 25.046, "edge": -25.046, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 19. DRREDDY

| Decision field | Actual value |
|---|---|
| Opportunity rank | 19 |
| Execution-readiness rank | 28 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | SHORT |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | -18.3094 |
| OFactor final | 59.6580 |
| OFactor tier | LOW |
| LONG OFactor | 32.3420 |
| SHORT OFactor | 59.6580 |
| Directional edge LONG minus SHORT | -27.3160 |
| Directional-edge tier | HIGH |
| XFactor final | 49.0442 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 25.5571 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.2240 |
| close_price | 1,168.1000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,177.8000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,165.3000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,172.0000 |
| prev_close | 1,172.0000 |
| prior_high_20 | 1,249.1000 |
| prior_low_20 | 1,101.0000 |
| return_1d_pct | -0.3328 |
| return_21d_pct | -6.1239 |
| return_5d_pct | -1.0085 |
| return_63d_pct | -7.6820 |
| rsi_14 | 37.4904 |
| sector_return_21d_pct | -1.1272 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 1,172.0000 |
| session_volume | 4,895.0000 |
| session_vwap | 1,173.0610 |
| sma20 | 1,183.4450 |
| sma50 | 1,255.4740 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | DRREDDY |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.3000 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0399 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 25.5571 |
| close | 1,168.1000 |
| close_vs_ema61_pct | -5.8701 |
| ema61 | 1,243.3732 |
| high | 1,177.8000 |
| low | 1,165.3000 |
| macd_line | -28.1692 |
| move_atr | 0.1526 |
| open | 1,172.0000 |
| previous_close | 1,172.0000 |
| prior_high_20 | 1,249.1000 |
| prior_low_20 | 1,101.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 37.4904 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 1,173.0610 |
| sma20 | 1,183.4450 |
| sma50 | 1,255.4740 |
| turnover_lacs | 57.1785 |
| turnover_percentile | 0.3000 |
| volume_average_20 | 122,799.1500 |
| volume_current | 4,895.0000 |
| volume_median_90 | 1,025.5000 |
| volume_percentile_90 | 0.6176 |
| volume_previous_1d | 28,237.0000 |
| volume_previous_2d | 44,209.0000 |
| volume_ratio_20 | 0.0399 |
| vwap_distance_atr | 0.1941 |
| willr14 | -33.7611 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 22.0888 | 18.00% | 3.9760 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 33.2884 | 12.00% | 3.9946 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 9.3854 | 10.00% | 0.9385 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 33.3333 | 6.00% | 2.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 21.4774 | 14.00% | 3.0068 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 21.7596 | 18.00% | 3.9167 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **32.3420** minus penalties **0.0000** = final **32.3420**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 77.9112 | 18.00% | 14.0240 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 66.7116 | 12.00% | 8.0054 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 90.6146 | 10.00% | 9.0615 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 33.3333 | 6.00% | 2.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 78.5226 | 14.00% | 10.9932 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 44.9070 | 18.00% | 8.0833 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **59.6580** minus penalties **0.0000** = final **59.6580**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 91.5223 | 20.00% | 18.3045 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 33.3333 | 6.00% | 2.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 42.3284 | 6.00% | 2.5397 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **49.0442**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1526`; VWAP-distance ATR `0.1941`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 25.55714285714284, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 25.55714285714284, "close": 1168.1, "level": "LOW", "move_atr": 0.1526, "session_open": 1172.0, "session_vwap": 1173.0610418794688, "vwap_distance_atr": 0.1941} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 32.342, "screening_level": "LOW", "selected": 59.658, "short": 59.658} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 49.0442} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.3, "volume_level": "HIGH", "volume_percentile_90": 0.6176470588235294, "volume_ratio_20": 0.039861839434556345} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 27.316, "edge": -27.316, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 20. BAJFINANCE

| Decision field | Actual value |
|---|---|
| Opportunity rank | 20 |
| Execution-readiness rank | 2 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | LONG |
| Resolved actionable direction | LONG |
| Direction state | ALIGNED |
| Session-direction score | 34.8928 |
| OFactor final | 58.9875 |
| OFactor tier | LOW |
| LONG OFactor | 58.9875 |
| SHORT OFactor | 34.4125 |
| Directional edge LONG minus SHORT | 24.5750 |
| Directional-edge tier | HIGH |
| XFactor final | 58.5857 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | PULLBACK_CONTINUATION / AWAITING_VOLUME |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 32.6357 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.9744 |
| close_price | 1,086.1000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,086.5000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,070.9000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,077.9000 |
| prev_close | 1,078.0000 |
| prior_high_20 | 1,176.4000 |
| prior_low_20 | 995.2000 |
| return_1d_pct | 0.7514 |
| return_21d_pct | 6.4282 |
| return_5d_pct | -5.8023 |
| return_63d_pct | 21.1962 |
| rsi_14 | 54.5464 |
| sector_return_21d_pct | 1.1896 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 1,077.9000 |
| session_volume | 28,313.0000 |
| session_vwap | 1,079.2083 |
| sma20 | 1,070.9950 |
| sma50 | 1,001.6750 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | BAJFINANCE |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.7000 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0312 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 32.6357 |
| close | 1,086.1000 |
| close_vs_ema61_pct | 6.9072 |
| ema61 | 1,013.5891 |
| high | 1,086.5000 |
| low | 1,070.9000 |
| macd_line | 31.3166 |
| move_atr | 0.2513 |
| open | 1,077.9000 |
| previous_close | 1,078.0000 |
| prior_high_20 | 1,176.4000 |
| prior_low_20 | 995.2000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 54.5464 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 1,079.2083 |
| sma20 | 1,070.9950 |
| sma50 | 1,001.6750 |
| turnover_lacs | 307.5075 |
| turnover_percentile | 0.7000 |
| volume_average_20 | 908,657.1500 |
| volume_current | 28,313.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.5588 |
| volume_previous_1d | 399,137.0000 |
| volume_previous_2d | 156,210.0000 |
| volume_ratio_20 | 0.0312 |
| vwap_distance_atr | 0.2112 |
| willr14 | -51.5705 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 86.6055 | 18.00% | 15.5890 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 30.3703 | 12.00% | 3.6444 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 70.0091 | 10.00% | 7.0009 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 86.6667 | 6.00% | 5.2000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 28.7175 | 14.00% | 4.0205 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.1301 | 18.00% | 9.0234 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **58.9875** minus penalties **0.0000** = final **58.9875**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 13.3945 | 18.00% | 2.4110 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 69.6296 | 12.00% | 8.3556 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 29.9909 | 10.00% | 2.9991 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 86.6667 | 6.00% | 5.2000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 71.2824 | 14.00% | 9.9795 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.5366 | 18.00% | 2.9766 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **39.4125** minus penalties **5.0000** = final **34.4125**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 55.0000 | 18.00% | 9.9000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 86.0412 | 20.00% | 17.2082 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 86.6667 | 6.00% | 5.2000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 61.2917 | 6.00% | 3.6775 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **58.5857**. Setup `PULLBACK_CONTINUATION` / state `AWAITING_VOLUME`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2513`; VWAP-distance ATR `0.2112`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 32.63571428571431, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["VOLUME_NOT_CONFIRMED"], "setup_type": "PULLBACK_CONTINUATION", "state": "AWAITING_VOLUME", "structural_stop": 1070.9, "trigger_price": 1086.1, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 32.63571428571431, "close": 1086.1, "level": "LOW", "move_atr": 0.2513, "session_open": 1077.9, "session_vwap": 1079.2083106700102, "vwap_distance_atr": 0.2112} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 58.9875, "screening_level": "LOW", "selected": 58.9875, "short": 34.4125} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 58.5857} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.7, "volume_level": "HIGH", "volume_percentile_90": 0.5588235294117647, "volume_ratio_20": 0.031159167129208194} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 24.575, "edge": 24.575, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 21. AXISBANK

| Decision field | Actual value |
|---|---|
| Opportunity rank | 21 |
| Execution-readiness rank | 23 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | SHORT |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | 15.4434 |
| OFactor final | 58.7483 |
| OFactor tier | LOW |
| LONG OFactor | 40.2917 |
| SHORT OFactor | 58.7483 |
| Directional edge LONG minus SHORT | -18.4566 |
| Directional-edge tier | HIGH |
| XFactor final | 49.7880 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 20.8929 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.5882 |
| close_price | 1,243.0000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,248.6000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,235.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,235.0000 |
| prev_close | 1,238.0000 |
| prior_high_20 | 1,348.0000 |
| prior_low_20 | 1,210.6000 |
| return_1d_pct | 0.4039 |
| return_21d_pct | -6.0965 |
| return_5d_pct | -2.2799 |
| return_63d_pct | -1.0114 |
| rsi_14 | 41.7450 |
| sector_return_21d_pct | 1.1896 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 1,235.0000 |
| session_volume | 26,092.0000 |
| session_vwap | 1,241.5218 |
| sma20 | 1,260.7400 |
| sma50 | 1,302.4480 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | AXISBANK |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.7400 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0352 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 20.8929 |
| close | 1,243.0000 |
| close_vs_ema61_pct | -3.4713 |
| ema61 | 1,289.1893 |
| high | 1,248.6000 |
| low | 1,235.0000 |
| macd_line | -17.5383 |
| move_atr | 0.3829 |
| open | 1,235.0000 |
| previous_close | 1,238.0000 |
| prior_high_20 | 1,348.0000 |
| prior_low_20 | 1,210.6000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 41.7450 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 1,241.5218 |
| sma20 | 1,260.7400 |
| sma50 | 1,302.4480 |
| turnover_lacs | 324.3236 |
| turnover_percentile | 0.7400 |
| volume_average_20 | 740,952.7500 |
| volume_current | 26,092.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.6176 |
| volume_previous_1d | 207,612.0000 |
| volume_previous_2d | 140,666.0000 |
| volume_ratio_20 | 0.0352 |
| vwap_distance_atr | 0.0708 |
| willr14 | -47.2313 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 30.4081 | 18.00% | 5.4735 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 32.2456 | 12.00% | 3.8695 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 2.2308 | 10.00% | 0.2231 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 92.0000 | 6.00% | 5.5200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 28.7175 | 14.00% | 4.0205 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 37.0888 | 18.00% | 6.6760 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **40.2917** minus penalties **0.0000** = final **40.2917**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 69.5918 | 18.00% | 12.5265 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 67.7544 | 12.00% | 8.1305 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 97.7692 | 10.00% | 9.7769 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 92.0000 | 6.00% | 5.5200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 71.2824 | 14.00% | 9.9795 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 29.5779 | 18.00% | 5.3240 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **58.7483** minus penalties **0.0000** = final **58.7483**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 78.7274 | 20.00% | 15.7455 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 92.0000 | 6.00% | 5.5200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 38.7082 | 6.00% | 2.3225 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **49.7880**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.3829`; VWAP-distance ATR `0.0708`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 20.892857142857174, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 20.892857142857174, "close": 1243.0, "level": "LOW", "move_atr": 0.3829, "session_open": 1235.0, "session_vwap": 1241.5218151157444, "vwap_distance_atr": 0.0708} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 40.2917, "screening_level": "LOW", "selected": 58.7483, "short": 58.7483} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 49.788} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.74, "volume_level": "HIGH", "volume_percentile_90": 0.6176470588235294, "volume_ratio_20": 0.03521412127831363} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 18.4566, "edge": -18.4566, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 22. MARUTI

| Decision field | Actual value |
|---|---|
| Opportunity rank | 22 |
| Execution-readiness rank | 13 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | 16.2187 |
| OFactor final | 58.5737 |
| OFactor tier | LOW |
| LONG OFactor | 58.5737 |
| SHORT OFactor | 29.0663 |
| Directional edge LONG minus SHORT | 29.5074 |
| Directional-edge tier | HIGH |
| XFactor final | 52.3915 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 274.7857 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.8000 |
| close_price | 14,082.0000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 14,113.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 13,958.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 14,039.0000 |
| prev_close | 14,037.0000 |
| prior_high_20 | 14,440.0000 |
| prior_low_20 | 13,197.0000 |
| return_1d_pct | 0.3206 |
| return_21d_pct | 1.6457 |
| return_5d_pct | -0.4806 |
| return_63d_pct | 7.4716 |
| rsi_14 | 56.2834 |
| sector_return_21d_pct | 8.1666 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 14,039.0000 |
| session_volume | 508.0000 |
| session_vwap | 14,072.2205 |
| sma20 | 13,819.0500 |
| sma50 | 13,677.0800 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | MARUTI |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.3400 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0104 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 274.7857 |
| close | 14,082.0000 |
| close_vs_ema61_pct | 2.4874 |
| ema61 | 13,728.8342 |
| high | 14,113.0000 |
| low | 13,958.0000 |
| macd_line | 117.1947 |
| move_atr | 0.1565 |
| open | 14,039.0000 |
| previous_close | 14,037.0000 |
| prior_high_20 | 14,440.0000 |
| prior_low_20 | 13,197.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 56.2834 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 14,072.2205 |
| sma20 | 13,819.0500 |
| sma50 | 13,677.0800 |
| turnover_lacs | 71.5366 |
| turnover_percentile | 0.3400 |
| volume_average_20 | 48,943.0500 |
| volume_current | 508.0000 |
| volume_median_90 | 624.0000 |
| volume_percentile_90 | 0.4706 |
| volume_previous_1d | 24,514.0000 |
| volume_previous_2d | 11,351.0000 |
| volume_ratio_20 | 0.0104 |
| vwap_distance_atr | 0.0356 |
| willr14 | -28.8013 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 67.2555 | 18.00% | 12.1060 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 54.2810 | 12.00% | 6.5137 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 18.3156 | 10.00% | 1.8316 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 38.6667 | 6.00% | 2.3200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 93.1416 | 14.00% | 13.0398 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 45.8518 | 18.00% | 8.2533 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **58.5737** minus penalties **0.0000** = final **58.5737**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 32.7445 | 18.00% | 5.8940 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 45.7190 | 12.00% | 5.4863 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 81.6844 | 10.00% | 8.1684 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 38.6667 | 6.00% | 2.3200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 6.8584 | 14.00% | 0.9602 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 20.8148 | 18.00% | 3.7467 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **34.0663** minus penalties **5.0000** = final **29.0663**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 91.3064 | 20.00% | 18.2613 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 38.6667 | 6.00% | 2.3200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 93.5037 | 6.00% | 5.6102 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **52.3915**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1565`; VWAP-distance ATR `0.0356`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 274.7857142857143, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 274.7857142857143, "close": 14082.0, "level": "LOW", "move_atr": 0.1565, "session_open": 14039.0, "session_vwap": 14072.220472440946, "vwap_distance_atr": 0.0356} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 58.5737, "screening_level": "LOW", "selected": 58.5737, "short": 29.0663} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 52.3915} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.34, "volume_level": "MEDIUM", "volume_percentile_90": 0.47058823529411764, "volume_ratio_20": 0.01037941035550502} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 29.5074, "edge": 29.5074, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": false
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 23. JIOFIN

| Decision field | Actual value |
|---|---|
| Opportunity rank | 23 |
| Execution-readiness rank | 9 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | -1.6937 |
| OFactor final | 58.2035 |
| OFactor tier | LOW |
| LONG OFactor | 58.2035 |
| SHORT OFactor | 34.8764 |
| Directional edge LONG minus SHORT | 23.3271 |
| Directional-edge tier | HIGH |
| XFactor final | 53.9981 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 6.6471 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.5345 |
| close_price | 256.4500 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 257.8000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 254.9000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 257.0000 |
| prev_close | 256.8000 |
| prior_high_20 | 268.2000 |
| prior_low_20 | 231.2100 |
| return_1d_pct | -0.1363 |
| return_21d_pct | 5.9886 |
| return_5d_pct | -2.4905 |
| return_63d_pct | 10.8015 |
| rsi_14 | 59.4521 |
| sector_return_21d_pct | 1.1896 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 257.0000 |
| session_volume | 116,973.0000 |
| session_vwap | 255.9658 |
| sma20 | 245.5105 |
| sma50 | 240.8032 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | JIOFIN |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.6800 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0848 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 6.6471 |
| close | 256.4500 |
| close_vs_ema61_pct | 5.1081 |
| ema61 | 243.5716 |
| high | 257.8000 |
| low | 254.9000 |
| macd_line | 5.8897 |
| move_atr | 0.0827 |
| open | 257.0000 |
| previous_close | 256.8000 |
| prior_high_20 | 268.2000 |
| prior_low_20 | 231.2100 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 59.4521 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 255.9658 |
| sma20 | 245.5105 |
| sma50 | 240.8032 |
| turnover_lacs | 299.9773 |
| turnover_percentile | 0.6800 |
| volume_average_20 | 1,378,981.9000 |
| volume_current | 116,973.0000 |
| volume_median_90 | 20,700.5000 |
| volume_percentile_90 | 0.6176 |
| volume_previous_1d | 235,336.0000 |
| volume_previous_2d | 555,446.0000 |
| volume_ratio_20 | 0.0848 |
| vwap_distance_atr | 0.0728 |
| willr14 | -31.7653 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 87.6201 | 18.00% | 15.7716 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 49.0750 | 12.00% | 5.8890 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 67.2614 | 10.00% | 6.7261 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 84.0000 | 6.00% | 5.0400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 28.7175 | 14.00% | 4.0205 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 34.7059 | 18.00% | 6.2471 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **58.2035** minus penalties **0.0000** = final **58.2035**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 12.3798 | 18.00% | 2.2284 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 50.9250 | 12.00% | 6.1110 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 32.7386 | 10.00% | 3.2739 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 84.0000 | 6.00% | 5.0400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 71.2824 | 14.00% | 9.9795 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 31.9608 | 18.00% | 5.7529 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **39.8764** minus penalties **5.0000** = final **34.8764**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 95.4032 | 20.00% | 19.0806 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 84.0000 | 6.00% | 5.0400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 61.2917 | 6.00% | 3.6775 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **53.9981**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.0827`; VWAP-distance ATR `0.0728`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 6.647142857142858, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 6.647142857142858, "close": 256.45, "level": "LOW", "move_atr": 0.0827, "session_open": 257.0, "session_vwap": 255.96583912526822, "vwap_distance_atr": 0.0728} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 58.2035, "screening_level": "LOW", "selected": 58.2035, "short": 34.8764} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 53.9981} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.68, "volume_level": "HIGH", "volume_percentile_90": 0.6176470588235294, "volume_ratio_20": 0.08482562388962467} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 23.3271, "edge": 23.3271, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 24. HDFCLIFE

| Decision field | Actual value |
|---|---|
| Opportunity rank | 24 |
| Execution-readiness rank | 26 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | SHORT |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | 2.8434 |
| OFactor final | 58.0261 |
| OFactor tier | LOW |
| LONG OFactor | 36.8539 |
| SHORT OFactor | 58.0261 |
| Directional edge LONG minus SHORT | -21.1722 |
| Directional-edge tier | HIGH |
| XFactor final | 49.2867 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 9.3429 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.7429 |
| close_price | 537.7500 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 540.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 531.2500 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 540.0000 |
| prev_close | 540.0000 |
| prior_high_20 | 588.0000 |
| prior_low_20 | 530.5000 |
| return_1d_pct | -0.4167 |
| return_21d_pct | -5.2757 |
| return_5d_pct | -2.7753 |
| return_63d_pct | -10.7913 |
| rsi_14 | 38.4161 |
| sector_return_21d_pct | 1.1896 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 540.0000 |
| session_volume | 23,471.0000 |
| session_vwap | 534.0765 |
| sma20 | 554.6050 |
| sma50 | 566.3020 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | HDFCLIFE |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.4800 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0832 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 9.3429 |
| close | 537.7500 |
| close_vs_ema61_pct | -6.0494 |
| ema61 | 573.5292 |
| high | 540.0000 |
| low | 531.2500 |
| macd_line | -8.2687 |
| move_atr | 0.2408 |
| open | 540.0000 |
| previous_close | 540.0000 |
| prior_high_20 | 588.0000 |
| prior_low_20 | 530.5000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 38.4161 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 534.0765 |
| sma20 | 554.6050 |
| sma50 | 566.3020 |
| turnover_lacs | 126.2153 |
| turnover_percentile | 0.4800 |
| volume_average_20 | 282,127.2500 |
| volume_current | 23,471.0000 |
| volume_median_90 | 3,398.0000 |
| volume_percentile_90 | 0.6176 |
| volume_previous_1d | 53,754.0000 |
| volume_previous_2d | 85,171.0000 |
| volume_ratio_20 | 0.0832 |
| vwap_distance_atr | 0.3932 |
| willr14 | -76.9475 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 18.8640 | 18.00% | 3.3955 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 26.8525 | 12.00% | 3.2223 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 4.7960 | 10.00% | 0.4796 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 57.3333 | 6.00% | 3.4400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 28.7175 | 14.00% | 4.0205 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 43.2598 | 18.00% | 7.7868 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **36.8539** minus penalties **0.0000** = final **36.8539**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 81.1360 | 18.00% | 14.6045 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 73.1475 | 12.00% | 8.7777 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 95.2040 | 10.00% | 9.5204 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 57.3333 | 6.00% | 3.4400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 71.2824 | 14.00% | 9.9795 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 23.4069 | 18.00% | 4.2132 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **58.0261** minus penalties **0.0000** = final **58.0261**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 86.6208 | 20.00% | 17.3242 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 57.3333 | 6.00% | 3.4400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 38.7082 | 6.00% | 2.3225 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **49.2867**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2408`; VWAP-distance ATR `0.3932`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 9.34285714285714, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 9.34285714285714, "close": 537.75, "level": "LOW", "move_atr": 0.2408, "session_open": 540.0, "session_vwap": 534.0764922670529, "vwap_distance_atr": 0.3932} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 36.8539, "screening_level": "LOW", "selected": 58.0261, "short": 58.0261} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 49.2867} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.48, "volume_level": "HIGH", "volume_percentile_90": 0.6176470588235294, "volume_ratio_20": 0.08319295636986501} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 21.1722, "edge": -21.1722, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 25. TRENT

| Decision field | Actual value |
|---|---|
| Opportunity rank | 25 |
| Execution-readiness rank | 11 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | LONG |
| Resolved actionable direction | LONG |
| Direction state | ALIGNED |
| Session-direction score | 34.2146 |
| OFactor final | 57.7490 |
| OFactor tier | LOW |
| LONG OFactor | 57.7490 |
| SHORT OFactor | 35.0110 |
| Directional edge LONG minus SHORT | 22.7380 |
| Directional-edge tier | HIGH |
| XFactor final | 53.4356 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 74.0286 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.9192 |
| close_price | 3,028.7000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 3,032.1000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 2,990.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 3,010.0000 |
| prev_close | 2,997.0000 |
| prior_high_20 | 3,244.5000 |
| prior_low_20 | 2,836.0000 |
| return_1d_pct | 1.0577 |
| return_21d_pct | 4.3372 |
| return_5d_pct | -0.6984 |
| return_63d_pct | -25.8489 |
| rsi_14 | 49.1780 |
| sector_return_21d_pct | 6.5187 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 3,010.0000 |
| session_volume | 7,639.0000 |
| session_vwap | 3,008.2159 |
| sma20 | 2,954.1400 |
| sma50 | 3,076.3680 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | TRENT |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.6600 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0681 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 74.0286 |
| close | 3,028.7000 |
| close_vs_ema61_pct | -5.9265 |
| ema61 | 3,225.8656 |
| high | 3,032.1000 |
| low | 2,990.0000 |
| macd_line | -11.6422 |
| move_atr | 0.2526 |
| open | 3,010.0000 |
| previous_close | 2,997.0000 |
| prior_high_20 | 3,244.5000 |
| prior_low_20 | 2,836.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 49.1780 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 3,008.2159 |
| sma20 | 2,954.1400 |
| sma50 | 3,076.3680 |
| turnover_lacs | 231.3624 |
| turnover_percentile | 0.6600 |
| volume_average_20 | 112,189.6500 |
| volume_current | 7,639.0000 |
| volume_median_90 | 1,346.0000 |
| volume_percentile_90 | 0.6471 |
| volume_previous_1d | 73,811.0000 |
| volume_previous_2d | 32,095.0000 |
| volume_ratio_20 | 0.0681 |
| vwap_distance_atr | 0.2767 |
| willr14 | -52.8274 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 48.6498 | 18.00% | 8.7570 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 46.2682 | 12.00% | 5.5522 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 40.2869 | 10.00% | 4.0287 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 81.3333 | 6.00% | 4.8800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 78.2131 | 14.00% | 10.9498 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.4001 | 18.00% | 9.0720 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **57.7490** minus penalties **0.0000** = final **57.7490**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 51.3502 | 18.00% | 9.2430 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 53.7318 | 12.00% | 6.4478 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 59.7131 | 10.00% | 5.9713 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 81.3333 | 6.00% | 4.8800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 21.7869 | 14.00% | 3.0502 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.2666 | 18.00% | 2.9280 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **40.0110** minus penalties **5.0000** = final **35.0110**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 85.9664 | 20.00% | 17.1933 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 81.3333 | 6.00% | 4.8800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 86.0395 | 6.00% | 5.1624 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **53.4356**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2526`; VWAP-distance ATR `0.2767`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 74.02857142857144, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 74.02857142857144, "close": 3028.7, "level": "LOW", "move_atr": 0.2526, "session_open": 3010.0, "session_vwap": 3008.215905223197, "vwap_distance_atr": 0.2767} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 57.749, "screening_level": "LOW", "selected": 57.749, "short": 35.011} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 53.4356} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.66, "volume_level": "HIGH", "volume_percentile_90": 0.6470588235294118, "volume_ratio_20": 0.06809006000107853} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 22.738, "edge": 22.738, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 26. ULTRACEMCO

| Decision field | Actual value |
|---|---|
| Opportunity rank | 26 |
| Execution-readiness rank | 18 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | LONG |
| Resolved actionable direction | LONG |
| Direction state | ALIGNED |
| Session-direction score | 26.7908 |
| OFactor final | 56.2107 |
| OFactor tier | LOW |
| LONG OFactor | 56.2107 |
| SHORT OFactor | 35.1492 |
| Directional edge LONG minus SHORT | 21.0615 |
| Directional-edge tier | HIGH |
| XFactor final | 50.7897 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 210.6429 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.9236 |
| close_price | 12,070.0000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 12,082.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 11,925.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 12,040.0000 |
| prev_close | 12,105.0000 |
| prior_high_20 | 12,239.0000 |
| prior_low_20 | 11,355.0000 |
| return_1d_pct | -0.2891 |
| return_21d_pct | 3.0655 |
| return_5d_pct | 0.1327 |
| return_63d_pct | 4.2945 |
| rsi_14 | 58.3692 |
| sector_return_21d_pct | 4.1357 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 12,040.0000 |
| session_volume | 352.0000 |
| session_vwap | 12,012.8608 |
| sma20 | 11,904.0000 |
| sma50 | 11,547.0400 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | ULTRACEMCO |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.2600 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0098 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 210.6429 |
| close | 12,070.0000 |
| close_vs_ema61_pct | 2.8810 |
| ema61 | 11,720.7347 |
| high | 12,082.0000 |
| low | 11,925.0000 |
| macd_line | 137.7516 |
| move_atr | 0.1424 |
| open | 12,040.0000 |
| previous_close | 12,105.0000 |
| prior_high_20 | 12,239.0000 |
| prior_low_20 | 11,355.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 58.3692 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 12,012.8608 |
| sma20 | 11,904.0000 |
| sma50 | 11,547.0400 |
| turnover_lacs | 42.4864 |
| turnover_percentile | 0.2600 |
| volume_average_20 | 35,808.1000 |
| volume_current | 352.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.5588 |
| volume_previous_1d | 10,565.0000 |
| volume_previous_2d | 12,225.0000 |
| volume_ratio_20 | 0.0098 |
| vwap_distance_atr | 0.2713 |
| willr14 | -30.7832 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 67.5160 | 18.00% | 12.1529 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 58.9222 | 12.00% | 7.0707 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 39.7854 | 10.00% | 3.9785 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 28.0000 | 6.00% | 1.6800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 55.8731 | 14.00% | 7.8222 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 49.9842 | 18.00% | 8.9972 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **56.2107** minus penalties **0.0000** = final **56.2107**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 32.4840 | 18.00% | 5.8471 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 41.0778 | 12.00% | 4.9293 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 60.2146 | 10.00% | 6.0215 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 28.0000 | 6.00% | 1.6800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 44.1268 | 14.00% | 6.1778 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.6825 | 18.00% | 3.0028 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **35.1492** minus penalties **0.0000** = final **35.1492**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 92.0877 | 20.00% | 18.4175 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 28.0000 | 6.00% | 1.6800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 74.8695 | 6.00% | 4.4922 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **50.7897**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1424`; VWAP-distance ATR `0.2713`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 210.64285714285714, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 210.64285714285714, "close": 12070.0, "level": "LOW", "move_atr": 0.1424, "session_open": 12040.0, "session_vwap": 12012.860795454544, "vwap_distance_atr": 0.2713} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 56.2107, "screening_level": "LOW", "selected": 56.2107, "short": 35.1492} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 50.7897} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.26, "volume_level": "HIGH", "volume_percentile_90": 0.5588235294117647, "volume_ratio_20": 0.009830178088197921} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 21.0615, "edge": 21.0615, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 27. TMPV

| Decision field | Actual value |
|---|---|
| Opportunity rank | 27 |
| Execution-readiness rank | 27 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | 13.0171 |
| OFactor final | 55.6840 |
| OFactor tier | LOW |
| LONG OFactor | 55.6840 |
| SHORT OFactor | 28.2760 |
| Directional edge LONG minus SHORT | 27.4080 |
| Directional-edge tier | HIGH |
| XFactor final | 49.0583 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4638 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 6.5321 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.5781 |
| close_price | 348.4000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 351.1000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 344.7000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 346.5000 |
| prev_close | 347.0000 |
| prior_high_20 | 353.2000 |
| prior_low_20 | 318.2500 |
| return_1d_pct | 0.4035 |
| return_21d_pct | 3.0922 |
| return_5d_pct | -0.2577 |
| return_63d_pct | 3.4288 |
| rsi_14 | 56.1699 |
| sector_return_21d_pct | 8.1666 |
| session_bar_coverage | 0.4638 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 346.5000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 335.8925 |
| sma50 | 353.7100 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | TMPV |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.1100 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 6.5321 |
| close | 348.4000 |
| close_vs_ema61_pct | 0.1026 |
| ema61 | 348.0310 |
| high | 351.1000 |
| low | 344.7000 |
| macd_line | 0.1895 |
| move_atr | 0.2909 |
| open | 346.5000 |
| previous_close | 347.0000 |
| prior_high_20 | 353.2000 |
| prior_low_20 | 318.2500 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 56.1699 |
| session_bar_coverage | 0.4638 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 335.8925 |
| sma50 | 353.7100 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.1100 |
| volume_average_20 | 882,981.3500 |
| volume_current | 0.0000 |
| volume_median_90 | 13,219.0000 |
| volume_percentile_90 | 0.5000 |
| volume_previous_1d | 132,911.0000 |
| volume_previous_2d | 144,837.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -13.7339 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4638 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 65.1215 | 18.00% | 11.7219 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 55.0963 | 12.00% | 6.6116 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 27.3558 | 10.00% | 2.7356 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 93.1416 | 14.00% | 13.0398 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 36.5885 | 18.00% | 6.5859 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **55.6840** minus penalties **0.0000** = final **55.6840**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 34.8785 | 18.00% | 6.2781 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 44.9037 | 12.00% | 5.3884 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 72.6442 | 10.00% | 7.2644 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 6.8584 | 14.00% | 0.9602 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 30.0781 | 18.00% | 5.4141 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **33.2760** minus penalties **5.0000** = final **28.2760**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 83.8406 | 20.00% | 16.7681 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 93.5037 | 6.00% | 5.6102 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **49.0583**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2909`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 6.532145857142861, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 6.532145857142861, "close": 348.4, "level": "LOW", "move_atr": 0.2909, "session_open": 346.5, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 55.684, "screening_level": "LOW", "selected": 55.684, "short": 28.276} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 49.0583} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.11, "volume_level": "HIGH", "volume_percentile_90": 0.5, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 27.408, "edge": 27.408, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 28. JSWSTEEL

| Decision field | Actual value |
|---|---|
| Opportunity rank | 28 |
| Execution-readiness rank | 29 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | 16.8861 |
| OFactor final | 54.7418 |
| OFactor tier | LOW |
| LONG OFactor | 54.7418 |
| SHORT OFactor | 36.2982 |
| Directional edge LONG minus SHORT | 18.4436 |
| Directional-edge tier | HIGH |
| XFactor final | 48.8349 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 26.8357 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.6442 |
| close_price | 1,306.2000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,312.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,295.7000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,299.5000 |
| prev_close | 1,299.5000 |
| prior_high_20 | 1,335.0000 |
| prior_low_20 | 1,218.0000 |
| return_1d_pct | 0.5156 |
| return_21d_pct | 4.8820 |
| return_5d_pct | 1.0756 |
| return_63d_pct | 2.4551 |
| rsi_14 | 60.7315 |
| sector_return_21d_pct | 1.9910 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 1,299.5000 |
| session_volume | 2,531.0000 |
| session_vwap | 1,303.4823 |
| sma20 | 1,264.3900 |
| sma50 | 1,262.6960 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | JSWSTEEL |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.2400 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0190 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 26.8357 |
| close | 1,306.2000 |
| close_vs_ema61_pct | 3.4651 |
| ema61 | 1,260.9962 |
| high | 1,312.0000 |
| low | 1,295.7000 |
| macd_line | 15.5365 |
| move_atr | 0.2497 |
| open | 1,299.5000 |
| previous_close | 1,299.5000 |
| prior_high_20 | 1,335.0000 |
| prior_low_20 | 1,218.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 60.7315 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 1,303.4823 |
| sma20 | 1,264.3900 |
| sma50 | 1,262.6960 |
| turnover_lacs | 33.0599 |
| turnover_percentile | 0.2400 |
| volume_average_20 | 133,104.5000 |
| volume_current | 2,531.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.5588 |
| volume_previous_1d | 24,008.0000 |
| volume_previous_2d | 27,686.0000 |
| volume_ratio_20 | 0.0190 |
| vwap_distance_atr | 0.1013 |
| willr14 | -26.9411 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 72.2475 | 18.00% | 13.0045 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 65.2131 | 12.00% | 7.8256 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 57.8407 | 10.00% | 5.7841 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 25.3333 | 6.00% | 1.5200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 35.7660 | 14.00% | 5.0072 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 39.3950 | 18.00% | 7.0911 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **54.7418** minus penalties **0.0000** = final **54.7418**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 27.7525 | 18.00% | 4.9955 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 34.7869 | 12.00% | 4.1744 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 42.1593 | 10.00% | 4.2159 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 25.3333 | 6.00% | 1.5200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 64.2340 | 14.00% | 8.9928 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 27.2717 | 18.00% | 4.9089 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **36.2982** minus penalties **0.0000** = final **36.2982**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 86.1296 | 20.00% | 17.2259 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 25.3333 | 6.00% | 1.5200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 64.8160 | 6.00% | 3.8890 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **48.8349**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2497`; VWAP-distance ATR `0.1013`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 26.83571428571429, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 26.83571428571429, "close": 1306.2, "level": "LOW", "move_atr": 0.2497, "session_open": 1299.5, "session_vwap": 1303.482338996444, "vwap_distance_atr": 0.1013} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 54.7418, "screening_level": "LOW", "selected": 54.7418, "short": 36.2982} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 48.8349} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.24, "volume_level": "HIGH", "volume_percentile_90": 0.5588235294117647, "volume_ratio_20": 0.01901513472497173} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 18.4436, "edge": 18.4436, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 29. ASIANPAINT

| Decision field | Actual value |
|---|---|
| Opportunity rank | 29 |
| Execution-readiness rank | 16 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | LONG |
| Resolved actionable direction | LONG |
| Direction state | ALIGNED |
| Session-direction score | 24.2635 |
| OFactor final | 54.0482 |
| OFactor tier | LOW |
| LONG OFactor | 54.0482 |
| SHORT OFactor | 34.2318 |
| Directional edge LONG minus SHORT | 19.8164 |
| Directional-edge tier | HIGH |
| XFactor final | 51.5347 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION |
| Daily level | LOW |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 61.7286 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.6619 |
| close_price | 2,738.1000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 2,749.9000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 2,715.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 2,724.7000 |
| prev_close | 2,735.0000 |
| prior_high_20 | 2,864.0000 |
| prior_low_20 | 2,579.8999 |
| return_1d_pct | 0.1133 |
| return_21d_pct | 2.2518 |
| return_5d_pct | -2.5587 |
| return_63d_pct | 4.6035 |
| rsi_14 | 53.5380 |
| sector_return_21d_pct | 6.3207 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 2,724.7000 |
| session_volume | 2,993.0000 |
| session_vwap | 2,730.2985 |
| sma20 | 2,712.1700 |
| sma50 | 2,701.3880 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | ASIANPAINT |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.3800 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0223 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 61.7286 |
| close | 2,738.1000 |
| close_vs_ema61_pct | 2.6378 |
| ema61 | 2,665.3849 |
| high | 2,749.9000 |
| low | 2,715.0000 |
| macd_line | 19.9608 |
| move_atr | 0.2171 |
| open | 2,724.7000 |
| previous_close | 2,735.0000 |
| prior_high_20 | 2,864.0000 |
| prior_low_20 | 2,579.8999 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 53.5380 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 2,730.2985 |
| sma20 | 2,712.1700 |
| sma50 | 2,701.3880 |
| turnover_lacs | 81.9513 |
| turnover_percentile | 0.3800 |
| volume_average_20 | 134,481.3500 |
| volume_current | 2,993.0000 |
| volume_median_90 | 1,848.5000 |
| volume_percentile_90 | 0.5294 |
| volume_previous_1d | 59,825.0000 |
| volume_previous_2d | 17,175.0000 |
| volume_ratio_20 | 0.0223 |
| vwap_distance_atr | 0.1264 |
| willr14 | -51.6195 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 61.4436 | 18.00% | 11.0598 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 42.8766 | 12.00% | 5.1452 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 27.8721 | 10.00% | 2.7872 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 44.0000 | 6.00% | 2.6400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 76.3573 | 14.00% | 10.6900 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 40.0928 | 18.00% | 7.2167 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **54.0482** minus penalties **0.0000** = final **54.0482**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 38.5564 | 18.00% | 6.9402 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 57.1234 | 12.00% | 6.8548 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 72.1279 | 10.00% | 7.2128 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 44.0000 | 6.00% | 2.6400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 23.6427 | 14.00% | 3.3100 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 26.5739 | 18.00% | 4.7833 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **39.2318** minus penalties **5.0000** = final **34.2318**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 87.9400 | 20.00% | 17.5880 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 44.0000 | 6.00% | 2.6400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 85.1116 | 6.00% | 5.1067 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **51.5347**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2171`; VWAP-distance ATR `0.1264`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 61.72857142857148, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 61.72857142857148, "close": 2738.1, "level": "LOW", "move_atr": 0.2171, "session_open": 2724.7, "session_vwap": 2730.2984630805213, "vwap_distance_atr": 0.1264} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 54.0482, "screening_level": "LOW", "selected": 54.0482, "short": 34.2318} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 51.5347} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.38, "volume_level": "HIGH", "volume_percentile_90": 0.5294117647058824, "volume_ratio_20": 0.022255874141656074} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 19.8164, "edge": 19.8164, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": true,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 30. ADANIENT

| Decision field | Actual value |
|---|---|
| Opportunity rank | 30 |
| Execution-readiness rank | 39 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | ALIGNED |
| Session-direction score | -21.3298 |
| OFactor final | 52.2529 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 39.4271 |
| SHORT OFactor | 52.2529 |
| Directional edge LONG minus SHORT | -12.8258 |
| Directional-edge tier | HIGH |
| XFactor final | 45.6027 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 62.0500 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.4675 |
| close_price | 2,994.6000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 3,021.6000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 2,970.9000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 3,020.0000 |
| prev_close | 3,020.0000 |
| prior_high_20 | 3,219.7000 |
| prior_low_20 | 2,972.7000 |
| return_1d_pct | -0.8411 |
| return_21d_pct | -5.1531 |
| return_5d_pct | -2.3924 |
| return_63d_pct | 19.8799 |
| rsi_14 | 43.1602 |
| sector_return_21d_pct | 1.9910 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 3,020.0000 |
| session_volume | 1,438.0000 |
| session_vwap | 3,004.2010 |
| sma20 | 3,085.7600 |
| sma50 | 3,048.8400 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | ADANIENT |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.2800 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0081 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 62.0500 |
| close | 2,994.6000 |
| close_vs_ema61_pct | 1.8606 |
| ema61 | 2,938.0755 |
| high | 3,021.6000 |
| low | 2,970.9000 |
| macd_line | -10.2799 |
| move_atr | 0.4093 |
| open | 3,020.0000 |
| previous_close | 3,020.0000 |
| prior_high_20 | 3,219.7000 |
| prior_low_20 | 2,972.7000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 43.1602 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 3,004.2010 |
| sma20 | 3,085.7600 |
| sma50 | 3,048.8400 |
| turnover_lacs | 43.0623 |
| turnover_percentile | 0.2800 |
| volume_average_20 | 177,468.4000 |
| volume_current | 1,438.0000 |
| volume_median_90 | 1,385.0000 |
| volume_percentile_90 | 0.5000 |
| volume_previous_1d | 22,191.0000 |
| volume_previous_2d | 23,521.0000 |
| volume_ratio_20 | 0.0081 |
| vwap_distance_atr | 0.1547 |
| willr14 | -89.7403 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 44.8389 | 18.00% | 8.0710 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 33.1917 | 12.00% | 3.9830 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 2.6747 | 10.00% | 0.2675 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 30.6667 | 6.00% | 1.8400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 35.7660 | 14.00% | 5.0072 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 31.9395 | 18.00% | 5.7491 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **39.4271** minus penalties **0.0000** = final **39.4271**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 55.1611 | 18.00% | 9.9290 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 66.8083 | 12.00% | 8.0170 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 97.3254 | 10.00% | 9.7325 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 30.6667 | 6.00% | 1.8400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 64.2340 | 14.00% | 8.9928 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 34.7272 | 18.00% | 6.2509 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **52.2529** minus penalties **0.0000** = final **52.2529**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 77.2585 | 20.00% | 15.4517 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 30.6667 | 6.00% | 1.8400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 35.1840 | 6.00% | 2.1110 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **45.6027**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.4093`; VWAP-distance ATR `0.1547`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 62.050000000000054, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 62.050000000000054, "close": 2994.6, "level": "LOW", "move_atr": 0.4093, "session_open": 3020.0, "session_vwap": 3004.200973574409, "vwap_distance_atr": 0.1547} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 39.4271, "screening_level": "BELOW_MINIMUM", "selected": 52.2529, "short": 52.2529} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 45.6027} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.28, "volume_level": "HIGH", "volume_percentile_90": 0.5, "volume_ratio_20": 0.008102850986429133} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 12.8258, "edge": -12.8258, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 31. BHARTIARTL

| Decision field | Actual value |
|---|---|
| Opportunity rank | 32 |
| Execution-readiness rank | 12 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | -11.3390 |
| OFactor final | 51.2575 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 51.2575 |
| SHORT OFactor | 43.1025 |
| Directional edge LONG minus SHORT | 8.1550 |
| Directional-edge tier | HIGH |
| XFactor final | 53.1575 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 34.0357 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.4356 |
| close_price | 1,947.5000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,958.9000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,938.7000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,955.0000 |
| prev_close | 1,959.9000 |
| prior_high_20 | 2,031.0000 |
| prior_low_20 | 1,878.0000 |
| return_1d_pct | -0.6327 |
| return_21d_pct | 1.4112 |
| return_5d_pct | -1.1672 |
| return_63d_pct | 8.8475 |
| rsi_14 | 54.0835 |
| sector_return_21d_pct | 1.4112 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 1,955.0000 |
| session_volume | 17,390.0000 |
| session_vwap | 1,944.6440 |
| sma20 | 1,938.3250 |
| sma50 | 1,890.3620 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | BHARTIARTL |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.7600 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0234 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 34.0357 |
| close | 1,947.5000 |
| close_vs_ema61_pct | 2.1998 |
| ema61 | 1,904.1839 |
| high | 1,958.9000 |
| low | 1,938.7000 |
| macd_line | 17.8370 |
| move_atr | 0.2204 |
| open | 1,955.0000 |
| previous_close | 1,959.9000 |
| prior_high_20 | 2,031.0000 |
| prior_low_20 | 1,878.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 54.0835 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 1,944.6440 |
| sma20 | 1,938.3250 |
| sma50 | 1,890.3620 |
| turnover_lacs | 338.6703 |
| turnover_percentile | 0.7600 |
| volume_average_20 | 742,122.6000 |
| volume_current | 17,390.0000 |
| volume_median_90 | 15,533.5000 |
| volume_percentile_90 | 0.5000 |
| volume_previous_1d | 57,902.0000 |
| volume_previous_2d | 269,412.0000 |
| volume_ratio_20 | 0.0234 |
| vwap_distance_atr | 0.0839 |
| willr14 | -54.5752 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 64.5395 | 18.00% | 11.6171 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 49.2201 | 12.00% | 5.9064 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 37.9601 | 10.00% | 3.7960 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 94.6667 | 6.00% | 5.6800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 30.3302 | 14.00% | 4.2462 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 30.5694 | 18.00% | 5.5025 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **51.2575** minus penalties **0.0000** = final **51.2575**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 35.4605 | 18.00% | 6.3829 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 50.7799 | 12.00% | 6.0936 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 62.0399 | 10.00% | 6.2040 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 94.6667 | 6.00% | 5.6800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 69.6698 | 14.00% | 9.7538 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 36.0972 | 18.00% | 6.4975 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **48.1025** minus penalties **5.0000** = final **43.1025**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 87.7580 | 20.00% | 17.5516 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 94.6667 | 6.00% | 5.6800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 62.0981 | 6.00% | 3.7259 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **53.1575**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2204`; VWAP-distance ATR `0.0839`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 34.0357142857143, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 34.0357142857143, "close": 1947.5, "level": "LOW", "move_atr": 0.2204, "session_open": 1955.0, "session_vwap": 1944.6440080506038, "vwap_distance_atr": 0.0839} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 51.2575, "screening_level": "BELOW_MINIMUM", "selected": 51.2575, "short": 43.1025} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 53.1575} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.76, "volume_level": "HIGH", "volume_percentile_90": 0.5, "volume_ratio_20": 0.023432785903569033} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 8.155, "edge": 8.155, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 32. HINDUNILVR

| Decision field | Actual value |
|---|---|
| Opportunity rank | 33 |
| Execution-readiness rank | 34 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | SHORT |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | 0.6851 |
| OFactor final | 51.0471 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 37.9129 |
| SHORT OFactor | 51.0471 |
| Directional edge LONG minus SHORT | -13.1342 |
| Directional-edge tier | HIGH |
| XFactor final | 47.9132 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4638 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 48.2857 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.6951 |
| close_price | 2,091.0000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 2,096.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 2,079.6000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 2,096.0000 |
| prev_close | 2,096.0000 |
| prior_high_20 | 2,213.0000 |
| prior_low_20 | 2,016.0000 |
| return_1d_pct | -0.2385 |
| return_21d_pct | -2.7713 |
| return_5d_pct | -2.1983 |
| return_63d_pct | -7.7758 |
| rsi_14 | 45.0551 |
| sector_return_21d_pct | 0.5362 |
| session_bar_coverage | 0.4638 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 2,096.0000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 2,117.9400 |
| sma50 | 2,141.4440 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | HINDUNILVR |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.1100 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 48.2857 |
| close | 2,091.0000 |
| close_vs_ema61_pct | -2.9308 |
| ema61 | 2,156.2372 |
| high | 2,096.0000 |
| low | 2,079.6000 |
| macd_line | -17.7528 |
| move_atr | 0.1036 |
| open | 2,096.0000 |
| previous_close | 2,096.0000 |
| prior_high_20 | 2,213.0000 |
| prior_low_20 | 2,016.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 45.0551 |
| session_bar_coverage | 0.4638 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 2,117.9400 |
| sma50 | 2,141.4440 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.1100 |
| volume_average_20 | 270,749.4500 |
| volume_current | 0.0000 |
| volume_median_90 | 2,674.0000 |
| volume_percentile_90 | 0.4706 |
| volume_previous_1d | 42,871.0000 |
| volume_previous_2d | 40,765.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -61.9289 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4638 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 33.0655 | 18.00% | 5.9518 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 35.8954 | 12.00% | 4.3074 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 14.6639 | 10.00% | 1.4664 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 26.6758 | 14.00% | 3.7346 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 41.4634 | 18.00% | 7.4634 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **37.9129** minus penalties **0.0000** = final **37.9129**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 66.9345 | 18.00% | 12.0482 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 64.1046 | 12.00% | 7.6926 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 85.3362 | 10.00% | 8.5336 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 73.3243 | 14.00% | 10.2654 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 25.2033 | 18.00% | 4.5366 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **51.0471** minus penalties **0.0000** = final **51.0471**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 94.2472 | 20.00% | 18.8494 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 39.7292 | 6.00% | 2.3838 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **47.9132**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1036`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 48.285714285714334, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 48.285714285714334, "close": 2091.0, "level": "LOW", "move_atr": 0.1036, "session_open": 2096.0, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 37.9129, "screening_level": "BELOW_MINIMUM", "selected": 51.0471, "short": 51.0471} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 47.9132} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.11, "volume_level": "MEDIUM", "volume_percentile_90": 0.47058823529411764, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 13.1342, "edge": -13.1342, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": false
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 33. INDIGO

| Decision field | Actual value |
|---|---|
| Opportunity rank | 36 |
| Execution-readiness rank | 35 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | 17.7078 |
| OFactor final | 47.3442 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 47.3442 |
| SHORT OFactor | 36.6158 |
| Directional edge LONG minus SHORT | 10.7284 |
| Directional-edge tier | HIGH |
| XFactor final | 47.8893 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4638 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 139.4643 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.5631 |
| close_price | 5,330.0000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 5,352.5000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 5,301.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 5,305.0000 |
| prev_close | 5,333.0000 |
| prior_high_20 | 5,508.0000 |
| prior_low_20 | 4,886.0000 |
| return_1d_pct | -0.0563 |
| return_21d_pct | 0.3389 |
| return_5d_pct | -1.2963 |
| return_63d_pct | 25.2408 |
| rsi_14 | 55.4588 |
| sector_return_21d_pct | -3.8922 |
| session_bar_coverage | 0.4638 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 5,305.0000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 5,233.5000 |
| sma50 | 5,077.3960 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | INDIGO |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.1100 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 139.4643 |
| close | 5,330.0000 |
| close_vs_ema61_pct | 5.6201 |
| ema61 | 5,036.9343 |
| high | 5,352.5000 |
| low | 5,301.0000 |
| macd_line | 63.1311 |
| move_atr | 0.1793 |
| open | 5,305.0000 |
| previous_close | 5,333.0000 |
| prior_high_20 | 5,508.0000 |
| prior_low_20 | 4,886.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 55.4588 |
| session_bar_coverage | 0.4638 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 5,233.5000 |
| sma50 | 5,077.3960 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.1100 |
| volume_average_20 | 129,056.4000 |
| volume_current | 0.0000 |
| volume_median_90 | 999.0000 |
| volume_percentile_90 | 0.5000 |
| volume_previous_1d | 7,806.0000 |
| volume_previous_2d | 12,225.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -28.6174 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4638 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 73.8580 | 18.00% | 13.2944 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 50.0575 | 12.00% | 6.0069 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 47.8312 | 10.00% | 4.7831 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 12.8370 | 14.00% | 1.7972 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 35.9628 | 18.00% | 6.4733 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **47.3442** minus penalties **0.0000** = final **47.3442**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 26.1420 | 18.00% | 4.7056 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 49.9425 | 12.00% | 5.9931 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 52.1688 | 10.00% | 5.2169 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 87.1630 | 14.00% | 12.2028 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 30.7039 | 18.00% | 5.5267 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **41.6158** minus penalties **5.0000** = final **36.6158**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 90.0413 | 20.00% | 18.0083 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 53.3514 | 6.00% | 3.2011 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **47.8893**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1793`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 139.46428571428572, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 139.46428571428572, "close": 5330.0, "level": "LOW", "move_atr": 0.1793, "session_open": 5305.0, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 47.3442, "screening_level": "BELOW_MINIMUM", "selected": 47.3442, "short": 36.6158} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 47.8893} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.11, "volume_level": "HIGH", "volume_percentile_90": 0.5, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 10.7284, "edge": 10.7284, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 34. KOTAKBANK

| Decision field | Actual value |
|---|---|
| Opportunity rank | 37 |
| Execution-readiness rank | 37 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | 17.3657 |
| OFactor final | 46.3217 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 46.3217 |
| SHORT OFactor | 37.6383 |
| Directional edge LONG minus SHORT | 8.6834 |
| Directional-edge tier | HIGH |
| XFactor final | 46.7539 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4638 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 6.4750 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.5512 |
| close_price | 390.1000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 392.9500 |
| is_intraday_snapshot | 1.0000 |
| low_price | 386.6000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 388.0000 |
| prev_close | 390.7500 |
| prior_high_20 | 400.0000 |
| prior_low_20 | 375.1000 |
| return_1d_pct | -0.1663 |
| return_21d_pct | 3.3104 |
| return_5d_pct | -1.8616 |
| return_63d_pct | 3.2967 |
| rsi_14 | 50.4844 |
| sector_return_21d_pct | 1.1896 |
| session_bar_coverage | 0.4638 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 388.0000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 387.3075 |
| sma50 | 390.1250 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | KOTAKBANK |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.1100 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 6.4750 |
| close | 390.1000 |
| close_vs_ema61_pct | 0.2370 |
| ema61 | 389.1470 |
| high | 392.9500 |
| low | 386.6000 |
| macd_line | 1.5999 |
| move_atr | 0.3243 |
| open | 388.0000 |
| previous_close | 390.7500 |
| prior_high_20 | 400.0000 |
| prior_low_20 | 375.1000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 50.4844 |
| session_bar_coverage | 0.4638 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 387.3075 |
| sma50 | 390.1250 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.1100 |
| volume_average_20 | 1,666,757.6500 |
| volume_current | 0.0000 |
| volume_median_90 | 8,679.0000 |
| volume_percentile_90 | 0.5000 |
| volume_previous_1d | 147,924.0000 |
| volume_previous_2d | 294,184.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -45.3089 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4638 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 59.7142 | 18.00% | 10.7486 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 42.7276 | 12.00% | 5.1273 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 50.5226 | 10.00% | 5.0523 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 28.7175 | 14.00% | 4.0205 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 35.4659 | 18.00% | 6.3839 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **46.3217** minus penalties **0.0000** = final **46.3217**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 40.2858 | 18.00% | 7.2514 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 57.2724 | 12.00% | 6.8727 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 49.4774 | 10.00% | 4.9477 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 71.2824 | 14.00% | 9.9795 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 31.2008 | 18.00% | 5.6161 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **42.6383** minus penalties **5.0000** = final **37.6383**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 81.9820 | 20.00% | 16.3964 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 61.2917 | 6.00% | 3.6775 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **46.7539**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.3243`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 6.474999999999999, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 6.474999999999999, "close": 390.1, "level": "LOW", "move_atr": 0.3243, "session_open": 388.0, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 46.3217, "screening_level": "BELOW_MINIMUM", "selected": 46.3217, "short": 37.6383} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 46.7539} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.11, "volume_level": "HIGH", "volume_percentile_90": 0.5, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 8.6834, "edge": 8.6834, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 35. CIPLA

| Decision field | Actual value |
|---|---|
| Opportunity rank | 41 |
| Execution-readiness rank | 22 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | -8.5441 |
| OFactor final | 45.3464 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 45.3464 |
| SHORT OFactor | 38.6136 |
| Directional edge LONG minus SHORT | 6.7328 |
| Directional-edge tier | LOW |
| XFactor final | 50.0009 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4638 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 31.8857 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.1594 |
| close_price | 1,466.1000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,483.5000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,462.8000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,465.7000 |
| prev_close | 1,463.8000 |
| prior_high_20 | 1,491.2000 |
| prior_low_20 | 1,366.1000 |
| return_1d_pct | 0.1571 |
| return_21d_pct | 1.8549 |
| return_5d_pct | -0.5629 |
| return_63d_pct | 10.4324 |
| rsi_14 | 56.9029 |
| sector_return_21d_pct | -1.1272 |
| session_bar_coverage | 0.4638 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 1,465.7000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,442.2850 |
| sma50 | 1,424.2220 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | CIPLA |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.1100 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 31.8857 |
| close | 1,466.1000 |
| close_vs_ema61_pct | 3.4444 |
| ema61 | 1,415.6558 |
| high | 1,483.5000 |
| low | 1,462.8000 |
| macd_line | 12.3107 |
| move_atr | 0.0125 |
| open | 1,465.7000 |
| previous_close | 1,463.8000 |
| prior_high_20 | 1,491.2000 |
| prior_low_20 | 1,366.1000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 56.9029 |
| session_bar_coverage | 0.4638 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,442.2850 |
| sma50 | 1,424.2220 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.1100 |
| volume_average_20 | 140,955.4500 |
| volume_current | 0.0000 |
| volume_median_90 | 1,040.0000 |
| volume_percentile_90 | 0.4706 |
| volume_previous_1d | 6,520.0000 |
| volume_previous_2d | 45,747.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -20.0639 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4638 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 69.3955 | 18.00% | 12.4912 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 54.5572 | 12.00% | 6.5469 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 48.6662 | 10.00% | 4.8666 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 21.4774 | 14.00% | 3.0068 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 19.1425 | 18.00% | 3.4457 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **45.3464** minus penalties **0.0000** = final **45.3464**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 30.6045 | 18.00% | 5.5088 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 45.4428 | 12.00% | 5.4531 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 51.3338 | 10.00% | 5.1334 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 78.5226 | 14.00% | 10.9932 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 47.5242 | 18.00% | 8.5543 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **43.6136** minus penalties **5.0000** = final **38.6136**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 99.3031 | 20.00% | 19.8606 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 57.6716 | 6.00% | 3.4603 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **50.0009**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.0125`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 31.885714285714307, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 31.885714285714307, "close": 1466.1, "level": "LOW", "move_atr": 0.0125, "session_open": 1465.7, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 45.3464, "screening_level": "BELOW_MINIMUM", "selected": 45.3464, "short": 38.6136} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 50.0009} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.11, "volume_level": "MEDIUM", "volume_percentile_90": 0.47058823529411764, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 6.7328, "edge": 6.7328, "level": "LOW"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": false
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 36. SBIN

| Decision field | Actual value |
|---|---|
| Opportunity rank | 44 |
| Execution-readiness rank | 42 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | COUNTER_TREND_SHORT |
| Session-direction score | -70.0694 |
| OFactor final | 42.5077 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 57.4922 |
| SHORT OFactor | 42.5077 |
| Directional edge LONG minus SHORT | 14.9845 |
| Directional-edge tier | HIGH |
| XFactor final | 39.8833 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 20.4929 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.0641 |
| close_price | 1,081.0000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,113.1000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,078.8000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,108.0000 |
| prev_close | 1,097.2000 |
| prior_high_20 | 1,124.5000 |
| prior_low_20 | 1,000.8000 |
| return_1d_pct | -1.4765 |
| return_21d_pct | 4.3436 |
| return_5d_pct | 3.4450 |
| return_63d_pct | 11.4318 |
| rsi_14 | 63.4404 |
| sector_return_21d_pct | 1.1896 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 1,108.0000 |
| session_volume | 155,177.0000 |
| session_vwap | 1,084.5769 |
| sma20 | 1,037.0050 |
| sma50 | 1,025.3520 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | SBIN |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.9200 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0931 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 20.4929 |
| close | 1,081.0000 |
| close_vs_ema61_pct | 4.3173 |
| ema61 | 1,034.7704 |
| high | 1,113.1000 |
| low | 1,078.8000 |
| macd_line | 12.9217 |
| move_atr | 1.3175 |
| open | 1,108.0000 |
| previous_close | 1,097.2000 |
| prior_high_20 | 1,124.5000 |
| prior_low_20 | 1,000.8000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 63.4404 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 1,084.5769 |
| sma20 | 1,037.0050 |
| sma50 | 1,025.3520 |
| turnover_lacs | 1,677.4634 |
| turnover_percentile | 0.9200 |
| volume_average_20 | 1,666,188.5500 |
| volume_current | 155,177.0000 |
| volume_median_90 | 15,582.0000 |
| volume_percentile_90 | 0.6471 |
| volume_previous_1d | 389,979.0000 |
| volume_previous_2d | 288,497.0000 |
| volume_ratio_20 | 0.0931 |
| vwap_distance_atr | 0.1745 |
| willr14 | -35.1657 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 83.7037 | 18.00% | 15.0667 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 77.7944 | 12.00% | 9.3353 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 56.9804 | 10.00% | 5.6980 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 28.7175 | 14.00% | 4.0205 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 15.9027 | 18.00% | 2.8625 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **57.4922** minus penalties **0.0000** = final **57.4922**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 16.2963 | 18.00% | 2.9333 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 22.2055 | 12.00% | 2.6647 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 43.0196 | 10.00% | 4.3020 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 71.2824 | 14.00% | 9.9795 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.7639 | 18.00% | 9.1375 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **42.5077** minus penalties **0.0000** = final **42.5077**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 26.8038 | 20.00% | 5.3608 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 38.7082 | 6.00% | 2.3225 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **39.8833**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `1.3175`; VWAP-distance ATR `0.1745`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 20.492857142857126, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 20.492857142857126, "close": 1081.0, "level": "MEDIUM", "move_atr": 1.3175, "session_open": 1108.0, "session_vwap": 1084.576874150164, "vwap_distance_atr": 0.1745} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 57.4922, "screening_level": "BELOW_MINIMUM", "selected": 42.5077, "short": 42.5077} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 39.8833} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.92, "volume_level": "HIGH", "volume_percentile_90": 0.6470588235294118, "volume_ratio_20": 0.09313291703991124} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 14.9845, "edge": 14.9845, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": false,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 37. MAXHEALTH

| Decision field | Actual value |
|---|---|
| Opportunity rank | 45 |
| Execution-readiness rank | 32 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | LONG |
| Resolved actionable direction | LONG |
| Direction state | COUNTER_TREND_LONG |
| Session-direction score | 29.8993 |
| OFactor final | 42.3311 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 42.3311 |
| SHORT OFactor | 48.3889 |
| Directional edge LONG minus SHORT | -6.0578 |
| Directional-edge tier | LOW |
| XFactor final | 48.3455 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 24.0929 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.8973 |
| close_price | 1,076.0000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,077.5000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,062.9000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,070.2000 |
| prev_close | 1,070.0000 |
| prior_high_20 | 1,135.9000 |
| prior_low_20 | 1,064.1000 |
| return_1d_pct | 0.5607 |
| return_21d_pct | -2.8968 |
| return_5d_pct | -2.2174 |
| return_63d_pct | 4.8631 |
| rsi_14 | 45.4867 |
| sector_return_21d_pct | -1.1272 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 1,070.2000 |
| session_volume | 2,659.0000 |
| session_vwap | 1,066.2716 |
| sma20 | 1,094.6100 |
| sma50 | 1,074.8370 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | MAXHEALTH |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.2200 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0087 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 24.0929 |
| close | 1,076.0000 |
| close_vs_ema61_pct | 0.3135 |
| ema61 | 1,072.5247 |
| high | 1,077.5000 |
| low | 1,062.9000 |
| macd_line | -2.6795 |
| move_atr | 0.2407 |
| open | 1,070.2000 |
| previous_close | 1,070.0000 |
| prior_high_20 | 1,135.9000 |
| prior_low_20 | 1,064.1000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 45.4867 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 1,066.2716 |
| sma20 | 1,094.6100 |
| sma50 | 1,074.8370 |
| turnover_lacs | 28.6108 |
| turnover_percentile | 0.2200 |
| volume_average_20 | 306,841.4500 |
| volume_current | 2,659.0000 |
| volume_median_90 | 900.0000 |
| volume_percentile_90 | 0.5294 |
| volume_previous_1d | 9,956.0000 |
| volume_previous_2d | 34,564.0000 |
| volume_ratio_20 | 0.0087 |
| vwap_distance_atr | 0.4038 |
| willr14 | -82.0548 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 45.4111 | 18.00% | 8.1740 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 36.2477 | 12.00% | 4.3497 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 19.4700 | 10.00% | 1.9470 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 22.6667 | 6.00% | 1.3600 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 21.4774 | 14.00% | 3.0068 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 49.9128 | 18.00% | 8.9843 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **42.3311** minus penalties **0.0000** = final **42.3311**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 54.5889 | 18.00% | 9.8260 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 63.7523 | 12.00% | 7.6503 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 80.5300 | 10.00% | 8.0530 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 22.6667 | 6.00% | 1.3600 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 78.5226 | 14.00% | 10.9932 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.7538 | 18.00% | 3.0157 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **48.3889** minus penalties **0.0000** = final **48.3889**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 86.6258 | 20.00% | 17.3252 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 22.6667 | 6.00% | 1.3600 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 57.6716 | 6.00% | 3.4603 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **48.3455**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2407`; VWAP-distance ATR `0.4038`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 24.092857142857174, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 24.092857142857174, "close": 1076.0, "level": "LOW", "move_atr": 0.2407, "session_open": 1070.2, "session_vwap": 1066.2716434749907, "vwap_distance_atr": 0.4038} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 42.3311, "screening_level": "BELOW_MINIMUM", "selected": 42.3311, "short": 48.3889} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 48.3455} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.22, "volume_level": "HIGH", "volume_percentile_90": 0.5294117647058824, "volume_ratio_20": 0.008665713188358352} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 6.0578, "edge": -6.0578, "level": "LOW"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 38. BEL

| Decision field | Actual value |
|---|---|
| Opportunity rank | 46 |
| Execution-readiness rank | 20 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | LONG |
| Resolved actionable direction | LONG |
| Direction state | COUNTER_TREND_LONG |
| Session-direction score | 29.5073 |
| OFactor final | 41.9232 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 41.9232 |
| SHORT OFactor | 48.2767 |
| Directional edge LONG minus SHORT | -6.3535 |
| Directional-edge tier | LOW |
| XFactor final | 50.6072 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 6.8857 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.9412 |
| close_price | 403.4500 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 403.7000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 399.4500 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 401.9000 |
| prev_close | 401.0000 |
| prior_high_20 | 414.3000 |
| prior_low_20 | 382.2000 |
| return_1d_pct | 0.6110 |
| return_21d_pct | -2.7480 |
| return_5d_pct | 2.8816 |
| return_63d_pct | -5.7910 |
| rsi_14 | 51.3572 |
| sector_return_21d_pct | -2.7480 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 401.9000 |
| session_volume | 31,387.0000 |
| session_vwap | 399.8286 |
| sma20 | 400.7000 |
| sma50 | 408.2780 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | BEL |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.5000 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0186 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 6.8857 |
| close | 403.4500 |
| close_vs_ema61_pct | -1.6267 |
| ema61 | 410.3440 |
| high | 403.7000 |
| low | 399.4500 |
| macd_line | -4.0775 |
| move_atr | 0.2251 |
| open | 401.9000 |
| previous_close | 401.0000 |
| prior_high_20 | 414.3000 |
| prior_low_20 | 382.2000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 51.3572 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 399.8286 |
| sma20 | 400.7000 |
| sma50 | 408.2780 |
| turnover_lacs | 126.6309 |
| turnover_percentile | 0.5000 |
| volume_average_20 | 1,689,786.6500 |
| volume_current | 31,387.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.5588 |
| volume_previous_1d | 183,388.0000 |
| volume_previous_2d | 485,866.0000 |
| volume_ratio_20 | 0.0186 |
| vwap_distance_atr | 0.5259 |
| willr14 | -25.0441 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 41.1180 | 18.00% | 7.4012 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 63.3637 | 12.00% | 7.6036 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 25.0000 | 10.00% | 2.5000 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 60.0000 | 6.00% | 3.6000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 16.4125 | 14.00% | 2.2978 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.0630 | 18.00% | 9.0113 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **46.9232** minus penalties **5.0000** = final **41.9232**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 58.8820 | 18.00% | 10.5988 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 36.6363 | 12.00% | 4.3964 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 75.0000 | 10.00% | 7.5000 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 60.0000 | 6.00% | 3.6000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 83.5874 | 14.00% | 11.7022 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.6036 | 18.00% | 2.9887 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **48.2767** minus penalties **0.0000** = final **48.2767**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 87.4942 | 20.00% | 17.4988 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 60.0000 | 6.00% | 3.6000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 55.1392 | 6.00% | 3.3084 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **50.6072**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2251`; VWAP-distance ATR `0.5259`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 6.885714285714284, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 6.885714285714284, "close": 403.45, "level": "LOW", "move_atr": 0.2251, "session_open": 401.9, "session_vwap": 399.82855640870423, "vwap_distance_atr": 0.5259} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 41.9232, "screening_level": "BELOW_MINIMUM", "selected": 41.9232, "short": 48.2767} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 50.6072} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.5, "volume_level": "HIGH", "volume_percentile_90": 0.5588235294117647, "volume_ratio_20": 0.01857453424667546} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 6.3535, "edge": -6.3535, "level": "LOW"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 39. NESTLEIND

| Decision field | Actual value |
|---|---|
| Opportunity rank | 47 |
| Execution-readiness rank | 19 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | COUNTER_TREND_SHORT |
| Session-direction score | -21.1488 |
| OFactor final | 40.9909 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 54.8491 |
| SHORT OFactor | 40.9909 |
| Directional edge LONG minus SHORT | 13.8582 |
| Directional-edge tier | HIGH |
| XFactor final | 50.7141 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 39.7357 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.2461 |
| close_price | 1,532.4000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,546.8000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,527.7000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,538.8000 |
| prev_close | 1,540.0000 |
| prior_high_20 | 1,553.0000 |
| prior_low_20 | 1,405.1000 |
| return_1d_pct | -0.4935 |
| return_21d_pct | 5.3051 |
| return_5d_pct | 0.1569 |
| return_63d_pct | 4.3230 |
| rsi_14 | 64.3728 |
| sector_return_21d_pct | 0.5362 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 1,538.8000 |
| session_volume | 9,856.0000 |
| session_vwap | 1,541.3544 |
| sma20 | 1,476.4450 |
| sma50 | 1,439.2660 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | NESTLEIND |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.5400 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0376 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 39.7357 |
| close | 1,532.4000 |
| close_vs_ema61_pct | 6.1540 |
| ema61 | 1,440.6016 |
| high | 1,546.8000 |
| low | 1,527.7000 |
| macd_line | 27.4648 |
| move_atr | 0.1611 |
| open | 1,538.8000 |
| previous_close | 1,540.0000 |
| prior_high_20 | 1,553.0000 |
| prior_low_20 | 1,405.1000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 64.3728 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 1,541.3544 |
| sma20 | 1,476.4450 |
| sma50 | 1,439.2660 |
| turnover_lacs | 151.0333 |
| turnover_percentile | 0.5400 |
| volume_average_20 | 262,307.7500 |
| volume_current | 9,856.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.5882 |
| volume_previous_1d | 73,247.0000 |
| volume_previous_2d | 56,510.0000 |
| volume_ratio_20 | 0.0376 |
| vwap_distance_atr | 0.2254 |
| willr14 | -16.8852 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 79.4550 | 18.00% | 14.3019 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 65.0264 | 12.00% | 7.8032 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 65.0315 | 10.00% | 6.5031 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 65.3333 | 6.00% | 3.9200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 26.6758 | 14.00% | 3.7346 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 22.6500 | 18.00% | 4.0770 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **54.8491** minus penalties **0.0000** = final **54.8491**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 20.5450 | 18.00% | 3.6981 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 34.9736 | 12.00% | 4.1968 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 34.9685 | 10.00% | 3.4969 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 65.3333 | 6.00% | 3.9200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 73.3243 | 14.00% | 10.2654 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 44.0166 | 18.00% | 7.9230 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **40.9909** minus penalties **0.0000** = final **40.9909**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 91.0520 | 20.00% | 18.2104 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 65.3333 | 6.00% | 3.9200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 39.7292 | 6.00% | 2.3838 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **50.7141**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1611`; VWAP-distance ATR `0.2254`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 39.7357142857143, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 39.7357142857143, "close": 1532.4, "level": "LOW", "move_atr": 0.1611, "session_open": 1538.8, "session_vwap": 1541.3544439935065, "vwap_distance_atr": 0.2254} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 54.8491, "screening_level": "BELOW_MINIMUM", "selected": 40.9909, "short": 40.9909} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 50.7141} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.54, "volume_level": "HIGH", "volume_percentile_90": 0.5882352941176471, "volume_ratio_20": 0.0375741852842701} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 13.8582, "edge": 13.8582, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 40. HINDALCO

| Decision field | Actual value |
|---|---|
| Opportunity rank | 48 |
| Execution-readiness rank | 40 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | COUNTER_TREND_SHORT |
| Session-direction score | -61.6791 |
| OFactor final | 40.4037 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 60.9983 |
| SHORT OFactor | 40.4037 |
| Directional edge LONG minus SHORT | 20.5946 |
| Directional-edge tier | HIGH |
| XFactor final | 45.1104 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 20.7714 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.1498 |
| close_price | 1,045.4000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,063.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,042.3000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,062.6000 |
| prev_close | 1,059.6000 |
| prior_high_20 | 1,059.6000 |
| prior_low_20 | 935.1000 |
| return_1d_pct | -1.3401 |
| return_21d_pct | 8.0573 |
| return_5d_pct | 5.0759 |
| return_63d_pct | -2.5813 |
| rsi_14 | 65.0830 |
| sector_return_21d_pct | 1.9910 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 1,062.6000 |
| session_volume | 401,402.0000 |
| session_vwap | 1,058.7753 |
| sma20 | 973.9250 |
| sma50 | 997.3830 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | HINDALCO |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.9800 |
| vix_regime | LOW |
| volume_ratio_20 | 0.6752 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 20.7714 |
| close | 1,045.4000 |
| close_vs_ema61_pct | 4.9302 |
| ema61 | 994.6436 |
| high | 1,063.0000 |
| low | 1,042.3000 |
| macd_line | 15.4701 |
| move_atr | 0.8281 |
| open | 1,062.6000 |
| previous_close | 1,059.6000 |
| prior_high_20 | 1,059.6000 |
| prior_low_20 | 935.1000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 65.0830 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 1,058.7753 |
| sma20 | 973.9250 |
| sma50 | 997.3830 |
| turnover_lacs | 4,196.2565 |
| turnover_percentile | 0.9800 |
| volume_average_20 | 594,451.7000 |
| volume_current | 401,402.0000 |
| volume_median_90 | 2,539.5000 |
| volume_percentile_90 | 0.7353 |
| volume_previous_1d | 122,537.0000 |
| volume_previous_2d | 505,345.0000 |
| volume_ratio_20 | 0.6752 |
| vwap_distance_atr | 0.6439 |
| willr14 | -13.7608 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 78.8668 | 18.00% | 14.1960 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 86.2326 | 12.00% | 10.3479 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 77.6864 | 10.00% | 7.7686 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 35.7660 | 14.00% | 5.0072 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 17.6070 | 18.00% | 3.1693 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **60.9983** minus penalties **0.0000** = final **60.9983**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 21.1332 | 18.00% | 3.8040 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 13.7674 | 12.00% | 1.6521 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 22.3137 | 10.00% | 2.2314 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 64.2340 | 14.00% | 8.9928 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 56.8485 | 18.00% | 10.2327 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **40.4037** minus penalties **0.0000** = final **40.4037**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 53.9966 | 20.00% | 10.7993 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 35.1840 | 6.00% | 2.1110 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **45.1104**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.8281`; VWAP-distance ATR `0.6439`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 20.77142857142855, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 20.77142857142855, "close": 1045.4, "level": "LOW", "move_atr": 0.8281, "session_open": 1062.6, "session_vwap": 1058.7752843782541, "vwap_distance_atr": 0.6439} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 60.9983, "screening_level": "BELOW_MINIMUM", "selected": 40.4037, "short": 40.4037} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 45.1104} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.98, "volume_level": "HIGH", "volume_percentile_90": 0.7352941176470589, "volume_ratio_20": 0.6752474591291437} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 20.5946, "edge": 20.5946, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 41. WIPRO

| Decision field | Actual value |
|---|---|
| Opportunity rank | 49 |
| Execution-readiness rank | 36 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | COUNTER_TREND_SHORT |
| Session-direction score | -21.0049 |
| OFactor final | 30.7831 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 57.1769 |
| SHORT OFactor | 30.7831 |
| Directional edge LONG minus SHORT | 26.3938 |
| Directional-edge tier | HIGH |
| XFactor final | 46.7745 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 3.8286 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.2000 |
| close_price | 186.4500 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 187.8500 |
| is_intraday_snapshot | 1.0000 |
| low_price | 186.1000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 187.1700 |
| prev_close | 187.5300 |
| prior_high_20 | 191.3400 |
| prior_low_20 | 172.8000 |
| return_1d_pct | -0.5759 |
| return_21d_pct | 6.2635 |
| return_5d_pct | -1.1714 |
| return_63d_pct | -0.7188 |
| rsi_14 | 58.9554 |
| sector_return_21d_pct | 13.1211 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 187.1700 |
| session_volume | 38,777.0000 |
| session_vwap | 187.0326 |
| sma20 | 180.5265 |
| sma50 | 181.1818 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | WIPRO |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.3600 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0092 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 3.8286 |
| close | 186.4500 |
| close_vs_ema61_pct | 0.9072 |
| ema61 | 184.7178 |
| high | 187.8500 |
| low | 186.1000 |
| macd_line | 2.2620 |
| move_atr | 0.1881 |
| open | 187.1700 |
| previous_close | 187.5300 |
| prior_high_20 | 191.3400 |
| prior_low_20 | 172.8000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 58.9554 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 187.0326 |
| sma20 | 180.5265 |
| sma50 | 181.1818 |
| turnover_lacs | 72.2997 |
| turnover_percentile | 0.3600 |
| volume_average_20 | 4,215,926.7000 |
| volume_current | 38,777.0000 |
| volume_median_90 | 11,582.0000 |
| volume_percentile_90 | 0.5294 |
| volume_previous_1d | 69,297.0000 |
| volume_previous_2d | 153,804.0000 |
| volume_ratio_20 | 0.0092 |
| vwap_distance_atr | 0.1522 |
| willr14 | -26.3754 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 71.0254 | 18.00% | 12.7846 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 54.0746 | 12.00% | 6.4889 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 31.6938 | 10.00% | 3.1694 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 41.3333 | 6.00% | 2.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 100.0000 | 14.00% | 14.0000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 20.8039 | 18.00% | 3.7447 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **57.1769** minus penalties **0.0000** = final **57.1769**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 28.9746 | 18.00% | 5.2154 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 45.9254 | 12.00% | 5.5111 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 68.3062 | 10.00% | 6.8306 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 41.3333 | 6.00% | 2.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 0.0000 | 14.00% | 0.0000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 45.8628 | 18.00% | 8.2553 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **35.7831** minus penalties **5.0000** = final **30.7831**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 89.5522 | 20.00% | 17.9104 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 41.3333 | 6.00% | 2.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 3.0671 | 6.00% | 0.1840 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **46.7745**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1881`; VWAP-distance ATR `0.1522`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 3.828571428571426, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 3.828571428571426, "close": 186.45, "level": "LOW", "move_atr": 0.1881, "session_open": 187.17, "session_vwap": 187.03260102638163, "vwap_distance_atr": 0.1522} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 57.1769, "screening_level": "BELOW_MINIMUM", "selected": 30.7831, "short": 30.7831} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 46.7745} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.36, "volume_level": "HIGH", "volume_percentile_90": 0.5294117647058824, "volume_ratio_20": 0.009197740558439974} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 26.3938, "edge": 26.3938, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 42. TCS

| Decision field | Actual value |
|---|---|
| Opportunity rank | 50 |
| Execution-readiness rank | 17 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | COUNTER_TREND_SHORT |
| Session-direction score | -23.9081 |
| OFactor final | 24.6291 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 70.3709 |
| SHORT OFactor | 24.6291 |
| Directional edge LONG minus SHORT | 45.7418 |
| Directional-edge tier | HIGH |
| XFactor final | 51.0060 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 7 / 6 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 69.3429 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.0524 |
| close_price | 2,445.8000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 2,472.9000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 2,444.3000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 2,454.4000 |
| prev_close | 2,452.7000 |
| prior_high_20 | 2,495.0000 |
| prior_low_20 | 2,065.1001 |
| return_1d_pct | -0.2813 |
| return_21d_pct | 18.2117 |
| return_5d_pct | -1.1279 |
| return_63d_pct | 7.6118 |
| rsi_14 | 62.2434 |
| sector_return_21d_pct | 13.1211 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 2,454.4000 |
| session_volume | 55,415.0000 |
| session_vwap | 2,458.5796 |
| sma20 | 2,316.4500 |
| sma50 | 2,210.1920 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | TCS |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.8800 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0932 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 69.3429 |
| close | 2,445.8000 |
| close_vs_ema61_pct | 6.6468 |
| ema61 | 2,288.2833 |
| high | 2,472.9000 |
| low | 2,444.3000 |
| macd_line | 72.4450 |
| move_atr | 0.1240 |
| open | 2,454.4000 |
| previous_close | 2,452.7000 |
| prior_high_20 | 2,495.0000 |
| prior_low_20 | 2,065.1001 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 62.2434 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 2,458.5796 |
| sma20 | 2,316.4500 |
| sma50 | 2,210.1920 |
| turnover_lacs | 1,355.3401 |
| turnover_percentile | 0.8800 |
| volume_average_20 | 594,663.6000 |
| volume_current | 55,415.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7353 |
| volume_previous_1d | 81,302.0000 |
| volume_previous_2d | 32,425.0000 |
| volume_ratio_20 | 0.0932 |
| vwap_distance_atr | 0.1843 |
| willr14 | -16.3238 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 93.8431 | 18.00% | 16.8918 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 57.5440 | 12.00% | 6.9053 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 90.9080 | 10.00% | 9.0908 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 100.0000 | 14.00% | 14.0000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.5210 | 18.00% | 2.9738 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **70.3709** minus penalties **0.0000** = final **70.3709**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 6.1569 | 18.00% | 1.1082 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 42.4560 | 12.00% | 5.0947 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 9.0920 | 10.00% | 0.9092 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 0.0000 | 14.00% | 0.0000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.1456 | 18.00% | 9.0262 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **29.6291** minus penalties **5.0000** = final **24.6291**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 93.1099 | 20.00% | 18.6220 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 3.0671 | 6.00% | 0.1840 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **51.0060**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1240`; VWAP-distance ATR `0.1843`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 69.34285714285718, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 69.34285714285718, "close": 2445.8, "level": "LOW", "move_atr": 0.124, "session_open": 2454.4, "session_vwap": 2458.579613822972, "vwap_distance_atr": 0.1843} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 70.3709, "screening_level": "BELOW_MINIMUM", "selected": 24.6291, "short": 24.6291} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 51.006} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.88, "volume_level": "HIGH", "volume_percentile_90": 0.7352941176470589, "volume_ratio_20": 0.09318713975430816} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 45.7418, "edge": 45.7418, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": true,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 43. RELIANCE

| Decision field | Actual value |
|---|---|
| Opportunity rank | 31 |
| Execution-readiness rank | 43 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | NEUTRAL |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | NEUTRAL |
| Direction state | NEUTRAL |
| Session-direction score | -5.0998 |
| OFactor final | 51.9274 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 51.9274 |
| SHORT OFactor | 48.0726 |
| Directional edge LONG minus SHORT | 3.8548 |
| Directional-edge tier | BELOW_MINIMUM |
| XFactor final | 54.4472 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 8 / 7 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 22.8857 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.5185 |
| close_price | 1,327.6000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,332.8000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,322.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,330.0000 |
| prev_close | 1,334.8000 |
| prior_high_20 | 1,345.9000 |
| prior_low_20 | 1,249.8000 |
| return_1d_pct | -0.5394 |
| return_21d_pct | 1.5140 |
| return_5d_pct | 0.6520 |
| return_63d_pct | -2.2961 |
| rsi_14 | 56.4899 |
| sector_return_21d_pct | -1.6384 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 1,330.0000 |
| session_volume | 47,460.0000 |
| session_vwap | 1,325.1239 |
| sma20 | 1,297.4400 |
| sma50 | 1,300.6820 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | RELIANCE |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.8200 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0280 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 22.8857 |
| close | 1,327.6000 |
| close_vs_ema61_pct | 0.8615 |
| ema61 | 1,315.8818 |
| high | 1,332.8000 |
| low | 1,322.0000 |
| macd_line | 3.4734 |
| move_atr | 0.1049 |
| open | 1,330.0000 |
| previous_close | 1,334.8000 |
| prior_high_20 | 1,345.9000 |
| prior_low_20 | 1,249.8000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 56.4899 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 1,325.1239 |
| sma20 | 1,297.4400 |
| sma50 | 1,300.6820 |
| turnover_lacs | 630.0790 |
| turnover_percentile | 0.8200 |
| volume_average_20 | 1,693,983.5000 |
| volume_current | 47,460.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.5294 |
| volume_previous_1d | 462,928.0000 |
| volume_previous_2d | 498,949.0000 |
| volume_ratio_20 | 0.0280 |
| vwap_distance_atr | 0.1082 |
| willr14 | -10.7798 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 58.8505 | 18.00% | 10.5931 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 59.2066 | 12.00% | 7.1048 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 48.1326 | 10.00% | 4.8133 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 19.8801 | 14.00% | 2.7832 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 34.0210 | 18.00% | 6.1238 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **51.9274** minus penalties **0.0000** = final **51.9274**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 41.1495 | 18.00% | 7.4069 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 40.7934 | 12.00% | 4.8952 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 51.8674 | 10.00% | 5.1867 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 80.1200 | 14.00% | 11.2168 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 32.6457 | 18.00% | 5.8762 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **48.0726** minus penalties **0.0000** = final **48.0726**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 94.1739 | 20.00% | 18.8348 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 56.8730 | 6.00% | 3.4124 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **54.4472**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1049`; VWAP-distance ATR `0.1082`. Engine decision `NO_OPPORTUNITY`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 22.885714285714293, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 22.885714285714293, "close": 1327.6, "level": "LOW", "move_atr": 0.1049, "session_open": 1330.0, "session_vwap": 1325.1238643067848, "vwap_distance_atr": 0.1082} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 51.9274, "screening_level": "BELOW_MINIMUM", "selected": 51.9274, "short": 48.0726} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 54.4472} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.82, "volume_level": "HIGH", "volume_percentile_90": 0.5294117647058824, "volume_ratio_20": 0.02801680181654662} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | FALSE | TRUE | {"absolute_edge": 3.8548, "edge": 3.8548, "level": "BELOW_MINIMUM"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 7.

## 44. TATASTEEL

| Decision field | Actual value |
|---|---|
| Opportunity rank | 34 |
| Execution-readiness rank | 50 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | NEUTRAL |
| Current-session direction | LONG |
| Resolved actionable direction | LONG |
| Direction state | SESSION_LONG |
| Session-direction score | 62.5484 |
| OFactor final | 50.1622 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 50.1622 |
| SHORT OFactor | 46.9578 |
| Directional edge LONG minus SHORT | 3.2044 |
| Directional-edge tier | BELOW_MINIMUM |
| XFactor final | 43.9096 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 8 / 7 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 3.6936 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.8288 |
| close_price | 191.5300 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 192.3500 |
| is_intraday_snapshot | 1.0000 |
| low_price | 187.5600 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 187.9600 |
| prev_close | 187.5500 |
| prior_high_20 | 193.6500 |
| prior_low_20 | 181.2000 |
| return_1d_pct | 2.1221 |
| return_21d_pct | 0.1778 |
| return_5d_pct | 0.2775 |
| return_63d_pct | -12.7903 |
| rsi_14 | 54.1640 |
| sector_return_21d_pct | 1.9910 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 187.9600 |
| session_volume | 114,636.0000 |
| session_vwap | 188.7901 |
| sma20 | 187.0825 |
| sma50 | 192.6638 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | TATASTEEL |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.6200 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0322 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 3.6936 |
| close | 191.5300 |
| close_vs_ema61_pct | -1.0790 |
| ema61 | 193.6888 |
| high | 192.3500 |
| low | 187.5600 |
| macd_line | -0.3194 |
| move_atr | 0.9665 |
| open | 187.9600 |
| previous_close | 187.5500 |
| prior_high_20 | 193.6500 |
| prior_low_20 | 181.2000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 54.1640 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 188.7901 |
| sma20 | 187.0825 |
| sma50 | 192.6638 |
| turnover_lacs | 219.5623 |
| turnover_percentile | 0.6200 |
| volume_average_20 | 3,561,224.8000 |
| volume_current | 114,636.0000 |
| volume_median_90 | 44,516.5000 |
| volume_percentile_90 | 0.5294 |
| volume_previous_1d | 143,919.0000 |
| volume_previous_2d | 450,766.0000 |
| volume_ratio_20 | 0.0322 |
| vwap_distance_atr | 0.7418 |
| willr14 | -17.0281 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 44.8270 | 18.00% | 8.0689 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 55.3203 | 12.00% | 6.6384 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 28.4399 | 10.00% | 2.8440 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 76.0000 | 6.00% | 4.5600 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 35.7660 | 14.00% | 5.0072 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 47.4133 | 18.00% | 8.5344 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **50.1622** minus penalties **0.0000** = final **50.1622**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 55.1731 | 18.00% | 9.9311 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 44.6797 | 12.00% | 5.3616 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 71.5601 | 10.00% | 7.1560 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 76.0000 | 6.00% | 4.5600 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 64.2340 | 14.00% | 8.9928 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 19.2534 | 18.00% | 3.4656 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **46.9578** minus penalties **0.0000** = final **46.9578**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 46.3031 | 20.00% | 9.2606 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 76.0000 | 6.00% | 4.5600 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 64.8160 | 6.00% | 3.8890 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **43.9096**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.9665`; VWAP-distance ATR `0.7418`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 3.693571428571429, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 3.693571428571429, "close": 191.53, "level": "LOW", "move_atr": 0.9665, "session_open": 187.96, "session_vwap": 188.79005984158553, "vwap_distance_atr": 0.7418} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 50.1622, "screening_level": "BELOW_MINIMUM", "selected": 50.1622, "short": 46.9578} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 43.9096} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.62, "volume_level": "HIGH", "volume_percentile_90": 0.5294117647058824, "volume_ratio_20": 0.032190048771984295} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | FALSE | TRUE | {"absolute_edge": 3.2044, "edge": 3.2044, "level": "BELOW_MINIMUM"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 7.

## 45. ITC

| Decision field | Actual value |
|---|---|
| Opportunity rank | 35 |
| Execution-readiness rank | 48 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | NEUTRAL |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | SESSION_SHORT |
| Session-direction score | -26.7352 |
| OFactor final | 48.2186 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 42.9414 |
| SHORT OFactor | 48.2186 |
| Directional edge LONG minus SHORT | -5.2772 |
| Directional-edge tier | BELOW_MINIMUM |
| XFactor final | 48.4749 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 8 / 7 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 4.9071 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.1489 |
| close_price | 284.0500 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 286.0500 |
| is_intraday_snapshot | 1.0000 |
| low_price | 283.7000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 285.9000 |
| prev_close | 286.1000 |
| prior_high_20 | 292.5500 |
| prior_low_20 | 275.0000 |
| return_1d_pct | -0.7165 |
| return_21d_pct | 0.8163 |
| return_5d_pct | -1.0279 |
| return_63d_pct | -6.7006 |
| rsi_14 | 47.9947 |
| sector_return_21d_pct | 0.5362 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 285.9000 |
| session_volume | 53,648.0000 |
| session_vwap | 284.7353 |
| sma20 | 282.9450 |
| sma50 | 284.9040 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | ITC |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.5600 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0354 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 4.9071 |
| close | 284.0500 |
| close_vs_ema61_pct | -1.6396 |
| ema61 | 288.9429 |
| high | 286.0500 |
| low | 283.7000 |
| macd_line | 0.0540 |
| move_atr | 0.3770 |
| open | 285.9000 |
| previous_close | 286.1000 |
| prior_high_20 | 292.5500 |
| prior_low_20 | 275.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 47.9947 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 284.7353 |
| sma20 | 282.9450 |
| sma50 | 284.9040 |
| turnover_lacs | 152.3871 |
| turnover_percentile | 0.5600 |
| volume_average_20 | 1,516,216.0500 |
| volume_current | 53,648.0000 |
| volume_median_90 | 17,530.0000 |
| volume_percentile_90 | 0.5294 |
| volume_previous_1d | 377,467.0000 |
| volume_previous_2d | 283,199.0000 |
| volume_ratio_20 | 0.0354 |
| vwap_distance_atr | 0.1397 |
| willr14 | -60.4982 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 46.2933 | 18.00% | 8.3328 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 43.7119 | 12.00% | 5.2454 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 36.9766 | 10.00% | 3.6977 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 68.0000 | 6.00% | 4.0800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 26.6758 | 14.00% | 3.7346 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 18.5648 | 18.00% | 3.3417 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **42.9414** minus penalties **0.0000** = final **42.9414**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 53.7067 | 18.00% | 9.6672 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 56.2881 | 12.00% | 6.7546 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 63.0234 | 10.00% | 6.3023 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 68.0000 | 6.00% | 4.0800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 73.3243 | 14.00% | 10.2654 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 48.1018 | 18.00% | 8.6583 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **53.2186** minus penalties **5.0000** = final **48.2186**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 79.0555 | 20.00% | 15.8111 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 68.0000 | 6.00% | 4.0800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 39.7292 | 6.00% | 2.3838 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **48.4749**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.3770`; VWAP-distance ATR `0.1397`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 4.90714285714286, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 4.90714285714286, "close": 284.05, "level": "LOW", "move_atr": 0.377, "session_open": 285.9, "session_vwap": 284.7352892931703, "vwap_distance_atr": 0.1397} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 42.9414, "screening_level": "BELOW_MINIMUM", "selected": 48.2186, "short": 48.2186} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 48.4749} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.56, "volume_level": "HIGH", "volume_percentile_90": 0.5294117647058824, "volume_ratio_20": 0.03538282027815231} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | FALSE | TRUE | {"absolute_edge": 5.2772, "edge": -5.2772, "level": "BELOW_MINIMUM"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 7.

## 46. SUNPHARMA

| Decision field | Actual value |
|---|---|
| Opportunity rank | 38 |
| Execution-readiness rank | 45 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | NEUTRAL |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | NEUTRAL |
| Direction state | NEUTRAL |
| Session-direction score | -5.5102 |
| OFactor final | 45.4798 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 45.4798 |
| SHORT OFactor | 43.1202 |
| Directional edge LONG minus SHORT | 2.3596 |
| Directional-edge tier | BELOW_MINIMUM |
| XFactor final | 52.4296 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 8 / 7 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 36.1643 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.2525 |
| close_price | 1,950.0000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,964.8000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,945.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,949.9000 |
| prev_close | 1,945.0000 |
| prior_high_20 | 2,046.9000 |
| prior_low_20 | 1,910.0000 |
| return_1d_pct | 0.2571 |
| return_21d_pct | 0.7492 |
| return_5d_pct | -0.6875 |
| return_63d_pct | 6.8610 |
| rsi_14 | 53.1959 |
| sector_return_21d_pct | -1.1272 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 1,949.9000 |
| session_volume | 4,691.0000 |
| session_vwap | 1,950.8679 |
| sma20 | 1,957.5000 |
| sma50 | 1,888.4460 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | SUNPHARMA |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.4000 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0143 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 36.1643 |
| close | 1,950.0000 |
| close_vs_ema61_pct | 2.9634 |
| ema61 | 1,892.0065 |
| high | 1,964.8000 |
| low | 1,945.0000 |
| macd_line | 15.6638 |
| move_atr | 0.0028 |
| open | 1,949.9000 |
| previous_close | 1,945.0000 |
| prior_high_20 | 2,046.9000 |
| prior_low_20 | 1,910.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 53.1959 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 1,950.8679 |
| sma20 | 1,957.5000 |
| sma50 | 1,888.4460 |
| turnover_lacs | 91.4745 |
| turnover_percentile | 0.4000 |
| volume_average_20 | 327,523.2000 |
| volume_current | 4,691.0000 |
| volume_median_90 | 1,857.5000 |
| volume_percentile_90 | 0.5294 |
| volume_previous_1d | 225,401.0000 |
| volume_previous_2d | 97,135.0000 |
| volume_ratio_20 | 0.0143 |
| vwap_distance_atr | 0.0240 |
| willr14 | -79.5567 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 60.0046 | 18.00% | 10.8008 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 50.3311 | 12.00% | 6.0397 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 41.7552 | 10.00% | 4.1755 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 46.6667 | 6.00% | 2.8000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 21.4774 | 14.00% | 3.0068 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 23.0424 | 18.00% | 4.1476 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **45.4798** minus penalties **0.0000** = final **45.4798**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 39.9954 | 18.00% | 7.1992 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 49.6689 | 12.00% | 5.9603 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 58.2448 | 10.00% | 5.8245 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 46.6667 | 6.00% | 2.8000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 78.5226 | 14.00% | 10.9932 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 43.6243 | 18.00% | 7.8524 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **48.1202** minus penalties **5.0000** = final **43.1202**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 99.8464 | 20.00% | 19.9693 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 46.6667 | 6.00% | 2.8000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 57.6716 | 6.00% | 3.4603 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **52.4296**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.0028`; VWAP-distance ATR `0.0240`. Engine decision `NO_OPPORTUNITY`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 36.164285714285725, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 36.164285714285725, "close": 1950.0, "level": "LOW", "move_atr": 0.0028, "session_open": 1949.9, "session_vwap": 1950.8678959710082, "vwap_distance_atr": 0.024} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 45.4798, "screening_level": "BELOW_MINIMUM", "selected": 45.4798, "short": 43.1202} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 52.4296} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.4, "volume_level": "HIGH", "volume_percentile_90": 0.5294117647058824, "volume_ratio_20": 0.014322649510019443} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | FALSE | TRUE | {"absolute_edge": 2.3596, "edge": 2.3596, "level": "BELOW_MINIMUM"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 7.

## 47. TATACONSUM

| Decision field | Actual value |
|---|---|
| Opportunity rank | 39 |
| Execution-readiness rank | 49 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | NEUTRAL |
| Current-session direction | LONG |
| Resolved actionable direction | LONG |
| Direction state | SESSION_LONG |
| Session-direction score | 50.6356 |
| OFactor final | 45.4757 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 45.4757 |
| SHORT OFactor | 48.7643 |
| Directional edge LONG minus SHORT | -3.2886 |
| Directional-edge tier | BELOW_MINIMUM |
| XFactor final | 46.9906 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 8 / 7 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 24.1071 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.9701 |
| close_price | 1,098.5000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,099.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,082.3000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,085.6000 |
| prev_close | 1,082.3000 |
| prior_high_20 | 1,123.4000 |
| prior_low_20 | 1,071.1000 |
| return_1d_pct | 1.4968 |
| return_21d_pct | -1.2051 |
| return_5d_pct | -1.0360 |
| return_63d_pct | -11.0526 |
| rsi_14 | 49.9618 |
| sector_return_21d_pct | 0.5362 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 1,085.6000 |
| session_volume | 9,017.0000 |
| session_vwap | 1,085.1258 |
| sma20 | 1,092.8150 |
| sma50 | 1,106.3980 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | TATACONSUM |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.4400 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0826 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 24.1071 |
| close | 1,098.5000 |
| close_vs_ema61_pct | -1.2084 |
| ema61 | 1,112.3846 |
| high | 1,099.0000 |
| low | 1,082.3000 |
| macd_line | -4.5655 |
| move_atr | 0.5351 |
| open | 1,085.6000 |
| previous_close | 1,082.3000 |
| prior_high_20 | 1,123.4000 |
| prior_low_20 | 1,071.1000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 49.9618 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 1,085.1258 |
| sma20 | 1,092.8150 |
| sma50 | 1,106.3980 |
| turnover_lacs | 99.0517 |
| turnover_percentile | 0.4400 |
| volume_average_20 | 109,224.7500 |
| volume_current | 9,017.0000 |
| volume_median_90 | 1,281.0000 |
| volume_percentile_90 | 0.5882 |
| volume_previous_1d | 44,028.0000 |
| volume_previous_2d | 12,764.0000 |
| volume_ratio_20 | 0.0826 |
| vwap_distance_atr | 0.5548 |
| willr14 | -47.6099 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 39.3147 | 18.00% | 7.0766 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 45.6449 | 12.00% | 5.4774 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 24.3424 | 10.00% | 2.4342 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 52.0000 | 6.00% | 3.1200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 26.6758 | 14.00% | 3.7346 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.6865 | 18.00% | 9.1236 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **45.4757** minus penalties **0.0000** = final **45.4757**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 60.6853 | 18.00% | 10.9234 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 54.3551 | 12.00% | 6.5226 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 75.6577 | 10.00% | 7.5658 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 52.0000 | 6.00% | 3.1200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 73.3243 | 14.00% | 10.2654 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 15.9802 | 18.00% | 2.8764 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **48.7643** minus penalties **0.0000** = final **48.7643**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 70.2716 | 20.00% | 14.0543 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 52.0000 | 6.00% | 3.1200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 60.2708 | 6.00% | 3.6163 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **46.9906**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.5351`; VWAP-distance ATR `0.5548`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 24.107142857142872, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 24.107142857142872, "close": 1098.5, "level": "LOW", "move_atr": 0.5351, "session_open": 1085.6, "session_vwap": 1085.1258289896862, "vwap_distance_atr": 0.5548} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 45.4757, "screening_level": "BELOW_MINIMUM", "selected": 45.4757, "short": 48.7643} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 46.9906} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.44, "volume_level": "HIGH", "volume_percentile_90": 0.5882352941176471, "volume_ratio_20": 0.08255454922075811} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | FALSE | TRUE | {"absolute_edge": 3.2886, "edge": -3.2886, "level": "BELOW_MINIMUM"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 7.

## 48. ICICIBANK

| Decision field | Actual value |
|---|---|
| Opportunity rank | 40 |
| Execution-readiness rank | 46 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | NEUTRAL |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | SESSION_SHORT |
| Session-direction score | -24.1361 |
| OFactor final | 45.4579 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 49.5421 |
| SHORT OFactor | 45.4579 |
| Directional edge LONG minus SHORT | 4.0842 |
| Directional-edge tier | BELOW_MINIMUM |
| XFactor final | 51.9340 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4667 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 8 / 7 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 22.7500 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.2759 |
| close_price | 1,422.8000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,441.7000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,415.6000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,428.1000 |
| prev_close | 1,421.0000 |
| prior_high_20 | 1,480.0000 |
| prior_low_20 | 1,386.3000 |
| return_1d_pct | 0.1267 |
| return_21d_pct | 1.5415 |
| return_5d_pct | -2.5479 |
| return_63d_pct | 15.1505 |
| rsi_14 | 50.2977 |
| sector_return_21d_pct | 1.1896 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 1,428.1000 |
| session_volume | 646,141.0000 |
| session_vwap | 1,430.3507 |
| sma20 | 1,437.7150 |
| sma50 | 1,378.7520 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | ICICIBANK |
| trade_date | 2026-08-10 |
| turnover_percentile | 1.0000 |
| vix_regime | LOW |
| volume_ratio_20 | 0.3900 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 22.7500 |
| close | 1,422.8000 |
| close_vs_ema61_pct | 2.7700 |
| ema61 | 1,383.1718 |
| high | 1,441.7000 |
| low | 1,415.6000 |
| macd_line | 14.2206 |
| move_atr | 0.2330 |
| open | 1,428.1000 |
| previous_close | 1,421.0000 |
| prior_high_20 | 1,480.0000 |
| prior_low_20 | 1,386.3000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 50.2977 |
| session_bar_coverage | 0.4667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | 1,430.3507 |
| sma20 | 1,437.7150 |
| sma50 | 1,378.7520 |
| turnover_lacs | 9,193.2941 |
| turnover_percentile | 1.0000 |
| volume_average_20 | 1,656,698.4500 |
| volume_current | 646,141.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.8235 |
| volume_previous_1d | 366,140.0000 |
| volume_previous_2d | 317,399.0000 |
| volume_ratio_20 | 0.3900 |
| vwap_distance_atr | 0.3319 |
| willr14 | -85.4902 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 66.3086 | 18.00% | 11.9355 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 39.6812 | 12.00% | 4.7617 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 39.4673 | 10.00% | 3.9467 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 28.7175 | 14.00% | 4.0205 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 24.2687 | 18.00% | 4.3684 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **49.5421** minus penalties **0.0000** = final **49.5421**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 33.6914 | 18.00% | 6.0645 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 60.3188 | 12.00% | 7.2383 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 60.5326 | 10.00% | 6.0533 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 71.2824 | 14.00% | 9.9795 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 42.3979 | 18.00% | 7.6316 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **50.4579** minus penalties **5.0000** = final **45.4579**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 87.0574 | 20.00% | 17.4115 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 38.7082 | 6.00% | 2.3225 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **51.9340**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2330`; VWAP-distance ATR `0.3319`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 22.750000000000032, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 22.750000000000032, "close": 1422.8, "level": "LOW", "move_atr": 0.233, "session_open": 1428.1, "session_vwap": 1430.3507307228608, "vwap_distance_atr": 0.3319} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 49.5421, "screening_level": "BELOW_MINIMUM", "selected": 45.4579, "short": 45.4579} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 51.934} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 1.0, "volume_level": "HIGH", "volume_percentile_90": 0.8235294117647058, "volume_ratio_20": 0.39001726596653724} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | FALSE | TRUE | {"absolute_edge": 4.0842, "edge": 4.0842, "level": "BELOW_MINIMUM"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 7.

## 49. APOLLOHOSP

| Decision field | Actual value |
|---|---|
| Opportunity rank | 42 |
| Execution-readiness rank | 44 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | NEUTRAL |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | NEUTRAL |
| Direction state | NEUTRAL |
| Session-direction score | -13.8167 |
| OFactor final | 45.3262 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 45.3262 |
| SHORT OFactor | 43.6338 |
| Directional edge LONG minus SHORT | 1.6924 |
| Directional-edge tier | BELOW_MINIMUM |
| XFactor final | 53.5740 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4638 |
| Canonical setup | PULLBACK_CONTINUATION / AWAITING_VOLUME |
| Failed gates / blocking gates | 8 / 7 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 135.6786 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.3220 |
| close_price | 8,910.0000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 8,970.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 8,881.5000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 8,945.0000 |
| prev_close | 8,945.0000 |
| prior_high_20 | 9,050.0000 |
| prior_low_20 | 8,739.0000 |
| return_1d_pct | -0.3913 |
| return_21d_pct | 0.7805 |
| return_5d_pct | 1.0204 |
| return_63d_pct | 11.3124 |
| rsi_14 | 53.5509 |
| sector_return_21d_pct | -1.1272 |
| session_bar_coverage | 0.4638 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 8,945.0000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 8,904.7000 |
| sma50 | 8,682.2000 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | APOLLOHOSP |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.1100 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 135.6786 |
| close | 8,910.0000 |
| close_vs_ema61_pct | 3.5750 |
| ema61 | 8,592.2123 |
| high | 8,970.0000 |
| low | 8,881.5000 |
| macd_line | 69.3407 |
| move_atr | 0.2580 |
| open | 8,945.0000 |
| previous_close | 8,945.0000 |
| prior_high_20 | 9,050.0000 |
| prior_low_20 | 8,739.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 53.5509 |
| session_bar_coverage | 0.4638 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 8,904.7000 |
| sma50 | 8,682.2000 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.1100 |
| volume_average_20 | 57,009.6500 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.5294 |
| volume_previous_1d | 10,359.0000 |
| volume_previous_2d | 43,554.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -45.7516 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4638 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 64.0750 | 18.00% | 11.5335 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 57.8026 | 12.00% | 6.9363 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 41.9507 | 10.00% | 4.1951 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 21.4774 | 14.00% | 3.0068 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 25.9181 | 18.00% | 4.6653 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **45.3262** minus penalties **0.0000** = final **45.3262**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 35.9250 | 18.00% | 6.4665 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 42.1974 | 12.00% | 5.0637 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 58.0493 | 10.00% | 5.8049 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 78.5226 | 14.00% | 10.9932 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 40.7486 | 18.00% | 7.3347 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **43.6338** minus penalties **0.0000** = final **43.6338**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 55.0000 | 18.00% | 9.9000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 85.6687 | 20.00% | 17.1337 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 57.6716 | 6.00% | 3.4603 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **53.5740**. Setup `PULLBACK_CONTINUATION` / state `AWAITING_VOLUME`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2580`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `NO_OPPORTUNITY`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 135.67857142857142, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["VOLUME_NOT_CONFIRMED"], "setup_type": "PULLBACK_CONTINUATION", "state": "AWAITING_VOLUME", "structural_stop": 8881.5, "trigger_price": 8910.0, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 135.67857142857142, "close": 8910.0, "level": "LOW", "move_atr": 0.258, "session_open": 8945.0, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 45.3262, "screening_level": "BELOW_MINIMUM", "selected": 45.3262, "short": 43.6338} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 53.574} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.11, "volume_level": "HIGH", "volume_percentile_90": 0.5294117647058824, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | FALSE | TRUE | {"absolute_edge": 1.6924, "edge": 1.6924, "level": "BELOW_MINIMUM"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "LOW": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 7.

## 50. SBILIFE

| Decision field | Actual value |
|---|---|
| Opportunity rank | 43 |
| Execution-readiness rank | 47 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | NEUTRAL |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | NEUTRAL |
| Direction state | NEUTRAL |
| Session-direction score | 15.6409 |
| OFactor final | 45.0867 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 45.0867 |
| SHORT OFactor | 43.8733 |
| Directional edge LONG minus SHORT | 1.2134 |
| Directional-edge tier | BELOW_MINIMUM |
| XFactor final | 49.1657 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.4638 |
| Canonical setup | NOT AVAILABLE / FORMING |
| Failed gates / blocking gates | 8 / 7 |
| Canonical status | RESEARCH_ONLY_NO_STANDARD_TRADE |
| Daily level | NO_CANDIDATE |
| Reasons | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

### Universe, market and source context

| Field | Value |
|---|---|
| is_fno | TRUE |
| is_nifty50 | TRUE |
| source | FNO_AND_NIFTY50 |
| nifty_trend | UPWARD |
| source | SMARTAPI_INTRADAY_PARTIAL |
| stock_trend | NOT AVAILABLE |
| vix_regime | LOW |

### Exact inputs supplied to the O/X scoring engine

| Input | Actual value |
|---|---|
| atr14 | 37.2929 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.8657 |
| close_price | 1,859.5000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,863.1000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,836.3000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,855.5000 |
| prev_close | 1,855.5000 |
| prior_high_20 | 1,915.0000 |
| prior_low_20 | 1,797.0000 |
| return_1d_pct | 0.2156 |
| return_21d_pct | -0.1825 |
| return_5d_pct | -2.8982 |
| return_63d_pct | 1.1973 |
| rsi_14 | 51.7940 |
| sector_return_21d_pct | 1.1896 |
| session_bar_coverage | 0.4638 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_open_price | 1,855.5000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,860.3250 |
| sma50 | 1,811.9260 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | SBILIFE |
| trade_date | 2026-08-10 |
| turnover_percentile | 0.1100 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 37.2929 |
| close | 1,859.5000 |
| close_vs_ema61_pct | 0.8659 |
| ema61 | 1,843.0053 |
| high | 1,863.1000 |
| low | 1,836.3000 |
| macd_line | 15.4628 |
| move_atr | 0.1073 |
| open | 1,855.5000 |
| previous_close | 1,855.5000 |
| prior_high_20 | 1,915.0000 |
| prior_low_20 | 1,797.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 51.7940 |
| session_bar_coverage | 0.4638 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 184.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,860.3250 |
| sma50 | 1,811.9260 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.1100 |
| volume_average_20 | 88,202.2500 |
| volume_current | 0.0000 |
| volume_median_90 | 1,974.5000 |
| volume_percentile_90 | 0.4706 |
| volume_previous_1d | 4,207.0000 |
| volume_previous_2d | 4,288.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -47.0339 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.4638 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT", "SESSION_BAR_STALE"] |
| session_latest_bar_age_minutes | 184.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 53.8837 | 18.00% | 9.6991 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 39.7183 | 12.00% | 4.7662 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 28.6920 | 10.00% | 2.8692 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 28.7175 | 14.00% | 4.0205 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 48.5697 | 18.00% | 8.7425 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **45.0867** minus penalties **0.0000** = final **45.0867**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 46.1163 | 18.00% | 8.3009 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 60.2817 | 12.00% | 7.2338 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 71.3080 | 10.00% | 7.1308 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 71.2824 | 14.00% | 9.9795 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 18.0970 | 18.00% | 3.2575 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **43.8733** minus penalties **0.0000** = final **43.8733**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 94.0412 | 20.00% | 18.8082 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 8.0000 | 6.00% | 0.4800 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 61.2917 | 6.00% | 3.6775 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **49.1657**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1073`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `NO_OPPORTUNITY`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 37.292857142857166, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 37.292857142857166, "close": 1859.5, "level": "LOW", "move_atr": 0.1073, "session_open": 1855.5, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 45.0867, "screening_level": "BELOW_MINIMUM", "selected": 45.0867, "short": 43.8733} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 49.1657} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.11, "volume_level": "MEDIUM", "volume_percentile_90": 0.47058823529411764, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | FALSE | TRUE | {"absolute_edge": 1.2134, "edge": 1.2134, "level": "BELOW_MINIMUM"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

### Persisted condition matrix

```json
{
  "HIGH": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": false
  },
  "LOW": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  },
  "MEDIUM": {
    "directional_edge": false,
    "extension_atr": true,
    "ofactor": false,
    "volume_percentile": true
  }
}
```

### Final interpretation

This stock was not authorised for automatic entry. The recorded reasons were: OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 7.

# Reproduction and verification

```bash
docker exec trading-stack-novius2-oiis-live-1 oiis-live select \
  --signal-date 2026-08-07 --trade-date 2026-08-10 \
  --run-slot MANUAL_CORRECTED_FINAL

curl -fsS 'http://127.0.0.1:19090/n50/v1/oiis-live/candidates?tradeDate=2026-08-10'
```

The selection command is idempotent by run slot. Re-running against later-revised market data may legitimately produce a different result hash; never overwrite the original report without recording a new run identity.
