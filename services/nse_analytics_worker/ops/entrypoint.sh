#!/usr/bin/env bash
set -euo pipefail

log() {
  echo "[nse-analytics] $*"
}

should_refresh() {
  python - <<'PY'
import os
import psycopg

conn = psycopg.connect(os.environ["DATABASE_URL"])
with conn, conn.cursor() as cur:
    cur.execute("SELECT MAX(trade_date) FROM nse.fact_eod_prices")
    raw_max = cur.fetchone()[0]
    cur.execute("SELECT MAX(trade_date) FROM nse_app.market_summary_daily")
    analytics_max = cur.fetchone()[0]

if raw_max is None:
    print("SKIP_NO_RAW_DATA")
elif analytics_max is not None and analytics_max >= raw_max:
    print("UP_TO_DATE")
else:
    print("RUN_NOW")
PY
}

cd /app
log "container start"
log "running migrations"
python -m app.cli migrate

while true; do
  decision="$(should_refresh | tail -n 1)"
  if [ "$decision" = "RUN_NOW" ]; then
    log "raw data is ahead of analytics, running refresh-all"
    python -m app.cli refresh-all
  else
    log "refresh check: $decision"
  fi
  sleep "${POLL_SECONDS:-1800}"
done
