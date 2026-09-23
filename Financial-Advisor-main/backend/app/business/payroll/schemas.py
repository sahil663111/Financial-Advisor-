"""
Payroll & Employee schemas — Phase 5.

Salary structure:
  Gross = Basic + HRA + Special Allowance + Other Allowances
  Deductions = PF Employee + ESIC Employee + TDS + Other Deductions
  Net = Gross - Deductions

Indian statutory rates (configurable):
  PF Employee:  12% of Basic (capped at ₹1,800/month = 12% of ₹15,000)
  PF Employer:  12% of Basic (expense to company)
  ESIC Employee: 0.75% of Gross (if Gross <= ₹21,000/month)
  ESIC Employer: 3.25% of Gross (if Gross <= ₹21,000/month)
  TDS: calculated separately based on annual income projection
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator
from enum import Enum


# ── Enums ─────────────────────────────────────────────────────────────────────

class EmploymentType(str, Enum):
    FULL_TIME  = "FULL_TIME"
    PART_TIME  = "PART_TIME"
    CONTRACT   = "CONTRACT"
    INTERN     = "INTERN"


class EmployeeStatus(str, Enum):
    ACTIVE     = "ACTIVE"
    INACTIVE   = "INACTIVE"
    TERMINATED = "TERMINATED"


class PayrollRunStatus(str, Enum):
    DRAFT     = "DRAFT"
    PROCESSED = "PROCESSED"
    APPROVED  = "APPROVED"
    PAID      = "PAID"


# ── Statutory rate defaults (FY 2024-25) ─────────────────────────────────────
PF_EMPLOYEE_RATE     = 0.12   # 12% of basic
PF_EMPLOYER_RATE     = 0.12   # 12% of basic
PF_WAGE_CEILING      = 15000  # PF calculated on basic up to ₹15,000
ESIC_EMPLOYEE_RATE   = 0.0075 # 0.75% of gross
ESIC_EMPLOYER_RATE   = 0.0325 # 3.25% of gross
ESIC_WAGE_CEILING    = 21000  # ESIC applicable only if gross <= ₹21,000


# ── Employee ──────────────────────────────────────────────────────────────────

class CreateEmployeeRequest(BaseModel):
    employee_code: Optional[str] = None    # auto-generated if not provided
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    employment_type: EmploymentType = EmploymentType.FULL_TIME
    date_of_joining: datetime
    date_of_birth: Optional[datetime] = None
    pan_number: Optional[str] = None
    aadhaar_number: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    # Salary structure
    basic_salary: float = 0.0
    hra: float = 0.0                       # House Rent Allowance
    special_allowance: float = 0.0
    other_allowances: float = 0.0
    # Statutory
    pf_applicable: bool = True
    esic_applicable: bool = True           # auto-set based on gross at run time
    tds_monthly: float = 0.0               # estimated monthly TDS
    professional_tax: float = 200.0        # state PT (default ₹200/month)
    # Custom deductions
    other_deductions: float = 0.0
    other_deductions_label: Optional[str] = None

    @field_validator("basic_salary", "hra", "special_allowance",
                     "other_allowances", "tds_monthly",
                     "professional_tax", "other_deductions")
    @classmethod
    def non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Salary components cannot be negative")
        return round(v, 2)


class UpdateEmployeeRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    employment_type: Optional[EmploymentType] = None
    pan_number: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    basic_salary: Optional[float] = None
    hra: Optional[float] = None
    special_allowance: Optional[float] = None
    other_allowances: Optional[float] = None
    tds_monthly: Optional[float] = None
    professional_tax: Optional[float] = None
    other_deductions: Optional[float] = None
    other_deductions_label: Optional[str] = None
    pf_applicable: Optional[bool] = None
    status: Optional[EmployeeStatus] = None


# ── Payroll run ───────────────────────────────────────────────────────────────

class RunPayrollRequest(BaseModel):
    period_year: int
    period_month: int                      # 1–12
    payment_date: datetime
    notes: Optional[str] = None
    # Accounting codes
    salary_expense_account: str = "5301"   # Salaries & Wages
    pf_expense_account: str = "5302"       # Employer PF
    esic_expense_account: str = "5303"     # Employer ESIC
    bank_account_code: str = "1102"        # Bank (payment source)
    salary_payable_account: str = "2102"   # Salaries Payable
    tds_payable_account: str = "2103"      # TDS Payable
    pf_payable_account: str = "2105"       # PF Payable
    esic_payable_account: str = "2106"     # ESIC Payable

    @field_validator("period_month")
    @classmethod
    def valid_month(cls, v: int) -> int:
        if not 1 <= v <= 12:
            raise ValueError("period_month must be between 1 and 12")
        return v


class ApprovePayrollRequest(BaseModel):
    comment: Optional[str] = None


class MarkPayrollPaidRequest(BaseModel):
    payment_reference: Optional[str] = None
    payment_date: Optional[datetime] = None
