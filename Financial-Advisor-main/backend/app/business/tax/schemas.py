"""
Phase 6 — Tax schemas.
Covers GST, TDS, configurable tax rules, and compliance calendar.
"""
from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, field_validator
from enum import Enum


# ══════════════════════════════════════════════════════════════════════════════
# ENUMS
# ══════════════════════════════════════════════════════════════════════════════

class TaxRuleType(str, Enum):
    GST = "GST"
    TDS = "TDS"
    PROFESSIONAL_TAX = "PROFESSIONAL_TAX"
    OTHER = "OTHER"


class GSTCategory(str, Enum):
    """Common GST rate categories."""
    EXEMPT = "EXEMPT"                 # 0%
    GST_5 = "GST_5"                   # 5%
    GST_12 = "GST_12"                 # 12%
    GST_18 = "GST_18"                 # 18%
    GST_28 = "GST_28"                 # 28%


class TDSSection(str, Enum):
    """Common TDS sections under the Income Tax Act."""
    SEC_192 = "192"       # Salary
    SEC_194A = "194A"     # Interest (other than on securities)
    SEC_194C = "194C"     # Contractors / sub-contractors
    SEC_194H = "194H"     # Commission / brokerage
    SEC_194I_A = "194I_A" # Rent — plant & machinery (2%)
    SEC_194I_B = "194I_B" # Rent — land/building/furniture (10%)
    SEC_194J = "194J"     # Professional / technical fees
    SEC_194Q = "194Q"     # Purchase of goods
    SEC_194R = "194R"     # Perquisites / benefits
    SEC_195 = "195"       # Payments to non-residents
    OTHER = "OTHER"


class TDSDepositStatus(str, Enum):
    DEDUCTED = "DEDUCTED"         # TDS deducted, not yet deposited
    DEPOSITED = "DEPOSITED"       # Deposited to govt
    OVERDUE = "OVERDUE"           # Past deposit deadline


class TaxCalendarStatus(str, Enum):
    UPCOMING = "UPCOMING"
    DUE = "DUE"           # Within 7 days
    OVERDUE = "OVERDUE"
    COMPLETED = "COMPLETED"


class GSTReturnPeriod(str, Enum):
    MONTHLY = "MONTHLY"
    QUARTERLY = "QUARTERLY"


# ══════════════════════════════════════════════════════════════════════════════
# TAX RULES
# ══════════════════════════════════════════════════════════════════════════════

class CreateTaxRuleRequest(BaseModel):
    tax_type: TaxRuleType
    section: str                            # e.g. "194C" for TDS, "GST_18" for GST
    description: str                        # e.g. "TDS on contractor payments"
    rate_pct: float                          # e.g. 1.0, 2.0, 10.0, 18.0
    threshold: float = 0.0                  # Min amount before tax applies
    effective_from: datetime
    effective_to: Optional[datetime] = None  # None = currently active
    jurisdiction: str = "IN"                 # Country / state code
    applicable_to: Optional[str] = None     # "INDIVIDUAL" / "COMPANY" / None=both

    @field_validator("rate_pct")
    @classmethod
    def rate_valid(cls, v: float) -> float:
        if not 0 <= v <= 100:
            raise ValueError("Rate must be between 0 and 100")
        return round(v, 2)


class UpdateTaxRuleRequest(BaseModel):
    description: Optional[str] = None
    rate_pct: Optional[float] = None
    threshold: Optional[float] = None
    effective_to: Optional[datetime] = None
    jurisdiction: Optional[str] = None
    applicable_to: Optional[str] = None
    is_active: Optional[bool] = None


# ══════════════════════════════════════════════════════════════════════════════
# TDS RECORDS
# ══════════════════════════════════════════════════════════════════════════════

class RecordTDSRequest(BaseModel):
    """Record a TDS deduction on a vendor/other payment."""
    section: TDSSection
    deductee_type: str = "VENDOR"           # VENDOR / EMPLOYEE / OTHER
    deductee_id: Optional[str] = None       # vendor_id or employee_id
    deductee_name: str
    deductee_pan: Optional[str] = None
    gross_amount: float                      # Payment amount before TDS
    tds_rate_pct: float                      # Applied rate
    tds_amount: float                        # Deducted amount
    payment_date: datetime
    invoice_or_ref: Optional[str] = None     # Bill / invoice reference
    description: Optional[str] = None

    @field_validator("gross_amount", "tds_amount")
    @classmethod
    def positive(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Amount cannot be negative")
        return round(v, 2)


class MarkTDSDepositedRequest(BaseModel):
    """Mark one or more TDS records as deposited."""
    record_ids: list[str]
    challan_number: str
    bsr_code: Optional[str] = None          # BSR code of the bank
    deposit_date: datetime
    deposit_amount: float

    @field_validator("record_ids")
    @classmethod
    def at_least_one(cls, v: list) -> list:
        if not v:
            raise ValueError("At least one record ID required")
        return v


# ══════════════════════════════════════════════════════════════════════════════
# QUERY FILTERS
# ══════════════════════════════════════════════════════════════════════════════

class GSTSummaryParams(BaseModel):
    """Query params for GST summary."""
    period_start: datetime
    period_end: datetime


class TDSSummaryParams(BaseModel):
    """Query params for TDS summary."""
    quarter: Optional[int] = None       # 1-4
    financial_year: Optional[str] = None  # e.g. "2024-25"
