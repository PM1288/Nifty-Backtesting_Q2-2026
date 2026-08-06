# OIIS low-context test runbook

1. Work only in `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026` on
   `DEV_PM_CODE`.
2. Run `./scripts/oiis.sh validate-config`.
3. Export `DATABASE_URL`; never write its password into committed files.
4. Run one RELIANCE replay using `OIIS_OPERATOR_RUNBOOK.md`.
5. Confirm command status `SUCCEEDED`, non-zero decisions, all regime columns
   populated for post-warmup rows, and PostgreSQL/artifact counts reconcile.
6. Run `./scripts/oiis.sh verify <output-dir>`.
7. Run `.venv/bin/pytest -q tests/phase3/test_oiis_cash_daily.py` from
   `platform/nifty_stratlab`.
8. Do not run all symbols without `CONFIRM_FULL_OIIS_REPLAY=YES`.
9. Never interpret a successful pipeline test as proof of strategy quality.
