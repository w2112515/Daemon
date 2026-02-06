/**
 * Root Key Manager Tests
 * 
 * @trace Task-P2-02, D-P2-02a~c
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RootKeyManager, getRootKeyManager, resetRootKeyManager } from './root_key_manager';

describe('RootKeyManager', () => {
    let manager: RootKeyManager;

    beforeEach(() => {
        vi.useFakeTimers();
        manager = new RootKeyManager({
            keyTtlMs: 1000,        // 1 second TTL
            gracePeriodMs: 500,    // 0.5 second grace
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        manager.destroy();
        resetRootKeyManager();
    });

    describe('getCurrentKey', () => {
        it('should return initial key', () => {
            const key = manager.getCurrentKey();
            expect(key).toHaveLength(64); // 32 bytes hex
        });

        it('should use provided initial key', () => {
            const testKey = 'a'.repeat(64);
            const customManager = new RootKeyManager({ initialKey: testKey });

            expect(customManager.getCurrentKey()).toBe(testKey);
            customManager.destroy();
        });
    });

    describe('rotateRootKey', () => {
        it('should generate new key on rotation', async () => {
            const oldKey = manager.getCurrentKey();
            await manager.rotateRootKey();
            const newKey = manager.getCurrentKey();

            expect(newKey).not.toBe(oldKey);
            expect(newKey).toHaveLength(64);
        });

        it('should track previous keys count', async () => {
            expect(manager.getStatus().previousKeysCount).toBe(0);

            await manager.rotateRootKey();
            expect(manager.getStatus().previousKeysCount).toBe(1);

            await manager.rotateRootKey();
            expect(manager.getStatus().previousKeysCount).toBe(2);
        });

        it('should return new key ID', async () => {
            const oldKeyId = manager.getCurrentKeyId();
            const newKeyId = await manager.rotateRootKey();

            expect(newKeyId).not.toBe(oldKeyId);
            expect(newKeyId).toHaveLength(8);
        });
    });

    describe('findValidKey', () => {
        it('should find current key by ID', () => {
            const keyId = manager.getCurrentKeyId();
            const foundKey = manager.findValidKey(Date.now(), keyId);

            expect(foundKey).toBe(manager.getCurrentKey());
        });

        it('should find old key by ID within TTL', async () => {
            const oldKeyId = manager.getCurrentKeyId();
            const oldKey = manager.getCurrentKey();

            await manager.rotateRootKey();

            // Old key should still be valid within grace period
            const foundKey = manager.findValidKey(Date.now(), oldKeyId);
            expect(foundKey).toBe(oldKey);
        });

        it('should return null for expired key', async () => {
            const oldKeyId = manager.getCurrentKeyId();

            await manager.rotateRootKey();

            // Advance time past TTL + grace period
            vi.advanceTimersByTime(2000);

            const foundKey = manager.findValidKey(Date.now(), oldKeyId);
            expect(foundKey).toBeNull();
        });

        it('should return null for unknown key ID', () => {
            const foundKey = manager.findValidKey(Date.now(), 'unknown');
            expect(foundKey).toBeNull();
        });
    });

    describe('getAllValidKeys', () => {
        it('should return all valid keys', async () => {
            await manager.rotateRootKey();
            await manager.rotateRootKey();

            const keys = manager.getAllValidKeys();
            expect(keys).toHaveLength(3); // current + 2 previous
        });

        it('should exclude expired keys', async () => {
            await manager.rotateRootKey();
            vi.advanceTimersByTime(2000);
            await manager.rotateRootKey();

            const keys = manager.getAllValidKeys();
            expect(keys).toHaveLength(2); // current + 1 valid previous
        });
    });

    describe('getStatus', () => {
        it('should return correct status', async () => {
            vi.advanceTimersByTime(100);

            const status = manager.getStatus();

            expect(status.currentKeyId).toHaveLength(8);
            expect(status.currentKeyAge).toBeGreaterThanOrEqual(100);
            expect(status.previousKeysCount).toBe(0);
            expect(status.nextExpiry).toBeNull();
        });

        it('should track next expiry after rotation', async () => {
            await manager.rotateRootKey();

            const status = manager.getStatus();
            expect(status.nextExpiry).not.toBeNull();
        });
    });
});

describe('getRootKeyManager', () => {
    afterEach(() => {
        resetRootKeyManager();
    });

    it('should return singleton instance', () => {
        const instance1 = getRootKeyManager();
        const instance2 = getRootKeyManager();

        expect(instance1).toBe(instance2);
    });

    it('should read config from env', () => {
        process.env.L402_SECRET_KEY = 'b'.repeat(64);
        resetRootKeyManager();

        const manager = getRootKeyManager();
        expect(manager.getCurrentKey()).toBe('b'.repeat(64));

        delete process.env.L402_SECRET_KEY;
    });
});
