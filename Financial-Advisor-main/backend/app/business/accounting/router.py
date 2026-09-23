"""
Accounting router — Phase 2.
Prefix: /api/v1/business/organizations/{org_id}/accounting

All write operations require at minimum 'create' permission.
Reading statements requires 'view_statements' permission.
Voiding requires 'approve' permission (CFO / OWNER / ADMIN / CA).
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Request, Query

from app.database import get_db
from app.business.rbac.dependencies import (
    OrgContext,
    require_org_member,
    require_permission,
)
from app.business.accounting.journal_schemas import (
    CreateJournalEntryRequest,
    VoidJournalRequest,
)
from app.business.accounting import (
    journal_service,
    ledger_service,
    trial_balance_service,
)

router = APIRouter(tags=["Business - Accounting"])


# ══════════════════════════════════════════════════════════════════════════════
# JOURNAL ENTRIES
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/organizations/{org_id}/accounting/journal-entries", status_code=201)
async def create_journal_entry(
    request: Request,
    body: CreateJournalEntryRequest,
    ctx: OrgContext = Depends(require_permission("create")),
    db=Depends(get_db),
):
    """
    Create and POST a journal entry.
    Hard constraint: sum(debits) must equal sum(credits) — returns 400 if not.
    All account codes must exist in the organisation's Chart of Accounts.
    """
    return await journal_service.create_journal_entry(
        org_id=ctx.org_id,
        user_id=ctx.user_id,
        data=body,
        db=db,
        request=request,
    )


@router.get("/organizations/{org_id}/accounting/journal-entries")
async def list_journal_entries(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    reference: Optional[str] = None,
    account_code: Optional[str] = None,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """List journal entries with optional filters."""
    return await journal_service.list_journal_entries(
        org_id=ctx.org_id,
        db=db,
        page=page,
        limit=limit,
        status=status,
        start_date=start_date,
        end_date=end_date,
        reference=reference,
        account_code=account_code,
    )


@router.get("/organizations/{org_id}/accounting/journal-entries/{entry_id}")
async def get_journal_entry(
    entry_id: str,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """Fetch a single journal entry by ID."""
    return await journal_service.get_journal_entry(ctx.org_id, entry_id, db)


@router.post("/organizations/{org_id}/accounting/journal-entries/{entry_id}/void")
async def void_journal_entry(
    request: Request,
    entry_id: str,
    body: VoidJournalRequest,
    ctx: OrgContext = Depends(require_permission("approve")),
    db=Depends(get_db),
):
    """
    Void a posted journal entry.
    Creates a reversing entry to undo balance changes.
    Requires 'approve' permission (OWNER, ADMIN, CFO, CA, ACCOUNTANT).
    """
    return await journal_service.void_journal_entry(
        org_id=ctx.org_id,
        entry_id=entry_id,
        user_id=ctx.user_id,
        reason=body.reason,
        db=db,
        request=request,
    )


# ══════════════════════════════════════════════════════════════════════════════
# LEDGER
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/accounting/ledger/{account_code}")
async def get_ledger(
    account_code: str,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """
    Get the general ledger for a specific account.
    Returns all transactions affecting the account with running balance.
    """
    return await ledger_service.get_ledger(
        org_id=ctx.org_id,
        account_code=account_code,
        db=db,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/organizations/{org_id}/accounting/account-balances")
async def get_account_balances(
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """Get current balance for all active accounts. Used by dashboards."""
    return await ledger_service.get_all_account_balances(ctx.org_id, db)


# ══════════════════════════════════════════════════════════════════════════════
# TRIAL BALANCE
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/accounting/trial-balance")
async def get_trial_balance(
    ctx: OrgContext = Depends(require_permission("view_statements")),
    db=Depends(get_db),
):
    """
    Generate Trial Balance as of now.
    Requires view_statements permission.
    Returns is_balanced=true when total debits equal total credits.
    """
    return await trial_balance_service.get_trial_balance(ctx.org_id, db)
