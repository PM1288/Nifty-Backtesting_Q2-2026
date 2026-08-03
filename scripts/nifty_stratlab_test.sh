#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="${ROOT_DIR}/platform/nifty_stratlab"
VENV_DIR="${PACKAGE_DIR}/.venv"

if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
  python3 -m venv "${VENV_DIR}"
  "${VENV_DIR}/bin/python" -m pip install --upgrade pip
fi

# Reconcile the editable package and its declared test/runtime extras on every run.
# This keeps the runner valid after pyproject.toml dependency changes while pip
# remains fast when the environment already satisfies the lock-free declarations.
"${VENV_DIR}/bin/python" -m pip install -q -e "${PACKAGE_DIR}[dev,postgres]"

cd "${PACKAGE_DIR}"
"${VENV_DIR}/bin/python" -m compileall -q src tools

if [[ "${1:-}" != "--smoke-only" ]]; then
  "${VENV_DIR}/bin/python" -m pytest -q
fi

for phase in 1 2 3 4 5; do
  "${VENV_DIR}/bin/python" "tools/phase${phase}_smoke.py"
done
