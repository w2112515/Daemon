/**
 * L402 Middleware Tests
 * 
 * @trace Vol.2 §2.5 S-P1-06
 * @constraint D-ECO-06: Demo Server 可运行
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
    l402Middleware,
    fixedPricing,
    methodBasedPricing,
    mockInvoiceGenerator,
    mockMacaroonMinter,
    mockCredentialVerifier,
} from '../src';
import type { L402MiddlewareConfig } from '../src';

// Mock Express Request/Response
function createMockRequest(overrides: Partial<Request> = {}): Request {
    return {
        path: '/api/test',
        method: 'GET',
        headers: {},
        body: {},
        ...overrides,
    } as Request;
}

function createMockResponse(): Response & { _statusCode: number; _body: unknown; _headers: Record<string, string> } {
    const res = {
        _statusCode: 200,
        _body: null as unknown,
        _headers: {} as Record<string, string>,
        status(code: number) {
            this._statusCode = code;
            return this;
        },
        json(body: unknown) {
            this._body = body;
            return this;
        },
        setHeader(name: string, value: string) {
            this._headers[name] = value;
            return this;
        },
    };
    return res as Response & typeof res;
}

describe('L402 Middleware', () => {
    let config: L402MiddlewareConfig;

    beforeEach(() => {
        config = {
            getPricing: fixedPricing(1000, 'Test API Call'),
            createInvoice: mockInvoiceGenerator(),
            mintMacaroon: mockMacaroonMinter('test-secret'),
            verifyCredential: mockCredentialVerifier('test-secret'),
            skipPaths: ['/health'],
            service: 'test-service',
        };
    });

    describe('Challenge Response', () => {
        it('should return 402 when no Authorization header', async () => {
            const middleware = l402Middleware(config);
            const req = createMockRequest({ headers: {} });
            const res = createMockResponse();
            const next = vi.fn();

            await middleware(req, res, next);

            expect(res._statusCode).toBe(402);
            expect(res._body).toEqual(expect.objectContaining({
                error: 'Payment Required',
                amountMsats: 1000,
                memo: 'Test API Call',
            }));
            expect(res._headers['WWW-Authenticate']).toMatch(/^L402 macaroon="[^"]+", invoice="[^"]+"/);
            expect(next).not.toHaveBeenCalled();
        });

        it('should return 402 when Authorization header is not L402', async () => {
            const middleware = l402Middleware(config);
            const req = createMockRequest({ headers: { authorization: 'Bearer token' } });
            const res = createMockResponse();
            const next = vi.fn();

            await middleware(req, res, next);

            expect(res._statusCode).toBe(402);
            expect(next).not.toHaveBeenCalled();
        });

        it('should include WWW-Authenticate header with macaroon and invoice', async () => {
            const middleware = l402Middleware(config);
            const req = createMockRequest();
            const res = createMockResponse();
            const next = vi.fn();

            await middleware(req, res, next);

            const wwwAuth = res._headers['WWW-Authenticate'];
            expect(wwwAuth).toBeDefined();
            expect(wwwAuth).toContain('macaroon=');
            expect(wwwAuth).toContain('invoice=');
        });
    });

    describe('Skip Paths', () => {
        it('should skip middleware for configured paths', async () => {
            const middleware = l402Middleware(config);
            const req = createMockRequest({ path: '/health' });
            const res = createMockResponse();
            const next = vi.fn();

            await middleware(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res._statusCode).toBe(200);
        });

        it('should not skip non-configured paths', async () => {
            const middleware = l402Middleware(config);
            const req = createMockRequest({ path: '/api/protected' });
            const res = createMockResponse();
            const next = vi.fn();

            await middleware(req, res, next);

            expect(res._statusCode).toBe(402);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('Token Validation', () => {
        it('should return 400 for invalid L402 token format', async () => {
            const middleware = l402Middleware(config);
            const req = createMockRequest({ headers: { authorization: 'L402 invalid-format' } });
            const res = createMockResponse();
            const next = vi.fn();

            await middleware(req, res, next);

            expect(res._statusCode).toBe(400);
            expect(res._body).toEqual({ error: 'Invalid L402 token format' });
        });

        it('should return 400 for preimage with wrong length', async () => {
            const middleware = l402Middleware(config);
            const req = createMockRequest({
                headers: { authorization: 'L402 bWFjYXJvb24=:1234' }, // short preimage
            });
            const res = createMockResponse();
            const next = vi.fn();

            await middleware(req, res, next);

            expect(res._statusCode).toBe(400);
        });

        it('should pass valid L402 token to next handler', async () => {
            const middleware = l402Middleware(config);
            const paymentHash = 'a'.repeat(64);
            const macaroon = Buffer.from(`${paymentHash}:test-secret`).toString('base64');
            const preimage = 'b'.repeat(64);

            const req = createMockRequest({
                headers: { authorization: `L402 ${macaroon}:${preimage}` },
            });
            const res = createMockResponse();
            const next = vi.fn();

            await middleware(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(req.l402?.verified).toBe(true);
            expect(req.l402?.paymentHash).toBe(paymentHash);
        });
    });

    describe('Pricing Strategies', () => {
        it('fixedPricing should return constant price', async () => {
            const pricing = fixedPricing(2000, 'Fixed Price');
            const result = await pricing({} as Request);

            expect(result).toEqual({
                amountMsats: 2000,
                memo: 'Fixed Price',
            });
        });

        it('methodBasedPricing should return price based on method', async () => {
            const pricing = methodBasedPricing({
                GET: 500,
                POST: 1500,
            }, 1000);

            const getReq = { method: 'GET', path: '/test' } as Request;
            const postReq = { method: 'POST', path: '/test' } as Request;
            const putReq = { method: 'PUT', path: '/test' } as Request;

            expect(await pricing(getReq)).toEqual({ amountMsats: 500, memo: 'GET /test' });
            expect(await pricing(postReq)).toEqual({ amountMsats: 1500, memo: 'POST /test' });
            expect(await pricing(putReq)).toEqual({ amountMsats: 1000, memo: 'PUT /test' });
        });
    });

    describe('Mock Implementations', () => {
        it('mockInvoiceGenerator should create invoice with valid structure', async () => {
            const generator = mockInvoiceGenerator();
            const invoice = await generator(1000, 'Test');

            expect(invoice.paymentRequest).toMatch(/^lnbc/);
            expect(invoice.paymentHash).toHaveLength(64);
            expect(invoice.paymentHash).toMatch(/^[0-9a-f]+$/);
        });

        it('mockMacaroonMinter should create base64 macaroon', async () => {
            const minter = mockMacaroonMinter('secret');
            const macaroon = await minter('paymenthash123');

            expect(typeof macaroon).toBe('string');
            expect(() => Buffer.from(macaroon, 'base64')).not.toThrow();
        });

        it('mockCredentialVerifier should validate correct credentials', async () => {
            const verifier = mockCredentialVerifier('secret');
            const paymentHash = 'a'.repeat(64);
            const macaroon = Buffer.from(`${paymentHash}:secret`).toString('base64');
            const preimage = 'b'.repeat(64);

            const result = await verifier(macaroon, preimage);

            expect(result.valid).toBe(true);
            expect(result.paymentHash).toBe(paymentHash);
        });

        it('mockCredentialVerifier should reject invalid preimage', async () => {
            const verifier = mockCredentialVerifier('secret');
            const macaroon = Buffer.from('hash:secret').toString('base64');

            const result = await verifier(macaroon, 'short');

            expect(result.valid).toBe(false);
        });
    });
});
