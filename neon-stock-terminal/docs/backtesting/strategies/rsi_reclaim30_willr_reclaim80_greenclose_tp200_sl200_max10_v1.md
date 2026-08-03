# Confirmed Oversold Recovery

## IDs

- Strategy ID: `rsi_reclaim30_willr_reclaim80_greenclose_tp200_sl200_max10`
- Version ID: `rsi_reclaim30_willr_reclaim80_greenclose_tp200_sl200_max10_v1`
- Archetype: `mean_reversion_confirmed`

## Entry

Signal on day `T` requires:

- `RSI(T-1) < 30` and `RSI(T) >= 30`
- `WILLR(T-1) < -80` and `WILLR(T) >= -80`
- `Close(T) > Close(T-1)`
- `Close(T) > Open(T)`
- tradable stock only
- no existing open trade in the same scenario

Execution:

- enter on `T+1 open`

## Exit

Exit at the earliest of:

- `+2.00%` target
- `-2.00%` stop
- `10-session` timeout

Conflict rule:

- if target and stop are both touched on the same daily bar, use conservative stop-first precedence

## Why it exists

- more selective recovery logic than Fast Oversold Rebound
- easier to explain as “wait for reclaim, then participate”
- introduces explicit risk control for comparator depth

## Typical behavior

- lower trade count than Strategy 1
- slightly longer hold profile
- cleaner recovery participation, but can miss the earliest bounce
