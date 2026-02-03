/**
 * Telemetry API - 遥测数据收集端点
 * 
 * @trace Vol.2 S-UI-08, Task-23
 * @constraint D-SEC-04: 遥测签名验证
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';

/** 遥测数据结构 */
interface TelemetryEvent {
    /** 事件类型 */
    event_type: string;
    /** 事件时间戳 (ISO8601) */
    timestamp: string;
    /** Agent ID (匿名标识) */
    agent_id?: string;
    /** 事件数据 */
    data: Record<string, unknown>;
    /** 签名 (HMAC-SHA256) */
    signature?: string;
}

/** 遥测批量请求 */
interface TelemetryBatchRequest {
    events: TelemetryEvent[];
}

/** 遥测响应 */
interface TelemetryResponse {
    received: number;
    accepted: number;
    rejected: number;
    errors?: string[];
}

/** 已知事件类型 */
const KNOWN_EVENT_TYPES = [
    'payment.initiated',
    'payment.completed',
    'payment.failed',
    'session.start',
    'session.end',
    'error.reported',
    'health.ping',
] as const;

/**
 * 验证遥测签名
 * 
 * 使用 HMAC-SHA256 验证事件签名
 * 签名格式: HMAC(secret, `${event_type}:${timestamp}:${agent_id}`)
 * 
 * @param event - 遥测事件
 * @param secret - 签名密钥
 * @param strictMode - 严格模式 (D-H-08: 无签名时拒绝)
 * @returns true if signature is valid
 */
function verifySignature(event: TelemetryEvent, secret: string, strictMode = true): boolean {
    if (!event.signature) {
        // D-H-08: 严格模式下无签名必须拒绝
        if (strictMode) {
            console.warn('[Telemetry] Rejected: missing signature (strict mode)');
            return false;
        }
        // 宽松模式 (仅用于开发)
        return true;
    }

    const payload = `${event.event_type}:${event.timestamp}:${event.agent_id ?? 'anonymous'}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    try {
        return crypto.timingSafeEqual(
            Buffer.from(event.signature, 'hex'),
            Buffer.from(expected, 'hex'),
        );
    } catch {
        // 签名长度不匹配时 timingSafeEqual 会抛出异常
        return false;
    }
}


/**
 * 验证遥测事件
 * 
 * @param event - 遥测事件
 * @returns 错误消息数组 (空数组表示有效)
 */
function validateEvent(event: TelemetryEvent): string[] {
    const errors: string[] = [];

    // 必填字段
    if (!event.event_type) {
        errors.push('Missing event_type');
    }
    if (!event.timestamp) {
        errors.push('Missing timestamp');
    }
    if (!event.data) {
        errors.push('Missing data');
    }

    // 类型验证 (警告模式，不阻止接收)
    if (event.event_type && !KNOWN_EVENT_TYPES.includes(event.event_type as any)) {
        console.warn(`[Telemetry] Unknown event type: ${event.event_type}`);
    }

    // 时间戳格式验证
    if (event.timestamp) {
        const parsed = Date.parse(event.timestamp);
        if (isNaN(parsed)) {
            errors.push('Invalid timestamp format (expected ISO8601)');
        }
    }

    return errors;
}

/**
 * 创建遥测路由
 */
export function createTelemetryRouter(): Router {
    const router = Router();
    const SECRET = process.env.TELEMETRY_SECRET ?? 'dev-secret-change-in-production';

    // 内存存储 (Phase 0，生产环境应使用持久化存储)
    const eventStore: TelemetryEvent[] = [];
    const MAX_STORE_SIZE = 10000;

    /**
     * POST /api/telemetry
     * 
     * 接收单个遥测事件
     */
    router.post('/', (req: Request, res: Response): void => {
        const event = req.body as TelemetryEvent;

        // 验证事件
        const errors = validateEvent(event);
        if (errors.length > 0) {
            res.status(400).json({ error: 'Validation failed', details: errors });
            return;
        }

        // 验证签名 (D-SEC-04)
        if (!verifySignature(event, SECRET)) {
            res.status(401).json({ error: 'Invalid signature' });
            return;
        }

        // 存储事件
        if (eventStore.length >= MAX_STORE_SIZE) {
            eventStore.shift(); // FIFO 淘汰
        }
        eventStore.push(event);

        console.log(`[Telemetry] Received: ${event.event_type} from ${event.agent_id ?? 'anonymous'}`);

        res.status(200).json({
            status: 'accepted',
            event_id: crypto.randomUUID(),
        });
    });

    /**
     * POST /api/telemetry/batch
     * 
     * 批量接收遥测事件
     */
    router.post('/batch', (req: Request, res: Response): void => {
        const batch = req.body as TelemetryBatchRequest;

        if (!batch.events || !Array.isArray(batch.events)) {
            res.status(400).json({ error: 'Invalid batch format, expected { events: [...] }' });
            return;
        }

        const result: TelemetryResponse = {
            received: batch.events.length,
            accepted: 0,
            rejected: 0,
            errors: [],
        };

        for (const event of batch.events) {
            const errors = validateEvent(event);

            if (errors.length > 0) {
                result.rejected++;
                result.errors?.push(`Event ${event.event_type}: ${errors.join(', ')}`);
                continue;
            }

            if (!verifySignature(event, SECRET)) {
                result.rejected++;
                result.errors?.push(`Event ${event.event_type}: Invalid signature`);
                continue;
            }

            // 存储
            if (eventStore.length >= MAX_STORE_SIZE) {
                eventStore.shift();
            }
            eventStore.push(event);
            result.accepted++;
        }

        console.log(`[Telemetry] Batch received: ${result.accepted}/${result.received} accepted`);

        res.status(200).json(result);
    });

    /**
     * GET /api/telemetry/stats
     * 
     * 获取遥测统计 (仅供内部使用)
     */
    router.get('/stats', (req: Request, res: Response): void => {
        // 简单的鉴权检查
        const authHeader = req.headers.authorization;
        if (authHeader !== `Bearer ${SECRET}`) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }

        // 计算统计
        const eventCounts: Record<string, number> = {};
        const agentCounts: Record<string, number> = {};

        for (const event of eventStore) {
            eventCounts[event.event_type] = (eventCounts[event.event_type] ?? 0) + 1;
            const agentId = event.agent_id ?? 'anonymous';
            agentCounts[agentId] = (agentCounts[agentId] ?? 0) + 1;
        }

        res.status(200).json({
            total_events: eventStore.length,
            event_counts: eventCounts,
            unique_agents: Object.keys(agentCounts).length,
            storage_usage: `${eventStore.length}/${MAX_STORE_SIZE}`,
        });
    });

    /**
     * GET /api/telemetry/health
     * 
     * 健康检查
     */
    router.get('/health', (_req: Request, res: Response): void => {
        res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
        });
    });

    return router;
}

// 默认导出
export default createTelemetryRouter;
