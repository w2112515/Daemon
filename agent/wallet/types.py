"""
LND gRPC Client 类型定义

@trace Vol.2 S-P0-06, Vol.1 §2.1
@constraint D-AG-01: Agent 可连接到 LND 并获取 info
"""

from pydantic import BaseModel
from typing import Optional
from enum import Enum


class PaymentStatus(str, Enum):
    """支付状态枚举"""
    PENDING = "pending"
    IN_FLIGHT = "in_flight"
    SETTLED = "settled"
    FAILED = "failed"


class WalletBalance(BaseModel):
    """钱包余额信息"""
    confirmed_sats: int
    unconfirmed_sats: int
    total_sats: int
    
    @property
    def available_sats(self) -> int:
        """可用余额 (仅确认部分)"""
        return self.confirmed_sats


class Invoice(BaseModel):
    """闪电网络发票"""
    payment_request: str   # bolt11 编码
    payment_hash: str      # hex, 32 bytes
    amount_msats: int      # 毫聪 (1 sat = 1000 msats)
    expires_at: int        # unix timestamp
    memo: Optional[str] = None
    
    @property
    def amount_sats(self) -> int:
        """金额 (聪)"""
        return self.amount_msats // 1000


class PaymentResult(BaseModel):
    """支付结果"""
    payment_hash: str
    preimage: str          # 支付证明 (32 bytes hex)
    status: PaymentStatus
    fee_msats: int
    amount_msats: int


class NodeInfo(BaseModel):
    """LND 节点信息"""
    alias: str
    identity_pubkey: str   # 节点公钥
    block_height: int
    synced_to_chain: bool
    num_active_channels: int


class LNDConnectionError(Exception):
    """LND 连接错误"""
    def __init__(self, message: str, host: str = "", port: int = 0):
        self.host = host
        self.port = port
        super().__init__(f"LND Connection Error [{host}:{port}]: {message}")


class LNDPaymentError(Exception):
    """LND 支付错误"""
    def __init__(self, message: str, payment_hash: str = ""):
        self.payment_hash = payment_hash
        super().__init__(f"LND Payment Error: {message}")
