/**
 * L402 HTTP Client
 * 
 * @trace Task-P1-03, Vol.2 §2.4
 * @constraint D-SDK-05: TS 类型检查通过
 * @constraint D-SDK-06: 单元测试通过
 * @constraint 零外部依赖 (使用原生 fetch)
 */

import {
    L402Challenge,
    L402Credential,
    formatCredentialHeader,
} from './types';
import {
    L402InvalidChallengeError,
    L402PaymentFailedError,
} from './errors';

/**
 * Payment handler callback type
 * Should pay the invoice and return the preimage
 */
export type PaymentHandler = (invoice: string) => Promise<string>;

/**
 * L402 Client options
 */
export interface L402ClientOptions {
    /** Async function that pays invoice and returns preimage */
    paymentHandler: PaymentHandler;
    /** Max payment retry attempts (default: 1) */
    maxRetries?: number;
    /** Request timeout in ms (default: 30000) */
    timeout?: number;
}

/**
 * L402 HTTP Client with automatic payment handling
 * 
 * @example
 * ```typescript
 * const client = new L402Client({
 *   paymentHandler: async (invoice) => {
 *     const preimage = await wallet.pay(invoice);
 *     return preimage;
 *   }
 * });
 * 
 * const response = await client.request('https://api.example.com/paid');
 * console.log(await response.json());
 * ```
 */
export class L402Client {
    private readonly paymentHandler: PaymentHandler;
    /** Reserved for future retry logic */
    private readonly _maxRetries: number;
    private readonly timeout: number;

    constructor(options: L402ClientOptions) {
        this.paymentHandler = options.paymentHandler;
        this._maxRetries = options.maxRetries ?? 1;
        this.timeout = options.timeout ?? 30000;
    }

    /**
     * Make an HTTP request with automatic L402 handling
     * 
     * Flow:
     * 1. Send request
     * 2. If 402, parse challenge
     * 3. Pay invoice via paymentHandler
     * 4. Retry with L402 credential
     */
    async request(url: string, options?: RequestInit): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const fetchOptions: RequestInit = {
                ...options,
                signal: controller.signal,
            };

            let response = await fetch(url, fetchOptions);

            if (response.status === 402) {
                console.log(`[L402] Received 402 for ${url}, attempting payment`);

                // Parse challenge
                const challenge = await this.parseChallenge(response);

                // Pay and get credential
                const credential = await this.payChallenge(challenge);

                // Retry with credential
                const headers = new Headers(options?.headers);
                headers.set('Authorization', formatCredentialHeader(credential));

                console.log('[L402] Payment successful, retrying request');
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
     * GET request convenience method
     */
    async get(url: string, options?: Omit<RequestInit, 'method'>): Promise<Response> {
        return this.request(url, { ...options, method: 'GET' });
    }

    /**
     * POST request convenience method
     */
    async post(url: string, options?: Omit<RequestInit, 'method'>): Promise<Response> {
        return this.request(url, { ...options, method: 'POST' });
    }

    /**
     * PUT request convenience method
     */
    async put(url: string, options?: Omit<RequestInit, 'method'>): Promise<Response> {
        return this.request(url, { ...options, method: 'PUT' });
    }

    /**
     * DELETE request convenience method
     */
    async delete(url: string, options?: Omit<RequestInit, 'method'>): Promise<Response> {
        return this.request(url, { ...options, method: 'DELETE' });
    }

    /**
     * Parse L402 challenge from 402 response
     */
    private async parseChallenge(response: Response): Promise<L402Challenge> {
        const wwwAuth = response.headers.get('WWW-Authenticate') ?? '';

        // Parse format: L402 macaroon="...", invoice="..."
        const macaroonMatch = wwwAuth.match(/macaroon="([^"]+)"/);
        const invoiceMatch = wwwAuth.match(/invoice="([^"]+)"/);

        if (!macaroonMatch || !invoiceMatch) {
            throw new L402InvalidChallengeError(
                `Invalid WWW-Authenticate header: ${wwwAuth}`
            );
        }

        // Extract additional info from body (optional)
        let paymentHash: string | undefined;
        let amountMsats: number | undefined;

        try {
            const body = await response.json() as Record<string, unknown>;
            paymentHash = body.paymentHash as string | undefined;
            amountMsats = body.amountMsats as number | undefined;
        } catch {
            // Body parsing is optional
        }

        return {
            macaroon: macaroonMatch[1],
            invoice: invoiceMatch[1],
            paymentHash,
            amountMsats,
        };
    }

    /**
     * Pay challenge invoice
     */
    private async payChallenge(challenge: L402Challenge): Promise<L402Credential> {
        console.log(`[L402] Paying invoice: ${challenge.amountMsats ?? 'unknown'} msats`);

        let preimage: string;
        try {
            preimage = await this.paymentHandler(challenge.invoice);
        } catch (error) {
            throw new L402PaymentFailedError(
                `Payment failed: ${error instanceof Error ? error.message : String(error)}`,
                challenge.amountMsats
            );
        }

        // Validate preimage (32 bytes = 64 hex chars)
        if (!preimage || preimage.length !== 64) {
            throw new L402PaymentFailedError(
                'Invalid preimage returned: expected 64 hex chars',
                challenge.amountMsats
            );
        }

        console.log(`[L402] Payment successful, preimage: ${preimage.slice(0, 16)}...`);

        return {
            macaroon: challenge.macaroon,
            preimage,
        };
    }
}
