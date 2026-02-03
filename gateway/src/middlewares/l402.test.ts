/**
 * L402 Middleware Unit Tests
 * 
 * @trace Task-16, Vol.2 S-P0-04
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { l402Middleware, fixedPricing } from './l402';
import { getMacaroonService, MacaroonService } from '../utils/macaroon';
import crypto from 'crypto';

// Mock express request/response
function createMockRequest(options: {
    path?: string;
    method?: string;
    headers?: Record<string, string>;
}): Partial<Request> {
    return {
        path: options.path || '/api/test',
        method: options.method || 'GET',
        headers: options.headers || {},
    };
}

function createMockResponse(): {
    res: Partial<Response>;
    getStatus: () => number;
    getBody: () => unknown;
    getHeader: (name: string) => string | undefined;
} {
    let status = 200;
    let body: unknown = null;
    const headers: Record<string, string> = {};

    const res: Partial<Response> = {
        status: vi.fn((code: number) => {
            status = code;
            return res as Response;
        }),
        json: vi.fn((data: unknown) => {
            body = data;
            return res as Response;
        }),
        setHeader: vi.fn((name: string, value: string) => {
            headers[name] = value;
            return res as Response;
        }),
    };

    return {
        res,
        getStatus: () => status,
        getBody: () => body,
        getHeader: (name: string) => headers[name],
    };
}

describe('L402 Middleware', () => {
    let macaroonService: MacaroonService;

    beforeEach(() => {
        // 使用固定 root key 确保 macaroon 可验证
        process.env.L402_SECRET_KEY = 'a'.repeat(64);
        macaroonService = getMacaroonService();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('无 Token 请求', () => {
        it('应返回 402 + WWW-Authenticate Header', async () => {
            const middleware = l402Middleware({
                getPricing: fixedPricing(1000, 'Test API'),
            });

            const req = createMockRequest({});
            const { res, getStatus, getBody, getHeader } = createMockResponse();
            const next = vi.fn();

            await middleware(req as Request, res as Response, next);

            expect(getStatus()).toBe(402);
            expect(next).not.toHaveBeenCalled();

            const body = getBody() as Record<string, unknown>;
            expect(body.error).toBe('Payment Required');
            expect(body.amountMsats).toBe(1000);

            const wwwAuth = getHeader('WWW-Authenticate');
            expect(wwwAuth).toMatch(/^L402 macaroon="[^"]+", invoice="[^"]+"$/);
        });
    });

    describe('无效 Token 格式', () => {
        it('非 L402 前缀应返回 402', async () => {
            const middleware = l402Middleware({
                getPricing: fixedPricing(1000, 'Test'),
            });

            const req = createMockRequest({
                headers: { authorization: 'Bearer invalid' },
            });
            const { res, getStatus } = createMockResponse();
            const next = vi.fn();

            await middleware(req as Request, res as Response, next);

            expect(getStatus()).toBe(402);
            expect(next).not.toHaveBeenCalled();
        });

        it('格式错误的 L402 Token 应返回 400', async () => {
            const middleware = l402Middleware({
                getPricing: fixedPricing(1000, 'Test'),
            });

            const req = createMockRequest({
                headers: { authorization: 'L402 invalid-format-no-colon' },
            });
            const { res, getStatus, getBody } = createMockResponse();
            const next = vi.fn();

            await middleware(req as Request, res as Response, next);

            expect(getStatus()).toBe(400);
            expect((getBody() as Record<string, unknown>).error).toBe('Invalid L402 token format');
        });
    });

    describe('错误 Preimage', () => {
        it('Preimage 不匹配应返回 400', async () => {
            const middleware = l402Middleware({
                getPricing: fixedPricing(1000, 'Test'),
            });

            // 创建有效 Macaroon (需要真实 payment hash)
            const fakePreimage = crypto.randomBytes(32).toString('hex');
            const fakePaymentHash = crypto.createHash('sha256')
                .update(Buffer.from(fakePreimage, 'hex'))
                .digest('hex');

            const macaroon = macaroonService.mint({ paymentHash: fakePaymentHash });

            // 使用错误的 preimage
            const wrongPreimage = 'b'.repeat(64);

            const req = createMockRequest({
                headers: { authorization: `L402 ${macaroon}:${wrongPreimage}` },
            });
            const { res, getStatus, getBody } = createMockResponse();
            const next = vi.fn();

            await middleware(req as Request, res as Response, next);

            expect(getStatus()).toBe(400);
            expect((getBody() as Record<string, unknown>).error).toContain('does not match');
        });
    });

    describe('正确 Token', () => {
        it('验证通过应放行到下游 Handler', async () => {
            const middleware = l402Middleware({
                getPricing: fixedPricing(1000, 'Test'),
            });

            // 创建匹配的 preimage/hash 对
            const preimage = crypto.randomBytes(32).toString('hex');
            const paymentHash = crypto.createHash('sha256')
                .update(Buffer.from(preimage, 'hex'))
                .digest('hex');

            const macaroon = macaroonService.mint({ paymentHash });

            const req = createMockRequest({
                headers: { authorization: `L402 ${macaroon}:${preimage}` },
            });
            const { res, getStatus } = createMockResponse();
            const next = vi.fn();

            await middleware(req as Request, res as Response, next);

            expect(next).toHaveBeenCalled();
            expect((req as Request).l402?.verified).toBe(true);
        });
    });

    describe('skipPaths 配置', () => {
        it('跳过路径不需要认证', async () => {
            const middleware = l402Middleware({
                getPricing: fixedPricing(1000, 'Test'),
                skipPaths: ['/health', '/public'],
            });

            const req = createMockRequest({ path: '/health' });
            const { res } = createMockResponse();
            const next = vi.fn();

            await middleware(req as Request, res as Response, next);

            expect(next).toHaveBeenCalled();
        });

        it('非跳过路径仍需认证', async () => {
            const middleware = l402Middleware({
                getPricing: fixedPricing(1000, 'Test'),
                skipPaths: ['/health'],
            });

            const req = createMockRequest({ path: '/api/protected' });
            const { res, getStatus } = createMockResponse();
            const next = vi.fn();

            await middleware(req as Request, res as Response, next);

            expect(getStatus()).toBe(402);
        });
    });
});
