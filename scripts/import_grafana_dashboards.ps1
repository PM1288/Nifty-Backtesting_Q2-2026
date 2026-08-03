param(
  [string]$GrafanaUrl = "http://localhost:19090",
  [string]$Username = "admin",
  [string]$Password = "admin1234",
  [string]$DashboardsDir = "compose/grafana/dashboards",
  [string]$FolderUid = "af9wv0oe6brwga"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$pair = "{0}:{1}" -f $Username, $Password
$encoded = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
$headers = @{
  Authorization = "Basic $encoded"
  "Content-Type" = "application/json"
}

$healthUrl = "{0}/api/health" -f $GrafanaUrl.TrimEnd("/")
for ($i = 0; $i -lt 45; $i++) {
  try {
    $h = Invoke-RestMethod -Uri $healthUrl -Method Get -Headers $headers -TimeoutSec 10
    if ($h.database -eq "ok") { break }
  } catch {}
  Start-Sleep -Seconds 2
}

$files = Get-ChildItem -Path $DashboardsDir -Filter "*.json" | Sort-Object Name
if (-not $files) {
  Write-Error "No dashboards found under $DashboardsDir"
}

foreach ($file in $files) {
  $dash = Get-Content -Raw $file.FullName | ConvertFrom-Json
  try { $dash.id = $null } catch {}

  $body = @{
    dashboard = $dash
    folderUid = $FolderUid
    overwrite = $true
  }
  $url = "{0}/api/dashboards/db" -f $GrafanaUrl.TrimEnd("/")
  $resp = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body ($body | ConvertTo-Json -Depth 100) -TimeoutSec 60
  Write-Host ("{0}`tstatus={1}`tuid={2}`tversion={3}" -f $file.Name, $resp.status, $resp.uid, $resp.version)
}
