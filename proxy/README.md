# @daemon/l402-proxy

> 一行命令将任何 HTTP API 包装为 L402 付费端点

## 快速开始

### Docker (推荐)

```bash
docker run -d \
  -p 8402:8402 \
  -e UPSTREAM_URL=https://api.example.com \
  -e PRICE_PER_REQUEST=1000 \
  daemon/l402-proxy
```

### 本地运行

```bash
npm install
npm run build
UPSTREAM_URL=https://api.example.com npm start
```

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `UPSTREAM_URL` | ✅ | - | 上游 API 地址 |
| `PORT` | ❌ | 8402 | 监听端口 |
| `PRICE_PER_REQUEST` | ❌ | 1000 | 每次请求价格 (msats) |
| `PRICE_MEMO` | ❌ | L402 Proxy API Call | 发票备注 |
| `LND_MODE` | ❌ | mock | LND 模式 (mock/real) |
| `LND_REST_URL` | ❌ | - | LND REST API 地址 (real 模式) |
| `LND_MACAROON` | ❌ | - | LND Macaroon (real 模式) |
| `SKIP_PATHS` | ❌ | /health,/info | 不需要 L402 的路径 (逗号分隔) |

## API 端点

| 端点 | 说明 | L402 |
|------|------|------|
| `GET /health` | 健康检查 | ❌ |
| `GET /info` | 服务信息 | ❌ |
| `* /*` | 代理到上游 | ✅ |

## 使用示例

### 1. 代理 JSONPlaceholder

```bash
docker run -d \
  -p 8402:8402 \
  -e UPSTREAM_URL=https://jsonplaceholder.typicode.com \
  daemon/l402-proxy

# 测试
curl http://localhost:8402/health           # 200 OK
curl http://localhost:8402/posts/1          # 402 Payment Required
```

### 2. 配置自定义价格

```bash
docker run -d \
  -p 8402:8402 \
  -e UPSTREAM_URL=https://api.example.com \
  -e PRICE_PER_REQUEST=5000 \
  -e PRICE_MEMO="Premium API Access" \
  daemon/l402-proxy
```

## L402 流程

```
Client                     L402 Proxy                    Upstream
  │                            │                             │
  ├─── GET /posts/1 ──────────>│                             │
  │                            │ (无凭证)                     │
  │<── 402 + Challenge ────────┤                             │
  │                            │                             │
  ├─── 支付 Invoice ──────────────────────────────────────> LND
  │<── Preimage ──────────────────────────────────────────────┤
  │                            │                             │
  ├─── GET /posts/1 ──────────>│                             │
  │    Authorization: L402     │                             │
  │                            ├─── GET /posts/1 ───────────>│
  │                            │<── 200 + Data ──────────────┤
  │<── 200 + Data ─────────────┤                             │
  └                            └                             └
```

## Docker Compose 示例

见 `docker-compose.proxy.yml`

## 相关链接

- [L402 协议规范](https://github.com/lightning-engineering/lightning-terminal/tree/master/l402)
- [MCP SDK](../sdk/mcp/)
