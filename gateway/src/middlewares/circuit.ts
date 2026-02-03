/**
 * Circuit Breaker Middleware (熔断器)
 * 
 * @trace Task-H-04, S-H-04, D-H-04
 * @constraint D-H-04b: 连续失败触发熔断
 * @constraint D-H-04c: READ_ONLY 拒绝新支付
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';

/** 熔断器状态 */
export enum CircuitState {
    /** 正常状态: 所有请求通过 */
    NORMAL = 'NORMAL',
    /** 只读状态: 仅允许读取操作，拒绝支付 */
    READ_ONLY = 'READ_ONLY',
    /** 需要确认: 大额支付需人工确认 */
    REQUIRE_CONFIRM = 'REQUIRE_CONFIRM',
    /** 冻结状态: 所有非健康检查请求拒绝 */
    FROZEN = 'FROZEN',
}

/** 熔断器配置 */
export interface CircuitBreakerConfig {
    /** 连续失败次数阈值 */
    failureThreshold: number;
    /** 冷静期 (毫秒) */
    cooldownMs: number;
    /** 按状态恢复的检查间隔 (毫秒) */
    recoveryCheckMs: number;
    /** 大额支付阈值 (msats) */
    largePaymentThreshold: number;
}

/** 熔断器状态数据 */
interface CircuitBreakerState {
    state: CircuitState;
    consecutiveFailures: number;
    lastFailureTime: number;
    stateChangedAt: number;
    totalRequests: number;
    totalFailures: number;
    manualOverride: boolean;
}

/** 全局熔断器状态 */
const circuitState: CircuitBreakerState = {
    state: CircuitState.NORMAL,
    consecutiveFailures: 0,
    lastFailureTime: 0,
    stateChangedAt: Date.now(),
    totalRequests: 0,
    totalFailures: 0,
    manualOverride: false,
};

/** 默认配置 */
const defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 10,
    cooldownMs: 5 * 60 * 1000, // 5 分钟
    recoveryCheckMs: 60 * 1000, // 1 分钟
    largePaymentThreshold: 100000, // 100 sats
};

let config: CircuitBreakerConfig = { ...defaultConfig };

/**
 * 设置熔断器配置
 */
export function setCircuitConfig(newConfig: Partial<CircuitBreakerConfig>): void {
    config = { ...config, ...newConfig };
}

/**
 * 获取当前状态
 */
export function getCircuitState(): CircuitBreakerState {
    return { ...circuitState };
}

/**
 * 切换状态
 */
function transitionTo(newState: CircuitState, reason: string): void {
    const oldState = circuitState.state;
    if (oldState === newState) return;

    console.log(`[Circuit] State transition: ${oldState} -> ${newState} (${reason})`);
    circuitState.state = newState;
    circuitState.stateChangedAt = Date.now();
}

/**
 * 记录失败
 */
export function recordFailure(): void {
    circuitState.consecutiveFailures++;
    circuitState.lastFailureTime = Date.now();
    circuitState.totalFailures++;

    // 检查是否触发熔断
    if (circuitState.consecutiveFailures >= config.failureThreshold) {
        transitionTo(CircuitState.READ_ONLY, `consecutive failures: ${circuitState.consecutiveFailures}`);
    }
}

/**
 * 记录成功
 */
export function recordSuccess(): void {
    circuitState.consecutiveFailures = 0;
    circuitState.totalRequests++;

    // READ_ONLY 状态下，冷静期后可自动恢复
    if (circuitState.state === CircuitState.READ_ONLY && !circuitState.manualOverride) {
        const elapsed = Date.now() - circuitState.stateChangedAt;
        if (elapsed >= config.cooldownMs) {
            transitionTo(CircuitState.NORMAL, 'cooldown period passed with success');
        }
    }
}

/**
 * 手动重置状态
 */
export function resetCircuit(): void {
    circuitState.state = CircuitState.NORMAL;
    circuitState.consecutiveFailures = 0;
    circuitState.manualOverride = false;
    circuitState.stateChangedAt = Date.now();
    console.log('[Circuit] Manual reset to NORMAL');
}

