#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
lab="$repo_root/platform/nifty_stratlab"
python_bin="$lab/.venv/bin/python"

case "${1:-}" in
  validate-config)
    shift
    exec "$python_bin" "$lab/tools/validate_oiis_config.py" "$@"
    ;;
  preflight)
    shift
    "$python_bin" "$lab/tools/validate_oiis_config.py"
    test -n "${DATABASE_URL:-}" || { echo "DATABASE_URL is required" >&2; exit 2; }
    "$python_bin" -c 'import os,psycopg; c=psycopg.connect(os.environ["DATABASE_URL"]); q=c.execute("SELECT COUNT(DISTINCT UPPER(TRIM(symbol))) FROM nse.fact_eod_prices WHERE trade_date >= CURRENT_DATE-INTERVAL '\''3 years'\''").fetchone()[0]; c.close(); assert q >= 100, q; print(f"PASS: PostgreSQL reachable, {q} symbols have recent EOD data")'
    ;;
  replay)
    shift
    exec "$python_bin" "$lab/tools/run_oiis_cash_daily_replay.py" "$@"
    ;;
  verify)
    shift
    exec "$python_bin" "$lab/tools/verify_oiis_replay.py" "$@"
    ;;
  *)
    echo "Usage: $0 {validate-config|preflight|replay|verify} [arguments]" >&2
    exit 2
    ;;
esac
