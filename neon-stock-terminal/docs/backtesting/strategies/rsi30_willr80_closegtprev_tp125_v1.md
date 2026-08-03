# Fast Oversold Rebound

## IDs

- Strategy ID: `rsi30_willr80_closegtprev_tp125`
- Version ID: `rsi30_willr80_closegtprev_tp125_v1`
- Archetype: `mean_reversion_fast`

## Entry

Signal on day `T` requires:

- `RSI(T) < 30`
- `WILLR(T) < -80`
- `Close(T) > Close(T-1)`
- tradable stock only
- no existing open trade in the same scenario

Execution:

- enter on `T+1 open`

## Exit

- target price = `entry_price * 1.0125`
- if open gaps through target, exit at open
- else if intraday high touches target, exit at target
- else continue holding

## Why it exists

- simplest oversold rebound strategy in the module
- easy to audit
- useful baseline for more selective mean-reversion logic

## Typical behavior

- more trades than the other two v1 strategies
- faster holding profile
- more exposed to false rebounds in unstable markets
