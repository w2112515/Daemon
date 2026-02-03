/**
 * Replay Protection Middleware (used_preimages)
 * 
 * @trace Task-H-01, S-H-01, D-H-01
 * @constraint D-GW-05: 重复 preimage 拒绝
 * @constraint D-H-01b: 重复 preimage 返回 401
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { getRedis } from '../utils/redis';

/** Preimage 存储 TTL (7 天) */
const PREIMAGE_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Redis 键前缀 */
const PREIMAGE_KEY_PREFIX = 'preimage:';

/**
 * 检查 preimage 是否已使用
 * 
 * @param preimageHash - preimage 的 SHA256 哈希
 * @returns true if already used (should reject)
 */
export async function isPreimageUsed(preimageHash: string): Promise<boolean> {
    const redis = await getRedis();
    const key = `${PREIMAGE_KEY_PREFIX}${preimageHash}`;
    const exists = await redis.exists(key);
    return exists === 1;
}

/**
 * 标记 preimage 为已使用
 * 
 * @param preimageHash - preimage 的 SHA256 哈希
 */
export async function markPreimageUsed(preimageHash: string): Promise<void> {
    const redis = await getRedis();
    const key = `${PREIMAGE_KEY_PREFIX}${preimageHash}`;
    await redis.set(key, '1', { EX: PREIMAGE_TTL_SECONDS });
}

/**
 * 检查并标记 preimage (原子操作)
 * 
 * @param preimageHash - preimage 的 SHA256 哈希
 * @returns true if replay detected (已使用), false if first use
 */
export async function checkAndMarkPreimage(preimageHash: string): Promise<boolean> {
    const redis = await getRedis();
    const key = `${PREIMAGE_KEY_PREFIX}${preimageHash}`;

    // SETNX + EXPIRE 原子操作: 如果 key 不存在则设置，返回 true
    // 如果 key 已存在则返回 false
    const result = await redis.set(key, '1', { EX: PREIMAGE_TTL_SECONDS, NX: true });

    // result === 'OK' means key was set (first use)
    // result === null means key already exists (replay)
    return result !== 'OK';
}

/**
 * Replay Protection 中间件
 * 
 * 检测重复使用的 preimage，防止重放攻击
 * 
 * @returns Express Middleware
 */
export function replayProtectionMiddleware(): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            // 获取已验证的 L402 上下文
            const l402Context = req.l402;

            if (!l402Context?.verified || !l402Context.paymentHash) {
                // 无 L402 上下文时跳过 (由 L402 中间件处理)
                next();
                return;
            }

            const paymentHash = l402Context.paymentHash;

            // 检查是否为重放攻击
            const isReplay = await checkAndMarkPreimage(paymentHash);

            if (isReplay) {
                console.warn(`[Replay] Detected replay attempt: ${paymentHash.substring(0, 16)}...`);
                res.status(401).json({
                    error: 'Preimage already used',
                    code: 'REPLAY_DETECTED',
                });
                return;
            }

            // 首次使用，放行
            next();
        } catch (error) {
            console.error('[Replay] Middleware error:', error);
            // Redis 错误时放行 (fail-open 策略，确保可用性)
            // 生产环境可改为 fail-close
            next();
        }
    };
}

export default replayProtectionMiddleware;
