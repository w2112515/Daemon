# @daemon/l402-mcp

> MCP L402 SDK - Pay-per-call middleware for Model Context Protocol servers

[![npm version](https://img.shields.io/npm/v/@daemon/l402-mcp.svg)](https://www.npmjs.com/package/@daemon/l402-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Quick Start

```bash
# Run the demo server
npx @daemon/l402-mcp demo

# Or install and use in your project
npm install @daemon/l402-mcp
```

## 📖 Overview

This SDK provides Express middleware for adding L402 (Lightning HTTP 402) authentication to your MCP (Model Context Protocol) servers. Enable pay-per-call API access with Bitcoin Lightning payments.

## 🔧 Installation

```bash
npm install @daemon/l402-mcp
# or
pnpm add @daemon/l402-mcp
# or
yarn add @daemon/l402-mcp
```

## 💡 Usage

### Basic Usage with Mock (Demo/Testing)

```typescript
import express from 'express';
import {
    l402Middleware,
    fixedPricing,
    mockInvoiceGenerator,
    mockMacaroonMinter,
    mockCredentialVerifier,
} from '@daemon/l402-mcp';

const app = express();

// Apply L402 middleware
app.use('/api', l402Middleware({
    getPricing: fixedPricing(1000, 'API Call'),  // 1000 msats
    createInvoice: mockInvoiceGenerator(),
    mintMacaroon: mockMacaroonMinter(),
    verifyCredential: mockCredentialVerifier(),
    skipPaths: ['/health'],
}));

// Protected endpoint
app.get('/api/data', (req, res) => {
    res.json({
        message: 'Paid access granted!',
        paymentHash: req.l402?.paymentHash,
    });
});

app.listen(3000);
```

### Production Usage with LND

```typescript
import {
    l402Middleware,
    fixedPricing,
    L402MiddlewareConfig,
} from '@daemon/l402-mcp';

// Production config with real LND node
const config: L402MiddlewareConfig = {
    getPricing: fixedPricing(1000, 'MCP API Call'),
    createInvoice: async (amountMsats, memo) => {
        // Call your LND node to create invoice
        const invoice = await yourLndClient.addInvoice({ value_msat: amountMsats, memo });
        return {
            paymentRequest: invoice.payment_request,
            paymentHash: invoice.r_hash.toString('hex'),
        };
    },
    mintMacaroon: (paymentHash) => {
        // Use your macaroon service
        return yourMacaroonService.mint({ paymentHash });
    },
    verifyCredential: (macaroon, preimage) => {
        // Verify with your macaroon service
        return yourMacaroonService.verify(macaroon, preimage);
    },
    skipPaths: ['/health', '/info'],
    service: 'my-mcp-server',
};

app.use('/api', l402Middleware(config));
```

## 📚 API Reference

### `l402Middleware(config)`

Creates Express middleware for L402 authentication.

**Config Options:**

| Option | Type | Description |
|--------|------|-------------|
| `getPricing` | `(req) => Promise<L402Pricing>` | Returns price for the request |
| `createInvoice` | `(amount, memo) => Promise<L402Invoice>` | Creates Lightning invoice |
| `mintMacaroon` | `(paymentHash) => Promise<string>` | Mints authentication macaroon |
| `verifyCredential` | `(macaroon, preimage) => L402VerifyResult` | Verifies L402 credential |
| `skipPaths` | `string[]` | Paths to skip authentication |
| `service` | `string` | Service name for macaroon |

### Pricing Strategies

```typescript
// Fixed price for all requests
fixedPricing(1000, 'API Call')

// Price based on HTTP method
methodBasedPricing({
    GET: 500,
    POST: 1500,
}, 1000)  // default: 1000
```

### Mock Implementations (Demo/Testing)

```typescript
mockInvoiceGenerator()      // Creates mock invoices
mockMacaroonMinter(secret)  // Creates mock macaroons
mockCredentialVerifier(secret)  // Mock verification
```

## 🔐 L402 Protocol

The middleware implements the L402 protocol:

1. **Challenge**: Unauthenticated requests receive `402 Payment Required` with:
   - `WWW-Authenticate: L402 macaroon="...", invoice="..."`

2. **Payment**: Client pays the Lightning invoice and receives preimage

3. **Access**: Client sends `Authorization: L402 <macaroon>:<preimage>`

4. **Verification**: Middleware validates credential and grants access

## 🧪 Running Tests

```bash
npm test
```

## 📄 License

MIT © Daemon Team
