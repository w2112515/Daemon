"""
Large Payment Alert (大额支付预警)

@trace Task-19, Vol.2 S-P0-15, Vol.5 D-RISK-02
@constraint 单笔超阈值记录 WARN 日志
"""

import logging
from typing import Optional, Callable, Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)


class PaymentAlert:
    """
    大额支付预警系统
    
    功能:
    - 单笔支付超过阈值时记录 WARN 日志
    - 可选的 Telemetry 上报
    - 支持自定义回调
    
    使用方式:
        alert = PaymentAlert(threshold_msats=100_000)  # 100 sats
        alert.check_payment(payment_msats=500_000, context={"tx_id": "..."})
    """
    
    # 默认阈值: 1000 sats
    DEFAULT_THRESHOLD_MSATS = 1_000_000
    
    def __init__(
        self,
        threshold_msats: int = DEFAULT_THRESHOLD_MSATS,
        on_alert: Optional[Callable[[Dict[str, Any]], None]] = None,
        enable_telemetry: bool = False,
    ):
        """
        初始化预警系统
        
        Args:
            threshold_msats: 预警阈值 (毫聪)
            on_alert: 可选回调，触发预警时调用
            enable_telemetry: 是否启用遥测上报
        """
        self.threshold_msats = threshold_msats
        self.on_alert = on_alert
        self.enable_telemetry = enable_telemetry
        
        # 统计
        self._alert_count = 0
        self._total_alerted_msats = 0
        
    def check_payment(
        self,
        amount_msats: int,
        context: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        检查支付金额是否超过阈值
        
        Args:
            amount_msats: 支付金额 (毫聪)
            context: 可选的上下文信息 (用于日志和遥测)
            
        Returns:
            True 如果触发预警，False 否则
        """
        if amount_msats <= self.threshold_msats:
            return False
            
        # 触发预警
        self._alert_count += 1
        self._total_alerted_msats += amount_msats
        
        # 构建预警信息
        alert_info = {
            "type": "large_payment_alert",
            "amount_msats": amount_msats,
            "amount_sats": amount_msats // 1000,
            "threshold_msats": self.threshold_msats,
            "threshold_sats": self.threshold_msats // 1000,
            "timestamp": datetime.utcnow().isoformat(),
            "alert_number": self._alert_count,
            **(context or {}),
        }
        
        # 记录 WARN 日志
        logger.warning(
            f"[LARGE_PAYMENT] Payment of {amount_msats // 1000} sats "
            f"exceeds threshold of {self.threshold_msats // 1000} sats. "
            f"Context: {context or 'none'}"
        )
        
        # 调用回调
        if self.on_alert:
            try:
                self.on_alert(alert_info)
            except Exception as e:
                logger.error(f"Alert callback failed: {e}")
                
        # 遥测上报
        if self.enable_telemetry:
            self._send_telemetry(alert_info)
            
        return True
        
    def _send_telemetry(self, alert_info: Dict[str, Any]) -> None:
        """
        发送遥测数据 (可选)
        
        Args:
            alert_info: 预警信息
        """
        # TODO: 集成 Telemetry 模块
        # 当前仅记录日志
        logger.debug(f"Telemetry (stub): {alert_info}")
        
    def get_stats(self) -> Dict[str, Any]:
        """
        获取统计信息
        
        Returns:
            包含 alert_count, total_alerted_msats, threshold 的字典
        """
        return {
            "alert_count": self._alert_count,
            "total_alerted_msats": self._total_alerted_msats,
            "total_alerted_sats": self._total_alerted_msats // 1000,
            "threshold_msats": self.threshold_msats,
            "threshold_sats": self.threshold_msats // 1000,
        }
        
    def reset_stats(self) -> None:
        """重置统计 (用于测试)"""
        self._alert_count = 0
        self._total_alerted_msats = 0


# 默认全局实例
_default_alert: Optional[PaymentAlert] = None


def get_payment_alert(threshold_msats: int = PaymentAlert.DEFAULT_THRESHOLD_MSATS) -> PaymentAlert:
    """
    获取默认预警实例 (单例模式)
    
    Args:
        threshold_msats: 预警阈值
        
    Returns:
        PaymentAlert 实例
    """
    global _default_alert
    if _default_alert is None:
        _default_alert = PaymentAlert(threshold_msats)
    return _default_alert


def check_large_payment(
    amount_msats: int,
    context: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    便捷函数: 检查大额支付
    
    Args:
        amount_msats: 支付金额
        context: 上下文信息
        
    Returns:
        True 如果触发预警
    """
    return get_payment_alert().check_payment(amount_msats, context)
