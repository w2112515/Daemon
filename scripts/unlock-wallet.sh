#!/bin/bash
# ============================================================
# Daemon L402 - LND Wallet Unlock Script
# 来源: Vol.2 S-P0-02, D-ENV-02
# ============================================================
# 用途: 解锁 LND 钱包，使其可以进行支付操作
# 前提: LND 容器已启动，钱包已创建
# ============================================================

set -euo pipefail

# 默认配置
LND_CONTAINER="${LND_CONTAINER:-lnd}"
WALLET_PASSWORD="${WALLET_PASSWORD:-}"
MAX_RETRIES=30
RETRY_INTERVAL=2

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 LND 容器是否运行
check_lnd_running() {
    if ! docker ps --format '{{.Names}}' | grep -q "^${LND_CONTAINER}$"; then
        log_error "LND container '${LND_CONTAINER}' is not running"
        log_info "Start with: docker compose up -d lnd"
        exit 1
    fi
    log_info "LND container is running"
}

# 等待 LND 就绪
wait_for_lnd() {
    log_info "Waiting for LND to be ready..."
    local retries=0
    
    while [ $retries -lt $MAX_RETRIES ]; do
        if docker exec "${LND_CONTAINER}" lncli --network="${LND_NETWORK:-regtest}" getinfo &>/dev/null; then
            log_info "LND is ready"
            return 0
        fi
        
        # 检查是否需要解锁
        local state
        state=$(docker exec "${LND_CONTAINER}" lncli --network="${LND_NETWORK:-regtest}" state 2>&1 || true)
        
        if echo "$state" | grep -q "LOCKED"; then
            log_info "Wallet is locked, proceeding to unlock..."
            return 0
        fi
        
        if echo "$state" | grep -q "WAITING_TO_START"; then
            log_info "LND is starting... ($((retries + 1))/${MAX_RETRIES})"
        fi
        
        retries=$((retries + 1))
        sleep $RETRY_INTERVAL
    done
    
    log_error "Timeout waiting for LND"
    exit 1
}

# 检查钱包状态
check_wallet_state() {
    local state
    state=$(docker exec "${LND_CONTAINER}" lncli --network="${LND_NETWORK:-regtest}" state 2>&1 || true)
    
    if echo "$state" | grep -q "RPC_ACTIVE"; then
        log_info "Wallet is already unlocked"
        return 1
    fi
    
    if echo "$state" | grep -q "LOCKED"; then
        log_info "Wallet is locked"
        return 0
    fi
    
    # 检查是否需要初始化
    if echo "$state" | grep -q "NON_EXISTING"; then
        log_warn "Wallet does not exist, needs initialization"
        log_info "Run: docker exec -it ${LND_CONTAINER} lncli create"
        exit 1
    fi
    
    log_warn "Unknown wallet state: ${state}"
    return 0
}

# 解锁钱包
unlock_wallet() {
    if [ -z "$WALLET_PASSWORD" ]; then
        log_error "WALLET_PASSWORD environment variable is required"
        log_info "Usage: WALLET_PASSWORD=<password> $0"
        exit 1
    fi
    
    log_info "Unlocking wallet..."
    
    # 通过 stdin 传入密码
    if echo "$WALLET_PASSWORD" | docker exec -i "${LND_CONTAINER}" \
        lncli --network="${LND_NETWORK:-regtest}" unlock; then
        log_info "Wallet unlocked successfully"
    else
        log_error "Failed to unlock wallet"
        exit 1
    fi
}

# 验证解锁成功
verify_unlock() {
    log_info "Verifying wallet unlock..."
    
    local retries=0
    while [ $retries -lt 10 ]; do
        if docker exec "${LND_CONTAINER}" lncli --network="${LND_NETWORK:-regtest}" getinfo &>/dev/null; then
            local info
            info=$(docker exec "${LND_CONTAINER}" lncli --network="${LND_NETWORK:-regtest}" getinfo 2>/dev/null)
            
            local synced
            synced=$(echo "$info" | grep -o '"synced_to_chain": [a-z]*' | cut -d: -f2 | tr -d ' ')
            
            log_info "Wallet verified:"
            echo "$info" | grep -E '"alias"|"identity_pubkey"|"block_height"|"synced_to_chain"' | head -4
            
            return 0
        fi
        
        retries=$((retries + 1))
        sleep 1
    done
    
    log_error "Failed to verify wallet unlock"
    exit 1
}

# 主流程
main() {
    log_info "=== LND Wallet Unlock Script ==="
    log_info "Network: ${LND_NETWORK:-regtest}"
    
    check_lnd_running
    wait_for_lnd
    
    if check_wallet_state; then
        unlock_wallet
        verify_unlock
    else
        # 已解锁，显示状态
        docker exec "${LND_CONTAINER}" lncli --network="${LND_NETWORK:-regtest}" getinfo | \
            grep -E '"alias"|"identity_pubkey"|"block_height"' | head -3
    fi
    
    log_info "=== Done ==="
}

main "$@"
