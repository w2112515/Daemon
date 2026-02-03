# L402 MCP SDK 使用示例

本目录包含 `@daemon/l402-mcp` SDK 的完整使用示例。

## 快速开始

```bash
# 安装依赖
npm install

# 启动示例
node index.js
```

## 文件说明

| 文件 | 描述 |
|------|------|
| `index.js` | 完整 L402 流程演示 (请求 → 402 → 支付 → 重试) |
| `client.js` | 客户端 L402 请求示例 |
| `demo-server.js` | 独立 Demo Server (不依赖 SDK) |

## L402 流程

```
Client                            Server
  │                                  │
  ├──── GET /api/data ──────────────>│
  │                                  │
  │<─── 402 + WWW-Authenticate ──────┤
  │     (macaroon + invoice)         │
  │                                  │
  ├──── 支付 Invoice (Lightning) ───>│ LND
  │                                  │
  │<─── Preimage ────────────────────┤
  │                                  │
  ├──── GET /api/data ──────────────>│
  │     Authorization: L402 mac:pre  │
  │                                  │
  │<─── 200 + Data ──────────────────┤
  └                                  └
```

## 使用 SDK 启动 Demo Server

```bash
# 方法 1: 使用 npx (推荐)
cd ../../sdk/mcp && npm run demo

# 方法 2: 直接运行 demo.ts
npx tsx ../../sdk/mcp/src/demo.ts
```

## 相关链接

- [SDK 源码](../../sdk/mcp/)
- [SDK 文档](../../sdk/mcp/README.md)
- [API 参考](https://daemon.io/docs/sdk/mcp)
