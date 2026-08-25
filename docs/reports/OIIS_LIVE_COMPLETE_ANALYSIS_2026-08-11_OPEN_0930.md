# OIIS Live Complete Calculation and Selection Report — 11 August 2026

**Scope:** Complete per-stock calculation evidence for the corrected OIIS Live V3 directional snapshot.
**Environment:** PAPER ONLY. No live broker order is represented by this report.
**Run ID:** `31c3c662-6336-4d87-867a-83a6096ccffb`
**Run slot:** `OPEN_0930`
**Policy:** `OIIS_DAILY_SELECTION_INTRADAY_ENTRY_V1.0` version `3.3`
**Signal/base daily date:** `2026-08-10`
**Trade date:** `2026-08-11`
**Decision as-of:** `2026-08-11T09:30:00+05:30`
**Physical execution timestamp:** `2026-08-11T09:30:21.499918+05:30`
**Report generated at:** `2026-08-11T10:01:44.735176+05:30`
**Requested universe:** `NIFTY50_FNO_INTERSECTION`
**Result hash:** `a3ae282c890c8eb2ed195261a3a69f0ef913dbec561ab2b47a78e77dd0a98ae4`

## Executive conclusion

The run evaluated **50** symbols in the point-in-time NIFTY 50 and active-F&O intersection. **0** had FULL execution-grade evidence and **50** were retained as explicit data-insufficient rows. It produced **15** ranked research recommendations, **0** O/X-qualified rows, and **0** fully selected rows.

A recommendation is not a trade. The full directional scanner keeps LONG and SHORT opportunities visible. Automatic long-pullback paper entry remains a separate policy and requires FULL data, OFactor at least 74, XFactor at least 76, LONG direction and every blocking gate to pass.

## Time and source interpretation

1. The governed completed cash-equity signal/base date for this run was 2026-08-10.
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

## Run ledger for 11 August 2026

| Run slot | Run ID | Status | Decision as-of | Executed at | Evaluated | Qualified | Selected | Result hash |
|---|---|---|---|---|---|---|---|---|
| MANUAL_20260811_NOW | 27c9450b-1487-4fd3-ad4f-18cc973fc5f5 | COMPLETED | 2026-08-11T02:38:25.289746+00:00 | 2026-08-11T02:38:25.289746+00:00 | 50 | 1 | 0 | 88aadcd99027839b2cba8b3acc3021e2bd3aed35e76cb771b7123ed9155b0e9b |
| PREOPEN_0830 | 9d157091-fc5e-495b-ba16-de1002325729 | COMPLETED | 2026-08-11T03:00:00+00:00 | 2026-08-11T03:00:11.141655+00:00 | 50 | 1 | 0 | 88aadcd99027839b2cba8b3acc3021e2bd3aed35e76cb771b7123ed9155b0e9b |
| OPEN_0930 | 31c3c662-6336-4d87-867a-83a6096ccffb | COMPLETED | 2026-08-11T04:00:00+00:00 | 2026-08-11T04:00:21.499918+00:00 | 50 | 0 | 0 | a3ae282c890c8eb2ed195261a3a69f0ef913dbec561ab2b47a78e77dd0a98ae4 |

The `OPEN_0930` row is authoritative for the stock-by-stock report below. Earlier validation and V2 rows remain immutable operational evidence and are not silently overwritten.

## Aggregate results

### OFactor tiers

| Tier | Stocks |
|---|---|
| BELOW_MINIMUM | 24 |
| HIGH | 1 |
| LOW | 14 |
| MEDIUM | 11 |

### Selected directions

| Direction | Stocks |
|---|---|
| LONG | 19 |
| NEUTRAL | 5 |
| SHORT | 26 |

### Number of failed gates per stock

| Failed-gate count | Stocks |
|---|---|
| 6 | 1 |
| 7 | 39 |
| 8 | 10 |

### Gate failures by direction

| Failure reason | LONG | SHORT | NEUTRAL | Total |
|---|---|---|---|---|
| DATA_QUALITY_BELOW_MINIMUM | 19 | 26 | 5 | 50 |
| INSUFFICIENT_LIQUIDITY | 19 | 26 | 5 | 50 |
| NO_VALID_SETUP | 19 | 26 | 5 | 50 |
| REWARD_RISK_NOT_CALCULATED | 19 | 26 | 5 | 50 |
| STOP_TOO_WIDE | 19 | 26 | 5 | 50 |
| XFACTOR_BELOW_MINIMUM | 19 | 26 | 5 | 50 |
| OFACTOR_BELOW_MINIMUM | 18 | 26 | 5 | 49 |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | 0 | 5 | 5 | 10 |

## Active ranked watchlist

| Rank | Symbol | Daily level | Canonical status | Entry enabled | Buy reference | No-chase reference | Source |
|---|---|---|---|---|---|---|---|
| 1 | BAJAJ-AUTO | HIGH | WAIT_FOR_XFACTOR | FALSE | 11792.0 | 11909.92 | DAILY_SELECTION |
| 2 | TITAN | MEDIUM | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 5136.5 | 5187.865 | DAILY_SELECTION |
| 3 | HCLTECH | MEDIUM | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 1372.5 | 1386.225 | DAILY_SELECTION |
| 4 | EICHERMOT | MEDIUM | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 8061.0 | 8141.61 | DAILY_SELECTION |
| 5 | M&M | MEDIUM | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 3503.5 | 3538.535 | DAILY_SELECTION |
| 6 | TCS | MEDIUM | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 2446.8 | 2471.268 | DAILY_SELECTION |
| 7 | INFY | MEDIUM | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 1189.5 | 1201.395 | DAILY_SELECTION |
| 8 | TECHM | MEDIUM | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 1651.1 | 1667.611 | DAILY_SELECTION |
| 9 | POWERGRID | MEDIUM | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 268.7 | 271.387 | DAILY_SELECTION |
| 10 | AXISBANK | MEDIUM | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 1232.4 | 1244.724 | DAILY_SELECTION |
| 11 | COALINDIA | MEDIUM | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 409.85 | 413.9485 | DAILY_SELECTION |
| 12 | HDFCLIFE | MEDIUM | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 536.85 | 542.2185 | DAILY_SELECTION |
| 13 | ADANIPORTS | LOW | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 1680.5 | 1697.305 | DAILY_SELECTION |
| 14 | HDFCBANK | LOW | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 727.85 | 735.1285 | DAILY_SELECTION |
| 15 | DRREDDY | LOW | SCREENING_COHORT_BELOW_CANONICAL_PERMISSION | FALSE | 1159.1 | 1170.691 | DAILY_SELECTION |

All 15 rows above are recommendations. `entry_enabled=FALSE` confirms they were not authorised trades.

## All-stock decision table

| Opportunity rank | Execution rank | Symbol | F&O | NIFTY50 | Structural | Session | Resolved | State | O | O tier | X | DQ | Coverage | MoveATR | VWAP distance ATR | R:R | Blocking failures | Recommended | Selected | Reasons |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | BAJAJ-AUTO | TRUE | TRUE | LONG | LONG | LONG | ALIGNED | 83.6371 | HIGH | 55.4482 | 49.0000 | 0.9333 | 0.2105 | 0.0290 | NOT AVAILABLE | 5 | TRUE | FALSE | NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 2 | 2 | TITAN | TRUE | TRUE | LONG | LONG | LONG | ALIGNED | 73.8601 | MEDIUM | 56.3951 | 49.0000 | 0.9333 | 0.3816 | NOT AVAILABLE | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 3 | 16 | HCLTECH | TRUE | TRUE | LONG | LONG | LONG | ALIGNED | 73.6899 | MEDIUM | 51.5183 | 49.0000 | 0.8667 | 0.2896 | NOT AVAILABLE | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 4 | 37 | EICHERMOT | TRUE | TRUE | LONG | LONG | LONG | ALIGNED | 71.9786 | MEDIUM | 47.1110 | 49.0000 | 0.9333 | 0.6656 | NOT AVAILABLE | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 5 | 8 | M&M | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 71.4005 | MEDIUM | 53.7029 | 49.0000 | 0.8667 | 0.0723 | NOT AVAILABLE | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 6 | 10 | TCS | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 70.2621 | MEDIUM | 53.3057 | 49.0000 | 0.8667 | 0.1287 | NOT AVAILABLE | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 7 | 7 | INFY | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 68.9389 | MEDIUM | 54.0120 | 49.0000 | 0.9333 | 0.0652 | NOT AVAILABLE | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 8 | 11 | TECHM | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 68.6649 | MEDIUM | 53.2905 | 49.0000 | 0.9333 | 0.1301 | NOT AVAILABLE | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 9 | 27 | POWERGRID | TRUE | TRUE | SHORT | SHORT | SHORT | ALIGNED | 66.5538 | MEDIUM | 49.9310 | 49.0000 | 0.9333 | 0.1692 | NOT AVAILABLE | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 10 | 31 | AXISBANK | TRUE | TRUE | SHORT | SHORT | SHORT | ALIGNED | 65.6114 | MEDIUM | 48.7913 | 49.0000 | 0.9333 | 0.5220 | 0.1970 | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 11 | 13 | COALINDIA | TRUE | TRUE | SHORT | NEUTRAL | SHORT | STRUCTURAL_ONLY | 65.2687 | MEDIUM | 51.9868 | 49.0000 | 0.9333 | 0.2531 | 0.0621 | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 12 | 15 | HDFCLIFE | TRUE | TRUE | SHORT | SHORT | SHORT | ALIGNED | 64.3615 | MEDIUM | 51.6944 | 49.0000 | 0.9333 | 0.2607 | 0.0028 | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 13 | 38 | ADANIPORTS | TRUE | TRUE | SHORT | SHORT | SHORT | ALIGNED | 63.6692 | LOW | 45.9441 | 49.0000 | 0.9333 | 0.5165 | NOT AVAILABLE | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 14 | 5 | HDFCBANK | TRUE | TRUE | SHORT | NEUTRAL | SHORT | STRUCTURAL_ONLY | 63.4353 | LOW | 55.3173 | 49.0000 | 0.9333 | 0.2064 | NOT AVAILABLE | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 15 | 18 | DRREDDY | TRUE | TRUE | SHORT | NEUTRAL | SHORT | STRUCTURAL_ONLY | 62.4238 | LOW | 51.4583 | 49.0000 | 0.9333 | 0.0000 | NOT AVAILABLE | NOT AVAILABLE | 6 | TRUE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 16 | 22 | WIPRO | TRUE | TRUE | LONG | LONG | LONG | ALIGNED | 62.3770 | LOW | 50.4029 | 49.0000 | 0.8667 | 0.3900 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 17 | 19 | MAXHEALTH | TRUE | TRUE | SHORT | SHORT | SHORT | ALIGNED | 62.3647 | LOW | 51.3744 | 49.0000 | 0.9333 | 0.3027 | 0.2338 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 18 | 25 | NTPC | TRUE | TRUE | SHORT | SHORT | SHORT | ALIGNED | 61.0844 | LOW | 50.1207 | 49.0000 | 0.9333 | 0.1522 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 19 | 3 | MARUTI | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 60.8195 | LOW | 56.1913 | 49.0000 | 0.8667 | 0.1436 | 0.0640 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 20 | 17 | HINDALCO | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 59.8805 | LOW | 51.4949 | 49.0000 | 0.9333 | 0.1361 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 21 | 12 | HINDUNILVR | TRUE | TRUE | SHORT | NEUTRAL | SHORT | STRUCTURAL_ONLY | 59.6987 | LOW | 52.9471 | 49.0000 | 0.9333 | 0.1427 | 0.0101 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 22 | 23 | BAJAJFINSV | TRUE | TRUE | LONG | LONG | LONG | ALIGNED | 59.4532 | LOW | 50.1858 | 49.0000 | 0.8667 | 0.2109 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 23 | 4 | JSWSTEEL | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 58.0323 | LOW | 55.7107 | 49.0000 | 0.9333 | 0.0375 | 0.0055 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 24 | 6 | TMPV | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 55.6278 | LOW | 54.0815 | 49.0000 | 0.9333 | 0.0383 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 25 | 39 | SBILIFE | TRUE | TRUE | SHORT | SHORT | SHORT | ALIGNED | 54.4227 | LOW | 43.4808 | 49.0000 | 0.8667 | 0.7047 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 26 | 28 | TATACONSUM | TRUE | TRUE | SHORT | SHORT | SHORT | ALIGNED | 54.2784 | LOW | 49.5609 | 49.0000 | 0.9333 | 0.7193 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 27 | 40 | ADANIENT | TRUE | TRUE | SHORT | SHORT | SHORT | ALIGNED | 53.7930 | BELOW_MINIMUM | 42.4793 | 49.0000 | 0.8667 | 0.7518 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 28 | 26 | SBIN | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 53.0068 | BELOW_MINIMUM | 49.9481 | 49.0000 | 0.9333 | 0.2323 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 29 | 34 | BEL | TRUE | TRUE | SHORT | SHORT | SHORT | ALIGNED | 52.5057 | BELOW_MINIMUM | 47.5733 | 49.0000 | 0.9333 | 0.3559 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 30 | 9 | ASIANPAINT | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 52.2360 | BELOW_MINIMUM | 53.4435 | 49.0000 | 0.8667 | 0.0802 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 31 | 21 | LT | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 52.1486 | BELOW_MINIMUM | 50.6530 | 49.0000 | 0.9333 | 0.2251 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 32 | 20 | JIOFIN | TRUE | TRUE | LONG | NEUTRAL | LONG | STRUCTURAL_ONLY | 50.5228 | BELOW_MINIMUM | 50.8539 | 49.0000 | 0.9333 | 0.1507 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 33 | 29 | ITC | TRUE | TRUE | SHORT | SHORT | SHORT | ALIGNED | 49.7816 | BELOW_MINIMUM | 49.3156 | 49.0000 | 0.9333 | 0.1744 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 42 | 14 | BAJFINANCE | TRUE | TRUE | LONG | SHORT | SHORT | COUNTER_TREND_SHORT | 45.1834 | BELOW_MINIMUM | 51.8290 | 49.0000 | 0.8667 | 0.2486 | 0.0243 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 45 | 24 | ULTRACEMCO | TRUE | TRUE | LONG | SHORT | SHORT | COUNTER_TREND_SHORT | 40.4688 | BELOW_MINIMUM | 50.1667 | 49.0000 | 0.9333 | 0.2963 | 0.1912 | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 46 | 30 | NESTLEIND | TRUE | TRUE | LONG | SHORT | SHORT | COUNTER_TREND_SHORT | 40.0247 | BELOW_MINIMUM | 49.0256 | 49.0000 | 0.9333 | 0.2005 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 47 | 36 | ONGC | TRUE | TRUE | SHORT | LONG | LONG | COUNTER_TREND_LONG | 36.7088 | BELOW_MINIMUM | 47.4259 | 49.0000 | 0.9333 | 0.4406 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 48 | 32 | SHRIRAMFIN | TRUE | TRUE | LONG | SHORT | SHORT | COUNTER_TREND_SHORT | 34.4256 | BELOW_MINIMUM | 48.7450 | 49.0000 | 0.9333 | 0.2310 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 49 | 33 | GRASIM | TRUE | TRUE | LONG | SHORT | SHORT | COUNTER_TREND_SHORT | 30.9562 | BELOW_MINIMUM | 47.8757 | 49.0000 | 0.8667 | 0.2073 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 50 | 35 | ETERNAL | TRUE | TRUE | LONG | SHORT | SHORT | COUNTER_TREND_SHORT | 28.1474 | BELOW_MINIMUM | 47.4600 | 49.0000 | 0.9333 | 0.2268 | NOT AVAILABLE | NOT AVAILABLE | 6 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 34 | 45 | RELIANCE | TRUE | TRUE | NEUTRAL | NEUTRAL | NEUTRAL | NEUTRAL | 47.8404 | BELOW_MINIMUM | 48.7045 | 49.0000 | 0.9333 | 0.3255 | NOT AVAILABLE | NOT AVAILABLE | 7 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 35 | 41 | SUNPHARMA | TRUE | TRUE | NEUTRAL | NEUTRAL | NEUTRAL | NEUTRAL | 47.4347 | BELOW_MINIMUM | 54.8889 | 49.0000 | 0.8667 | 0.0696 | 0.1128 | NOT AVAILABLE | 7 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 36 | 46 | APOLLOHOSP | TRUE | TRUE | NEUTRAL | SHORT | SHORT | SESSION_SHORT | 47.2676 | BELOW_MINIMUM | 48.0011 | 49.0000 | 0.9333 | 0.6063 | 0.4549 | NOT AVAILABLE | 7 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 37 | 44 | ICICIBANK | TRUE | TRUE | NEUTRAL | NEUTRAL | NEUTRAL | NEUTRAL | 46.9040 | BELOW_MINIMUM | 49.8223 | 49.0000 | 0.9333 | 0.2436 | NOT AVAILABLE | NOT AVAILABLE | 7 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 38 | 42 | TATASTEEL | TRUE | TRUE | NEUTRAL | NEUTRAL | NEUTRAL | NEUTRAL | 46.8085 | BELOW_MINIMUM | 52.6559 | 49.0000 | 0.9333 | 0.0316 | NOT AVAILABLE | NOT AVAILABLE | 7 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 39 | 43 | CIPLA | TRUE | TRUE | NEUTRAL | NEUTRAL | NEUTRAL | NEUTRAL | 46.4720 | BELOW_MINIMUM | 50.6068 | 49.0000 | 0.9333 | 0.1597 | NOT AVAILABLE | NOT AVAILABLE | 7 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 40 | 47 | BHARTIARTL | TRUE | TRUE | NEUTRAL | SHORT | SHORT | SESSION_SHORT | 46.2989 | BELOW_MINIMUM | 46.8182 | 49.0000 | 0.8667 | 0.3987 | NOT AVAILABLE | NOT AVAILABLE | 7 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 41 | 48 | KOTAKBANK | TRUE | TRUE | NEUTRAL | SHORT | SHORT | SESSION_SHORT | 46.0004 | BELOW_MINIMUM | 46.5640 | 49.0000 | 0.9333 | 0.4272 | NOT AVAILABLE | NOT AVAILABLE | 7 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 43 | 50 | INDIGO | TRUE | TRUE | NEUTRAL | SHORT | SHORT | SESSION_SHORT | 44.4063 | BELOW_MINIMUM | 44.2074 | 49.0000 | 0.9333 | 0.6728 | NOT AVAILABLE | NOT AVAILABLE | 7 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |
| 44 | 49 | TRENT | TRUE | TRUE | NEUTRAL | SHORT | SHORT | SESSION_SHORT | 42.7558 | BELOW_MINIMUM | 46.3398 | 49.0000 | 0.8667 | 0.3277 | NOT AVAILABLE | NOT AVAILABLE | 7 | FALSE | FALSE | OFACTOR_BELOW_MINIMUM, DIRECTIONAL_EDGE_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM |

# Per-stock calculation evidence

