"""
L402 Client Unit Tests

@trace Task-P1-01
@constraint D-SDK-03: 单元测试通过
"""

import pytest
import httpx
from unittest.mock import AsyncMock, MagicMock

from daemon_l402 import (
    L402Client,
    L402Challenge,
    L402Credential,
    L402InvalidChallenge,
    L402PaymentFailed,
)


class TestL402Challenge:
    """Test L402Challenge dataclass"""
    
    def test_create_challenge(self) -> None:
        challenge = L402Challenge(
            macaroon="test_macaroon",
            invoice="lnbc1000...",
            payment_hash="abc123",
            amount_msats=1000,
        )
        assert challenge.macaroon == "test_macaroon"
        assert challenge.invoice == "lnbc1000..."
        assert challenge.payment_hash == "abc123"
        assert challenge.amount_msats == 1000
        
    def test_default_values(self) -> None:
        challenge = L402Challenge(
            macaroon="test",
            invoice="lnbc...",
        )
        assert challenge.payment_hash == ""
        assert challenge.amount_msats == 0


class TestL402Credential:
    """Test L402Credential dataclass"""
    
    def test_to_header(self) -> None:
        cred = L402Credential(
            macaroon="mac123",
            preimage="pre456",
        )
        assert cred.to_header() == "L402 mac123:pre456"


class TestL402Client:
    """Test L402Client"""
    
    @pytest.fixture
    def mock_payment_handler(self) -> AsyncMock:
        handler = AsyncMock()
        handler.return_value = "a" * 64  # Valid 64-char preimage
        return handler
        
    @pytest.mark.asyncio
    async def test_context_manager(self, mock_payment_handler: AsyncMock) -> None:
        async with L402Client(payment_handler=mock_payment_handler) as client:
            assert client._http is not None
        assert client._http is None
        
    @pytest.mark.asyncio
    async def test_not_connected_error(self, mock_payment_handler: AsyncMock) -> None:
        client = L402Client(payment_handler=mock_payment_handler)
        with pytest.raises(RuntimeError, match="not connected"):
            await client.get("http://example.com")
            
    @pytest.mark.asyncio
    async def test_successful_request(self, mock_payment_handler: AsyncMock) -> None:
        async with L402Client(payment_handler=mock_payment_handler) as client:
            # Mock HTTP client
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"data": "ok"}
            
            client._http = AsyncMock()
            client._http.request = AsyncMock(return_value=mock_response)
            
            response = await client.get("http://example.com/api")
            
            assert response.status_code == 200
            mock_payment_handler.assert_not_called()
            
    @pytest.mark.asyncio
    async def test_402_payment_flow(self, mock_payment_handler: AsyncMock) -> None:
        async with L402Client(payment_handler=mock_payment_handler) as client:
            # First response: 402
            mock_402 = MagicMock()
            mock_402.status_code = 402
            mock_402.headers = {
                'WWW-Authenticate': 'L402 macaroon="testmac", invoice="lnbc1000..."'
            }
            mock_402.json.return_value = {
                'paymentHash': 'abc123',
                'amountMsats': 1000,
            }
            
            # Second response: 200
            mock_200 = MagicMock()
            mock_200.status_code = 200
            
            client._http = AsyncMock()
            client._http.request = AsyncMock(side_effect=[mock_402, mock_200])
            
            response = await client.get("http://example.com/paid")
            
            assert response.status_code == 200
            mock_payment_handler.assert_called_once_with("lnbc1000...")
            
    @pytest.mark.asyncio
    async def test_parse_challenge_valid(self, mock_payment_handler: AsyncMock) -> None:
        client = L402Client(payment_handler=mock_payment_handler)
        
        mock_response = MagicMock()
        mock_response.headers = {
            'WWW-Authenticate': 'L402 macaroon="mac123", invoice="inv456"'
        }
        mock_response.json.return_value = {
            'paymentHash': 'hash789',
            'amountMsats': 5000,
        }
        
        challenge = client._parse_challenge(mock_response)
        
        assert challenge.macaroon == "mac123"
        assert challenge.invoice == "inv456"
        assert challenge.payment_hash == "hash789"
        assert challenge.amount_msats == 5000
        
    @pytest.mark.asyncio
    async def test_parse_challenge_invalid(self, mock_payment_handler: AsyncMock) -> None:
        client = L402Client(payment_handler=mock_payment_handler)
        
        mock_response = MagicMock()
        mock_response.headers = {'WWW-Authenticate': 'Invalid header'}
        
        with pytest.raises(L402InvalidChallenge):
            client._parse_challenge(mock_response)
            
    @pytest.mark.asyncio
    async def test_payment_failed(self, mock_payment_handler: AsyncMock) -> None:
        mock_payment_handler.side_effect = Exception("Network error")
        
        async with L402Client(payment_handler=mock_payment_handler) as client:
            mock_402 = MagicMock()
            mock_402.status_code = 402
            mock_402.headers = {
                'WWW-Authenticate': 'L402 macaroon="mac", invoice="inv"'
            }
            mock_402.json.return_value = {}
            
            client._http = AsyncMock()
            client._http.request = AsyncMock(return_value=mock_402)
            
            with pytest.raises(L402PaymentFailed, match="Network error"):
                await client.get("http://example.com/paid")
                
    @pytest.mark.asyncio
    async def test_invalid_preimage_length(self, mock_payment_handler: AsyncMock) -> None:
        mock_payment_handler.return_value = "short"  # Invalid preimage
        
        async with L402Client(payment_handler=mock_payment_handler) as client:
            mock_402 = MagicMock()
            mock_402.status_code = 402
            mock_402.headers = {
                'WWW-Authenticate': 'L402 macaroon="mac", invoice="inv"'
            }
            mock_402.json.return_value = {}
            
            client._http = AsyncMock()
            client._http.request = AsyncMock(return_value=mock_402)
            
            with pytest.raises(L402PaymentFailed, match="Invalid preimage"):
                await client.get("http://example.com/paid")


class TestHttpMethods:
    """Test HTTP convenience methods"""
    
    @pytest.fixture
    def mock_payment_handler(self) -> AsyncMock:
        return AsyncMock(return_value="a" * 64)
        
    @pytest.mark.asyncio
    async def test_post_method(self, mock_payment_handler: AsyncMock) -> None:
        async with L402Client(payment_handler=mock_payment_handler) as client:
            mock_response = MagicMock()
            mock_response.status_code = 200
            
            client._http = AsyncMock()
            client._http.request = AsyncMock(return_value=mock_response)
            
            response = await client.post("http://example.com", json={"data": 1})
            
            client._http.request.assert_called_with(
                'POST', 'http://example.com', json={"data": 1}
            )
            
    @pytest.mark.asyncio
    async def test_put_method(self, mock_payment_handler: AsyncMock) -> None:
        async with L402Client(payment_handler=mock_payment_handler) as client:
            mock_response = MagicMock()
            mock_response.status_code = 200
            
            client._http = AsyncMock()
            client._http.request = AsyncMock(return_value=mock_response)
            
            await client.put("http://example.com/resource")
            
            client._http.request.assert_called_with(
                'PUT', 'http://example.com/resource'
            )
            
    @pytest.mark.asyncio
    async def test_delete_method(self, mock_payment_handler: AsyncMock) -> None:
        async with L402Client(payment_handler=mock_payment_handler) as client:
            mock_response = MagicMock()
            mock_response.status_code = 200
            
            client._http = AsyncMock()
            client._http.request = AsyncMock(return_value=mock_response)
            
            await client.delete("http://example.com/resource")
            
            client._http.request.assert_called_with(
                'DELETE', 'http://example.com/resource'
            )
