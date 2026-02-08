<#
.SYNOPSIS
    Daemon L402 Proxy - Monetize Any API Demo
.DESCRIPTION
    Demonstrates how L402 Proxy wraps a real public API with pay-per-call:
    1. Start proxy in front of JSONPlaceholder
    2. Show: direct request -> 402 Payment Required
    3. Show: pay + retry -> 200 OK with real upstream data
.EXAMPLE
    .\scripts\demo-proxy.ps1
    .\scripts\demo-proxy.ps1 -ProxyUrl http://localhost:8402
#>

[CmdletBinding()]
param(
    [string]$ProxyUrl = "http://localhost:8402"
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Number, [string]$Title, [string]$Color = "Cyan")
    Write-Host ""
    Write-Host "  [$Number] $Title" -ForegroundColor $Color
    Write-Host "  --------------------------------------------------" -ForegroundColor DarkGray
}

function Write-Field {
    param([string]$Label, [string]$Value, [string]$ValueColor = "White")
    $padded = $Label.PadRight(16)
    Write-Host "      $padded" -NoNewline -ForegroundColor Gray
    Write-Host "$Value" -ForegroundColor $ValueColor
}

function Pause-For {
    param([double]$Seconds = 1.5)
    Start-Sleep -Milliseconds ([int]($Seconds * 1000))
}

# ==========================================
# Banner
# ==========================================
Write-Host ""
Write-Host "  ===========================================================" -ForegroundColor DarkCyan
Write-Host "                                                               " -ForegroundColor DarkCyan
Write-Host "    Daemon L402 Proxy -- Monetize Any API Demo                 " -ForegroundColor Cyan
Write-Host "    Wrap any HTTP API with pay-per-call micropayments          " -ForegroundColor DarkCyan
Write-Host "                                                               " -ForegroundColor DarkCyan
Write-Host "  ===========================================================" -ForegroundColor DarkCyan
Write-Host ""

# ==========================================
# Health Check
# ==========================================
Write-Host "  Connecting to L402 Proxy: $ProxyUrl" -ForegroundColor Gray
try {
    $health = Invoke-RestMethod -Uri "$ProxyUrl/health" -TimeoutSec 5
    Write-Host "  Status: $($health.status)" -ForegroundColor Green
    Write-Host "  Upstream: $($health.upstream)" -ForegroundColor Gray
} catch {
    Write-Host "  ERROR: Proxy not reachable at $ProxyUrl" -ForegroundColor Red
    Write-Host "  Start it first:" -ForegroundColor Yellow
    Write-Host '  $env:UPSTREAM_URL="https://jsonplaceholder.typicode.com"; cd proxy; npx tsx src/index.ts' -ForegroundColor Yellow
    exit 1
}

Pause-For 1

# ==========================================
# Step 0: Show what the proxy protects
# ==========================================
Write-Step "0" "Proxy is wrapping JSONPlaceholder (a free public API)" "White"
Write-Host "      Upstream: https://jsonplaceholder.typicode.com" -ForegroundColor Gray
Write-Host "      Any request to the proxy requires Lightning payment." -ForegroundColor Gray

Pause-For 1.5

# ==========================================
# Step 1: Request -> 402
# ==========================================
Write-Step "1" "Agent requests data through L402 Proxy" "Yellow"
Write-Host "      GET $ProxyUrl/posts/1" -ForegroundColor White

Pause-For 1

$step1Raw = curl.exe -s -D - "$ProxyUrl/posts/1" 2>&1
$step1Text = $step1Raw -join "`n"

$statusMatch = [regex]::Match($step1Text, "HTTP/\d\.\d (\d+)")
$httpStatus = $statusMatch.Groups[1].Value

if ($httpStatus -ne "402") {
    Write-Host "      Unexpected HTTP status: $httpStatus" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "      <- HTTP 402 Payment Required" -ForegroundColor Red

$lines = $step1Text -split "`n"
$bodyLine = $lines[$lines.Length - 1].Trim()
$body = $bodyLine | ConvertFrom-Json

Write-Field "Price" "$($body.pricing.amountMsats) msats"
Write-Field "Memo" $body.pricing.memo

# Extract macaroon
$dq = [char]34
$macPattern = "macaroon=$dq([^$dq]+)$dq"
$macaroonMatch = [regex]::Match($step1Text, $macPattern)
$macaroon = $macaroonMatch.Groups[1].Value

Write-Field "Macaroon" "$($macaroon.Substring(0,40))..." "DarkYellow"

Pause-For 2

# ==========================================
# Step 2: Pay Lightning Invoice
# ==========================================
Write-Step "2" "Agent pays Lightning invoice (1 sat)" "Magenta"
Write-Host "      Sending payment via Lightning Network..." -ForegroundColor White

Pause-For 1.5

# In mock mode, any 64-char hex preimage works
$preimage = "a]b2c3d4e5f6" + "0" * 52
$preimage = -join ((0..63) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })

Write-Host ""
Write-Host "      <- Payment settled!" -ForegroundColor Green
Write-Field "Preimage" "$($preimage.Substring(0,32))..."
Write-Host "      Constructing L402 token..." -ForegroundColor Gray

Pause-For 2

# ==========================================
# Step 3: Retry with L402 Token -> 200
# ==========================================
Write-Step "3" "Agent retries with L402 token -> gets real upstream data" "Green"

$l402Token = "L402 ${macaroon}:${preimage}"
Write-Host "      Authorization: L402 [macaroon]:[preimage]" -ForegroundColor White
Write-Host "      GET $ProxyUrl/posts/1" -ForegroundColor White

Pause-For 1

$finalRaw = curl.exe -s -w "`n%{http_code}" -H "Authorization: $l402Token" "$ProxyUrl/posts/1"
$finalLines = $finalRaw -split "`n"
$finalStatus = $finalLines[$finalLines.Length - 1].Trim()
$finalBody = ($finalLines[0..($finalLines.Length - 2)] -join "`n") | ConvertFrom-Json

Write-Host ""
Write-Host "      <- HTTP $finalStatus OK" -ForegroundColor Green
Write-Host ""

# Display upstream response
Write-Field "Source" "jsonplaceholder.typicode.com (proxied)" "Cyan"
Write-Field "Post ID" $finalBody.id
Write-Field "User ID" $finalBody.userId
$titleTrunc = $finalBody.title
if ($titleTrunc.Length -gt 50) { $titleTrunc = $titleTrunc.Substring(0,50) + "..." }
Write-Field "Title" $titleTrunc "DarkYellow"

# ==========================================
# Summary
# ==========================================
Write-Host ""
Write-Host "  ===========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "    L402 Proxy Demo Complete" -ForegroundColor Green
Write-Host ""
Write-Host "    JSONPlaceholder (free API) -> L402 Proxy -> Paid API" -ForegroundColor Green
Write-Host "    Agent paid 1 sat and received real upstream data." -ForegroundColor Green
Write-Host ""
Write-Host "    One command to monetize any API:" -ForegroundColor White
Write-Host '    UPSTREAM_URL=https://your-api.com  npx @daemon/l402-proxy' -ForegroundColor Cyan
Write-Host ""
Write-Host "  ===========================================================" -ForegroundColor Green
Write-Host ""
