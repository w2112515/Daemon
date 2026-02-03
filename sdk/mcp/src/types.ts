/**
 * L402 MCP SDK Types
 * 
 * @trace Vol.2 §2.5 S-P1-06
 */

import type { Request } from 'express';

/**
 * L402 中间件配置
 */
export interface L402MiddlewareConfig {
    /**
     * 获取请求价格 (毫聪)
     * @param req - Express 请求对象
     * @returns 价格和备注
     */
    getPricing: (req: Request) => Promise<L402Pricing> | L402Pricing;

    /**
     * 生成 Invoice
     * @param amountMsats - 金额 (毫聪)
     * @param memo - 备注
     * @returns Invoice 信息
     */
    createInvoice: (amountMsats: number, memo: string) => Promise<L402Invoice>;

    /**
     * 铸造 Macaroon
     * @param paymentHash - 付款哈希
     * @returns Base64 编码的 Macaroon
     */
    mintMacaroon: (paymentHash: string) => Promise<string> | string;

    /**
     * 验证凭证
     * @param macaroon - Base64 编码的 Macaroon
     * @param preimage - 付款 Preimage (64 hex chars)
     * @returns 验证结果
     */
    verifyCredential: (macaroon: string, preimage: string) => Promise<L402VerifyResult> | L402VerifyResult;

    /**
     * 跳过 L402 验证的路径前缀
     */
    skipPaths?: string[];

    /**
     * 服务名称 (用于 Macaroon)
     */
    service?: string;
}

/**
 * 定价信息
 */
export interface L402Pricing {
    /** 金额 (毫聪) */
    amountMsats: number;
    /** 备注 */
    memo: string;
}

/**
 * Invoice 信息
 */
export interface L402Invoice {
    /** BOLT11 Invoice 字符串 */
    paymentRequest: string;
    /** 付款哈希 (hex) */
    paymentHash: string;
}

/**
 * 凭证验证结果
 */
export interface L402VerifyResult {
    /** 是否有效 */
    valid: boolean;
    /** 错误信息 */
    error?: string;
    /** 付款哈希 */
    paymentHash?: string;
}

/**
 * 解析后的 L402 Token
 */
export interface L402TokenParsed {
    /** Base64 编码的 Macaroon */
    macaroon: string;
    /** Preimage (64 hex chars) */
    preimage: string;
}

/**
 * 附加到请求的 L402 上下文
 */
export interface L402RequestContext {
    /** 是否已验证 */
    verified: boolean;
    /** 付款哈希 */
    paymentHash?: string;
}

/**
 * 402 错误响应体
 */
export interface L402ErrorResponse {
    /** 错误信息 */
    error: string;
    /** 付款哈希 */
    paymentHash?: string;
    /** 金额 (毫聪) */
    amountMsats?: number;
    /** 备注 */
    memo?: string;
}

// Express Request 扩展
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            l402?: L402RequestContext;
        }
    }
}
