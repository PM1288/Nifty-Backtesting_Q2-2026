#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python_bin="$repo_dir/platform/nifty_stratlab/.venv/bin/python"
tool="$repo_dir/platform/nifty_stratlab/tools/run_oiis_all_signal_capture.py"

if [[ ! -x "$python_bin" ]]; then
  echo "Compatible project environment is missing: $python_bin" >&2
  exit 2
fi

cd "$repo_dir"
exec "$python_bin" "$tool" "$@"
