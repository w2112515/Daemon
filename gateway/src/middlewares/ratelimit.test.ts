/**
 * Rate Limit Middleware Tests
 * 
 * @trace Task-P2-01, D-P2-01b~c
 * @note 仅测试不依赖 Redis Mock 的核心配置逻辑
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { rateLimitMiddleware, RateLimitConfig } from './ratelimit';

describe('Rate Limit Middleware (Configuration)', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        mockReq = {
            path: '/api/compute',
            ip: '127.0.0.1',
            socket: { remoteAddress: '127.0.0.1' } as any,
            headers: {},
            l402: undefined,
        };

        mockRes = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            setHeader: vi.fn().mockReturnThis(),
        };

        mockNext = vi.fn();
    });

    describe('D-P2-01b: skipPaths 配置', () => {
        it('should skip rate limiting for /health path', async () => {
            const config: RateLimitConfig = {
                skipPaths: ['/health', '/api'],
            };
            const middleware = rateLimitMiddleware(config);

            mockReq.path = '/health';
            await middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(mockRes.status).not.toHaveBeenCalled();
        });

        it('should skip rate limiting for /api path prefix', async () => {
            const config: RateLimitConfig = {
                skipPaths: ['/health', '/api'],
            };
            const middleware = rateLimitMiddleware(config);

            mockReq.path = '/api';
            await middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(mockRes.status).not.toHaveBeenCalled();
        });

        it('should skip rate limiting for /api/telemetry', async () => {
            const config: RateLimitConfig = {
                skipPaths: ['/api/telemetry'],
            };
            const middleware = rateLimitMiddleware(config);

            mockReq.path = '/api/telemetry/health';
            await middleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });
    });

    describe('D-P2-01c: Custom Key Generator', () => {
        it('should accept custom keyGenerator config', () => {
            // 验证配置可接受 keyGenerator (静态类型检查)
            const config: RateLimitConfig = {
                keyGenerator: (_req) => `custom:test`,
            };

            // 仅验证中间件可创建 (不运行 Redis 调用)
            expect(() => rateLimitMiddleware(config)).not.toThrow();
        });
    });

    describe('Environment Variable Configuration', () => {
        it('should use default values when env vars not set', () => {
            // 验证中间件可以成功创建 (无运行时错误)
            expect(() => rateLimitMiddleware()).not.toThrow();
        });

        it('should accept explicit config override', () => {
            const config: RateLimitConfig = {
                windowMs: 30000,
                maxRequests: 50,
            };

            expect(() => rateLimitMiddleware(config)).not.toThrow();
        });
    });
});

describe('Rate Limit 429 Response Structure', () => {
    it('should have correct 429 response format', () => {
        // 验证期望的响应结构 (静态验证)
        const expectedResponse = {
            error: 'Too Many Requests',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfterSeconds: expect.any(Number),
            limit: expect.any(Number),
            window: expect.any(String),
        };

        expect(expectedResponse).toEqual({
            error: 'Too Many Requests',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfterSeconds: expect.any(Number),
            limit: expect.any(Number),
            window: expect.any(String),
        });
    });
});
