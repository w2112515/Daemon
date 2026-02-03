#!/bin/bash
# ============================================================
# Daemon L402 - Signet Initialization Script
# 来源: Vol.2 S-P0-02, Vol.0 §2.2
# ============================================================
# 用途: 初始化 Bitcoin Signet 测试网络环境
# 功能: 创建钱包、生成地址、连接到 Signet 水龙头
# ============================================================

set -euo pipefail

# 默认配置
LND_CONTAINER="${LND_CONTAINER:-lnd}"
LND_NETWORK="${LND_NETWORK:-signet}"
FAUCET_URL="${SIGNET_FAUCET_URL:-https://signetfaucet.com/claim}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# ============================================================
# 前置检查
# ============================================================

check_prerequisites() {
    log_step "1/6 Checking prerequisites..."
    
    # 检查 Docker
    if ! command -v docker &>/dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # 检查 LND 容器
    if ! docker ps --format '{{.Names}}' | grep -q "^${LND_CONTAINER}$"; then
        log_error "LND container is not running"
        log_info "Start with: docker compose up -d lnd"
        exit 1
    fi
    
    log_info "All prerequisites satisfied"
}

# ============================================================
# 等待 LND 同步
# ============================================================

wait_for_sync() {
    log_step "2/6 Waiting for LND to sync with ${LND_NETWORK}..."
    
    local max_wait=300  # 5 分钟超时
    local waited=0
    
    while [ $waited -lt $max_wait ]; do
        local info
        info=$(docker exec "${LND_CONTAINER}" lncli --network="${LND_NETWORK}" getinfo 2>/dev/null || echo "{}")
        
        local synced
        synced=$(echo "$info" | grep -o '"synced_to_chain": [a-z]*' | cut -d: -f2 | tr -d ' ' || echo "false")
        
        if [ "$synced" = "true" ]; then
            local height
            height=$(echo "$info" | grep -o '"block_height": [0-9]*' | cut -d: -f2 | tr -d ' ')
            log_info "Synced to chain at height: ${height}"
            return 0
        fi
        
        local block_height
        block_height=$(echo "$info" | grep -o '"block_height": [0-9]*' | cut -d: -f2 | tr -d ' ' || echo "0")
        log_info "Syncing... current height: ${block_height} (waited ${waited}s)"
        
        sleep 10
        waited=$((waited + 10))
    done
    
    log_error "Timeout waiting for sync"
    exit 1
}

# ============================================================
# 创建/解锁钱包
# ============================================================

setup_wallet() {
    log_step "3/6 Setting up wallet..."
    
    local state
    state=$(docker exec "${LND_CONTAINER}" lncli --network="${LND_NETWORK}" state 2>&1 || true)
    
    if echo "$state" | grep -q "RPC_ACTIVE"; then
        log_info "Wallet already active"
        return 0
    fi
    
    if echo "$state" | grep -q "LOCKED"; then
        log_warn "Wallet is locked, please run unlock-wallet.sh first"
        exit 1
    fi
    
    if echo "$state" | grep -q "NON_EXISTING"; then
        log_info "Creating new wallet..."
        
        # 使用 --noseedbackup 时自动创建钱包
        if docker exec "${LND_CONTAINER}" lncli --network="${LND_NETWORK}" getinfo &>/dev/null; then
            log_info "Wallet created automatically (noseedbackup mode)"
        else
            log_warn "Wallet creation required. Run interactively:"
            log_info "docker exec -it ${LND_CONTAINER} lncli --network=${LND_NETWORK} create"
            exit 1
        fi
    fi
    
    log_info "Wallet ready"
}

# ============================================================
# 生成接收地址
# ============================================================

generate_address() {
    log_step "4/6 Generating receiving address..."
    
    local addr
    addr=$(docker exec "${LND_CONTAINER}" lncli --network="${LND_NETWORK}" newaddress p2wkh 2>/dev/null | \
           grep -o '"address": "[^"]*"' | cut -d'"' -f4)
    
    if [ -z "$addr" ]; then
        log_error "Failed to generate address"
        exit 1
    fi
    
    log_info "Generated address: ${addr}"
    echo "$addr"
}

# ============================================================
# 获取 Faucet 资金 (Signet)
# ============================================================

request_faucet() {
    local address="$1"
    log_step "5/6 Requesting funds from Signet faucet..."
    
    if [ "${LND_NETWORK}" != "signet" ]; then
        log_warn "Faucet only available for signet, skipping..."
        
        if [ "${LND_NETWORK}" = "regtest" ]; then
            log_info "For regtest, generate blocks with: bitcoin-cli generatetoaddress 101 ${address}"
        fi
        return 0
    fi
    
    log_info "Visit the faucet to request funds:"
    echo ""
    echo "  ${FAUCET_URL}"
    echo ""
    echo "  Address: ${address}"
    echo ""
    log_warn "Note: Signet faucets may be rate-limited or temporarily unavailable"
    log_info "Fallback: Switch to regtest network for local testing"
}

# ============================================================
# 验证余额
# ============================================================

check_balance() {
    log_step "6/6 Checking wallet balance..."
    
    local balance
    balance=$(docker exec "${LND_CONTAINER}" lncli --network="${LND_NETWORK}" walletbalance 2>/dev/null)
    
    local confirmed
    confirmed=$(echo "$balance" | grep -o '"confirmed_balance": "[^"]*"' | cut -d'"' -f4)
    
    local unconfirmed
    unconfirmed=$(echo "$balance" | grep -o '"unconfirmed_balance": "[^"]*"' | cut -d'"' -f4)
    
    log_info "Wallet balance:"
    echo "  Confirmed:   ${confirmed:-0} sats"
    echo "  Unconfirmed: ${unconfirmed:-0} sats"
    
    if [ "${confirmed:-0}" = "0" ] && [ "${unconfirmed:-0}" = "0" ]; then
        log_warn "Wallet has no funds. Request from faucet or transfer funds."
    fi
}

# ============================================================
# 显示节点信息
# ============================================================

show_node_info() {
    log_info "=== LND Node Info ==="
    
    docker exec "${LND_CONTAINER}" lncli --network="${LND_NETWORK}" getinfo 2>/dev/null | \
        grep -E '"alias"|"identity_pubkey"|"block_height"|"num_active_channels"|"synced_to_chain"' | head -5
    
    echo ""
}

# ============================================================
# 主流程
# ============================================================

main() {
    echo ""
    log_info "========================================"
    log_info "  Daemon L402 - Signet Initialization  "
    log_info "========================================"
    log_info "Network: ${LND_NETWORK}"
    echo ""
    
    check_prerequisites
    wait_for_sync
    setup_wallet
    
    local address
    address=$(generate_address)
    
    request_faucet "$address"
    check_balance
    show_node_info
    
    log_info "========================================"
    log_info "  Initialization Complete!              "
    log_info "========================================"
    echo ""
    log_info "Next steps:"
    echo "  1. Fund the wallet (faucet or transfer)"
    echo "  2. Open a channel with ./scripts/open-channel.sh (if available)"
    echo "  3. Start the gateway: docker compose up -d gateway"
    echo ""
}

main "$@"
