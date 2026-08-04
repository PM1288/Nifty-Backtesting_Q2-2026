#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="$ROOT/.venv/bin/python"
TOOL="$ROOT/tools/setup_hybrid_catalogue.py"
CATALOGUE="$ROOT/config/catalogues/nifty_hybrid_strategy_catalogue_v1.json"
WAVES="$ROOT/config/catalogues/nifty_hybrid_strategy_test_waves_v1.json"
CSV_DIR="${NIFTY_CSV_DIR:-/home/novius2/data/nifty-50-minute-data/aaditya555/NIFTY50}"
OUTPUT="$ROOT/config/workloads/hybrid_catalogue_v1"
COMMAND="${1:-help}"

common=(--catalogue "$CATALOGUE" --waves "$WAVES" --csv-dir "$CSV_DIR" --output-dir "$OUTPUT")
case "$COMMAND" in
  validate) exec "$PYTHON" "$TOOL" validate "${common[@]}" ;;
  setup) exec "$PYTHON" "$TOOL" setup "${common[@]}" --start 2015-02-02 --end 2025-08-06 --workers 2 --exclude TMPV ;;
  smoke) exec "$PYTHON" "$TOOL" smoke "${common[@]}" --smoke-symbol "${2:-RELIANCE}" ;;
  smoke-run)
    exec "$PYTHON" "$ROOT/tools/run_hybrid_catalogue.py" \
      --catalogue "$CATALOGUE" --csv-dir "$CSV_DIR" \
      --output-dir "$ROOT/outputs/hybrid_catalogue_v1_reliance_smoke" \
      --symbols "${2:-RELIANCE}" --start 2024-01-01 --end 2024-03-31 \
      --workers 2 --exclude TMPV
    ;;
  status) exec "$PYTHON" -m json.tool "$OUTPUT/validation.json" ;;
  full)
    if [[ "${CONFIRM_FULL_HYBRID_RUN:-NO}" != "YES" ]]; then
      echo "READY, NOT STARTED: set CONFIRM_FULL_HYBRID_RUN=YES after operator go-ahead." >&2
      exit 2
    fi
    exec "$PYTHON" "$ROOT/tools/run_hybrid_catalogue.py" \
      --catalogue "$CATALOGUE" --csv-dir "$CSV_DIR" \
      --output-dir "$ROOT/outputs/hybrid_catalogue_v1_full" \
      --start 2015-02-02 --end 2025-08-06 --workers 4 --exclude TMPV
    ;;
  *)
    echo "Usage: $0 {validate|setup|smoke [SYMBOL]|smoke-run [SYMBOL]|status|full}" >&2
    exit 2
    ;;
esac
