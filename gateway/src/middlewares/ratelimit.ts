/**
 * Rate Limit Middleware (Distributed Lua Scripting)
 * 
 * @trace Task-P2-01, Vol.2 §301, D-P2-01a~c
 * @constraint D-P2-01b: 超限返回 HTTP 429
 * @constraint Vol.2 §304: 配置可通过环境变量调整
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { getRedis } from '../utils/redis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/** 默认限流配置 */
const DEFAULT_WINDOW_MS = 60 * 1000;     // 1 分钟
const DEFAULT_MAX_REQUESTS = 100;         // 每窗口最大请求数
const KEY_PREFIX = 'ratelimit:';

/** Lua 脚本缓存 */
let luaScript: string | null = null;
let luaScriptSha: string | null = null;

/**
 * 加载 Lua 脚本
 */
function loadLuaScript(): string {
    if (luaScript) {
        return luaScript;
    }

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const scriptPath = path.join(__dirname, 'ratelimit.lua');

    try {
        luaScript = fs.readFileSync(scriptPath, 'utf8');
        return luaScript;
    } catch (error) {
        console.error('[RateLimit] Failed to load Lua script:', error);
        throw new Error('Rate limit Lua script not found');
    }
}

/**
 * 提取客户端标识
 * 
 * @priority 1. Macaroon token hash
 * @priority 2. X-Forwarded-For header
 * @priority 3. IP address
 */
function extractClientId(req: Request): string {
    // 从 L402 上下文获取 Macaroon 标识
    const l402Context = req.l402;
    if (l402Context?.paymentHash) {
        return `macaroon:${l402Context.paymentHash.substring(0, 16)}`;
    }

    // 从 X-Forwarded-For 获取真实 IP
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
        const clientIp = Array.isArray(forwardedFor)
            ? forwardedFor[0]
            : forwardedFor.split(',')[0].trim();
        return `ip:${clientIp}`;
    }

    // 回退到连接 IP
    return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
}

export interface RateLimitConfig {
    /** 时间窗口大小 (毫秒) */
    windowMs?: number;
    /** 窗口内最大请求数 */
    maxRequests?: number;
    /** 跳过限流的路径 */
    skipPaths?: string[];
    /** 自定义客户端标识提取函数 */
    keyGenerator?: (req: Request) => string;
}

export interface RateLimitResult {
    allowed: boolean;
    currentCount: number;
    retryAfterMs: number;
}

/**
 * 执行限流检查
 * 
 * @param clientId - 客户端标识
 * @param windowMs - 窗口大小 (毫秒)
 * @param maxRequests - 最大请求数
 */
export async function checkRateLimit(
    clientId: string,
    windowMs: number,
    maxRequests: number
): Promise<RateLimitResult> {
    const redis = await getRedis();
    const key = `${KEY_PREFIX}${clientId}`;
    const now = Date.now();
    const script = loadLuaScript();

    try {
        // 尝试使用缓存的 SHA
        let result: [number, number, number];

        if (luaScriptSha) {
            try {
                result = await redis.evalSha(luaScriptSha, {
                    keys: [key],
                    arguments: [String(windowMs), String(maxRequests), String(now)]
                }) as [number, number, number];
            } catch (error: unknown) {
                // SHA 不存在，重新加载脚本
                if (error instanceof Error && error.message.includes('NOSCRIPT')) {
                    luaScriptSha = null;
                } else {
                    throw error;
                }
            }
        }

        // 首次执行或 SHA 失效
        if (!luaScriptSha) {
            result = await redis.eval(script, {
                keys: [key],
                arguments: [String(windowMs), String(maxRequests), String(now)]
            }) as [number, number, number];

            // 缓存脚本 SHA
            luaScriptSha = await redis.scriptLoad(script);
        }

        const [status, count, retryAfterMs] = result!;

        return {
            allowed: status === 1,
            currentCount: count,
            retryAfterMs,
        };
    } catch (error) {
        console.error('[RateLimit] Redis error:', error);
        // Fail-open: Redis 错误时放行
        return { allowed: true, currentCount: 0, retryAfterMs: 0 };
    }
}

/**
 * Rate Limit 中间件
 * 
 * @description 基于滑动窗口的分布式限流中间件
 * @returns Express Middleware
 */
export function rateLimitMiddleware(config: RateLimitConfig = {}): RequestHandler {
    const windowMs = config.windowMs ?? parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(DEFAULT_WINDOW_MS), 10);
    const maxRequests = config.maxRequests ?? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || String(DEFAULT_MAX_REQUESTS), 10);
    const skipPaths = config.skipPaths ?? ['/health', '/api'];
    const keyGenerator = config.keyGenerator ?? extractClientId;

    console.log(`[RateLimit] Initialized: ${maxRequests} requests per ${windowMs}ms window`);

    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        // 跳过指定路径
        if (skipPaths.some(p => req.path.startsWith(p))) {
            next();
            return;
        }

        try {
            const clientId = keyGenerator(req);
            const result = await checkRateLimit(clientId, windowMs, maxRequests);

            // 设置标准限流响应头
            res.setHeader('X-RateLimit-Limit', maxRequests);
            res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - result.currentCount));
            res.setHeader('X-RateLimit-Reset', Math.ceil((Date.now() + windowMs) / 1000));

            if (!result.allowed) {
                const retryAfterSeconds = Math.ceil(result.retryAfterMs / 1000);
                res.setHeader('Retry-After', retryAfterSeconds);

                console.warn(`[RateLimit] Client ${clientId} exceeded limit: ${result.currentCount}/${maxRequests}`);

                res.status(429).json({
                    error: 'Too Many Requests',
                    code: 'RATE_LIMIT_EXCEEDED',
                    retryAfterSeconds,
                    limit: maxRequests,
                    window: `${windowMs / 1000}s`,
                });
                return;
            }

            next();
        } catch (error) {
            console.error('[RateLimit] Middleware error:', error);
            // Fail-open: 错误时放行
            next();
        }
    };
}

export default rateLimitMiddleware;
