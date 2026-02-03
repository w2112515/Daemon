/**
 * Macaroon Types for L402 Protocol
 * 
 * @description Type definitions for L402 authentication/payment tokens
 * @trace Vol.2 S-P0-03, Vol.1 §2.2
 */

/** Caveat types supported by L402 macaroons */
export type CaveatType = 'service' | 'expiry' | 'budget' | 'resource';

/** First-party caveat attached to a macaroon */
export interface MacaroonCaveat {
    type: CaveatType;
    value: string;
}

/** L402 token combining macaroon and preimage */
export interface L402Token {
    macaroon: string;       // base64 encoded macaroon
    preimage: string;       // 256-bit hex (payment proof)
    invoice?: string;       // optional, for logging/debugging
}

/** Options for minting a new macaroon */
export interface MintOptions {
    paymentHash: string;            // from LND invoice (hex, 32 bytes)
    caveats?: MacaroonCaveat[];     // optional first-party caveats
    expirySeconds?: number;         // default: 3600 (1 hour)
    service?: string;               // service identifier (e.g., 'api.daemon.io')
}

/** Result of macaroon verification */
export interface VerifyResult {
    valid: boolean;
    caveats: MacaroonCaveat[];
    error?: string;                 // error message if invalid
    paymentHash?: string;           // extracted from identifier
}

/** Macaroon identifier structure (embedded in macaroon) */
export interface MacaroonIdentifier {
    version: number;                // identifier format version (1)
    paymentHash: string;            // 32-byte hex
    tokenId?: string;               // optional unique token ID
}

/** Constants for macaroon operations */
export const MACAROON_CONSTANTS = {
    IDENTIFIER_VERSION: 1,
    DEFAULT_EXPIRY_SECONDS: 3600,
    PAYMENT_HASH_LENGTH: 64,        // 32 bytes as hex
    PREIMAGE_LENGTH: 64,            // 32 bytes as hex
} as const;
