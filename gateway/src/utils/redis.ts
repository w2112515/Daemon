/**
 * Redis 工具模块
 * 
 * @trace Task-H-01, Vol.0.5-2
 */

import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;

/**
 * 获取 Redis 客户端单例
 */
export async function getRedis(): Promise<RedisClientType> {
    if (redisClient && redisClient.isOpen) {
        return redisClient;
    }

    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';

    redisClient = createClient({ url }) as RedisClientType;

    redisClient.on('error', (err: Error) => {
        console.error('[Redis] Connection error:', err);
    });

    redisClient.on('connect', () => {
        console.log('[Redis] Connected');
    });

    await redisClient.connect();
    return redisClient;
}

/**
 * 关闭 Redis 连接
 */
export async function closeRedis(): Promise<void> {
    if (redisClient && redisClient.isOpen) {
        await redisClient.quit();
        redisClient = null;
    }
}
