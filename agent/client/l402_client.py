"""
L402 HTTP Client (Agent 自动支付)

@trace Task-17, Vol.2 S-P0-07, Vol.1 §2.1
@trace Task-H-05: 限额+预警接入
@constraint D-AG-02: Agent 收到 402 后自动支付成功
@constraint D-H-05a: 超限抛出 HourlyLimitExceededError
@constraint D-H-05b: 大额预警触发
@constraint 异步实现 (async/await)
"""

import re
import logging
from typing import Optional, Dict, Any

import httpx

from .types import (
    L402Challenge,
    L402Token,
    L402PaymentFailed,
    L402InvalidChallenge,
    L402AmountExceeded,
    HourlyLimitExceededError,
)
from wallet.lnd_client import LNDClient
from wallet.types import PaymentStatus
from wallet.rate_limiter import get_rate_limiter, RateLimiter
from wallet.alert import get_payment_alert, PaymentAlert

logger = logging.getLogger(__name__)



class L402Client:
    """
    自动处理 HTTP 402 Payment Required 的 HTTP 客户端
    
    使用方式:
        async with L402Client(lnd_client) as client:
            response = await client.get("http://api.example.com/paid-endpoint")
    """
    
    def __init__(
        self,
        lnd_client: LNDClient,
        max_payment_msats: int = 1_000_000,  # 默认最大支付 1000 sats
        retry_on_402: bool = True,
        timeout_seconds: float = 30.0,
        rate_limiter: Optional[RateLimiter] = None,
        payment_alert: Optional[PaymentAlert] = None,
    ):
        """
        初始化 L402 Client
        
        Args:
            lnd_client: LND 客户端实例
            max_payment_msats: 单次支付最大金额限制 (毫聪)
            retry_on_402: 收到 402 后是否自动支付并重试
            timeout_seconds: HTTP 请求超时时间
            rate_limiter: 可选的小时限额器 (D-H-05a)
            payment_alert: 可选的大额预警器 (D-H-05b)
        """
        self.lnd = lnd_client
        self.max_payment_msats = max_payment_msats
        self.retry_on_402 = retry_on_402
        self.timeout_seconds = timeout_seconds
        self._http: Optional[httpx.AsyncClient] = None
        
        # 风控模块 (Task-H-05)
        self.rate_limiter = rate_limiter or get_rate_limiter()
        self.payment_alert = payment_alert or get_payment_alert()

        
    async def __aenter__(self) -> "L402Client":
        """异步上下文管理器入口"""
        self._http = httpx.AsyncClient(timeout=self.timeout_seconds)
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """异步上下文管理器退出"""
        if self._http:
            await self._http.aclose()
            self._http = None
            
    def _ensure_connected(self) -> None:
        """确保 HTTP 客户端已初始化"""
        if self._http is None:
            raise RuntimeError("L402Client not connected. Use 'async with' context.")
            
    async def request(
        self,
        method: str,
        url: str,
        **kwargs,
    ) -> httpx.Response:
        """
        发起 HTTP 请求，自动处理 402 响应
        
        流程:
        1. 发起请求
        2. 如果收到 402，解析 Challenge
        3. 支付 Invoice，获取 Preimage
        4. 携带 L402 Token 重试请求
        
        Args:
            method: HTTP 方法 (GET, POST, etc.)
            url: 请求 URL
            **kwargs: 传递给 httpx 的额外参数
            
        Returns:
            HTTP 响应
            
        Raises:
            L402PaymentFailed: 支付失败
            L402AmountExceeded: 金额超限
        """
        self._ensure_connected()
        
        response = await self._http.request(method, url, **kwargs)
        
        if response.status_code == 402 and self.retry_on_402:
            logger.info(f"Received 402 for {method} {url}, attempting payment")
            
            # 解析 Challenge
            challenge = self._parse_challenge(response)
            
            # 支付并获取 Token
            token = await self._pay_challenge(challenge)
            
            # 携带 Token 重试请求
            headers = (kwargs.get('headers') or {}).copy()
            headers['Authorization'] = token.to_header()
            kwargs['headers'] = headers
            
            logger.info(f"Payment successful, retrying request with L402 token")
            response = await self._http.request(method, url, **kwargs)
            
        return response
        
    async def get(self, url: str, **kwargs) -> httpx.Response:
        """发起 GET 请求"""
        return await self.request('GET', url, **kwargs)
        
    async def post(self, url: str, **kwargs) -> httpx.Response:
        """发起 POST 请求"""
        return await self.request('POST', url, **kwargs)
        
    async def put(self, url: str, **kwargs) -> httpx.Response:
        """发起 PUT 请求"""
        return await self.request('PUT', url, **kwargs)
        
    async def delete(self, url: str, **kwargs) -> httpx.Response:
        """发起 DELETE 请求"""
        return await self.request('DELETE', url, **kwargs)
        
    def _parse_challenge(self, response: httpx.Response) -> L402Challenge:
        """
        解析 402 响应中的 Challenge
        
        Args:
            response: HTTP 402 响应
            
        Returns:
            L402Challenge 对象
            
        Raises:
            L402InvalidChallenge: 无效的 Challenge 格式
        """
        www_auth = response.headers.get('WWW-Authenticate', '')
        
        # 解析格式: L402 macaroon="...", invoice="..."
        macaroon_match = re.search(r'macaroon="([^"]+)"', www_auth)
        invoice_match = re.search(r'invoice="([^"]+)"', www_auth)
        
        if not macaroon_match or not invoice_match:
            raise L402InvalidChallenge(f"Invalid WWW-Authenticate header: {www_auth}")
            
        # 从响应 body 获取额外信息
        payment_hash = ''
        amount_msats = 0
        
        try:
            body = response.json()
            payment_hash = body.get('paymentHash', '')
            amount_msats = body.get('amountMsats', 0)
        except Exception:
            logger.warning("Failed to parse 402 response body")
            
        return L402Challenge(
            macaroon=macaroon_match.group(1),
            invoice=invoice_match.group(1),
            payment_hash=payment_hash,
            amount_msats=amount_msats,
        )
        
    async def _pay_challenge(self, challenge: L402Challenge) -> L402Token:
        """
        支付 Challenge 中的 Invoice
        
        Args:
            challenge: L402 Challenge
            
        Returns:
            L402Token 包含 macaroon 和 preimage
            
        Raises:
            L402AmountExceeded: 金额超限
            L402PaymentFailed: 支付失败
            HourlyLimitExceededError: 小时限额超出 (D-H-05a)
        """
        # 检查单次金额限制
        if challenge.amount_msats > self.max_payment_msats:
            raise L402AmountExceeded(challenge.amount_msats, self.max_payment_msats)
        
        # Task-H-05: 检查小时限额 (D-H-05a)
        if not self.rate_limiter.can_spend(challenge.amount_msats):
            stats = self.rate_limiter.get_stats()
            raise HourlyLimitExceededError(
                requested=challenge.amount_msats,
                limit=stats["limit_msats"],
                spent=stats["spent_msats"],
            )
        
        # Task-H-05: 大额预警检查 (D-H-05b)
        self.payment_alert.check_payment(
            challenge.amount_msats,
            context={
                "payment_hash": challenge.payment_hash,
                "invoice": challenge.invoice[:32] + "...",
            }
        )
            
        logger.info(f"Paying invoice: {challenge.amount_msats} msats")
        
        # 支付 Invoice
        result = await self.lnd.pay_invoice(challenge.invoice)
        
        if result.status != PaymentStatus.SETTLED:

            raise L402PaymentFailed(
                f"Payment failed with status: {result.status}",
                challenge.amount_msats,
            )
            
        logger.info(f"Payment settled, preimage: {result.preimage[:16]}...")
        
        # 记录成功的支出到限额器
        self.rate_limiter.record_spend(challenge.amount_msats)
        
        return L402Token(
            macaroon=challenge.macaroon,
            preimage=result.preimage,
        )



async def create_l402_client(
    max_payment_msats: int = 1_000_000,
    **lnd_kwargs,
) -> L402Client:
    """
    便捷创建 L402 Client 的工厂函数
    
    Args:
        max_payment_msats: 单次支付最大金额限制
        **lnd_kwargs: 传递给 LNDClient 的参数
        
    Returns:
        已配置的 L402Client 实例
    """
    from wallet.lnd_client import create_lnd_client
    lnd = create_lnd_client(**lnd_kwargs)
    return L402Client(lnd, max_payment_msats=max_payment_msats)
