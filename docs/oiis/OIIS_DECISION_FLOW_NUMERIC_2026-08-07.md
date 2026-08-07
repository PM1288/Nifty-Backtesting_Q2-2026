# OIIS decision flow: numeric criteria and observed metrics

This is the reproducible, number-first description of the live OIIS cash-daily research engine. It uses run `3f6695e6-e55f-4d12-a672-9208039558e9`, covering `2016-01-01` through `2026-08-05`, 99 symbols and 121,316 decision rows. It describes entry qualification only. The exit and horizon evaluation is common to all strategies.

## 1. End-to-end flow

```text
daily OHLCV + Nifty/Bank/Sector/VIX context
        -> data-quality permission
        -> indicators/features
        -> O-Factor (opportunity quality)
        -> direction edge
        -> setup and trigger
        -> structural risk and reward/risk
        -> extension and liquidity checks
        -> X-Factor (execution quality)
        -> ENTERABLE_TIER_A/B, WAIT, or rejection
        -> next-session-open execution (if minute evidence exists)
        -> independent intraday, swing D+5, and H30 D+0..D+29 ladders
```

## 2. Indicators and exact inputs

The mandatory daily fields are `open`, `high`, `low`, `close`, `prev_close`, `return_21d_pct`, `nifty_return_21d_pct`, `rsi_14`, `sma20`, `sma50`, and `atr14`. Missing mandatory fields produce `DATA_INSUFFICIENT`. Derived fields are 1/5/21/63-day returns, 20-day volume ratio, 20-day delivery ratio, cross-sectional turnover percentile, close location, prior 20-session high/low (current bar excluded), stock/Nifty/Bank trend zones, equal-weight sector return, and India VIX regime.

| Indicator | Numeric definition / use |
|---|---|
| RSI14 | EWM average gains/losses; used as momentum and exhaustion context. Long exhaustion penalty starts at RSI `>=78`. |
| SMA20/SMA50 | Trend and pullback location. Long pullback requires `low <= SMA20 < close` and `SMA20 > SMA50`. |
| ATR14 | Mean true range; normalises stop width and extension. |
| Volume ratio | Current volume / prior 20-session mean; minimum `0.75` for liquidity, breakout acceptance `>=1.20`. |
| Turnover percentile | Same-date cross-sectional rank; minimum `0.10`. |
| Prior high/low 20 | Breakout/breakdown barrier excluding current candle. |
| Returns | Stock and Nifty 21-day returns drive relative strength and regime context; 1/5/63-day values are retained for review. |
| VIX/market/sector | Context and synchronisation; they affect scores but are not a stop-loss or forced exit. |

## 3. Gate sequence and thresholds

1. **Permission:** if any mandatory field is absent, reject as `DATA_INSUFFICIENT` and tag `STALE_OR_INSUFFICIENT_MARKET_DATA`.
2. **O-Factor:** weighted 0--100 score: market 8, sector 14, trend 18, relative strength 10, money flow 18, momentum 12, institutional confirmation 10, liquidity 6, catalyst 4. The selected direction must score at least `74`; otherwise `NO_OPPORTUNITY` plus `OFACTOR_BELOW_MINIMUM`.
3. **Direction:** `edge = long_final - short_final`; LONG when edge `>=8`, SHORT when `<=-8`, otherwise NEUTRAL with `DIRECTIONAL_EDGE_BELOW_MINIMUM`. Cash replay converts an otherwise valid SHORT to WATCHLIST because short instruments are unavailable.
4. **Setup:** long breakout is `close > prior_high_20` and volume ratio `>=1.20`; long pullback is `low <= SMA20 < close` and `SMA20 > SMA50`. Short rules are mirrored. No setup is `NO_VALID_SETUP`.
5. **Trigger:** a setup is `TRIGGERED` when the candle confirms direction (`close > open` for long, `< open` for short); otherwise `ARMED` and tagged `TRIGGER_CONFIRMATION_MISSING`.
6. **Structural risk:** long stop is `min(low,SMA20)`; short stop is `max(high,SMA20)`. `risk = abs(close-stop)`. Non-positive risk is invalid. `risk/ATR14 > 2.5` is `STOP_TOO_WIDE`.
7. **Reward/risk:** usable barrier room divided by risk must be at least `1.5`; absent usable barrier defaults to RR `2.0`. Below 1.5 is `REJECT_POOR_RR`.
8. **Extension:** `abs(close-SMA20)/ATR14 > 1.5` is `DO_NOT_CHASE` / `EXCESSIVE_EXTENSION`.
9. **Liquidity:** volume ratio `>=0.75` and turnover percentile `>=0.10`; failure is `REJECT_LIQUIDITY`.
10. **X-Factor:** weighted 0--100 execution score: setup integrity 18, entry location 20, trigger 16, stop quality 14, reward path 14, market/sector sync 6, liquidity/slippage 6, timing 3, instrument 3. `>=84` is Tier A; `>=76` is Tier B; lower is WAIT.

