param(
  [switch]$SkipSnapshotRefresh
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "n50-stage-prod-common.ps1")

$repoRoot = Get-N50RepoRoot
Set-Location $repoRoot

Write-Host "Building and starting STAGE UI/API stack ..."
Invoke-N50Compose -Surface stage up -d --build
if ($LASTEXITCODE -ne 0) {
  throw "docker compose failed while updating the stage overlay."
}

Wait-N50AppReady -Target stage

if (-not $SkipSnapshotRefresh) {
  Invoke-N50SnapshotRefresh -Target stage
}

Show-N50StageProdUrls
Write-Host "STAGE is available at http://localhost:19090/n50-stage/ when the stage overlay owns the edge."
Write-Host "Public STAGE hostname is https://stage.nifty50today.co.in/ on the dedicated stage deployment."
