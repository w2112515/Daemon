/**
 * Gateway Main Application - L402 Payment Gateway
 * 
 * @trace Vol.2 S-UI-08, Task-25
 * @description 主应用入口，集成 L402 中间件和遥测 API
 */

import express, { Express, Request, Response, NextFunction } from 'express';

import { createTelemetryRouter } from './routes/telemetry';
import { l402Middleware } from './middlewares/l402';
import { replayProtectionMiddleware } from './middlewares/replay';
import { allowlistMiddleware } from './middlewares/allowlist';
import { circuitBreakerMiddleware, circuitStatusHandler } from './middlewares/circuit';


/** 创建 Gateway 应用 */
export function createApp(): Express {
    const app = express();

    // CORS 中间件 (内联实现)
    app.use((_req: Request, res: Response, next: NextFunction) => {
        res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (_req.method === 'OPTIONS') {
            res.sendStatus(200);
            return;
        }
        next();
    });

    // Body 解析
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true }));

    // 请求日志 (简化版)
    app.use((req: Request, _res: Response, next: NextFunction) => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
        next();
    });

    // ===================
    // Public Routes
    // ===================

    /** 健康检查 */
    app.get('/health', (_req: Request, res: Response) => {
        res.status(200).json({
            status: 'healthy',
            version: process.env.VERSION || '0.1.0',
            timestamp: new Date().toISOString(),
        });
    });

    /** API 版本信息 */
    app.get('/api', (_req: Request, res: Response) => {
        res.status(200).json({
            name: 'Daemon L402 Gateway',
            version: process.env.VERSION || '0.1.0',
            documentation: 'https://github.com/Daemon-AI/luma',
            endpoints: {
                health: '/health',
                telemetry: '/api/telemetry',
                compute: '/api/compute (L402 protected)',
            },
        });
    });

    // ===================
    // Telemetry Routes (Task-23, Task-25)
    // ===================
    app.use('/api/telemetry', createTelemetryRouter());

    // ===================
    // Circuit Status Route (Task-I-01)
    // ===================
    app.get('/api/circuit-status', circuitStatusHandler);

    // ===================
    // L402 Protected Routes
    // ===================

    // Hardening 中间件 (Phase 0.5, Task-I-01)
    const replayProtection = replayProtectionMiddleware();
    const allowlist = allowlistMiddleware({ skipPaths: ['/health', '/api', '/api/telemetry'] });
    const circuitBreaker = circuitBreakerMiddleware({ skipPaths: ['/health', '/api/circuit-status'] });

    // 创建 L402 中间件实例（配置固定定价）
    const l402 = l402Middleware({
        getPricing: async () => ({
            amountMsats: 1000, // 1 sat per call
            memo: 'Daemon API Call',
        }),
        service: 'daemon-gateway',
        tokenExpirySeconds: 3600,
    });

    /** 示例受保护端点 - 需要 L402 支付 + Hardening */
    app.get('/api/compute', circuitBreaker, l402, replayProtection, allowlist, (_req: Request, res: Response) => {
        res.status(200).json({
            result: 'Hello from L402 protected endpoint!',
            timestamp: new Date().toISOString(),
            message: 'Your payment was verified successfully.',
        });
    });

    app.post('/api/compute', circuitBreaker, l402, replayProtection, allowlist, (req: Request, res: Response) => {
        const { prompt } = req.body as { prompt?: string };

        res.status(200).json({
            result: `Processed: ${prompt || 'No prompt provided'}`,
            timestamp: new Date().toISOString(),
            credits_used: 1,
        });
    });

    // ===================
    // Error Handling
    // ===================

    /** 404 处理 */
    app.use((_req: Request, res: Response) => {
        res.status(404).json({
            error: 'Not Found',
            message: 'The requested resource does not exist',
        });
    });

    /** 全局错误处理 */
    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
        console.error('[Gateway Error]', err);

        res.status(500).json({
            error: 'Internal Server Error',
            message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
        });
    });

    return app;
}

/** 启动服务器 */
export function startServer(port: number = 3000): void {
    const app = createApp();

    // D-H-06b: 启动时输出 LND 模式
    const lndMode = process.env.LND_MODE?.toLowerCase() ?? 'mock';
    const lndModeWarning = lndMode === 'mock'
        ? '⚠️  MODE: MOCK - All invoices are simulated'
        : '✓  MODE: REAL - Connected to LND gRPC';

    app.listen(port, () => {
        console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   ⚡ Daemon L402 Gateway                                  ║
║                                                          ║
║   Server running on http://localhost:${port}               ║
║                                                          ║
║   LND: ${lndModeWarning.padEnd(45)}║
║                                                          ║
║   Endpoints:                                             ║
║   • Health:    GET  /health                              ║
║   • Telemetry: GET  /api/telemetry/health                ║
║   • Compute:   GET  /api/compute (L402 protected)        ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
        `);
    });
}

// 仅当直接运行时启动服务器 (ESM 兼容)
const isMainModule = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isMainModule || process.argv[1]?.endsWith('index.ts')) {
    const port = parseInt(process.env.PORT || '3000', 10);
    startServer(port);
}

export default createApp;
