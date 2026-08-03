# Historical value

Intraday history changes this package from a descriptive dashboard into a much stronger learning system.

## What improves first

### 1) State calibration
With enough sessions, you can estimate:
- how often `trend-day-up` actually behaves like a trend day
- how often `gap-and-go` fails later
- whether `late-day-reversal` tends to continue or mean-revert next day

### 2) Threshold tuning
Current thresholds are conservative heuristics.
History lets you tune:
- minimum breadth for a trustworthy trend day
- concentration threshold for narrow leadership
- required open-range expansion for gap-and-go

### 3) Regime-conditional learning
You can compare:
- continuation setups on broad-participation days
- mean-reversion setups on failed-open days
- reversal setups on high-volatility chop days

### 4) Stock-pattern persistence
For each stock-level dominant signal, history helps answer:
- which signals persist into the next 15/30/60 minutes
- which signals are mostly noise
- whether signal quality differs by market state

## Recommended retention strategy

To manage size:

- keep raw minute bars in PostgreSQL for a bounded window, for example 180 days
- keep compact feature and session-summary tables for much longer
- optionally export older raw history to cold storage if you want multi-year replay

## Recommended history-first analyses

1. State-level next-day follow-through
2. Broad-participation vs narrow-leadership reliability
3. Gap-and-go failure rate
4. Failed-open mean-reversion behavior
5. Late-day reversal persistence
6. Signal-family quality by state

## Important boundary

Historical conclusions should be presented as:
- sample size
- average outcome
- hit rate
- caveats

Do not turn them into deterministic statements.
