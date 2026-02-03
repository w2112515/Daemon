# Daemon L402 TypeScript SDK

TypeScript/JavaScript client for L402 Protocol - Pay-per-call API authentication using Lightning Network.

## Installation

```bash
npm install @daemon/l402-client
```

## Quick Start

```typescript
import { L402Client } from '@daemon/l402-client';

const client = new L402Client({
  paymentHandler: async (invoice) => {
    // Your payment logic - returns preimage
    const preimage = await wallet.pay(invoice);
    return preimage;
  }
});

// Automatic 402 handling
const response = await client.get('https://api.example.com/paid-resource');
console.log(await response.json());
```

## Features

- ✅ Automatic L402 challenge parsing
- ✅ Custom payment handler callback  
- ✅ Zero external dependencies (native fetch)
- ✅ ESM + CJS support
- ✅ Full TypeScript types
- ✅ Node.js 18+ / Browser compatible

## API

### L402Client

```typescript
const client = new L402Client({
  paymentHandler: (invoice: string) => Promise<string>,
  maxRetries?: number,  // default: 1
  timeout?: number,     // default: 30000ms
});

// HTTP methods
await client.request(url, options);
await client.get(url, options);
await client.post(url, options);
await client.put(url, options);
await client.delete(url, options);
```

## License

MIT
