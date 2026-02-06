/**
 * MCP Transport Protocol Module
 * 
 * Provides transport layer abstraction for MCP servers
 * 
 * @trace Task-P2-04: MCP Transport Protocol
 * @constraint D-P2-04a~c: Multi-protocol support (stdio, SSE)
 * @alignment Vol.2 §307 + S-P2-04
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { Response } from 'express';

/** Transport 类型 */
export type TransportType = 'stdio' | 'sse';

/** SSE Transport 配置 */
export interface SSETransportConfig {
    /** Express Response 对象 */
    response: Response;
    /** SSE 终端路径 (用于日志) */
    endpoint?: string;
}

/** Stdio Transport 配置 */
export interface StdioTransportConfig {
    /** 可选的输入流 */
    stdin?: NodeJS.ReadableStream;
    /** 可选的输出流 */
    stdout?: NodeJS.WritableStream;
}

/** Transport 工厂配置 */
export interface TransportFactoryConfig {
    type: TransportType;
    /** SSE 配置 (当 type='sse' 时必需) */
    sse?: SSETransportConfig;
    /** Stdio 配置 (当 type='stdio' 时可选) */
    stdio?: StdioTransportConfig;
}

/**
 * 创建 MCP Transport 实例
 * 
 * @param config - Transport 配置
 * @returns Transport 实例
 * 
 * @example
 * // Stdio transport (for CLI/mcp-inspector)
 * const transport = createTransport({ type: 'stdio' });
 * 
 * @example
 * // SSE transport (for browser clients)
 * app.get('/sse', (req, res) => {
 *     const transport = createTransport({
 *         type: 'sse',
 *         sse: { response: res, endpoint: '/sse' }
 *     });
 *     server.connect(transport);
 * });
 */
export function createTransport(config: TransportFactoryConfig): StdioServerTransport | SSEServerTransport {
    switch (config.type) {
        case 'stdio':
            return createStdioTransport(config.stdio);
        case 'sse':
            if (!config.sse) {
                throw new Error('SSE transport requires sse config with response object');
            }
            return createSSETransport(config.sse);
        default:
            throw new Error(`Unknown transport type: ${config.type}`);
    }
}

/**
 * 创建 Stdio Transport
 * 
 * 用于 CLI 工具或 mcp-inspector 连接
 */
export function createStdioTransport(_config?: StdioTransportConfig): StdioServerTransport {
    console.log('[Transport] Creating Stdio transport');

    // StdioServerTransport 使用默认的 stdin/stdout
    // 如果需要自定义流，可以通过环境配置
    return new StdioServerTransport();
}

/**
 * 创建 SSE Transport
 * 
 * 用于浏览器客户端通过 Server-Sent Events 连接
 */
export function createSSETransport(config: SSETransportConfig): SSEServerTransport {
    const { response, endpoint = '/sse' } = config;

    console.log(`[Transport] Creating SSE transport at ${endpoint}`);

    // 设置 SSE 响应头
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('Access-Control-Allow-Origin', '*');

    // 创建 SSE transport (需要 endpoint 参数)
    return new SSEServerTransport(endpoint, response);
}

/**
 * Transport 类型守卫
 */
export function isStdioTransport(transport: unknown): transport is StdioServerTransport {
    return transport instanceof StdioServerTransport;
}

export function isSSETransport(transport: unknown): transport is SSEServerTransport {
    return transport instanceof SSEServerTransport;
}

/**
 * 获取推荐的 Transport 类型
 * 
 * 根据运行环境自动选择合适的 Transport
 */
export function getRecommendedTransportType(): TransportType {
    // 如果是 TTY (终端)，使用 stdio
    if (process.stdin.isTTY) {
        return 'stdio';
    }

    // 如果有 HTTP 服务器环境变量，使用 SSE
    if (process.env.MCP_HTTP_MODE === 'true' || process.env.PORT) {
        return 'sse';
    }

    // 默认使用 stdio
    return 'stdio';
}
