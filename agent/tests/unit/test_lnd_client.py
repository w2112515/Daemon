"""
LND Client Unit Tests

@trace Task-09 Spec: Verification
@tests get_info(), get_balance(), create_invoice(), connection error handling
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from pathlib import Path

from wallet.types import (
    WalletBalance,
    Invoice,
    PaymentResult,
    PaymentStatus,
    NodeInfo,
    LNDConnectionError,
)
from wallet.lnd_client import LNDClient


class TestLNDClientInitialization:
    """LND Client 初始化测试"""
    
    def test_default_values_from_env(self, monkeypatch):
        """应从环境变量读取默认值"""
        monkeypatch.setenv("LND_HOST", "custom-host")
        monkeypatch.setenv("LND_GRPC_PORT", "10010")
        monkeypatch.setenv("LND_NETWORK", "signet")
        
        client = LNDClient()
        
        assert client.host == "custom-host"
        assert client.port == 10010
        assert client.network == "signet"
        
    def test_explicit_params_override_env(self, monkeypatch):
        """显式参数应覆盖环境变量"""
        monkeypatch.setenv("LND_HOST", "env-host")
        
        client = LNDClient(host="explicit-host", port=12345)
        
        assert client.host == "explicit-host"
        assert client.port == 12345


class TestLNDClientMockMode:
    """LND Client Mock 模式测试 (无真实 LND 连接)"""
    
    @pytest.fixture
    def mock_client(self, tmp_path):
        """创建带 Mock 凭证的客户端"""
        # 创建假凭证文件
        macaroon_path = tmp_path / "admin.macaroon"
        macaroon_path.write_bytes(b"mock_macaroon_data")
        
        tls_path = tmp_path / "tls.cert"
        tls_path.write_bytes(b"mock_tls_cert")
        
        return LNDClient(
            host="localhost",
            port=10009,
            macaroon_path=macaroon_path,
            tls_cert_path=tls_path,
        )
        
    @pytest.mark.asyncio
    async def test_get_info_returns_node_info(self, mock_client):
        """get_info() 应返回包含 block_height 的 NodeInfo"""
        # Mock gRPC 组件
        mock_client._channel = MagicMock()
        mock_client._lightning_stub = None  # 触发 Mock 模式
        
        info = await mock_client.get_info()
        
        assert isinstance(info, NodeInfo)
        assert hasattr(info, 'block_height')
        assert hasattr(info, 'identity_pubkey')
        
    @pytest.mark.asyncio
    async def test_get_balance_returns_wallet_balance(self, mock_client):
        """get_balance() 应返回 WalletBalance 对象"""
        mock_client._channel = MagicMock()
        mock_client._lightning_stub = None
        
        balance = await mock_client.get_balance()
        
        assert isinstance(balance, WalletBalance)
        assert balance.confirmed_sats >= 0
        assert balance.total_sats >= 0
        
    @pytest.mark.asyncio
    async def test_create_invoice_returns_invoice(self, mock_client):
        """create_invoice() 应返回包含 payment_request 的 Invoice"""
        mock_client._channel = MagicMock()
        mock_client._lightning_stub = None
        
        invoice = await mock_client.create_invoice(
            amount_msats=10000,
            memo="Test invoice",
        )
        
        assert isinstance(invoice, Invoice)
        assert invoice.payment_request
        assert len(invoice.payment_hash) == 64  # 32 bytes hex


class TestLNDClientErrors:
    """LND Client 错误处理测试"""
    
    def test_connection_error_when_not_connected(self):
        """未连接时调用应抛出 LNDConnectionError"""
        client = LNDClient()
        
        with pytest.raises(LNDConnectionError) as exc_info:
            client._ensure_connected()
            
        assert "Not connected" in str(exc_info.value)
        
    @pytest.mark.asyncio
    async def test_connection_error_on_missing_tls_cert(self, tmp_path):
        """TLS 证书缺失应抛出 LNDConnectionError"""
        macaroon_path = tmp_path / "admin.macaroon"
        macaroon_path.write_bytes(b"mock")
        
        client = LNDClient(
            macaroon_path=macaroon_path,
            tls_cert_path=tmp_path / "nonexistent.cert",
        )
        
        with pytest.raises(LNDConnectionError) as exc_info:
            await client._connect()
            
        assert "TLS cert not found" in str(exc_info.value)
        
    @pytest.mark.asyncio
    async def test_connection_error_on_missing_macaroon(self, tmp_path):
        """Macaroon 缺失应抛出 LNDConnectionError"""
        tls_path = tmp_path / "tls.cert"
        tls_path.write_bytes(b"mock")
        
        client = LNDClient(
            macaroon_path=tmp_path / "nonexistent.macaroon",
            tls_cert_path=tls_path,
        )
        
        with pytest.raises(LNDConnectionError) as exc_info:
            await client._connect()
            
        assert "Macaroon not found" in str(exc_info.value)


class TestYieldInterface:
    """Yield 接口测试"""
    
    def test_yield_config_defaults_to_disabled(self):
        """YieldConfig 默认应禁用"""
        from wallet.yield_interface import YieldConfig
        
        config = YieldConfig()
        
        assert config.enabled is False
        
    def test_yield_estimate_has_disclaimer(self):
        """YieldEstimate 应包含风险声明"""
        from wallet.yield_interface import YieldEstimate
        
        estimate = YieldEstimate.lightning_routing()
        
        assert estimate.disclaimer
        assert "不构成预期或承诺" in estimate.disclaimer
        
    @pytest.mark.asyncio
    async def test_optimize_raises_not_implemented(self):
        """Phase 0 中 optimize 应抛出 NotImplementedError"""
        from wallet.yield_interface import LightningRoutingStrategy, YieldConfig
        
        config = YieldConfig(enabled=True)
        strategy = LightningRoutingStrategy(config)
        
        with pytest.raises(NotImplementedError):
            await strategy.optimize_idle_liquidity(idle_sats=10000)
            
    def test_yield_interface_exists_in_module(self):
        """yield_interface.py 应存在且包含 NotImplementedError"""
        from wallet import YieldStrategy, create_yield_strategy
        
        assert YieldStrategy is not None
        assert create_yield_strategy is not None
