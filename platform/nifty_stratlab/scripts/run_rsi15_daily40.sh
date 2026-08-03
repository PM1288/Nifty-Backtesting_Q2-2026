#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PYTHON="${NIFTY_STRATLAB_PYTHON:-$ROOT/.venv/bin/python}"
STARTER_ZIP="${RSI15_STARTER_ZIP:-/home/novius2/NIFTY50/Test-Strat/NIFTY_RSI15_DAILY40_STRATEGY_STARTER_V1.0.zip}"
DEFAULT_CSV="${RSI15_MINUTE_CSV:-/home/novius2/data/nifty-50-minute-data/aaditya555/NIFTY50/RELIANCE.csv}"
DEFAULT_DATA_ROOT="${RSI15_DATA_ROOT:-/home/novius2/data/nifty-50-minute-data/aaditya555/NIFTY50}"
ARTIFACT_ROOT="${NIFTY_ARTIFACT_ROOT:-$ROOT/artifacts/backtests}"
BATCH_TMP=""

cleanup_batch() {
  if [[ -n "${BATCH_TMP:-}" && -d "$BATCH_TMP" ]]; then
    rm -rf -- "$BATCH_TMP"
  fi
}

require_runtime() {
  [[ -x "$PYTHON" ]] || { echo "ERROR: Python environment missing: $PYTHON" >&2; exit 2; }
  [[ -f "$STARTER_ZIP" ]] || { echo "ERROR: starter ZIP missing: $STARTER_ZIP" >&2; exit 2; }
}

extract_starter() {
  STARTER_TMP="$(mktemp -d /tmp/nifty-rsi15-starter.XXXXXX)"
  unzip -q "$STARTER_ZIP" -d "$STARTER_TMP"
  STARTER_ROOT="$STARTER_TMP/NIFTY_RSI15_DAILY40_STRATEGY_STARTER_V1.0"
}

sample_run() {
  require_runtime
  extract_starter
  local output="$ARTIFACT_ROOT/rsi15_daily40_golden_$(date -u +%Y%m%dT%H%M%SZ)"
  PYTHONPATH="$ROOT/src" "$PYTHON" "$ROOT/tools/run_rsi15_daily40_backtest.py" \
    --csv "$STARTER_ROOT/tests/fixtures/minute_bars.csv" \
    --daily-csv "$STARTER_ROOT/tests/fixtures/daily_bars.csv" \
    --symbol AAA --start 2026-07-31 --end 2026-07-31 \
    --output-dir "$output"
  printf '%s\n' "$output" > "$ARTIFACT_ROOT/.last_rsi15_daily40_run"
  echo "Review report: $output/report.html"
}

