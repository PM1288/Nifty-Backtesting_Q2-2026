$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot/.."
if (-not $env:TEST_DATABASE_URL) { throw "Set TEST_DATABASE_URL to a disposable PostgreSQL database" }
& .venv/Scripts/ruff.exe check src tests tools
& .venv/Scripts/mypy.exe src/papertrade
& .venv/Scripts/pytest.exe -q --cov=papertrade --cov-report=term-missing
