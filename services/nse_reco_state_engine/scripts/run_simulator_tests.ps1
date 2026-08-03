$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$testPath = Join-Path $repoRoot "services\nse_reco_state_engine\tests\test_simulator.py"

$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD = "1"
python -m pytest $testPath -q -o addopts=
