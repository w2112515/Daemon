#!/usr/bin/env node
/**
 * L402 MCP Demo Server
 * 
 * @trace Vol.2 §2.5 S-P1-06
 * @constraint D-ECO-06: npx @daemon/l402-mcp demo → 监听端口，接收 MCP 连接
 * 
 * Usage:
 *   npx @daemon/l402-mcp demo
 *   npm run demo
 */

import express from 'express';
import {
    l402Middleware,
    fixedPricing,
    mockInvoiceGenerator,
    mockMacaroonMinter,
    mockCredentialVerifier,
} from './index';

const PORT = parseInt(process.env.PORT ?? '3402', 10);
const PRICE_MSATS = parseInt(process.env.L402_PRICE ?? '1000', 10);

function createDemoServer(): express.Application {
    const app = express();
    app.use(express.json());

    // Health check - 不受 L402 保护
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // L402 中间件配置 (使用 Mock 实现)
    const l402Config = {
        getPricing: fixedPricing(PRICE_MSATS, 'MCP Demo API Call'),
        createInvoice: mockInvoiceGenerator(),
        mintMacaroon: mockMacaroonMinter('l402-mcp-demo-secret'),
        verifyCredential: mockCredentialVerifier('l402-mcp-demo-secret'),
        skipPaths: ['/health', '/info'],
        service: 'l402-mcp-demo',
    };

    // 应用 L402 中间件到受保护路由
    app.use('/api', l402Middleware(l402Config));

    // 受保护的 API 端点
    app.get('/api/data', (req, res) => {
        res.json({
            message: 'Access granted!',
            paymentHash: req.l402?.paymentHash,
            timestamp: new Date().toISOString(),
            data: {
                example: 'This is protected data that required L402 payment.',
                value: Math.floor(Math.random() * 1000),
            },
        });
    });

    app.post('/api/compute', (req, res) => {
        const { input } = req.body as { input?: string };
        res.json({
            message: 'Computation complete!',
            paymentHash: req.l402?.paymentHash,
            result: `Processed: ${input ?? 'no input'}`,
            timestamp: new Date().toISOString(),
        });
    });

    // MCP 端点 (受 L402 保护)
    app.post('/api/mcp', (req, res) => {
        const { method, params } = req.body as { method?: string; params?: unknown };
        res.json({
            jsonrpc: '2.0',
            id: Date.now(),
            result: {
                status: 'success',
                method: method ?? 'unknown',
                paymentVerified: req.l402?.verified,
                paymentHash: req.l402?.paymentHash,
            },
        });
    });

    // 服务信息 - 不受 L402 保护
    app.get('/info', (_req, res) => {
        res.json({
            name: '@daemon/l402-mcp Demo Server',
            version: '0.1.0',
            endpoints: {
                health: 'GET /health - 健康检查',
                info: 'GET /info - 服务信息',
                data: 'GET /api/data - 受保护数据 (需要 L402 凭证)',
                compute: 'POST /api/compute - 受保护计算 (需要 L402 凭证)',
                mcp: 'POST /api/mcp - MCP 端点 (需要 L402 凭证)',
            },
            pricing: {
                amountMsats: PRICE_MSATS,
                memo: 'MCP Demo API Call',
            },
            instructions: [
                '1. 访问 /api/data 获取 402 响应',
                '2. 从 WWW-Authenticate header 提取 macaroon 和 invoice',
                '3. 支付 invoice 获得 preimage',
                '4. 使用 Authorization: L402 <macaroon>:<preimage> 访问',
            ],
        });
    });

    return app;
}

function main(): void {
    const app = createDemoServer();

    app.listen(PORT, () => {
        console.log('');
        console.log('╔════════════════════════════════════════════════════════╗');
        console.log('║         🔐 L402 MCP Demo Server Started                ║');
        console.log('╠════════════════════════════════════════════════════════╣');
        console.log(`║  Port:     ${PORT.toString().padEnd(44)}║`);
        console.log(`║  Price:    ${PRICE_MSATS} msats`.padEnd(59) + '║');
        console.log('╠════════════════════════════════════════════════════════╣');
        console.log('║  Endpoints:                                            ║');
        console.log(`║    GET  http://localhost:${PORT}/health`.padEnd(59) + '║');
        console.log(`║    GET  http://localhost:${PORT}/info`.padEnd(59) + '║');
        console.log(`║    GET  http://localhost:${PORT}/api/data  (L402 🔐)`.padEnd(59) + '║');
        console.log(`║    POST http://localhost:${PORT}/api/mcp   (L402 🔐)`.padEnd(59) + '║');
        console.log('╠════════════════════════════════════════════════════════╣');
        console.log('║  Try:  curl http://localhost:' + PORT + '/api/data'.padEnd(29) + '║');
        console.log('╚════════════════════════════════════════════════════════╝');
        console.log('');
    });
}

main();
