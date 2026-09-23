"""
Phase 3 schemas: Customers, Vendors, Invoices, Invoice Items, Payments, Bills.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator
from enum import Enum


# ── Enums ─────────────────────────────────────────────────────────────────────

class InvoiceStatus(str, Enum):
    DRAFT         = "DRAFT"
    SENT          = "SENT"
    PARTIALLY_PAID = "PARTIALLY_PAID"
    PAID          = "PAID"
    OVERDUE       = "OVERDUE"
    CANCELLED     = "CANCELLED"


class BillStatus(str, Enum):
    PENDING  = "PENDING"
    PARTIAL  = "PARTIAL"
    PAID     = "PAID"
    OVERDUE  = "OVERDUE"
    DISPUTED = "DISPUTED"


class GSTType(str, Enum):
    CGST_SGST = "CGST_SGST"   # intra-state
    IGST      = "IGST"         # inter-state
    EXEMPT    = "EXEMPT"


# ── Customer ──────────────────────────────────────────────────────────────────

class CreateCustomerRequest(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    gstin: Optional[str] = None
    pan_number: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: str = "India"
    credit_limit: float = 0.0
    payment_terms_days: int = 30         # default: Net-30
    notes: Optional[str] = None


class UpdateCustomerRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    gstin: Optional[str] = None
    pan_number: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    credit_limit: Optional[float] = None
    payment_terms_days: Optional[int] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


# ── Vendor ────────────────────────────────────────────────────────────────────

class CreateVendorRequest(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    gstin: Optional[str] = None
    pan_number: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: str = "India"
    payment_terms_days: int = 30
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    notes: Optional[str] = None


class UpdateVendorRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    gstin: Optional[str] = None
    pan_number: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    payment_terms_days: Optional[int] = None
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


# ── Invoice ───────────────────────────────────────────────────────────────────

class InvoiceItemRequest(BaseModel):
    description: str
    quantity: float
    unit_price: float
    discount_pct: float = 0.0           # 0–100
    gst_rate_pct: float = 18.0          # 0, 5, 12, 18, 28
    gst_type: GSTType = GSTType.CGST_SGST
    account_code: Optional[str] = None  # Revenue account to credit (e.g. 4002)

    @field_validator("quantity", "unit_price")
    @classmethod
    def positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Quantity and unit price must be positive")
        return round(v, 4)

    @field_validator("discount_pct", "gst_rate_pct")
    @classmethod
    def pct_range(cls, v: float) -> float:
        if not 0 <= v <= 100:
            raise ValueError("Percentage must be between 0 and 100")
        return round(v, 2)


class CreateInvoiceRequest(BaseModel):
    customer_id: str
    issue_date: datetime
    due_date: datetime
    items: list[InvoiceItemRequest]
    notes: Optional[str] = None
    payment_terms_days: Optional[int] = None   # overrides customer default
    billing_address: Optional[str] = None
    # Accounts to use — defaults to COA system accounts if None
    receivable_account_code: str = "1200"      # Accounts Receivable
    revenue_account_code: str = "4002"         # Service Revenue (default)
    gst_payable_account_code: str = "2104"     # GST Payable (Output)

    @field_validator("items")
    @classmethod
    def at_least_one_item(cls, v: list) -> list:
        if not v:
            raise ValueError("Invoice must have at least one line item")
        return v


class UpdateInvoiceRequest(BaseModel):
    issue_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = None
    billing_address: Optional[str] = None
    items: Optional[list[InvoiceItemRequest]] = None   # replaces all items


# ── Payment ───────────────────────────────────────────────────────────────────

class RecordPaymentRequest(BaseModel):
    amount: float
    payment_date: datetime
    payment_method: str = "BANK_TRANSFER"   # BANK_TRANSFER / UPI / CASH / CHEQUE
    reference: Optional[str] = None         # cheque no / UTR / txn ID
    bank_account_code: str = "1102"         # Bank Accounts (COA code)
    notes: Optional[str] = None

    @field_validator("amount")
    @classmethod
    def positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Payment amount must be positive")
        return round(v, 2)


# ── Vendor Bill (Payable) ─────────────────────────────────────────────────────

class CreateBillRequest(BaseModel):
    vendor_id: str
    bill_number: Optional[str] = None      # vendor's invoice number
    bill_date: datetime
    due_date: datetime
    items: list[InvoiceItemRequest]        # reuse same item model
    notes: Optional[str] = None
    payable_account_code: str = "2101"     # Accounts Payable
    expense_account_code: str = "5200"     # Operating Expenses (default)


class RecordBillPaymentRequest(BaseModel):
    amount: float
    payment_date: datetime
    payment_method: str = "BANK_TRANSFER"
    reference: Optional[str] = None
    bank_account_code: str = "1102"
    notes: Optional[str] = None

    @field_validator("amount")
    @classmethod
    def positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Payment amount must be positive")
        return round(v, 2)
