"""
Business Expense router — Phase 4.
Prefix: /api/v1/business/organizations/{org_id}

Permissions:
  List / Read  → any org member
  Create       → 'create' permission
  Update       → 'update' permission (only PENDING expenses)
  Delete       → 'delete' permission (only PENDING expenses)
  Approve      → 'approve' permission (FINANCE_MANAGER / CFO / OWNER / ADMIN / CA)
  Reject       → 'approve' permission
  Analytics    → any org member
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Request, Query, UploadFile, File

from app.database import get_db
from app.business.rbac.dependencies import (
    OrgContext, require_org_member, require_permission,
)
from app.business.expenses.schemas import (
    CreateExpenseRequest, UpdateExpenseRequest,
    ApproveExpenseRequest, RejectExpenseRequest,
    ExpenseCategory,
)
from app.business.expenses import service
from app.business.expenses import ocr_service

router = APIRouter(tags=["Business - Expenses"])

@router.post("/organizations/{org_id}/expenses/parse-receipt")
async def parse_receipt(
    file: UploadFile = File(...),
    ctx: OrgContext = Depends(require_org_member),
):
    """Parse a receipt image and return extracted structured data."""
    image_bytes = await file.read()
    return await ocr_service.process_receipt_image(image_bytes, file.content_type)


@router.get("/organizations/{org_id}/expenses")
async def list_expenses(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    category: Optional[str] = None,
    approval_status: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    search: Optional[str] = None,
    vendor_id: Optional[str] = None,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """List business expenses with optional filters."""
    return await service.list_expenses(
        org_id=ctx.org_id, db=db,
        page=page, limit=limit,
        category=category, approval_status=approval_status,
        start_date=start_date, end_date=end_date,
        search=search, vendor_id=vendor_id,
    )


@router.post("/organizations/{org_id}/expenses", status_code=201)
async def create_expense(
    request: Request,
    body: CreateExpenseRequest,
    ctx: OrgContext = Depends(require_permission("create")),
    db=Depends(get_db),
):
    """
    Create a business expense.
    If requires_approval=True the expense stays PENDING until approved.
    Otherwise it is auto-approved and the journal entry is posted immediately.
    """
    return await service.create_expense(
        org_id=ctx.org_id, user_id=ctx.user_id,
        data=body, db=db, request=request,
    )


@router.get("/organizations/{org_id}/expenses/analytics")
async def get_expense_analytics(
    months: int = Query(6, ge=1, le=24),
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """Expense analytics: monthly trend, category split, MoM change, top vendors."""
    return await service.get_expense_analytics(
        org_id=ctx.org_id, db=db, months=months,
    )


@router.get("/organizations/{org_id}/expenses/{expense_id}")
async def get_expense(
    expense_id: str,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    return await service.get_expense(ctx.org_id, expense_id, db)


@router.put("/organizations/{org_id}/expenses/{expense_id}")
async def update_expense(
    request: Request,
    expense_id: str,
    body: UpdateExpenseRequest,
    ctx: OrgContext = Depends(require_permission("update")),
    db=Depends(get_db),
):
    """Update a PENDING expense. Approved expenses cannot be edited."""
    return await service.update_expense(
        org_id=ctx.org_id, expense_id=expense_id,
        user_id=ctx.user_id, data=body, db=db, request=request,
    )


@router.delete("/organizations/{org_id}/expenses/{expense_id}", status_code=204)
async def delete_expense(
    request: Request,
    expense_id: str,
    ctx: OrgContext = Depends(require_permission("delete")),
    db=Depends(get_db),
):
    """Delete a PENDING expense. Approved expenses cannot be deleted."""
    await service.delete_expense(
        org_id=ctx.org_id, expense_id=expense_id,
        user_id=ctx.user_id, db=db, request=request,
    )


@router.post("/organizations/{org_id}/expenses/{expense_id}/approve")
async def approve_expense(
    request: Request,
    expense_id: str,
    body: ApproveExpenseRequest,
    ctx: OrgContext = Depends(require_permission("approve")),
    db=Depends(get_db),
):
    """
    Approve a PENDING expense.
    Posts the journal entry: DR Expense / DR GST ITC / CR Bank.
    Requires 'approve' permission.
    """
    return await service.approve_expense(
        org_id=ctx.org_id, expense_id=expense_id,
        approver_id=ctx.user_id, comment=body.comment,
        db=db, request=request,
    )


@router.post("/organizations/{org_id}/expenses/{expense_id}/reject")
async def reject_expense(
    request: Request,
    expense_id: str,
    body: RejectExpenseRequest,
    ctx: OrgContext = Depends(require_permission("approve")),
    db=Depends(get_db),
):
    """
    Reject a PENDING or APPROVED expense.
    If APPROVED, voids the journal entry automatically.
    """
    return await service.reject_expense(
        org_id=ctx.org_id, expense_id=expense_id,
        rejector_id=ctx.user_id, reason=body.reason,
        db=db, request=request,
    )
