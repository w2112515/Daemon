/**
 * @daemon/l402-mcp - MCP L402 SDK Entry Point
 * 
 * Pay-per-call middleware for Model Context Protocol servers
 * 
 * @trace Vol.2 §2.5 S-P1-06
 * @constraint D-ECO-06: Demo Server 可运行
 * 
 * @example
 * ```typescript
 * import { l402Middleware, fixedPricing, mockInvoiceGenerator, mockMacaroonMinter, mockCredentialVerifier } from '@daemon/l402-mcp';
 * import express from 'express';
 * 
 * const app = express();
 * 
 * app.use(l402Middleware({
 *     getPricing: fixedPricing(1000, 'API Call'),
 *     createInvoice: mockInvoiceGenerator(),
 *     mintMacaroon: mockMacaroonMinter(),
 *     verifyCredential: mockCredentialVerifier(),
 *     skipPaths: ['/health'],
 * }));
 * 
 * app.get('/protected', (req, res) => {
 *     res.json({ message: 'Paid access granted!' });
 * });
 * 
 * app.listen(3000);
 * ```
 */

// Core middleware
export { l402Middleware } from './middleware';

// Pricing strategies
export { fixedPricing, methodBasedPricing } from './middleware';

// Mock implementations (for demo/testing)
export {
    mockInvoiceGenerator,
    mockMacaroonMinter,
    mockCredentialVerifier,
} from './middleware';

// Types
export type {
    L402MiddlewareConfig,
    L402Pricing,
    L402Invoice,
    L402VerifyResult,
    L402TokenParsed,
    L402RequestContext,
    L402ErrorResponse,
} from './types';

// Transport layer (Phase 2)
export {
    createTransport,
    createStdioTransport,
    createSSETransport,
    getRecommendedTransportType,
    isStdioTransport,
    isSSETransport,
} from './transport';

export type {
    TransportType,
    TransportFactoryConfig,
    SSETransportConfig,
    StdioTransportConfig,
} from './transport';
