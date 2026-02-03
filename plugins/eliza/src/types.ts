/**
 * Type definitions for Eliza L402 Plugin
 * 
 * @trace Task-P1-07
 * These types are simplified for plugin compatibility
 */

/**
 * Payment handler function type
 * Should pay the Lightning invoice and return the preimage
 */
export type PaymentHandler = (invoice: string) => Promise<string>;

/**
 * L402 Plugin configuration options
 */
export interface L402PluginConfig {
    /** Async function to pay Lightning invoices */
    paymentHandler: PaymentHandler;
    /** Request timeout in ms (default: 30000) */
    timeout?: number;
    /** Maximum retry attempts (default: 1) */
    maxRetries?: number;
}

/**
 * payL402Invoice action params
 */
export interface PayL402InvoiceParams {
    /** Lightning invoice (BOLT11 format) */
    invoice: string;
}

/**
 * requestWithL402 action params
 */
export interface RequestWithL402Params {
    /** Target URL */
    url: string;
    /** HTTP method (default: GET) */
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    /** Request body (for POST/PUT) */
    body?: unknown;
    /** Additional headers */
    headers?: Record<string, string>;
}

/**
 * L402 payment result
 */
export interface L402PaymentResult {
    /** Payment preimage (32 bytes hex) */
    preimage: string;
    /** Amount paid in msats (if available) */
    amountMsats?: number;
}

/**
 * L402 request result
 */
export interface L402RequestResult {
    /** HTTP status code */
    status: number;
    /** Response body */
    data: unknown;
    /** Whether L402 payment was triggered */
    paidL402: boolean;
}
