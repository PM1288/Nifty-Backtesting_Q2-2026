# Implementation map

| Concern | Location |
|---|---|
| Pure 30-session evaluator | `platform/nifty_stratlab/src/nifty_stratlab/evaluation/long_horizon_opportunity.py` |
| Governed summary/ranking | `platform/nifty_stratlab/src/nifty_stratlab/evaluation/horizon_ranking.py` |
| Deterministic matplotlib charts | `platform/nifty_stratlab/src/nifty_stratlab/reporting/month_density_charts.py` |
| CSV/Parquet/Excel/Markdown report | `platform/nifty_stratlab/src/nifty_stratlab/reporting/h30_report.py` |
| OIIS production adapter | `platform/nifty_stratlab/tools/run_oiis_cash_daily_replay.py` |
| PostgreSQL schema | `db/sql/024_h30_opportunity_v3.sql` |
| Regression tests | `platform/nifty_stratlab/tests/phase3/test_h30_opportunity_v3.py` |
| API | `GET /v1/backtesting/h30/latest`, artifact endpoint in `backtesting.ts` |
| UI | `/backtesting/h30`, also linked from the sidebar and backtesting tabs |

Every run folder contains normal strategy artifacts plus:

- `h30_observations.csv` and `.parquet`
- `h30_checkpoints.csv` and `.parquet`
- `h30_ranking.json` and `h30_summary.md`
- exactly two primary chart subjects, each in PNG and SVG
- one chart-source CSV
- `strategy_evaluation.xlsx` with read-me, observation, checkpoint, ranking
  and embedded-chart sheets

PostgreSQL stores normalized observations/checkpoints plus summary, ranking and
chart manifests under `strategy_eval`. Chart files remain filesystem artifacts;
the API serves only paths previously registered in `chart_artifact`.
