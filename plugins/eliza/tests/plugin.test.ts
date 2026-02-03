/**
 * Tests for Eliza L402 Plugin
 * 
 * @trace Task-P1-07
 * @constraint D-ECO-04: Plugin loadable
 * @constraint D-ECO-05: payL402Invoice action works
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    elizaL402Plugin,
    configureL402Plugin,
} from '../src/index';

describe('elizaL402Plugin', () => {
    describe('plugin structure', () => {
        it('should have correct plugin name', () => {
            expect(elizaL402Plugin.name).toBe('@daemon/eliza-l402');
        });

        it('should have description', () => {
            expect(elizaL402Plugin.description).toContain('L402');
        });

        it('should export two actions', () => {
            expect(elizaL402Plugin.actions).toHaveLength(2);
        });

        it('should have PAY_L402_INVOICE action', () => {
            const action = elizaL402Plugin.actions?.find(
                (a) => a.name === 'PAY_L402_INVOICE'
            );
            expect(action).toBeDefined();
            expect(action?.description).toContain('preimage');
        });

        it('should have REQUEST_WITH_L402 action', () => {
            const action = elizaL402Plugin.actions?.find(
                (a) => a.name === 'REQUEST_WITH_L402'
            );
            expect(action).toBeDefined();
            expect(action?.description).toContain('L402');
        });
    });

    describe('plugin loadability (D-ECO-04)', () => {
        it('should be importable as default export', async () => {
            const { default: plugin } = await import('../src/index');
            expect(plugin).toBeDefined();
            expect(plugin.name).toBe('@daemon/eliza-l402');
        });

        it('should be importable as named export', async () => {
            const { elizaL402Plugin: plugin } = await import('../src/index');
            expect(plugin).toBeDefined();
            expect(plugin.actions).toBeDefined();
        });
    });
});

describe('payL402Invoice action (D-ECO-05)', () => {
    const mockPaymentHandler = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should reject if plugin not configured', async () => {
        // Get action directly without configuring plugin
        const action = elizaL402Plugin.actions?.find(
            (a) => a.name === 'PAY_L402_INVOICE'
        );
        expect(action).toBeDefined();

        // Create mock callback
        const callback = vi.fn();

        // Without configuration, handler should return false
        const mockRuntime = {} as never;
        const mockMessage = {
            content: { invoice: 'lnbc100n1p...' },
        } as never;
        const mockState = {} as never;

        const result = await action?.handler?.(
            mockRuntime,
            mockMessage,
            mockState,
            {},
            callback
        );

        // Should fail without configuration
        expect(result).toBe(false);
    });

    it('should call paymentHandler and return preimage', async () => {
        const testPreimage = 'a'.repeat(64);
        mockPaymentHandler.mockResolvedValueOnce(testPreimage);

        configureL402Plugin({
            paymentHandler: mockPaymentHandler,
        });

        const action = elizaL402Plugin.actions?.find(
            (a) => a.name === 'PAY_L402_INVOICE'
        );

        const callback = vi.fn();
        const mockRuntime = {} as never;
        const mockMessage = {
            content: { invoice: 'lnbc100n1pabcdef' },
        } as never;
        const mockState = {} as never;

        const result = await action?.handler?.(
            mockRuntime,
            mockMessage,
            mockState,
            {},
            callback
        );

        expect(result).toBe(true);
        expect(mockPaymentHandler).toHaveBeenCalledWith('lnbc100n1pabcdef');
        expect(callback).toHaveBeenCalledWith(
            expect.objectContaining({
                text: expect.stringContaining('Payment successful'),
                data: expect.objectContaining({ preimage: testPreimage }),
            })
        );
    });

    it('should extract invoice from text content', async () => {
        const testPreimage = 'b'.repeat(64);
        mockPaymentHandler.mockResolvedValueOnce(testPreimage);

        configureL402Plugin({
            paymentHandler: mockPaymentHandler,
        });

        const action = elizaL402Plugin.actions?.find(
            (a) => a.name === 'PAY_L402_INVOICE'
        );

        const callback = vi.fn();
        const mockRuntime = {} as never;
        const mockMessage = {
            content: { text: 'Please pay this: lntb500u1pfoobar' },
        } as never;
        const mockState = {} as never;

        await action?.handler?.(
            mockRuntime,
            mockMessage,
            mockState,
            {},
            callback
        );

        expect(mockPaymentHandler).toHaveBeenCalledWith('lntb500u1pfoobar');
    });

    it('should handle payment failure', async () => {
        mockPaymentHandler.mockRejectedValueOnce(new Error('Insufficient funds'));

        configureL402Plugin({
            paymentHandler: mockPaymentHandler,
        });

        const action = elizaL402Plugin.actions?.find(
            (a) => a.name === 'PAY_L402_INVOICE'
        );

        const callback = vi.fn();
        const mockRuntime = {} as never;
        const mockMessage = {
            content: { invoice: 'lnbc200n1ptest' },
        } as never;
        const mockState = {} as never;

        const result = await action?.handler?.(
            mockRuntime,
            mockMessage,
            mockState,
            {},
            callback
        );

        expect(result).toBe(false);
        expect(callback).toHaveBeenCalledWith(
            expect.objectContaining({
                text: expect.stringContaining('Payment failed'),
            })
        );
    });

    it('should reject if no invoice found', async () => {
        configureL402Plugin({
            paymentHandler: mockPaymentHandler,
        });

        const action = elizaL402Plugin.actions?.find(
            (a) => a.name === 'PAY_L402_INVOICE'
        );

        const callback = vi.fn();
        const mockRuntime = {} as never;
        const mockMessage = {
            content: { text: 'Pay something' },
        } as never;
        const mockState = {} as never;

        const result = await action?.handler?.(
            mockRuntime,
            mockMessage,
            mockState,
            {},
            callback
        );

        expect(result).toBe(false);
        expect(mockPaymentHandler).not.toHaveBeenCalled();
    });
});

describe('requestWithL402 action', () => {
    const mockPaymentHandler = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        // Mock global fetch
        globalThis.fetch = vi.fn() as typeof fetch;
    });

    it('should validate correctly when configured', async () => {
        configureL402Plugin({
            paymentHandler: mockPaymentHandler,
        });

        const action = elizaL402Plugin.actions?.find(
            (a) => a.name === 'REQUEST_WITH_L402'
        );

        const isValid = await action?.validate?.({} as never);
        expect(isValid).toBe(true);
    });

    it('should reject if no URL provided', async () => {
        configureL402Plugin({
            paymentHandler: mockPaymentHandler,
        });

        const action = elizaL402Plugin.actions?.find(
            (a) => a.name === 'REQUEST_WITH_L402'
        );

        const callback = vi.fn();
        const mockRuntime = {} as never;
        const mockMessage = {
            content: { text: 'fetch some data' },
        } as never;
        const mockState = {} as never;

        const result = await action?.handler?.(
            mockRuntime,
            mockMessage,
            mockState,
            {},
            callback
        );

        expect(result).toBe(false);
        expect(callback).toHaveBeenCalledWith(
            expect.objectContaining({
                text: expect.stringContaining('No valid URL'),
            })
        );
    });
});
