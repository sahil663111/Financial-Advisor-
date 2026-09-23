"""
Phase 3 Sales router.
Prefix: /api/v1/business/organizations/{org_id}
Covers: Customers, Vendors, Invoices, Payments, Bills, Receivables, Payables.
"""
from typing import Optional
from fastapi import APIRouter, Depends, Request, Query

from app.database import get_db
from app.business.rbac.dependencies import (
    OrgContext, require_org_member, require_permission,
)
from app.business.sales import (
    customer_service, vendor_service,
    invoice_service, payment_service,
    receivables_service, payables_service,
)
from app.business.sales.schemas import (
    CreateCustomerRequest, UpdateCustomerRequest,
    CreateVendorRequest, UpdateVendorRequest,
    CreateInvoiceRequest, UpdateInvoiceRequest,
    RecordPaymentRequest,
    CreateBillRequest, RecordBillPaymentRequest,
)

router = APIRouter(tags=["Business - Sales & Payables"])


# ══════════════════════════════════════════════════════════════════════════════
# CUSTOMERS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/customers")
async def list_customers(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    return await customer_service.list_customers(ctx.org_id, db, search=search, page=page, limit=limit)


@router.post("/organizations/{org_id}/customers", status_code=201)
async def create_customer(
    request: Request, body: CreateCustomerRequest,
    ctx: OrgContext = Depends(require_permission("create")), db=Depends(get_db),
):
    return await customer_service.create_customer(ctx.org_id, ctx.user_id, body.model_dump(), db, request)


@router.get("/organizations/{org_id}/customers/{customer_id}")
async def get_customer(
    customer_id: str, ctx: OrgContext = Depends(require_org_member), db=Depends(get_db),
):
    return await customer_service.get_customer(ctx.org_id, customer_id, db)


@router.put("/organizations/{org_id}/customers/{customer_id}")
async def update_customer(
    request: Request, customer_id: str, body: UpdateCustomerRequest,
    ctx: OrgContext = Depends(require_permission("update")), db=Depends(get_db),
):
    return await customer_service.update_customer(
        ctx.org_id, customer_id, ctx.user_id, body.model_dump(exclude_none=True), db, request
    )


@router.delete("/organizations/{org_id}/customers/{customer_id}", status_code=204)
async def delete_customer(
    request: Request, customer_id: str,
    ctx: OrgContext = Depends(require_permission("delete")), db=Depends(get_db),
):
    await customer_service.delete_customer(ctx.org_id, customer_id, ctx.user_id, db, request)


# ══════════════════════════════════════════════════════════════════════════════
# VENDORS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/vendors")
async def list_vendors(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    ctx: OrgContext = Depends(require_org_member), db=Depends(get_db),
):
    return await vendor_service.list_vendors(ctx.org_id, db, search=search, page=page, limit=limit)


@router.post("/organizations/{org_id}/vendors", status_code=201)
async def create_vendor(
    request: Request, body: CreateVendorRequest,
    ctx: OrgContext = Depends(require_permission("create")), db=Depends(get_db),
):
    return await vendor_service.create_vendor(ctx.org_id, ctx.user_id, body.model_dump(), db, request)


@router.get("/organizations/{org_id}/vendors/{vendor_id}")
async def get_vendor(
    vendor_id: str, ctx: OrgContext = Depends(require_org_member), db=Depends(get_db),
):
    return await vendor_service.get_vendor(ctx.org_id, vendor_id, db)


@router.put("/organizations/{org_id}/vendors/{vendor_id}")
async def update_vendor(
    request: Request, vendor_id: str, body: UpdateVendorRequest,
    ctx: OrgContext = Depends(require_permission("update")), db=Depends(get_db),
):
    return await vendor_service.update_vendor(
        ctx.org_id, vendor_id, ctx.user_id, body.model_dump(exclude_none=True), db, request
    )


@router.delete("/organizations/{org_id}/vendors/{vendor_id}", status_code=204)
async def delete_vendor(
    request: Request, vendor_id: str,
    ctx: OrgContext = Depends(require_permission("delete")), db=Depends(get_db),
):
    await vendor_service.delete_vendor(ctx.org_id, vendor_id, ctx.user_id, db, request)


# ══════════════════════════════════════════════════════════════════════════════
# INVOICES
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/invoices")
async def list_invoices(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    search: Optional[str] = None,
    ctx: OrgContext = Depends(require_org_member), db=Depends(get_db),
):
    return await invoice_service.list_invoices(
        ctx.org_id, db, page=page, limit=limit,
        status=status, customer_id=customer_id, search=search,
    )


@router.post("/organizations/{org_id}/invoices", status_code=201)
async def create_invoice(
    request: Request, body: CreateInvoiceRequest,
    ctx: OrgContext = Depends(require_permission("create")), db=Depends(get_db),
):
    return await invoice_service.create_invoice(ctx.org_id, ctx.user_id, body, db, request)


@router.get("/organizations/{org_id}/invoices/{invoice_id}")
async def get_invoice(
    invoice_id: str, ctx: OrgContext = Depends(require_org_member), db=Depends(get_db),
):
    return await invoice_service.get_invoice(ctx.org_id, invoice_id, db)


@router.post("/organizations/{org_id}/invoices/{invoice_id}/cancel")
async def cancel_invoice(
    request: Request, invoice_id: str,
    ctx: OrgContext = Depends(require_permission("approve")), db=Depends(get_db),
):
    return await invoice_service.cancel_invoice(ctx.org_id, invoice_id, ctx.user_id, db, request)


@router.post("/organizations/{org_id}/invoices/{invoice_id}/payments", status_code=201)
async def record_invoice_payment(
    request: Request, invoice_id: str, body: RecordPaymentRequest,
    ctx: OrgContext = Depends(require_permission("create")), db=Depends(get_db),
):
    """Record a payment against an invoice. Updates status automatically."""
    result = await payment_service.record_invoice_payment(
        ctx.org_id, invoice_id, ctx.user_id, body, db, request
    )
    if result:
        result["_id"] = str(result["_id"])
    return result


# ══════════════════════════════════════════════════════════════════════════════
# VENDOR BILLS (PAYABLES)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/bills")
async def list_bills(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = None,
    vendor_id: Optional[str] = None,
    ctx: OrgContext = Depends(require_org_member), db=Depends(get_db),
):
    return await payment_service.list_bills(
        ctx.org_id, db, page=page, limit=limit, status=status, vendor_id=vendor_id
    )


@router.post("/organizations/{org_id}/bills", status_code=201)
async def create_bill(
    request: Request, body: CreateBillRequest,
    ctx: OrgContext = Depends(require_permission("create")), db=Depends(get_db),
):
    return await payment_service.create_bill(ctx.org_id, ctx.user_id, body, db, request)


@router.post("/organizations/{org_id}/bills/{bill_id}/payments", status_code=201)
async def record_bill_payment(
    request: Request, bill_id: str, body: RecordBillPaymentRequest,
    ctx: OrgContext = Depends(require_permission("create")), db=Depends(get_db),
):
    return await payment_service.record_bill_payment(
        ctx.org_id, bill_id, ctx.user_id, body, db, request
    )


# ══════════════════════════════════════════════════════════════════════════════
# RECEIVABLES & PAYABLES AGING
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/receivables/aging")
async def get_receivables_aging(
    ctx: OrgContext = Depends(require_org_member), db=Depends(get_db),
):
    """Receivables aging report with 0-30, 31-60, 61-90, 90+ buckets."""
    return await receivables_service.get_receivables_aging(ctx.org_id, db)


@router.get("/organizations/{org_id}/payables/aging")
async def get_payables_aging(
    ctx: OrgContext = Depends(require_org_member), db=Depends(get_db),
):
    """Payables aging report for vendor bills."""
    return await payables_service.get_payables_aging(ctx.org_id, db)
