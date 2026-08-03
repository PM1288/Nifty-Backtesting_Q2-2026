param(
  [string]$GrafanaUrl = "http://localhost:19090",
  [string]$Username = "admin",
  [string]$Password = "admin1234",
  [string]$From = "now-24h",
  [string]$To = "now",
  [string]$Tag = "trading-stack",
  [string[]]$DashboardUid = @(),
  [switch]$FailOnEmpty,
  [switch]$VerboseOutput
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

function New-AuthHeaders {
  param([string]$User, [string]$Pass)
  $pair = "{0}:{1}" -f $User, $Pass
  $encoded = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
  return @{
    Authorization = "Basic $encoded"
    "Content-Type" = "application/json"
  }
}

function Invoke-GrafanaJson {
  param(
    [string]$Method,
    [string]$Url,
    [hashtable]$Headers,
    [object]$Body = $null
  )

  $maxAttempts = 3
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    try {
      if ($null -eq $Body) {
        return Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers -TimeoutSec 60
      }
      $jsonBody = $Body | ConvertTo-Json -Depth 100
      return Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers -Body $jsonBody -TimeoutSec 60
    } catch {
      $detail = ""
      if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        $detail = $_.ErrorDetails.Message
      } elseif ($_.Exception.Response -and $_.Exception.Response.GetResponseStream) {
        try {
          $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
          $detail = $reader.ReadToEnd()
          $reader.Dispose()
        } catch {}
      }
      if ($attempt -eq $maxAttempts) {
        if ([string]::IsNullOrWhiteSpace($detail)) {
          throw $_.Exception
        }
        throw ("{0} | {1}" -f $_.Exception.Message, $detail)
      }
      Start-Sleep -Seconds 1
    }
  }
}

function Get-PanelsRecursive {
  param([object[]]$Panels)

  $out = @()
  if ($null -eq $Panels) { return $out }
  foreach ($panel in $Panels) {
    $out += ,$panel
    if ($panel.PSObject.Properties.Name -contains "panels" -and $null -ne $panel.panels) {
      $out += Get-PanelsRecursive -Panels $panel.panels
    }
  }
  return $out
}

function Is-FrameEmpty {
  param([object]$Frame)

  if ($null -eq $Frame) { return $true }
  if ($Frame.PSObject.Properties.Name -contains "data" -and $null -ne $Frame.data) {
    $data = $Frame.data
    if ($data.PSObject.Properties.Name -contains "values" -and $null -ne $data.values) {
      $valueCols = @($data.values)
      if ($valueCols.Count -eq 0) { return $true }
      foreach ($col in $valueCols) {
        if (@($col).Count -gt 0) { return $false }
      }
      return $true
    }
  }
  return $false
}

function Interpolate-TemplateVars {
  param(
    [string]$Sql,
    [hashtable]$VarMap
  )

  if ([string]::IsNullOrWhiteSpace($Sql)) { return $Sql }
  $out = $Sql
  foreach ($name in $VarMap.Keys) {
    $value = [string]$VarMap[$name]
    $out = $out.Replace('$' + $name, $value)
    $out = $out.Replace('${' + $name + '}', $value)
    $out = [regex]::Replace($out, "\$\{" + [regex]::Escape($name) + ":[^}]*\}", $value)
  }
  return $out
}

$headers = New-AuthHeaders -User $Username -Pass $Password

if (-not $DashboardUid -or $DashboardUid.Count -eq 0) {
  $searchUrl = "{0}/api/search?type=dash-db&tag={1}" -f $GrafanaUrl.TrimEnd("/"), [uri]::EscapeDataString($Tag)
  $search = Invoke-GrafanaJson -Method "GET" -Url $searchUrl -Headers $headers
  $DashboardUid = @($search | ForEach-Object { $_.uid } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)
}

if ($DashboardUid.Count -eq 0) {
  Write-Error "No dashboards found to validate."
}

