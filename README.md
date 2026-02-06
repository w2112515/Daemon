# Daemon

> **AI agents pay for any API with Bitcoin Lightning — no keys, no accounts, no monthly bills.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bitcoin](https://img.shields.io/badge/Bitcoin-Lightning-orange.svg)](https://lightning.network/)
[![L402](https://img.shields.io/badge/Protocol-L402-purple.svg)](https://docs.lightning.engineering/the-lightning-network/l402)
[![Track](https://img.shields.io/badge/Track-Bitcoin%20%2B%20Stablecoins-blue.svg)](#)

---

## The Problem

AI agents are the fastest-growing class of internet users — but they can't pay for anything. No bank account, no credit card, no KYC. Every API requires a human to sign up, generate a key, and manage billing.

## The Solution

Daemon implements the **L402 protocol** to turn HTTP `402 Payment Required` into a real payment flow. An agent sends satoshis over Lightning, and gets data back. Zero config.

```
Agent Request  ──→  HTTP 402 + Invoice  ──→  Lightning Payment  ──→  HTTP 200 OK
                    "Pay 1 sat"               ~50ms settlement       "Here's your data"
```

---

## Live Demo

```bash
# Clone and run the interactive demo
git clone https://github.com/anthropics/daemon && cd daemon
cd gateway && npm install && npm run dev

# In another terminal — watch the full L402 handshake
.\scripts\demo-l402.ps1          # Windows
```

The demo shows the complete flow: **Request → 402 → Pay → 200** in under 3 seconds.

<!-- TODO: Add link to 1-min demo video -->

---

## Monetize Any API in One Command

**For API providers:** Daemon's L402 Proxy wraps any existing HTTP API with pay-per-call micropayments — no code changes required.

```bash
# Turn any API into a paid API
UPSTREAM_URL=https://your-api.com  npx @daemon/l402-proxy

# That's it. Agents now pay 1 sat per call to access your API.
# curl http://localhost:8402/your-endpoint  →  402 Payment Required
```

**No Stripe. No billing dashboard. No user accounts to manage.** Just point the proxy at your API and start earning sats.

| You are... | How you use Daemon |
|---|---|
| **API provider** | Deploy L402 Proxy in front of your API → earn sats per call |
| **Agent developer** | Use Python/TS SDK → your agent auto-pays on 402 |
| **Framework author** | Integrate Eliza Plugin or MCP SDK → L402 built into your stack |

---

## Why Bitcoin Lightning?

| | Daemon (L402 + Lightning) | x402 (Coinbase) | Traditional API Keys |
|---|---|---|---|
| **Identity required** | None | Coinbase account | Email + KYC |
| **Settlement** | ~50ms (Lightning) | Minutes (on-chain) | 30-day invoice |
| **Minimum payment** | 1 satoshi (~$0.001) | Gas fees apply | Monthly minimum |
| **Machine-native** | Yes — no human in the loop | Custodial wallet | Human signs up |
| **Censorship risk** | Permissionless | Coinbase can freeze | Provider can revoke |

**L402 is the HTTP-native payment protocol.** It uses the `402 Payment Required` status code that HTTP reserved since 1997 — finally giving it a real implementation with Bitcoin Lightning.

---

## How It Works

```
┌──────────┐         ┌───────────────┐         ┌──────────┐
│ AI Agent │ ──(1)──→│ L402 Gateway  │──(2)───→│ Service  │
│          │         │               │         │          │
│          │←─(3)────│ 402 + Invoice │         │          │
│          │         │ + Macaroon    │         │          │
│          │         └───────────────┘         │          │
│          │                                    │          │
│          │──(4)──→ Lightning Network ─────→   │          │
│          │←─(5)──  Preimage (proof)           │          │
│          │                                    │          │
│          │──(6)──→ L402 Token ──────────────→│          │
│          │←─(7)────────────── 200 OK ────────│          │
└──────────┘                                    └──────────┘
```

1. Agent requests a protected endpoint
2. Gateway returns `402` with a Lightning invoice and a Macaroon
3. Agent pays the invoice (~1 sat, ~50ms)
4. Agent gets a preimage (cryptographic proof of payment)
5. Agent constructs an L402 token (Macaroon + Preimage)
6. Gateway verifies the token and serves the response

---

## Safety Controls

Daemon is designed for **human-supervised autonomy** — agents act freely within guardrails set by operators.

| Control | Description |
|---------|-------------|
| **Budget Rails** | Hard spending caps per agent. Agents cannot exceed the budget. |
| **Allowlist** | Whitelist of permitted services. Unknown endpoints are blocked. |
| **Circuit Breakers** | Auto-halt on anomalies (consecutive failures, unusual patterns). |
| **Replay Protection** | Each payment proof is single-use. Replay attacks are rejected. |
| **Rate Limiting** | Per-client sliding window with Redis-backed distributed state. |
| **Root Key Rotation** | Macaroon signing keys rotate automatically; old tokens honored during grace period. |

---

## Architecture

```
daemon/
├─ gateway/            # L402 Payment Gateway (Express + TypeScript)
│  ├─ middlewares/     # L402, Circuit Breaker, Replay, Rate Limit, Allowlist
│  ├─ controllers/     # LND invoice generation
│  └─ utils/           # Macaroon service, Root Key rotation, Redis
├─ agent/              # AI Agent client (Python)
│  ├─ client/          # L402 HTTP client (auto-pay on 402)
│  └─ wallet/          # LND wallet wrapper + rate limiter + alerts
├─ sdk/
│  ├─ python/          # Python SDK — pip install daemon-l402
│  ├─ ts/              # TypeScript SDK — npm install @daemon/sdk
│  └─ mcp/             # Model Context Protocol SDK
├─ plugins/
│  └─ eliza/           # ElizaOS plugin for agent frameworks
├─ proxy/              # Drop-in HTTP proxy (zero-code L402)
├─ dashboard/          # Fleet Observer (Next.js real-time UI)
└─ docker-compose.yml  # Full stack: LND + Bitcoin + Gateway + Agent + DB
```

## Tech Stack

| Layer | Technology | Role |
|-------|------------|------|
| Settlement | Bitcoin (Regtest / Signet / Mainnet) | Base layer |
| Payment | LND (Lightning Network Daemon) | Instant micropayments |
| Protocol | L402 (Macaroon + Lightning) | Auth-payment fusion |
| Gateway | Express + TypeScript | API gateway with L402 middleware |
| Agent | Python + httpx | Auto-paying HTTP client |
| Dashboard | Next.js + React | Real-time fleet monitoring |
| Infra | Docker Compose, PostgreSQL, Redis | Production-ready stack |

---

## SDK — 3 Lines to Integrate

**Python**
```python
from daemon_l402 import L402Client

async with L402Client(lnd_client) as client:
    response = await client.get("https://api.example.com/data")  # auto-pays on 402
```

**TypeScript**
```typescript
import { L402Client } from '@daemon/sdk';

const client = new L402Client({ lndConnect: process.env.LND_CONNECT });
const res = await client.fetch('https://api.example.com/data'); // auto-pays on 402
```

---

## Links

- [L402 Protocol Spec](https://docs.lightning.engineering/the-lightning-network/l402) — Lightning Labs
- [LND](https://github.com/lightningnetwork/lnd) — Lightning Network Daemon
- [HTTP 402](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402) — The status code reserved for digital payments since 1997

---

## License

MIT

---

<p align="center">
  <b>Daemon — The Payment Rail for the Machine Economy</b><br>
  <i>Built on Bitcoin for <a href="#">Build on Bitcoin Hackathon</a> (Yale Blockchain Club)</i>
</p>
