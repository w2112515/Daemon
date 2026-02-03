"""
L402 HTTP Client

@trace Task-P1-01, Vol.2 §2.4
@constraint D-SDK-02: Python 导入成功
@constraint D-SDK-03: 单元测试通过
"""

import re
import logging
from typing import Optional, Callable, Awaitable, Any, Dict

import httpx

from .types import (
    L402Challenge,
    L402Credential,
    L402InvalidChallenge,
    L402PaymentFailed,
)

logger = logging.getLogger(__name__)

# Type alias for payment handler callback
PaymentHandler = Callable[[str], Awaitable[str]]


class L402Client:
    """
    HTTP Client with automatic L402 payment handling
    
    Usage:
        async def pay_invoice(invoice: str) -> str:
            # Your payment logic here
            return preimage
        
        async with L402Client(payment_handler=pay_invoice) as client:
            response = await client.get("https://api.example.com/paid-resource")
    """
    
    def __init__(
        self,
        payment_handler: PaymentHandler,
        max_retries: int = 1,
        timeout: float = 30.0,
    ):
        """
        Initialize L402 Client
        
        Args:
            payment_handler: Async function that pays an invoice and returns preimage
            max_retries: Max payment retry attempts (default: 1)
            timeout: HTTP request timeout in seconds
        """
        self.payment_handler = payment_handler
        self.max_retries = max_retries
        self.timeout = timeout
        self._http: Optional[httpx.AsyncClient] = None
        
    async def __aenter__(self) -> "L402Client":
        """Async context manager entry"""
        self._http = httpx.AsyncClient(timeout=self.timeout)
        return self
        
    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit"""
        if self._http:
            await self._http.aclose()
            self._http = None
            
    def _ensure_connected(self) -> None:
        """Ensure HTTP client is initialized"""
        if self._http is None:
            raise RuntimeError("L402Client not connected. Use 'async with' context.")
            
    async def request(
        self,
        method: str,
        url: str,
        **kwargs: Any,
    ) -> httpx.Response:
        """
        Make an HTTP request with automatic L402 handling
        
        Flow:
        1. Send request
        2. If 402, parse challenge
        3. Pay invoice via payment_handler
        4. Retry with L402 credential
        
        Args:
            method: HTTP method
            url: Request URL
            **kwargs: Additional httpx arguments
            
        Returns:
            HTTP response
            
        Raises:
            L402InvalidChallenge: Invalid challenge format
            L402PaymentFailed: Payment failed
        """
        self._ensure_connected()
        assert self._http is not None
        
        response = await self._http.request(method, url, **kwargs)
        
        if response.status_code == 402:
            logger.info(f"Received 402 for {method} {url}, attempting payment")
            
            # Parse challenge
            challenge = self._parse_challenge(response)
            
            # Pay and get credential
            credential = await self._pay_challenge(challenge)
            
            # Retry with credential
            headers = dict(kwargs.get('headers') or {})
            headers['Authorization'] = credential.to_header()
            kwargs['headers'] = headers
            
            logger.info("Payment successful, retrying request")
            response = await self._http.request(method, url, **kwargs)
            
        return response
        
    async def get(self, url: str, **kwargs: Any) -> httpx.Response:
        """GET request"""
        return await self.request('GET', url, **kwargs)
        
    async def post(self, url: str, **kwargs: Any) -> httpx.Response:
        """POST request"""
        return await self.request('POST', url, **kwargs)
        
    async def put(self, url: str, **kwargs: Any) -> httpx.Response:
        """PUT request"""
        return await self.request('PUT', url, **kwargs)
        
    async def delete(self, url: str, **kwargs: Any) -> httpx.Response:
        """DELETE request"""
        return await self.request('DELETE', url, **kwargs)
        
    def _parse_challenge(self, response: httpx.Response) -> L402Challenge:
        """
        Parse L402 challenge from 402 response
        
        Args:
            response: HTTP 402 response
            
        Returns:
            L402Challenge object
            
        Raises:
            L402InvalidChallenge: Invalid challenge format
        """
        www_auth = response.headers.get('WWW-Authenticate', '')
        
        # Parse format: L402 macaroon="...", invoice="..."
        macaroon_match = re.search(r'macaroon="([^"]+)"', www_auth)
        invoice_match = re.search(r'invoice="([^"]+)"', www_auth)
        
        if not macaroon_match or not invoice_match:
            raise L402InvalidChallenge(f"Invalid WWW-Authenticate header: {www_auth}")
            
        # Extract additional info from body (optional)
        payment_hash = ''
        amount_msats = 0
        
        try:
            body = response.json()
            payment_hash = body.get('paymentHash', '')
            amount_msats = body.get('amountMsats', 0)
        except Exception:
            logger.debug("Failed to parse 402 response body")
            
        return L402Challenge(
            macaroon=macaroon_match.group(1),
            invoice=invoice_match.group(1),
            payment_hash=payment_hash,
            amount_msats=amount_msats,
        )
        
    async def _pay_challenge(self, challenge: L402Challenge) -> L402Credential:
        """
        Pay challenge invoice
        
        Args:
            challenge: L402 challenge
            
        Returns:
            L402Credential with macaroon and preimage
            
        Raises:
            L402PaymentFailed: Payment failed
        """
        logger.info(f"Paying invoice: {challenge.amount_msats} msats")
        
        try:
            preimage = await self.payment_handler(challenge.invoice)
        except Exception as e:
            raise L402PaymentFailed(
                f"Payment failed: {e}",
                challenge.amount_msats,
            )
            
        if not preimage or len(preimage) != 64:
            raise L402PaymentFailed(
                f"Invalid preimage returned: expected 64 hex chars",
                challenge.amount_msats,
            )
            
        logger.info(f"Payment successful, preimage: {preimage[:16]}...")
        
        return L402Credential(
            macaroon=challenge.macaroon,
            preimage=preimage,
        )
