# Strategy Registry

## Active strategies

### `rsi30_willr80_closegtprev_tp125`

- Display name: `Fast Oversold Rebound`
- Active version: `rsi30_willr80_closegtprev_tp125_v1`
- Archetype: `mean_reversion_fast`
- Scope: `stock_only`
- Universe modes: `single_stock`, `nifty_100`
- Capital modes: `no_capital_limit`, `capital_10l`, `capital_20l`, `capital_50l`

Logic summary:

- `RSI(T) < 30`
- `WILLR(T) < -80`
- `Close(T) > Close(T-1)`
- enter on `T+1 open`
- exit on `+1.25%`

Rationale:

- aggressive oversold rebound capture
- highest activity of the three v1 strategies
- intended to perform best when sharp weakness snaps back quickly

Expected regime behavior:

- strongest in `Shock` / `Volatile` rebound windows
- weaker in slow grind-down markets where oversold can stay oversold

Reference:

- `docs/backtesting/strategies/rsi30_willr80_closegtprev_tp125_v1.md`

### `rsi_reclaim30_willr_reclaim80_greenclose_tp200_sl200_max10`

- Display name: `Confirmed Oversold Recovery`
- Active version: `rsi_reclaim30_willr_reclaim80_greenclose_tp200_sl200_max10_v1`
- Archetype: `mean_reversion_confirmed`
- Scope: `stock_only`
- Universe modes: `single_stock`, `nifty_100`
- Capital modes: `no_capital_limit`, `capital_10l`, `capital_20l`, `capital_50l`

Logic summary:

- `RSI(T-1) < 30` and `RSI(T) >= 30`
- `WILLR(T-1) < -80` and `WILLR(T) >= -80`
- `Close(T) > Close(T-1)`
- `Close(T) > Open(T)`
- enter on `T+1 open`
- exit on first of `+2.00%`, `-2.00%`, or `10-session timeout`

Rationale:

- more selective recovery entry than Strategy 1
- easier to explain as “wait for reclaim, then participate”
- introduces stop and timeout controls for richer comparator behavior

Expected regime behavior:

- usually lower trade count than the fast rebound strategy
- should hold up better than Strategy 1 in messy recovery attempts
- still primarily a mean-reversion style, not a trend engine

Reference:

- `docs/backtesting/strategies/rsi_reclaim30_willr_reclaim80_greenclose_tp200_sl200_max10_v1.md`

### `macd_bullcross_above50dma_rsi55to70_tp400_sl300_max20`

- Display name: `MACD Trend Continuation`
- Active version: `macd_bullcross_above50dma_rsi55to70_tp400_sl300_max20_v1`
- Archetype: `trend_continuation`
- Scope: `stock_only`
- Universe modes: `single_stock`, `nifty_100`
- Capital modes: `no_capital_limit`, `capital_10l`, `capital_20l`, `capital_50l`

Logic summary:

- `Close(T) > SMA50(T)`
- `SMA20(T) > SMA50(T)`
- bullish MACD cross on `T`
- `RSI(T)` between `55` and `70`
- enter on `T+1 open`
- exit on first of `+4.00%`, `-3.00%`, bearish MACD cross next-open, close-below-SMA20 next-open, or `20-session timeout`

Rationale:

- gives the module a true trend-following comparator on day one
- should behave differently from the two oversold strategies
- creates clearer regime separation on the Compare and Regime pages

Expected regime behavior:

- strongest in `Rising` conditions
- can degrade sharply in `Shock` or high-whipsaw `Volatile` regimes
- lower relevance during broad oversold snap-back periods

Reference:

- `docs/backtesting/strategies/macd_bullcross_above50dma_rsi55to70_tp400_sl300_max20_v1.md`

## Registry rules

Every new strategy added to the module must include:

- unique `strategy_id`
- immutable `strategy_version_id`
- structured `config_json`
- explicit `assumptions_json`
- documented archetype
- entry in this registry
- dedicated explainer markdown if the logic is non-trivial
