# ATM Combo

## Definition

At each timestamp:

1. use the stored underlying spot
2. find the nearest listed strike for that timestamp
3. treat that strike as the dynamic ATM strike
4. fetch CE LTP and PE LTP for that strike
5. compute:

`atm_combo = ce_ltp + pe_ltp`

## Session open baseline

The app also computes:

- `open_combo = first valid atm_combo print of the session`
- `combo_delta = atm_combo - open_combo`
- `combo_delta_pct = combo_delta / open_combo`

## Why the chart exists

The top chart answers:

- how expensive the current ATM premium basket is over the session

The bottom chart answers:

- whether ATM premium is rich or cheap relative to session open

## Current chart contract

### Chart 1

- title: `ATM CE+PE Combo`
- x-axis: `Time`
- y-axis: `Combo Value (pts)`
- series:
  - ATM combo line
  - session-open dashed reference line
  - gold markers when ATM strike changes

### Chart 2

- title: `ATM Combo Direction / Delta from Open`
- x-axis: `Time`
- y-axis: `Delta vs Open (pts)`
- histogram above/below zero
- green positive bars
- red negative bars

## Fallback rules

- if no valid combo exists for the session, combo metrics return null and the UI falls back to explanatory empty text
- ATM strike changes are marked only when both the combo and strike are valid
