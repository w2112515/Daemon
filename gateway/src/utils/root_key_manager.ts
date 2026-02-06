/**
 * Root Key Manager for Distributed Macaroon Authentication
 * 
 * @trace Task-P2-02, Vol.2 §302, D-P2-02a~c
 * @description 管理 Macaroon Root Key 的轮换和验证
 * @constraint D-P2-02a: 支持 rotateRootKey
 * @constraint D-P2-02b: 旧 token 在 TTL 内仍可验证
 */

import crypto from 'crypto';

export interface RootKeyEntry {
    /** Root Key (hex) */
    key: string;
    /** 创建时间戳 (ms) */
    createdAt: number;
    /** 过期时间戳 (ms)，Infinity = 永不过期 */
    expiresAt: number;
    /** Key ID (用于快速查找) */
    keyId: string;
}

export interface RootKeyManagerConfig {
    /** 初始 Root Key (hex) */
    initialKey?: string;
    /** Key TTL (毫秒)，默认 24 小时 */
    keyTtlMs?: number;
    /** 旧 Key 宽限期 (毫秒)，默认 1 小时 */
    gracePeriodMs?: number;
}

/**
 * 分布式 Root Key 管理器
 * 
 * @description 支持密钥轮换，旧密钥在 TTL 内仍可验证旧 token
 */
export class RootKeyManager {
    private currentKey: RootKeyEntry;
    private previousKeys: RootKeyEntry[] = [];
    private readonly keyTtlMs: number;
    private readonly gracePeriodMs: number;
    private cleanupTimer: NodeJS.Timeout | null = null;

    constructor(config: RootKeyManagerConfig = {}) {
        const {
            initialKey,
            keyTtlMs = 24 * 60 * 60 * 1000,  // 24 hours
            gracePeriodMs = 60 * 60 * 1000,   // 1 hour
        } = config;

        this.keyTtlMs = keyTtlMs;
        this.gracePeriodMs = gracePeriodMs;

        // 初始化 current key
        const key = initialKey ?? crypto.randomBytes(32).toString('hex');
        this.currentKey = {
            key,
            createdAt: Date.now(),
            expiresAt: Infinity,  // 当前 key 永不过期
            keyId: this.generateKeyId(key),
        };

        if (!initialKey) {
            console.warn('[RootKeyManager] Auto-generated initial key (dev mode)');
        }

        // 定期清理过期 key
        this.startCleanupTimer();
    }

    /**
     * 生成 Key ID (用于 Macaroon 内嵌标识)
     */
    private generateKeyId(key: string): string {
        return crypto.createHash('sha256')
            .update(key)
            .digest('hex')
            .substring(0, 8);
    }

    /**
     * 启动清理定时器
     */
    private startCleanupTimer(): void {
        // 每分钟清理一次过期 key
        this.cleanupTimer = setInterval(() => {
            this.cleanupExpiredKeys();
        }, 60 * 1000);

        // 防止定时器阻止进程退出
        if (this.cleanupTimer.unref) {
            this.cleanupTimer.unref();
        }
    }

    /**
     * 清理过期的 key
     */
    private cleanupExpiredKeys(): void {
        const now = Date.now();
        const before = this.previousKeys.length;

        this.previousKeys = this.previousKeys.filter(
            entry => entry.expiresAt > now
        );

        const removed = before - this.previousKeys.length;
        if (removed > 0) {
            console.log(`[RootKeyManager] Cleaned up ${removed} expired keys`);
        }
    }

    /**
     * 轮换 Root Key
     * 
     * @returns 新 key 的 ID
     */
    async rotateRootKey(): Promise<string> {
        const now = Date.now();

        // 将当前 key 移入 previousKeys，设置过期时间
        const expiringKey: RootKeyEntry = {
            ...this.currentKey,
            expiresAt: now + this.keyTtlMs + this.gracePeriodMs,
        };
        this.previousKeys.push(expiringKey);

        // 生成新 key
        const newKey = crypto.randomBytes(32).toString('hex');
        this.currentKey = {
            key: newKey,
            createdAt: now,
            expiresAt: Infinity,
            keyId: this.generateKeyId(newKey),
        };

        console.log(`[RootKeyManager] Key rotated: ${expiringKey.keyId} -> ${this.currentKey.keyId}`);
        console.log(`[RootKeyManager] Old key expires at: ${new Date(expiringKey.expiresAt).toISOString()}`);

        return this.currentKey.keyId;
    }