bounded_run() {
  [[ $# -eq 4 ]] || { echo "Usage: $0 run SYMBOL START END MINUTE_CSV" >&2; exit 64; }
  require_runtime
  local symbol="$1" start="$2" end="$3" csv="$4"
  [[ -f "$csv" ]] || { echo "ERROR: CSV missing: $csv" >&2; exit 2; }
  local output="$ARTIFACT_ROOT/rsi15_daily40_${symbol}_${start}_${end}_$(date -u +%Y%m%dT%H%M%SZ)"
  PYTHONPATH="$ROOT/src" "$PYTHON" "$ROOT/tools/run_rsi15_daily40_backtest.py" \
    --csv "$csv" --symbol "$symbol" --start "$start" --end "$end" --output-dir "$output"
  printf '%s\n' "$output" > "$ARTIFACT_ROOT/.last_rsi15_daily40_run"
  echo "Review report: $output/report.html"
}

run_to_dir() {
  local symbol="$1" start="$2" end="$3" csv="$4" output="$5"
  PYTHONPATH="$ROOT/src" "$PYTHON" "$ROOT/tools/run_rsi15_daily40_backtest.py" \
    --csv "$csv" --symbol "$symbol" --start "$start" --end "$end" --output-dir "$output"
}

all_run() {
  require_runtime
  local data_root="${1:-$DEFAULT_DATA_ROOT}"
  local start="${2:-2025-01-01}"
  local end="${3:-2026-08-02}"
  [[ -d "$data_root" ]] || { echo "ERROR: data root missing: $data_root" >&2; exit 2; }
  local output="$ARTIFACT_ROOT/full_rsi15_daily40_$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$output"
  BATCH_TMP="$(mktemp -d /tmp/nifty-rsi15-batch.XXXXXX)"
  trap cleanup_batch EXIT
  local ledger="$output/status.tsv"
  printf 'strategy\tsymbol\tcsv\tstatus\tstarted_at\tfinished_at\n' > "$ledger"
  echo "$output" > "$ARTIFACT_ROOT/.last_rsi15_daily40_run"
  local csv symbol run_dir started_at finished_at status attempted=0
  while IFS= read -r csv; do
    attempted=$((attempted + 1))
    symbol="$(basename "$csv" .csv)"
    run_dir="$BATCH_TMP/$symbol"
    started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "RUN $symbol $csv $started_at" | tee -a "$output/driver.log"
    set +e
    run_to_dir "$symbol" "$start" "$end" "$csv" "$run_dir" >>"$output/full_run.log" 2>&1
    status=$?
    set -e
    finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    if [[ $status -eq 0 ]]; then
      echo "OK $symbol $finished_at" | tee -a "$output/driver.log"
    else
      echo "FAIL $symbol $finished_at rc=$status" | tee -a "$output/driver.log"
    fi
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "rsi15_daily40_intraday_v1" "$symbol" "$csv" "$status" "$started_at" "$finished_at" >> "$ledger"
  done < <(find -L "$data_root" -maxdepth 1 -type f -name '*.csv' | sort)
  [[ $attempted -gt 0 ]] || { echo "ERROR: no CSV files found under $data_root" >&2; return 3; }
  set +e
  PYTHONPATH="$ROOT/src" "$PYTHON" "$ROOT/tools/consolidate_rsi15_daily40_results.py" \
    --results-root "$BATCH_TMP" --output-dir "$output" --status-tsv "$ledger" >>"$output/full_run.log" 2>&1
  local consolidate_status=$?
  set -e
  [[ $consolidate_status -eq 0 ]] || echo "WARNING: one or more symbols failed; consolidated successful symbols" | tee -a "$output/driver.log"
  printf '%s\n' "$output" > "$ARTIFACT_ROOT/.last_rsi15_daily40_run"
  echo "Review report: $output/report.html"
  return "$consolidate_status"
}

case "${1:-help}" in
  check)
    require_runtime
    extract_starter
    (cd "$STARTER_ROOT" && ./RUN_REFERENCE_GOLDEN.sh)
    PYTHONPATH="$ROOT/src" "$PYTHON" -m pytest "$ROOT/tests/phase2/test_features.py" "$ROOT/tests/phase2/test_rsi_daily_regime.py"
    ;;
  sample) sample_run ;;
  run) shift; bounded_run "$@" ;;
  all)
    shift
    all_run "$@"
    ;;
  reliance-small)
    bounded_run RELIANCE 2025-07-01 2025-07-07 "$DEFAULT_CSV"
    ;;
  last)
    last_file="$ARTIFACT_ROOT/.last_rsi15_daily40_run"
    [[ -s "$last_file" ]] || { echo "ERROR: no prior RSI15/Daily40 run" >&2; exit 3; }
    run_dir="$(tr -d '[:space:]' < "$last_file")"
    echo "$run_dir/report.html"
    ;;
  help|-h|--help)
    cat <<EOF
Usage: $(basename "$0") COMMAND

  check                           Verify supplied golden logic and canonical RSI tests
  sample                          Run only the tiny AAA golden fixture and build HTML/charts
  reliance-small                  Run a five-session RELIANCE smoke slice
  run SYMBOL START END CSV        Run an explicit bounded slice (never scans a directory)
  all [ROOT] [START] [END]        Run all CSVs into one consolidated strategy report folder
  last                            Print the most recent report path

This script has no broker-order authority and does not write to PostgreSQL.
It intentionally provides no implicit full-history command: full scope must be explicit.
EOF
    ;;
  *) echo "ERROR: unknown command: $1" >&2; exit 64 ;;
esac
