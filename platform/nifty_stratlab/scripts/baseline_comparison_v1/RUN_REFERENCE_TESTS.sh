#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
mkdir -p "$ROOT/evidence/baseline_comparison_v1"
cd "$ROOT"
python3 "$SCRIPT_DIR/validate_suite.py"
python3 "$SCRIPT_DIR/reference_golden_suite.py"
echo "PASS: baseline suite reference tests completed"