## 1. BAJAJ-AUTO

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
| Session-direction score | 23.3475 |
| OFactor final | 83.6371 |
| OFactor tier | HIGH |
| LONG OFactor | 83.6371 |
| SHORT OFactor | 25.4210 |
| Directional edge LONG minus SHORT | 58.2161 |
| Directional-edge tier | HIGH |
| XFactor final | 55.4482 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
| Canonical setup | NOT AVAILABLE / FORMING |
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
| atr14 | 275.5714 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.7699 |
| close_price | 11,792.0000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 11,818.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 11,705.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 11,734.0000 |
| prev_close | 11,677.0000 |
| prior_high_20 | 11,856.0000 |
| prior_low_20 | 10,145.5000 |
| return_1d_pct | 0.9848 |
| return_21d_pct | 13.5921 |
| return_5d_pct | 1.6552 |
| return_63d_pct | 12.8313 |
| rsi_14 | 69.1638 |
| sector_return_21d_pct | 8.0416 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 11,734.0000 |
| session_volume | 3,479.0000 |
| session_vwap | 11,784.0000 |
| sma20 | 11,133.2250 |
| sma50 | 10,483.9200 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | BAJAJ-AUTO |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.9400 |
| vix_regime | LOW |
| volume_ratio_20 | 1.6323 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 275.5714 |
| close | 11,792.0000 |
| close_vs_ema61_pct | 10.7806 |
| ema61 | 10,606.2096 |
| high | 11,818.0000 |
| low | 11,705.0000 |
| macd_line | 388.9542 |
| move_atr | 0.2105 |
| open | 11,734.0000 |
| previous_close | 11,677.0000 |
| prior_high_20 | 11,856.0000 |
| prior_low_20 | 10,145.5000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 69.1638 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | 11,784.0000 |
| sma20 | 11,133.2250 |
| sma50 | 10,483.9200 |
| turnover_lacs | 410.2437 |
| turnover_percentile | 0.9400 |
| volume_average_20 | 2,131.4000 |
| volume_current | 3,479.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 1.6323 |
| vwap_distance_atr | 0.0290 |
| willr14 | -7.1991 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 98.1928 | 18.00% | 17.6747 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 76.0604 | 12.00% | 9.1272 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 92.3456 | 10.00% | 9.2346 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 92.3603 | 14.00% | 12.9304 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 78.6716 | 18.00% | 14.1609 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **83.6371** minus penalties **0.0000** = final **83.6371**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 1.8073 | 18.00% | 0.3253 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 23.9396 | 12.00% | 2.8728 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 7.6544 | 10.00% | 0.7654 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 7.6396 | 14.00% | 1.0696 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 38.3177 | 18.00% | 6.8972 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **25.4210** minus penalties **0.0000** = final **25.4210**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 88.3071 | 20.00% | 17.6614 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 93.1131 | 6.00% | 5.5868 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **55.4482**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2105`; VWAP-distance ATR `0.0290`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 275.57142857142856, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": true} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 275.57142857142856, "close": 11792.0, "level": "LOW", "move_atr": 0.2105, "session_open": 11734.0, "session_vwap": 11784.0, "vwap_distance_atr": 0.029} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | TRUE | TRUE | {"long": 83.6371, "screening_level": "HIGH", "selected": 83.6371, "short": 25.421} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 55.4482} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.94, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 1.6322604860654968} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 58.2161, "edge": 58.2161, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

This stock was not authorised for automatic entry. It was included in the ranked research review because it ranked closest under the governed ordering. The recorded reasons were: NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 5.

## 2. TITAN

| Decision field | Actual value |
|---|---|
| Opportunity rank | 2 |
| Execution-readiness rank | 2 |
| Recommendation rank | 2 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | LONG |
| Resolved actionable direction | LONG |
| Direction state | ALIGNED |
| Session-direction score | 22.0495 |
| OFactor final | 73.8601 |
| OFactor tier | MEDIUM |
| LONG OFactor | 73.8601 |
| SHORT OFactor | 19.5799 |
| Directional edge LONG minus SHORT | 54.2802 |
| Directional-edge tier | HIGH |
| XFactor final | 56.3951 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 98.2786 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.6544 |
| close_price | 5,136.5000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 5,159.9000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 5,092.2000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 5,099.0000 |
| prev_close | 5,090.0000 |
| prior_high_20 | 5,122.2000 |
| prior_low_20 | 4,554.0000 |
| return_1d_pct | 0.9136 |
| return_21d_pct | 11.6266 |
| return_5d_pct | 4.0831 |
| return_63d_pct | 24.2141 |
| rsi_14 | 76.2765 |
| sector_return_21d_pct | 7.4158 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 5,099.0000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 4,793.8300 |
| sma50 | 4,518.3200 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | TITAN |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 98.2786 |
| close | 5,136.5000 |
| close_vs_ema61_pct | 12.1544 |
| ema61 | 4,561.2925 |
| high | 5,159.9000 |
| low | 5,092.2000 |
| macd_line | 149.5245 |
| move_atr | 0.3816 |
| open | 5,099.0000 |
| previous_close | 5,090.0000 |
| prior_high_20 | 5,122.2000 |
| prior_low_20 | 4,554.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 76.2765 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 4,793.8300 |
| sma50 | 4,518.3200 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 10,425.8000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -4.2101 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 100.0000 | 18.00% | 18.0000 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 92.0129 | 12.00% | 11.0415 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 83.0423 | 10.00% | 8.3042 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 86.6239 | 14.00% | 12.1273 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 39.7649 | 18.00% | 7.1577 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **73.8601** minus penalties **0.0000** = final **73.8601**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 0.0000 | 18.00% | 0.0000 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 7.9871 | 12.00% | 0.9585 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 16.9577 | 10.00% | 1.6958 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 13.3761 | 14.00% | 1.8727 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 26.9018 | 18.00% | 4.8423 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **19.5799** minus penalties **0.0000** = final **19.5799**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 55.0000 | 18.00% | 9.9000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 78.8018 | 20.00% | 15.7604 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 90.2449 | 6.00% | 5.4147 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **56.3951**. Setup `BREAKOUT_ACCEPTANCE` / state `AWAITING_VOLUME`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.3816`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 98.27857142857147, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["VOLUME_NOT_CONFIRMED"], "setup_type": "BREAKOUT_ACCEPTANCE", "state": "AWAITING_VOLUME", "structural_stop": 5122.2, "trigger_price": 5136.5, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 98.27857142857147, "close": 5136.5, "level": "LOW", "move_atr": 0.3816, "session_open": 5099.0, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 73.8601, "screening_level": "MEDIUM", "selected": 73.8601, "short": 19.5799} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 56.3951} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 54.2802, "edge": 54.2802, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

This stock was not authorised for automatic entry. It was included in the ranked research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 3. HCLTECH

| Decision field | Actual value |
|---|---|
| Opportunity rank | 3 |
| Execution-readiness rank | 16 |
| Recommendation rank | 3 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | LONG |
| Resolved actionable direction | LONG |
| Direction state | ALIGNED |
| Session-direction score | 25.8913 |
| OFactor final | 73.6899 |
| OFactor tier | MEDIUM |
| LONG OFactor | 73.6899 |
| SHORT OFactor | 19.7501 |
| Directional edge LONG minus SHORT | 53.9398 |
| Directional-edge tier | HIGH |
| XFactor final | 51.5183 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.8667 |
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
| atr14 | 33.1500 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.7368 |
| close_price | 1,372.5000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,377.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,359.9000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,362.9000 |
| prev_close | 1,357.2000 |
| prior_high_20 | 1,377.0000 |
| prior_low_20 | 1,144.5000 |
| return_1d_pct | 1.1273 |
| return_21d_pct | 12.3895 |
| return_5d_pct | 0.1898 |
| return_63d_pct | 22.1085 |
| rsi_14 | 70.2234 |
| sector_return_21d_pct | 9.3947 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_open_price | 1,362.9000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,287.1950 |
| sma50 | 1,196.8400 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | HCLTECH |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 33.1500 |
| close | 1,372.5000 |
| close_vs_ema61_pct | 10.1406 |
| ema61 | 1,241.9222 |
| high | 1,377.0000 |
| low | 1,359.9000 |
| macd_line | 51.0257 |
| move_atr | 0.2896 |
| open | 1,362.9000 |
| previous_close | 1,357.2000 |
| prior_high_20 | 1,377.0000 |
| prior_low_20 | 1,144.5000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 70.2234 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,287.1950 |
| sma50 | 1,196.8400 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 54,012.2000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -3.0364 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.8667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 2.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 100.0000 | 18.00% | 18.0000 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 71.0143 | 12.00% | 8.5217 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 81.6258 | 10.00% | 8.1626 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 100.0000 | 14.00% | 14.0000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 43.2018 | 18.00% | 7.7763 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **73.6899** minus penalties **0.0000** = final **73.6899**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 0.0000 | 18.00% | 0.0000 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 28.9857 | 12.00% | 3.4783 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 18.3742 | 10.00% | 1.8374 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 0.0000 | 14.00% | 0.0000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 23.4649 | 18.00% | 4.2237 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **19.7501** minus penalties **0.0000** = final **19.7501**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 83.9115 | 20.00% | 16.7823 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 96.9330 | 6.00% | 5.8160 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **51.5183**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2896`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 33.15000000000003, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 33.15000000000003, "close": 1372.5, "level": "LOW", "move_atr": 0.2896, "session_open": 1362.9, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 73.6899, "screening_level": "MEDIUM", "selected": 73.6899, "short": 19.7501} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 51.5183} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 53.9398, "edge": 53.9398, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

This stock was not authorised for automatic entry. It was included in the ranked research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 4. EICHERMOT

| Decision field | Actual value |
|---|---|
| Opportunity rank | 4 |
| Execution-readiness rank | 37 |
| Recommendation rank | 4 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | LONG |
| Resolved actionable direction | LONG |
| Direction state | ALIGNED |
| Session-direction score | 50.6621 |
| OFactor final | 71.9786 |
| OFactor tier | MEDIUM |
| LONG OFactor | 71.9786 |
| SHORT OFactor | 21.4614 |
| Directional edge LONG minus SHORT | 50.5172 |
| Directional-edge tier | HIGH |
| XFactor final | 47.1110 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 159.2500 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.9636 |
| close_price | 8,061.0000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 8,065.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 7,955.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 7,955.0000 |
| prev_close | 7,975.0000 |
| prior_high_20 | 8,067.5000 |
| prior_low_20 | 7,140.0000 |
| return_1d_pct | 1.0784 |
| return_21d_pct | 10.4776 |
| return_5d_pct | 1.5879 |
| return_63d_pct | 14.6005 |
| rsi_14 | 64.6331 |
| sector_return_21d_pct | 8.0416 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 7,955.0000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 7,748.2500 |
| sma50 | 7,518.9800 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | EICHERMOT |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 159.2500 |
| close | 8,061.0000 |
| close_vs_ema61_pct | 6.6039 |
| ema61 | 7,544.9946 |
| high | 8,065.0000 |
| low | 7,955.0000 |
| macd_line | 155.1359 |
| move_atr | 0.6656 |
| open | 7,955.0000 |
| previous_close | 7,975.0000 |
| prior_high_20 | 8,067.5000 |
| prior_low_20 | 7,140.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 64.6331 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 7,748.2500 |
| sma50 | 7,518.9800 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 5,589.8000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -1.3198 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 93.7690 | 18.00% | 16.8784 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 71.2493 | 12.00% | 8.5499 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 73.9056 | 10.00% | 7.3906 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 92.3603 | 14.00% | 12.9304 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.0000 | 18.00% | 9.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **71.9786** minus penalties **0.0000** = final **71.9786**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 6.2310 | 18.00% | 1.1216 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 28.7507 | 12.00% | 3.4501 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 26.0945 | 10.00% | 2.6094 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 7.6396 | 14.00% | 1.0696 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.6667 | 18.00% | 3.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **21.4614** minus penalties **0.0000** = final **21.4614**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 63.0211 | 20.00% | 12.6042 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 93.1131 | 6.00% | 5.5868 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **47.1110**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.6656`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 159.25, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 159.25, "close": 8061.0, "level": "LOW", "move_atr": 0.6656, "session_open": 7955.0, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 71.9786, "screening_level": "MEDIUM", "selected": 71.9786, "short": 21.4614} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 47.111} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 50.5172, "edge": 50.5172, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

This stock was not authorised for automatic entry. It was included in the ranked research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 5. M&M

| Decision field | Actual value |
|---|---|
| Opportunity rank | 5 |
| Execution-readiness rank | 8 |
| Recommendation rank | 5 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | -1.1209 |
| OFactor final | 71.4005 |
| OFactor tier | MEDIUM |
| LONG OFactor | 71.4005 |
| SHORT OFactor | 22.0395 |
| Directional edge LONG minus SHORT | 49.3610 |
| Directional-edge tier | HIGH |
| XFactor final | 53.7029 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.8667 |
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
| atr14 | 87.0786 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.6490 |
| close_price | 3,503.5000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 3,510.8000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 3,490.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 3,509.8000 |
| prev_close | 3,517.0000 |
| prior_high_20 | 3,534.6000 |
| prior_low_20 | 3,079.3999 |
| return_1d_pct | -0.3838 |
| return_21d_pct | 10.8562 |
| return_5d_pct | 2.0536 |
| return_63d_pct | 10.3847 |
| rsi_14 | 68.0111 |
| sector_return_21d_pct | 8.0416 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_open_price | 3,509.8000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 3,278.1300 |
| sma50 | 3,164.1280 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | M&M |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 87.0786 |
| close | 3,503.5000 |
| close_vs_ema61_pct | 8.5913 |
| ema61 | 3,217.0788 |
| high | 3,510.8000 |
| low | 3,490.0000 |
| macd_line | 95.9716 |
| move_atr | 0.0723 |
| open | 3,509.8000 |
| previous_close | 3,517.0000 |
| prior_high_20 | 3,534.6000 |
| prior_low_20 | 3,079.3999 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 68.0111 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 3,278.1300 |
| sma50 | 3,164.1280 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 32,415.1500 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -7.7847 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.8667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 2.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 96.1539 | 18.00% | 17.3077 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 76.5677 | 12.00% | 9.1881 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 76.2718 | 10.00% | 7.6272 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 92.3603 | 14.00% | 12.9304 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 39.5433 | 18.00% | 7.1178 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **71.4005** minus penalties **0.0000** = final **71.4005**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 3.8461 | 18.00% | 0.6923 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 23.4323 | 12.00% | 2.8119 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 23.7282 | 10.00% | 2.3728 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 7.6396 | 14.00% | 1.0696 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 27.1234 | 18.00% | 4.8822 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **22.0395** minus penalties **0.0000** = final **22.0395**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 95.9806 | 20.00% | 19.1961 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 93.1131 | 6.00% | 5.5868 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **53.7029**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.0723`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 87.07857142857142, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 87.07857142857142, "close": 3503.5, "level": "LOW", "move_atr": 0.0723, "session_open": 3509.8, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 71.4005, "screening_level": "MEDIUM", "selected": 71.4005, "short": 22.0395} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 53.7029} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 49.361, "edge": 49.361, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

This stock was not authorised for automatic entry. It was included in the ranked research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 6. TCS

| Decision field | Actual value |
|---|---|
| Opportunity rank | 6 |
| Execution-readiness rank | 10 |
| Recommendation rank | 6 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | 15.3680 |
| OFactor final | 70.2621 |
| OFactor tier | MEDIUM |
| LONG OFactor | 70.2621 |
| SHORT OFactor | 18.1779 |
| Directional edge LONG minus SHORT | 52.0842 |
| Directional-edge tier | HIGH |
| XFactor final | 53.3057 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.8667 |
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
| atr14 | 69.9143 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.6066 |
| close_price | 2,446.8000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 2,456.4000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 2,432.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 2,437.8000 |
| prev_close | 2,425.7000 |
| prior_high_20 | 2,495.0000 |
| prior_low_20 | 2,145.3999 |
| return_1d_pct | 0.8699 |
| return_21d_pct | 12.1614 |
| return_5d_pct | -0.5366 |
| return_63d_pct | 8.9403 |
| rsi_14 | 61.5908 |
| sector_return_21d_pct | 9.3947 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_open_price | 2,437.8000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 2,328.6600 |
| sma50 | 2,212.7580 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | TCS |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 69.9143 |
| close | 2,446.8000 |
| close_vs_ema61_pct | 6.5202 |
| ema61 | 2,292.0375 |
| high | 2,456.4000 |
| low | 2,432.0000 |
| macd_line | 70.4931 |
| move_atr | 0.1287 |
| open | 2,437.8000 |
| previous_close | 2,425.7000 |
| prior_high_20 | 2,495.0000 |
| prior_low_20 | 2,145.3999 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 61.5908 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 2,328.6600 |
| sma50 | 2,212.7580 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 112,999.0000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -15.9920 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.8667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 2.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 94.9503 | 18.00% | 17.0910 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 59.3551 | 12.00% | 7.1226 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 80.2002 | 10.00% | 8.0200 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 100.0000 | 14.00% | 14.0000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 37.7732 | 18.00% | 6.7992 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **70.2621** minus penalties **0.0000** = final **70.2621**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 5.0497 | 18.00% | 0.9090 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 40.6449 | 12.00% | 4.8774 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 19.7998 | 10.00% | 1.9800 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 0.0000 | 14.00% | 0.0000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 28.8934 | 18.00% | 5.2008 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **23.1779** minus penalties **5.0000** = final **18.1779**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 92.8484 | 20.00% | 18.5697 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 96.9330 | 6.00% | 5.8160 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **53.3057**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1287`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 69.91428571428575, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 69.91428571428575, "close": 2446.8, "level": "LOW", "move_atr": 0.1287, "session_open": 2437.8, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 70.2621, "screening_level": "MEDIUM", "selected": 70.2621, "short": 18.1779} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 53.3057} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 52.0842, "edge": 52.0842, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

This stock was not authorised for automatic entry. It was included in the ranked research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 7. INFY

| Decision field | Actual value |
|---|---|
| Opportunity rank | 7 |
| Execution-readiness rank | 7 |
| Recommendation rank | 7 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | 12.1557 |
| OFactor final | 68.9389 |
| OFactor tier | MEDIUM |
| LONG OFactor | 68.9389 |
| SHORT OFactor | 24.5010 |
| Directional edge LONG minus SHORT | 44.4379 |
| Directional-edge tier | HIGH |
| XFactor final | 54.0120 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 33.7643 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.6702 |
| close_price | 1,189.5000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,192.6000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,183.2000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,187.3000 |
| prev_close | 1,183.0000 |
| prior_high_20 | 1,195.0000 |
| prior_low_20 | 1,013.9000 |
| return_1d_pct | 0.5495 |
| return_21d_pct | 7.8814 |
| return_5d_pct | 1.8844 |
| return_63d_pct | 8.6301 |
| rsi_14 | 64.1223 |
| sector_return_21d_pct | 9.3947 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 1,187.3000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,115.9700 |
| sma50 | 1,106.3960 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | INFY |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 33.7643 |
| close | 1,189.5000 |
| close_vs_ema61_pct | 4.8443 |
| ema61 | 1,132.7079 |
| high | 1,192.6000 |
| low | 1,183.2000 |
| macd_line | 26.5950 |
| move_atr | 0.0652 |
| open | 1,187.3000 |
| previous_close | 1,183.0000 |
| prior_high_20 | 1,195.0000 |
| prior_low_20 | 1,013.9000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 64.1223 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,115.9700 |
| sma50 | 1,106.3960 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 305,059.6500 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -3.0370 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 91.3955 | 18.00% | 16.4512 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 71.9738 | 12.00% | 8.6369 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 53.4503 | 10.00% | 5.3450 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 100.0000 | 14.00% | 14.0000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 40.4255 | 18.00% | 7.2766 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **68.9389** minus penalties **0.0000** = final **68.9389**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 8.6045 | 18.00% | 1.5488 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 28.0262 | 12.00% | 3.3631 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 46.5497 | 10.00% | 4.6550 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 0.0000 | 14.00% | 0.0000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 26.2411 | 18.00% | 4.7234 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **24.5010** minus penalties **0.0000** = final **24.5010**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 96.3801 | 20.00% | 19.2760 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 96.9330 | 6.00% | 5.8160 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **54.0120**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.0652`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 33.76428571428573, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 33.76428571428573, "close": 1189.5, "level": "LOW", "move_atr": 0.0652, "session_open": 1187.3, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 68.9389, "screening_level": "MEDIUM", "selected": 68.9389, "short": 24.501} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 54.012} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 44.4379, "edge": 44.4379, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

This stock was not authorised for automatic entry. It was included in the ranked research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 8. TECHM

| Decision field | Actual value |
|---|---|
| Opportunity rank | 8 |
| Execution-readiness rank | 11 |
| Recommendation rank | 8 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | 7.9202 |
| OFactor final | 68.6649 |
| OFactor tier | MEDIUM |
| LONG OFactor | 68.6649 |
| SHORT OFactor | 24.7751 |
| Directional edge LONG minus SHORT | 43.8898 |
| Directional-edge tier | HIGH |
| XFactor final | 53.2905 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 39.9714 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.4356 |
| close_price | 1,651.1000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,660.3000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,644.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,645.9000 |
| prev_close | 1,640.0000 |
| prior_high_20 | 1,686.6000 |
| prior_low_20 | 1,453.0000 |
| return_1d_pct | 0.6768 |
| return_21d_pct | 9.7441 |
| return_5d_pct | 0.1577 |
| return_63d_pct | 22.9046 |
| rsi_14 | 67.8415 |
| sector_return_21d_pct | 9.3947 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 1,645.9000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,596.2100 |
| sma50 | 1,507.5660 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | TECHM |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 39.9714 |
| close | 1,651.1000 |
| close_vs_ema61_pct | 8.1119 |
| ema61 | 1,523.0849 |
| high | 1,660.3000 |
| low | 1,644.0000 |
| macd_line | 44.1347 |
| move_atr | 0.1301 |
| open | 1,645.9000 |
| previous_close | 1,640.0000 |
| prior_high_20 | 1,686.6000 |
| prior_low_20 | 1,453.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 67.8415 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,596.2100 |
| sma50 | 1,507.5660 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 39,935.8000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -22.8296 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 95.4981 | 18.00% | 17.1896 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 68.4987 | 12.00% | 8.2198 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 65.0923 | 10.00% | 6.5092 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 100.0000 | 14.00% | 14.0000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 30.6493 | 18.00% | 5.5169 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **68.6649** minus penalties **0.0000** = final **68.6649**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 4.5019 | 18.00% | 0.8104 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 31.5013 | 12.00% | 3.7802 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 34.9076 | 10.00% | 3.4908 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 0.0000 | 14.00% | 0.0000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 36.0174 | 18.00% | 6.4831 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **24.7751** minus penalties **0.0000** = final **24.7751**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 92.7726 | 20.00% | 18.5545 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 96.9330 | 6.00% | 5.8160 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **53.2905**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1301`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 39.97142857142858, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 39.97142857142858, "close": 1651.1, "level": "LOW", "move_atr": 0.1301, "session_open": 1645.9, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 68.6649, "screening_level": "MEDIUM", "selected": 68.6649, "short": 24.7751} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 53.2905} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 43.8898, "edge": 43.8898, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

This stock was not authorised for automatic entry. It was included in the ranked research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 9. POWERGRID

