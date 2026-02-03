#!/usr/bin/env node
/**
 * L402 Proxy Server Entry Point
 * 
 * @trace Vol.2 §2.5 S-P1-04
 * @constraint D-ECO-01~03
 */

import express from 'express';
import { loadConfig } from './config.js';
import { createL402Middleware } from './middleware.js';
import { setupProxy } from './proxy.js';

function main(): void {
    const config = loadConfig();
    const app = express();

    // Health check (不受 L402 保护)
    app.get('/health', (_req, res) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            upstream: config.upstreamUrl,
        });
    });

    // Service info (不受 L402 保护)
    app.get('/info', (_req, res) => {
        res.json({
            name: '@daemon/l402-proxy',
            version: '0.1.0',
            upstream: config.upstreamUrl,
            pricing: {
                amountMsats: config.pricePerRequest,
                memo: config.priceMemo,
            },
            lndMode: config.lndMode,
        });
    });

    // L402 中间件 (保护所有代理请求)
    app.use(createL402Middleware(config));

    // 反向代理
    setupProxy(app, config);

    // 启动服务
    app.listen(config.port, () => {
        console.log('');
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║              🔐 L402 Proxy Server Started                    ║');
        console.log('╠══════════════════════════════════════════════════════════════╣');
        console.log(`║  Port:     ${config.port.toString().padEnd(51)}║`);
        console.log(`║  Upstream: ${config.upstreamUrl.padEnd(51).slice(0, 51)}║`);
        console.log(`║  Price:    ${config.pricePerRequest} msats`.padEnd(64) + '║');
        console.log(`║  LND Mode: ${config.lndMode.padEnd(51)}║`);
        console.log('╠══════════════════════════════════════════════════════════════╣');
        console.log('║  Endpoints:                                                  ║');
        console.log(`║    GET  http://localhost:${config.port}/health`.padEnd(64) + '║');
        console.log(`║    GET  http://localhost:${config.port}/info`.padEnd(64) + '║');
        console.log(`║    *    http://localhost:${config.port}/* (L402 🔐 → Upstream)`.padEnd(64) + '║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log('');
    });
}

main();
