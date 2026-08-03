# Market-state labels

These labels are heuristic summaries for a learning platform. They are not execution instructions.

## Primary labels

### `trend-day-up`
Typical conditions:
- session return is materially positive
- close is near the session high
- Nifty100 breadth above VWAP is strong
- participation is broad enough to support the move

### `trend-day-down`
Mirror image of `trend-day-up`.

### `gap-and-go-up` / `gap-and-go-down`
Typical conditions:
- opening gap is meaningful
- gap direction and session direction agree
- the gap is not meaningfully filled during the session
- follow-through remains strong

### `gap-fill-or-failed-open`
Typical conditions:
- opening gap is meaningful
- the market returns to prior close or rejects the opening direction
- opening acceptance is weak

### `high-volatility-chop`
Typical conditions:
- intraday range is wide
- net session return is small relative to that range
- multiple sign flips appear in rolling returns

### `late-day-reversal-up` / `late-day-reversal-down`
Typical conditions:
- the session tone at mid-day differs from the closing tone
- the last hour accounts for a large share of the final move

## Secondary labels

### `broad-participation`
Use when:
- a high share of Nifty100 names are positive
- a high share of names are above VWAP
- concentration is not excessive

### `narrow-leadership`
Use when:
- the index is moving
- top contributors account for a very large share of the move
- equal-weight breadth is much weaker than the index impression

### `gap-fill`
Use when the session revisits prior close after a meaningful opening gap.

### `late-reversal`
Secondary tag used in addition to the primary state when reversal conditions are present.

### `chop`
Secondary tag used in addition to the primary state when the session is noisy and non-trending.

## Confidence score

The confidence score is a rule-based score in the current package:
- stronger when multiple criteria line up
- lower when the session is mixed
- not a probability forecast

Historical data should be used later to recalibrate these thresholds and confidence mappings.

## Important boundary

All breadth-related labels in this package refer to the **Nifty 100 basket only** unless a future package expands the intraday universe.
