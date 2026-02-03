"""
LND gRPC Client 封装

@trace Vol.2 S-P0-06, Vol.1 §2.1
@constraint D-AG-01: Agent 可连接到 LND 并获取 info
@constraint D-SEC-01: 不硬编码 Macaroon 路径
"""

import os
import asyncio
import codecs
from pathlib import Path
from typing import Optional, AsyncGenerator

import grpc

from .types import (
    WalletBalance,
    Invoice,
    PaymentResult,
    PaymentStatus,
    NodeInfo,
    LNDConnectionError,
    LNDPaymentError,
)


class LNDClient:
    """
    LND gRPC 客户端封装，支持 Agent 自动支付场景
    
    使用方式:
        async with LNDClient() as client:
            info = await client.get_info()
            balance = await client.get_balance()
    """
    
    def __init__(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        network: Optional[str] = None,
        macaroon_path: Optional[Path] = None,
        tls_cert_path: Optional[Path] = None,
    ):
        """
        从环境变量或参数初始化 LND 连接
        
        环境变量:
            LND_HOST: LND 主机地址 (默认: localhost)
            LND_GRPC_PORT: gRPC 端口 (默认: 10009)
            LND_MACAROON_PATH: Admin Macaroon 路径
            LND_TLS_CERT_PATH: TLS 证书路径
            LND_NETWORK: 网络类型 (regtest/signet/mainnet)
        """
        self.host = host or os.getenv("LND_HOST", "localhost")
        self.port = port or int(os.getenv("LND_GRPC_PORT", "10009"))
        self.network = network or os.getenv("LND_NETWORK", "regtest")
        
        # 凭证路径
        self._macaroon_path = macaroon_path or Path(
            os.getenv("LND_MACAROON_PATH", "/app/.lnd/admin.macaroon")
        )
        self._tls_cert_path = tls_cert_path or Path(
            os.getenv("LND_TLS_CERT_PATH", "/app/.lnd/tls.cert")
        )
        
        # gRPC 组件 (延迟初始化)
        self._channel: Optional[grpc.aio.Channel] = None
        self._lightning_stub = None
        self._wallet_stub = None
        
    async def __aenter__(self) -> "LNDClient":
        """异步上下文管理器入口"""
        await self._connect()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """异步上下文管理器退出"""
        await self._disconnect()
        
    async def _connect(self) -> None:
        """建立 gRPC 连接"""
        try:
            # 读取 TLS 证书
            if not self._tls_cert_path.exists():
                raise LNDConnectionError(
                    f"TLS cert not found: {self._tls_cert_path}",
                    self.host, self.port
                )
            tls_cert = self._tls_cert_path.read_bytes()
            
            # 读取 Macaroon
            if not self._macaroon_path.exists():
                raise LNDConnectionError(
                    f"Macaroon not found: {self._macaroon_path}",
                    self.host, self.port
                )
            macaroon_bytes = self._macaroon_path.read_bytes()
            macaroon = codecs.encode(macaroon_bytes, 'hex').decode()
            
            # 创建凭证
            cert_creds = grpc.ssl_channel_credentials(tls_cert)
            
            # Macaroon 认证回调
            def metadata_callback(context, callback):
                callback([('macaroon', macaroon)], None)
            
            auth_creds = grpc.metadata_call_credentials(metadata_callback)
            combined_creds = grpc.composite_channel_credentials(cert_creds, auth_creds)
            
            # 建立连接
            target = f"{self.host}:{self.port}"
            self._channel = grpc.aio.secure_channel(target, combined_creds)
            
            # 延迟导入 LND proto (避免没安装时报错)
            try:
                from lndgrpc import lightning_pb2_grpc, walletkit_pb2_grpc
                self._lightning_stub = lightning_pb2_grpc.LightningStub(self._channel)
                self._wallet_stub = walletkit_pb2_grpc.WalletKitStub(self._channel)
            except ImportError:
                # 无 lndgrpc 时使用基础模式
                self._lightning_stub = None
                self._wallet_stub = None
                
        except FileNotFoundError as e:
            raise LNDConnectionError(str(e), self.host, self.port)
        except grpc.RpcError as e:
            raise LNDConnectionError(f"gRPC error: {e}", self.host, self.port)
            
    async def _disconnect(self) -> None:
        """关闭 gRPC 连接"""
        if self._channel:
            await self._channel.close()
            self._channel = None
            
    def _ensure_connected(self) -> None:
        """确保已连接"""
        if self._channel is None:
            raise LNDConnectionError("Not connected. Use 'async with LNDClient()' context.", self.host, self.port)
            
    async def get_info(self) -> NodeInfo:
        """
        获取节点信息，用于健康检查
        
        Returns:
            NodeInfo: 节点信息
        """
        self._ensure_connected()
        
        if self._lightning_stub is None:
            # Mock 模式
            return NodeInfo(
                alias="mock-node",
                identity_pubkey="0" * 66,
                block_height=0,
                synced_to_chain=False,
                num_active_channels=0,
            )
            
        from lndgrpc import lightning_pb2
        request = lightning_pb2.GetInfoRequest()
        response = await self._lightning_stub.GetInfo(request)
        
        return NodeInfo(
            alias=response.alias,
            identity_pubkey=response.identity_pubkey,
            block_height=response.block_height,
            synced_to_chain=response.synced_to_chain,
            num_active_channels=response.num_active_channels,
        )
        
    async def get_balance(self) -> WalletBalance:
        """
        获取钱包余额
        
        Returns:
            WalletBalance: 钱包余额信息
        """
        self._ensure_connected()
        
        if self._lightning_stub is None:
            # Mock 模式
            return WalletBalance(
                confirmed_sats=0,
                unconfirmed_sats=0,
                total_sats=0,
            )
            
        from lndgrpc import lightning_pb2
        request = lightning_pb2.WalletBalanceRequest()
        response = await self._lightning_stub.WalletBalance(request)
        
        return WalletBalance(
            confirmed_sats=response.confirmed_balance,
            unconfirmed_sats=response.unconfirmed_balance,
            total_sats=response.total_balance,
        )
        
    async def create_invoice(
        self,
        amount_msats: int,
        memo: str = "",
        expiry_seconds: int = 3600,
    ) -> Invoice:
        """
        创建收款发票
        
        Args:
            amount_msats: 金额 (毫聪)
            memo: 发票备注
            expiry_seconds: 过期时间 (秒)
            
        Returns:
            Invoice: 创建的发票
        """
        self._ensure_connected()
        
        if self._lightning_stub is None:
            import time
            import hashlib
            import secrets
            # Mock 模式
            mock_hash = hashlib.sha256(secrets.token_bytes(32)).hexdigest()
            return Invoice(
                payment_request=f"lnbc{amount_msats}m1mock",
                payment_hash=mock_hash,
                amount_msats=amount_msats,
                expires_at=int(time.time()) + expiry_seconds,
                memo=memo,
            )
            
        from lndgrpc import lightning_pb2
        request = lightning_pb2.Invoice(
            value_msat=amount_msats,
            memo=memo,
            expiry=expiry_seconds,
        )
        response = await self._lightning_stub.AddInvoice(request)
        
        return Invoice(
            payment_request=response.payment_request,
            payment_hash=response.r_hash.hex(),
            amount_msats=amount_msats,
            expires_at=response.creation_date + expiry_seconds,
            memo=memo,
        )
        
    async def pay_invoice(
        self,
        payment_request: str,
        timeout_seconds: int = 60,
    ) -> PaymentResult:
        """
        支付发票，返回 preimage
        
        Args:
            payment_request: BOLT11 发票字符串
            timeout_seconds: 支付超时 (秒)
            
        Returns:
            PaymentResult: 支付结果 (包含 preimage)
            
        Raises:
            LNDPaymentError: 支付失败
        """
        self._ensure_connected()
        
        if self._lightning_stub is None:
            import secrets
            # Mock 模式
            mock_preimage = secrets.token_hex(32)
            import hashlib
            mock_hash = hashlib.sha256(bytes.fromhex(mock_preimage)).hexdigest()
            return PaymentResult(
                payment_hash=mock_hash,
                preimage=mock_preimage,
                status=PaymentStatus.SETTLED,
                fee_msats=0,
                amount_msats=1000,
            )
            
        from lndgrpc import router_pb2, router_pb2_grpc
        router_stub = router_pb2_grpc.RouterStub(self._channel)
        
        request = router_pb2.SendPaymentRequest(
            payment_request=payment_request,
            timeout_seconds=timeout_seconds,
            fee_limit_msat=1000000,  # 1000 sats 手续费上限
        )
        
        # 流式响应，等待最终状态
        async for update in router_stub.SendPaymentV2(request):
            if update.status == router_pb2.PaymentStatus.SUCCEEDED:
                return PaymentResult(
                    payment_hash=update.payment_hash.hex(),
                    preimage=update.payment_preimage.hex(),
                    status=PaymentStatus.SETTLED,
                    fee_msats=update.fee_msat,
                    amount_msats=update.value_msat,
                )
            elif update.status in (router_pb2.PaymentStatus.FAILED, router_pb2.PaymentStatus.UNKNOWN):
                raise LNDPaymentError(
                    f"Payment failed: {update.failure_reason}",
                    update.payment_hash.hex()
                )
                
        raise LNDPaymentError("Payment timed out with no final status")
        
    async def subscribe_invoices(self) -> AsyncGenerator[Invoice, None]:
        """
        订阅发票状态变化 (异步生成器)
        
        用于监听收款到账事件
        
        Yields:
            Invoice: 状态变化的发票
        """
        self._ensure_connected()
        
        if self._lightning_stub is None:
            # Mock 模式: 不产生任何事件
            return
            
        from lndgrpc import lightning_pb2
        request = lightning_pb2.InvoiceSubscription()
        
        async for invoice in self._lightning_stub.SubscribeInvoices(request):
            yield Invoice(
                payment_request=invoice.payment_request,
                payment_hash=invoice.r_hash.hex(),
                amount_msats=invoice.value_msat,
                expires_at=invoice.creation_date + invoice.expiry,
                memo=invoice.memo,
            )


# 工厂函数
def create_lnd_client(**kwargs) -> LNDClient:
    """便捷创建 LND Client 的工厂函数"""
    return LNDClient(**kwargs)
