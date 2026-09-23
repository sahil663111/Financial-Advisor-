"""
Journal Entry schemas — Phase 2.
Core rule: sum(debits) == sum(credits) on every posted entry.
This is enforced in the service layer, not here.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator, model_validator
from enum import Enum


class JournalStatus(str, Enum):
    DRAFT = "DRAFT"
    POSTED = "POSTED"
    VOID = "VOID"


class JournalLineRequest(BaseModel):
    account_code: str               # Must exist in org's COA
    description: Optional[str] = None
    debit: float = 0.0
    credit: float = 0.0

    @field_validator("debit", "credit")
    @classmethod
    def non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Debit and credit amounts must be non-negative")
        return round(v, 2)

    @model_validator(mode="after")
    def one_side_only(self) -> "JournalLineRequest":
        if self.debit > 0 and self.credit > 0:
            raise ValueError(
                f"A journal line cannot have both debit and credit. "
                f"Got debit={self.debit}, credit={self.credit} for account {self.account_code}"
            )
        if self.debit == 0 and self.credit == 0:
            raise ValueError("Each line must have either a debit or credit amount (not both zero)")
        return self


class CreateJournalEntryRequest(BaseModel):
    date: datetime
    description: str
    reference: Optional[str] = None        # e.g. INV-001, PAY-042
    lines: list[JournalLineRequest]
    tags: list[str] = []                   # Optional categorization tags

    @field_validator("lines")
    @classmethod
    def min_two_lines(cls, v: list) -> list:
        if len(v) < 2:
            raise ValueError("A journal entry requires at least two lines")
        return v


class VoidJournalRequest(BaseModel):
    reason: str


# ── Responses ─────────────────────────────────────────────────────────────────

class JournalLineResponse(BaseModel):
    id: str
    account_code: str
    account_name: str
    description: Optional[str]
    debit: float
    credit: float


class JournalEntryResponse(BaseModel):
    id: str
    org_id: str
    entry_number: str               # e.g. JE-2024-0001
    date: datetime
    description: str
    reference: Optional[str]
    status: str
    total_debit: float
    total_credit: float
    lines: list[JournalLineResponse]
    tags: list[str]
    created_by: str
    created_at: datetime
    posted_at: Optional[datetime]
    voided_at: Optional[datetime]
    void_reason: Optional[str]


class LedgerEntryResponse(BaseModel):
    date: datetime
    entry_number: str
    description: str
    reference: Optional[str]
    debit: float
    credit: float
    balance: float                  # Running balance after this transaction
    journal_entry_id: str


class LedgerResponse(BaseModel):
    account_code: str
    account_name: str
    account_type: str
    opening_balance: float
    entries: list[LedgerEntryResponse]
    closing_balance: float
    total_debits: float
    total_credits: float


class TrialBalanceLineResponse(BaseModel):
    account_code: str
    account_name: str
    account_type: str
    debit_balance: float
    credit_balance: float


class TrialBalanceResponse(BaseModel):
    org_id: str
    as_of_date: datetime
    lines: list[TrialBalanceLineResponse]
    total_debits: float
    total_credits: float
    is_balanced: bool               # True when total_debits == total_credits
    generated_at: datetime
