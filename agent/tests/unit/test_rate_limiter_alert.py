"""
Rate Limiter and Alert Unit Tests

@trace Task-18, Task-19
"""

import pytest
import time
from unittest.mock import MagicMock

from wallet.rate_limiter import RateLimiter
from wallet.alert import PaymentAlert


class TestRateLimiter:
    """RateLimiter 测试套件"""
    
    def test_initial_budget_full(self):
        """初始预算为满额"""
        limiter = RateLimiter(hourly_limit_msats=10_000_000)
        assert limiter.get_remaining_budget() == 10_000_000
        
    def test_record_spend_deducts_budget(self):
        """记录支出后预算减少"""
        limiter = RateLimiter(hourly_limit_msats=10_000_000)
        limiter.record_spend(1_000_000)
        
        assert limiter.get_remaining_budget() == 9_000_000
        
    def test_can_spend_within_limit(self):
        """限额内可以支出"""
        limiter = RateLimiter(hourly_limit_msats=10_000_000)
        assert limiter.can_spend(5_000_000) is True
        
    def test_cannot_spend_over_limit(self):
        """超限不可支出"""
        limiter = RateLimiter(hourly_limit_msats=10_000_000)
        limiter.record_spend(8_000_000)
        
        assert limiter.can_spend(5_000_000) is False
        
    def test_record_spend_rejects_over_limit(self):
        """超限记录被拒绝"""
        limiter = RateLimiter(hourly_limit_msats=10_000_000)
        limiter.record_spend(8_000_000)
        
        result = limiter.record_spend(5_000_000)
        assert result is False
        
    def test_try_spend_atomic(self):
        """try_spend 是原子操作"""
        limiter = RateLimiter(hourly_limit_msats=10_000_000)
        
        assert limiter.try_spend(5_000_000) is True
        assert limiter.get_remaining_budget() == 5_000_000
        
    def test_stats_accurate(self):
        """统计信息准确"""
        limiter = RateLimiter(hourly_limit_msats=10_000_000)
        limiter.record_spend(3_000_000)
        limiter.record_spend(2_000_000)
        
        stats = limiter.get_stats()
        assert stats["spent_msats"] == 5_000_000
        assert stats["remaining_msats"] == 5_000_000
        assert stats["transaction_count"] == 2
        
    def test_reset_clears_all(self):
        """reset 清除所有记录"""
        limiter = RateLimiter(hourly_limit_msats=10_000_000)
        limiter.record_spend(5_000_000)
        limiter.reset()
        
        assert limiter.get_remaining_budget() == 10_000_000


class TestPaymentAlert:
    """PaymentAlert 测试套件"""
    
    def test_below_threshold_no_alert(self):
        """低于阈值不触发预警"""
        alert = PaymentAlert(threshold_msats=1_000_000)
        result = alert.check_payment(500_000)
        
        assert result is False
        
    def test_above_threshold_triggers_alert(self):
        """超过阈值触发预警"""
        alert = PaymentAlert(threshold_msats=1_000_000)
        result = alert.check_payment(2_000_000)
        
        assert result is True
        
    def test_callback_called_on_alert(self):
        """预警时调用回调"""
        callback = MagicMock()
        alert = PaymentAlert(threshold_msats=1_000_000, on_alert=callback)
        
        alert.check_payment(2_000_000, context={"tx_id": "test123"})
        
        callback.assert_called_once()
        call_args = callback.call_args[0][0]
        assert call_args["amount_msats"] == 2_000_000
        assert call_args["type"] == "large_payment_alert"
        
    def test_stats_track_alerts(self):
        """统计跟踪预警次数"""
        alert = PaymentAlert(threshold_msats=1_000_000)
        alert.check_payment(2_000_000)
        alert.check_payment(3_000_000)
        
        stats = alert.get_stats()
        assert stats["alert_count"] == 2
        assert stats["total_alerted_msats"] == 5_000_000
        
    def test_reset_stats_clears(self):
        """reset 清除统计"""
        alert = PaymentAlert(threshold_msats=1_000_000)
        alert.check_payment(2_000_000)
        alert.reset_stats()
        
        stats = alert.get_stats()
        assert stats["alert_count"] == 0


class TestIntegration:
    """集成测试: RateLimiter + PaymentAlert"""
    
    def test_combined_workflow(self):
        """组合工作流"""
        limiter = RateLimiter(hourly_limit_msats=10_000_000)
        alert = PaymentAlert(threshold_msats=1_000_000)
        
        # 模拟支付流程
        payment_amount = 2_000_000
        
        # 检查预警
        is_large = alert.check_payment(payment_amount)
        assert is_large is True
        
        # 检查限额
        can_pay = limiter.can_spend(payment_amount)
        assert can_pay is True
        
        # 记录支出
        limiter.record_spend(payment_amount)
        assert limiter.get_remaining_budget() == 8_000_000
