# OIIS evidence index

- Source review and chosen formula decisions:
  `OIIS_CANONICAL_FORMULA_DECISION_REGISTER.md`
- Data lineage: `OIIS_DATA_MAPPING.md`
- Operator commands: `OIIS_OPERATOR_RUNBOOK.md`
- Low-context verification: `OIIS_LOW_CONTEXT_TEST_RUNBOOK.md`
- Known limitations: `OIIS_LIMITATIONS.md`
- Formula configuration:
  `platform/nifty_stratlab/config/oiis/formulas/oiis_cash_daily_research_v1.json`
- Full workload:
  `platform/nifty_stratlab/config/workloads/oiis_cash_daily_research_v1.json`
- Migration: `db/sql/021_oiis_research.sql`
- Pure engine: `platform/nifty_stratlab/src/nifty_stratlab/oiis/engine.py`
- Replay: `platform/nifty_stratlab/tools/run_oiis_cash_daily_replay.py`
- Generated test result: `reports/oiis/OIIS_TEST_RESULTS.json`
