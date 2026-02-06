# Daemon — Pitch Deck

> The Payment Rail for the Machine Economy

---

## Slide 1: The Problem

**AI agents can't pay for anything.**

- 1B+ AI agent API calls per day (and growing exponentially)
- Every call requires a human to sign up, generate a key, manage billing
- No bank account. No credit card. No KYC. Agents are second-class internet citizens.

**The bottleneck isn't intelligence — it's commerce.**

---

## Slide 2: The Solution — Two Sides, One Protocol

**For API Providers (Supply):**
```bash
# Monetize any API in one command — no Stripe, no billing, no accounts
UPSTREAM_URL=https://your-api.com  npx @daemon/l402-proxy
```

**For AI Agents (Demand):**
```python
async with L402Client(wallet) as client:
    data = await client.get("https://paid-api.com/data")  # auto-pays on 402
```

**The L402 Handshake:**
```
Agent Request  →  HTTP 402 + Invoice  →  ⚡ Lightning Payment  →  HTTP 200 OK
```

**No signup. No API key. No monthly bill. Just Bitcoin Lightning.**

---

## Slide 3: Why Bitcoin Lightning?

| Traditional Payments | Daemon (Lightning) |
|---|---|
| Identity required (KYC) | Permissionless |
| Settlement in days | Settlement in ~50ms |
| Minimum $1+ fees | 1 satoshi ($0.001) |
| Human signs up | Machine-native |
| Provider can freeze | Censorship-resistant |

**L402** is the HTTP-native payment protocol — using the `402 Payment Required` status code that HTTP reserved since 1997. Bitcoin Lightning finally makes it real.

---

## Slide 4: What We Built

**Full-stack L402 implementation — not a prototype.**

| Component | Status |
|---|---|
| L402 Gateway (Express/TS) | Production-ready with 6 security middlewares |
| Python Agent Client | Auto-pay on 402, budget rails, rate limiting |
| Python SDK | `pip install daemon-l402` |
| TypeScript SDK | `npm install @daemon/sdk` |
| MCP SDK | Model Context Protocol integration |
| ElizaOS Plugin | Agent framework plugin |
| HTTP Proxy | Drop-in zero-code L402 for existing APIs |
| Fleet Observer Dashboard | Real-time Next.js monitoring UI |
| Docker Compose | One-command full stack deployment |

**Security built-in:** Budget Rails, Allowlist, Circuit Breakers, Replay Protection, Rate Limiting, Root Key Rotation.

---

## Slide 5: Market & Traction

**TAM:** $15B — AI API consumption market (2025, growing 40% YoY)

**SAM:** $1.5B — Bitcoin-native AI payment infrastructure (10% of TAM)

**Beachhead:** Developer SDKs on NPM/PyPI targeting the first 100 agent developers building on Lightning.

**Competitive Landscape:**
- **x402 (Coinbase):** Stablecoin-based, custodial, requires Coinbase account. Not machine-native.
- **Traditional API keys:** Human-dependent, subscription-based, identity-required.
- **Daemon:** Permissionless, instant, sub-cent, truly machine-to-machine.

**Go-to-Market:**
1. **Supply side first** — L402 Proxy lets any developer monetize an API in one command
2. **Demand follows** — Agents discover paid APIs, use SDK to auto-pay
3. **Flywheel** — More paid APIs → more agents adopt L402 → more APIs join

**Ask:** BitcoinFi Accelerator funding to:
1. Publish L402 Proxy + SDKs on NPM / PyPI
2. Onboard 10 indie API providers (supply seeding)
3. Acquire first 100 agent developers (demand generation)

---

<p align="center"><i>Daemon — Let machines pay like machines.</i></p>
