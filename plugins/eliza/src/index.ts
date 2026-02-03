/**
 * Eliza L402 Plugin
 * 
 * Exposes L402 pay-per-call capabilities to Eliza AI agents
 * 
 * @trace Task-P1-07, Vol.2 §2.5
 * @constraint D-ECO-04: Plugin loadable by Eliza runtime
 * @constraint D-ECO-05: payL402Invoice action returns preimage
 */

// Use local type definitions to avoid hard dependency on @elizaos/core
import type { Action, Plugin, ActionResponse } from './eliza.d';

import type {
    L402PluginConfig,
    PayL402InvoiceParams,
    RequestWithL402Params,
    L402PaymentResult,
    L402RequestResult,
    PaymentHandler,
} from './types';

// Re-export types for consumers
export type {
    L402PluginConfig,
    PayL402InvoiceParams,
    RequestWithL402Params,
    L402PaymentResult,
    L402RequestResult,
    PaymentHandler,
};

/**
 * Internal state holder for the plugin
 */
let pluginConfig: L402PluginConfig | null = null;

/**
 * Configure the L402 plugin with a payment handler
 * Must be called before using actions
 */
export function configureL402Plugin(config: L402PluginConfig): void {
    pluginConfig = config;
}

/**
 * Make an L402-aware HTTP request
 * Handles 402 responses by paying the invoice and retrying
 */
async function makeL402Request(
    url: string,
    init?: RequestInit
): Promise<Response> {
    if (!pluginConfig) {
        throw new Error('L402 plugin not configured');
    }

    const timeout = pluginConfig.timeout ?? 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const fetchOptions: RequestInit = {
            ...init,
            signal: controller.signal,
        };

        let response = await fetch(url, fetchOptions);

        if (response.status === 402) {
            console.log(`[L402] Received 402 for ${url}, attempting payment`);

            // Parse L402 challenge from WWW-Authenticate header
            const wwwAuth = response.headers.get('WWW-Authenticate') ?? '';
            const macaroonMatch = wwwAuth.match(/macaroon="([^"]+)"/);
            const invoiceMatch = wwwAuth.match(/invoice="([^"]+)"/);

            if (!macaroonMatch || !invoiceMatch) {
                throw new Error(`Invalid L402 challenge: ${wwwAuth}`);
            }

            const macaroon = macaroonMatch[1] ?? '';
            const invoice = invoiceMatch[1] ?? '';

            // Pay the invoice
            const preimage = await pluginConfig.paymentHandler(invoice);

            // Validate preimage (32 bytes = 64 hex chars)
            if (!preimage || preimage.length !== 64) {
                throw new Error('Invalid preimage: expected 64 hex chars');
            }

            console.log(`[L402] Payment successful, retrying request`);

            // Retry with L402 credential
            const headers = new Headers(init?.headers);
            headers.set('Authorization', `L402 ${macaroon}:${preimage}`);

            response = await fetch(url, {
                ...fetchOptions,
                headers,
            });
        }

        return response;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * payL402Invoice Action
 * 
 * Pays a Lightning invoice and returns the preimage
 */
const payL402InvoiceAction: Action = {
    name: 'PAY_L402_INVOICE',
    similes: ['PAY_INVOICE', 'L402_PAY', 'LIGHTNING_PAY'],
    description: 'Pay a Lightning invoice (BOLT11) and return the payment preimage',

    validate: async (_runtime: unknown): Promise<boolean> => {
        if (!pluginConfig) {
            console.warn('[L402] Plugin not configured. Call configureL402Plugin first.');
            return false;
        }
        return true;
    },

    handler: async (
        _runtime: unknown,
        message: unknown,
        _state: unknown,
        _options: unknown,
        callback: (response: ActionResponse) => Promise<void>
    ): Promise<boolean> => {
        if (!pluginConfig) {
            await callback({
                text: 'L402 plugin not configured. Payment handler is required.',
                actions: ['PAY_L402_INVOICE'],
            });
            return false;
        }

        // Extract invoice from message content (Eliza format: { content: {...} })
        const msg = message as { content?: { invoice?: string; text?: string } };
        const content = msg.content ?? {};
        const invoice = content.invoice ?? extractInvoice(content.text ?? '');

        if (!invoice) {
            await callback({
                text: 'No valid Lightning invoice found in request.',
                actions: ['PAY_L402_INVOICE'],
            });
            return false;
        }

        try {
            const preimage = await pluginConfig.paymentHandler(invoice);

            const result: L402PaymentResult = { preimage };

            await callback({
                text: `Payment successful. Preimage: ${preimage.slice(0, 16)}...`,
                data: result,
                actions: ['PAY_L402_INVOICE'],
            });
            return true;
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            await callback({
                text: `Payment failed: ${errMsg}`,
                actions: ['PAY_L402_INVOICE'],
            });
            return false;
        }
    },

    examples: [
        [
            {
                name: '{{user}}',
                content: { text: 'Pay this invoice: lnbc10u1p...' },
            },
            {
                name: '{{agent}}',
                content: {
                    text: 'Payment successful. Preimage: abcdef123456...',
                    actions: ['PAY_L402_INVOICE'],
                },
            },
        ],
    ],
};

