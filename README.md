# Daemon

> **让 AI 像调用 API 一样完成支付 — 无 Key、无账号、无月结**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bitcoin](https://img.shields.io/badge/Bitcoin-Lightning-orange.svg)](https://lightning.network/)
[![L402](https://img.shields.io/badge/Protocol-L402-purple.svg)](https://docs.lightning.engineering/the-lightning-network/l402)

---

## Core 核心能力

### Zero-Config Access
无需注册账号、无需申请 API Key、无需处理月结账单。
Agent 直接支付，服务直接响应。

### Pay-Per-Call
按调用付费，粒度低至 1 satoshi。
告别订阅制，只为实际使用付费。

---

## Controls 安全机制

| 机制 | 说明 |
|------|------|
| **Budget Rails** | 人类设定预算上限，Agent 无法超支 |
| **Allowlist** | 白名单控制可访问服务 |
| **Audit Trail** | 不可篡改的支付审计日志 |
| **Circuit Breakers** | 异常检测与自动熔断 |

> 💡 **设计原则**: Zero-Config for developers; policy-driven controls for operators.

---

## Quick Start

```bash
# 克隆并启动
git clone https://github.com/anthropics/daemon && cd daemon
make demo

# 观察 L402 握手
# Agent 请求 → 402 Payment Required → Pay 5 sats → 200 OK
```

```powershell
# Windows (PowerShell)
git clone https://github.com/anthropics/daemon && cd daemon
.\scripts\demo.ps1
```

**Time-to-Hello-World**: < 5 分钟

---

## Extensions 可选增强

<details>
<summary>展开查看可选功能</summary>

### Settlement Assurance
采用 Bitcoin/Lightning 进行协议层结算，降低对单一中心化结算方的依赖。

> ⚠️ **合规声明**: 不用于规避法律义务；在适用场景下支持合规与风控集成。

### Yield Module (默认关闭)
Agent 闲置资金可选择参与闪电网络路由，赚取路由费。

| 属性 | 说明 |
|------|------|
| **收益来源** | Lightning Network 路由费 (技术机制，非投资产品) |
| **示例区间** | 0.01% - 0.1% 年化 (历史观察，仅作示例) |
| **保证性** | ❌ **不保证收益** |
| **默认状态** | **关闭** (需显式开启) |

> ⚠️ **可撤回条款**: 历史观察区间仅作示例，不构成预期或承诺；区间可能随时间调整或移除。
>
> ⚠️ **这不是投资产品**。如果您的目标是投资收益，请选择其他金融工具。

### Propose+Approve (Phase 2+)
Agent 可提议新服务，人类审批后生效。

</details>

---

## Architecture

```
+------------------------------------------------------------------+
|                       L402 PAYMENT FLOW                          |
+------------------------------------------------------------------+
|                                                                  |
|  [AI Agent]  ------>  [L402 Gateway]  ------>  [Service]         |
|       |                     |                      |             |
|       | 1. Request          | 2. 402 + Invoice     |             |
|       v                     |                      |             |
|  [LND Wallet] ========>  [Lightning Network]                     |
|       |                     |                      |             |
|       | 4. Preimage         |                      |             |
|       v                     |                      |             |
|  3. Pay via Lightning       |                      |             |
|                                                                  |
|  5. Request + L402 Token -------------------------------->       |
|  6. Verify & Serve                                               |
+------------------------------------------------------------------+
```

---

## For Different Audiences

| 你是... | 关注点 |
|--------|--------|
| **黑客松评委** | BTCFi Agent Economy — AI 原生支付基础设施 |
| **开发者** | Zero-Config + Pay-Per-Call — 无需 API Key 即可接入 |
| **企业用户** | Budget Rails + Audit Trail — 安全可控的 Agent 支付 |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| L1 | Bitcoin (Signet/Mainnet) | 结算层 |
| L2 | LND (Lightning) | 支付层 |
| L3 | L402 Protocol | 认证支付协议 |
| L4 | Python/LangChain | Agent 逻辑 |
| L5 | FastAPI | API 网关 |
| L6 | React/Next.js | Fleet Observer UI |

---

## Project Structure

```
daemon/
├─ agent/              # AI Agent (买方)
│  ├─ tools/           # LangChain L402 工具
│  ├─ wallet/          # LND 钱包封装
│  └─ dashboard/       # Yield Dashboard
├─ gateway/            # L402 Server (卖方)
│  ├─ middlewares/     # L402 拦截器
│  └─ routes/          # API 路由
├─ dashboard/          # Web Fleet Observer
└─ tests/              # 测试套件
```

---

## License

MIT License - 详见 [LICENSE](./LICENSE)

---

## Links

- **L402 Protocol**: [Lightning Labs L402](https://docs.lightning.engineering/the-lightning-network/l402)
- **LND**: [Lightning Network Daemon](https://github.com/lightningnetwork/lnd)

---

<p align="center">
  <b>Daemon — The Payment Rail for Machine Economy</b><br>
  <i>Built with Lightning for BTCFi Hackathon</i>
</p>