    /**
     * 获取当前铸造用 Key
     */
    getCurrentKey(): string {
        return this.currentKey.key;
    }

    /**
     * 获取当前 Key ID
     */
    getCurrentKeyId(): string {
        return this.currentKey.keyId;
    }

    /**
     * 根据 token 创建时间查找有效 Key
     * 
     * @param tokenCreatedAt - Token 创建时间戳 (ms)
     * @param keyId - 可选，指定 Key ID 精确查找
     * @returns 匹配的 key 或 null
     */
    findValidKey(tokenCreatedAt: number, keyId?: string): string | null {
        const now = Date.now();

        // 如果有 keyId，优先精确匹配
        if (keyId) {
            // 检查当前 key
            if (this.currentKey.keyId === keyId) {
                return this.currentKey.key;
            }

            // 检查历史 key
            for (const entry of this.previousKeys) {
                if (entry.keyId === keyId && entry.expiresAt > now) {
                    return entry.key;
                }
            }

            return null;
        }

        // 无 keyId，按时间范围匹配
        // 首先检查当前 key
        if (tokenCreatedAt >= this.currentKey.createdAt) {
            return this.currentKey.key;
        }

        // 然后检查历史 key
        for (const entry of this.previousKeys) {
            if (entry.expiresAt > now &&
                tokenCreatedAt >= entry.createdAt &&
                tokenCreatedAt < this.currentKey.createdAt) {
                return entry.key;
            }
        }

        return null;
    }

    /**
     * 获取所有有效 key 用于验证尝试
     * 
     * @returns 按优先级排序的 key 列表 (当前在前)
     */
    getAllValidKeys(): string[] {
        const now = Date.now();
        const keys = [this.currentKey.key];

        for (const entry of this.previousKeys) {
            if (entry.expiresAt > now) {
                keys.push(entry.key);
            }
        }

        return keys;
    }

    /**
     * 获取管理器状态 (用于调试/监控)
     */
    getStatus(): {
        currentKeyId: string;
        currentKeyAge: number;
        previousKeysCount: number;
        nextExpiry: number | null;
    } {
        const now = Date.now();

        const validPrevious = this.previousKeys.filter(k => k.expiresAt > now);
        const nextExpiry = validPrevious.length > 0
            ? Math.min(...validPrevious.map(k => k.expiresAt))
            : null;

        return {
            currentKeyId: this.currentKey.keyId,
            currentKeyAge: now - this.currentKey.createdAt,
            previousKeysCount: validPrevious.length,
            nextExpiry,
        };
    }

    /**
     * 销毁管理器 (清理定时器)
     */
    destroy(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }
}

/** 默认单例实例 */
let defaultInstance: RootKeyManager | null = null;

/**
 * 获取 Root Key Manager 单例
 */
export function getRootKeyManager(): RootKeyManager {
    if (!defaultInstance) {
        const initialKey = process.env.L402_SECRET_KEY;
        const keyTtlMs = parseInt(process.env.ROOT_KEY_TTL_MS || String(24 * 60 * 60 * 1000), 10);
        const gracePeriodMs = parseInt(process.env.ROOT_KEY_GRACE_MS || String(60 * 60 * 1000), 10);

        defaultInstance = new RootKeyManager({
            initialKey,
            keyTtlMs,
            gracePeriodMs,
        });
    }
    return defaultInstance;
}

/**
 * 重置单例 (用于测试)
 */
export function resetRootKeyManager(): void {
    if (defaultInstance) {
        defaultInstance.destroy();
        defaultInstance = null;
    }
}

export default RootKeyManager;
