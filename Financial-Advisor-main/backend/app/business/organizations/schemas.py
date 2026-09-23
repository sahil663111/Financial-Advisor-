"""
Business Organization schemas — request/response validation.
All financial calculations live in services, never here.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator
from enum import Enum


class BusinessType(str, Enum):
    SOLE_PROPRIETORSHIP = "SOLE_PROPRIETORSHIP"
    PARTNERSHIP = "PARTNERSHIP"
    LLP = "LLP"
    PRIVATE_LIMITED = "PRIVATE_LIMITED"
    PUBLIC_LIMITED = "PUBLIC_LIMITED"
    STARTUP = "STARTUP"
    FREELANCER = "FREELANCER"
    OTHER = "OTHER"


class AccountingMethod(str, Enum):
    ACCRUAL = "ACCRUAL"
    CASH = "CASH"


class BusinessRole(str, Enum):
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    CFO = "CFO"
    ACCOUNTANT = "ACCOUNTANT"
    HR_PAYROLL = "HR_PAYROLL"
    FINANCE_MANAGER = "FINANCE_MANAGER"
    CA = "CA"
    AUDITOR = "AUDITOR"
    EMPLOYEE = "EMPLOYEE"
    VIEWER = "VIEWER"


# ── Role permission matrix ────────────────────────────────────────────────────
ROLE_PERMISSIONS: dict[str, set[str]] = {
    "OWNER": {
        "read", "create", "update", "delete", "approve",
        "export", "manage_payroll", "manage_taxes", "manage_users",
        "view_statements", "access_ai_cfo", "view_sensitive",
    },
    "ADMIN": {
        "read", "create", "update", "delete", "approve",
        "export", "manage_payroll", "manage_taxes", "manage_users",
        "view_statements", "access_ai_cfo", "view_sensitive",
    },
    "CFO": {
        "read", "create", "update", "approve",
        "export", "manage_taxes",
        "view_statements", "access_ai_cfo", "view_sensitive",
    },
    "ACCOUNTANT": {
        "read", "create", "update", "approve",
        "export", "view_statements",
    },
    "HR_PAYROLL": {
        "read", "create", "update",
        "manage_payroll", "export",
    },
    "FINANCE_MANAGER": {
        "read", "create", "update", "approve",
        "export", "view_statements", "access_ai_cfo",
    },
    "CA": {
        "read", "create", "update", "approve",
        "export", "manage_taxes", "view_statements",
        "access_ai_cfo", "view_sensitive",
    },
    "AUDITOR": {
        "read", "export", "view_statements", "view_sensitive",
    },
    "EMPLOYEE": {"read"},
    "VIEWER": {"read"},
}


# ── Onboarding ────────────────────────────────────────────────────────────────
class OnboardingRequest(BaseModel):
    # Identity
    name: str
    legal_name: Optional[str] = None
    business_type: BusinessType = BusinessType.PRIVATE_LIMITED
    industry: Optional[str] = None

    # Tax identifiers
    pan_number: Optional[str] = None
    gstin: Optional[str] = None
    tan: Optional[str] = None

    # Address
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: str = "India"

    # Financial settings
    financial_year_start: int = 4          # April (month number)
    accounting_method: AccountingMethod = AccountingMethod.ACCRUAL
    currency: str = "INR"
    fiscal_year_label: str = "2024-25"

    # Contact
    website: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None

    # Opening balances (for migration from paper / other systems)
    opening_cash_balance: float = 0.0
    opening_bank_balance: float = 0.0

    @field_validator("pan_number")
    @classmethod
    def pan_upper(cls, v):
        return v.upper().strip() if v else v

    @field_validator("gstin")
    @classmethod
    def gstin_upper(cls, v):
        return v.upper().strip() if v else v


class UpdateOrganizationRequest(BaseModel):
    name: Optional[str] = None
    legal_name: Optional[str] = None
    industry: Optional[str] = None
    pan_number: Optional[str] = None
    gstin: Optional[str] = None
    tan: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    website: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class InviteMemberRequest(BaseModel):
    user_email: str
    role: BusinessRole = BusinessRole.VIEWER


class UpdateMemberRoleRequest(BaseModel):
    role: BusinessRole


# ── Responses ────────────────────────────────────────────────────────────────
class OrganizationResponse(BaseModel):
    id: str
    name: str
    legal_name: Optional[str]
    business_type: str
    industry: Optional[str]
    pan_number: Optional[str]
    gstin: Optional[str]
    tan: Optional[str]
    address: Optional[str]
    city: Optional[str]
    state: Optional[str]
    pincode: Optional[str]
    country: str
    financial_year_start: int
    accounting_method: str
    currency: str
    fiscal_year_label: str
    website: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    created_at: datetime
    updated_at: datetime
    # Caller context
    user_role: Optional[str] = None
    is_owner: bool = False


class MemberResponse(BaseModel):
    id: str
    user_id: str
    user_email: str
    user_name: str
    role: str
    joined_at: datetime
