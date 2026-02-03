/**
 * L402 Middleware for Proxy
 * 
 * @trace Vol.2 §2.5 S-P1-04
 * @constraint D-ECO-03 (环境变量配置价格)
 */

import type { Request, Response, NextFunction } from 'express';
import type { ProxyConfig } from './config.js';

declare global {
    namespace Express {
        interface Request {
            l402?: {
                verified: boolean;
                paymentHash?: string;
                macaroon?: string;
            };
        }
    }
}

interface InvoiceResult {
    paymentHash: string;
    invoice: string;
}

/**
 * Mock Macaroon 铸造
 */
function mintMacaroon(secret: string, paymentHash: string): string {
    const payload = JSON.stringify({
        paymentHash,
        exp: Date.now() + 3600000,
        iss: 'l402-proxy',
    });
    const sig = Buffer.from(`${secret}:${paymentHash}`).toString('base64').slice(0, 16);
    return Buffer.from(`${payload}|${sig}`).toString('base64');
}

/**
 * Mock Macaroon 验证
 */
function verifyMacaroon(secret: string, macaroon: string, preimage: string): boolean {
    try {
        const decoded = Buffer.from(macaroon, 'base64').toString();
        const [payloadStr] = decoded.split('|');
        const payload = JSON.parse(payloadStr);
        return payload.exp > Date.now();
    } catch {
        return false;
    }
}

/**
 * Mock Invoice 生成
 */
function createMockInvoice(amountMsats: number, memo: string): InvoiceResult {
    const hash = Buffer.from(Date.now().toString()).toString('hex').padEnd(64, '0');
    return {
        paymentHash: hash,
        invoice: `lnbc${amountMsats}n1mock${hash.slice(0, 40)}`,
    };
}

/**
 * 发送 402 挑战
 */
function sendChallenge(res: Response, config: ProxyConfig): void {
    const { paymentHash, invoice } = createMockInvoice(config.pricePerRequest, config.priceMemo);
    const macaroon = mintMacaroon(config.l402Secret, paymentHash);

    res.setHeader('WWW-Authenticate', `L402 macaroon="${macaroon}", invoice="${invoice}"`);
    res.status(402).json({
        error: 'Payment Required',
        message: 'Please pay the invoice and retry with L402 credentials',
        pricing: {
            amountMsats: config.pricePerRequest,
            memo: config.priceMemo,
        },
    });
}

/**
 * L402 Middleware 工厂
 */
export function createL402Middleware(config: ProxyConfig) {
    return (req: Request, res: Response, next: NextFunction): void => {
        // 跳过配置的路径
        if (config.skipPaths.some(path => req.path === path || req.path.startsWith(`${path}/`))) {
            return next();
        }

        const auth = req.headers.authorization;

        // 验证 L402 凭证
        if (auth?.startsWith('L402 ')) {
            const [macaroon, preimage] = auth.slice(5).split(':');
            if (macaroon && preimage && verifyMacaroon(config.l402Secret, macaroon, preimage)) {
                req.l402 = { verified: true, macaroon };
                return next();
            }
        }

        // 返回 402 挑战
        sendChallenge(res, config);
    };
}
