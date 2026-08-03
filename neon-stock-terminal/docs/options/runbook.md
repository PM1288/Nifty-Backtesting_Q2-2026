# Option Chain Runbook

## Runtime ownership

The current Option Chain analytics path is owned by the option-chain watcher service.

Primary code:

- `services/option-chain-watcher/src/main.ts`
- `services/option-chain-watcher/src/store.ts`

## Live request path

Frontend:

- `/options`

Watcher endpoints:

- `/option-chain/api/latest`
- `/option-chain/api/series`
- `/option-chain/api/analytics`

## Source of truth

Use:

- `option_chain_snapshots`
- `option_chain_legs`

Do not use the legacy equilibrium service tables for live UI work unless that service is repaired and explicitly promoted back to source of truth.

## Current analytics generation flow

1. fetch the latest snapshot for the selected expiry
2. fetch the latest legs for that snapshot
3. derive ATM from actual listed strikes
4. derive ATM ± 3 strike window
5. fetch all same-day intraday rows for that expiry and strike window
6. fetch all same-day dynamic-ATM rows for combo calculations
7. align timestamps and compute:
   - equilibrium baskets
   - ATM combo
   - expiry context
   - diagnostics
8. return one batched payload to the frontend

## Logging

The analytics endpoint logs:

- trade date
- selected expiry
- current spot
- ATM strike
- strike window
- missing CE/PE series counts
- normalization fallback count
- crossover count
- freshness
- cache/query mode
- request duration

## Failure handling

Guardrails currently implemented:

- lower-strike tie-break on ATM selection
- normalization fallback to `50` when max equals min
- null-safe CE/PE aggregation
- diagnostics counters for missing CE/PE series
- empty/error frontend states when no payload is returned

## Known follow-up work

- snapshot/mart precompute layer for heavy intraday derivatives if read volume increases
- explicit timestamp drift calculation instead of placeholder `0`
- optional advanced overlays for individual strike equilibrium lines
