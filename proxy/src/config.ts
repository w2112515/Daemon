/**
 * L402 Proxy Configuration
 * 
 * @trace Vol.2 §2.5 S-P1-04
 * @constraint D-ECO-01~03
 */

export interface ProxyConfig {
    /** Upstream API URL to proxy requests to */
    upstreamUrl: string;
    /** Price per request in millisatoshis */
    pricePerRequest: number;
    /** Price memo/description */
    priceMemo: string;
    /** Port to listen on */
    port: number;
    /** L402 secret for macaroon signing */
    l402Secret: string;
    /** LND connection mode */
    lndMode: 'mock' | 'real';
    /** LND REST URL (for real mode) */
    lndRestUrl?: string;
    /** LND Macaroon (for real mode) */
    lndMacaroon?: string;
    /** Paths to skip L402 protection */
    skipPaths: string[];
}

function getEnv(key: string, defaultValue?: string): string {
    const value = process.env[key];
    if (value === undefined && defaultValue === undefined) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value ?? defaultValue!;
}

function getEnvNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    return value ? parseInt(value, 10) : defaultValue;
}

export function loadConfig(): ProxyConfig {
    return {
        upstreamUrl: getEnv('UPSTREAM_URL'),
        pricePerRequest: getEnvNumber('PRICE_PER_REQUEST', 1000),
        priceMemo: getEnv('PRICE_MEMO', 'L402 Proxy API Call'),
        port: getEnvNumber('PORT', 8402),
        l402Secret: getEnv('L402_SECRET', 'l402-proxy-default-secret'),
        lndMode: (getEnv('LND_MODE', 'mock') as 'mock' | 'real'),
        lndRestUrl: process.env.LND_REST_URL,
        lndMacaroon: process.env.LND_MACAROON,
        skipPaths: (process.env.SKIP_PATHS ?? '/health,/info').split(',').map(s => s.trim()),
    };
}
