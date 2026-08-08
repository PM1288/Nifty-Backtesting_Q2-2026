#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python_bin="$repo_root/platform/nifty_stratlab/.venv/bin/python"
tool="$repo_root/platform/nifty_stratlab/tools/oiis_doe_v2.py"
command="${1:-}"
shift || true

case "$command" in
  inventory|qualify-data|preflight|register-existing-trials|reproduce-baseline|run-component-screening|run-redundancy-study|run-walk-forward|run-finite-capital|export|resume|status|verify)
    experiment_id=""
    previous=""
    for argument in "$@"; do
      if [[ "$previous" == "--experiment-id" ]]; then experiment_id="$argument"; fi
      previous="$argument"
    done
    current_file="$repo_root/platform/nifty_stratlab/outputs/oiis_complete_screening_v2/CURRENT_EXPERIMENT"
    if [[ -z "$experiment_id" && -f "$current_file" ]]; then experiment_id="$(tr -d '[:space:]' < "$current_file")"; fi
    if [[ -n "$experiment_id" ]]; then
      log_dir="$repo_root/platform/nifty_stratlab/outputs/oiis_complete_screening_v2/$experiment_id/logs"
      mkdir -p "$log_dir"
      log_file="$log_dir/${command}_$(date -u +%Y%m%dT%H%M%SZ)_$$.log"
      "$python_bin" "$tool" "$command" "$@" 2>&1 | tee "$log_file"
      exit "${PIPESTATUS[0]}"
    fi
    exec "$python_bin" "$tool" "$command" "$@"
    ;;
  *)
    echo "Usage: $0 {inventory|qualify-data|preflight|register-existing-trials|reproduce-baseline|run-component-screening|run-redundancy-study|run-walk-forward|run-finite-capital|verify|export|status|resume} [options]" >&2
    exit 2
    ;;
esac
