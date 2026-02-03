"""
Hourly Rate Limiter (预算风控)

@trace Task-18, Vol.2 S-P0-14, Vol.5 D-RISK-01
@constraint 限制小时支出上限
"""

import time
import logging
from collections import deque
from typing import Optional, Deque, Tuple
from threading import Lock

logger = logging.getLogger(__name__)


class RateLimiter:
    """
    基于滑动窗口的小时支出限制器
    
    功能:
    - 跟踪过去 1 小时内的支出
    - 拒绝超出限额的支付请求
    - 线程安全
    
    使用方式:
        limiter = RateLimiter(hourly_limit_msats=10_000_000)  # 10,000 sats/hour
        if limiter.can_spend(payment_msats):
            limiter.record_spend(payment_msats)
            # 执行支付
        else:
            raise Exception("Rate limit exceeded")
    """
    
    # 一小时的秒数
    HOUR_SECONDS = 3600
    
    def __init__(
        self,
        hourly_limit_msats: int = 10_000_000,  # 默认 10,000 sats/hour
        window_seconds: int = HOUR_SECONDS,
    ):
        """
        初始化限制器
        
        Args:
            hourly_limit_msats: 每小时支出上限 (毫聪)
            window_seconds: 时间窗口 (秒)，默认 3600
        """
        self.hourly_limit_msats = hourly_limit_msats
        self.window_seconds = window_seconds
        
        # 滑动窗口: (timestamp, amount_msats)
        self._spends: Deque[Tuple[float, int]] = deque()
        self._lock = Lock()
        
    def _prune_old(self, now: float) -> None:
        """移除过期记录 (内部方法，需要持锁)"""
        cutoff = now - self.window_seconds
        while self._spends and self._spends[0][0] < cutoff:
            self._spends.popleft()
            
    def get_spent_in_window(self) -> int:
        """
        获取当前时间窗口内的总支出
        
        Returns:
            已支出金额 (毫聪)
        """
        now = time.time()
        with self._lock:
            self._prune_old(now)
            return sum(amount for _, amount in self._spends)
            
    def get_remaining_budget(self) -> int:
        """
        获取当前时间窗口内的剩余预算
        
        Returns:
            剩余预算 (毫聪)
        """
        spent = self.get_spent_in_window()
        return max(0, self.hourly_limit_msats - spent)
        
    def can_spend(self, amount_msats: int) -> bool:
        """
        检查是否可以支出指定金额
        
        Args:
            amount_msats: 待支出金额 (毫聪)
            
        Returns:
            True 如果可以支出
        """
        remaining = self.get_remaining_budget()
        return amount_msats <= remaining
        
    def record_spend(self, amount_msats: int) -> bool:
        """
        记录一笔支出
        
        Args:
            amount_msats: 支出金额 (毫聪)
            
        Returns:
            True 如果记录成功, False 如果超出限额
        """
        now = time.time()
        
        with self._lock:
            self._prune_old(now)
            
            # 检查是否会超限
            current_spent = sum(amount for _, amount in self._spends)
            if current_spent + amount_msats > self.hourly_limit_msats:
                logger.warning(
                    f"Rate limit exceeded: attempted {amount_msats} msats, "
                    f"spent {current_spent}/{self.hourly_limit_msats} msats in window"
                )
                return False
                
            # 记录支出
            self._spends.append((now, amount_msats))
            logger.info(
                f"Recorded spend: {amount_msats} msats, "
                f"total {current_spent + amount_msats}/{self.hourly_limit_msats} msats"
            )
            return True
            
    def try_spend(self, amount_msats: int) -> bool:
        """
        尝试支出指定金额 (检查 + 记录的原子操作)
        
        Args:
            amount_msats: 支出金额 (毫聪)
            
        Returns:
            True 如果支出成功, False 如果超出限额
        """
        return self.record_spend(amount_msats)
        
    def reset(self) -> None:
        """重置所有记录 (用于测试)"""
        with self._lock:
            self._spends.clear()
            
    def get_stats(self) -> dict:
        """
        获取统计信息
        
        Returns:
            包含 spent, remaining, limit, window_size 的字典
        """
        now = time.time()
        with self._lock:
            self._prune_old(now)
            spent = sum(amount for _, amount in self._spends)
            return {
                "spent_msats": spent,
                "remaining_msats": max(0, self.hourly_limit_msats - spent),
                "limit_msats": self.hourly_limit_msats,
                "window_seconds": self.window_seconds,
                "transaction_count": len(self._spends),
            }


# 默认全局实例
_default_limiter: Optional[RateLimiter] = None


def get_rate_limiter(hourly_limit_msats: int = 10_000_000) -> RateLimiter:
    """
    获取默认限制器实例 (单例模式)
    
    Args:
        hourly_limit_msats: 每小时支出上限
        
    Returns:
        RateLimiter 实例
    """
    global _default_limiter
    if _default_limiter is None:
        _default_limiter = RateLimiter(hourly_limit_msats)
    return _default_limiter
