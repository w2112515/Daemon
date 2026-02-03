/**
 * L402 Middleware Types
 * 
 * @trace Vol.2 S-P0-04, Vol.1 §2.2
 * @constraint D-GW-01: 未付款请求返回 402 + WWW-Authenticate Header
 */

import { Request } from 'express';
import { MacaroonCaveat } from './macaroon';

/** L402 挑战信息 (返回给客户端) */
export interface L402Challenge {
    macaroon: string;       // base64 encoded
    invoice: string;        // bolt11 payment request
    paymentHash: string;    // hex
}

/** 解析后的 L402 Token */
export interface L402TokenParsed {
    macaroon: string;       // base64
    preimage: string;       // 32-byte hex
}

/** L402 Middleware 配置 */
export interface L402MiddlewareOptions {
    /** 价格策略回调 (按请求定价) */
    getPricing: (req: Request) => Promise<{ amountMsats: number; memo: string }>;
    /** Macaroon 有效期 (秒)，默认 3600 */
    tokenExpirySeconds?: number;
    /** 跳过验证的路径前缀 */
    skipPaths?: string[];
    /** 服务标识符 (用于 Caveat) */
    service?: string;
}

/** 扩展 Express Request 类型 */
export interface L402VerifiedContext {
    verified: true;
    caveats: MacaroonCaveat[];
    paymentHash?: string;
}

/** Express Request 扩展 */
declare global {
    namespace Express {
        interface Request {
            l402?: L402VerifiedContext;
        }
    }
}

/** 402 响应 Body */
export interface L402ErrorResponse {
    error: string;
    paymentHash: string;
    amountMsats: number;
    memo: string;
}
