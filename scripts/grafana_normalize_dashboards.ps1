param(
  [string]$DashboardsDir = "compose/grafana/dashboards"
)

$ErrorActionPreference = "Stop"

function Has-Prop {
  param([object]$Obj, [string]$Name)
  if ($null -eq $Obj) { return $false }
  $propNames = @($Obj.PSObject.Properties | ForEach-Object { $_.Name })
  return ($propNames -contains $Name)
}

function Set-Prop {
  param([object]$Obj, [string]$Name, [object]$Value)
  if (Has-Prop -Obj $Obj -Name $Name) {
    $Obj.$Name = $Value
  } else {
    $Obj | Add-Member -NotePropertyName $Name -NotePropertyValue $Value
  }
}

function Ensure-FieldConfigDefaults {
  param([object]$Panel)

  if (-not (Has-Prop -Obj $Panel -Name "fieldConfig") -or $null -eq $Panel.fieldConfig) {
    Set-Prop -Obj $Panel -Name "fieldConfig" -Value ([pscustomobject]@{})
  }
  if (-not (Has-Prop -Obj $Panel.fieldConfig -Name "defaults") -or $null -eq $Panel.fieldConfig.defaults) {
    Set-Prop -Obj $Panel.fieldConfig -Name "defaults" -Value ([pscustomobject]@{})
  }
  if (-not (Has-Prop -Obj $Panel.fieldConfig -Name "overrides") -or $null -eq $Panel.fieldConfig.overrides) {
    Set-Prop -Obj $Panel.fieldConfig -Name "overrides" -Value @()
  }
}

function Guess-Unit {
  param([string]$Title)

  $t = $Title.ToLowerInvariant()
  if ($t -match "(%|percent|pct)") { return "percent" }
  if ($t -match "(pcr|ratio)") { return "short" }
  if ($t -match "(price|premium|ltp|pnl|mark-to-market|mtm)") { return "currencyINR" }
  if ($t -match "(latency|duration|ms|millisecond)") { return "ms" }
  if ($t -match "(volume|oi|open interest|count|qty|quantity|contracts|bars)") { return "short" }
  return "short"
}

function Axis-LabelForUnit {
  param([string]$Unit)

  switch ($Unit) {
    "percent" { return "Percent (%)" }
    "currencyINR" { return "INR" }
    "ms" { return "Milliseconds" }
    default { return "Value" }
  }
}

function New-PercentThresholds {
  return [pscustomobject]@{
    mode  = "absolute"
    steps = @(
      [pscustomobject]@{ color = "red"; value = $null },
      [pscustomobject]@{ color = "orange"; value = -1.0 },
      [pscustomobject]@{ color = "yellow"; value = -0.2 },
      [pscustomobject]@{ color = "green"; value = 0.2 },
      [pscustomobject]@{ color = "blue"; value = 1.0 }
    )
  }
}

function New-PcrThresholds {
  return [pscustomobject]@{
    mode  = "absolute"
    steps = @(
      [pscustomobject]@{ color = "red"; value = $null },
      [pscustomobject]@{ color = "yellow"; value = 0.75 },
      [pscustomobject]@{ color = "green"; value = 0.95 },
      [pscustomobject]@{ color = "orange"; value = 1.25 },
      [pscustomobject]@{ color = "red"; value = 1.60 }
    )
  }
}

