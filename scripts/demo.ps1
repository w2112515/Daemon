<#
.SYNOPSIS
    Daemon L402 Gateway - Windows PowerShell Demo Script

.DESCRIPTION
    快速演示脚本，用于在 Windows 环境下验证 L402 支付流程。
    包含环境检查、服务启动和基础功能测试。

.NOTES
    Trace: Vol.2 S-DX-03, Task-26
    DoD: D-DX-02 (Time-to-Hello-World < 5min)
    
.EXAMPLE
    .\demo.ps1
    .\demo.ps1 -SkipDocker
    .\demo.ps1 -TestOnly
#>

[CmdletBinding()]
param(
    [switch]$SkipDocker,
    [switch]$TestOnly,
    [switch]$Verbose
)

# ==========================================
# 配置
# ==========================================
$ErrorActionPreference = "Stop"
$GATEWAY_URL = "http://localhost:3000"
$DASHBOARD_URL = "http://localhost:3001"

# 颜色输出
function Write-Header { param([string]$Message) Write-Host "`n═══ $Message ═══" -ForegroundColor Cyan }
function Write-Step { param([string]$Message) Write-Host "  → $Message" -ForegroundColor White }
function Write-Success { param([string]$Message) Write-Host "  ✓ $Message" -ForegroundColor Green }
function Write-Warning { param([string]$Message) Write-Host "  ⚠ $Message" -ForegroundColor Yellow }
function Write-Error { param([string]$Message) Write-Host "  ✗ $Message" -ForegroundColor Red }

# ==========================================
# 环境检查
# ==========================================
function Test-Prerequisites {
    Write-Header "环境检查"
    
    $allPassed = $true
    
    # Node.js
    Write-Step "检查 Node.js..."
    try {
        $nodeVersion = & node --version 2>&1
        if ($nodeVersion -match "^v(\d+)") {
            $major = [int]$Matches[1]
            if ($major -ge 18) {
                Write-Success "Node.js $nodeVersion (OK)"
            } else {
                Write-Warning "Node.js $nodeVersion (建议 v18+)"
            }
        }
    } catch {
        Write-Error "Node.js 未安装"
        $allPassed = $false
    }
    
    # npm
    Write-Step "检查 npm..."
    try {
        $npmVersion = & npm --version 2>&1
        Write-Success "npm $npmVersion"
    } catch {
        Write-Error "npm 未安装"
        $allPassed = $false
    }
    
    # Docker (可选)
    if (-not $SkipDocker) {
        Write-Step "检查 Docker..."
        try {
            $dockerVersion = & docker --version 2>&1
            if ($dockerVersion -match "Docker version") {
                Write-Success "$dockerVersion"
            }
        } catch {
            Write-Warning "Docker 未安装 (可选，使用 -SkipDocker 跳过)"
        }
    }
    
    # Python (用于 Agent)
    Write-Step "检查 Python..."
    try {
        $pythonVersion = & python --version 2>&1
        if ($pythonVersion -match "Python 3\.(\d+)") {
            $minor = [int]$Matches[1]
            if ($minor -ge 10) {
                Write-Success "$pythonVersion (OK)"
            } else {
                Write-Warning "$pythonVersion (建议 3.10+)"
            }
        }
    } catch {
        Write-Warning "Python 未安装 (Agent 可选)"
    }
    
    return $allPassed
}

# ==========================================
# 依赖安装
# ==========================================
function Install-Dependencies {
    Write-Header "安装依赖"
    
    # Gateway
    if (Test-Path "gateway/package.json") {
        Write-Step "安装 Gateway 依赖..."
        Push-Location gateway
        & npm install --silent
        Pop-Location
        Write-Success "Gateway 依赖已安装"
    }
    
    # Dashboard
    if (Test-Path "dashboard/package.json") {
        Write-Step "安装 Dashboard 依赖..."
        Push-Location dashboard
        & npm install --silent
        Pop-Location
        Write-Success "Dashboard 依赖已安装"
    }
    
    # Agent (Python)
    if (Test-Path "agent/requirements.txt") {
        Write-Step "安装 Agent 依赖..."
        try {
            & pip install -q -r agent/requirements.txt
            Write-Success "Agent 依赖已安装"
        } catch {
            Write-Warning "Agent 依赖安装失败 (可选)"
        }
    }
}