/**
 * requestWithL402 Action
 * 
 * Makes an HTTP request that may require L402 payment (auto-handled)
 */
const requestWithL402Action: Action = {
    name: 'REQUEST_WITH_L402',
    similes: ['L402_REQUEST', 'PAY_API', 'FETCH_WITH_L402'],
    description: 'Make an HTTP request with automatic L402 payment handling',

    validate: async (_runtime: unknown): Promise<boolean> => {
        if (!pluginConfig) {
            console.warn('[L402] Plugin not configured. Call configureL402Plugin first.');
            return false;
        }
        return true;
    },

    handler: async (
        _runtime: unknown,
        message: unknown,
        _state: unknown,
        _options: unknown,
        callback: (response: ActionResponse) => Promise<void>
    ): Promise<boolean> => {
        if (!pluginConfig) {
            await callback({
                text: 'L402 plugin not configured.',
                actions: ['REQUEST_WITH_L402'],
            });
            return false;
        }

        // Extract request params from message (Eliza format: { content: {...} })
        type ContentType = RequestWithL402Params & { text?: string };
        const msg = message as { content?: ContentType };
        const content: Partial<ContentType> = msg.content ?? {};
        const url = content.url ?? extractUrl(content.text ?? '');
        const method = content.method ?? 'GET';

        if (!url) {
            await callback({
                text: 'No valid URL found in request.',
                actions: ['REQUEST_WITH_L402'],
            });
            return false;
        }

        try {
            const requestInit: RequestInit = {
                method,
                headers: content.headers,
            };

            if (content.body && (method === 'POST' || method === 'PUT')) {
                requestInit.body = JSON.stringify(content.body);
                requestInit.headers = {
                    ...requestInit.headers,
                    'Content-Type': 'application/json',
                };
            }

            const response = await makeL402Request(url, requestInit);
            const data = await response.json().catch(() => response.text());

            const result: L402RequestResult = {
                status: response.status,
                data,
                paidL402: response.ok,
            };

            await callback({
                text: `Request completed. Status: ${response.status}`,
                data: result,
                actions: ['REQUEST_WITH_L402'],
            });
            return true;
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            await callback({
                text: `Request failed: ${errMsg}`,
                actions: ['REQUEST_WITH_L402'],
            });
            return false;
        }
    },

    examples: [
        [
            {
                name: '{{user}}',
                content: {
                    text: 'Fetch data from https://api.example.com/paid-endpoint',
                },
            },
            {
                name: '{{agent}}',
                content: {
                    text: 'Request completed. Status: 200',
                    actions: ['REQUEST_WITH_L402'],
                },
            },
        ],
    ],
};

/**
 * Extract Lightning invoice from text
 */
function extractInvoice(text: string): string | null {
    // Match lnbc, lntb (testnet), lnbcrt (regtest) invoices
    const match = text.match(/ln(bc|tb|bcrt)[a-z0-9]+/i);
    return match ? match[0] : null;
}

/**
 * Extract URL from text
 */
function extractUrl(text: string): string | null {
    const match = text.match(/https?:\/\/[^\s]+/i);
    return match ? match[0] : null;
}

/**
 * Eliza L402 Plugin
 * 
 * Usage:
 * ```typescript
 * import { elizaL402Plugin, configureL402Plugin } from '@daemon/eliza-l402';
 * 
 * configureL402Plugin({
 *   paymentHandler: async (invoice) => {
 *     return await wallet.pay(invoice); // returns preimage
 *   }
 * });
 * 
 * const agent = new AgentRuntime({
 *   plugins: [elizaL402Plugin]
 * });
 * ```
 */
export const elizaL402Plugin: Plugin = {
    name: '@daemon/eliza-l402',
    description: 'L402 pay-per-call payment capabilities for Eliza agents',
    actions: [payL402InvoiceAction, requestWithL402Action],
    services: [],
};

// Default export for convenience
export default elizaL402Plugin;