/**
 * 手动设置状态
 */
export function setCircuitState(state: CircuitState, manual = true): void {
    circuitState.manualOverride = manual;
    transitionTo(state, manual ? 'manual override' : 'programmatic');
}

/**
 * 检查请求是否应被阻止
 * 
 * @param isPayment - 是否为支付请求
 * @param amountMsats - 支付金额 (如果是支付请求)
 */
function shouldBlock(isPayment: boolean, amountMsats?: number): { blocked: boolean; reason?: string } {
    switch (circuitState.state) {
        case CircuitState.NORMAL:
            // 大额支付可能需要确认
            if (isPayment && amountMsats && amountMsats > config.largePaymentThreshold) {
                // 这里可以添加 REQUIRE_CONFIRM 逻辑
                // 当前简化为通过
            }
            return { blocked: false };

        case CircuitState.READ_ONLY:
            if (isPayment) {
                return { blocked: true, reason: 'Circuit is in READ_ONLY state' };
            }
            return { blocked: false };

        case CircuitState.REQUIRE_CONFIRM:
            if (isPayment) {
                return { blocked: true, reason: 'Payment requires manual confirmation' };
            }
            return { blocked: false };

        case CircuitState.FROZEN:
            return { blocked: true, reason: 'Circuit is FROZEN' };

        default:
            return { blocked: false };
    }
}

/** 中间件选项 */
export interface CircuitBreakerMiddlewareOptions {
    /** 跳过的路径 */
    skipPaths?: string[];
    /** 判断是否为支付请求的函数 */
    isPaymentRequest?: (req: Request) => boolean;
    /** 获取支付金额的函数 */
    getPaymentAmount?: (req: Request) => number | undefined;
}

/**
 * Circuit Breaker 中间件
 * 
 * @param options - 中间件选项
 * @returns Express Middleware
 */
export function circuitBreakerMiddleware(options: CircuitBreakerMiddlewareOptions = {}): RequestHandler {
    const {
        skipPaths = ['/health', '/api/health', '/api/circuit-status'],
        isPaymentRequest = (req) => req.method !== 'GET' && req.path.startsWith('/api/'),
        getPaymentAmount = (req) => (req.body as any)?.amountMsats,
    } = options;

    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            // 检查跳过路径
            if (skipPaths.some((p) => req.path.startsWith(p))) {
                next();
                return;
            }

            const isPayment = isPaymentRequest(req);
            const amount = getPaymentAmount(req);

            // 检查是否应阻止
            const result = shouldBlock(isPayment, amount);

            if (result.blocked) {
                console.warn(`[Circuit] Blocked request: ${req.method} ${req.path}, reason: ${result.reason}`);
                res.status(503).json({
                    error: 'Service temporarily unavailable',
                    code: 'CIRCUIT_OPEN',
                    state: circuitState.state,
                    reason: result.reason,
                });
                return;
            }

            // 包装响应以记录结果
            const originalEnd = res.end.bind(res);
            (res as any).end = function (chunk?: unknown, encoding?: BufferEncoding, cb?: () => void): Response {
                // 根据状态码判断成功/失败
                if (res.statusCode >= 500) {
                    recordFailure();
                } else {
                    recordSuccess();
                }
                if (encoding) {
                    return originalEnd(chunk, encoding, cb);
                }
                return originalEnd(chunk);
            };


            next();
        } catch (error) {
            console.error('[Circuit] Middleware error:', error);
            next();
        }
    };
}

/**
 * 创建状态查询路由
 * 
 * @returns Express Router handler for GET /api/circuit-status
 */
export function circuitStatusHandler(req: Request, res: Response): void {
    const state = getCircuitState();
    res.status(200).json({
        state: state.state,
        consecutiveFailures: state.consecutiveFailures,
        totalRequests: state.totalRequests,
        totalFailures: state.totalFailures,
        stateChangedAt: new Date(state.stateChangedAt).toISOString(),
        manualOverride: state.manualOverride,
        config: {
            failureThreshold: config.failureThreshold,
            cooldownMs: config.cooldownMs,
        },
    });
}

export default circuitBreakerMiddleware;