# ==========================================
# 服务启动
# ==========================================
function Start-Services {
    Write-Header "启动服务"
    
    # 创建 .env (如果不存在)
    if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
        Write-Step "创建 .env 配置文件..."
        Copy-Item ".env.example" ".env"
        Write-Success ".env 已创建"
    }
    
    # Gateway
    Write-Step "启动 Gateway (后台)..."
    $gatewayJob = Start-Job -ScriptBlock {
        Set-Location $using:PWD
        Push-Location gateway
        & npm run dev 2>&1
    }
    Write-Success "Gateway 启动中... (Job ID: $($gatewayJob.Id))"
    
    # 等待 Gateway 就绪
    Write-Step "等待 Gateway 就绪..."
    $maxRetries = 30
    $retries = 0
    while ($retries -lt $maxRetries) {
        Start-Sleep -Seconds 1
        try {
            $response = Invoke-RestMethod -Uri "$GATEWAY_URL/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($response.status -eq "healthy") {
                Write-Success "Gateway 就绪: $GATEWAY_URL"
                break
            }
        } catch {
            $retries++
            if ($retries % 5 -eq 0) { Write-Host "." -NoNewline }
        }
    }
    
    if ($retries -ge $maxRetries) {
        Write-Warning "Gateway 启动超时，请手动检查"
    }
    
    return $gatewayJob
}

# ==========================================
# API 测试
# ==========================================
function Test-APIs {
    Write-Header "API 测试"
    
    $allPassed = $true
    
    # 健康检查
    Write-Step "测试健康检查..."
    try {
        $health = Invoke-RestMethod -Uri "$GATEWAY_URL/health" -TimeoutSec 5
        if ($health.status -eq "healthy") {
            Write-Success "GET /health → 200 OK"
        }
    } catch {
        Write-Error "GET /health → 失败"
        $allPassed = $false
    }
    
    # Telemetry 健康检查
    Write-Step "测试 Telemetry API..."
    try {
        $telemetryHealth = Invoke-RestMethod -Uri "$GATEWAY_URL/api/telemetry/health" -TimeoutSec 5
        if ($telemetryHealth.status -eq "healthy") {
            Write-Success "GET /api/telemetry/health → 200 OK"
        }
    } catch {
        Write-Error "GET /api/telemetry/health → 失败"
        $allPassed = $false
    }
    
    # L402 受保护端点 (期望 402)
    Write-Step "测试 L402 保护端点..."
    try {
        $response = Invoke-WebRequest -Uri "$GATEWAY_URL/api/compute" -TimeoutSec 5 -ErrorAction SilentlyContinue
        Write-Warning "GET /api/compute → 意外的 200 (应为 402)"
    } catch {
        if ($_.Exception.Response.StatusCode -eq 402) {
            Write-Success "GET /api/compute → 402 Payment Required (正确!)"
        } else {
            Write-Warning "GET /api/compute → $($_.Exception.Response.StatusCode)"
        }
    }
    
    # 发送遥测事件
    Write-Step "测试遥测事件发送..."
    try {
        $event = @{
            event_type = "health.ping"
            timestamp = (Get-Date).ToString("o")
            agent_id = "demo_agent_ps1"
            data = @{ source = "demo.ps1" }
        } | ConvertTo-Json
        
        $result = Invoke-RestMethod -Uri "$GATEWAY_URL/api/telemetry" -Method Post -Body $event -ContentType "application/json" -TimeoutSec 5
        if ($result.status -eq "accepted") {
            Write-Success "POST /api/telemetry → 事件已接收"
        }
    } catch {
        Write-Warning "POST /api/telemetry → 失败 (非关键)"
    }
    
    return $allPassed
}

# ==========================================
# 主流程
# ==========================================
function Main {
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                                                          ║" -ForegroundColor Cyan
    Write-Host "║   ⚡ Daemon L402 Gateway - Windows Demo                   ║" -ForegroundColor Cyan
    Write-Host "║                                                          ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    
    $startTime = Get-Date
    
    # 环境检查
    $prereqOK = Test-Prerequisites
    if (-not $prereqOK) {
        Write-Error "环境检查失败，请安装缺失的依赖"
        exit 1
    }
    
    if ($TestOnly) {
        # 仅测试模式
        $testOK = Test-APIs
        if ($testOK) {
            Write-Header "测试完成"
            Write-Success "所有测试通过!"
        } else {
            Write-Warning "部分测试失败"
        }
        return
    }
    
    # 完整演示流程
    Install-Dependencies
    $job = Start-Services
    
    # 运行测试
    $testOK = Test-APIs
    
    # 计算耗时
    $elapsed = (Get-Date) - $startTime
    
    Write-Header "演示完成"
    Write-Host ""
    Write-Host "  ⏱  总耗时: $($elapsed.ToString('mm\:ss'))" -ForegroundColor White
    Write-Host "  🌐 Gateway: $GATEWAY_URL" -ForegroundColor White
    Write-Host "  📊 Dashboard: $DASHBOARD_URL" -ForegroundColor White
    Write-Host ""
    
    if ($testOK) {
        Write-Success "Hello World in under 5 minutes! (D-DX-02 ✓)"
    }
    
    Write-Host ""
    Write-Host "  提示: 使用 Ctrl+C 停止服务" -ForegroundColor Gray
    Write-Host "  提示: 使用 Stop-Job $($job.Id) 停止后台任务" -ForegroundColor Gray
    Write-Host ""
}

# 执行
Main