## 4. Full-run funnel (actual counts)

Counts are rows, not mutually exclusive gates; one row may fail several gates.

| Outcome / gate | Rows | Share of 121,316 |
|---|---:|---:|
| NO_OPPORTUNITY | 104,622 | 86.24% |
| DO_NOT_CHASE | 12,136 | 10.00% |
| DATA_INSUFFICIENT | 2,901 | 2.39% |
| REJECT_POOR_RR | 1,281 | 1.06% |
| SETUP_FORMING | 119 | 0.10% |
| WAIT | 111 | 0.09% |
| REJECT_LIQUIDITY | 92 | 0.08% |
| ENTERABLE Tier B / Tier A | 22 / 10 | 0.018% / 0.008% |

Most frequent overlapping tags were O-Factor below 74: `107,295` (88.44%), no valid setup `101,770` (83.89%), RR below 1.5 `57,785` (47.63%), liquidity `54,263` (44.73%), excessive extension `42,261` (34.84%), weak directional edge `21,037` (17.34%), and stop too wide `15,988` (13.18%).

The setup state counts were FORMING `101,770`, TRIGGERED `16,582`, ARMED `2,964`; permissions were FULL `116,465` and DATA_INSUFFICIENT `4,851` (the latter includes all missing-data tags). Directions were LONG `58,855`, SHORT `41,424`, and NEUTRAL `21,037`.

## 5. Accepted signal metrics

There were 32 enterable signals: 10 Tier A and 22 Tier B. All accepted signals were LONG, pullback-continuation, and TRIGGERED; none were breakout acceptance. Median values (Tier A / Tier B) were:

| Metric | Tier A | Tier B |
|---|---:|---:|
| RSI14 | 55.37 | 57.82 |
| Volume ratio | 1.00 | 1.53 |
| Turnover percentile | 0.842 | 0.801 |
| Stock 21d return | 12.93% | 9.70% |
| Nifty 21d return | 3.94% | 2.20% |
| Sector 21d return | 9.05% | 8.48% |
| Reward/risk | 2.00 | 2.00 |
| Extension in ATR | 0.168 | 0.499 |
| O-Factor | 75.17 | 75.85 |
| Direction edge | 52.17 | 52.12 |
| X-Factor | 85.31 | 79.54 |

## 6. Execution and evaluation are separate

Entry is at the next session open only when an EOD session and minute CSV evidence are available. Of 32 enterable signals, 27 became executable trades. Two symbols lacked minute files (`M&M`, `MAXHEALTH`); three signals were beyond the available minute-file endpoint (`PFC`, `SHRIRAMFIN`, `VEDL`).

After entry, the engine does **not** stop at the first ladder rung. It records all intraday targets `0.3%, 0.5%, 0.7%`, swing targets `1%, 2%, 5%` through D+5, adverse excursions `-0.5%, -1%, -2%, -5%, -10%, below -10%`, and H30 maximum upside/drawdown at every D+0..D+29 checkpoint. The common target-only policy is 0.3% intraday or 1% swing; there is no stop-loss, strategy-specific exit, timeout, or forced exit. The full ladder is an observation matrix, not an early-exit rule.

The 27 executable trades produced 27 mature H30 observations (30 checkpoints each), after-tax execution P&L `₹13,026.25`, and diagnostic score `56.0429`. Ranking remains `PROVISIONAL_BLOCKED` because the run has fewer than 100 mature entries, corporate-action policy is uncertified, costs are non-certified, and sector benchmark is a proxy.

## 7. Reproduction

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
./scripts/oiis.sh verify platform/nifty_stratlab/outputs/oiis_cash_daily_research_v1/3f6695e6-e55f-4d12-a672-9208039558e9
```

The source of truth is `decisions.csv`, the full ladder files, `oiis_diagnostic_review.xlsx`, and the run manifest in the output directory.
