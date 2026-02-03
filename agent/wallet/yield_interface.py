"""
Yield Interface - 闲置流动性优化接口占位

@trace Vol.2 S-P0-06, Vol.1 §4.7 (Anti-Pattern AP-07: No Dumb Pipes)
@constraint 必须包含 Yield 接口占位，禁止纯管道思维
@default_state 关闭 (需显式开启)
"""

from abc import ABC, abstractmethod
from typing import Optional
from pydantic import BaseModel
from enum import Enum


class YieldStrategyType(str, Enum):
    """收益策略类型"""
    LIGHTNING_ROUTING = "lightning_routing"  # Lightning 路由费
    LIQUIDITY_POOL = "liquidity_pool"        # 流动性池 (Phase 2+)
    CUSTOM = "custom"


class YieldEstimate(BaseModel):
    """收益预估 (诚实版, 非投资建议)"""
    strategy_type: YieldStrategyType
    annual_rate_low: float       # 历史观察下限 (示例: 0.0001 = 0.01%)
    annual_rate_high: float      # 历史观察上限 (示例: 0.001 = 0.1%)
    confidence: str              # "historical_observation" - 仅作示例
    disclaimer: str              # 风险声明
    
    @classmethod
    def lightning_routing(cls) -> "YieldEstimate":
        """Lightning 路由收益 (诚实声明)"""
        return cls(
            strategy_type=YieldStrategyType.LIGHTNING_ROUTING,
            annual_rate_low=0.0001,   # 0.01%
            annual_rate_high=0.001,   # 0.1%
            confidence="historical_observation",
            disclaimer=(
                "收益来源于 Lightning Network 路由费 (技术机制，非投资产品)。"
                "区间仅作历史观察示例，不构成预期或承诺；"
                "实际收益取决于网络状况、流动性分布等因素；"
                "区间可能随时间调整或移除。"
            ),
        )


class YieldConfig(BaseModel):
    """收益模块配置"""
    enabled: bool = False                        # 默认关闭
    strategy_type: YieldStrategyType = YieldStrategyType.LIGHTNING_ROUTING
    max_allocation_percent: float = 50.0         # 最大分配比例 (%)
    min_reserve_sats: int = 10000                # 最低保留余额 (sats)
    auto_compound: bool = True                   # 自动复利


class YieldStrategy(ABC):
    """
    收益策略抽象基类
    
    Phase 0: 占位实现 (NotImplementedError)
    Phase 1+: 实际实现 Lightning 路由收益
    
    设计原则 (Vol.1 §1.6):
    - 默认关闭，需显式开启
    - 不保证收益
    - 不是投资产品
    """
    
    def __init__(self, config: YieldConfig):
        self.config = config
        
    @abstractmethod
    async def estimate_yield(self, balance_sats: int) -> YieldEstimate:
        """
        预估收益 (诚实版)
        
        Args:
            balance_sats: 当前可用余额 (sats)
            
        Returns:
            YieldEstimate: 收益预估 (仅作参考，非承诺)
        """
        raise NotImplementedError("Yield estimation not implemented in Phase 0")
        
    @abstractmethod
    async def optimize_idle_liquidity(
        self,
        idle_sats: int,
        max_lock_seconds: int = 86400,  # 最长锁定时间 (默认 1 天)
    ) -> Optional[str]:
        """
        优化闲置流动性
        
        Args:
            idle_sats: 闲置资金 (sats)
            max_lock_seconds: 最长锁定时间
            
        Returns:
            Optional[str]: 分配 ID (如有)
            
        Raises:
            NotImplementedError: Phase 0 占位
        """
        raise NotImplementedError("Liquidity optimization not implemented in Phase 0")
        
    @abstractmethod
    async def withdraw(self, allocation_id: str) -> int:
        """
        撤回已分配资金
        
        Args:
            allocation_id: 分配 ID
            
        Returns:
            int: 撤回金额 (sats)
            
        Raises:
            NotImplementedError: Phase 0 占位
        """
        raise NotImplementedError("Withdrawal not implemented in Phase 0")


class LightningRoutingStrategy(YieldStrategy):
    """
    Lightning 路由收益策略
    
    Phase 0: 占位实现
    Phase 1+: 接入真实路由节点
    """
    
    async def estimate_yield(self, balance_sats: int) -> YieldEstimate:
        """返回诚实的收益预估"""
        return YieldEstimate.lightning_routing()
        
    async def optimize_idle_liquidity(
        self,
        idle_sats: int,
        max_lock_seconds: int = 86400,
    ) -> Optional[str]:
        """Phase 0: 占位 - 仅记录日志"""
        if not self.config.enabled:
            return None
            
        # Phase 0: 仅返回 None (不实际分配)
        # Phase 1+: 实现真实的流动性分配
        raise NotImplementedError(
            "Lightning routing optimization will be implemented in Phase 1. "
            "For now, idle liquidity remains in wallet."
        )
        
    async def withdraw(self, allocation_id: str) -> int:
        """Phase 0: 占位"""
        raise NotImplementedError("Withdrawal not implemented in Phase 0")


# 工厂函数
def create_yield_strategy(config: Optional[YieldConfig] = None) -> YieldStrategy:
    """
    创建收益策略
    
    Args:
        config: 收益配置 (默认禁用)
        
    Returns:
        YieldStrategy: 收益策略实例
    """
    config = config or YieldConfig(enabled=False)
    
    if config.strategy_type == YieldStrategyType.LIGHTNING_ROUTING:
        return LightningRoutingStrategy(config)
    else:
        raise ValueError(f"Unknown strategy type: {config.strategy_type}")
