<#
.SYNOPSIS
    Daemon L402 - End-to-End Payment Flow Demo
.DESCRIPTION
    Demonstrates the complete L402 handshake:
    1. Agent requests protected API -> 402 Payment Required
    2. Agent pays Lightning invoice -> receives preimage
    3. Agent retries with L402 token -> 200 OK
.EXAMPLE
    .\scripts\demo-l402.ps1
    .\scripts\demo-l402.ps1 -GatewayUrl http://localhost:3333
#>

[CmdletBinding()]
param(
    [string]$GatewayUrl = "http://localhost:3000"
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
Write-Host "    Daemon L402 -- Live Payment Demo                           " -ForegroundColor Cyan
Write-Host "    AI Agent pays for API access with Bitcoin Lightning         " -ForegroundColor DarkCyan
Write-Host "                                                               " -ForegroundColor DarkCyan
Write-Host "  ===========================================================" -ForegroundColor DarkCyan
Write-Host ""

# ==========================================
# Health Check
# ==========================================
Write-Host "  Connecting to Gateway: $GatewayUrl" -ForegroundColor Gray
try {
    $health = Invoke-RestMethod -Uri "$GatewayUrl/health" -TimeoutSec 5
    Write-Host "  Status: $($health.status)" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Gateway not reachable at $GatewayUrl" -ForegroundColor Red
    Write-Host "  Start it first:  cd gateway; npm run dev" -ForegroundColor Yellow
    exit 1
}

Pause-For 1

# ==========================================
# Step 1: Request Protected API -> 402
# ==========================================
Write-Step "1" "Agent requests protected API endpoint" "Yellow"
Write-Host "      GET $GatewayUrl/api/compute" -ForegroundColor White

Pause-For 1

$step1Raw = curl.exe -s -D - "$GatewayUrl/api/compute" 2>&1
$step1Text = $step1Raw -join "`n"

# Extract HTTP status
$statusMatch = [regex]::Match($step1Text, "HTTP/\d\.\d (\d+)")
$httpStatus = $statusMatch.Groups[1].Value

if ($httpStatus -ne "402") {
    Write-Host "      Unexpected HTTP status: $httpStatus" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "      <- HTTP 402 Payment Required" -ForegroundColor Red

# Extract body (last line)
$lines = $step1Text -split "`n"
$bodyLine = $lines[$lines.Length - 1].Trim()
$body = $bodyLine | ConvertFrom-Json

$paymentHash = $body.paymentHash
$sats = [math]::Floor($body.amountMsats / 1000)

Write-Field "Payment Hash" "$($paymentHash.Substring(0,32))..."
Write-Field "Amount" "$($body.amountMsats) msats / $sats sat"
Write-Field "Memo" $body.memo

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
Write-Step "2" "Agent pays Lightning invoice" "Magenta"
Write-Host "      Sending $sats sat via Lightning Network..." -ForegroundColor White

Pause-For 1.5

$payBody = @{ paymentHash = $paymentHash } | ConvertTo-Json
$payResult = Invoke-RestMethod -Uri "$GatewayUrl/api/mock-pay" -Method POST -Body $payBody -ContentType "application/json"
$preimage = $payResult.preimage

Write-Host ""
Write-Host "      <- Payment settled!" -ForegroundColor Green
Write-Field "Preimage" "$($preimage.Substring(0,32))..."
Write-Host ""
Write-Host "      Proof-of-payment acquired. Constructing L402 token..." -ForegroundColor Gray

Pause-For 2

# ==========================================
# Step 3: Retry with L402 Token -> 200
# ==========================================
Write-Step "3" "Agent retries with L402 token" "Green"

$l402Token = "L402 ${macaroon}:${preimage}"
$authDisplay = "Authorization: L402 [macaroon]:[preimage]"
Write-Host "      $authDisplay" -ForegroundColor White
Write-Host "      GET $GatewayUrl/api/compute" -ForegroundColor White

Pause-For 1

$finalRaw = curl.exe -s -H "Authorization: $l402Token" "$GatewayUrl/api/compute"
$finalResult = $finalRaw | ConvertFrom-Json

Write-Host ""
Write-Host "      <- HTTP 200 OK" -ForegroundColor Green
Write-Host ""

$jsonLines = ($finalResult | ConvertTo-Json -Depth 3) -split "`n"
foreach ($jl in $jsonLines) {
    Write-Host "      $jl" -ForegroundColor DarkYellow
}

# ==========================================
# Summary
# ==========================================
Write-Host ""
Write-Host "  ===========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "    L402 Handshake Complete" -ForegroundColor Green
Write-Host ""
Write-Host "    Request -> 402 -> Pay $sats sat -> 200 OK" -ForegroundColor Green
Write-Host ""
Write-Host "    No API key. No account. No monthly bill." -ForegroundColor Green
Write-Host "    Just Bitcoin Lightning." -ForegroundColor Green
Write-Host ""
Write-Host "  ===========================================================" -ForegroundColor Green
Write-Host ""
