# ADR-003 Regime Classification v1

## Status

Accepted

## Decision

Trade-level regime attribution uses the regime on the entry date only in v1.

Suggested precedence:

- `Shock`
- `Volatile`
- `Rising`
- `Falling`
- `Neutral`

## Why

- deterministic and cheap to compute
- easy to explain on regime breakdown pages
- sufficient for first-pass strategy comparison

## Consequence

Holding-period regime transitions are not attributed in v1. If that becomes important, add a new regime-attribution version rather than silently redefining historical summaries.