| Decision field | Actual value |
|---|---|
| Opportunity rank | 9 |
| Execution-readiness rank | 27 |
| Recommendation rank | 9 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | ALIGNED |
| Session-direction score | -23.7704 |
| OFactor final | 66.5538 |
| OFactor tier | MEDIUM |
| LONG OFactor | 26.8862 |
| SHORT OFactor | 66.5538 |
| Directional edge LONG minus SHORT | -39.6676 |
| Directional-edge tier | HIGH |
| XFactor final | 49.9310 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 5.3179 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.0000 |
| close_price | 268.7000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 270.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 268.7000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 269.6000 |
| prev_close | 270.1000 |
| prior_high_20 | 294.1000 |
| prior_low_20 | 268.3500 |
| return_1d_pct | -0.5183 |
| return_21d_pct | -6.0490 |
| return_5d_pct | -5.1870 |
| return_63d_pct | -10.9528 |
| rsi_14 | 30.2905 |
| sector_return_21d_pct | -4.8795 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 269.6000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 283.2700 |
| sma50 | 285.0420 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | POWERGRID |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 5.3179 |
| close | 268.7000 |
| close_vs_ema61_pct | -6.3827 |
| ema61 | 287.6303 |
| high | 270.0000 |
| low | 268.7000 |
| macd_line | -3.9740 |
| move_atr | 0.1692 |
| open | 269.6000 |
| previous_close | 270.1000 |
| prior_high_20 | 294.1000 |
| prior_low_20 | 268.3500 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 30.2905 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 283.2700 |
| sma50 | 285.0420 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 126,103.0000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -98.6408 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 11.7547 | 18.00% | 2.1158 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 8.6779 | 12.00% | 1.0414 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 21.3454 | 10.00% | 2.1345 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 9.7516 | 14.00% | 1.3652 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.6667 | 18.00% | 3.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **26.8862** minus penalties **0.0000** = final **26.8862**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 88.2453 | 18.00% | 15.8842 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 91.3220 | 12.00% | 10.9586 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 78.6546 | 10.00% | 7.8655 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 90.2484 | 14.00% | 12.6348 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.0000 | 18.00% | 9.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **66.5538** minus penalties **0.0000** = final **66.5538**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 90.5977 | 20.00% | 18.1195 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 48.1913 | 6.00% | 2.8915 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **49.9310**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1692`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 5.31785714285715, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 5.31785714285715, "close": 268.7, "level": "LOW", "move_atr": 0.1692, "session_open": 269.6, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 26.8862, "screening_level": "MEDIUM", "selected": 66.5538, "short": 66.5538} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 49.931} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 39.6676, "edge": -39.6676, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

This stock was not authorised for automatic entry. It was included in the ranked research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 10. AXISBANK

| Decision field | Actual value |
|---|---|
| Opportunity rank | 10 |
| Execution-readiness rank | 31 |
| Recommendation rank | 10 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | ALIGNED |
| Session-direction score | -37.3916 |
| OFactor final | 65.6114 |
| OFactor tier | MEDIUM |
| LONG OFactor | 35.7642 |
| SHORT OFactor | 65.6114 |
| Directional edge LONG minus SHORT | -29.8472 |
| Directional-edge tier | HIGH |
| XFactor final | 48.7913 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 20.3071 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.0364 |
| close_price | 1,232.4000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,243.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,232.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,243.0000 |
| prev_close | 1,247.3000 |
| prior_high_20 | 1,348.0000 |
| prior_low_20 | 1,210.6000 |
| return_1d_pct | -1.1946 |
| return_21d_pct | -6.5939 |
| return_5d_pct | -2.3300 |
| return_63d_pct | -1.7695 |
| rsi_14 | 39.5363 |
| sector_return_21d_pct | 0.4571 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 1,243.0000 |
| session_volume | 40,597.0000 |
| session_vwap | 1,236.4010 |
| sma20 | 1,257.1350 |
| sma50 | 1,301.8760 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | AXISBANK |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.9800 |
| vix_regime | LOW |
| volume_ratio_20 | 0.6719 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 20.3071 |
| close | 1,232.4000 |
| close_vs_ema61_pct | -4.1783 |
| ema61 | 1,287.9307 |
| high | 1,243.0000 |
| low | 1,232.0000 |
| macd_line | -17.4217 |
| move_atr | 0.5220 |
| open | 1,243.0000 |
| previous_close | 1,247.3000 |
| prior_high_20 | 1,348.0000 |
| prior_low_20 | 1,210.6000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 39.5363 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | 1,236.4010 |
| sma20 | 1,257.1350 |
| sma50 | 1,301.8760 |
| turnover_lacs | 500.3174 |
| turnover_percentile | 0.9800 |
| volume_average_20 | 60,417.1000 |
| volume_current | 40,597.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.8235 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.6719 |
| vwap_distance_atr | 0.1970 |
| willr14 | -64.4951 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 26.6328 | 18.00% | 4.7939 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 29.8279 | 12.00% | 3.5793 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 2.9655 | 10.00% | 0.2965 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 26.4286 | 14.00% | 3.7000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.0283 | 18.00% | 2.8851 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **35.7642** minus penalties **0.0000** = final **35.7642**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 73.3672 | 18.00% | 13.2061 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 70.1721 | 12.00% | 8.4207 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 97.0345 | 10.00% | 9.7035 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 73.5714 | 14.00% | 10.3000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 58.2804 | 18.00% | 10.4905 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **65.6114** minus penalties **0.0000** = final **65.6114**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 71.0009 | 20.00% | 14.2002 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 39.8528 | 6.00% | 2.3912 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **48.7913**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.5220`; VWAP-distance ATR `0.1970`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 20.307142857142885, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 20.307142857142885, "close": 1232.4, "level": "LOW", "move_atr": 0.522, "session_open": 1243.0, "session_vwap": 1236.4009779047713, "vwap_distance_atr": 0.197} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 35.7642, "screening_level": "MEDIUM", "selected": 65.6114, "short": 65.6114} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 48.7913} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.98, "volume_level": "HIGH", "volume_percentile_90": 0.8235294117647058, "volume_ratio_20": 0.671945525356232} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 29.8472, "edge": -29.8472, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

This stock was not authorised for automatic entry. It was included in the ranked research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 11. COALINDIA

| Decision field | Actual value |
|---|---|
| Opportunity rank | 11 |
| Execution-readiness rank | 13 |
| Recommendation rank | 11 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | SHORT |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | -17.7696 |
| OFactor final | 65.2687 |
| OFactor tier | MEDIUM |
| LONG OFactor | 34.7313 |
| SHORT OFactor | 65.2687 |
| Directional edge LONG minus SHORT | -30.5374 |
| Directional-edge tier | HIGH |
| XFactor final | 51.9868 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 6.3214 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.1795 |
| close_price | 409.8500 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 411.4500 |
| is_intraday_snapshot | 1.0000 |
| low_price | 409.5000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 411.4500 |
| prev_close | 411.0000 |
| prior_high_20 | 436.5000 |
| prior_low_20 | 406.2500 |
| return_1d_pct | -0.2798 |
| return_21d_pct | -4.7304 |
| return_5d_pct | -1.8558 |
| return_63d_pct | -9.7346 |
| rsi_14 | 30.9531 |
| sector_return_21d_pct | -1.7603 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 411.4500 |
| session_volume | 42,177.0000 |
| session_vwap | 410.2424 |
| sma20 | 421.3325 |
| sma50 | 436.6700 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | COALINDIA |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.8600 |
| vix_regime | LOW |
| volume_ratio_20 | 0.2266 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 6.3214 |
| close | 409.8500 |
| close_vs_ema61_pct | -5.4378 |
| ema61 | 434.2039 |
| high | 411.4500 |
| low | 409.5000 |
| macd_line | -6.5354 |
| move_atr | 0.2531 |
| open | 411.4500 |
| previous_close | 411.0000 |
| prior_high_20 | 436.5000 |
| prior_low_20 | 406.2500 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 30.9531 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | 410.2424 |
| sma20 | 421.3325 |
| sma50 | 436.6700 |
| turnover_lacs | 172.8624 |
| turnover_percentile | 0.8600 |
| volume_average_20 | 186,102.7000 |
| volume_current | 42,177.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.8235 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.2266 |
| vwap_distance_atr | 0.0621 |
| willr14 | -85.4545 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 20.0060 | 18.00% | 3.6011 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 23.2204 | 12.00% | 2.7865 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 15.7186 | 10.00% | 1.5719 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 19.4990 | 14.00% | 2.7299 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 19.6263 | 18.00% | 3.5327 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **34.7313** minus penalties **0.0000** = final **34.7313**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 79.9940 | 18.00% | 14.3989 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 76.7796 | 12.00% | 9.2135 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 84.2814 | 10.00% | 8.4281 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 80.5010 | 14.00% | 11.2701 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 47.0403 | 18.00% | 8.4673 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **65.2687** minus penalties **0.0000** = final **65.2687**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 85.9385 | 20.00% | 17.1877 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 43.3176 | 6.00% | 2.5991 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **51.9868**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2531`; VWAP-distance ATR `0.0621`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 6.321428571428571, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 6.321428571428571, "close": 409.85, "level": "LOW", "move_atr": 0.2531, "session_open": 411.45, "session_vwap": 410.24236787822747, "vwap_distance_atr": 0.0621} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 34.7313, "screening_level": "MEDIUM", "selected": 65.2687, "short": 65.2687} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 51.9868} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.86, "volume_level": "HIGH", "volume_percentile_90": 0.8235294117647058, "volume_ratio_20": 0.22663292902252358} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 30.5374, "edge": -30.5374, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

This stock was not authorised for automatic entry. It was included in the ranked research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 12. HDFCLIFE

| Decision field | Actual value |
|---|---|
| Opportunity rank | 12 |
| Execution-readiness rank | 15 |
| Recommendation rank | 12 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | ALIGNED |
| Session-direction score | -20.2533 |
| OFactor final | 64.3615 |
| OFactor tier | MEDIUM |
| LONG OFactor | 30.6385 |
| SHORT OFactor | 64.3615 |
| Directional edge LONG minus SHORT | -33.7230 |
| Directional-edge tier | HIGH |
| XFactor final | 51.6944 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 9.5893 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.1940 |
| close_price | 536.8500 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 539.5500 |
| is_intraday_snapshot | 1.0000 |
| low_price | 536.2000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 539.3500 |
| prev_close | 540.0000 |
| prior_high_20 | 588.0000 |
| prior_low_20 | 530.5000 |
| return_1d_pct | -0.5833 |
| return_21d_pct | -6.3743 |
| return_5d_pct | 0.1679 |
| return_63d_pct | -12.3582 |
| rsi_14 | 37.8957 |
| sector_return_21d_pct | 0.4571 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 539.3500 |
| session_volume | 11,367.0000 |
| session_vwap | 536.8764 |
| sma20 | 552.9350 |
| sma50 | 565.3710 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | HDFCLIFE |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.8000 |
| vix_regime | LOW |
| volume_ratio_20 | 0.3120 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 9.5893 |
| close | 536.8500 |
| close_vs_ema61_pct | -6.0118 |
| ema61 | 572.3332 |
| high | 539.5500 |
| low | 536.2000 |
| macd_line | -8.3020 |
| move_atr | 0.2607 |
| open | 539.3500 |
| previous_close | 540.0000 |
| prior_high_20 | 588.0000 |
| prior_low_20 | 530.5000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 37.8957 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | 536.8764 |
| sma20 | 552.9350 |
| sma50 | 565.3710 |
| turnover_lacs | 61.0237 |
| turnover_percentile | 0.8000 |
| volume_average_20 | 36,428.3500 |
| volume_current | 11,367.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.3120 |
| vwap_distance_atr | 0.0028 |
| willr14 | -79.8092 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 16.1634 | 18.00% | 2.9094 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 38.5953 | 12.00% | 4.6314 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 3.6519 | 10.00% | 0.3652 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 26.4286 | 14.00% | 3.7000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 19.5733 | 18.00% | 3.5232 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **35.6385** minus penalties **5.0000** = final **30.6385**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 83.8366 | 18.00% | 15.0906 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 61.4046 | 12.00% | 7.3686 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 96.3482 | 10.00% | 9.6348 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 73.5714 | 14.00% | 10.3000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 47.0933 | 18.00% | 8.4768 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **64.3615** minus penalties **0.0000** = final **64.3615**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 85.5162 | 20.00% | 17.1032 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 39.8528 | 6.00% | 2.3912 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **51.6944**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2607`; VWAP-distance ATR `0.0028`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 9.589285714285714, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 9.589285714285714, "close": 536.85, "level": "LOW", "move_atr": 0.2607, "session_open": 539.35, "session_vwap": 536.8764185801003, "vwap_distance_atr": 0.0028} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 30.6385, "screening_level": "MEDIUM", "selected": 64.3615, "short": 64.3615} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 51.6944} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.8, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.3120371908142971} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 33.723, "edge": -33.723, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

This stock was not authorised for automatic entry. It was included in the ranked research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 13. ADANIPORTS

| Decision field | Actual value |
|---|---|
| Opportunity rank | 13 |
| Execution-readiness rank | 38 |
| Recommendation rank | 13 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | ALIGNED |
| Session-direction score | -36.5420 |
| OFactor final | 63.6692 |
| OFactor tier | LOW |
| LONG OFactor | 29.7708 |
| SHORT OFactor | 63.6692 |
| Directional edge LONG minus SHORT | -33.8984 |
| Directional-edge tier | HIGH |
| XFactor final | 45.9441 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 37.7571 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.1333 |
| close_price | 1,680.5000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,700.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,677.5000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,700.0000 |
| prev_close | 1,681.0000 |
| prior_high_20 | 1,859.7000 |
| prior_low_20 | 1,650.0000 |
| return_1d_pct | -0.0297 |
| return_21d_pct | -7.1701 |
| return_5d_pct | -1.5351 |
| return_63d_pct | -5.2385 |
| rsi_14 | 33.0969 |
| sector_return_21d_pct | -3.5038 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 1,700.0000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,758.7050 |
| sma50 | 1,794.5960 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | ADANIPORTS |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 37.7571 |
| close | 1,680.5000 |
| close_vs_ema61_pct | -3.9183 |
| ema61 | 1,751.3164 |
| high | 1,700.0000 |
| low | 1,677.5000 |
| macd_line | -34.2512 |
| move_atr | 0.5165 |
| open | 1,700.0000 |
| previous_close | 1,681.0000 |
| prior_high_20 | 1,859.7000 |
| prior_low_20 | 1,650.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 33.0969 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,758.7050 |
| sma50 | 1,794.5960 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 21,047.0000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.8529 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -82.6211 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 15.3673 | 18.00% | 2.7661 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 26.7005 | 12.00% | 3.2041 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 13.5427 | 10.00% | 1.3543 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 14.0507 | 14.00% | 1.9671 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 18.0556 | 18.00% | 3.2500 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **29.7708** minus penalties **0.0000** = final **29.7708**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 84.6327 | 18.00% | 15.2339 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 73.2995 | 12.00% | 8.7959 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 86.4573 | 10.00% | 8.6457 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 85.9493 | 14.00% | 12.0329 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 48.6111 | 18.00% | 8.7500 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **63.6692** minus penalties **0.0000** = final **63.6692**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 71.3079 | 20.00% | 14.2616 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 46.0417 | 6.00% | 2.7625 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **45.9441**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.5165`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 37.75714285714288, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 37.75714285714288, "close": 1680.5, "level": "LOW", "move_atr": 0.5165, "session_open": 1700.0, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 29.7708, "screening_level": "LOW", "selected": 63.6692, "short": 63.6692} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 45.9441} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.8529411764705882, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 33.8984, "edge": -33.8984, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

This stock was not authorised for automatic entry. It was included in the ranked research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 14. HDFCBANK

| Decision field | Actual value |
|---|---|
| Opportunity rank | 14 |
| Execution-readiness rank | 5 |
| Recommendation rank | 14 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | SHORT |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | -18.1631 |
| OFactor final | 63.4353 |
| OFactor tier | LOW |
| LONG OFactor | 30.0047 |
| SHORT OFactor | 63.4353 |
| Directional edge LONG minus SHORT | -33.4306 |
| Directional-edge tier | HIGH |
| XFactor final | 55.3173 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
| Canonical setup | BREAKDOWN_ACCEPTANCE / AWAITING_VOLUME |
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
| atr14 | 10.4143 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.1452 |
| close_price | 727.8500 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 730.5000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 727.4000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 730.0000 |
| prev_close | 731.0000 |
| prior_high_20 | 823.7000 |
| prior_low_20 | 728.2000 |
| return_1d_pct | -0.4309 |
| return_21d_pct | -11.0153 |
| return_5d_pct | -1.9070 |
| return_63d_pct | -5.4188 |
| rsi_14 | 33.1161 |
| sector_return_21d_pct | 0.4571 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 730.0000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 759.3275 |
| sma50 | 774.5090 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | HDFCBANK |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 10.4143 |
| close | 727.8500 |
| close_vs_ema61_pct | -5.9144 |
| ema61 | 775.1294 |
| high | 730.5000 |
| low | 727.4000 |
| macd_line | -15.2788 |
| move_atr | 0.2064 |
| open | 730.0000 |
| previous_close | 731.0000 |
| prior_high_20 | 823.7000 |
| prior_low_20 | 728.2000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 33.1161 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 759.3275 |
| sma50 | 774.5090 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 403,516.9000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -98.5246 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 15.0904 | 18.00% | 2.7163 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 25.1702 | 12.00% | 3.0204 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 0.0000 | 10.00% | 0.0000 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 26.4286 | 14.00% | 3.7000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 18.5484 | 18.00% | 3.3387 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **30.0047** minus penalties **0.0000** = final **30.0047**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 84.9096 | 18.00% | 15.2837 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 74.8298 | 12.00% | 8.9796 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 100.0000 | 10.00% | 10.0000 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 73.5714 | 14.00% | 10.3000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 48.1183 | 18.00% | 8.6613 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **63.4353** minus penalties **0.0000** = final **63.4353**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 55.0000 | 18.00% | 9.9000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 88.5307 | 20.00% | 17.7061 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 39.8528 | 6.00% | 2.3912 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **55.3173**. Setup `BREAKDOWN_ACCEPTANCE` / state `AWAITING_VOLUME`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2064`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 10.414285714285711, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["VOLUME_NOT_CONFIRMED"], "setup_type": "BREAKDOWN_ACCEPTANCE", "state": "AWAITING_VOLUME", "structural_stop": 728.2, "trigger_price": 727.85, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 10.414285714285711, "close": 727.85, "level": "LOW", "move_atr": 0.2064, "session_open": 730.0, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 30.0047, "screening_level": "LOW", "selected": 63.4353, "short": 63.4353} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 55.3173} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 33.4306, "edge": -33.4306, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

This stock was not authorised for automatic entry. It was included in the ranked research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 15. DRREDDY

| Decision field | Actual value |
|---|---|
| Opportunity rank | 15 |
| Execution-readiness rank | 18 |
| Recommendation rank | 15 |
| Recommended for review | TRUE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | SHORT |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | -14.1176 |
| OFactor final | 62.4238 |
| OFactor tier | LOW |
| LONG OFactor | 31.0162 |
| SHORT OFactor | 62.4238 |
| Directional edge LONG minus SHORT | -31.4076 |
| Directional-edge tier | HIGH |
| XFactor final | 51.4583 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 25.2571 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.0222 |
| close_price | 1,159.1000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,163.5000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,159.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,159.1000 |
| prev_close | 1,158.8000 |
| prior_high_20 | 1,249.1000 |
| prior_low_20 | 1,101.0000 |
| return_1d_pct | 0.0259 |
| return_21d_pct | -6.1077 |
| return_5d_pct | -1.1513 |
| return_63d_pct | -11.0847 |
| rsi_14 | 35.4882 |
| sector_return_21d_pct | -1.1119 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 1,159.1000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,179.6600 |
| sma50 | 1,252.8420 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | DRREDDY |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 25.2571 |
| close | 1,159.1000 |
| close_vs_ema61_pct | -6.3685 |
| ema61 | 1,240.5667 |
| high | 1,163.5000 |
| low | 1,159.0000 |
| macd_line | -27.8276 |
| move_atr | 0.0000 |
| open | 1,159.1000 |
| previous_close | 1,158.8000 |
| prior_high_20 | 1,249.1000 |
| prior_low_20 | 1,101.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 35.4882 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,179.6600 |
| sma50 | 1,252.8420 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 13,514.1000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -28.2716 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 17.5093 | 18.00% | 3.1517 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 30.6911 | 12.00% | 3.6829 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 9.3880 | 10.00% | 0.9388 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 21.5253 | 14.00% | 3.0135 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.6667 | 18.00% | 3.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **31.0162** minus penalties **0.0000** = final **31.0162**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 82.4907 | 18.00% | 14.8483 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 69.3089 | 12.00% | 8.3171 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 90.6121 | 10.00% | 9.0612 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 78.4746 | 14.00% | 10.9865 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.0000 | 18.00% | 9.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **62.4238** minus penalties **0.0000** = final **62.4238**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 100.0000 | 20.00% | 20.0000 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 42.3043 | 6.00% | 2.5383 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **51.4583**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.0000`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 25.257142857142835, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 25.257142857142835, "close": 1159.1, "level": "LOW", "move_atr": 0.0, "session_open": 1159.1, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 31.0162, "screening_level": "LOW", "selected": 62.4238, "short": 62.4238} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 51.4583} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 31.4076, "edge": -31.4076, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

This stock was not authorised for automatic entry. It was included in the ranked research review because it ranked closest under the governed ordering. The recorded reasons were: OFACTOR_BELOW_MINIMUM, NO_VALID_SETUP, INSUFFICIENT_LIQUIDITY, REWARD_RISK_NOT_CALCULATED, STOP_TOO_WIDE, XFACTOR_BELOW_MINIMUM, DATA_QUALITY_BELOW_MINIMUM; blocking failures: 6.

## 16. WIPRO

| Decision field | Actual value |
|---|---|
| Opportunity rank | 16 |
| Execution-readiness rank | 22 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | LONG |
| Resolved actionable direction | LONG |
| Direction state | ALIGNED |
| Session-direction score | 24.9792 |
| OFactor final | 62.3770 |
| OFactor tier | LOW |
| LONG OFactor | 62.3770 |
| SHORT OFactor | 31.0630 |
| Directional edge LONG minus SHORT | 31.3140 |
| Directional-edge tier | HIGH |
| XFactor final | 50.4029 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.8667 |
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
| atr14 | 3.8207 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.7525 |
| close_price | 186.9900 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 187.4800 |
| is_intraday_snapshot | 1.0000 |
| low_price | 185.5000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 185.5000 |
| prev_close | 185.5000 |
| prior_high_20 | 191.3400 |
| prior_low_20 | 172.8000 |
| return_1d_pct | 0.8032 |
| return_21d_pct | 4.7974 |
| return_5d_pct | 0.3704 |
| return_63d_pct | -0.6957 |
| rsi_14 | 59.2586 |
| sector_return_21d_pct | 9.3947 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_open_price | 185.5000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 180.8800 |
| sma50 | 180.7636 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | WIPRO |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 3.8207 |
| close | 186.9900 |
| close_vs_ema61_pct | 1.1794 |
| ema61 | 184.7377 |
| high | 187.4800 |
| low | 185.5000 |
| macd_line | 2.2472 |
| move_atr | 0.3900 |
| open | 185.5000 |
| previous_close | 185.5000 |
| prior_high_20 | 191.3400 |
| prior_low_20 | 172.8000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 59.2586 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 180.8800 |
| sma50 | 180.7636 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 685,695.7500 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.8235 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -23.4628 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.8667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 2.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 69.6667 | 18.00% | 12.5400 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 60.8017 | 12.00% | 7.2962 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 34.1755 | 10.00% | 3.4175 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 100.0000 | 14.00% | 14.0000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 43.8552 | 18.00% | 7.8939 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **62.3770** minus penalties **0.0000** = final **62.3770**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 30.3334 | 18.00% | 5.4600 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 39.1983 | 12.00% | 4.7038 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 65.8245 | 10.00% | 6.5824 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 0.0000 | 14.00% | 0.0000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 22.8114 | 18.00% | 4.1061 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **31.0630** minus penalties **0.0000** = final **31.0630**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 78.3345 | 20.00% | 15.6669 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 96.9330 | 6.00% | 5.8160 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **50.4029**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.3900`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 3.820714285714282, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 3.820714285714282, "close": 186.99, "level": "LOW", "move_atr": 0.39, "session_open": 185.5, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 62.377, "screening_level": "LOW", "selected": 62.377, "short": 31.063} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 50.4029} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.8235294117647058, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 31.314, "edge": 31.314, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 17. MAXHEALTH

