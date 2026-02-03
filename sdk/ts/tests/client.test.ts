/**
 * L402 Client Unit Tests
 * 
 * @trace Task-P1-03
 * @constraint D-SDK-06: 单元测试通过
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    L402Client,
    L402InvalidChallengeError,
    L402PaymentFailedError,
    formatCredentialHeader,
} from '../src';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('formatCredentialHeader', () => {
    it('formats credential correctly', () => {
        const result = formatCredentialHeader({
            macaroon: 'mac123',
            preimage: 'pre456',
        });
        expect(result).toBe('L402 mac123:pre456');
    });
});

describe('L402Client', () => {
    const mockPaymentHandler = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockPaymentHandler.mockResolvedValue('a'.repeat(64));
    });

    describe('successful request', () => {
        it('returns response directly for non-402', async () => {
            const mockResponse = new Response(JSON.stringify({ data: 'ok' }), {
                status: 200,
            });
            mockFetch.mockResolvedValue(mockResponse);

            const client = new L402Client({ paymentHandler: mockPaymentHandler });
            const response = await client.get('https://api.example.com/test');

            expect(response.status).toBe(200);
            expect(mockPaymentHandler).not.toHaveBeenCalled();
        });
    });

    describe('402 payment flow', () => {
        it('handles 402 and retries with credential', async () => {
            // First response: 402
            const mock402Response = new Response(
                JSON.stringify({ paymentHash: 'abc123', amountMsats: 1000 }),
                {
                    status: 402,
                    headers: {
                        'WWW-Authenticate': 'L402 macaroon="testmac", invoice="lnbc1000..."',
                    },
                }
            );

            // Second response: 200
            const mock200Response = new Response(JSON.stringify({ data: 'ok' }), {
                status: 200,
            });

            mockFetch.mockResolvedValueOnce(mock402Response);
            mockFetch.mockResolvedValueOnce(mock200Response);

            const client = new L402Client({ paymentHandler: mockPaymentHandler });
            const response = await client.request('https://api.example.com/paid');

            expect(response.status).toBe(200);
            expect(mockPaymentHandler).toHaveBeenCalledWith('lnbc1000...');
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('includes Authorization header in retry', async () => {
            const mock402Response = new Response(
                JSON.stringify({}),
                {
                    status: 402,
                    headers: {
                        'WWW-Authenticate': 'L402 macaroon="mac", invoice="inv"',
                    },
                }
            );
            const mock200Response = new Response('', { status: 200 });

            mockFetch.mockResolvedValueOnce(mock402Response);
            mockFetch.mockResolvedValueOnce(mock200Response);

            const client = new L402Client({ paymentHandler: mockPaymentHandler });
            await client.request('https://api.example.com/paid');

            const secondCall = mockFetch.mock.calls[1];
            const headers = secondCall[1]?.headers as Headers;
            expect(headers.get('Authorization')).toBe(`L402 mac:${'a'.repeat(64)}`);
        });
    });

    describe('challenge parsing', () => {
        it('throws on invalid WWW-Authenticate header', async () => {
            const mockResponse = new Response('', {
                status: 402,
                headers: { 'WWW-Authenticate': 'Invalid' },
            });
            mockFetch.mockResolvedValue(mockResponse);

            const client = new L402Client({ paymentHandler: mockPaymentHandler });

            await expect(client.get('https://api.example.com/test')).rejects.toThrow(
                L402InvalidChallengeError
            );
        });

        it('throws on missing macaroon', async () => {
            const mockResponse = new Response('', {
                status: 402,
                headers: { 'WWW-Authenticate': 'L402 invoice="inv"' },
            });
            mockFetch.mockResolvedValue(mockResponse);

            const client = new L402Client({ paymentHandler: mockPaymentHandler });

            await expect(client.get('https://api.example.com/test')).rejects.toThrow(
                L402InvalidChallengeError
            );
        });
    });

    describe('payment handling', () => {
        it('throws on payment failure', async () => {
            mockPaymentHandler.mockRejectedValue(new Error('Network error'));

            const mockResponse = new Response(
                JSON.stringify({}),
                {
                    status: 402,
                    headers: {
                        'WWW-Authenticate': 'L402 macaroon="mac", invoice="inv"',
                    },
                }
            );
            mockFetch.mockResolvedValue(mockResponse);

            const client = new L402Client({ paymentHandler: mockPaymentHandler });

            await expect(client.get('https://api.example.com/test')).rejects.toThrow(
                L402PaymentFailedError
            );
        });

        it('throws on invalid preimage length', async () => {
            mockPaymentHandler.mockResolvedValue('short');

            const mockResponse = new Response(
                JSON.stringify({}),
                {
                    status: 402,
                    headers: {
                        'WWW-Authenticate': 'L402 macaroon="mac", invoice="inv"',
                    },
                }
            );
            mockFetch.mockResolvedValue(mockResponse);

            const client = new L402Client({ paymentHandler: mockPaymentHandler });

            await expect(client.get('https://api.example.com/test')).rejects.toThrow(
                'Invalid preimage'
            );
        });
    });

    describe('HTTP methods', () => {
        beforeEach(() => {
            mockFetch.mockResolvedValue(new Response('', { status: 200 }));
        });

        it('post method uses POST', async () => {
            const client = new L402Client({ paymentHandler: mockPaymentHandler });
            await client.post('https://api.example.com/test');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.example.com/test',
                expect.objectContaining({ method: 'POST' })
            );
        });

        it('put method uses PUT', async () => {
            const client = new L402Client({ paymentHandler: mockPaymentHandler });
            await client.put('https://api.example.com/test');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.example.com/test',
                expect.objectContaining({ method: 'PUT' })
            );
        });

        it('delete method uses DELETE', async () => {
            const client = new L402Client({ paymentHandler: mockPaymentHandler });
            await client.delete('https://api.example.com/test');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.example.com/test',
                expect.objectContaining({ method: 'DELETE' })
            );
        });
    });
});
