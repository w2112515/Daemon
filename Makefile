# ============================================================
# Daemon L402 - One-Command Project Makefile
# 来源: Vol.2 S-P0-09, D-DX-02
# ============================================================
# 用途: 提供标准化的项目入口点
# 目标: make demo → 一键启动完整演示
# ============================================================

.PHONY: help install start stop demo test clean logs status

# 默认目标
.DEFAULT_GOAL := help

# 颜色定义
GREEN  := \033[0;32m
YELLOW := \033[1;33m
BLUE   := \033[0;34m
NC     := \033[0m

# ============================================================
# Help
# ============================================================

help: ## 显示帮助信息
	@echo ""
	@echo "$(GREEN)Daemon L402 - AI Payment Agent$(NC)"
	@echo "$(YELLOW)让 AI 像调用 API 一样完成支付$(NC)"
	@echo ""
	@echo "$(BLUE)Usage:$(NC) make [target]"
	@echo ""
	@echo "$(BLUE)Targets:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-12s$(NC) %s\n", $$1, $$2}'
	@echo ""

# ============================================================
# Core Commands
# ============================================================

install: ## 安装依赖并准备环境
	@echo "$(GREEN)[install]$(NC) Setting up environment..."
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "$(YELLOW)Created .env from template. Please fill in secrets.$(NC)"; \
	fi
	@echo "$(GREEN)[install]$(NC) Building Docker images..."
	docker compose build
	@echo "$(GREEN)[install]$(NC) Done! Run 'make start' to launch."

start: ## 启动所有服务
	@echo "$(GREEN)[start]$(NC) Starting Daemon services..."
	docker compose up -d
	@echo ""
	@echo "$(GREEN)Services started:$(NC)"
	@echo "  - LND:       localhost:10009 (gRPC)"
	@echo "  - Gateway:   http://localhost:3000"
	@echo "  - Dashboard: http://localhost:3001"
	@echo "  - Agent:     http://localhost:5000"
	@echo ""
	@echo "$(YELLOW)Run 'make logs' to view output$(NC)"

stop: ## 停止所有服务
	@echo "$(GREEN)[stop]$(NC) Stopping Daemon services..."
	docker compose down
	@echo "$(GREEN)[stop]$(NC) All services stopped."

test: ## 运行测试套件
	@echo "$(GREEN)[test]$(NC) Running tests..."
	@if [ -f tests/run_tests.sh ]; then \
		bash tests/run_tests.sh; \
	else \
		echo "$(YELLOW)No test runner found. Checking services...$(NC)"; \
		docker compose ps; \
	fi

# ============================================================
# Demo: One-Command Experience
# ============================================================

demo: ## 一键启动完整演示 (Time-to-Hello-World < 5min)
	@echo ""
	@echo "$(GREEN)╔══════════════════════════════════════════════════╗$(NC)"
	@echo "$(GREEN)║     Daemon L402 - Pay-Per-Call Demo              ║$(NC)"
	@echo "$(GREEN)╚══════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(BLUE)Step 1/4:$(NC) Checking environment..."
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "$(YELLOW)Created .env with defaults$(NC)"; \
	fi
	@echo ""
	@echo "$(BLUE)Step 2/4:$(NC) Building containers..."
	@docker compose build --quiet 2>/dev/null || docker compose build
	@echo ""
	@echo "$(BLUE)Step 3/4:$(NC) Starting services..."
	@docker compose up -d
	@echo ""
	@echo "$(BLUE)Step 4/4:$(NC) Waiting for services..."
	@sleep 5
	@docker compose ps
	@echo ""
	@echo "$(GREEN)╔══════════════════════════════════════════════════╗$(NC)"
	@echo "$(GREEN)║                  Demo Ready!                     ║$(NC)"
	@echo "$(GREEN)╚══════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "  $(BLUE)Gateway$(NC):   http://localhost:3000/health"
	@echo "  $(BLUE)Dashboard$(NC): http://localhost:3001"
	@echo ""
	@echo "$(YELLOW)Try the L402 flow:$(NC)"
	@echo "  curl -X GET http://localhost:3000/api/protected"
	@echo "  → Returns 402 Payment Required with Lightning Invoice"
	@echo ""
	@echo "$(GREEN)Stop with:$(NC) make stop"
	@echo ""

# ============================================================
# Utility Commands
# ============================================================

logs: ## 查看服务日志
	docker compose logs -f

status: ## 查看服务状态
	@echo "$(GREEN)[status]$(NC) Service health:"
	@docker compose ps
	@echo ""
	@echo "$(GREEN)[status]$(NC) Container resources:"
	@docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null || true

clean: ## 清理容器和数据
	@echo "$(YELLOW)[clean]$(NC) Stopping services and removing data..."
	docker compose down -v
	@echo "$(GREEN)[clean]$(NC) Cleanup complete."

# ============================================================
# Development Commands
# ============================================================

dev-gateway: ## 启动 Gateway 开发模式
	cd gateway && npm run dev

dev-dashboard: ## 启动 Dashboard 开发模式
	cd dashboard && npm run dev

dev-agent: ## 启动 Agent 开发模式
	cd agent && python -m uvicorn main:app --reload --port 5000

# ============================================================
# LND Wallet Commands
# ============================================================

wallet-unlock: ## 解锁 LND 钱包
	@if [ -f scripts/unlock-wallet.sh ]; then \
		bash scripts/unlock-wallet.sh; \
	else \
		echo "$(YELLOW)Unlock script not found$(NC)"; \
	fi

wallet-balance: ## 查看钱包余额
	docker exec lnd lncli --network=$${LND_NETWORK:-regtest} walletbalance

wallet-address: ## 生成新地址
	docker exec lnd lncli --network=$${LND_NETWORK:-regtest} newaddress p2wkh

# ============================================================
# Quick Reference
# ============================================================
# 
# 新手快速开始:
#   make demo      → 一键启动演示
#   make logs      → 查看日志
#   make stop      → 停止服务
#
# 开发者:
#   make install   → 首次设置
#   make start     → 启动服务
#   make test      → 运行测试
#
# LND 钱包:
#   make wallet-unlock  → 解锁钱包
#   make wallet-balance → 查看余额
# ============================================================
