"""
Business Expense schemas — Phase 4.

Business expenses are separate from Individual expenses.
They go through an optional approval workflow and auto-post to accounting.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator
from enum import Enum


class ExpenseCategory(str, Enum):
    RENT              = "RENT"
    UTILITIES         = "UTILITIES"
    INTERNET          = "INTERNET"
    SOFTWARE          = "SOFTWARE"
    MARKETING         = "MARKETING"
    TRAVEL            = "TRAVEL"
    MEALS             = "MEALS"
    OFFICE_SUPPLIES   = "OFFICE_SUPPLIES"
    SALARIES          = "SALARIES"
    PROFESSIONAL_FEES = "PROFESSIONAL_FEES"
    REPAIRS           = "REPAIRS"
    INSURANCE         = "INSURANCE"
    DEPRECIATION      = "DEPRECIATION"
    BANK_CHARGES      = "BANK_CHARGES"
    OTHER             = "OTHER"


class PaymentMethod(str, Enum):
    BANK_TRANSFER = "BANK_TRANSFER"
    UPI           = "UPI"
    CASH          = "CASH"
    CREDIT_CARD   = "CREDIT_CARD"
    CHEQUE        = "CHEQUE"
    OTHER         = "OTHER"


class ApprovalStatus(str, Enum):
    PENDING  = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


# ── Category → COA account code mapping ──────────────────────────────────────
# Maps each category to its default expense account code in the COA.
CATEGORY_ACCOUNT_MAP: dict[str, str] = {
    "RENT":              "5201",
    "UTILITIES":         "5202",
    "INTERNET":          "5203",
    "SOFTWARE":          "5204",
    "MARKETING":         "5205",
    "TRAVEL":            "5206",
    "MEALS":             "5206",
    "OFFICE_SUPPLIES":   "5208",
    "SALARIES":          "5301",
    "PROFESSIONAL_FEES": "5207",
    "REPAIRS":           "5209",
    "INSURANCE":         "5210",
    "DEPRECIATION":      "5400",
    "BANK_CHARGES":      "5501",
    "OTHER":             "5200",
}


# ── Request schemas ───────────────────────────────────────────────────────────

class CreateExpenseRequest(BaseModel):
    date: datetime
    category: ExpenseCategory
    description: str
    amount: float
    payment_method: PaymentMethod = PaymentMethod.BANK_TRANSFER
    vendor_id: Optional[str] = None          # link to a known vendor (optional)
    vendor_name: Optional[str] = None        # free-text if vendor not in system
    reference: Optional[str] = None          # bill no / cheque no / UTR
    expense_account_code: Optional[str] = None   # override COA code
    bank_account_code: str = "1102"          # Bank Accounts (source of funds)
    gst_amount: float = 0.0                  # GST included in the amount (ITC)
    notes: Optional[str] = None
    tags: list[str] = []
    requires_approval: bool = False          # if True, stays PENDING until approved

    @field_validator("amount")
    @classmethod
    def positive_amount(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Expense amount must be positive")
        return round(v, 2)

    @field_validator("gst_amount")
    @classmethod
    def non_negative_gst(cls, v: float) -> float:
        if v < 0:
            raise ValueError("GST amount cannot be negative")
        return round(v, 2)


class UpdateExpenseRequest(BaseModel):
    date: Optional[datetime] = None
    category: Optional[ExpenseCategory] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    payment_method: Optional[PaymentMethod] = None
    vendor_name: Optional[str] = None
    reference: Optional[str] = None
    gst_amount: Optional[float] = None
    notes: Optional[str] = None
    tags: Optional[list[str]] = None


class ApproveExpenseRequest(BaseModel):
    comment: Optional[str] = None


class RejectExpenseRequest(BaseModel):
    reason: str
