# Full-Path Ladder V2 Evidence Index

## Code and configuration

- Evaluator: `platform/nifty_stratlab/src/nifty_stratlab/evaluation/full_path_ladder.py`
- Execution scenarios: `platform/nifty_stratlab/src/nifty_stratlab/simulation/execution_scenarios.py`
- Compatibility facade: `platform/nifty_stratlab/src/nifty_stratlab/evaluation/common_exit.py`
- OIIS runner: `platform/nifty_stratlab/tools/run_oiis_cash_daily_replay.py`
- Policy: `platform/nifty_stratlab/config/evaluation/full_path_ladder_evaluation_policy_v2.json`
- Schema: `db/sql/022_full_path_ladder_v2.sql`
- Governance: `db/sql/023_full_path_ladder_run_governance.sql`
- Golden tests: `platform/nifty_stratlab/tests/phase3/test_full_path_ladder_v2.py`

## Canonical artifacts

Directory:
`platform/nifty_stratlab/outputs/oiis_cash_daily_research_v1/53b5bb32-6a33-470f-9884-8613fa18ad21/`

- `entry_path_evaluations.csv`: one row per accepted path
- `target_events.csv`: exactly six reward rows per accepted path
- `adverse_events.csv`: exactly six adverse rows per accepted path
- `path_checkpoints.csv`: D0 through D+5
- `trades.csv`: selected execution scenario only
- `decisions.csv`: every daily decision and regime context
- `regime_performance.csv`: consolidated slices
- `summary.json`, `summary.md`, `checksums.sha256`

PostgreSQL tables: `strategy_eval.entry_path_evaluation`,
`strategy_eval.ladder_event`, `strategy_eval.path_checkpoint`, and
`strategy_eval.execution_scenario_result`. Run metadata remains in
`oiis.replay_run`.
