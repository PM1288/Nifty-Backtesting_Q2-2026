Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-N50RepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Get-N50ComposeArgs {
  param(
    [ValidateSet("core", "stage", "telemetry", "jobs", "legacy", "dev")]
    [string]$Surface
  )

  $repoRoot = Get-N50RepoRoot
  $envFile = Join-Path $repoRoot ".env"
  $args = @("--env-file", $envFile, "-f", "compose/compose.base.yml")
  switch ($Surface) {
    "core" { $args += @("-f", "compose/compose.core.yml") }
    "stage" { $args += @("-f", "compose/compose.stage.yml") }
    "telemetry" { $args += @("-f", "compose/compose.telemetry.yml") }
    "jobs" { $args += @("-f", "compose/compose.jobs.yml") }
    "legacy" { $args += @("-f", "compose/compose.legacy.yml") }
    "dev" { $args += @("-f", "compose/compose.dev.yml") }
  }
  return $args
}

function Invoke-N50Compose {
  param(
    [ValidateSet("core", "stage", "telemetry", "jobs", "legacy", "dev")]
    [string]$Surface,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ComposeArgs
  )

  $fullArgs = @("compose") + (Get-N50ComposeArgs -Surface $Surface) + $ComposeArgs
  & docker @fullArgs
  return $LASTEXITCODE
}

function Get-N50EnvMap {
  param(
    [string]$EnvFilePath = (Join-Path (Get-N50RepoRoot) ".env")
  )

  $values = @{}
  if (-not (Test-Path $EnvFilePath)) {
    return $values
  }

  foreach ($rawLine in Get-Content -Path $EnvFilePath) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      continue
    }
    $parts = $line -split "=", 2
    if ($parts.Count -ne 2) {
      continue
    }
    $values[$parts[0].Trim()] = $parts[1].Trim()
  }

  return $values
}

function Get-N50EnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$Default = ""
  )

  $fromProcess = [Environment]::GetEnvironmentVariable($Name)
  if (-not [string]::IsNullOrWhiteSpace($fromProcess)) {
    return $fromProcess
  }

  $map = Get-N50EnvMap
  if ($map.ContainsKey($Name) -and -not [string]::IsNullOrWhiteSpace($map[$Name])) {
    return $map[$Name]
  }

  return $Default
}

function Wait-N50AppReady {
  param(
    [ValidateSet("prod", "stage", "both")]
    [string]$Target = "both",
    [int]$TimeoutSeconds = 180
  )

  $healthTargets = @{
    prod = "http://localhost:19090/n50/health"
    stage = "http://localhost:19090/n50-stage/health"
  }
  $selected = if ($Target -eq "both") { @("prod", "stage") } else { @($Target) }

  foreach ($name in $selected) {
    $uri = $healthTargets[$name]
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
      try {
        $response = Invoke-RestMethod -Method Get -Uri $uri -TimeoutSec 10
        if ($response.ok -eq $true) {
          Write-Host ("[{0}] ready via {1}" -f $name.ToUpperInvariant(), $uri)
          $ready = $true
          break
        }
      } catch {
        Start-Sleep -Seconds 2
        continue
      }
      Start-Sleep -Seconds 2
    }

    if (-not $ready) {
      throw ("{0} did not become ready within {1}s." -f $name.ToUpperInvariant(), $TimeoutSeconds)
    }
  }
}

function Invoke-N50SnapshotRefresh {
  param(
    [ValidateSet("prod", "stage", "both")]
    [string]$Target = "both",
    [int]$TimeoutSeconds = 180
  )

  $token = Get-N50EnvValue -Name "N50_SNAPSHOT_REFRESH_TOKEN"
  if ([string]::IsNullOrWhiteSpace($token)) {
    throw "N50_SNAPSHOT_REFRESH_TOKEN is required. Set it in the process environment or .env before refreshing snapshots."
  }
  $targets = @{
    prod = "http://localhost:19090/n50/internal/snapshots/refresh"
    stage = "http://localhost:19090/n50-stage/internal/snapshots/refresh"
  }
  $selected = if ($Target -eq "both") { @("prod", "stage") } else { @($Target) }

  foreach ($name in $selected) {
    $uri = $targets[$name]
    Write-Host "Refreshing $name snapshots via $uri ..."
    $response = Invoke-RestMethod `
      -Method Post `
      -Uri $uri `
      -Headers @{ "x-snapshot-refresh-token" = $token } `
      -ContentType "application/json" `
      -Body '{"keys":[]}' `
      -TimeoutSec $TimeoutSeconds
    $ok = $null
    $elapsedMs = $null
    if ($response -is [pscustomobject] -or $response -is [hashtable]) {
      if ($response.PSObject.Properties["ok"]) { $ok = $response.ok }
      if ($response.PSObject.Properties["elapsedMs"]) { $elapsedMs = $response.elapsedMs }
    }
    if ($null -ne $ok) {
      Write-Host ("[{0}] ok={1} elapsedMs={2}" -f $name.ToUpperInvariant(), $ok, $elapsedMs)
    } else {
      Write-Host ("[{0}] refresh response received." -f $name.ToUpperInvariant())
      $response | ConvertTo-Json -Depth 6
    }
  }
}

function Show-N50StageProdUrls {
  Write-Host ""
  Write-Host "Local PROD  : http://localhost:19090/n50/"
  Write-Host "Local STAGE : http://localhost:19090/n50-stage/"
  Write-Host ""
  Write-Host "Public PROD : https://m.nifty50today.co.in/"
  Write-Host "Public STAGE: https://stage.nifty50today.co.in/"
  Write-Host ""
}
