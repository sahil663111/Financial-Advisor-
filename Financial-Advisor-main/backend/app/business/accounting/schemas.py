"""
Chart of Accounts schemas.
Phase 1 covers COA structure only.
Journal entries come in Phase 2.
"""
from typing import Optional
from pydantic import BaseModel
from enum import Enum


class AccountType(str, Enum):
    ASSET = "ASSET"
    LIABILITY = "LIABILITY"
    EQUITY = "EQUITY"
    REVENUE = "REVENUE"
    EXPENSE = "EXPENSE"


class AccountSubType(str, Enum):
    # Assets
    CURRENT_ASSET = "CURRENT_ASSET"
    FIXED_ASSET = "FIXED_ASSET"
    BANK = "BANK"
    CASH = "CASH"
    ACCOUNTS_RECEIVABLE = "ACCOUNTS_RECEIVABLE"
    INVENTORY = "INVENTORY"
    OTHER_ASSET = "OTHER_ASSET"
    # Liabilities
    CURRENT_LIABILITY = "CURRENT_LIABILITY"
    LONG_TERM_LIABILITY = "LONG_TERM_LIABILITY"
    ACCOUNTS_PAYABLE = "ACCOUNTS_PAYABLE"
    TAX_PAYABLE = "TAX_PAYABLE"
    LOANS = "LOANS"
    OTHER_LIABILITY = "OTHER_LIABILITY"
    # Equity
    OWNERS_EQUITY = "OWNERS_EQUITY"
    RETAINED_EARNINGS = "RETAINED_EARNINGS"
    # Revenue
    OPERATING_REVENUE = "OPERATING_REVENUE"
    OTHER_INCOME = "OTHER_INCOME"
    # Expenses
    COST_OF_GOODS = "COST_OF_GOODS"
    OPERATING_EXPENSE = "OPERATING_EXPENSE"
    PAYROLL_EXPENSE = "PAYROLL_EXPENSE"
    TAX_EXPENSE = "TAX_EXPENSE"
    DEPRECIATION = "DEPRECIATION"
    INTEREST_EXPENSE = "INTEREST_EXPENSE"
    OTHER_EXPENSE = "OTHER_EXPENSE"


class CreateAccountRequest(BaseModel):
    code: str                               # e.g. "1001"
    name: str                               # e.g. "Cash in Hand"
    account_type: AccountType
    account_sub_type: AccountSubType
    parent_code: Optional[str] = None       # None = top-level account
    description: Optional[str] = None
    is_bank_account: bool = False
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    opening_balance: float = 0.0


class UpdateAccountRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None


class AccountResponse(BaseModel):
    id: str
    org_id: str
    code: str
    name: str
    account_type: str
    account_sub_type: str
    parent_code: Optional[str]
    description: Optional[str]
    is_bank_account: bool
    bank_name: Optional[str]
    bank_account_number: Optional[str]
    opening_balance: float
    current_balance: float
    is_system_account: bool     # auto-generated on onboarding, cannot delete
    is_active: bool
    # Children populated when fetching tree
    children: list["AccountResponse"] = []


AccountResponse.model_rebuild()
