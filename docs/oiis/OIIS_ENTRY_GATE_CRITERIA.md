# OIIS entry-gate criteria — implemented behavior

This document describes the code that actually ran in
`nifty_stratlab/oiis/engine.py`, not only the aspirational JSON labels.
All thresholds below are evaluated on the daily decision row before the next
session-open entry. The common exit and H30 scan run only after acceptance.

## 1. Data sufficiency gate

Mandatory fields are: open, high, low, close, previous close, 21-day stock
return, 21-day NIFTY return, RSI-14, SMA-20, SMA-50 and ATR-14. Missing any of
these makes permission `DATA_INSUFFICIENT` and adds
`STALE_OR_INSUFFICIENT_MARKET_DATA`.

The quality score also checks OHLC consistency, freshness and optional coverage
(volume ratio, delivery ratio, sector return, stock/NIFTY/BANK-NIFTY trend and
VIX regime). In the current engine only permission `DATA_INSUFFICIENT` is a
hard data rejection; the JSON labels `dq_full=85` and `dq_provisional=70` do
not independently reject rows.

## 2. OFactor opportunity score

The selected direction must have a final OFactor score of at least **74**.
Below 74 adds `OFACTOR_BELOW_MINIMUM` and normally produces `NO_OPPORTUNITY`.
The weighted components are:

| Component | Weight | Inputs |
|---|---:|---|
| Market regime support | 8 | NIFTY 21-day return in selected direction |
| Sector/industry support | 14 | sector return and sector excess vs NIFTY |
| Trend quality | 18 | stock 21d/63d returns and distance from SMA20/SMA50 |
| Relative strength | 10 | stock excess vs NIFTY and sector |
| Money-flow participation | 18 | signed 1d return × volume ratio, close location, volume ratio |
| Momentum quality | 12 | RSI-14 direction and 5-day return |
| Institutional confirmation | 10 | signed return × delivery ratio and delivery ratio |
| Liquidity/tradability | 6 | turnover percentile |
| Catalyst context | 4 | currently 50 when no event risk; event risk penalises |

Scores are clamped to 0–100. Long RSI above 78 receives an exhaustion penalty;
opposing high-volume movement receives a flow-conflict penalty; event risk and
timeframe conflict can also reduce the score.

## 3. Directional edge

`directional_edge = OFactor_long - OFactor_short`.

- `edge >= 8`: LONG candidate.
- `edge <= -8`: SHORT candidate.
- Between those values: NEUTRAL and `DIRECTIONAL_EDGE_BELOW_MINIMUM`.
- If both directions score at least 74 and absolute edge is below 8:
  `DIRECTIONAL_CONFLICT` is added.

Cash replay is long-only. A short candidate that otherwise looks enterable is
converted to `WATCHLIST` with `CASH_SHORT_INSTRUMENT_UNAVAILABLE`; it is never
opened as a cash trade.

## 4. Valid setup gate

For LONG:

- `BREAKOUT_ACCEPTANCE`: close > prior 20-session high **and** volume ratio ≥
  1.2.
- `PULLBACK_CONTINUATION`: low ≤ SMA20 < close and SMA20 > SMA50.

For SHORT the equivalent conditions use prior 20-session low, high, close below
SMA20 and SMA20 below SMA50. No matching setup adds `NO_VALID_SETUP` and is
reported as `SETUP_FORMING` unless an earlier higher-priority gate wins.

If a setup exists but the candle does not confirm direction (LONG close ≤ open;
SHORT close ≥ open), it is `ARMED`, adds
`TRIGGER_CONFIRMATION_MISSING`, and waits. A confirmed setup is `TRIGGERED`.

## 5. Structural stop and risk-width gates

For LONG, structural stop = `min(low, SMA20)` and risk/share = close − stop.
For SHORT, stop = `max(high, SMA20)` and risk/share = stop − close.

- Risk ≤ 0: `NO_STRUCTURAL_STOP`.
- ATR missing or risk/ATR > **2.5**: `STOP_TOO_WIDE`.

This is an entry-quality invalidation level only. It is **not** an enabled exit;
the shared execution contract has no stop-loss exit.

## 6. Reward/risk gate

For LONG, the barrier is prior 20-day high. If the barrier is not above the
close, the engine grants a default 2.0 reward-risk only when risk is positive.
Otherwise reward-risk = barrier room / risk. The corresponding short formula
uses prior 20-day low.

Reward-risk must be at least **1.5**. Otherwise
`REWARD_RISK_BELOW_MINIMUM` is added and primary outcome is
`REJECT_POOR_RR`.

## 7. Extension / chase gate

`extension_atr = abs(close − SMA20) / ATR14`.

Values above **1.5 ATR** add `EXCESSIVE_EXTENSION` and primary outcome
`DO_NOT_CHASE`. This gate is independent of reward-risk.

## 8. Liquidity gate

Both conditions must pass:

- volume ratio versus the prior 20-session average ≥ **0.75**;
- daily turnover percentile ≥ **0.10**.

Missing either value or falling below either threshold adds
`INSUFFICIENT_LIQUIDITY` and normally produces `REJECT_LIQUIDITY`.

## 9. XFactor acceptance

After the hard gates, XFactor is a weighted score of setup integrity, entry
location, trigger confirmation, stop quality, reward path, market/sector
synchronisation, liquidity/slippage, session timing and instrument quality.

- XFactor ≥ **84** → `ENTERABLE_TIER_A`.
- XFactor ≥ **76** → `ENTERABLE_TIER_B`.
- Otherwise → `WAIT`.

The JSON value `xfactor_conditional=68` is not an acceptance threshold in the
current engine. Likewise `ofactor_tier_a=82` classifies OFactor quality but does
not replace the hard OFactor minimum of 74.

## 10. Decision precedence

When many gates fail on one row, the primary decision is selected in this
order:

1. data insufficient;
2. OFactor below 74;
3. excessive extension;
4. reward-risk below 1.5;
5. stop invalid/wide;
6. insufficient liquidity;
7. no valid setup;
8. trigger missing;
9. XFactor ≥84/76 acceptance, otherwise WAIT.

Therefore gate counts are overlapping diagnostics, while decision-code counts
are mutually exclusive. This is why the gate totals cannot be added together.
