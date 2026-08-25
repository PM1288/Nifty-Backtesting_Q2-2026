#!/usr/bin/env bash
set -euo pipefail

export TZ="${TZ:-Asia/Kolkata}"

log() {
  printf '[nse] %s\n' "$*"
}

should_run_today() {
  python - <<'PY'
import os
from datetime import datetime
from zoneinfo import ZoneInfo

import psycopg

tz_name = os.environ.get("TZ", "Asia/Kolkata")
threshold = os.environ.get("RUN_THRESHOLD", "07:00")
weekday_only = os.environ.get("WEEKDAY_ONLY", "true").strip().lower() == "true"
tz = ZoneInfo(tz_name)
now = datetime.now(tz)

if weekday_only and now.isoweekday() > 5:
    print("SKIP_NOT_WEEKDAY")
    raise SystemExit(0)

hour, minute = map(int, threshold.split(":", 1))
if (now.hour, now.minute) < (hour, minute):
    print("SKIP_BEFORE_THRESHOLD")
    raise SystemExit(0)

sql = """
select 1
from nse.ingest_runs
where status = 'success'
  and run_mode in ('sync', 'load-bundle')
  and (started_at at time zone %(tz)s)::date = (now() at time zone %(tz)s)::date
limit 1
"""

with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
    with conn.cursor() as cur:
        cur.execute(sql, {"tz": tz_name})
        row = cur.fetchone()

print("ALREADY_DONE_TODAY" if row else "RUN_NOW")
PY
}

run_sync() {
  local backfill_days="${BACKFILL_DAYS:-7}"
  log "starting sync with backfill_days=${backfill_days}"
  python -m app.cli sync --backfill-days "${backfill_days}"
}

cd /app

log "container start at $(date '+%Y-%m-%d %H:%M:%S %Z')"
log "starting exchange-calendar-aware scheduler for ${SCHEDULE_TIME:-07:55} ${TZ}"
exec python -m app.cli scheduler
