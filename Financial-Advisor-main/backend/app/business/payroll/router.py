"""
Payroll router — Phase 5.
Prefix: /api/v1/business/organizations/{org_id}

Permissions:
  Employees list/read → any member
  Employee create/update → 'create'/'update' (HR_PAYROLL / OWNER / ADMIN)
  Employee terminate → 'approve'
  Payroll run → 'manage_payroll'
  Payroll approve → 'approve'
  Payroll mark paid → 'approve'
  Payslip → any member (their own), sensitive (view_sensitive) for others
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Request, Query

from app.database import get_db
from app.business.rbac.dependencies import (
    OrgContext, require_org_member, require_permission,
)
from app.business.payroll.schemas import (
    CreateEmployeeRequest, UpdateEmployeeRequest,
    RunPayrollRequest, ApprovePayrollRequest, MarkPayrollPaidRequest,
)
from app.business.payroll import employee_service, payroll_service
from app.utils.exceptions import bad_request

router = APIRouter(tags=["Business - Payroll"])


# ══════════════════════════════════════════════════════════════════════════════
# EMPLOYEES
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/employees")
async def list_employees(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    department: Optional[str] = None,
    status: Optional[str] = None,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    return await employee_service.list_employees(
        ctx.org_id, db,
        search=search, department=department,
        status=status, page=page, limit=limit,
    )


@router.post("/organizations/{org_id}/employees", status_code=201)
async def create_employee(
    request: Request, body: CreateEmployeeRequest,
    ctx: OrgContext = Depends(require_permission("manage_payroll")),
    db=Depends(get_db),
):
    return await employee_service.create_employee(
        ctx.org_id, ctx.user_id, body, db, request
    )


@router.get("/organizations/{org_id}/employees/departments")
async def get_department_summary(
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """Department-wise headcount and payroll cost summary."""
    return await employee_service.get_department_summary(ctx.org_id, db)


@router.get("/organizations/{org_id}/employees/{employee_id}")
async def get_employee(
    employee_id: str,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    return await employee_service.get_employee(ctx.org_id, employee_id, db)


@router.put("/organizations/{org_id}/employees/{employee_id}")
async def update_employee(
    request: Request, employee_id: str, body: UpdateEmployeeRequest,
    ctx: OrgContext = Depends(require_permission("manage_payroll")),
    db=Depends(get_db),
):
    return await employee_service.update_employee(
        ctx.org_id, employee_id, ctx.user_id, body, db, request
    )


@router.post("/organizations/{org_id}/employees/{employee_id}/terminate")
async def terminate_employee(
    request: Request,
    employee_id: str,
    reason: Optional[str] = None,
    ctx: OrgContext = Depends(require_permission("approve")),
    db=Depends(get_db),
):
    return await employee_service.terminate_employee(
        ctx.org_id, employee_id, ctx.user_id, reason, db, request
    )


# ══════════════════════════════════════════════════════════════════════════════
# PAYROLL RUNS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/payroll")
async def list_payroll_runs(
    page: int = Query(1, ge=1),
    limit: int = Query(24, ge=1, le=100),
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    return await payroll_service.list_payroll_runs(
        ctx.org_id, db, page=page, limit=limit
    )


@router.post("/organizations/{org_id}/payroll/run", status_code=201)
async def run_payroll(
    request: Request, body: RunPayrollRequest,
    ctx: OrgContext = Depends(require_permission("manage_payroll")),
    db=Depends(get_db),
):
    """
    Run payroll for a given month/year.
    Calculates gross, PF, ESIC, TDS, PT and net for all active employees.
    Creates a DRAFT payroll run — must be approved to post to accounting.
    """
    return await payroll_service.run_payroll(
        ctx.org_id, ctx.user_id, body, db, request
    )


@router.get("/organizations/{org_id}/payroll/{run_id}")
async def get_payroll_run(
    run_id: str,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    return await payroll_service.get_payroll_run(ctx.org_id, run_id, db)


@router.post("/organizations/{org_id}/payroll/{run_id}/approve")
async def approve_payroll(
    request: Request, run_id: str, body: ApprovePayrollRequest,
    ctx: OrgContext = Depends(require_permission("approve")),
    db=Depends(get_db),
):
    """
    Approve a DRAFT payroll run.
    Posts the full payroll journal entry to accounting.
    """
    return await payroll_service.approve_payroll(
        ctx.org_id, run_id, ctx.user_id, body.comment, db, request
    )


@router.post("/organizations/{org_id}/payroll/{run_id}/mark-paid")
async def mark_payroll_paid(
    request: Request, run_id: str, body: MarkPayrollPaidRequest,
    ctx: OrgContext = Depends(require_permission("approve")),
    db=Depends(get_db),
):
    """
    Mark an APPROVED payroll run as PAID.
    Posts the bank disbursement journal: DR Salaries Payable / CR Bank.
    """
    return await payroll_service.mark_payroll_paid(
        ctx.org_id, run_id, ctx.user_id,
        body.payment_reference, body.payment_date,
        db, request,
    )


@router.get("/organizations/{org_id}/payroll/{run_id}/payslip/{employee_id}")
async def get_payslip(
    run_id: str, employee_id: str,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """Get individual payslip from a payroll run."""
    return await payroll_service.get_payslip(
        ctx.org_id, run_id, employee_id, db
    )
