# Implementation Map

## Canonical engine

`platform/nifty_stratlab/src/nifty_stratlab/evaluation/full_path_ladder.py`

- immutable full-path V2 policy;
- I030/I050/I070 and S100/S200/S500 event evidence;
- A050/A100/A200/A500/A1000 adverse evidence;
- upward NSE tick rounding;
- no break or return at any ladder event;
- six D0-D+5 checkpoints and cumulative invariants.

`simulation/execution_scenarios.py` separately implements the
`EXEC-I030-ELSE-S100-NO-TIMEOUT-V2` sale/economics policy. `common_exit.py` is a
compatibility facade and must not reintroduce path truncation.

## Shared event simulator

`simulation/models.py` and `simulation/engine.py` now support an explicit
`target_only_exit_contract`. Validation rejects a configuration that combines
this contract with enabled stops. Strategy-emitted exits and max-hold timeouts
are ignored for this contract. The daily rising oversold runner enables it and
uses a null/zero stop setting.

## Hybrid catalogue

`tools/run_hybrid_catalogue.py` calls the canonical evaluator. It now evaluates
the entry bar for I030, reports open positions and unrealised net-liquidation
P&L, records MFE/MAE, and releases a symbol only on a target close. All strategy
entry rules remain unchanged.

## OIIS

OIIS formula `OIIS-CASH-DAILY-RESEARCH-V1.3` replaces both the invalid V1.0
2R/stop/ten-session model and the truncated ladder evidence in V1.1. OIIS still
creates daily entry eligibility, but
accepted entries are evaluated against one-minute IST OHLC from the canonical
CSV estate. Each CSV session is normalised to its matching canonical EOD open
to prevent retrospective split/bonus adjustment from changing historical
position size. Outputs include normalized path, target, adverse and checkpoint
CSVs. V1.2 path labels are valid where successful, but its execution adapter
incorrectly stopped at D+5 and is superseded by V1.3.

The OIIS database schema now permits null exit/stop fields and stores
`position_status`, `unrealized_net_liquidation_pnl`, `capital_released` and the
full target/adverse event JSON. Closed and open counts are separated.

## Reports and consumers

`trades.csv` identifies policy, status, exit stage, realised P&L, open
net-liquidation P&L, MFE, MAE, no-stop/no-timeout flags and capital release.
Summary JSON separates accepted positions, closed trades, open positions,
realised after-tax P&L and total net-liquidation P&L. Regime buckets calculate
win rate from closed positions and retain open exposure in their metrics JSON.