| Decision field | Actual value |
|---|---|
| Opportunity rank | 17 |
| Execution-readiness rank | 19 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | ALIGNED |
| Session-direction score | -34.9030 |
| OFactor final | 62.3647 |
| OFactor tier | LOW |
| LONG OFactor | 37.6353 |
| SHORT OFactor | 62.3647 |
| Directional edge LONG minus SHORT | -24.7294 |
| Directional-edge tier | HIGH |
| XFactor final | 51.3744 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 24.4429 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.0505 |
| close_price | 1,058.0000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,067.4000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,057.5000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,065.4000 |
| prev_close | 1,069.0000 |
| prior_high_20 | 1,135.9000 |
| prior_low_20 | 1,054.3000 |
| return_1d_pct | -1.0290 |
| return_21d_pct | -4.3573 |
| return_5d_pct | -1.7642 |
| return_63d_pct | 0.8051 |
| rsi_14 | 39.9791 |
| sector_return_21d_pct | -1.1119 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 1,065.4000 |
| session_volume | 7,478.0000 |
| session_vwap | 1,063.7156 |
| sma20 | 1,092.7500 |
| sma50 | 1,077.4480 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | MAXHEALTH |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.8200 |
| vix_regime | LOW |
| volume_ratio_20 | 0.3372 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 24.4429 |
| close | 1,058.0000 |
| close_vs_ema61_pct | -1.3694 |
| ema61 | 1,073.1788 |
| high | 1,067.4000 |
| low | 1,057.5000 |
| macd_line | -5.2209 |
| move_atr | 0.3027 |
| open | 1,065.4000 |
| previous_close | 1,069.0000 |
| prior_high_20 | 1,135.9000 |
| prior_low_20 | 1,054.3000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 39.9791 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | 1,063.7156 |
| sma20 | 1,092.7500 |
| sma50 | 1,077.4480 |
| turnover_lacs | 79.1172 |
| turnover_percentile | 0.8200 |
| volume_average_20 | 22,179.5500 |
| volume_current | 7,478.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.3372 |
| vwap_distance_atr | 0.2338 |
| willr14 | -95.4657 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 33.6564 | 18.00% | 6.0581 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 32.6285 | 12.00% | 3.9154 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 14.8582 | 10.00% | 1.4858 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 21.5253 | 14.00% | 3.0135 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 14.7393 | 18.00% | 2.6531 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **37.6353** minus penalties **0.0000** = final **37.6353**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 66.3436 | 18.00% | 11.9419 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 67.3715 | 12.00% | 8.0846 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 85.1418 | 10.00% | 8.5142 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 78.4746 | 14.00% | 10.9865 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 51.9274 | 18.00% | 9.3469 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **62.3647** minus penalties **0.0000** = final **62.3647**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 83.1807 | 20.00% | 16.6361 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 42.3043 | 6.00% | 2.5383 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **51.3744**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.3027`; VWAP-distance ATR `0.2338`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 24.44285714285718, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 24.44285714285718, "close": 1058.0, "level": "LOW", "move_atr": 0.3027, "session_open": 1065.4, "session_vwap": 1063.7155522867076, "vwap_distance_atr": 0.2338} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 37.6353, "screening_level": "LOW", "selected": 62.3647, "short": 62.3647} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 51.3744} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.82, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.3371574265483294} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 24.7294, "edge": -24.7294, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 18. NTPC

| Decision field | Actual value |
|---|---|
| Opportunity rank | 18 |
| Execution-readiness rank | 25 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | ALIGNED |
| Session-direction score | -20.3171 |
| OFactor final | 61.0844 |
| OFactor tier | LOW |
| LONG OFactor | 32.3556 |
| SHORT OFactor | 61.0844 |
| Directional edge LONG minus SHORT | -28.7288 |
| Directional-edge tier | HIGH |
| XFactor final | 50.1207 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 5.9143 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.0833 |
| close_price | 338.7000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 339.8000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 338.6000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 339.6000 |
| prev_close | 340.4500 |
| prior_high_20 | 353.9500 |
| prior_low_20 | 337.1500 |
| return_1d_pct | -0.5140 |
| return_21d_pct | -3.7100 |
| return_5d_pct | -1.4404 |
| return_63d_pct | -14.5344 |
| rsi_14 | 38.9753 |
| sector_return_21d_pct | -4.8795 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 339.6000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 346.0725 |
| sma50 | 352.4680 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | NTPC |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 5.9143 |
| close | 338.7000 |
| close_vs_ema61_pct | -5.0208 |
| ema61 | 357.2010 |
| high | 339.8000 |
| low | 338.6000 |
| macd_line | -3.2752 |
| move_atr | 0.1522 |
| open | 339.6000 |
| previous_close | 340.4500 |
| prior_high_20 | 353.9500 |
| prior_low_20 | 337.1500 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 38.9753 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 346.0725 |
| sma50 | 352.4680 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 98,605.3000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -90.2208 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 21.8825 | 18.00% | 3.9389 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 32.9736 | 12.00% | 3.9568 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 28.6546 | 10.00% | 2.8655 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 9.7516 | 14.00% | 1.3652 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.6667 | 18.00% | 3.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **32.3556** minus penalties **0.0000** = final **32.3556**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 78.1175 | 18.00% | 14.0611 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 67.0264 | 12.00% | 8.0432 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 71.3454 | 10.00% | 7.1345 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 90.2484 | 14.00% | 12.6348 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.0000 | 18.00% | 9.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **61.0844** minus penalties **0.0000** = final **61.0844**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 91.5459 | 20.00% | 18.3092 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 48.1913 | 6.00% | 2.8915 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **50.1207**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1522`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 5.914285714285703, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 5.914285714285703, "close": 338.7, "level": "LOW", "move_atr": 0.1522, "session_open": 339.6, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 32.3556, "screening_level": "LOW", "selected": 61.0844, "short": 61.0844} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 50.1207} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 28.7288, "edge": -28.7288, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 19. MARUTI

| Decision field | Actual value |
|---|---|
| Opportunity rank | 19 |
| Execution-readiness rank | 3 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | -9.9307 |
| OFactor final | 60.8195 |
| OFactor tier | LOW |
| LONG OFactor | 60.8195 |
| SHORT OFactor | 36.6269 |
| Directional edge LONG minus SHORT | 24.1926 |
| Directional-edge tier | HIGH |
| XFactor final | 56.1913 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.8667 |
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
| atr14 | 264.6429 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.3448 |
| close_price | 14,082.0000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 14,120.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 14,062.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 14,120.0000 |
| prev_close | 14,097.0000 |
| prior_high_20 | 14,440.0000 |
| prior_low_20 | 13,197.0000 |
| return_1d_pct | -0.1064 |
| return_21d_pct | 2.8258 |
| return_5d_pct | -0.6070 |
| return_63d_pct | 7.7017 |
| rsi_14 | 56.1214 |
| sector_return_21d_pct | 8.0416 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_open_price | 14,120.0000 |
| session_volume | 3,194.0000 |
| session_vwap | 14,098.9305 |
| sma20 | 13,839.1500 |
| sma50 | 13,700.1000 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | MARUTI |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.9600 |
| vix_regime | LOW |
| volume_ratio_20 | 0.8058 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 264.6429 |
| close | 14,082.0000 |
| close_vs_ema61_pct | 2.3488 |
| ema61 | 13,748.0593 |
| high | 14,120.0000 |
| low | 14,062.0000 |
| macd_line | 114.8649 |
| move_atr | 0.1436 |
| open | 14,120.0000 |
| previous_close | 14,097.0000 |
| prior_high_20 | 14,440.0000 |
| prior_low_20 | 13,197.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 56.1214 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_vwap | 14,098.9305 |
| sma20 | 13,839.1500 |
| sma50 | 13,700.1000 |
| turnover_lacs | 449.7791 |
| turnover_percentile | 0.9600 |
| volume_average_20 | 3,963.7500 |
| volume_current | 3,194.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.8058 |
| vwap_distance_atr | 0.0640 |
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
| session_bar_coverage | 0.8667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 2.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 68.7050 | 18.00% | 12.3669 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 53.5922 | 12.00% | 6.4311 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 26.0819 | 10.00% | 2.6082 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 92.3603 | 14.00% | 12.9304 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 33.1871 | 18.00% | 5.9737 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **60.8195** minus penalties **0.0000** = final **60.8195**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 31.2950 | 18.00% | 5.6331 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 46.4078 | 12.00% | 5.5689 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 73.9180 | 10.00% | 7.3918 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 7.6396 | 14.00% | 1.0696 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 47.0708 | 18.00% | 8.4727 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **41.6269** minus penalties **5.0000** = final **36.6269**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 92.0228 | 20.00% | 18.4046 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 93.1131 | 6.00% | 5.5868 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **56.1913**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1436`; VWAP-distance ATR `0.0640`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 264.64285714285717, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 264.64285714285717, "close": 14082.0, "level": "LOW", "move_atr": 0.1436, "session_open": 14120.0, "session_vwap": 14098.93049467752, "vwap_distance_atr": 0.064} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 60.8195, "screening_level": "LOW", "selected": 60.8195, "short": 36.6269} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 56.1913} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.96, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.8058025859350363} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 24.1926, "edge": 24.1926, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 20. HINDALCO

| Decision field | Actual value |
|---|---|
| Opportunity rank | 20 |
| Execution-readiness rank | 17 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | -1.7732 |
| OFactor final | 59.8805 |
| OFactor tier | LOW |
| LONG OFactor | 59.8805 |
| SHORT OFactor | 33.5595 |
| Directional edge LONG minus SHORT | 26.3210 |
| Directional-edge tier | HIGH |
| XFactor final | 51.4949 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 21.6714 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.2611 |
| close_price | 1,056.1500 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,064.5000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,053.2000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,053.2000 |
| prev_close | 1,054.0500 |
| prior_high_20 | 1,068.3500 |
| prior_low_20 | 935.1000 |
| return_1d_pct | 0.1992 |
| return_21d_pct | 9.2362 |
| return_5d_pct | 3.5441 |
| return_63d_pct | -4.2735 |
| rsi_14 | 68.5529 |
| sector_return_21d_pct | 2.6967 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 1,053.2000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 978.2850 |
| sma50 | 995.6380 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | HINDALCO |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 21.6714 |
| close | 1,056.1500 |
| close_vs_ema61_pct | 5.7728 |
| ema61 | 996.5865 |
| high | 1,064.5000 |
| low | 1,053.2000 |
| macd_line | 18.7414 |
| move_atr | 0.1361 |
| open | 1,053.2000 |
| previous_close | 1,054.0500 |
| prior_high_20 | 1,068.3500 |
| prior_low_20 | 935.1000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 68.5529 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 978.2850 |
| sma50 | 995.6380 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 109,516.4500 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -9.1557 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 79.0359 | 18.00% | 14.2265 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 83.3201 | 12.00% | 9.9984 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 82.8494 | 10.00% | 8.2849 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 42.3817 | 14.00% | 5.9334 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 23.3776 | 18.00% | 4.2080 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **59.8805** minus penalties **0.0000** = final **59.8805**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 20.9641 | 18.00% | 3.7735 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 16.6799 | 12.00% | 2.0016 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 17.1506 | 10.00% | 1.7151 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 57.6183 | 14.00% | 8.0666 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 43.2891 | 18.00% | 7.7920 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **33.5595** minus penalties **0.0000** = final **33.5595**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 92.4376 | 20.00% | 18.4875 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 68.1238 | 6.00% | 4.0874 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **51.4949**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1361`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 21.671428571428546, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 21.671428571428546, "close": 1056.15, "level": "LOW", "move_atr": 0.1361, "session_open": 1053.2, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 59.8805, "screening_level": "LOW", "selected": 59.8805, "short": 33.5595} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 51.4949} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 26.321, "edge": 26.321, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 21. HINDUNILVR

| Decision field | Actual value |
|---|---|
| Opportunity rank | 21 |
| Execution-readiness rank | 12 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | SHORT |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | -11.3065 |
| OFactor final | 59.6987 |
| OFactor tier | LOW |
| LONG OFactor | 42.3010 |
| SHORT OFactor | 59.6987 |
| Directional edge LONG minus SHORT | -17.3977 |
| Directional-edge tier | HIGH |
| XFactor final | 52.9471 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 48.3429 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.3727 |
| close_price | 2,079.1000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 2,086.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 2,075.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 2,086.0000 |
| prev_close | 2,087.2000 |
| prior_high_20 | 2,213.0000 |
| prior_low_20 | 2,016.0000 |
| return_1d_pct | -0.3881 |
| return_21d_pct | -2.4172 |
| return_5d_pct | -0.8300 |
| return_63d_pct | -7.5421 |
| rsi_14 | 43.5012 |
| sector_return_21d_pct | 1.0780 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 2,086.0000 |
| session_volume | 12,822.0000 |
| session_vwap | 2,078.6135 |
| sma20 | 2,115.7700 |
| sma50 | 2,141.5020 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | HINDUNILVR |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.9000 |
| vix_regime | LOW |
| volume_ratio_20 | 0.7500 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 48.3429 |
| close | 2,079.1000 |
| close_vs_ema61_pct | -3.3896 |
| ema61 | 2,154.4783 |
| high | 2,086.0000 |
| low | 2,075.0000 |
| macd_line | -18.7163 |
| move_atr | 0.1427 |
| open | 2,086.0000 |
| previous_close | 2,087.2000 |
| prior_high_20 | 2,213.0000 |
| prior_low_20 | 2,016.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 43.5012 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | 2,078.6135 |
| sma20 | 2,115.7700 |
| sma50 | 2,141.5020 |
| turnover_lacs | 266.5822 |
| turnover_percentile | 0.9000 |
| volume_average_20 | 17,096.7500 |
| volume_current | 12,822.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.8235 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.7500 |
| vwap_distance_atr | 0.0101 |
| willr14 | -67.9695 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 31.9627 | 18.00% | 5.7533 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 40.0431 | 12.00% | 4.8052 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 15.0744 | 10.00% | 1.5074 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 28.3686 | 14.00% | 3.9716 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 31.9682 | 18.00% | 5.7543 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **42.3010** minus penalties **0.0000** = final **42.3010**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 68.0373 | 18.00% | 12.2467 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 59.9569 | 12.00% | 7.1948 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 84.9256 | 10.00% | 8.4926 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 71.6314 | 14.00% | 10.0284 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 45.8081 | 18.00% | 8.2455 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **59.6987** minus penalties **0.0000** = final **59.6987**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 92.0705 | 20.00% | 18.4141 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 38.8828 | 6.00% | 2.3330 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **52.9471**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1427`; VWAP-distance ATR `0.0101`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 48.342857142857206, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 48.342857142857206, "close": 2079.1, "level": "LOW", "move_atr": 0.1427, "session_open": 2086.0, "session_vwap": 2078.6134612384963, "vwap_distance_atr": 0.0101} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 42.301, "screening_level": "LOW", "selected": 59.6987, "short": 59.6987} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 52.9471} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.9, "volume_level": "HIGH", "volume_percentile_90": 0.8235294117647058, "volume_ratio_20": 0.7499670990100458} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 17.3977, "edge": -17.3977, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 22. BAJAJFINSV

| Decision field | Actual value |
|---|---|
| Opportunity rank | 22 |
| Execution-readiness rank | 23 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | LONG |
| Resolved actionable direction | LONG |
| Direction state | ALIGNED |
| Session-direction score | 32.7703 |
| OFactor final | 59.4532 |
| OFactor tier | LOW |
| LONG OFactor | 59.4532 |
| SHORT OFactor | 28.9868 |
| Directional edge LONG minus SHORT | 30.4664 |
| Directional-edge tier | HIGH |
| XFactor final | 50.1858 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.8667 |
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
| atr14 | 49.7929 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.9697 |
| close_price | 2,025.5000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 2,025.9000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 2,012.7000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 2,015.0000 |
| prev_close | 2,021.3000 |
| prior_high_20 | 2,118.5000 |
| prior_low_20 | 1,822.0000 |
| return_1d_pct | 0.2078 |
| return_21d_pct | 6.1527 |
| return_5d_pct | -3.7767 |
| return_63d_pct | 16.3947 |
| rsi_14 | 61.2556 |
| sector_return_21d_pct | 0.4571 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_open_price | 2,015.0000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,946.1500 |
| sma50 | 1,845.9280 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | BAJAJFINSV |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 49.7929 |
| close | 2,025.5000 |
| close_vs_ema61_pct | 7.5360 |
| ema61 | 1,878.8230 |
| high | 2,025.9000 |
| low | 2,012.7000 |
| macd_line | 57.0329 |
| move_atr | 0.2109 |
| open | 2,015.0000 |
| previous_close | 2,021.3000 |
| prior_high_20 | 2,118.5000 |
| prior_low_20 | 1,822.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 61.2556 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,946.1500 |
| sma50 | 1,845.9280 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 10,302.0000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -36.2998 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.8667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 2.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 94.4668 | 18.00% | 17.0040 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 45.5192 | 12.00% | 5.4623 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 70.5762 | 10.00% | 7.0576 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 26.4286 | 14.00% | 3.7000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.0000 | 18.00% | 9.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **59.4532** minus penalties **0.0000** = final **59.4532**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 5.5332 | 18.00% | 0.9960 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 54.4808 | 12.00% | 6.5377 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 29.4238 | 10.00% | 2.9424 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 73.5714 | 14.00% | 10.3000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.6667 | 18.00% | 3.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **33.9868** minus penalties **5.0000** = final **28.9868**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 88.2848 | 20.00% | 17.6570 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 60.1472 | 6.00% | 3.6088 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **50.1858**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2109`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 49.79285714285715, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 49.79285714285715, "close": 2025.5, "level": "LOW", "move_atr": 0.2109, "session_open": 2015.0, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 59.4532, "screening_level": "LOW", "selected": 59.4532, "short": 28.9868} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 50.1858} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 30.4664, "edge": 30.4664, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 23. JSWSTEEL

