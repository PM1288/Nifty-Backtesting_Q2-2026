# MACD Trend Continuation

## IDs

- Strategy ID: `macd_bullcross_above50dma_rsi55to70_tp400_sl300_max20`
- Version ID: `macd_bullcross_above50dma_rsi55to70_tp400_sl300_max20_v1`
- Archetype: `trend_continuation`

## Entry

Signal on day `T` requires:

- `Close(T) > SMA50(T)`
- `SMA20(T) > SMA50(T)`
- `MACD_line(T) > MACD_signal(T)`
- `MACD_line(T-1) <= MACD_signal(T-1)`
- `55 <= RSI(T) <= 70`
- tradable stock only
- no existing open trade in the same scenario

Execution:

- enter on `T+1 open`

## Exit

Exit at the earliest of:

- `+4.00%` target
- `-3.00%` stop
- bearish MACD cross, next open
- close below `SMA20`, next open
- `20-session` timeout

Conflict rule:

- if target and stop are both touched on the same bar, use conservative stop-first precedence

## Why it exists

- gives the module a true trend-following comparator
- should behave differently from the two oversold strategies
- improves regime clarity on Compare and Regime pages

## Typical behavior

- strongest when leadership is persistent and broad
- weaker in sudden reversal and whipsaw environments
- usually has fewer but larger expected winners than the fast rebound strategy
