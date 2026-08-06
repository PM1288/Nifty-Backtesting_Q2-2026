# Profit, Tax and Capital Calculations

## Position size

For the standard scenario:

```text
ticket = ₹200,000
quantity = floor(ticket / entry_price)
entry_notional = quantity × entry_price
```

Fractional shares are not allowed. Unused ticket cash remains available.

## Target price

For a long trade and NSE tick size `tick`:

```text
raw_target = entry_price × (1 + target_pct / 100)
target_price = ceil(raw_target / tick) × tick
```

Ceiling is mandatory: tick rounding must never reduce a 0.30% or 1.00% mandate.

## Closed-trade economics

The current OIIS/hybrid research proxy applies total round-trip costs to entry
notional: 8 bps for an intraday close and 22 bps for a swing/delivery close.
This proxy remains non-certified and is a rankability warning.

```text
gross_pnl = (exit_price - entry_price) × quantity
costs = entry_notional × round_trip_cost_bps / 10,000
pre_tax_pnl = gross_pnl - costs
tax_reserve = max(pre_tax_pnl, 0) × 35%
after_tax_net_pnl = pre_tax_pnl - tax_reserve
```

Tax is reserved only against positive realised profit. It never converts a
loss into a tax benefit. The principal and remaining after-tax proceeds return
to cash only after a target fill.

## Open-position economics

An unresolved position has:

```text
realised_pnl = 0
tax_reserve = 0
estimated_exit_cost = entry_notional × 22 bps / 10,000
unrealized_net_liquidation_pnl =
    (last_available_close - entry_price) × quantity - estimated_exit_cost
```

This estimate is included in portfolio equity and risk reporting but is not an
exit, realised P&L, win or capital release.

## Capital scenarios

The finite scenario starts with ₹16,00,000, limits each position to ₹2,00,000
and allows at most eight concurrent positions, subject also to available cash.
Signals arriving while capital is locked must be recorded as skipped with a
reason. Same-day reuse is allowed only after an earlier target fill is
chronologically executable.

The unlimited-capital scenario accepts every otherwise eligible entry and is a
capacity study. Its rupee P&L must not be ranked against the finite portfolio as
if both used the same capital.

The current OIIS Phase-A runner is still an isolated per-symbol study. It does
not yet implement the parent ₹16 lakh allocator and therefore cannot make a
deployable portfolio claim.
