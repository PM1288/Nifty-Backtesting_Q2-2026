param(
  [string]$GrafanaUrl = "http://localhost:19090",
  [string]$Username = "admin",
  [string]$Password = "admin1234",
  [string]$HomeDashboardUid = "trading-stack-home"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$pair = "{0}:{1}" -f $Username, $Password
$encoded = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
$headers = @{
  Authorization = "Basic $encoded"
  "Content-Type" = "application/json"
}

$body = @{
  homeDashboardUID = $HomeDashboardUid
  theme = ""
  timezone = ""
  weekStart = ""
}

$url = "{0}/api/org/preferences" -f $GrafanaUrl.TrimEnd("/")
$resp = Invoke-RestMethod -Uri $url -Method Put -Headers $headers -Body ($body | ConvertTo-Json -Depth 10) -TimeoutSec 30
Write-Host ($resp | ConvertTo-Json -Depth 10)
