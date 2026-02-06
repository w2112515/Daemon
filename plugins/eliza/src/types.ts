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

/**
 * LND connection configuration
 */
export interface LndConfig {
    /** LND host (default: localhost) */
    host?: string;
    /** LND gRPC port (default: 10009) */
    port?: number;
    /** TLS cert path or base64 */
    cert?: string;
    /** TLS cert file path (for real mode) */
    tlsCertPath?: string;
    /** Macaroon path or base64 (admin macaroon) */
    macaroon?: string;
    /** Macaroon file path (for real mode) */
    macaroonPath?: string;
    /** Use mock mode for testing */
    mockMode?: boolean;
}

/**
 * Wallet balance response
 */
export interface WalletBalance {
    /** Confirmed balance in satoshis */
    confirmedBalance: number;
    /** Unconfirmed balance in satoshis */
    unconfirmedBalance: number;
    /** Total balance (confirmed + unconfirmed) */
    totalBalance: number;
}

/**
 * Invoice creation result
 */
export interface Invoice {
    /** BOLT11 payment request */
    paymentRequest: string;
    /** Payment hash (r_hash) hex */
    paymentHash: string;
    /** Invoice expiry in seconds */
    expiry: number;
}

/**
 * LND node info
 */
export interface LndInfo {
    /** Node public key */
    pubkey: string;
    /** Node alias */
    alias: string;
    /** Synced to chain */
    syncedToChain: boolean;
}
