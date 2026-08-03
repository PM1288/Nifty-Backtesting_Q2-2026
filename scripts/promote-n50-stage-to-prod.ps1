param(
  [switch]$SkipSnapshotRefresh
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "n50-stage-prod-common.ps1")

$repoRoot = Get-N50RepoRoot
Set-Location $repoRoot

Write-Host "Promoting current code to PROD UI/API stack ..."
Invoke-N50Compose -Surface core up -d --build
if ($LASTEXITCODE -ne 0) {
  throw "docker compose failed while updating the core overlay."
}

Wait-N50AppReady -Target prod

if (-not $SkipSnapshotRefresh) {
  Invoke-N50SnapshotRefresh -Target prod
}

Show-N50StageProdUrls
Write-Host "PROD is available at http://localhost:19090/n50/ when the core overlay owns the edge."
Write-Host "Public PROD hostname is https://m.nifty50today.co.in/ on the dedicated prod deployment."
