/**
 * Macaroon Service for L402 Protocol
 * 
 * @description Core module for minting and verifying L402 macaroons
 * @trace Vol.2 S-P0-03, Vol.1 §2.2
 * @constraint D-SEC-01: Root Key 不硬编码
 * @constraint D-GW-02: Macaroon 可铸造并验证
 */

import crypto from 'crypto';
import {
    MacaroonCaveat,
    MintOptions,
    VerifyResult,
    MacaroonIdentifier,
    MACAROON_CONSTANTS,
} from '../types/macaroon';

/** HMAC-SHA256 helper */
function hmacSha256(key: Buffer, data: Buffer): Buffer {
    return crypto.createHmac('sha256', key).update(data).digest();
}

/** Encode identifier to bytes */
function encodeIdentifier(id: MacaroonIdentifier): Buffer {
    const paymentHashBuf = Buffer.from(id.paymentHash, 'hex');
    const tokenIdBuf = id.tokenId ? Buffer.from(id.tokenId, 'utf8') : Buffer.alloc(0);

    const result = Buffer.alloc(1 + 32 + tokenIdBuf.length);
    result.writeUInt8(id.version, 0);
    paymentHashBuf.copy(result, 1);
    tokenIdBuf.copy(result, 33);

    return result;
}

/** Decode identifier from bytes */
function decodeIdentifier(buf: Buffer): MacaroonIdentifier {
    if (buf.length < 33) {
        throw new Error('Invalid identifier: too short');
    }

    const version = buf.readUInt8(0);
    const paymentHash = buf.subarray(1, 33).toString('hex');
    const tokenId = buf.length > 33 ? buf.subarray(33).toString('utf8') : undefined;

    return { version, paymentHash, tokenId };
}

/**
 * Simple Macaroon implementation for L402
 * 
 * Format: location || identifier || caveats || signature
 * Uses HMAC-SHA256 for signature chaining
 */
export interface SerializedMacaroon {
    location: string;
    identifier: string;    // base64
    caveats: string[];     // caveat predicates
    signature: string;     // hex
}

export class MacaroonService {
    private readonly rootKey: Buffer;
    private readonly location: string;

    /**
     * @param rootKeyHex - 32-byte hex root key (from env), or auto-generate
     * @param location - Macaroon location (e.g., 'daemon.io')
     */
    constructor(rootKeyHex?: string, location = 'daemon.io') {
        if (rootKeyHex) {
            if (rootKeyHex.length !== 64) {
                throw new Error('Root key must be 32 bytes (64 hex characters)');
            }
            this.rootKey = Buffer.from(rootKeyHex, 'hex');
        } else {
            // Auto-generate for development (NOT for production)
            this.rootKey = crypto.randomBytes(32);
            console.warn('[MacaroonService] Auto-generated root key (dev mode)');
        }
        this.location = location;
    }

    /**
     * Mint a new L402 macaroon bound to a payment hash
     * 
     * @param options - Minting options including payment hash
     * @returns Base64-encoded macaroon string
     */
    mint(options: MintOptions): string {
        const { paymentHash, caveats = [], expirySeconds, service } = options;

        // Validate payment hash
        if (paymentHash.length !== MACAROON_CONSTANTS.PAYMENT_HASH_LENGTH) {
            throw new Error(`Invalid payment hash: expected ${MACAROON_CONSTANTS.PAYMENT_HASH_LENGTH} hex chars`);
        }

        // Create identifier
        const identifier: MacaroonIdentifier = {
            version: MACAROON_CONSTANTS.IDENTIFIER_VERSION,
            paymentHash,
            tokenId: crypto.randomBytes(8).toString('hex'),
        };
        const identifierBuf = encodeIdentifier(identifier);

        // Initialize signature with HMAC(root_key, identifier)
        let sig = hmacSha256(this.rootKey, identifierBuf);

        // Build caveat list
        const allCaveats: string[] = [];

        // Add service caveat if provided
        if (service) {
            allCaveats.push(`service = ${service}`);
        }

        // Add expiry caveat
        const expiry = expirySeconds ?? MACAROON_CONSTANTS.DEFAULT_EXPIRY_SECONDS;
        const expiryTime = Math.floor(Date.now() / 1000) + expiry;
        allCaveats.push(`expiry = ${expiryTime}`);

        // Add custom caveats
        for (const caveat of caveats) {
            allCaveats.push(`${caveat.type} = ${caveat.value}`);
        }

        // Chain caveats into signature
        for (const caveat of allCaveats) {
            sig = hmacSha256(sig, Buffer.from(caveat, 'utf8'));
        }

        // Serialize macaroon
        const macaroon: SerializedMacaroon = {
            location: this.location,
            identifier: identifierBuf.toString('base64'),
            caveats: allCaveats,
            signature: sig.toString('hex'),
        };

        return Buffer.from(JSON.stringify(macaroon)).toString('base64');
    }

