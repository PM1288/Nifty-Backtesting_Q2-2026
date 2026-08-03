$User = "admin"
$Pass = "admin1234"
$BaseUrl = "http://localhost:3000"
$Pair = "$($User):$($Pass)"
$Encoded = [Convert]::ToBase64String([System.Text.Encoding]::ASCII.GetBytes($Pair))
$Headers = @{ Authorization = "Basic $Encoded" }

Write-Host "Waiting for Grafana to be ready..."
for ($i=0; $i -lt 30; $i++) {
    try {
        $Res = Invoke-RestMethod -Uri "$BaseUrl/api/health" -Method Get -ErrorAction Stop
        if ($Res.database -eq "ok") {
            Write-Host "Grafana is ready."
            break
        }
    } catch {
        Write-Host "Waiting..."
        Start-Sleep -Seconds 2
    }
}

# 1. Create Service Account
$Body = @{ name = "mobile-bff"; role = "Editor" } | ConvertTo-Json
$SaId = $null

try {
    $Sa = Invoke-RestMethod -Uri "$BaseUrl/api/serviceaccounts" -Method Post -Headers $Headers -Body $Body -ContentType "application/json" -ErrorAction Stop
    $SaId = $Sa.id
    Write-Host "Created Service Account ID: $SaId"
} catch {
    Write-Host "Service Account creation failed or already exists. Checking existing..."
    try {
        $Search = Invoke-RestMethod -Uri "$BaseUrl/api/serviceaccounts/search?perpage=10&page=1" -Method Get -Headers $Headers
        $Found = $Search.serviceAccounts | Where-Object { $_.name -eq "mobile-bff" }
        if ($Found) {
            $SaId = $Found.id
            Write-Host "Found existing Service Account ID: $SaId"
        }
    } catch {
        Write-Host "Failed to list service accounts: $_"
    }
}

# 2. Create Token
if ($SaId) {
    try {
        $TokenBody = @{ name = "bff-token-$(Get-Date -Format 'yyyyMMddHHmmss')" } | ConvertTo-Json
        $TokenResp = Invoke-RestMethod -Uri "$BaseUrl/api/serviceaccounts/$SaId/tokens" -Method Post -Headers $Headers -Body $TokenBody -ContentType "application/json"

        $Key = $TokenResp.key
        Write-Host "Generated Token!"

        # Update .env
        $EnvPath = "c:\Github_sync\trading-stack\.env"
        if (Test-Path $EnvPath) {
            $Content = Get-Content $EnvPath
            $NewContent = $Content -replace "GRAFANA_TOKEN=replace_me_with_sa_token", "GRAFANA_TOKEN=$Key"
            $NewContent | Set-Content $EnvPath
            Write-Host "Updated .env with new token."
        } else {
             Write-Host "Could not find .env at $EnvPath"
        }

    } catch {
        Write-Host "Failed to create token: $_"
    }
} else {
    Write-Host "Could not obtain Service Account ID."
}
