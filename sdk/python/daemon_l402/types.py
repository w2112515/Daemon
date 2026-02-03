"""
L402 Types and Exceptions

@trace Task-P1-01, Vol.2 §2.4
@constraint D-SDK-02: Python 导入成功
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class L402Challenge:
    """L402 Challenge from 402 Response"""
    macaroon: str
    invoice: str
    payment_hash: str = ""
    amount_msats: int = 0


@dataclass
class L402Credential:
    """L402 Credential for authenticated requests"""
    macaroon: str
    preimage: str

    def to_header(self) -> str:
        """Format as Authorization header value"""
        return f"L402 {self.macaroon}:{self.preimage}"


class L402Error(Exception):
    """Base exception for L402 errors"""
    pass


class L402InvalidChallenge(L402Error):
    """Invalid or missing L402 challenge in response"""
    pass


class L402PaymentFailed(L402Error):
    """Payment failed"""
    def __init__(self, message: str, amount_msats: int = 0):
        super().__init__(message)
        self.amount_msats = amount_msats


class L402PaymentTimeout(L402Error):
    """Payment timeout"""
    pass
