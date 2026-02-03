# Daemon L402 Python SDK

Python client for L402 Protocol - Pay-per-call API authentication using Lightning Network.

## Installation

```bash
pip install daemon-l402
```

## Quick Start

```python
import asyncio
from daemon_l402 import L402Client

async def pay_invoice(invoice: str) -> str:
    """Your payment logic - returns preimage"""
    # Use your Lightning wallet to pay
    preimage = await your_wallet.pay(invoice)
    return preimage

async def main():
    async with L402Client(payment_handler=pay_invoice) as client:
        # Automatic 402 handling
        response = await client.get("https://api.example.com/paid-resource")
        print(response.json())

asyncio.run(main())
```

## Features

- ✅ Automatic L402 challenge parsing
- ✅ Custom payment handler callback
- ✅ Async/await support
- ✅ Type hints (Python 3.9+)

## License

MIT
