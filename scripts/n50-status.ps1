Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "n50-stage-prod-common.ps1")

$repoRoot = Get-N50RepoRoot
Set-Location $repoRoot

Write-Host "Core overlay containers:"
Invoke-N50Compose -Surface core ps
if ($LASTEXITCODE -ne 0) {
  throw "docker compose ps failed for core overlay."
}

Write-Host ""
Write-Host "Stage overlay containers:"
Invoke-N50Compose -Surface stage ps
if ($LASTEXITCODE -ne 0) {
  throw "docker compose ps failed for stage overlay."
}

Write-Host ""
Write-Host "Health checks:"
$checks = @(
  @{ Label = "Local PROD"; Uri = "http://localhost:19090/n50/health"; Headers = @{} },
  @{ Label = "Local STAGE"; Uri = "http://localhost:19090/n50-stage/health"; Headers = @{} },
  @{ Label = "Host PROD"; Uri = "http://localhost:19090/n50/health"; Headers = @{ Host = "m.nifty50today.co.in" } },
  @{ Label = "Host STAGE"; Uri = "http://localhost:19090/n50-stage/health"; Headers = @{ Host = "stage.nifty50today.co.in" } }
)

foreach ($check in $checks) {
  try {
    $response = Invoke-RestMethod -Method Get -Uri $check.Uri -Headers $check.Headers -TimeoutSec 10
    $status = if ($response.ok -eq $true) { "ok" } else { "unexpected" }
    Write-Host ("- {0}: {1}" -f $check.Label, $status)
  } catch {
    Write-Host ("- {0}: failed ({1})" -f $check.Label, $_.Exception.Message)
  }
}

Show-N50StageProdUrls
