# Assumptions

## Data frequency and scope

- daily bars only
- no intraday signal generation
- no same-day close entry after evaluating same-day close conditions
- execution universe is `stock_only`
- index instruments such as Nifty, Bank Nifty, and India VIX are never tradable in the strategy engine

## Entry timing

Signal is evaluated on completed day `T`.

Entry executes on `T+1 open`.

This is the main protection against look-ahead bias across all three v1 strategies.

## Exit timing

### Strategy 1

- target-only exit
- if a later session opens above target, exit at open
- else if later session high reaches target, exit at target
- else continue holding

### Strategy 2

- first of `+2.00%`, `-2.00%`, or timeout
- if open gaps beyond target, exit at open
- if open gaps beyond stop, exit at open
- if low and high both cross stop and target on the same bar, use conservative stop-first precedence
- timeout exits on the next open after 10 completed sessions

### Strategy 3

- first of `+4.00%`, `-3.00%`, bearish MACD cross next-open, close-below-SMA20 next-open, or timeout
- if low and high both cross stop and target on the same bar, use conservative stop-first precedence
- bearish MACD cross and close-below-SMA20 are end-of-day signal exits that trigger on the next session open
- timeout exits on the next open after 20 completed sessions

## Same-bar conflict handling

When stop and target are both touched in the same daily bar for Strategy 2 or Strategy 3:

- assume the stop is hit first
- record the exit as `stop_intraday_conflict_conservative`

This is intentionally conservative.

## Indicators

- RSI: platform default, currently `RSI-14`
- WILLR: platform default, currently `WILLR-14`
- MACD: standard `12,26,9`
- SMA20: 20-session simple moving average
- SMA50: 50-session simple moving average

## Ranking rules in Nifty 100 mode

### Strategy 1 and Strategy 2

Same-day competing signals are ranked by:

1. `entry_date` ascending
2. lower RSI first
3. lower WILLR first
4. larger positive `close_vs_prev_close_pct` first
5. `symbol` ascending

### Strategy 3

Same-day competing signals are ranked by:

1. `entry_date` ascending
2. larger MACD spread above signal first
3. stronger RSI first
4. larger distance above SMA50 first
5. `symbol` ascending

## Capital allocation

Finite-capital scenarios use:

- starting cash: `10L`, `20L`, or `50L`
- fixed ticket size: `starting_cash / 10`
- `max_open_positions = 10`
- shares: `floor(ticket_size / entry_price)`
- no leverage
- no negative cash

No-capital-limit mode is a signal-outcome study and should never skip trades for cash reasons.

## Charges

- charges are computed in the worker
- the worker reuses the simulator delivery-equity charge model when importable
- charges are persisted at trade/output level and not recomputed in the frontend
- scenario-level `totalCharges` includes closed-trade charges plus entry-side charges already embedded in any still-open positions for the same scenario

## FD benchmark

- finite-capital scenarios use a daily-compounded 6% annual FD curve
- unlimited mode uses a normalized 100-base FD comparison
- benchmark curves are precomputed and stored by batch

## Regime methodology

Daily market regime is derived from:

- Nifty 50 daily return
- India VIX daily level and daily change
- Nifty 50 trend vs `50DMA`
- `20DMA` vs `50DMA`
- rolling 20-session return

Precedence:

- `Shock`
- `Volatile`
- `Rising` / `Falling`
- `Neutral`

Trade-level regime attribution in v1 uses entry-date regime only.

## Universe methodology

- v1 uses current-member universe membership from `instrument_universe`
- membership drift is therefore a documented limitation
- only tradable equities are included in candidate generation and replay

## Open trades

- open trades are not force-closed at the end of the batch window
- they remain mark-to-market using the latest close
- open positions are excluded from closed-trade win-rate calculations

## Known limitations

- current-members-only universe history in v1
- no corporate-action-specific adjustment layer inside Backtesting beyond whatever the source feature table already contains
- no slippage model beyond next-open execution and exchange charges
- compare, regime, and stock pages are snapshot readers, not ad-hoc compute tools
- the API serves published batches only in normal operation; seeded fallback exists only as an explicit development opt-in
