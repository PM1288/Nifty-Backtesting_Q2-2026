# ADR-002 Finite Capital Allocation

## Status

Accepted

## Decision

Finite-capital scenarios use fixed ticket sizing:

- ticket size = `starting_cash / 10`
- max open positions = `10`
- quantity = `floor(ticket_size / entry_price)`

## Why

- deterministic
- easy to explain in UI helper text
- comparable across capital buckets
- bounded simultaneous exposure

## Consequence

This is intentionally simpler than dynamic position sizing. More advanced sizing rules should be added as new strategy config options, not by changing v1 behavior.
