# OIIS Live Rejection Gate Definitions

**Date:** 2026-08-10
**Scope:** OIIS daily live-selection screen; paper trading only.

## Authoritative table

The UI/API reads the selected date from `oiis_live.daily_candidate`. Important
fields are:

```text
trade_date, symbol, ofactor, xfactor_snapshot, data_quality, data_permission,
daily_level, selected, directional_edge, rsi14, willr14, reference_price,
buy_limit, no_chase_price, reason_codes, condition_results
```

`reason_codes` stores one or more rejection reasons. `condition_results` stores
the detailed pass/fail evidence and indicator values. Counts are grouped from
`reason_codes` for the selected date and are therefore not additive: one stock
can fail multiple gates.

## Verified V2 run

The final 2026-08-10 V2 run evaluated the complete current union of 208 F&O
underlyings and NIFTY 50 members. It produced ten ranked recommendations, zero
fully authorised entries, two rows with two failed gates, 26 with three, 60
with four, 75 with five, 27 with six, and 18 explicitly marked
`DATA_INSUFFICIENT`. Counts remain overlapping because a stock can fail several
gates. The dashboard always calculates the current counts from PostgreSQL; the
numbers are not hard-coded in the UI.

## Exact definitions

### OFactor below minimum

The selected-direction opportunity score passes at `54` and carries its tier:

```text
LOW     54 to <64
MEDIUM  64 to <74
HIGH    >=74
```

Only a score below 54 produces `OFACTOR_BELOW_MINIMUM`. The selected score,
LONG score, SHORT score, tier, all nine OFactor components and their weighted
contributions are persisted and displayed.

Fields: `ofactor`, `directional_edge`, `condition_results`.

Evidence: `oiis_live.daily_candidate` and the OIIS component/feature snapshot.

### No valid setup

For LONG, one of these must be true:

```text
close > prior_high_20 AND volume_good
low <= SMA20 < close AND SMA20 > SMA50 AND volume_good
```

For SHORT, the mirrored rules are used:

```text
close < prior_low_20 AND volume_good
high >= SMA20 > close AND SMA20 < SMA50 AND volume_good
```

`volume_good` means `volume_ratio_20 >= 1.2` or the comparable 90-session
volume percentile is at least 30%. During the session, current partial-day
volume is compared with the volume accumulated by the same IST time on prior
sessions; it is never compared with prior full-day volume.

If neither breakout/breakdown nor pullback-continuation structure exists,
`NO_VALID_SETUP` is recorded.

Fields: `open_price`, `high_price`, `low_price`, `close_price`,
`prior_high_20`, `prior_low_20`, `sma20`, `sma50`, `volume_ratio_20`,
`setup_id`, `setup_state`.

Evidence: `oiis_live.daily_candidate.condition_results` plus daily OHLCV and
indicator feature tables.

### Insufficient liquidity

Use the primary rule when both inputs exist:

```text
volume_ratio_20 >= 0.75
AND turnover_percentile >= 0.10
```

If either primary input is unavailable, use the comparable 90-session volume
percentile and require at least 30%. The percentile is recorded in three
research bands: LOW 20%, MEDIUM 30%, HIGH 50%. The evidence also includes
current volume, D-1, D-2, 20-session average, 90-session median, volume ratio,
turnover and turnover percentile.

Fields: `volume_ratio_20`, `turnover_percentile`,
`liquidity_tradability`, `liquidity_slippage_quality`.

Evidence: `oiis_live.daily_candidate.condition_results` plus daily volume and
turnover feature tables.

### Reward/risk below minimum

`reward_risk` must be at least `1.5`. It uses structural stop risk and room to
the prior 20-day barrier.

Fields: `close_price`, `structural_stop`, `risk_per_share`,
`prior_high_20`/`prior_low_20`, `reward_risk`.

### Excessive extension

```text
extension_atr = abs(close_price - SMA20) / ATR14
extension_atr <= 1.5
```

Values above 1.5 produce `EXCESSIVE_EXTENSION`. The recorded profiles are LOW
`<=1.2`, MEDIUM `<=1.4`, and HIGH `<=1.5`.

Fields: `close_price`, `sma20`, `atr14`, `extension_atr`.

### Directional edge below minimum

The absolute difference passes at 6 points and carries its tier:

```text
LOW     6 to <7
MEDIUM  7 to <8
HIGH    >=8
```

Fields: `long_ofactor`, `short_ofactor`, `directional_edge`.

### Stop too wide

```text
risk_atr = risk_per_share / ATR14
risk_atr <= 2.5
```

If `risk_atr > 2.5`, `STOP_TOO_WIDE` is recorded. In V2 this is diagnostic and
non-blocking; it remains visible in the failed-gate count and stock evidence.

Fields: `structural_stop`, `risk_per_share`, `atr14`, `risk_atr`.

`TRIGGER_CONFIRMATION_MISSING` has been removed from V2 and is neither computed
nor displayed.

## Universe and recommendation policy

The eligible universe is refreshed from unexpired SmartAPI `FUTSTK`/`OPTSTK`
contracts plus the official NSE NIFTY 50 constituent CSV. NIFTY 500 membership
alone does not admit a stock. Every eligible symbol receives a detail row; a
symbol without sufficient input data is retained with null metrics and an
explicit `DATA_INSUFFICIENT` result.

Recommendations are ranked by fewest blocking gates, then fewest total failed
gates, OFactor, absolute directional edge and data quality. The best ten
evaluable rows are always labelled recommendations. A recommendation is not a
trade authorisation: `selected` and `entry_enabled` remain false until all
blocking gates pass.

## Schedule

The durable selector runs at 08:30, 09:30 and 15:00 Asia/Kolkata on trading
sessions. Each slot has its own unique run identity and is caught up after a
restart. Trading-session eligibility comes from
`paper_trading.trading_sessions`, with a weekday fallback only when the
calendar has no row.

## Intraday entry context

RSI14 and WILLR14 are used after daily selection for the intraday trigger:

```text
RSI14 < 30
WILLR14 < -80
```

They do not replace the daily OIIS gates. The policy permits one entry per
stock per trade date; later qualifying candles cannot create a duplicate entry.

## Interpretation

“No trade” is valid. A rejection means the stock was not eligible under the
current OIIS policy for that date; it does not guarantee that the stock will
fall afterward.

## UI implementation and verification

The detailed dynamic table is implemented in:

```text
neon-stock-terminal/apps/web/src/pages/OiisLivePage.tsx
neon-stock-terminal/apps/web/src/pages/OiisLivePage.module.css
```

Verification:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web
npm run build
```

Result: passed on 2026-08-10.
