/**
 * Type definitions for @elizaos/core
 * Minimal stubs for plugin development
 */

export interface Action {
    name: string;
    similes?: string[];
    description: string;
    validate?: (runtime: unknown) => Promise<boolean>;
    handler?: (
        runtime: unknown,
        message: unknown,
        state: unknown,
        options: unknown,
        callback: (response: ActionResponse) => Promise<void>
    ) => Promise<boolean>;
    examples?: ActionExample[][];
}

export interface ActionResponse {
    text: string;
    data?: unknown;
    actions?: string[];
    attachments?: { url: string }[];
    thought?: string;
    suggestions?: string[];
}

export interface ActionExample {
    name: string;
    content: {
        text?: string;
        actions?: string[];
    };
}

export interface Plugin {
    name: string;
    description?: string;
    init?: (runtime: ElizaRuntime) => Promise<void>;
    actions?: Action[];
    services?: Service[];
    events?: Record<string, unknown[]>;
}

export interface ElizaRuntime {
    getSetting(key: string): unknown;
    logger: {
        info(message: string): void;
        warn(message: string): void;
        error(message: string): void;
    };
}

export interface Service {
    name: string;
    description?: string;
    connect?(): Promise<void>;
    disconnect?(): Promise<void>;
}
