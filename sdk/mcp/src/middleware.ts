/**
 * L402 Express Middleware for MCP Servers
 * 
 * @trace Vol.2 §2.5 S-P1-06
 * @constraint D-ECO-06: MCP Server 可接入 L402 付费墙
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type {
    L402MiddlewareConfig,
    L402TokenParsed,
    L402ErrorResponse,
    L402Pricing,
} from './types';

/**
 * 解析 L402 Token 从 Authorization Header
 * 
 * Format: "L402 <macaroon>:<preimage>"
 * 
 * @param header - Authorization header value
 * @returns Parsed token or null if invalid
 */
function parseL402Token(header: string): L402TokenParsed | null {
    // 格式: "L402 <base64_macaroon>:<hex_preimage>"
    const match = header.match(/^L402\s+([^:]+):([a-fA-F0-9]+)$/);
    if (!match) return null;

    const [, macaroon, preimage] = match;

    // 验证 preimage 长度 (32 bytes = 64 hex chars)
    if (preimage.length !== 64) return null;

    return { macaroon, preimage };
}

/**
 * 发送 402 Challenge 响应
 */
async function sendChallenge(
    req: Request,
    res: Response,
    config: L402MiddlewareConfig,
): Promise<void> {
    // 获取定价
    const pricing = await config.getPricing(req);

    // 创建 Invoice
    const invoice = await config.createInvoice(pricing.amountMsats, pricing.memo);

    // 铸造 Macaroon (绑定 Payment Hash)
    const macaroon = await config.mintMacaroon(invoice.paymentHash);

    // 设置 WWW-Authenticate Header (L402 规范)
    res.setHeader(
        'WWW-Authenticate',
        `L402 macaroon="${macaroon}", invoice="${invoice.paymentRequest}"`,
    );

    // 返回 402 响应
    const body: L402ErrorResponse = {
        error: 'Payment Required',
        paymentHash: invoice.paymentHash,
        amountMsats: pricing.amountMsats,
        memo: pricing.memo,
    };

    res.status(402).json(body);
}

/**
 * L402 Middleware Factory
 * 
 * 创建一个 Express 中间件，用于保护 MCP Server 端点
 * 
 * 流程:
 * 1. 检查是否跳过路径
 * 2. 提取 Authorization Header
 * 3. 无 Token → 返回 402 Challenge
 * 4. 有 Token → 验证 Macaroon + Preimage
 * 5. 验证通过 → 放行到下游 Handler
 * 
 * @param config - Middleware 配置
 * @returns Express Middleware
 */
export function l402Middleware(config: L402MiddlewareConfig): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            // 1. 检查跳过路径
            if (config.skipPaths?.some((p) => req.path.startsWith(p))) {
                next();
                return;
            }

            // 2. 提取 Authorization Header
            const authHeader = req.headers.authorization;

            // 3. 无 Token → 返回 402 Challenge
            if (!authHeader?.startsWith('L402 ')) {
                await sendChallenge(req, res, config);
                return;
            }

            // 4. 解析 Token
            const token = parseL402Token(authHeader);
            if (!token) {
                res.status(400).json({ error: 'Invalid L402 token format' });
                return;
            }

            // 5. 验证 Token
            const result = await config.verifyCredential(token.macaroon, token.preimage);

            if (!result.valid) {
                res.status(400).json({
                    error: result.error ?? 'Token verification failed',
                });
                return;
            }

            // 6. 附加上下文到请求
            req.l402 = {
                verified: true,
                paymentHash: result.paymentHash,
            };

            // 7. 放行
            next();
        } catch (error) {
            console.error('[L402-MCP] Middleware error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };
}

/**
 * 默认定价策略 (固定价格)
 * 
 * @param amountMsats - 固定价格 (毫聪)
 * @param memo - 固定备注
 * @returns getPricing 函数
 */
export function fixedPricing(
    amountMsats: number,
    memo = 'MCP API Call',
): L402MiddlewareConfig['getPricing'] {
    return () => ({ amountMsats, memo });
}

/**
 * 按请求方法定价策略
 * 
 * @param prices - 方法 → 价格映射
 * @param defaultPrice - 默认价格
 * @returns getPricing 函数
 */
export function methodBasedPricing(
    prices: Record<string, number>,
    defaultPrice = 1000,
): L402MiddlewareConfig['getPricing'] {
    return (req) => ({
        amountMsats: prices[req.method] ?? defaultPrice,
        memo: `${req.method} ${req.path}`,
    });
}

/**
 * Mock Invoice 生成器 (用于演示)
 * 
 * @returns createInvoice 函数
 */
export function mockInvoiceGenerator(): L402MiddlewareConfig['createInvoice'] {
    return async (amountMsats: number, _memo: string) => {
        const paymentHash = generateRandomHex(64);
        const paymentRequest = `lnbc${amountMsats}n1mock${paymentHash.slice(0, 20)}`;
        return { paymentRequest, paymentHash };
    };
}

/**
 * Mock Macaroon 铸造器 (用于演示)
 * 
 * @param secret - 密钥
 * @returns mintMacaroon 函数
 */
export function mockMacaroonMinter(secret = 'demo-secret'): L402MiddlewareConfig['mintMacaroon'] {
    return (paymentHash: string) => {
        // 简单的 mock: base64(paymentHash:secret)
        return Buffer.from(`${paymentHash}:${secret}`).toString('base64');
    };
}

/**
 * Mock 凭证验证器 (用于演示)
 * 
 * 验证逻辑: preimage 的 SHA256 等于 Macaroon 中存储的 paymentHash
 * 
 * @param secret - 密钥
 * @returns verifyCredential 函数
 */
export function mockCredentialVerifier(_secret = 'demo-secret'): L402MiddlewareConfig['verifyCredential'] {
    return (macaroon: string, preimage: string) => {
        try {
            const decoded = Buffer.from(macaroon, 'base64').toString('utf8');
            const [storedHash] = decoded.split(':');

            // Mock: 直接比较 (实际应用需要 SHA256 验证)
            // 这里简化为检查 preimage 是否为有效的 hex + 长度正确
            if (preimage.length === 64 && storedHash) {
                return { valid: true, paymentHash: storedHash };
            }
            return { valid: false, error: 'Invalid preimage' };
        } catch {
            return { valid: false, error: 'Invalid macaroon format' };
        }
    };
}

/**
 * 生成随机 hex 字符串
 */
function generateRandomHex(length: number): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * 16)];
    }
    return result;
}
