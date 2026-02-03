# @daemon/eliza-l402

Eliza plugin for L402 pay-per-call API payments.

## Installation

```bash
npm install @daemon/eliza-l402
```

## Usage

```typescript
import { elizaL402Plugin, configureL402Plugin } from '@daemon/eliza-l402';
import { AgentRuntime } from '@elizaos/core';

// Configure the plugin with your payment handler
configureL402Plugin({
    paymentHandler: async (invoice: string) => {
        // Pay the invoice using your wallet
        const preimage = await yourWallet.pay(invoice);
        return preimage;
    }
});

// Add to your agent
const agent = new AgentRuntime({
    plugins: [elizaL402Plugin]
});
```

## Actions

### PAY_L402_INVOICE

Pays a Lightning invoice and returns the preimage.

```typescript
// User message
{ text: "Pay this invoice: lnbc100n1p..." }

// Agent response
{ text: "Payment successful. Preimage: abcdef..." }
```

### REQUEST_WITH_L402

Makes an HTTP request with automatic L402 payment handling.

```typescript
// User message
{ url: "https://api.example.com/paid-endpoint" }

// Agent response
{ text: "Request completed. Status: 200" }
```

## License

MIT