| Decision field | Actual value |
|---|---|
| Opportunity rank | 23 |
| Execution-readiness rank | 4 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | 2.9251 |
| OFactor final | 58.0323 |
| OFactor tier | LOW |
| LONG OFactor | 58.0323 |
| SHORT OFactor | 41.6476 |
| Directional edge LONG minus SHORT | 16.3847 |
| Directional-edge tier | HIGH |
| XFactor final | 55.7107 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 26.6643 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.6034 |
| close_price | 1,300.0000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,302.3000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,296.5000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,299.0000 |
| prev_close | 1,302.0000 |
| prior_high_20 | 1,335.0000 |
| prior_low_20 | 1,218.0000 |
| return_1d_pct | -0.1536 |
| return_21d_pct | 5.0590 |
| return_5d_pct | 0.0000 |
| return_63d_pct | 0.2390 |
| rsi_14 | 58.9944 |
| sector_return_21d_pct | 2.6967 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 1,299.0000 |
| session_volume | 4,623.0000 |
| session_vwap | 1,299.8531 |
| sma20 | 1,267.6200 |
| sma50 | 1,262.7480 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | JSWSTEEL |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.7800 |
| vix_regime | LOW |
| volume_ratio_20 | 0.3365 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 26.6643 |
| close | 1,300.0000 |
| close_vs_ema61_pct | 2.8803 |
| ema61 | 1,262.3915 |
| high | 1,302.3000 |
| low | 1,296.5000 |
| macd_line | 15.0872 |
| move_atr | 0.0375 |
| open | 1,299.0000 |
| previous_close | 1,302.0000 |
| prior_high_20 | 1,335.0000 |
| prior_low_20 | 1,218.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 58.9944 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | 1,299.8531 |
| sma20 | 1,267.6200 |
| sma50 | 1,262.7480 |
| turnover_lacs | 60.0990 |
| turnover_percentile | 0.7800 |
| volume_average_20 | 13,738.4500 |
| volume_current | 4,623.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.3365 |
| vwap_distance_atr | 0.0055 |
| willr14 | -32.7409 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 68.1774 | 18.00% | 12.2719 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 58.9945 | 12.00% | 7.0793 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 56.7420 | 10.00% | 5.6742 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 97.3333 | 6.00% | 5.8400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 42.3817 | 14.00% | 5.9334 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 37.3565 | 18.00% | 6.7242 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **58.0323** minus penalties **0.0000** = final **58.0323**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 31.8225 | 18.00% | 5.7281 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 41.0055 | 12.00% | 4.9207 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 43.2580 | 10.00% | 4.3258 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 97.3333 | 6.00% | 5.8400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 57.6183 | 14.00% | 8.0666 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 29.3102 | 18.00% | 5.2758 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **41.6476** minus penalties **0.0000** = final **41.6476**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 97.9165 | 20.00% | 19.5833 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 97.3333 | 6.00% | 5.8400 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 68.1238 | 6.00% | 4.0874 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **55.7107**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.0375`; VWAP-distance ATR `0.0055`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 26.66428571428571, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 26.66428571428571, "close": 1300.0, "level": "LOW", "move_atr": 0.0375, "session_open": 1299.0, "session_vwap": 1299.8531473069436, "vwap_distance_atr": 0.0055} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 58.0323, "screening_level": "LOW", "selected": 58.0323, "short": 41.6476} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 55.7107} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.78, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.33650084252590357} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 16.3847, "edge": 16.3847, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 24. TMPV

| Decision field | Actual value |
|---|---|
| Opportunity rank | 24 |
| Execution-readiness rank | 6 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | 8.9227 |
| OFactor final | 55.6278 |
| OFactor tier | LOW |
| LONG OFactor | 55.6278 |
| SHORT OFactor | 32.8122 |
| Directional edge LONG minus SHORT | 22.8156 |
| Directional-edge tier | HIGH |
| XFactor final | 54.0815 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| close_location | 0.5000 |
| close_price | 346.2500 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 347.6500 |
| is_intraday_snapshot | 1.0000 |
| low_price | 344.8500 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 346.0000 |
| prev_close | 347.1000 |
| prior_high_20 | 353.2000 |
| prior_low_20 | 318.2500 |
| return_1d_pct | -0.2161 |
| return_21d_pct | 2.4560 |
| return_5d_pct | -0.8732 |
| return_63d_pct | 2.7906 |
| rsi_14 | 54.2103 |
| sector_return_21d_pct | 8.0416 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 346.0000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 335.8925 |
| sma50 | 353.7100 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | TMPV |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 6.5321 |
| close | 346.2500 |
| close_vs_ema61_pct | -0.5308 |
| ema61 | 348.1592 |
| high | 347.6500 |
| low | 344.8500 |
| macd_line | 0.0175 |
| move_atr | 0.0383 |
| open | 346.0000 |
| previous_close | 347.1000 |
| prior_high_20 | 353.2000 |
| prior_low_20 | 318.2500 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 54.2103 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 335.8925 |
| sma50 | 353.7100 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 104,079.2000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -19.8856 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 61.2356 | 18.00% | 11.0224 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 50.5721 | 12.00% | 6.0687 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 23.7703 | 10.00% | 2.3770 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 92.3603 | 14.00% | 12.9304 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 33.3333 | 18.00% | 6.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **55.6278** minus penalties **0.0000** = final **55.6278**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 38.7644 | 18.00% | 6.9776 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 49.4279 | 12.00% | 5.9313 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 76.2297 | 10.00% | 7.6230 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 7.6396 | 14.00% | 1.0696 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 33.3333 | 18.00% | 6.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **37.8122** minus penalties **5.0000** = final **32.8122**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 97.8738 | 20.00% | 19.5748 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 93.1131 | 6.00% | 5.5868 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **54.0815**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.0383`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 6.532145857142861, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 6.532145857142861, "close": 346.25, "level": "LOW", "move_atr": 0.0383, "session_open": 346.0, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 55.6278, "screening_level": "LOW", "selected": 55.6278, "short": 32.8122} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 54.0815} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 22.8156, "edge": 22.8156, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 25. SBILIFE

| Decision field | Actual value |
|---|---|
| Opportunity rank | 25 |
| Execution-readiness rank | 39 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | ALIGNED |
| Session-direction score | -49.9619 |
| OFactor final | 54.4227 |
| OFactor tier | LOW |
| LONG OFactor | 39.0173 |
| SHORT OFactor | 54.4227 |
| Directional edge LONG minus SHORT | -15.4054 |
| Directional-edge tier | HIGH |
| XFactor final | 43.4808 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.8667 |
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
| atr14 | 38.0286 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.0429 |
| close_price | 1,839.2000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,866.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,838.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,866.0000 |
| prev_close | 1,855.0000 |
| prior_high_20 | 1,915.0000 |
| prior_low_20 | 1,797.0000 |
| return_1d_pct | -0.8518 |
| return_21d_pct | -0.8998 |
| return_5d_pct | -3.1490 |
| return_63d_pct | -1.4732 |
| rsi_14 | 47.2398 |
| sector_return_21d_pct | 0.4571 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_open_price | 1,866.0000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,860.2800 |
| sma50 | 1,812.7760 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | SBILIFE |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 38.0286 |
| close | 1,839.2000 |
| close_vs_ema61_pct | -0.2223 |
| ema61 | 1,843.4348 |
| high | 1,866.0000 |
| low | 1,838.0000 |
| macd_line | 11.7198 |
| move_atr | 0.7047 |
| open | 1,866.0000 |
| previous_close | 1,855.0000 |
| prior_high_20 | 1,915.0000 |
| prior_low_20 | 1,797.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 47.2398 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,860.2800 |
| sma50 | 1,812.7760 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 6,959.3000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -65.9130 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.8667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 2.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 46.3555 | 18.00% | 8.3440 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 34.1188 | 12.00% | 4.0943 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 26.4977 | 10.00% | 2.6498 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 26.4286 | 14.00% | 3.7000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.6667 | 18.00% | 3.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **39.0173** minus penalties **0.0000** = final **39.0173**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 53.6445 | 18.00% | 9.6560 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 65.8812 | 12.00% | 7.9057 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 73.5023 | 10.00% | 7.3502 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 73.5714 | 14.00% | 10.3000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.0000 | 18.00% | 9.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **54.4227** minus penalties **0.0000** = final **54.4227**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 60.8482 | 20.00% | 12.1696 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 39.8528 | 6.00% | 2.3912 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **43.4808**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.7047`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 38.02857142857145, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 38.02857142857145, "close": 1839.2, "level": "LOW", "move_atr": 0.7047, "session_open": 1866.0, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 39.0173, "screening_level": "LOW", "selected": 54.4227, "short": 54.4227} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 43.4808} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 15.4054, "edge": -15.4054, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 26. TATACONSUM

| Decision field | Actual value |
|---|---|
| Opportunity rank | 26 |
| Execution-readiness rank | 28 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | ALIGNED |
| Session-direction score | -49.6494 |
| OFactor final | 54.2784 |
| OFactor tier | LOW |
| LONG OFactor | 39.1616 |
| SHORT OFactor | 54.2784 |
| Directional edge LONG minus SHORT | -15.1168 |
| Directional-edge tier | HIGH |
| XFactor final | 49.5609 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 24.8857 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.0110 |
| close_price | 1,090.8000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,108.7000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,090.6000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,108.7000 |
| prev_close | 1,108.7000 |
| prior_high_20 | 1,123.4000 |
| prior_low_20 | 1,071.1000 |
| return_1d_pct | -1.6145 |
| return_21d_pct | -0.7100 |
| return_5d_pct | -0.1099 |
| return_63d_pct | -11.1943 |
| rsi_14 | 47.7264 |
| sector_return_21d_pct | 1.0780 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 1,108.7000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,093.3200 |
| sma50 | 1,105.7060 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | TATACONSUM |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 24.8857 |
| close | 1,090.8000 |
| close_vs_ema61_pct | -1.8481 |
| ema61 | 1,112.0237 |
| high | 1,108.7000 |
| low | 1,090.6000 |
| macd_line | -3.8214 |
| move_atr | 0.7193 |
| open | 1,108.7000 |
| previous_close | 1,108.7000 |
| prior_high_20 | 1,123.4000 |
| prior_low_20 | 1,071.1000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 47.7264 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,093.3200 |
| sma50 | 1,105.7060 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 7,806.8500 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.8235 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -71.8062 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 37.3007 | 18.00% | 6.7141 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 47.2685 | 12.00% | 5.6722 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 25.7442 | 10.00% | 2.5744 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 28.3686 | 14.00% | 3.9716 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.6667 | 18.00% | 3.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **39.1616** minus penalties **0.0000** = final **39.1616**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 62.6993 | 18.00% | 11.2859 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 52.7315 | 12.00% | 6.3278 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 74.2558 | 10.00% | 7.4256 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 71.6314 | 14.00% | 10.0284 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.0000 | 18.00% | 9.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **54.2784** minus penalties **0.0000** = final **54.2784**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 55.0000 | 18.00% | 9.9000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 60.0395 | 20.00% | 12.0079 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 38.8828 | 6.00% | 2.3330 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **49.5609**. Setup `PULLBACK_CONTINUATION` / state `AWAITING_VOLUME`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.7193`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 24.885714285714307, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["VOLUME_NOT_CONFIRMED"], "setup_type": "PULLBACK_CONTINUATION", "state": "AWAITING_VOLUME", "structural_stop": 1108.7, "trigger_price": 1090.8, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 24.885714285714307, "close": 1090.8, "level": "LOW", "move_atr": 0.7193, "session_open": 1108.7, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 39.1616, "screening_level": "LOW", "selected": 54.2784, "short": 54.2784} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 49.5609} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.8235294117647058, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 15.1168, "edge": -15.1168, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 27. ADANIENT

| Decision field | Actual value |
|---|---|
| Opportunity rank | 27 |
| Execution-readiness rank | 40 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | ALIGNED |
| Session-direction score | -39.1617 |
| OFactor final | 53.7930 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 39.6470 |
| SHORT OFactor | 53.7930 |
| Directional edge LONG minus SHORT | -14.1460 |
| Directional-edge tier | HIGH |
| XFactor final | 42.4793 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.8667 |
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
| atr14 | 62.6500 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.1664 |
| close_price | 3,014.9000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 3,062.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 3,005.5000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 3,062.0000 |
| prev_close | 3,010.0000 |
| prior_high_20 | 3,219.7000 |
| prior_low_20 | 2,969.9000 |
| return_1d_pct | 0.1628 |
| return_21d_pct | -5.1172 |
| return_5d_pct | -1.1508 |
| return_63d_pct | 11.1320 |
| rsi_14 | 45.4332 |
| sector_return_21d_pct | 2.6967 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_open_price | 3,062.0000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 3,077.3850 |
| sma50 | 3,050.8520 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | ADANIENT |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 62.6500 |
| close | 3,014.9000 |
| close_vs_ema61_pct | 2.4587 |
| ema61 | 2,940.1384 |
| high | 3,062.0000 |
| low | 3,005.5000 |
| macd_line | -10.6174 |
| move_atr | 0.7518 |
| open | 3,062.0000 |
| previous_close | 3,010.0000 |
| prior_high_20 | 3,219.7000 |
| prior_low_20 | 2,969.9000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 45.4332 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 3,077.3850 |
| sma50 | 3,050.8520 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 27,071.1000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.8235 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -74.6050 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.8667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 2.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 44.7318 | 18.00% | 8.0517 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 40.6381 | 12.00% | 4.8766 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 0.5816 | 10.00% | 0.0582 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 42.3817 | 14.00% | 5.9334 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 19.4322 | 18.00% | 3.4978 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **39.6470** minus penalties **0.0000** = final **39.6470**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 55.2682 | 18.00% | 9.9483 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 59.3619 | 12.00% | 7.1234 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 99.4184 | 10.00% | 9.9418 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 57.6183 | 14.00% | 8.0666 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 47.2345 | 18.00% | 8.5022 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **53.7930** minus penalties **0.0000** = final **53.7930**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 58.2336 | 20.00% | 11.6467 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 31.8762 | 6.00% | 1.9126 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **42.4793**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.7518`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 62.650000000000055, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 62.650000000000055, "close": 3014.9, "level": "LOW", "move_atr": 0.7518, "session_open": 3062.0, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 39.647, "screening_level": "BELOW_MINIMUM", "selected": 53.793, "short": 53.793} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 42.4793} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.8235294117647058, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 14.146, "edge": -14.146, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 28. SBIN

| Decision field | Actual value |
|---|---|
| Opportunity rank | 28 |
| Execution-readiness rank | 26 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | -10.4660 |
| OFactor final | 53.0068 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 53.0068 |
| SHORT OFactor | 40.4332 |
| Directional edge LONG minus SHORT | 12.5736 |
| Directional-edge tier | HIGH |
| XFactor final | 49.9481 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 21.9571 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.4950 |
| close_price | 1,065.9000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,071.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,060.9000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,071.0000 |
| prev_close | 1,071.0000 |
| prior_high_20 | 1,124.5000 |
| prior_low_20 | 1,000.8000 |
| return_1d_pct | -0.4762 |
| return_21d_pct | 2.7869 |
| return_5d_pct | 2.2250 |
| return_63d_pct | 8.7764 |
| rsi_14 | 57.7763 |
| sector_return_21d_pct | 0.4571 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 1,071.0000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,038.7050 |
| sma50 | 1,027.6900 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | SBIN |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 21.9571 |
| close | 1,065.9000 |
| close_vs_ema61_pct | 2.7355 |
| ema61 | 1,036.5729 |
| high | 1,071.0000 |
| low | 1,060.9000 |
| macd_line | 12.2113 |
| move_atr | 0.2323 |
| open | 1,071.0000 |
| previous_close | 1,071.0000 |
| prior_high_20 | 1,124.5000 |
| prior_low_20 | 1,000.8000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 57.7763 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,038.7050 |
| sma50 | 1,027.6900 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 131,558.5000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -47.3727 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 72.8611 | 18.00% | 13.1150 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 67.0471 | 12.00% | 8.0457 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 49.5397 | 10.00% | 4.9540 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 26.4286 | 14.00% | 3.7000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 33.1271 | 18.00% | 5.9629 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **53.0068** minus penalties **0.0000** = final **53.0068**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 27.1389 | 18.00% | 4.8850 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 32.9529 | 12.00% | 3.9543 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 50.4603 | 10.00% | 5.0460 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 73.5714 | 14.00% | 10.3000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 33.5396 | 18.00% | 6.0371 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **40.4332** minus penalties **0.0000** = final **40.4332**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 87.0961 | 20.00% | 17.4192 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 60.1472 | 6.00% | 3.6088 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **49.9481**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2323`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 21.957142857142838, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 21.957142857142838, "close": 1065.9, "level": "LOW", "move_atr": 0.2323, "session_open": 1071.0, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 53.0068, "screening_level": "BELOW_MINIMUM", "selected": 53.0068, "short": 40.4332} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 49.9481} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 12.5736, "edge": 12.5736, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 29. BEL

| Decision field | Actual value |
|---|---|
| Opportunity rank | 29 |
| Execution-readiness rank | 34 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | ALIGNED |
| Session-direction score | -33.6126 |
| OFactor final | 52.5057 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 35.9343 |
| SHORT OFactor | 52.5057 |
| Directional edge LONG minus SHORT | -16.5714 |
| Directional-edge tier | HIGH |
| XFactor final | 47.5733 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 7.0250 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.0658 |
| close_price | 403.2000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 406.7500 |
| is_intraday_snapshot | 1.0000 |
| low_price | 402.9500 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 405.7000 |
| prev_close | 404.3500 |
| prior_high_20 | 414.3000 |
| prior_low_20 | 382.2000 |
| return_1d_pct | -0.2844 |
| return_21d_pct | -1.8500 |
| return_5d_pct | 2.9885 |
| return_63d_pct | -5.9811 |
| rsi_14 | 51.0023 |
| sector_return_21d_pct | -1.8500 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 405.7000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 400.3775 |
| sma50 | 408.2210 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | BEL |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 7.0250 |
| close | 403.2000 |
| close_vs_ema61_pct | -1.6419 |
| ema61 | 410.1550 |
| high | 406.7500 |
| low | 402.9500 |
| macd_line | -3.2866 |
| move_atr | 0.3559 |
| open | 405.7000 |
| previous_close | 404.3500 |
| prior_high_20 | 414.3000 |
| prior_low_20 | 382.2000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 51.0023 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 400.3775 |
| sma50 | 408.2210 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 437,667.9500 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -20.0000 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 42.3500 | 18.00% | 7.6230 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 63.4544 | 12.00% | 7.6145 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 27.7689 | 10.00% | 2.7769 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 19.2186 | 14.00% | 2.6906 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.6667 | 18.00% | 3.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **40.9343** minus penalties **5.0000** = final **35.9343**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 57.6500 | 18.00% | 10.3770 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 36.5457 | 12.00% | 4.3855 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 72.2311 | 10.00% | 7.2231 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 80.7814 | 14.00% | 11.3094 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.0000 | 18.00% | 9.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **52.5057** minus penalties **0.0000** = final **52.5057**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 80.2293 | 20.00% | 16.0459 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 43.4578 | 6.00% | 2.6075 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **47.5733**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.3559`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 7.024999999999998, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 7.024999999999998, "close": 403.2, "level": "LOW", "move_atr": 0.3559, "session_open": 405.7, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 35.9343, "screening_level": "BELOW_MINIMUM", "selected": 52.5057, "short": 52.5057} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 47.5733} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 16.5714, "edge": -16.5714, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 30. ASIANPAINT

| Decision field | Actual value |
|---|---|
| Opportunity rank | 30 |
| Execution-readiness rank | 9 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | -19.0546 |
| OFactor final | 52.2360 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 52.2360 |
| SHORT OFactor | 36.2040 |
| Directional edge LONG minus SHORT | 16.0320 |
| Directional-edge tier | HIGH |
| XFactor final | 53.4435 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.8667 |
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
| atr14 | 62.3357 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.0762 |
| close_price | 2,737.1000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 2,746.8000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 2,736.3000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 2,742.1000 |
| prev_close | 2,750.0000 |
| prior_high_20 | 2,864.0000 |
| prior_low_20 | 2,579.8999 |
| return_1d_pct | -0.4691 |
| return_21d_pct | 3.2050 |
| return_5d_pct | -1.3658 |
| return_63d_pct | 4.3818 |
| rsi_14 | 52.9450 |
| sector_return_21d_pct | 7.4158 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_open_price | 2,742.1000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 2,717.0650 |
| sma50 | 2,703.7400 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | ASIANPAINT |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 62.3357 |
| close | 2,737.1000 |
| close_vs_ema61_pct | 2.5154 |
| ema61 | 2,667.7006 |
| high | 2,746.8000 |
| low | 2,736.3000 |
| macd_line | 18.9676 |
| move_atr | 0.0802 |
| open | 2,742.1000 |
| previous_close | 2,750.0000 |
| prior_high_20 | 2,864.0000 |
| prior_low_20 | 2,579.8999 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 52.9450 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 2,717.0650 |
| sma50 | 2,703.7400 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 10,708.0000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -52.0295 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.8667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 2.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 62.0451 | 18.00% | 11.1681 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 47.2544 | 12.00% | 5.6705 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 30.4071 | 10.00% | 3.0407 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 86.6239 | 14.00% | 12.1273 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.6667 | 18.00% | 3.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **52.2360** minus penalties **0.0000** = final **52.2360**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 37.9549 | 18.00% | 6.8319 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 52.7456 | 12.00% | 6.3295 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 69.5929 | 10.00% | 6.9593 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 13.3761 | 14.00% | 1.8727 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.0000 | 18.00% | 9.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **41.2040** minus penalties **5.0000** = final **36.2040**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 95.5438 | 20.00% | 19.1088 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 90.2449 | 6.00% | 5.4147 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **53.4435**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.0802`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 62.33571428571434, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 62.33571428571434, "close": 2737.1, "level": "LOW", "move_atr": 0.0802, "session_open": 2742.1, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 52.236, "screening_level": "BELOW_MINIMUM", "selected": 52.236, "short": 36.204} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 53.4435} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 16.032, "edge": 16.032, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 31. LT

