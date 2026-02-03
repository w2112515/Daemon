"""
L402 Client Unit Tests

@trace Task-17, Vol.2 S-P0-07
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import httpx

from client.l402_client import L402Client
from client.types import (
    L402Challenge,
    L402Token,
    L402PaymentFailed,
    L402InvalidChallenge,
    L402AmountExceeded,
)
from wallet.types import PaymentResult, PaymentStatus


class TestL402Client:
    """L402 Client 测试套件"""
    
    @pytest.fixture
    def mock_lnd_client(self):
        """创建 Mock LND Client"""
        lnd = MagicMock()
        lnd.pay_invoice = AsyncMock()
        return lnd
    
    @pytest.fixture
    def sample_challenge_response(self):
        """创建 402 响应示例"""
        return httpx.Response(
            status_code=402,
            headers={
                "WWW-Authenticate": 'L402 macaroon="dGVzdC1tYWNhcm9vbg==", invoice="lnbc1000n1..."',
            },
            json={
                "error": "Payment Required",
                "paymentHash": "a" * 64,
                "amountMsats": 1000,
                "memo": "Test API",
            },
        )
    
    @pytest.mark.asyncio
    async def test_normal_request_no_402(self, mock_lnd_client):
        """正常请求 (非 402) 直接返回"""
        async with L402Client(mock_lnd_client) as client:
            # Mock HTTP 客户端
            mock_response = httpx.Response(200, json={"data": "success"})
            client._http.request = AsyncMock(return_value=mock_response)
            
            response = await client.get("http://test.com/api")
            
            assert response.status_code == 200
            mock_lnd_client.pay_invoice.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_402_response_parses_challenge(self, mock_lnd_client):
        """402 响应正确解析 Challenge"""
        # 设置支付成功
        mock_lnd_client.pay_invoice.return_value = PaymentResult(
            payment_hash="a" * 64,
            preimage="b" * 64,
            status=PaymentStatus.SETTLED,
            fee_msats=0,
            amount_msats=1000,
        )
        
        async with L402Client(mock_lnd_client) as client:
            # 第一次返回 402，第二次返回成功
            responses = [
                httpx.Response(
                    402,
                    headers={"WWW-Authenticate": 'L402 macaroon="bWFj", invoice="ln..."'},
                    json={"paymentHash": "a" * 64, "amountMsats": 1000},
                ),
                httpx.Response(200, json={"data": "success"}),
            ]
            client._http.request = AsyncMock(side_effect=responses)
            
            response = await client.get("http://test.com/api")
            
            assert response.status_code == 200
            mock_lnd_client.pay_invoice.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_payment_success_retries_with_token(self, mock_lnd_client):
        """支付成功后携带 Token 重试"""
        mock_lnd_client.pay_invoice.return_value = PaymentResult(
            payment_hash="a" * 64,
            preimage="c" * 64,
            status=PaymentStatus.SETTLED,
            fee_msats=0,
            amount_msats=1000,
        )
        
        async with L402Client(mock_lnd_client) as client:
            responses = [
                httpx.Response(
                    402,
                    headers={"WWW-Authenticate": 'L402 macaroon="bWFj", invoice="ln..."'},
                    json={"paymentHash": "a" * 64, "amountMsats": 1000},
                ),
                httpx.Response(200, json={"data": "success"}),
            ]
            client._http.request = AsyncMock(side_effect=responses)
            
            await client.get("http://test.com/api")
            
            # 验证第二次请求携带了 Authorization Header
            second_call = client._http.request.call_args_list[1]
            headers = second_call[1].get('headers', {})
            assert 'Authorization' in headers
            assert headers['Authorization'].startswith('L402 ')
    
    @pytest.mark.asyncio
    async def test_amount_exceeds_limit_raises(self, mock_lnd_client):
        """超过金额限制抛出异常"""
        async with L402Client(mock_lnd_client, max_payment_msats=500) as client:
            response = httpx.Response(
                402,
                headers={"WWW-Authenticate": 'L402 macaroon="bWFj", invoice="ln..."'},
                json={"paymentHash": "a" * 64, "amountMsats": 1000},
            )
            client._http.request = AsyncMock(return_value=response)
            
            with pytest.raises(L402AmountExceeded) as exc_info:
                await client.get("http://test.com/api")
                
            assert exc_info.value.requested == 1000
            assert exc_info.value.limit == 500
    
    @pytest.mark.asyncio
    async def test_payment_failed_raises(self, mock_lnd_client):
        """支付失败抛出异常"""
        mock_lnd_client.pay_invoice.return_value = PaymentResult(
            payment_hash="a" * 64,
            preimage="",
            status=PaymentStatus.FAILED,
            fee_msats=0,
            amount_msats=1000,
        )
        
        async with L402Client(mock_lnd_client) as client:
            response = httpx.Response(
                402,
                headers={"WWW-Authenticate": 'L402 macaroon="bWFj", invoice="ln..."'},
                json={"paymentHash": "a" * 64, "amountMsats": 1000},
            )
            client._http.request = AsyncMock(return_value=response)
            
            with pytest.raises(L402PaymentFailed):
                await client.get("http://test.com/api")


class TestL402Token:
    """L402 Token 测试"""
    
    def test_to_header_format(self):
        """Token 生成正确的 Header 格式"""
        token = L402Token(macaroon="bWFjYXJvb24=", preimage="a" * 64)
        header = token.to_header()
        
        assert header == f"L402 bWFjYXJvb24=:{'a' * 64}"


class TestL402Challenge:
    """L402 Challenge 测试"""
    
    def test_challenge_model(self):
        """Challenge 模型正确"""
        challenge = L402Challenge(
            macaroon="test",
            invoice="lnbc...",
            payment_hash="a" * 64,
            amount_msats=1000,
        )
        
        assert challenge.macaroon == "test"
        assert challenge.amount_msats == 1000