    /**
     * Verify a macaroon with preimage
     * 
     * @param macaroonB64 - Base64-encoded macaroon
     * @param preimage - 32-byte hex preimage (payment proof)
     * @returns Verification result
     */
    verify(macaroonB64: string, preimage: string): VerifyResult {
        try {
            // Validate preimage format
            if (preimage.length !== MACAROON_CONSTANTS.PREIMAGE_LENGTH) {
                return {
                    valid: false,
                    caveats: [],
                    error: `Invalid preimage: expected ${MACAROON_CONSTANTS.PREIMAGE_LENGTH} hex chars`,
                };
            }

            // Deserialize macaroon
            const macaroonJson = Buffer.from(macaroonB64, 'base64').toString('utf8');
            const macaroon: SerializedMacaroon = JSON.parse(macaroonJson);

            // Decode identifier
            const identifierBuf = Buffer.from(macaroon.identifier, 'base64');
            const identifier = decodeIdentifier(identifierBuf);

            // Verify preimage matches payment hash
            const preimageHash = crypto.createHash('sha256')
                .update(Buffer.from(preimage, 'hex'))
                .digest('hex');

            if (preimageHash !== identifier.paymentHash) {
                return {
                    valid: false,
                    caveats: [],
                    error: 'Preimage does not match payment hash',
                    paymentHash: identifier.paymentHash,
                };
            }

            // Recompute signature
            let sig = hmacSha256(this.rootKey, identifierBuf);
            for (const caveat of macaroon.caveats) {
                sig = hmacSha256(sig, Buffer.from(caveat, 'utf8'));
            }

            // Compare signatures
            if (sig.toString('hex') !== macaroon.signature) {
                return {
                    valid: false,
                    caveats: [],
                    error: 'Signature verification failed',
                    paymentHash: identifier.paymentHash,
                };
            }

            // Parse caveats
            const parsedCaveats: MacaroonCaveat[] = macaroon.caveats.map((c) => {
                const [type, value] = c.split(' = ');
                return { type: type as MacaroonCaveat['type'], value };
            });

            // Verify expiry caveat
            const expiryCaveat = parsedCaveats.find((c) => c.type === 'expiry');
            if (expiryCaveat) {
                const expiryTime = parseInt(expiryCaveat.value, 10);
                if (Date.now() / 1000 > expiryTime) {
                    return {
                        valid: false,
                        caveats: parsedCaveats,
                        error: 'Macaroon has expired',
                        paymentHash: identifier.paymentHash,
                    };
                }
            }

            return {
                valid: true,
                caveats: parsedCaveats,
                paymentHash: identifier.paymentHash,
            };
        } catch (error) {
            return {
                valid: false,
                caveats: [],
                error: `Verification error: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /**
     * Add a first-party caveat to an existing macaroon
     * 
     * @param macaroonB64 - Base64-encoded macaroon
     * @param caveat - Caveat to add
     * @returns New base64-encoded macaroon with caveat
     */
    addCaveat(macaroonB64: string, caveat: MacaroonCaveat): string {
        // Deserialize
        const macaroonJson = Buffer.from(macaroonB64, 'base64').toString('utf8');
        const macaroon: SerializedMacaroon = JSON.parse(macaroonJson);

        // Add caveat
        const caveatStr = `${caveat.type} = ${caveat.value}`;
        macaroon.caveats.push(caveatStr);

        // Update signature by chaining
        const existingSig = Buffer.from(macaroon.signature, 'hex');
        const newSig = hmacSha256(existingSig, Buffer.from(caveatStr, 'utf8'));
        macaroon.signature = newSig.toString('hex');

        return Buffer.from(JSON.stringify(macaroon)).toString('base64');
    }

    /**
     * Extract payment hash from a macaroon without full verification
     * 
     * @param macaroonB64 - Base64-encoded macaroon
     * @returns Payment hash hex string
     */
    extractPaymentHash(macaroonB64: string): string {
        const macaroonJson = Buffer.from(macaroonB64, 'base64').toString('utf8');
        const macaroon: SerializedMacaroon = JSON.parse(macaroonJson);
        const identifierBuf = Buffer.from(macaroon.identifier, 'base64');
        const identifier = decodeIdentifier(identifierBuf);
        return identifier.paymentHash;
    }
}

/** Default singleton instance (reads root key from env) */
let defaultInstance: MacaroonService | null = null;

export function getMacaroonService(): MacaroonService {
    if (!defaultInstance) {
        const rootKey = process.env.L402_SECRET_KEY;
        if (!rootKey) {
            console.warn('[MacaroonService] L402_SECRET_KEY not set, using auto-generated key');
        }
        defaultInstance = new MacaroonService(rootKey);
    }
    return defaultInstance;
}
