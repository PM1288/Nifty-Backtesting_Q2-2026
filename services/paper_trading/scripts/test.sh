#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
.venv/bin/ruff check src tests tools
.venv/bin/mypy src/papertrade
: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to a disposable PostgreSQL database}"
.venv/bin/pytest -q --cov=papertrade --cov-report=term-missing