function Update-PanelsRecursive {
  param([object[]]$Panels, [ref]$TouchedCount)

  if ($null -eq $Panels) { return }
  foreach ($panelObj in $Panels) {
    $panel = $panelObj
    $title = [string]$panel.title
    $type = [string]$panel.type
    $isSeries = $type -in @("timeseries", "graph", "barchart", "trend")
    $isStatLike = $type -in @("stat", "gauge", "bar gauge", "bargauge")
    $isPct = $title -match "(%|percent|pct)"
    $isPcr = $title -match "\bPCR\b"

    if ($isSeries -or $isStatLike) {
      Ensure-FieldConfigDefaults -Panel $panel
      $defaults = $panel.fieldConfig.defaults
      $unit = if (Has-Prop -Obj $defaults -Name "unit") { [string]$defaults.unit } else { "" }
      if ([string]::IsNullOrWhiteSpace($unit) -or $unit -eq "none") {
        Set-Prop -Obj $defaults -Name "unit" -Value (Guess-Unit -Title $title)
        $TouchedCount.Value++
      }

      if ($isSeries) {
        if (-not (Has-Prop -Obj $defaults -Name "custom") -or $null -eq $defaults.custom) {
          Set-Prop -Obj $defaults -Name "custom" -Value ([pscustomobject]@{})
        }
        $custom = $defaults.custom
        if (-not (Has-Prop -Obj $custom -Name "axisLabel") -or [string]::IsNullOrWhiteSpace([string]$custom.axisLabel)) {
          Set-Prop -Obj $custom -Name "axisLabel" -Value (Axis-LabelForUnit -Unit ([string]$defaults.unit))
          $TouchedCount.Value++
        }
      }

      if ($isPct -and (-not (Has-Prop -Obj $defaults -Name "thresholds") -or $null -eq $defaults.thresholds)) {
        Set-Prop -Obj $defaults -Name "thresholds" -Value (New-PercentThresholds)
        if (-not (Has-Prop -Obj $defaults -Name "unit") -or [string]::IsNullOrWhiteSpace([string]$defaults.unit) -or [string]$defaults.unit -eq "none") {
          Set-Prop -Obj $defaults -Name "unit" -Value "percent"
        }
        $TouchedCount.Value++
      }

      if ($isPcr -and (-not (Has-Prop -Obj $defaults -Name "thresholds") -or $null -eq $defaults.thresholds)) {
        Set-Prop -Obj $defaults -Name "thresholds" -Value (New-PcrThresholds)
        if (-not (Has-Prop -Obj $defaults -Name "unit") -or [string]::IsNullOrWhiteSpace([string]$defaults.unit) -or [string]$defaults.unit -eq "none") {
          Set-Prop -Obj $defaults -Name "unit" -Value "short"
        }
        $TouchedCount.Value++
      }
    }

    if (Has-Prop -Obj $panel -Name "targets" -and $null -ne $panel.targets) {
      foreach ($target in @($panel.targets)) {
        if ($null -eq $target) { continue }
        if (Has-Prop -Obj $target -Name "rawSql" -and -not [string]::IsNullOrWhiteSpace([string]$target.rawSql)) {
          $rawSql = [string]$target.rawSql
          $normalizedSql = $rawSql.Replace('\r', "`r").Replace('\n', "`n").Replace('\t', "`t")
          if ($normalizedSql -ne $rawSql) {
            Set-Prop -Obj $target -Name "rawSql" -Value $normalizedSql
            $TouchedCount.Value++
          }
        }
      }
    }

    if (Has-Prop -Obj $panel -Name "panels" -and $null -ne $panel.panels) {
      Update-PanelsRecursive -Panels $panel.panels -TouchedCount $TouchedCount
    }
  }
}

$files = Get-ChildItem -Path $DashboardsDir -Filter "*.json" | Sort-Object Name
if (-not $files) {
  Write-Error "No dashboard JSON files found under $DashboardsDir"
}

$totalTouched = 0
foreach ($file in $files) {
  $dashboard = Get-Content -Raw $file.FullName | ConvertFrom-Json
  $touched = 0

  if (-not (Has-Prop -Obj $dashboard -Name "tags") -or $null -eq $dashboard.tags) {
    Set-Prop -Obj $dashboard -Name "tags" -Value @()
  }
  $tags = @($dashboard.tags)
  if ($tags -notcontains "trading-stack") {
    $tags += "trading-stack"
    Set-Prop -Obj $dashboard -Name "tags" -Value $tags
    $touched++
  }

  if (-not (Has-Prop -Obj $dashboard -Name "links") -or $null -eq $dashboard.links) {
    Set-Prop -Obj $dashboard -Name "links" -Value @()
  }

  $dashNav = $null
  foreach ($lnkObj in $dashboard.links) {
    if ([string]$lnkObj.type -eq "dashboards") {
      $dashNav = $lnkObj
      break
    }
  }

  if ($null -eq $dashNav) {
    $dashNav = [pscustomobject]@{
      asDropdown = $true
      icon       = "dashboard"
      includeVars = $true
      keepTime   = $true
      tags       = @("trading-stack")
      targetBlank = $false
      title      = "Navigate Dashboards"
      tooltip    = "Jump to another dashboard"
      type       = "dashboards"
    }
    $links = @($dashboard.links)
    $links += $dashNav
    Set-Prop -Obj $dashboard -Name "links" -Value $links
    $touched++
  } else {
    Set-Prop -Obj $dashNav -Name "asDropdown" -Value $true
    Set-Prop -Obj $dashNav -Name "includeVars" -Value $true
    Set-Prop -Obj $dashNav -Name "keepTime" -Value $true
    Set-Prop -Obj $dashNav -Name "tags" -Value @("trading-stack")
    if (-not (Has-Prop -Obj $dashNav -Name "title") -or [string]::IsNullOrWhiteSpace([string]$dashNav.title)) {
      Set-Prop -Obj $dashNav -Name "title" -Value "Navigate Dashboards"
    }
    if (-not (Has-Prop -Obj $dashNav -Name "tooltip") -or [string]::IsNullOrWhiteSpace([string]$dashNav.tooltip)) {
      Set-Prop -Obj $dashNav -Name "tooltip" -Value "Jump to another dashboard"
    }
  }

  if (Has-Prop -Obj $dashboard -Name "panels" -and $null -ne $dashboard.panels) {
    $panelTouches = 0
    Update-PanelsRecursive -Panels $dashboard.panels -TouchedCount ([ref]$panelTouches)
    $touched += $panelTouches
  }

  $jsonOut = $dashboard | ConvertTo-Json -Depth 100
  Set-Content -Path $file.FullName -Value $jsonOut -Encoding utf8
  Write-Host ("{0}`tupdates={1}" -f $file.Name, $touched)
  $totalTouched += $touched
}

Write-Host ("Completed normalization. Total updates: {0}" -f $totalTouched)
