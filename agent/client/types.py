"""
Hourly Limit Exceeded Error

@trace Task-H-05
"""


class HourlyLimitExceededError(Exception):
    """小时限额超出错误"""
    def __init__(self, requested: int, limit: int, spent: int):
        self.requested = requested
        self.limit = limit
        self.spent = spent
        super().__init__(
            f"Hourly limit exceeded: requested {requested} msats, "
            f"spent {spent}/{limit} msats in window"
        )