| Decision field | Actual value |
|---|---|
| Opportunity rank | 31 |
| Execution-readiness rank | 21 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | -19.9444 |
| OFactor final | 52.1486 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 52.1486 |
| SHORT OFactor | 41.2914 |
| Directional edge LONG minus SHORT | 10.8572 |
| Directional-edge tier | HIGH |
| XFactor final | 50.6530 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 62.2000 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.1590 |
| close_price | 4,054.9000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 4,075.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 4,051.1000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 4,068.9000 |
| prev_close | 4,080.0000 |
| prior_high_20 | 4,080.0000 |
| prior_low_20 | 3,720.0000 |
| return_1d_pct | -0.6152 |
| return_21d_pct | 3.2175 |
| return_5d_pct | 1.6266 |
| return_63d_pct | 2.9058 |
| rsi_14 | 60.1288 |
| sector_return_21d_pct | 3.2175 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 4,068.9000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 3,900.9650 |
| sma50 | 3,992.0920 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | LT |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 62.2000 |
| close | 4,054.9000 |
| close_vs_ema61_pct | 1.9993 |
| ema61 | 3,972.7708 |
| high | 4,075.0000 |
| low | 4,051.1000 |
| macd_line | 28.4660 |
| move_atr | 0.2251 |
| open | 4,068.9000 |
| previous_close | 4,080.0000 |
| prior_high_20 | 4,080.0000 |
| prior_low_20 | 3,720.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 60.1288 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 3,900.9650 |
| sma50 | 3,992.0920 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 21,302.9500 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.8235 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -6.9722 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 69.2807 | 18.00% | 12.4705 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 66.9062 | 12.00% | 8.0287 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 43.6050 | 10.00% | 4.3605 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 47.2647 | 14.00% | 6.6171 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 19.1248 | 18.00% | 3.4425 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **52.1486** minus penalties **0.0000** = final **52.1486**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 30.7193 | 18.00% | 5.5295 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 33.0938 | 12.00% | 3.9713 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 56.3950 | 10.00% | 5.6395 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 52.7353 | 14.00% | 7.3829 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 47.5418 | 18.00% | 8.5575 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **41.2914** minus penalties **0.0000** = final **41.2914**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 87.4955 | 20.00% | 17.4991 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 70.5653 | 6.00% | 4.2339 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **50.6530**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2251`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 62.20000000000001, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 62.20000000000001, "close": 4054.9, "level": "LOW", "move_atr": 0.2251, "session_open": 4068.9, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 52.1486, "screening_level": "BELOW_MINIMUM", "selected": 52.1486, "short": 41.2914} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 50.653} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.8235294117647058, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 10.8572, "edge": 10.8572, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 32. JIOFIN

| Decision field | Actual value |
|---|---|
| Opportunity rank | 32 |
| Execution-readiness rank | 20 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | LONG |
| Direction state | STRUCTURAL_ONLY |
| Session-direction score | -12.1937 |
| OFactor final | 50.5228 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 50.5228 |
| SHORT OFactor | 37.9172 |
| Directional edge LONG minus SHORT | 12.6056 |
| Directional-edge tier | HIGH |
| XFactor final | 50.8539 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 6.6336 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.3889 |
| close_price | 252.9000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 254.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 252.2000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 253.9000 |
| prev_close | 254.0000 |
| prior_high_20 | 268.2000 |
| prior_low_20 | 231.2100 |
| return_1d_pct | -0.4331 |
| return_21d_pct | 4.7595 |
| return_5d_pct | -4.5660 |
| return_63d_pct | 8.0169 |
| rsi_14 | 55.4414 |
| sector_return_21d_pct | 0.4571 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 253.9000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 246.1400 |
| sma50 | 241.1842 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | JIOFIN |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 6.6336 |
| close | 252.9000 |
| close_vs_ema61_pct | 3.5563 |
| ema61 | 243.9254 |
| high | 254.0000 |
| low | 252.2000 |
| macd_line | 5.2332 |
| move_atr | 0.1507 |
| open | 253.9000 |
| previous_close | 254.0000 |
| prior_high_20 | 268.2000 |
| prior_low_20 | 231.2100 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 55.4414 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 246.1400 |
| sma50 | 241.1842 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 157,581.1500 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.8235 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -41.3625 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 77.0555 | 18.00% | 13.8700 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 36.4163 | 12.00% | 4.3700 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 61.8689 | 10.00% | 6.1869 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 26.4286 | 14.00% | 3.7000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 28.7037 | 18.00% | 5.1667 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **50.5228** minus penalties **0.0000** = final **50.5228**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 22.9444 | 18.00% | 4.1300 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 63.5837 | 12.00% | 7.6300 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 38.1311 | 10.00% | 3.8131 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 73.5714 | 14.00% | 10.3000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 37.9630 | 18.00% | 6.8333 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **42.9172** minus penalties **5.0000** = final **37.9172**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 91.6251 | 20.00% | 18.3250 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 60.1472 | 6.00% | 3.6088 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **50.8539**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1507`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 6.633571428571431, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 6.633571428571431, "close": 252.9, "level": "LOW", "move_atr": 0.1507, "session_open": 253.9, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 50.5228, "screening_level": "BELOW_MINIMUM", "selected": 50.5228, "short": 37.9172} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 50.8539} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.8235294117647058, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 12.6056, "edge": 12.6056, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 33. ITC

| Decision field | Actual value |
|---|---|
| Opportunity rank | 33 |
| Execution-readiness rank | 29 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | ALIGNED |
| Session-direction score | -20.6288 |
| OFactor final | 49.7816 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 38.6584 |
| SHORT OFactor | 49.7816 |
| Directional edge LONG minus SHORT | -11.1232 |
| Directional-edge tier | HIGH |
| XFactor final | 49.3156 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 4.8750 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.0937 |
| close_price | 281.1500 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 282.6000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 281.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 282.0000 |
| prev_close | 282.6500 |
| prior_high_20 | 292.5500 |
| prior_low_20 | 275.0000 |
| return_1d_pct | -0.5307 |
| return_21d_pct | 0.5364 |
| return_5d_pct | -2.7163 |
| return_63d_pct | -8.4798 |
| rsi_14 | 43.2807 |
| sector_return_21d_pct | 1.0780 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 282.0000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 283.0950 |
| sma50 | 284.9640 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | ITC |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 4.8750 |
| close | 281.1500 |
| close_vs_ema61_pct | -2.5207 |
| ema61 | 288.6626 |
| high | 282.6000 |
| low | 281.0000 |
| macd_line | -0.3492 |
| move_atr | 0.1744 |
| open | 282.0000 |
| previous_close | 282.6500 |
| prior_high_20 | 292.5500 |
| prior_low_20 | 275.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 43.2807 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 283.0950 |
| sma50 | 284.9640 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 198,402.5500 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -87.6923 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 40.3809 | 18.00% | 7.2686 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 31.9629 | 12.00% | 3.8356 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 33.5341 | 10.00% | 3.3534 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 28.3686 | 14.00% | 3.9716 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.6667 | 18.00% | 3.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **38.6584** minus penalties **0.0000** = final **38.6584**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 59.6191 | 18.00% | 10.7314 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 68.0370 | 12.00% | 8.1644 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 66.4659 | 10.00% | 6.6466 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 71.6314 | 14.00% | 10.0284 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.0000 | 18.00% | 9.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **54.7816** minus penalties **5.0000** = final **49.7816**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 90.3134 | 20.00% | 18.0627 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 38.8828 | 6.00% | 2.3330 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **49.3156**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1744`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 4.875000000000008, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 4.875000000000008, "close": 281.15, "level": "LOW", "move_atr": 0.1744, "session_open": 282.0, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 38.6584, "screening_level": "BELOW_MINIMUM", "selected": 49.7816, "short": 49.7816} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 49.3156} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 11.1232, "edge": -11.1232, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 34. BAJFINANCE

| Decision field | Actual value |
|---|---|
| Opportunity rank | 42 |
| Execution-readiness rank | 14 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | COUNTER_TREND_SHORT |
| Session-direction score | -30.0132 |
| OFactor final | 45.1834 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 55.7645 |
| SHORT OFactor | 45.1834 |
| Directional edge LONG minus SHORT | 10.5811 |
| Directional-edge tier | HIGH |
| XFactor final | 51.8290 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.8667 |
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
| atr14 | 34.1929 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.1748 |
| close_price | 1,088.4000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,096.9000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,086.6000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,096.9000 |
| prev_close | 1,102.2000 |
| prior_high_20 | 1,176.4000 |
| prior_low_20 | 995.2000 |
| return_1d_pct | -1.2520 |
| return_21d_pct | 6.4346 |
| return_5d_pct | -5.2742 |
| return_63d_pct | 19.3225 |
| rsi_14 | 54.2883 |
| sector_return_21d_pct | 0.4571 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_open_price | 1,096.9000 |
| session_volume | 116,029.0000 |
| session_vwap | 1,087.5682 |
| sma20 | 1,074.9750 |
| sma50 | 1,005.9380 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | BAJFINANCE |
| trade_date | 2026-08-11 |
| turnover_percentile | 1.0000 |
| vix_regime | LOW |
| volume_ratio_20 | 1.2435 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 34.1929 |
| close | 1,088.4000 |
| close_vs_ema61_pct | 6.8586 |
| ema61 | 1,016.2137 |
| high | 1,096.9000 |
| low | 1,086.6000 |
| macd_line | 29.2734 |
| move_atr | 0.2486 |
| open | 1,096.9000 |
| previous_close | 1,102.2000 |
| prior_high_20 | 1,176.4000 |
| prior_low_20 | 995.2000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 54.2883 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_vwap | 1,087.5682 |
| sma20 | 1,074.9750 |
| sma50 | 1,005.9380 |
| turnover_lacs | 1,262.8596 |
| turnover_percentile | 1.0000 |
| volume_average_20 | 93,309.4500 |
| volume_current | 116,029.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.8529 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 1.2435 |
| vwap_distance_atr | 0.0243 |
| willr14 | -50.2570 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.8667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 2.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 85.9231 | 18.00% | 15.4662 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 32.3126 | 12.00% | 3.8775 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 72.3379 | 10.00% | 7.2338 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 26.4286 | 14.00% | 3.7000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 27.6540 | 18.00% | 4.9777 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **55.7645** minus penalties **0.0000** = final **55.7645**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 14.0769 | 18.00% | 2.5338 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 67.6874 | 12.00% | 8.1225 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 27.6622 | 10.00% | 2.7662 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 73.5714 | 14.00% | 10.3000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 72.0564 | 18.00% | 12.9702 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **50.1834** minus penalties **5.0000** = final **45.1834**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 86.1894 | 20.00% | 17.2379 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 39.8528 | 6.00% | 2.3912 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **51.8290**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2486`; VWAP-distance ATR `0.0243`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 34.192857142857164, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": true} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 34.192857142857164, "close": 1088.4, "level": "LOW", "move_atr": 0.2486, "session_open": 1096.9, "session_vwap": 1087.5681605460704, "vwap_distance_atr": 0.0243} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 55.7645, "screening_level": "BELOW_MINIMUM", "selected": 45.1834, "short": 45.1834} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 51.829} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 1.0, "volume_level": "HIGH", "volume_percentile_90": 0.8529411764705882, "volume_ratio_20": 1.243486056342632} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 10.5811, "edge": 10.5811, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 35. ULTRACEMCO

| Decision field | Actual value |
|---|---|
| Opportunity rank | 45 |
| Execution-readiness rank | 24 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | COUNTER_TREND_SHORT |
| Session-direction score | -22.5183 |
| OFactor final | 40.4688 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 54.5312 |
| SHORT OFactor | 40.4688 |
| Directional edge LONG minus SHORT | 14.0624 |
| Directional-edge tier | HIGH |
| XFactor final | 50.1667 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 209.2143 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.2000 |
| close_price | 11,974.0000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 12,046.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 11,956.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 12,036.0000 |
| prev_close | 12,038.0000 |
| prior_high_20 | 12,239.0000 |
| prior_low_20 | 11,355.0000 |
| return_1d_pct | -0.5316 |
| return_21d_pct | 3.4828 |
| return_5d_pct | -0.6307 |
| return_63d_pct | 2.4119 |
| rsi_14 | 54.3076 |
| sector_return_21d_pct | 5.0188 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 12,036.0000 |
| session_volume | 768.0000 |
| session_vwap | 12,014.0000 |
| sma20 | 11,927.3500 |
| sma50 | 11,563.1600 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | ULTRACEMCO |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.8400 |
| vix_regime | LOW |
| volume_ratio_20 | 0.3594 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 209.2143 |
| close | 11,974.0000 |
| close_vs_ema61_pct | 2.0148 |
| ema61 | 11,729.6283 |
| high | 12,046.0000 |
| low | 11,956.0000 |
| macd_line | 122.9987 |
| move_atr | 0.2963 |
| open | 12,036.0000 |
| previous_close | 12,038.0000 |
| prior_high_20 | 12,239.0000 |
| prior_low_20 | 11,355.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 54.3076 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | 12,014.0000 |
| sma20 | 11,927.3500 |
| sma50 | 11,563.1600 |
| turnover_lacs | 91.9603 |
| turnover_percentile | 0.8400 |
| volume_average_20 | 2,137.1000 |
| volume_current | 768.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.3594 |
| vwap_distance_atr | 0.1912 |
| willr14 | -48.2696 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 62.8709 | 18.00% | 11.3168 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 51.6797 | 12.00% | 6.2016 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 39.6343 | 10.00% | 3.9634 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 64.1517 | 14.00% | 8.9812 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 19.7719 | 18.00% | 3.5589 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **54.5312** minus penalties **0.0000** = final **54.5312**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 37.1291 | 18.00% | 6.6832 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 48.3203 | 12.00% | 5.7984 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 60.3657 | 10.00% | 6.0366 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 35.8484 | 14.00% | 5.0188 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 46.8948 | 18.00% | 8.4411 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **45.4688** minus penalties **5.0000** = final **40.4688**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 83.5363 | 20.00% | 16.7073 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 20.9913 | 6.00% | 1.2595 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **50.1667**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2963`; VWAP-distance ATR `0.1912`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 209.21428571428572, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 209.21428571428572, "close": 11974.0, "level": "LOW", "move_atr": 0.2963, "session_open": 12036.0, "session_vwap": 12014.0, "vwap_distance_atr": 0.1912} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 54.5312, "screening_level": "BELOW_MINIMUM", "selected": 40.4688, "short": 40.4688} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 50.1667} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.84, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.3593654952973656} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 14.0624, "edge": 14.0624, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 36. NESTLEIND

| Decision field | Actual value |
|---|---|
| Opportunity rank | 46 |
| Execution-readiness rank | 30 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | COUNTER_TREND_SHORT |
| Session-direction score | -31.6169 |
| OFactor final | 40.0247 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 53.4153 |
| SHORT OFactor | 40.0247 |
| Directional edge LONG minus SHORT | 13.3906 |
| Directional-edge tier | HIGH |
| XFactor final | 49.0256 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 40.4071 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.0705 |
| close_price | 1,525.5000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,540.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,524.4000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,533.6000 |
| prev_close | 1,528.6000 |
| prior_high_20 | 1,553.0000 |
| prior_low_20 | 1,405.1000 |
| return_1d_pct | -0.2028 |
| return_21d_pct | 6.9026 |
| return_5d_pct | 0.3618 |
| return_63d_pct | 4.5149 |
| rsi_14 | 62.0339 |
| sector_return_21d_pct | 1.0780 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 1,533.6000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,481.5250 |
| sma50 | 1,442.0020 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | NESTLEIND |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 40.4071 |
| close | 1,525.5000 |
| close_vs_ema61_pct | 5.4803 |
| ema61 | 1,443.5994 |
| high | 1,540.0000 |
| low | 1,524.4000 |
| macd_line | 26.3715 |
| move_atr | 0.2005 |
| open | 1,533.6000 |
| previous_close | 1,528.6000 |
| prior_high_20 | 1,553.0000 |
| prior_low_20 | 1,405.1000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 62.0339 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,481.5250 |
| sma50 | 1,442.0020 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 21,380.8500 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -22.5410 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 79.2064 | 18.00% | 14.2571 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 63.5416 | 12.00% | 7.6250 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 73.3229 | 10.00% | 7.3323 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 28.3686 | 14.00% | 3.9716 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.6667 | 18.00% | 3.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **53.4153** minus penalties **0.0000** = final **53.4153**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 20.7936 | 18.00% | 3.7429 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 36.4584 | 12.00% | 4.3750 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 26.6771 | 10.00% | 2.6677 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 71.6314 | 14.00% | 10.0284 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.0000 | 18.00% | 9.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **40.0247** minus penalties **0.0000** = final **40.0247**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 88.8634 | 20.00% | 17.7727 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 38.8828 | 6.00% | 2.3330 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **49.0256**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2005`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 40.40714285714286, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 40.40714285714286, "close": 1525.5, "level": "LOW", "move_atr": 0.2005, "session_open": 1533.6, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 53.4153, "screening_level": "BELOW_MINIMUM", "selected": 40.0247, "short": 40.0247} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 49.0256} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 13.3906, "edge": 13.3906, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 37. ONGC

| Decision field | Actual value |
|---|---|
| Opportunity rank | 47 |
| Execution-readiness rank | 36 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | SHORT |
| Current-session direction | LONG |
| Resolved actionable direction | LONG |
| Direction state | COUNTER_TREND_LONG |
| Session-direction score | 28.1087 |
| OFactor final | 36.7088 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 36.7088 |
| SHORT OFactor | 51.7312 |
| Directional edge LONG minus SHORT | -15.0224 |
| Directional-edge tier | HIGH |
| XFactor final | 47.4259 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 4.4036 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.7350 |
| close_price | 242.8100 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 243.6500 |
| is_intraday_snapshot | 1.0000 |
| low_price | 240.4800 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 240.8700 |
| prev_close | 239.8400 |
| prior_high_20 | 254.2000 |
| prior_low_20 | 236.0900 |
| return_1d_pct | 1.2383 |
| return_21d_pct | -2.2701 |
| return_5d_pct | 0.3347 |
| return_63d_pct | -19.3054 |
| rsi_14 | 47.9747 |
| sector_return_21d_pct | -1.7603 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 240.8700 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 244.1605 |
| sma50 | 245.9388 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | ONGC |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 4.4036 |
| close | 242.8100 |
| close_vs_ema61_pct | -3.4701 |
| ema61 | 251.8296 |
| high | 243.6500 |
| low | 240.4800 |
| macd_line | -2.1268 |
| move_atr | 0.4406 |
| open | 240.8700 |
| previous_close | 239.8400 |
| prior_high_20 | 254.2000 |
| prior_low_20 | 236.0900 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 47.9747 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 244.1605 |
| sma50 | 245.9388 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 146,176.1000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.8235 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -62.8934 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 30.9800 | 18.00% | 5.5764 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 49.3693 | 12.00% | 5.9243 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 24.8633 | 10.00% | 2.4863 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 19.4990 | 14.00% | 2.7299 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 43.1257 | 18.00% | 7.7626 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **41.7088** minus penalties **5.0000** = final **36.7088**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 69.0200 | 18.00% | 12.4236 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 50.6307 | 12.00% | 6.0757 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 75.1367 | 10.00% | 7.5137 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 80.5010 | 14.00% | 11.2701 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 23.5410 | 18.00% | 4.2374 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **51.7312** minus penalties **0.0000** = final **51.7312**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 75.5249 | 20.00% | 15.1050 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 56.6824 | 6.00% | 3.4009 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **47.4259**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.4406`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 4.403571428571427, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 4.403571428571427, "close": 242.81, "level": "LOW", "move_atr": 0.4406, "session_open": 240.87, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 36.7088, "screening_level": "BELOW_MINIMUM", "selected": 36.7088, "short": 51.7312} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 47.4259} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.8235294117647058, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 15.0224, "edge": -15.0224, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 38. SHRIRAMFIN

| Decision field | Actual value |
|---|---|
| Opportunity rank | 48 |
| Execution-readiness rank | 32 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | COUNTER_TREND_SHORT |
| Session-direction score | -29.4546 |
| OFactor final | 34.4256 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 59.0144 |
| SHORT OFactor | 34.4256 |
| Directional edge LONG minus SHORT | 24.5888 |
| Directional-edge tier | HIGH |
| XFactor final | 48.7450 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 32.9071 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.1264 |
| close_price | 1,125.1000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,132.7000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,124.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,132.7000 |
| prev_close | 1,137.8000 |
| prior_high_20 | 1,153.7000 |
| prior_low_20 | 992.9000 |
| return_1d_pct | -1.1162 |
| return_21d_pct | 7.3466 |
| return_5d_pct | 3.4765 |
| return_63d_pct | 20.3187 |
| rsi_14 | 62.7375 |
| sector_return_21d_pct | 0.4571 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 1,132.7000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,059.2500 |
| sma50 | 1,020.0710 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | SHRIRAMFIN |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 32.9071 |
| close | 1,125.1000 |
| close_vs_ema61_pct | 8.9467 |
| ema61 | 1,029.6268 |
| high | 1,132.7000 |
| low | 1,124.0000 |
| macd_line | 28.4099 |
| move_atr | 0.2310 |
| open | 1,132.7000 |
| previous_close | 1,137.8000 |
| prior_high_20 | 1,153.7000 |
| prior_low_20 | 992.9000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 62.7375 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,059.2500 |
| sma50 | 1,020.0710 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 81,607.1500 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.8235 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -17.7861 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 98.9791 | 18.00% | 17.8162 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 77.2229 | 12.00% | 9.2667 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 78.0382 | 10.00% | 7.8038 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 26.4286 | 14.00% | 3.7000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 17.7682 | 18.00% | 3.1983 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **59.0144** minus penalties **0.0000** = final **59.0144**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 1.0209 | 18.00% | 0.1838 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 22.7771 | 12.00% | 2.7333 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 21.9618 | 10.00% | 2.1962 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 73.5714 | 14.00% | 10.3000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 48.8985 | 18.00% | 8.8017 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **34.4256** minus penalties **0.0000** = final **34.4256**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 87.1693 | 20.00% | 17.4339 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 39.8528 | 6.00% | 2.3912 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **48.7450**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2310`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 32.90714285714289, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 32.90714285714289, "close": 1125.1, "level": "LOW", "move_atr": 0.231, "session_open": 1132.7, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 59.0144, "screening_level": "BELOW_MINIMUM", "selected": 34.4256, "short": 34.4256} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 48.745} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.8235294117647058, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 24.5888, "edge": 24.5888, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 39. GRASIM

