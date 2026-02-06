/**
 * Eliza L402 Plugin
 * 
 * Exposes L402 pay-per-call capabilities to Eliza AI agents
 * 
 * @trace Task-P1-07, Task-P1-11, Vol.2 §2.5, §145
 * @constraint D-ECO-04: Plugin loadable by Eliza runtime
 * @constraint D-ECO-04a: init(runtime) hook exists
 * @constraint D-ECO-04b: receivePayment Action registered
 * @constraint D-ECO-04c: getBalance Action registered
 * @constraint D-ECO-04d: LndConnectionService exported
 * @constraint D-ECO-05: payL402Invoice action returns preimage
 */

// Use local type definitions to avoid hard dependency on @elizaos/core
import type { Action, Plugin, ActionResponse, ElizaRuntime, Service } from './eliza.d';

import type {
    L402PluginConfig,
    PayL402InvoiceParams,
    RequestWithL402Params,
    L402PaymentResult,
    L402RequestResult,
    PaymentHandler,
    LndConfig,
    WalletBalance,
    Invoice,
    LndInfo,
} from './types';

// Re-export types for consumers
export type {
    L402PluginConfig,
    PayL402InvoiceParams,
    RequestWithL402Params,
    L402PaymentResult,
    L402RequestResult,
    PaymentHandler,
    LndConfig,
    WalletBalance,
    Invoice,
    LndInfo,
};

/**
 * Internal state holder for the plugin
 */
let pluginConfig: L402PluginConfig | null = null;
let lndService: LndConnectionService | null = null;

/**
 * Configure the L402 plugin with a payment handler
 * Must be called before using actions
 */
export function configureL402Plugin(config: L402PluginConfig): void {
    pluginConfig = config;
}

/**
 * LndConnectionService - Manages LND node connections
 * @constraint D-ECO-04d: LndConnectionService exported
 */
export class LndConnectionService implements Service {
    public readonly name = 'LndConnectionService';
    public readonly description = 'Manages LND node connections for Lightning payments';

    private config: LndConfig | null = null;
    private connected = false;

    /**
     * Connect to LND node
     */
    async connect(config?: LndConfig): Promise<void> {
        this.config = config ?? { mockMode: true };

        if (this.config.mockMode) {
            console.log('[LndConnectionService] Running in mock mode');
            this.connected = true;
            return;
        }

        // Real LND connection would use gRPC
        // For now, just mark as connected
        console.log(`[LndConnectionService] Connecting to ${this.config.host ?? 'localhost'}:${this.config.port ?? 10009}`);
        this.connected = true;
    }

