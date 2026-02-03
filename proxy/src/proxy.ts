/**
 * L402 Reverse Proxy Core
 * 
 * @trace Vol.2 §2.5 S-P1-04
 * @constraint D-ECO-02 (Proxy 可转发请求)
 */

import type { Application } from 'express';
import { createProxyMiddleware, type Options } from 'http-proxy-middleware';
import type { ProxyConfig } from './config.js';

/**
 * 设置反向代理路由
 */
export function setupProxy(app: Application, config: ProxyConfig): void {
    const proxyOptions: Options = {
        target: config.upstreamUrl,
        changeOrigin: true,
        pathRewrite: (path) => path, // 保持原路径
        on: {
            proxyReq: (proxyReq, req) => {
                // 传递 L402 验证信息到上游 (可选)
                if ((req as Express.Request).l402?.verified) {
                    proxyReq.setHeader('X-L402-Verified', 'true');
                }
            },
            proxyRes: (proxyRes, _req, _res) => {
                // 添加 L402 响应头
                proxyRes.headers['X-L402-Proxy'] = 'daemon/l402-proxy';
            },
            error: (err, _req, res) => {
                console.error('[Proxy Error]', err);
                if ('writeHead' in res && typeof res.writeHead === 'function') {
                    try {
                        res.writeHead(502, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            error: 'Bad Gateway',
                            message: 'Failed to connect to upstream server',
                        }));
                    } catch {
                        // Response already sent
                    }
                }
            },
        },
    };

    // 代理所有未匹配的路由到上游
    app.use('/', createProxyMiddleware(proxyOptions));
}