| Decision field | Actual value |
|---|---|
| Opportunity rank | 49 |
| Execution-readiness rank | 33 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | COUNTER_TREND_SHORT |
| Session-direction score | -28.5469 |
| OFactor final | 30.9562 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 62.4838 |
| SHORT OFactor | 30.9562 |
| Directional edge LONG minus SHORT | 31.5276 |
| Directional-edge tier | HIGH |
| XFactor final | 47.8757 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.8667 |
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
| atr14 | 76.6857 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.0057 |
| close_price | 3,350.4000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 3,402.8000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 3,350.1000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 3,366.3000 |
| prev_close | 3,380.5000 |
| prior_high_20 | 3,411.1000 |
| prior_low_20 | 3,060.0000 |
| return_1d_pct | -0.8904 |
| return_21d_pct | 6.5547 |
| return_5d_pct | 6.7686 |
| return_63d_pct | 14.0096 |
| rsi_14 | 64.2885 |
| sector_return_21d_pct | 5.0188 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_open_price | 3,366.3000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 3,158.3500 |
| sma50 | 3,143.5760 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | GRASIM |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 76.6857 |
| close | 3,350.4000 |
| close_vs_ema61_pct | 7.5285 |
| ema61 | 3,108.0068 |
| high | 3,402.8000 |
| low | 3,350.1000 |
| macd_line | 49.7325 |
| move_atr | 0.2073 |
| open | 3,366.3000 |
| previous_close | 3,380.5000 |
| prior_high_20 | 3,411.1000 |
| prior_low_20 | 3,060.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 64.2885 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 3,158.3500 |
| sma50 | 3,143.5760 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 8,611.5000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -17.6095 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.8667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 2.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 92.6405 | 18.00% | 16.6753 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 89.2886 | 12.00% | 10.7146 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 58.8336 | 10.00% | 5.8834 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 64.1517 | 14.00% | 8.9812 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.6667 | 18.00% | 3.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **62.4838** minus penalties **0.0000** = final **62.4838**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 7.3595 | 18.00% | 1.3247 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 10.7114 | 12.00% | 1.2854 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 41.1664 | 10.00% | 4.1166 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 35.8484 | 14.00% | 5.0188 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.0000 | 18.00% | 9.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **30.9562** minus penalties **0.0000** = final **30.9562**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 88.4811 | 20.00% | 17.6962 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 20.9913 | 6.00% | 1.2595 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **47.8757**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2073`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 76.68571428571431, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 76.68571428571431, "close": 3350.4, "level": "LOW", "move_atr": 0.2073, "session_open": 3366.3, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 62.4838, "screening_level": "BELOW_MINIMUM", "selected": 30.9562, "short": 30.9562} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 47.8757} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 31.5276, "edge": 31.5276, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 40. ETERNAL

| Decision field | Actual value |
|---|---|
| Opportunity rank | 50 |
| Execution-readiness rank | 35 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | LONG |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | COUNTER_TREND_SHORT |
| Session-direction score | -30.3360 |
| OFactor final | 28.1474 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 60.2926 |
| SHORT OFactor | 28.1474 |
| Directional edge LONG minus SHORT | 32.1452 |
| Directional-edge tier | HIGH |
| XFactor final | 47.4600 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 10.1393 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.0152 |
| close_price | 308.0500 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 311.3000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 308.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 310.3500 |
| prev_close | 310.2500 |
| prior_high_20 | 319.7000 |
| prior_low_20 | 275.5500 |
| return_1d_pct | -0.7091 |
| return_21d_pct | 8.0119 |
| return_5d_pct | -1.3924 |
| return_63d_pct | 25.3153 |
| rsi_14 | 59.8904 |
| sector_return_21d_pct | 5.7266 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 310.3500 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 299.1450 |
| sma50 | 277.4440 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | ETERNAL |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 10.1393 |
| close | 308.0500 |
| close_vs_ema61_pct | 9.4723 |
| ema61 | 280.5069 |
| high | 311.3000 |
| low | 308.0000 |
| macd_line | 9.6633 |
| move_atr | 0.2268 |
| open | 310.3500 |
| previous_close | 310.2500 |
| prior_high_20 | 319.7000 |
| prior_low_20 | 275.5500 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 59.8904 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 299.1450 |
| sma50 | 277.4440 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 388,362.1000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.8235 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -26.9988 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 94.9420 | 18.00% | 17.0896 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 54.0885 | 12.00% | 6.4906 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 65.7292 | 10.00% | 6.5729 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 70.7873 | 14.00% | 9.9102 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.6667 | 18.00% | 3.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **60.2926** minus penalties **0.0000** = final **60.2926**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 5.0579 | 18.00% | 0.9104 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 45.9115 | 12.00% | 5.5094 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 34.2709 | 10.00% | 3.4271 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 29.2127 | 14.00% | 4.0898 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.0000 | 18.00% | 9.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **33.1474** minus penalties **5.0000** = final **28.1474**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 87.3978 | 20.00% | 17.4796 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 17.6734 | 6.00% | 1.0604 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **47.4600**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2268`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 10.139285714285709, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 10.139285714285709, "close": 308.05, "level": "LOW", "move_atr": 0.2268, "session_open": 310.35, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 60.2926, "screening_level": "BELOW_MINIMUM", "selected": 28.1474, "short": 28.1474} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 47.46} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.8235294117647058, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | TRUE | TRUE | {"absolute_edge": 32.1452, "edge": 32.1452, "level": "HIGH"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 41. RELIANCE

| Decision field | Actual value |
|---|---|
| Opportunity rank | 34 |
| Execution-readiness rank | 45 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | NEUTRAL |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | NEUTRAL |
| Direction state | NEUTRAL |
| Session-direction score | -15.1744 |
| OFactor final | 47.8404 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 47.8404 |
| SHORT OFactor | 45.5996 |
| Directional edge LONG minus SHORT | 2.2408 |
| Directional-edge tier | BELOW_MINIMUM |
| XFactor final | 48.7045 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 22.1214 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.4050 |
| close_price | 1,319.2000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,326.4000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,314.3000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,326.4000 |
| prev_close | 1,327.3000 |
| prior_high_20 | 1,345.9000 |
| prior_low_20 | 1,249.8000 |
| return_1d_pct | -0.6103 |
| return_21d_pct | 1.7195 |
| return_5d_pct | 2.1923 |
| return_63d_pct | -3.1282 |
| rsi_14 | 54.0399 |
| sector_return_21d_pct | -1.7603 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 1,326.4000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,298.9600 |
| sma50 | 1,300.8280 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | RELIANCE |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 22.1214 |
| close | 1,319.2000 |
| close_vs_ema61_pct | 0.2078 |
| ema61 | 1,316.3736 |
| high | 1,326.4000 |
| low | 1,314.3000 |
| macd_line | 4.1783 |
| move_atr | 0.3255 |
| open | 1,326.4000 |
| previous_close | 1,327.3000 |
| prior_high_20 | 1,345.9000 |
| prior_low_20 | 1,249.8000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 54.0399 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,298.9600 |
| sma50 | 1,300.8280 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 133,787.8500 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -20.4128 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 55.7407 | 18.00% | 10.0333 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 63.1744 | 12.00% | 7.5809 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 49.7980 | 10.00% | 4.9798 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 19.4990 | 14.00% | 2.7299 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 29.3733 | 18.00% | 5.2872 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **47.8404** minus penalties **0.0000** = final **47.8404**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 44.2593 | 18.00% | 7.9667 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 36.8257 | 12.00% | 4.4191 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 50.2020 | 10.00% | 5.0202 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 80.5010 | 14.00% | 11.2701 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 37.2934 | 18.00% | 6.7128 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **45.5996** minus penalties **0.0000** = final **45.5996**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 81.9180 | 20.00% | 16.3836 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 56.6824 | 6.00% | 3.4009 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **48.7045**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.3255`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `NO_OPPORTUNITY`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 22.121428571428574, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 22.121428571428574, "close": 1319.2, "level": "LOW", "move_atr": 0.3255, "session_open": 1326.4, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 47.8404, "screening_level": "BELOW_MINIMUM", "selected": 47.8404, "short": 45.5996} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 48.7045} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | FALSE | TRUE | {"absolute_edge": 2.2408, "edge": 2.2408, "level": "BELOW_MINIMUM"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 42. SUNPHARMA

| Decision field | Actual value |
|---|---|
| Opportunity rank | 35 |
| Execution-readiness rank | 41 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | NEUTRAL |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | NEUTRAL |
| Direction state | NEUTRAL |
| Session-direction score | 0.9049 |
| OFactor final | 47.4347 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 47.4347 |
| SHORT OFactor | 47.5653 |
| Directional edge LONG minus SHORT | -0.1306 |
| Directional-edge tier | BELOW_MINIMUM |
| XFactor final | 54.8889 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.8667 |
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
| atr14 | 35.9429 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.2273 |
| close_price | 1,941.5000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,950.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,939.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,939.0000 |
| prev_close | 1,944.4000 |
| prior_high_20 | 2,046.9000 |
| prior_low_20 | 1,910.0000 |
| return_1d_pct | -0.1491 |
| return_21d_pct | 1.0461 |
| return_5d_pct | -1.1456 |
| return_63d_pct | 4.2024 |
| rsi_14 | 50.7795 |
| sector_return_21d_pct | -1.1119 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_open_price | 1,939.0000 |
| session_volume | 10,444.0000 |
| session_vwap | 1,945.5551 |
| sma20 | 1,958.6500 |
| sma50 | 1,891.4040 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | SUNPHARMA |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.8800 |
| vix_regime | LOW |
| volume_ratio_20 | 0.3099 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 35.9429 |
| close | 1,941.5000 |
| close_vs_ema61_pct | 2.4352 |
| ema61 | 1,893.8063 |
| high | 1,950.0000 |
| low | 1,939.0000 |
| macd_line | 12.9671 |
| move_atr | 0.0696 |
| open | 1,939.0000 |
| previous_close | 1,944.4000 |
| prior_high_20 | 2,046.9000 |
| prior_low_20 | 1,910.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 50.7795 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_vwap | 1,945.5551 |
| sma20 | 1,958.6500 |
| sma50 | 1,891.4040 |
| turnover_lacs | 202.7703 |
| turnover_percentile | 0.8800 |
| volume_average_20 | 33,696.7000 |
| volume_current | 10,444.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.8235 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.3099 |
| vwap_distance_atr | 0.1128 |
| willr14 | -86.5353 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.8667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 2.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 56.2584 | 18.00% | 10.1265 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 46.0061 | 12.00% | 5.5207 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 43.5631 | 10.00% | 4.3563 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 21.5253 | 14.00% | 3.0135 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 21.7129 | 18.00% | 3.9083 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **47.4347** minus penalties **0.0000** = final **47.4347**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 43.7416 | 18.00% | 7.8735 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 53.9939 | 12.00% | 6.4793 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 56.4369 | 10.00% | 5.6437 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 78.4746 | 14.00% | 10.9865 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 44.9538 | 18.00% | 8.0917 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **52.5653** minus penalties **5.0000** = final **47.5653**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 96.1358 | 20.00% | 19.2272 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 57.6956 | 6.00% | 3.4617 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **54.8889**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.0696`; VWAP-distance ATR `0.1128`. Engine decision `NO_OPPORTUNITY`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 35.942857142857164, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 35.942857142857164, "close": 1941.5, "level": "LOW", "move_atr": 0.0696, "session_open": 1939.0, "session_vwap": 1945.5551034086557, "vwap_distance_atr": 0.1128} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 47.4347, "screening_level": "BELOW_MINIMUM", "selected": 47.4347, "short": 47.5653} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 54.8889} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.88, "volume_level": "HIGH", "volume_percentile_90": 0.8235294117647058, "volume_ratio_20": 0.30994132956639675} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | FALSE | TRUE | {"absolute_edge": 0.1306, "edge": -0.1306, "level": "BELOW_MINIMUM"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 43. APOLLOHOSP

| Decision field | Actual value |
|---|---|
| Opportunity rank | 36 |
| Execution-readiness rank | 46 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | NEUTRAL |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | SESSION_SHORT |
| Session-direction score | -41.3126 |
| OFactor final | 47.2676 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 47.7324 |
| SHORT OFactor | 47.2676 |
| Directional edge LONG minus SHORT | 0.4648 |
| Directional-edge tier | BELOW_MINIMUM |
| XFactor final | 48.0011 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 138.5357 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.0718 |
| close_price | 8,898.0000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 8,982.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 8,891.5000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 8,982.0000 |
| prev_close | 8,912.0000 |
| prior_high_20 | 9,050.0000 |
| prior_low_20 | 8,739.0000 |
| return_1d_pct | -0.1571 |
| return_21d_pct | 1.3151 |
| return_5d_pct | -1.6796 |
| return_63d_pct | 9.5948 |
| rsi_14 | 52.8329 |
| sector_return_21d_pct | -1.1119 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 8,982.0000 |
| session_volume | 3,271.0000 |
| session_vwap | 8,961.0240 |
| sma20 | 8,911.1750 |
| sma50 | 8,698.2700 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | APOLLOHOSP |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.9200 |
| vix_regime | LOW |
| volume_ratio_20 | 0.4724 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 138.5357 |
| close | 8,898.0000 |
| close_vs_ema61_pct | 3.2614 |
| ema61 | 8,607.5990 |
| high | 8,982.0000 |
| low | 8,891.5000 |
| macd_line | 62.3677 |
| move_atr | 0.6063 |
| open | 8,982.0000 |
| previous_close | 8,912.0000 |
| prior_high_20 | 9,050.0000 |
| prior_low_20 | 8,739.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 52.8329 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | 8,961.0240 |
| sma20 | 8,911.1750 |
| sma50 | 8,698.2700 |
| turnover_lacs | 291.0536 |
| turnover_percentile | 0.9200 |
| volume_average_20 | 6,923.7500 |
| volume_current | 3,271.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.8235 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.4724 |
| vwap_distance_atr | 0.4549 |
| willr14 | -49.6732 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 62.5511 | 18.00% | 11.2592 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 45.8348 | 12.00% | 5.5002 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 45.2444 | 10.00% | 4.5244 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 21.5253 | 14.00% | 3.0135 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.2544 | 18.00% | 2.9258 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **47.7324** minus penalties **0.0000** = final **47.7324**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 37.4489 | 18.00% | 6.7408 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 54.1652 | 12.00% | 6.4998 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 54.7556 | 10.00% | 5.4756 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 78.4746 | 14.00% | 10.9865 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.4123 | 18.00% | 9.0742 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **52.2676** minus penalties **5.0000** = final **47.2676**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 66.3143 | 20.00% | 13.2629 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 100.0000 | 6.00% | 6.0000 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 42.3043 | 6.00% | 2.5383 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **48.0011**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.6063`; VWAP-distance ATR `0.4549`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 138.53571428571428, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 138.53571428571428, "close": 8898.0, "level": "LOW", "move_atr": 0.6063, "session_open": 8982.0, "session_vwap": 8961.023998777133, "vwap_distance_atr": 0.4549} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 47.7324, "screening_level": "BELOW_MINIMUM", "selected": 47.2676, "short": 47.2676} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 48.0011} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.92, "volume_level": "HIGH", "volume_percentile_90": 0.8235294117647058, "volume_ratio_20": 0.47243184690377327} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | FALSE | TRUE | {"absolute_edge": 0.4648, "edge": 0.4648, "level": "BELOW_MINIMUM"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 44. ICICIBANK

| Decision field | Actual value |
|---|---|
| Opportunity rank | 37 |
| Execution-readiness rank | 44 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | NEUTRAL |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | NEUTRAL |
| Direction state | NEUTRAL |
| Session-direction score | -12.5681 |
| OFactor final | 46.9040 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 46.9040 |
| SHORT OFactor | 41.5360 |
| Directional edge LONG minus SHORT | 5.3680 |
| Directional-edge tier | BELOW_MINIMUM |
| XFactor final | 49.8223 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 23.4000 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.3491 |
| close_price | 1,427.1000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,434.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,423.4000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,432.8000 |
| prev_close | 1,431.8000 |
| prior_high_20 | 1,480.0000 |
| prior_low_20 | 1,392.0000 |
| return_1d_pct | -0.3283 |
| return_21d_pct | 1.2487 |
| return_5d_pct | -1.8906 |
| return_63d_pct | 14.5345 |
| rsi_14 | 51.4227 |
| sector_return_21d_pct | 0.4571 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 1,432.8000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,438.8300 |
| sma50 | 1,382.5940 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | ICICIBANK |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 23.4000 |
| close | 1,427.1000 |
| close_vs_ema61_pct | 2.9458 |
| ema61 | 1,384.9029 |
| high | 1,434.0000 |
| low | 1,423.4000 |
| macd_line | 12.8920 |
| move_atr | 0.2436 |
| open | 1,432.8000 |
| previous_close | 1,431.8000 |
| prior_high_20 | 1,480.0000 |
| prior_low_20 | 1,392.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 51.4227 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,438.8300 |
| sma50 | 1,382.5940 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 143,234.2500 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -73.7668 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 66.0488 | 18.00% | 11.8888 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 43.5454 | 12.00% | 5.2254 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 39.9258 | 10.00% | 3.9926 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 26.4286 | 14.00% | 3.7000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 27.0440 | 18.00% | 4.8679 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **46.9040** minus penalties **0.0000** = final **46.9040**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 33.9512 | 18.00% | 6.1112 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 56.4546 | 12.00% | 6.7746 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 60.0741 | 10.00% | 6.0074 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 73.5714 | 14.00% | 10.3000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 39.6226 | 18.00% | 7.1321 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **46.5360** minus penalties **5.0000** = final **41.5360**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 86.4672 | 20.00% | 17.2934 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 60.1472 | 6.00% | 3.6088 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **49.8223**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.2436`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `NO_OPPORTUNITY`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 23.400000000000027, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 23.400000000000027, "close": 1427.1, "level": "LOW", "move_atr": 0.2436, "session_open": 1432.8, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 46.904, "screening_level": "BELOW_MINIMUM", "selected": 46.904, "short": 41.536} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 49.8223} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | FALSE | TRUE | {"absolute_edge": 5.368, "edge": 5.368, "level": "BELOW_MINIMUM"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 45. TATASTEEL

| Decision field | Actual value |
|---|---|
| Opportunity rank | 38 |
| Execution-readiness rank | 42 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | NEUTRAL |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | NEUTRAL |
| Direction state | NEUTRAL |
| Session-direction score | 0.0619 |
| OFactor final | 46.8085 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 46.8085 |
| SHORT OFactor | 41.6315 |
| Directional edge LONG minus SHORT | 5.1770 |
| Directional-edge tier | BELOW_MINIMUM |
| XFactor final | 52.6559 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 3.7936 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.5476 |
| close_price | 190.1200 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 190.5000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 189.6600 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 190.2400 |
| prev_close | 190.2400 |
| prior_high_20 | 193.6500 |
| prior_low_20 | 181.2000 |
| return_1d_pct | -0.0631 |
| return_21d_pct | 1.6087 |
| return_5d_pct | -0.4347 |
| return_63d_pct | -14.0234 |
| rsi_14 | 51.6421 |
| sector_return_21d_pct | 2.6967 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 190.2400 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 187.2390 |
| sma50 | 192.2572 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | TATASTEEL |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 3.7936 |
| close | 190.1200 |
| close_vs_ema61_pct | -1.7750 |
| ema61 | 193.6701 |
| high | 190.5000 |
| low | 189.6600 |
| macd_line | -0.2848 |
| move_atr | 0.0316 |
| open | 190.2400 |
| previous_close | 190.2400 |
| prior_high_20 | 193.6500 |
| prior_low_20 | 181.2000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 51.6421 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 187.2390 |
| sma50 | 192.2572 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 523,917.9000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -28.3534 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 43.2845 | 18.00% | 7.7912 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 49.8310 | 12.00% | 5.9797 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 35.1775 | 10.00% | 3.5177 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 42.3817 | 14.00% | 5.9334 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 35.3175 | 18.00% | 6.3571 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **46.8085** minus penalties **0.0000** = final **46.8085**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 56.7155 | 18.00% | 10.2088 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 50.1690 | 12.00% | 6.0203 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 64.8226 | 10.00% | 6.4823 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 57.6183 | 14.00% | 8.0666 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 31.3492 | 18.00% | 5.6429 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **46.6315** minus penalties **5.0000** = final **41.6315**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 98.2426 | 20.00% | 19.6485 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 68.1238 | 6.00% | 4.0874 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **52.6559**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.0316`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `NO_OPPORTUNITY`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 3.7935714285714277, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 3.7935714285714277, "close": 190.12, "level": "LOW", "move_atr": 0.0316, "session_open": 190.24, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 46.8085, "screening_level": "BELOW_MINIMUM", "selected": 46.8085, "short": 41.6315} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 52.6559} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | FALSE | TRUE | {"absolute_edge": 5.177, "edge": 5.177, "level": "BELOW_MINIMUM"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 46. CIPLA

| Decision field | Actual value |
|---|---|
| Opportunity rank | 39 |
| Execution-readiness rank | 43 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | NEUTRAL |
| Current-session direction | NEUTRAL |
| Resolved actionable direction | NEUTRAL |
| Direction state | NEUTRAL |
| Session-direction score | -19.9711 |
| OFactor final | 46.4720 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 46.4720 |
| SHORT OFactor | 46.9680 |
| Directional edge LONG minus SHORT | -0.4960 |
| Directional-edge tier | BELOW_MINIMUM |
| XFactor final | 50.6068 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 31.3000 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.0746 |
| close_price | 1,463.0000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,469.2000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,462.5000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,468.0000 |
| prev_close | 1,467.7000 |
| prior_high_20 | 1,491.2000 |
| prior_low_20 | 1,366.1000 |
| return_1d_pct | -0.3202 |
| return_21d_pct | 2.5443 |
| return_5d_pct | 0.2055 |
| return_63d_pct | 1.8306 |
| rsi_14 | 55.6211 |
| sector_return_21d_pct | -1.1119 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 1,468.0000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,444.3350 |
| sma50 | 1,425.7700 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | CIPLA |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 31.3000 |
| close | 1,463.0000 |
| close_vs_ema61_pct | 3.1058 |
| ema61 | 1,417.4617 |
| high | 1,469.2000 |
| low | 1,462.5000 |
| macd_line | 11.8956 |
| move_atr | 0.1597 |
| open | 1,468.0000 |
| previous_close | 1,467.7000 |
| prior_high_20 | 1,491.2000 |
| prior_low_20 | 1,366.1000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 55.6211 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,444.3350 |
| sma50 | 1,425.7700 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 20,855.4500 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -22.5420 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 61.9958 | 18.00% | 11.1592 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 56.4772 | 12.00% | 6.7773 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 52.9270 | 10.00% | 5.2927 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 21.5253 | 14.00% | 3.0135 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.6667 | 18.00% | 3.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **46.4720** minus penalties **0.0000** = final **46.4720**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 38.0042 | 18.00% | 6.8408 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 43.5228 | 12.00% | 5.2227 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 47.0729 | 10.00% | 4.7073 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 78.4746 | 14.00% | 10.9865 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.0000 | 18.00% | 9.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **46.9680** minus penalties **0.0000** = final **46.9680**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 91.1253 | 20.00% | 18.2251 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 57.6956 | 6.00% | 3.4617 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **50.6068**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.1597`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `NO_OPPORTUNITY`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 31.30000000000002, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "LONG", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 31.30000000000002, "close": 1463.0, "level": "LOW", "move_atr": 0.1597, "session_open": 1468.0, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 46.472, "screening_level": "BELOW_MINIMUM", "selected": 46.472, "short": 46.968} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 50.6068} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | FALSE | TRUE | {"absolute_edge": 0.496, "edge": -0.496, "level": "BELOW_MINIMUM"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 47. BHARTIARTL

| Decision field | Actual value |
|---|---|
| Opportunity rank | 40 |
| Execution-readiness rank | 47 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | NEUTRAL |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | SESSION_SHORT |
| Session-direction score | -31.5778 |
| OFactor final | 46.2989 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 42.1411 |
| SHORT OFactor | 46.2989 |
| Directional edge LONG minus SHORT | -4.1578 |
| Directional-edge tier | BELOW_MINIMUM |
| XFactor final | 46.8182 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.8667 |
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
| atr14 | 34.8643 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.0479 |
| close_price | 1,923.3000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 1,937.2000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 1,922.6000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 1,937.2000 |
| prev_close | 1,943.0000 |
| prior_high_20 | 2,031.0000 |
| prior_low_20 | 1,878.0000 |
| return_1d_pct | -1.0139 |
| return_21d_pct | 1.1305 |
| return_5d_pct | -2.3755 |
| return_63d_pct | 2.1131 |
| rsi_14 | 48.3167 |
| sector_return_21d_pct | 1.1305 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_open_price | 1,937.2000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,940.3850 |
| sma50 | 1,893.0100 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | BHARTIARTL |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 34.8643 |
| close | 1,923.3000 |
| close_vs_ema61_pct | 0.9292 |
| ema61 | 1,905.0034 |
| high | 1,937.2000 |
| low | 1,922.6000 |
| macd_line | 14.0951 |
| move_atr | 0.3987 |
| open | 1,937.2000 |
| previous_close | 1,943.0000 |
| prior_high_20 | 2,031.0000 |
| prior_low_20 | 1,878.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 48.3167 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 1,940.3850 |
| sma50 | 1,893.0100 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 112,513.3500 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -70.3922 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.8667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 2.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 53.3262 | 18.00% | 9.5987 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 38.4188 | 12.00% | 4.6103 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 37.0831 | 10.00% | 3.7083 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 28.5328 | 14.00% | 3.9946 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.6667 | 18.00% | 3.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **42.1411** minus penalties **0.0000** = final **42.1411**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 46.6738 | 18.00% | 8.4013 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 61.5812 | 12.00% | 7.3897 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 62.9169 | 10.00% | 6.2917 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 71.4672 | 14.00% | 10.0054 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.0000 | 18.00% | 9.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **51.2989** minus penalties **5.0000** = final **46.2989**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 77.8506 | 20.00% | 15.5701 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 38.8007 | 6.00% | 2.3280 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **46.8182**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.3987`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 34.86428571428574, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 34.86428571428574, "close": 1923.3, "level": "LOW", "move_atr": 0.3987, "session_open": 1937.2, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 42.1411, "screening_level": "BELOW_MINIMUM", "selected": 46.2989, "short": 46.2989} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 46.8182} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | FALSE | TRUE | {"absolute_edge": 4.1578, "edge": -4.1578, "level": "BELOW_MINIMUM"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 48. KOTAKBANK

| Decision field | Actual value |
|---|---|
| Opportunity rank | 41 |
| Execution-readiness rank | 48 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | NEUTRAL |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | SESSION_SHORT |
| Session-direction score | -30.2968 |
| OFactor final | 46.0004 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 42.4396 |
| SHORT OFactor | 46.0004 |
| Directional edge LONG minus SHORT | -3.5608 |
| Directional-edge tier | BELOW_MINIMUM |
| XFactor final | 46.5640 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 6.5536 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.1111 |
| close_price | 389.2000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 392.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 388.8500 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 392.0000 |
| prev_close | 393.5000 |
| prior_high_20 | 400.0000 |
| prior_low_20 | 375.7000 |
| return_1d_pct | -1.0928 |
| return_21d_pct | 1.1829 |
| return_5d_pct | -2.2111 |
| return_63d_pct | 1.5658 |
| rsi_14 | 49.3089 |
| sector_return_21d_pct | 0.4571 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 392.0000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 387.7500 |
| sma50 | 390.4470 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | KOTAKBANK |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 6.5536 |
| close | 389.2000 |
| close_vs_ema61_pct | -0.0249 |
| ema61 | 389.3000 |
| high | 392.0000 |
| low | 388.8500 |
| macd_line | 1.5222 |
| move_atr | 0.4272 |
| open | 392.0000 |
| previous_close | 393.5000 |
| prior_high_20 | 400.0000 |
| prior_low_20 | 375.7000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 49.3089 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 387.7500 |
| sma50 | 390.4470 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 119,051.1500 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.8235 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -50.4673 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 53.6887 | 18.00% | 9.6640 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 40.0962 | 12.00% | 4.8115 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 39.5148 | 10.00% | 3.9515 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 26.4286 | 14.00% | 3.7000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 17.1296 | 18.00% | 3.0833 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **42.4396** minus penalties **0.0000** = final **42.4396**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 46.3113 | 18.00% | 8.3360 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 59.9038 | 12.00% | 7.1885 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 60.4852 | 10.00% | 6.0485 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 73.5714 | 14.00% | 10.3000 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 49.5370 | 18.00% | 8.9167 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **51.0004** minus penalties **5.0000** = final **46.0004**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 76.2640 | 20.00% | 15.2528 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 39.8528 | 6.00% | 2.3912 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **46.5640**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.4272`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 6.553571428571429, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 6.553571428571429, "close": 389.2, "level": "LOW", "move_atr": 0.4272, "session_open": 392.0, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 42.4396, "screening_level": "BELOW_MINIMUM", "selected": 46.0004, "short": 46.0004} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 46.564} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.8235294117647058, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | FALSE | TRUE | {"absolute_edge": 3.5608, "edge": -3.5608, "level": "BELOW_MINIMUM"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 49. INDIGO

| Decision field | Actual value |
|---|---|
| Opportunity rank | 43 |
| Execution-readiness rank | 50 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | NEUTRAL |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | SESSION_SHORT |
| Session-direction score | -48.2569 |
| OFactor final | 44.4063 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 44.0337 |
| SHORT OFactor | 44.4063 |
| Directional edge LONG minus SHORT | -0.3726 |
| Directional-edge tier | BELOW_MINIMUM |
| XFactor final | 44.2074 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.9333 |
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
| atr14 | 136.7500 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.1560 |
| close_price | 5,238.0000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 5,330.0000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 5,221.0000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 5,330.0000 |
| prev_close | 5,333.5000 |
| prior_high_20 | 5,508.0000 |
| prior_low_20 | 4,886.0000 |
| return_1d_pct | -1.7906 |
| return_21d_pct | 0.1625 |
| return_5d_pct | -2.2396 |
| return_63d_pct | 22.3689 |
| rsi_14 | 50.5386 |
| sector_return_21d_pct | -3.5038 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_open_price | 5,330.0000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 5,238.7000 |
| sma50 | 5,095.0000 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | INDIGO |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 136.7500 |
| close | 5,238.0000 |
| close_vs_ema61_pct | 3.6503 |
| ema61 | 5,047.3836 |
| high | 5,330.0000 |
| low | 5,221.0000 |
| macd_line | 54.1194 |
| move_atr | 0.6728 |
| open | 5,330.0000 |
| previous_close | 5,333.5000 |
| prior_high_20 | 5,508.0000 |
| prior_low_20 | 4,886.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 50.5386 |
| session_bar_coverage | 0.9333 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 1.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 5,238.7000 |
| sma50 | 5,095.0000 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 15,298.6000 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -43.4084 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.9333 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 1.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 66.2289 | 18.00% | 11.9212 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 41.2067 | 12.00% | 4.9448 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 45.5155 | 10.00% | 4.5515 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 14.0507 | 14.00% | 1.9671 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 18.9985 | 18.00% | 3.4197 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **44.0337** minus penalties **0.0000** = final **44.0337**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 33.7711 | 18.00% | 6.0788 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 58.7933 | 12.00% | 7.0552 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 54.4845 | 10.00% | 5.4485 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 85.9493 | 14.00% | 12.0329 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 47.6682 | 18.00% | 8.5803 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **49.4063** minus penalties **5.0000** = final **44.4063**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 62.6244 | 20.00% | 12.5249 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 46.0417 | 6.00% | 2.7625 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **44.2074**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.6728`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 136.75, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 136.75, "close": 5238.0, "level": "LOW", "move_atr": 0.6728, "session_open": 5330.0, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 44.0337, "screening_level": "BELOW_MINIMUM", "selected": 44.4063, "short": 44.4063} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 44.2074} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | FALSE | TRUE | {"absolute_edge": 0.3726, "edge": -0.3726, "level": "BELOW_MINIMUM"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

## 50. TRENT

| Decision field | Actual value |
|---|---|
| Opportunity rank | 44 |
| Execution-readiness rank | 49 |
| Recommendation rank | NOT AVAILABLE |
| Recommended for review | FALSE |
| Selected / automatic entry permission | FALSE |
| Daily structural direction | NEUTRAL |
| Current-session direction | SHORT |
| Resolved actionable direction | SHORT |
| Direction state | SESSION_SHORT |
| Session-direction score | -32.1553 |
| OFactor final | 42.7558 |
| OFactor tier | BELOW_MINIMUM |
| LONG OFactor | 45.6842 |
| SHORT OFactor | 42.7558 |
| Directional edge LONG minus SHORT | 2.9284 |
| Directional-edge tier | BELOW_MINIMUM |
| XFactor final | 46.3398 |
| Data quality / permission | 49.0000 / DATA_INSUFFICIENT |
| Intraday bar coverage | 0.8667 |
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
| atr14 | 75.0786 |
| bank_nifty_trend | UPWARD |
| bank_nifty_zone | UPWARD_LOW_NORMAL_VOL |
| close_location | 0.0201 |
| close_price | 2,999.9000 |
| delivery_ratio_20 | NOT AVAILABLE |
| event_risk | 0.0000 |
| high_price | 3,029.1000 |
| is_intraday_snapshot | 1.0000 |
| low_price | 2,999.3000 |
| nifty_return_21d_pct | 5.2639 |
| nifty_trend | UPWARD |
| nifty_zone | UPWARD_LOW_NORMAL_VOL |
| open_price | 3,024.5000 |
| prev_close | 3,025.0000 |
| prior_high_20 | 3,244.5000 |
| prior_low_20 | 2,836.0000 |
| return_1d_pct | -0.8298 |
| return_21d_pct | 3.4413 |
| return_5d_pct | -3.4688 |
| return_63d_pct | -27.4054 |
| rsi_14 | 47.0075 |
| sector_return_21d_pct | 5.7266 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_open_price | 3,024.5000 |
| session_volume | 0.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 2,960.3850 |
| sma50 | 3,053.7220 |
| source_reliability | 98.0000 |
| stock_trend | NOT AVAILABLE |
| stock_zone | NOT AVAILABLE |
| symbol | TRENT |
| trade_date | 2026-08-11 |
| turnover_percentile | 0.3900 |
| vix_regime | LOW |
| volume_ratio_20 | 0.0000 |

### Additional live, volume and gate input values

| Input | Actual value |
|---|---|
| atr14_previous_completed | 75.0786 |
| close | 2,999.9000 |
| close_vs_ema61_pct | -6.6351 |
| ema61 | 3,220.1967 |
| high | 3,029.1000 |
| low | 2,999.3000 |
| macd_line | -12.9084 |
| move_atr | 0.3277 |
| open | 3,024.5000 |
| previous_close | 3,025.0000 |
| prior_high_20 | 3,244.5000 |
| prior_low_20 | 2,836.0000 |
| reward_risk | NOT AVAILABLE |
| risk_atr | NOT AVAILABLE |
| rsi14 | 47.0075 |
| session_bar_coverage | 0.8667 |
| session_data_status | DATA_INSUFFICIENT |
| session_latest_bar_age_minutes | 2.0000 |
| session_vwap | NOT AVAILABLE |
| sma20 | 2,960.3850 |
| sma50 | 3,053.7220 |
| turnover_lacs | 0.0000 |
| turnover_percentile | 0.3900 |
| volume_average_20 | 15,048.4500 |
| volume_current | 0.0000 |
| volume_median_90 | 0.0000 |
| volume_percentile_90 | 0.7941 |
| volume_previous_1d | 0.0000 |
| volume_previous_2d | 0.0000 |
| volume_ratio_20 | 0.0000 |
| vwap_distance_atr | NOT AVAILABLE |
| willr14 | -59.8776 |

### Data-quality calculation

| DQ field | Actual value |
|---|---|
| consistency | 100.0000 |
| coverage | 93.1034 |
| freshness | 100.0000 |
| mandatory_missing | 1.0000 |
| permission | DATA_INSUFFICIENT |
| score | 49.0000 |
| session_bar_coverage | 0.8667 |
| session_failures | ["SESSION_DATA_STATUS_NOT_FULL", "SESSION_VOLUME_MISSING_OR_ZERO", "SESSION_BAR_COVERAGE_BELOW_95_PERCENT"] |
| session_latest_bar_age_minutes | 2.0000 |
| source_reliability | 98.0000 |

### LONG OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 44.0108 | 18.00% | 7.9219 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 32.5541 | 12.00% | 3.9065 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 37.1626 | 10.00% | 3.7163 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 93.8659 | 8.00% | 7.5093 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 70.7873 | 14.00% | 9.9102 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 16.6667 | 18.00% | 3.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

LONG raw score **45.6842** minus penalties **0.0000** = final **45.6842**. Penalties: `{}`. Reconciliation residual: `0.00000000`.

### SHORT OFactor calculation

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Trend Quality | 55.9892 | 18.00% | 10.0781 | mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%) |
| Catalyst Context | 50.0000 | 4.00% | 2.0000 | 50 when no event-risk flag is present; 0 when event risk is present |
| Momentum Quality | 67.4459 | 12.00% | 8.0935 | mean of direction-adjusted RSI14 and direction-adjusted 5-session return |
| Relative Strength | 62.8374 | 10.00% | 6.2837 | mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%) |
| Liquidity Tradability | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Regime Support | 6.1341 | 8.00% | 0.4907 | directional(NIFTY 21-session return, direction, -6% to +6%) |
| Sector Industry Support | 29.2127 | 14.00% | 4.0898 | mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%)) |
| Money Flow Participation | 50.0000 | 18.00% | 9.0000 | mean of price-volume impulse, close location in daily range and volume/20-session-average score |
| Institutional Confirmation | 50.0000 | 10.00% | 5.0000 | public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity |

SHORT raw score **47.7558** minus penalties **5.0000** = final **42.7558**. Penalties: `{"timeframe_conflict": 5.0}`. Reconciliation residual: `0.00000000`.

### XFactor calculation for selected direction

| Component | Component score | Weight | Weighted contribution | Calculation meaning |
|---|---|---|---|---|
| Setup Integrity | 20.0000 | 18.00% | 3.6000 | 90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20 |
| Instrument Quality | 100.0000 | 3.00% | 3.0000 | fixed at 100 for admitted cash-equity instruments |
| Reward Path Quality | 50.0000 | 14.00% | 7.0000 | linear score of reward/risk from 0.5 to 2.5 |
| Trigger Confirmation | 20.0000 | 16.00% | 3.2000 | 90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2 |
| Entry Location Quality | 81.7968 | 20.00% | 16.3594 | score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy |
| Timing Session Quality | 80.0000 | 3.00% | 2.4000 | fixed at 80 in this daily/live baseline |
| Stop Invalidation Quality | 50.0000 | 14.00% | 7.0000 | linear score of (2.5 - risk_ATR), from 0 to 2.5 |
| Liquidity Slippage Quality | 45.3333 | 6.00% | 2.7200 | linear score of cross-sectional turnover percentile from 5% to 80% |
| Market Sector Synchronisation | 17.6734 | 6.00% | 1.0604 | mean of the selected-direction OFactor market-regime and sector-support components |

XFactor weighted score **46.3398**. Setup `NOT AVAILABLE` / state `FORMING`; structural stop `NOT AVAILABLE`; risk/share `NOT AVAILABLE`; reward/risk `NOT AVAILABLE`; MoveATR `0.3277`; VWAP-distance ATR `NOT AVAILABLE`. Engine decision `DATA_INSUFFICIENT`.

### Gate-by-gate evidence

| Gate | Pass | Blocking | Actual values | Rule | Fields | Source |
|---|---|---|---|---|---|---|
| STOP_TOO_WIDE | FALSE | FALSE | {"atr14": 75.07857142857142, "risk_atr": null, "risk_per_share": null} | risk per share / ATR14 <= 2.5; recorded but non-blocking | structural_stop, risk_per_share, atr14 | oiis_live.daily_candidate.evidence |
| NO_VALID_SETUP | FALSE | TRUE | {"direction": "SHORT", "reason_codes": ["NO_RECOGNISED_STRUCTURE"], "setup_type": null, "state": "FORMING", "structural_stop": null, "trigger_price": null, "valid": false, "volume_confirmed": false} | one canonical setup object must contain recognised structure, volume confirmation and a structural invalidation | open, high, low, close, sma20, sma50, prior_high_20, prior_low_20, volume_ratio_20 | nse.fact_eod_prices + public.bars_1m + derived rolling features |
| EXCESSIVE_EXTENSION | TRUE | TRUE | {"atr14_previous_completed": 75.07857142857142, "close": 2999.9, "level": "LOW", "move_atr": 0.3277, "session_open": 3024.5, "session_vwap": null, "vwap_distance_atr": null} | abs(current price - session open) / previous completed daily ATR <= 1.8; VWAP distance retained separately | close, session_open, session_vwap, atr14_previous_completed | public.bars_1m + nse.fact_eod_prices derived features |
| OFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"long": 45.6842, "screening_level": "BELOW_MINIMUM", "selected": 42.7558, "short": 42.7558} | canonical permission requires selected OFactor >= 74; 54/64/74 remain screening cohorts | ofactor_long, ofactor_short, selected_ofactor | oiis_live.daily_candidate.component_scores/evidence |
| XFACTOR_BELOW_MINIMUM | FALSE | TRUE | {"xfactor": 46.3398} | XFactor >= 76 | xfactor_snapshot | oiis_live.daily_candidate.component_scores/evidence |
| INSUFFICIENT_LIQUIDITY | FALSE | TRUE | {"primary_used": true, "turnover_percentile": 0.39, "volume_level": "HIGH", "volume_percentile_90": 0.7941176470588235, "volume_ratio_20": 0.0} | primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30 | volume, volume_average_20, turnover_lacs, volume_percentile_90 | nse.fact_eod_prices |
| REWARD_RISK_BELOW_MINIMUM | TRUE | TRUE | {"reward_risk": null} | when estimable, reward/risk >= 1.5 | reward_risk | oiis_live.daily_candidate.evidence |
| DATA_QUALITY_BELOW_MINIMUM | FALSE | TRUE | {"permission": "DATA_INSUFFICIENT", "score": 49.0} | data quality >= 85 and permission FULL | data_quality, data_permission | oiis_live.daily_candidate |
| REWARD_RISK_NOT_CALCULATED | FALSE | TRUE | {"reward_risk": null, "risk_per_share": null, "structural_stop": null} | reward/risk is calculated only from a valid setup stop and a real opposing barrier | setup_evaluation, structural_stop, opposing_barrier | oiis_live.daily_candidate.evidence |
| DIRECTIONAL_EDGE_BELOW_MINIMUM | FALSE | TRUE | {"absolute_edge": 2.9284, "edge": 2.9284, "level": "BELOW_MINIMUM"} | abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8 | ofactor_long, ofactor_short, directional_edge | oiis_live.daily_candidate |

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

# Reproduction and verification

```bash
docker exec trading-stack-novius2-oiis-live-1 oiis-live select \
  --signal-date 2026-08-10 --trade-date 2026-08-11 \
  --run-slot OPEN_0930

curl -fsS 'http://127.0.0.1:19090/n50/v1/oiis-live/candidates?tradeDate=2026-08-11'
```

The selection command is idempotent by run slot. Re-running against later-revised market data may legitimately produce a different result hash; never overwrite the original report without recording a new run identity.