    /**
     * Disconnect from LND node
     */
    async disconnect(): Promise<void> {
        this.connected = false;
        console.log('[LndConnectionService] Disconnected');
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * Get node info
     */
    async getInfo(): Promise<LndInfo> {
        if (!this.connected) {
            throw new Error('LND not connected');
        }

        if (this.config?.mockMode) {
            return {
                pubkey: '02' + 'a'.repeat(64),
                alias: 'MockNode',
                syncedToChain: true,
            };
        }

        // Real implementation would call lnrpc.GetInfo
        throw new Error('Real LND not implemented');
    }

    /**
     * Create an invoice for receiving payment
     */
    async createInvoice(amount: number, memo = 'L402 Payment'): Promise<Invoice> {
        if (!this.connected) {
            throw new Error('LND not connected');
        }

        if (this.config?.mockMode) {
            const randomBytes = crypto.getRandomValues(new Uint8Array(32));
            const paymentHash = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            // Include memo in description (for mock, just log it)
            console.log(`[LndConnectionService] Creating invoice for ${amount} sats: ${memo}`);
            return {
                paymentRequest: `lnbcrt${amount}n1mock${paymentHash.slice(0, 20)}`,
                paymentHash,
                expiry: 3600,
            };
        }

        // Real implementation would call lnrpc.AddInvoice
        throw new Error('Real LND not implemented');
    }

    /**
     * Get wallet balance
     */
    async getBalance(): Promise<WalletBalance> {
        if (!this.connected) {
            throw new Error('LND not connected');
        }

        if (this.config?.mockMode) {
            return {
                confirmedBalance: 1000000, // 1M sats mock
                unconfirmedBalance: 0,
                totalBalance: 1000000,
            };
        }

        // Real implementation would call lnrpc.WalletBalance
        throw new Error('Real LND not implemented');
    }
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
 * receivePayment Action
 * @constraint D-ECO-04b: receivePayment Action registered
 * 
 * Generates an invoice to receive Lightning payments
 */
const receivePaymentAction: Action = {
    name: 'RECEIVE_PAYMENT',
    similes: ['CREATE_INVOICE', 'GET_PAID', 'RECEIVE_SATS'],
    description: 'Generate an invoice to receive a Lightning payment',

    validate: async (_runtime: unknown): Promise<boolean> => {
        if (!lndService?.isConnected()) {
            console.warn('[L402] LND not connected. Cannot receive payments.');
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
        if (!lndService?.isConnected()) {
            await callback({
                text: 'LND not connected. Cannot generate invoice.',
                actions: ['RECEIVE_PAYMENT'],
            });
            return false;
        }

        // Extract amount and memo from message
        const msg = message as { content?: { amount?: number; memo?: string; text?: string } };
        const content = msg.content ?? {};
        const amount = content.amount ?? extractAmount(content.text ?? '');
        const memo = content.memo ?? 'L402 Payment';

        if (!amount || amount <= 0) {
            await callback({
                text: 'Invalid amount. Please specify a positive amount in satoshis.',
                actions: ['RECEIVE_PAYMENT'],
            });
            return false;
        }

        try {
            const invoice = await lndService.createInvoice(amount, memo);

            await callback({
                text: `Invoice created for ${amount} sats. Payment request: ${invoice.paymentRequest.slice(0, 30)}...`,
                data: invoice,
                actions: ['RECEIVE_PAYMENT'],
            });
            return true;
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            await callback({
                text: `Failed to create invoice: ${errMsg}`,
                actions: ['RECEIVE_PAYMENT'],
            });
            return false;
        }
    },

    examples: [
        [
            {
                name: '{{user}}',
                content: { text: 'Create an invoice for 1000 sats' },
            },
            {
                name: '{{agent}}',
                content: {
                    text: 'Invoice created for 1000 sats. Payment request: lnbc...',
                    actions: ['RECEIVE_PAYMENT'],
                },
            },
        ],
    ],
};

/**
 * getBalance Action
 * @constraint D-ECO-04c: getBalance Action registered
 * 
 * Checks the Lightning wallet balance
 */
const getBalanceAction: Action = {
    name: 'GET_BALANCE',
    similes: ['CHECK_BALANCE', 'WALLET_STATUS', 'HOW_MANY_SATS'],
    description: 'Check the current Lightning wallet balance',

    validate: async (_runtime: unknown): Promise<boolean> => {
        if (!lndService?.isConnected()) {
            console.warn('[L402] LND not connected. Cannot check balance.');
            return false;
        }
        return true;
    },

    handler: async (
        _runtime: unknown,
        _message: unknown,
        _state: unknown,
        _options: unknown,
        callback: (response: ActionResponse) => Promise<void>
    ): Promise<boolean> => {
        if (!lndService?.isConnected()) {
            await callback({
                text: 'LND not connected. Cannot check balance.',
                actions: ['GET_BALANCE'],
            });
            return false;
        }

        try {
            const balance = await lndService.getBalance();

            await callback({
                text: `Wallet balance: ${balance.confirmedBalance} sats (confirmed), ${balance.unconfirmedBalance} sats (unconfirmed)`,
                data: balance,
                actions: ['GET_BALANCE'],
            });
            return true;
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            await callback({
                text: `Failed to get balance: ${errMsg}`,
                actions: ['GET_BALANCE'],
            });
            return false;
        }
    },

    examples: [
        [
            {
                name: '{{user}}',
                content: { text: 'What is my wallet balance?' },
            },
            {
                name: '{{agent}}',
                content: {
                    text: 'Wallet balance: 1000000 sats (confirmed), 0 sats (unconfirmed)',
                    actions: ['GET_BALANCE'],
                },
            },
        ],
    ],
};

/**
 * Extract amount from text (e.g., "1000 sats", "500 satoshis")
 */
function extractAmount(text: string): number | null {
    const match = text.match(/(\d+)\s*(?:sats?|satoshis?)?/i);
    if (!match || !match[1]) return null;
    return parseInt(match[1], 10);
}

/**
 * Init handler for plugin initialization
 * @constraint D-ECO-04a: init(runtime) hook exists
 * @trace Task-P2-05: Real/Mock mode switching
 */
async function initHandler(runtime: ElizaRuntime): Promise<void> {
    const config = runtime.getSetting('l402') as L402PluginConfig | undefined;

    if (config) {
        configureL402Plugin(config);
        runtime.logger.info('[L402] Plugin configured with payment handler');
    }

    // Get LND mode from environment or settings
    const lndMode = process.env.LND_MODE?.toLowerCase() ?? 'mock';
    const lndConfig = runtime.getSetting('lnd') as LndConfig | undefined;

    // Initialize LND service based on mode
    if (lndMode === 'real' && !lndConfig?.mockMode) {
        // Real LND mode - dynamic import to avoid bundling gRPC when not needed
        runtime.logger.info('[L402] Initializing in REAL LND mode');
        try {
            const { LndRealModeService } = await import('./lnd_real');
            const realService = new LndRealModeService({
                host: lndConfig?.host,
                port: lndConfig?.port,
                macaroonPath: lndConfig?.macaroonPath,
                tlsCertPath: lndConfig?.tlsCertPath,
            });
            await realService.connect();

            // Create a wrapper that mimics LndConnectionService interface
            lndService = createRealModeWrapper(realService);
            runtime.logger.info('[L402] Real LND connection established');
        } catch (error) {
            runtime.logger.warn(`[L402] Failed to connect to real LND, falling back to mock: ${error}`);
            lndService = new LndConnectionService();
            await lndService.connect({ mockMode: true });
        }
    } else {
        // Mock mode
        runtime.logger.info('[L402] Initializing in MOCK LND mode');
        lndService = new LndConnectionService();
        await lndService.connect(lndConfig);
    }

    runtime.logger.info('[L402] Plugin initialized');
}

/**
 * Create a wrapper around LndRealModeService to match LndConnectionService interface
 */
function createRealModeWrapper(realService: {
    getInfo(): Promise<LndInfo>;
    createInvoice(amount: number, memo?: string): Promise<Invoice>;
    getBalance(): Promise<WalletBalance>;
    isConnected(): boolean;
}): LndConnectionService {
    const wrapper = new LndConnectionService();
    // Override methods to use real service
    wrapper.getInfo = () => realService.getInfo();
    wrapper.createInvoice = (amount, memo) => realService.createInvoice(amount, memo);
    wrapper.getBalance = () => realService.getBalance();
    wrapper.isConnected = () => realService.isConnected();
    return wrapper;
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
 *   plugins: [elizaL402Plugin],
 *   settings: {
 *     lnd: { mockMode: true } // Or real LND config
 *   }
 * });
 * ```
 */
export const elizaL402Plugin: Plugin = {
    name: '@daemon/eliza-l402',
    description: 'L402 pay-per-call payment capabilities for Eliza agents',
    init: initHandler,
    actions: [
        payL402InvoiceAction,
        requestWithL402Action,
        receivePaymentAction,
        getBalanceAction,
    ],
    services: [new LndConnectionService()],
};

// Default export for convenience
export default elizaL402Plugin;
