/**
 * Macaroon Service Unit Tests
 * 
 * @trace Task-08 Spec: Verification
 * @tests mint(), verify(), addCaveat()
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { MacaroonService } from './macaroon';
import { MacaroonCaveat } from '../types/macaroon';

describe('MacaroonService', () => {
    let service: MacaroonService;
    let testRootKey: string;
    let testPaymentHash: string;
    let testPreimage: string;

    beforeEach(() => {
        // Generate known root key for testing
        testRootKey = crypto.randomBytes(32).toString('hex');
        service = new MacaroonService(testRootKey, 'test.daemon.io');

        // Generate known preimage/payment_hash pair
        testPreimage = crypto.randomBytes(32).toString('hex');
        testPaymentHash = crypto
            .createHash('sha256')
            .update(Buffer.from(testPreimage, 'hex'))
            .digest('hex');
    });

    describe('mint()', () => {
        it('should return a base64 encoded string', () => {
            const macaroon = service.mint({ paymentHash: testPaymentHash });

            expect(macaroon).toBeTruthy();
            expect(typeof macaroon).toBe('string');
            // Verify it's base64
            expect(() => Buffer.from(macaroon, 'base64')).not.toThrow();
        });

        it('should include expiry caveat by default', () => {
            const macaroon = service.mint({ paymentHash: testPaymentHash });

            const decoded = JSON.parse(Buffer.from(macaroon, 'base64').toString());
            const expiryCaveat = decoded.caveats.find((c: string) =>
                c.startsWith('expiry = ')
            );

            expect(expiryCaveat).toBeTruthy();
        });

        it('should include service caveat when provided', () => {
            const macaroon = service.mint({
                paymentHash: testPaymentHash,
                service: 'api.test.com',
            });

            const decoded = JSON.parse(Buffer.from(macaroon, 'base64').toString());
            const serviceCaveat = decoded.caveats.find((c: string) =>
                c === 'service = api.test.com'
            );

            expect(serviceCaveat).toBeTruthy();
        });

        it('should include custom caveats', () => {
            const customCaveats: MacaroonCaveat[] = [
                { type: 'budget', value: '1000' },
                { type: 'resource', value: '/api/v1/*' },
            ];

            const macaroon = service.mint({
                paymentHash: testPaymentHash,
                caveats: customCaveats,
            });

            const decoded = JSON.parse(Buffer.from(macaroon, 'base64').toString());
            expect(decoded.caveats).toContain('budget = 1000');
            expect(decoded.caveats).toContain('resource = /api/v1/*');
        });

        it('should reject invalid payment hash length', () => {
            expect(() =>
                service.mint({ paymentHash: 'tooshort' })
            ).toThrow('Invalid payment hash');
        });
    });

    describe('verify()', () => {
        it('should return valid: true for correct preimage', () => {
            const macaroon = service.mint({ paymentHash: testPaymentHash });
            const result = service.verify(macaroon, testPreimage);

            expect(result.valid).toBe(true);
            expect(result.paymentHash).toBe(testPaymentHash);
            expect(result.error).toBeUndefined();
        });

        it('should return valid: false for incorrect preimage', () => {
            const macaroon = service.mint({ paymentHash: testPaymentHash });
            const wrongPreimage = crypto.randomBytes(32).toString('hex');
            const result = service.verify(macaroon, wrongPreimage);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('Preimage does not match');
        });

        it('should return valid: false for tampered signature', () => {
            const macaroon = service.mint({ paymentHash: testPaymentHash });

            // Tamper with macaroon
            const decoded = JSON.parse(Buffer.from(macaroon, 'base64').toString());
            decoded.signature = crypto.randomBytes(32).toString('hex');
            const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64');

            const result = service.verify(tampered, testPreimage);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('Signature verification failed');
        });

        it('should return valid: false for expired macaroon', () => {
            // Mint with 0 second expiry (immediately expired)
            const macaroon = service.mint({
                paymentHash: testPaymentHash,
                expirySeconds: -1, // Already expired
            });

            const result = service.verify(macaroon, testPreimage);

            expect(result.valid).toBe(false);
            expect(result.error).toContain('expired');
        });

        it('should return caveats in result', () => {
            const macaroon = service.mint({
                paymentHash: testPaymentHash,
                service: 'test.api',
                caveats: [{ type: 'budget', value: '500' }],
            });

            const result = service.verify(macaroon, testPreimage);

            expect(result.valid).toBe(true);
            expect(result.caveats.length).toBeGreaterThanOrEqual(2); // expiry + service + budget
        });
    });

    describe('addCaveat()', () => {
        it('should add caveat and still verify', () => {
            const macaroon = service.mint({ paymentHash: testPaymentHash });
            const newCaveat: MacaroonCaveat = { type: 'budget', value: '100' };

            const updated = service.addCaveat(macaroon, newCaveat);
            const result = service.verify(updated, testPreimage);

            expect(result.valid).toBe(true);
            expect(result.caveats).toContainEqual(newCaveat);
        });

        it('should chain multiple caveats', () => {
            let macaroon = service.mint({ paymentHash: testPaymentHash });
            macaroon = service.addCaveat(macaroon, { type: 'budget', value: '100' });
            macaroon = service.addCaveat(macaroon, { type: 'resource', value: '/api' });

            const result = service.verify(macaroon, testPreimage);

            expect(result.valid).toBe(true);
            expect(result.caveats.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('extractPaymentHash()', () => {
        it('should extract payment hash from macaroon', () => {
            const macaroon = service.mint({ paymentHash: testPaymentHash });
            const extracted = service.extractPaymentHash(macaroon);

            expect(extracted).toBe(testPaymentHash);
        });
    });
});
