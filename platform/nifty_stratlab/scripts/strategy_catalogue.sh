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
  status) exec "$PYTHON" -m json.tool "$OUTPUT/validation.json" ;;
  full)
    echo "BLOCKED: full execution is not authorized until all entry detectors and D2/D3 point-in-time data gates pass." >&2
    exit 2
    ;;
  *)
    echo "Usage: $0 {validate|setup|smoke [SYMBOL]|status|full}" >&2
    exit 2
    ;;
esac
