/**
 * L402 Middleware - Gateway 402 拦截器
 * 
 * @trace Vol.2 S-P0-04, Vol.1 §2.2
 * @constraint D-GW-01: 未付款请求返回 402 + WWW-Authenticate Header
 * @constraint 验证失败返回 400 (非 401) - L402 规范
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { getMacaroonService } from '../utils/macaroon';
import { createInvoice } from '../controllers/lnd';
import {
    L402MiddlewareOptions,
    L402TokenParsed,
    L402ErrorResponse,
} from '../types/l402';

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
 * 
 * @param req - Express request
 * @param res - Express response
 * @param options - Middleware options
 */
async function sendChallenge(
    req: Request,
    res: Response,
    options: L402MiddlewareOptions,
): Promise<void> {
    // 获取定价
    const pricing = await options.getPricing(req);

    // 创建 Invoice
    const invoice = await createInvoice(
        pricing.amountMsats,
        pricing.memo,
        options.tokenExpirySeconds || 3600,
    );

    // 铸造 Macaroon (绑定 Payment Hash)
    const service = getMacaroonService();
    const macaroon = service.mint({
        paymentHash: invoice.paymentHash,
        expirySeconds: options.tokenExpirySeconds || 3600,
        service: options.service,
    });

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
 * 创建一个 Express 中间件，用于保护需要付费的 API 端点
 * 
 * 流程:
 * 1. 检查是否跳过路径
 * 2. 提取 Authorization Header
 * 3. 无 Token → 返回 402 Challenge
 * 4. 有 Token → 验证 Macaroon + Preimage
 * 5. 验证通过 → 放行到下游 Handler
 * 
 * @param options - Middleware 配置
 * @returns Express Middleware
 */
export function l402Middleware(options: L402MiddlewareOptions): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            // 1. 检查跳过路径
            if (options.skipPaths?.some((p) => req.path.startsWith(p))) {
                next();
                return;
            }

            // 2. 提取 Authorization Header
            const authHeader = req.headers.authorization;

            // 3. 无 Token → 返回 402 Challenge
            if (!authHeader?.startsWith('L402 ')) {
                await sendChallenge(req, res, options);
                return;
            }

            // 4. 解析 Token
            const token = parseL402Token(authHeader);
            if (!token) {
                res.status(400).json({ error: 'Invalid L402 token format' });
                return;
            }

            // 5. 验证 Token
            const service = getMacaroonService();
            const result = service.verify(token.macaroon, token.preimage);

            if (!result.valid) {
                res.status(400).json({
                    error: result.error || 'Token verification failed',
                });
                return;
            }

            // 6. 附加上下文到请求
            req.l402 = {
                verified: true,
                caveats: result.caveats,
                paymentHash: result.paymentHash,
            };

            // 7. 放行
            next();
        } catch (error) {
            console.error('[L402] Middleware error:', error);
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
    memo = 'API Call',
): L402MiddlewareOptions['getPricing'] {
    return async () => ({ amountMsats, memo });
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
): L402MiddlewareOptions['getPricing'] {
    return async (req) => ({
        amountMsats: prices[req.method] ?? defaultPrice,
        memo: `${req.method} ${req.path}`,
    });
}