$errors = New-Object System.Collections.Generic.List[string]
$empties = New-Object System.Collections.Generic.List[string]
$validated = 0

foreach ($uid in $DashboardUid) {
  $dashUrl = "{0}/api/dashboards/uid/{1}" -f $GrafanaUrl.TrimEnd("/"), $uid
  try {
    $dashResp = Invoke-GrafanaJson -Method "GET" -Url $dashUrl -Headers $headers
  } catch {
    $errors.Add("dashboard=$uid fetch_error=$($_.Exception.Message)")
    continue
  }

  $dashboard = $dashResp.dashboard
  $varValueMap = @{}
  $scopedVars = @{}
  if ($dashboard.PSObject.Properties.Name -contains "templating" -and $null -ne $dashboard.templating) {
    $varList = @($dashboard.templating.list)
    foreach ($v in $varList) {
      if ($null -eq $v) { continue }
      if (-not (Has-Prop -Obj $v -Name "name")) { continue }
      $name = [string]$v.name
      if ([string]::IsNullOrWhiteSpace($name)) { continue }
      $current = if (Has-Prop -Obj $v -Name "current") { $v.current } else { $null }
      $text = if ($null -ne $current -and (Has-Prop -Obj $current -Name "text")) { $current.text } else { "" }
      $value = if ($null -ne $current -and (Has-Prop -Obj $current -Name "value")) { $current.value } else { "" }
      $flatValue = if ($value -is [System.Array]) { (@($value) -join ",") } else { [string]$value }
      $varValueMap[$name] = $flatValue
      $scopedVars[$name] = @{
        selected = $true
        text = $text
        value = $value
      }
    }
  }
  if (-not $scopedVars.ContainsKey("__interval")) {
    $scopedVars["__interval"] = @{ text = "1m"; value = "1m" }
  }
  if (-not $scopedVars.ContainsKey("__interval_ms")) {
    $scopedVars["__interval_ms"] = @{ text = "60000"; value = 60000 }
  }

  $panels = Get-PanelsRecursive -Panels $dashboard.panels
  if ($VerboseOutput) {
    Write-Host ("Validating dashboard={0} panels={1}" -f $uid, @($panels).Count)
  }

  foreach ($panel in $panels) {
    $targets = @($panel.targets)
    if ($targets.Count -eq 0) { continue }
    foreach ($target in $targets) {
      if ($null -eq $target) { continue }
      if ($target.PSObject.Properties.Name -contains "hide" -and $target.hide -eq $true) { continue }

      $refId = if ($target.PSObject.Properties.Name -contains "refId" -and -not [string]::IsNullOrWhiteSpace([string]$target.refId)) { [string]$target.refId } else { "A" }
      $targetObj = $target | ConvertTo-Json -Depth 100 | ConvertFrom-Json

      $dsUid = $null
      if (Has-Prop -Obj $targetObj -Name "datasource" -and $null -ne $targetObj.datasource) {
        if ($targetObj.datasource.PSObject.Properties.Name -contains "uid") {
          $dsUid = [string]$targetObj.datasource.uid
        } elseif ($targetObj.datasource -is [string]) {
          $dsUid = [string]$targetObj.datasource
        }
      }
      if ([string]::IsNullOrWhiteSpace($dsUid) -and $panel.PSObject.Properties.Name -contains "datasource" -and $null -ne $panel.datasource) {
        if ($panel.datasource.PSObject.Properties.Name -contains "uid") {
          $dsUid = [string]$panel.datasource.uid
        } elseif ($panel.datasource -is [string]) {
          $dsUid = [string]$panel.datasource
        }
      }

      if ([string]::IsNullOrWhiteSpace($dsUid)) {
        $errors.Add("dashboard=$uid panel=$($panel.id) refId=$refId missing_datasource_uid")
        continue
      }
      if ($dsUid -eq "__expr__") {
        continue
      }

      Set-Prop -Obj $targetObj -Name "datasource" -Value ([pscustomobject]@{ uid = $dsUid })
      if (-not (Has-Prop -Obj $targetObj -Name "refId")) { Set-Prop -Obj $targetObj -Name "refId" -Value $refId }
      if (-not (Has-Prop -Obj $targetObj -Name "maxDataPoints")) { Set-Prop -Obj $targetObj -Name "maxDataPoints" -Value 1000 }
      if (-not (Has-Prop -Obj $targetObj -Name "intervalMs")) { Set-Prop -Obj $targetObj -Name "intervalMs" -Value 60000 }
      if (-not (Has-Prop -Obj $targetObj -Name "scopedVars") -or $null -eq $targetObj.scopedVars) {
        Set-Prop -Obj $targetObj -Name "scopedVars" -Value $scopedVars
      }
      if (Has-Prop -Obj $targetObj -Name "rawSql" -and -not [string]::IsNullOrWhiteSpace([string]$targetObj.rawSql)) {
        $sql = [string]$targetObj.rawSql
        $sql = $sql.Replace('\r', "`r").Replace('\n', "`n").Replace('\t', "`t")
        $sql = Interpolate-TemplateVars -Sql $sql -VarMap $varValueMap
        Set-Prop -Obj $targetObj -Name "rawSql" -Value $sql
      }

      $queryBody = @{
        from = $From
        to = $To
        queries = @($targetObj)
      }

      try {
        $queryResp = Invoke-GrafanaJson -Method "POST" -Url ("{0}/api/ds/query" -f $GrafanaUrl.TrimEnd("/")) -Headers $headers -Body $queryBody
      } catch {
        $errors.Add("dashboard=$uid panel=$($panel.id) refId=$refId query_request_error=$($_.Exception.Message)")
        continue
      }

      $validated++
      if ($null -eq $queryResp.results) {
        $errors.Add("dashboard=$uid panel=$($panel.id) refId=$refId missing_results")
        continue
      }

      $result = $null
      if ($queryResp.results.PSObject.Properties.Name -contains $refId) {
        $result = $queryResp.results.$refId
      } else {
        $firstProp = $queryResp.results.PSObject.Properties | Select-Object -First 1
        if ($null -ne $firstProp) {
          $result = $firstProp.Value
        }
      }

      if ($null -eq $result) {
        $errors.Add("dashboard=$uid panel=$($panel.id) refId=$refId result_missing")
        continue
      }

      if ($result.PSObject.Properties.Name -contains "error" -and -not [string]::IsNullOrWhiteSpace([string]$result.error)) {
        $errors.Add("dashboard=$uid panel=$($panel.id) refId=$refId error=$($result.error)")
        continue
      }

      $isEmpty = $true
      if ($result.PSObject.Properties.Name -contains "frames" -and $null -ne $result.frames) {
        $frames = @($result.frames)
        if ($frames.Count -gt 0) {
          $isEmpty = $true
          foreach ($frame in $frames) {
            if (-not (Is-FrameEmpty -Frame $frame)) {
              $isEmpty = $false
              break
            }
          }
        }
      } else {
        $isEmpty = $false
      }

      if ($isEmpty) {
        $msg = "dashboard=$uid panel=$($panel.id) refId=$refId empty_result"
        if ($FailOnEmpty) {
          $errors.Add($msg)
        } else {
          $empties.Add($msg)
        }
      }
    }
  }
}

Write-Host ("Validated queries: {0}" -f $validated)
Write-Host ("Hard errors: {0}" -f $errors.Count)
Write-Host ("Empty result warnings: {0}" -f $empties.Count)

if ($empties.Count -gt 0) {
  Write-Host "---- Empty Result Warnings ----"
  $empties | ForEach-Object { Write-Host $_ }
}

if ($errors.Count -gt 0) {
  Write-Host "---- Validation Errors ----"
  $errors | ForEach-Object { Write-Host $_ }
  exit 1
}
