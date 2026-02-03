/**
 * Invoice Service Tests
 * 
 * @trace Task-20, Vol.2 S-P0-05
 * @constraint D-GW-03: Invoice 可解析
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    InvoiceService,
    getInvoiceService,
    resetInvoiceService,
} from '../../src/services/invoice';

describe('InvoiceService', () => {
    let service: InvoiceService;

    beforeEach(() => {
        resetInvoiceService();
        service = new InvoiceService();
    });

    afterEach(() => {
        resetInvoiceService();
    });

    describe('create', () => {
        it('should create invoice with valid fields', async () => {
            const result = await service.create({
                amountMsats: 1000,
                memo: 'Test payment',
            });

            expect(result.paymentRequest).toBeTruthy();
            expect(result.paymentRequest).toMatch(/^lnbc/);
            expect(result.paymentHash).toHaveLength(64);
            expect(result.amountMsats).toBe(1000);
            expect(result.expiresAt).toBeGreaterThan(Date.now() / 1000);
        });

        it('should generate unique payment hashes', async () => {
            const invoice1 = await service.create({ amountMsats: 1000, memo: 'Test 1' });
            const invoice2 = await service.create({ amountMsats: 1000, memo: 'Test 2' });

            expect(invoice1.paymentHash).not.toBe(invoice2.paymentHash);
        });

        it('should respect custom expiry', async () => {
            const expirySeconds = 60;
            const now = Math.floor(Date.now() / 1000);

            const result = await service.create({
                amountMsats: 1000,
                memo: 'Short expiry',
                expirySeconds,
            });

            expect(result.expiresAt).toBeGreaterThanOrEqual(now + expirySeconds - 1);
            expect(result.expiresAt).toBeLessThanOrEqual(now + expirySeconds + 2);
        });
    });

    describe('verifyPreimage', () => {
        it('should verify valid preimage', async () => {
            // Create invoice to get a valid preimage/hash pair
            const invoice = await service.create({ amountMsats: 1000, memo: 'Test' });

            // Simulate payment to get preimage
            const preimage = await service.simulatePayment(invoice.paymentHash);
            expect(preimage).toBeTruthy();

            // Verify
            const isValid = service.verifyPreimage(preimage!, invoice.paymentHash);
            expect(isValid).toBe(true);
        });

        it('should reject invalid preimage', () => {
            const preimage = '0'.repeat(64);
            const wrongHash = '1'.repeat(64);

            const isValid = service.verifyPreimage(preimage, wrongHash);
            expect(isValid).toBe(false);
        });

        it('should reject malformed inputs', () => {
            expect(service.verifyPreimage('short', '0'.repeat(64))).toBe(false);
            expect(service.verifyPreimage('0'.repeat(64), 'short')).toBe(false);
        });
    });

    describe('getStatus', () => {
        it('should return null for unknown payment hash', async () => {
            const status = await service.getStatus('unknown_hash');
            expect(status).toBeNull();
        });

        it('should return unsettled status for new invoice', async () => {
            const invoice = await service.create({ amountMsats: 1000, memo: 'Test' });
            const status = await service.getStatus(invoice.paymentHash);

            expect(status).toBeTruthy();
            expect(status!.settled).toBe(false);
            expect(status!.preimage).toBeUndefined();
        });

        it('should return settled status after payment', async () => {
            const invoice = await service.create({ amountMsats: 1000, memo: 'Test' });
            await service.simulatePayment(invoice.paymentHash);

            const status = await service.getStatus(invoice.paymentHash);

            expect(status).toBeTruthy();
            expect(status!.settled).toBe(true);
            expect(status!.preimage).toHaveLength(64);
        });
    });

    describe('singleton', () => {
        it('should return same instance', () => {
            const instance1 = getInvoiceService();
            const instance2 = getInvoiceService();

            expect(instance1).toBe(instance2);
        });

        it('should reset properly', () => {
            const instance1 = getInvoiceService();
            resetInvoiceService();
            const instance2 = getInvoiceService();

            expect(instance1).not.toBe(instance2);
        });
    });
});
