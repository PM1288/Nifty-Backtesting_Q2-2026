# Operator runbook

Run from `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026`.

```bash
platform/nifty_stratlab/.venv/bin/pip install -e 'platform/nifty_stratlab[postgres,dev]'

docker exec -i trading-stack-novius2-postgres-1 \
  psql -U trader -d tradingdb -v ON_ERROR_STOP=1 \
  < db/sql/024_h30_opportunity_v3.sql

platform/nifty_stratlab/.venv/bin/pytest \
  platform/nifty_stratlab/tests/phase3/test_h30_opportunity_v3.py \
  platform/nifty_stratlab/tests/phase3/test_full_path_ladder_v2.py \
  platform/nifty_stratlab/tests/phase3/test_common_exit_contract.py -q
```

Build a host DSN without printing the password, then run one stock:

```bash
dashboard_dsn="$(docker inspect trading-stack-novius2-n50-dashboard-1 \
  --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^DATABASE_URL=//p')"
host_dsn="${dashboard_dsn/@postgres/@100.86.108.108}"
host_dsn="${host_dsn%%\?*}"

platform/nifty_stratlab/.venv/bin/python \
  platform/nifty_stratlab/tools/run_oiis_cash_daily_replay.py \
  --database-url "$host_dsn" --symbol RELIANCE \
  --start 2023-08-06 --end 2026-08-05 --workers 1
unset dashboard_dsn host_dsn
```

Do not launch all symbols without a fresh accepted one-symbol run. When ready:

```bash
CONFIRM_FULL_OIIS_REPLAY=YES platform/nifty_stratlab/.venv/bin/python \
  platform/nifty_stratlab/tools/run_oiis_cash_daily_replay.py \
  --database-url "$host_dsn" --start 2023-08-06 --end 2026-08-05 --workers 4
```

Build and deploy the UI/API:

```bash
npm --prefix neon-stock-terminal run --workspace @app/api build
npm --prefix neon-stock-terminal run --workspace @app/web build
docker compose -p trading-stack-novius2 \
  -f /home/novius2/trading-stack/compose/compose.base.yml \
  -f /home/novius2/trading-stack/compose/compose.dev.yml \
  up -d --build n50-dashboard nginx
curl -fsS http://127.0.0.1:19090/api/v1/backtesting/h30/latest | jq
```

The dashboard route is `/backtesting/h30`. A blocked final rank is correct for
a one-stock smoke test; inspect `hard_gate_blockers` rather than overriding it.
