# ADR-012: Bounded NIFTY Research Platform

## Status

Accepted for additive integration; production publication adapters remain gated.

## Context

The stack already has live Go writers, Python analytics, option-chain capture,
published `nse_app` backtesting marts, and user-facing APIs. The supplied five-phase
programme requires stricter point-in-time data, exact economics, resumability,
leakage controls, actual-premium options, and parity evidence. Embedding these rules
independently into existing services would create competing implementations.

## Decision

Place the canonical implementation at `platform/nifty_stratlab`. Additive research
schemas are `catalog`, `research`, and `simulation`, centrally migrated by root SQL
014–018. Existing services integrate through narrow adapters after parity evidence.
The SmartAPI collector remains unchanged; `nse_app` remains the published dashboard
owner during reconciliation.

## Consequences

- One canonical Python contract covers time, fees, features, execution, replay,
  discovery, options, parity, and packs.
- Research compute is isolated from live ingestion latency.
- Existing outputs remain available but known current-member and charge-fallback
  limitations are not treated as canonical.
- Production migration is explicit and separate from runtime service startup.
- Historical universe acceptance is blocked until overlapping open-ended rows and
  pre-2026 coverage are corrected.
- Broker contract-note evidence and qualified option history remain external gates.
