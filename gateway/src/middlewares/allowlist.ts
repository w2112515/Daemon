/**
 * Allowlist Middleware (白名单访问控制)
 * 
 * @trace Task-H-03, S-H-03, D-H-03
 * @constraint D-H-03b: 白名单外返回 403
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import fs from 'fs';
import path from 'path';

/** 白名单条目 */
export interface AllowlistEntry {
    /** Agent 标识 (来自 Macaroon caveat 或 API Key) */
    agentId: string;
    /** 允许的服务路径 (支持通配符 *) */
    allowedServices: string[];
    /** 单次最大金额 (sats) */
    maxAmountPerCall: number;
    /** 过期时间 (可选) */
    expiresAt?: string;
    /** 是否启用 */
    enabled: boolean;
}

/** 白名单配置 */
export interface AllowlistConfig {
    /** 是否启用白名单 */
    enabled: boolean;
    /** 默认拒绝策略 */
    defaultDeny: boolean;
    /** 白名单条目 */
    entries: AllowlistEntry[];
}

let cachedConfig: AllowlistConfig | null = null;
let configMtime: number = 0;

/**
 * 加载白名单配置
 */
function loadAllowlistConfig(): AllowlistConfig {
    const configPath = path.join(process.cwd(), 'config', 'allowlist.json');

    try {
        const stats = fs.statSync(configPath);

        // 使用缓存，除非文件已修改
        if (cachedConfig && stats.mtimeMs === configMtime) {
            return cachedConfig;
        }

        const content = fs.readFileSync(configPath, 'utf-8');
        cachedConfig = JSON.parse(content) as AllowlistConfig;
        configMtime = stats.mtimeMs;

        console.log(`[Allowlist] Loaded ${cachedConfig.entries.length} entries`);
        return cachedConfig;
    } catch (error) {
        // 配置文件不存在时返回默认 (允许所有)
        console.warn('[Allowlist] Config not found, using default (allow all)');
        return {
            enabled: false,
            defaultDeny: false,
            entries: [],
        };
    }
}

/**
 * 检查路径是否匹配模式
 * 
 * @param path - 请求路径
 * @param pattern - 模式 (支持 * 通配符)
 */
function matchPath(requestPath: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        return requestPath.startsWith(prefix);
    }
    return requestPath === pattern;
}

/**
 * 检查 Agent 是否在白名单中
 * 
 * @param agentId - Agent 标识
 * @param requestPath - 请求路径
 * @param config - 白名单配置
 */
function checkAllowlist(
    agentId: string | undefined,
    requestPath: string,
    config: AllowlistConfig,
): { allowed: boolean; entry?: AllowlistEntry; reason?: string } {
    // 白名单未启用
    if (!config.enabled) {
        return { allowed: true, reason: 'allowlist_disabled' };
    }

    // 未提供 Agent ID
    if (!agentId) {
        return config.defaultDeny
            ? { allowed: false, reason: 'missing_agent_id' }
            : { allowed: true, reason: 'default_allow' };
    }

    // 查找匹配的条目
    for (const entry of config.entries) {
        if (!entry.enabled) continue;
        if (entry.agentId !== agentId && entry.agentId !== '*') continue;

        // 检查过期
        if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
            continue;
        }

        // 检查路径
        for (const pattern of entry.allowedServices) {
            if (matchPath(requestPath, pattern)) {
                return { allowed: true, entry };
            }
        }
    }

    // 未找到匹配条目
    return config.defaultDeny
        ? { allowed: false, reason: 'not_in_allowlist' }
        : { allowed: true, reason: 'default_allow' };
}

/** 中间件选项 */
export interface AllowlistMiddlewareOptions {
    /** 跳过的路径 */
    skipPaths?: string[];
    /** 从请求中提取 Agent ID 的函数 */
    extractAgentId?: (req: Request) => string | undefined;
}

/**
 * 白名单访问控制中间件
 * 
 * @param options - 中间件选项
 * @returns Express Middleware
 */
export function allowlistMiddleware(options: AllowlistMiddlewareOptions = {}): RequestHandler {
    const { skipPaths = [], extractAgentId } = options;

    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            // 检查跳过路径
            if (skipPaths.some((p) => req.path.startsWith(p))) {
                next();
                return;
            }

            const config = loadAllowlistConfig();

            // 提取 Agent ID (优先从 L402 上下文)
            let agentId: string | undefined;

            if (req.l402?.caveats) {
                // 从 Macaroon caveats 提取 (MacaroonCaveat 是 {type, value} 结构)
                const agentCaveat = req.l402.caveats.find(c =>
                    c.type === 'resource' && c.value.startsWith('agent_id=')
                );
                if (agentCaveat) {
                    agentId = agentCaveat.value.split('=')[1];
                }
            }


            // 备选: 从 Header 或自定义提取器
            if (!agentId && extractAgentId) {
                agentId = extractAgentId(req);
            }
            if (!agentId) {
                agentId = req.headers['x-agent-id'] as string | undefined;
            }

            // 执行检查
            const result = checkAllowlist(agentId, req.path, config);

            if (!result.allowed) {
                console.warn(`[Allowlist] Denied: agent=${agentId}, path=${req.path}, reason=${result.reason}`);
                res.status(403).json({
                    error: 'Forbidden',
                    code: 'NOT_IN_ALLOWLIST',
                    reason: result.reason,
                });
                return;
            }

            // 附加 allowlist 信息到请求 (用于后续检查)
            (req as any).allowlistEntry = result.entry;

            next();
        } catch (error) {
            console.error('[Allowlist] Middleware error:', error);
            // 错误时放行 (fail-open)
            next();
        }
    };
}

export default allowlistMiddleware;
