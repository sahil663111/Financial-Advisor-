"""
Organization & Chart of Accounts router.
Prefix: /api/v1/business
All routes that require org-level access use OrgContext from RBAC dependencies.
"""
from fastapi import APIRouter, Depends, Request, Path
from app.auth.dependencies import get_current_user
from app.database import get_db
from app.business.organizations import service as org_service
from app.business.accounting import coa_service
from app.business.rbac.dependencies import (
    OrgContext,
    require_org_member,
    require_permission,
    require_roles,
)
from app.business.organizations.schemas import (
    OnboardingRequest,
    UpdateOrganizationRequest,
    InviteMemberRequest,
    UpdateMemberRoleRequest,
)
from app.business.accounting.schemas import (
    CreateAccountRequest,
    UpdateAccountRequest,
)
from app.business.audit.service import log_action, AuditAction
from app.utils.exceptions import not_found

router = APIRouter(tags=["Business - Organizations & COA"])


# ══════════════════════════════════════════════════════════════════════════════
# ORGANISATION MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations")
async def list_my_organizations(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    """Return all organisations the caller belongs to."""
    return await org_service.get_user_organizations(current_user["_id"], db)


@router.post("/organizations", status_code=201)
async def create_organization(
    request: Request,
    body: OnboardingRequest,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Onboard a new organisation.
    Creates the org, makes caller OWNER, and auto-generates Chart of Accounts.
    """
    return await org_service.onboard_organization(
        user_id=current_user["_id"],
        data=body,
        db=db,
        request=request,
    )


@router.get("/organizations/{org_id}")
async def get_organization(
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """Get organisation details."""
    return await org_service.get_organization(ctx.org_id, ctx.user_id, db)


@router.put("/organizations/{org_id}")
async def update_organization(
    request: Request,
    body: UpdateOrganizationRequest,
    ctx: OrgContext = Depends(require_roles("OWNER", "ADMIN")),
    db=Depends(get_db),
):
    """Update organisation profile. Requires OWNER or ADMIN."""
    return await org_service.update_organization(
        org_id=ctx.org_id,
        user_id=ctx.user_id,
        data=body,
        db=db,
        request=request,
    )


# ── Members ───────────────────────────────────────────────────────────────────

@router.get("/organizations/{org_id}/members")
async def list_members(
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """List all members of the organisation."""
    return await org_service.get_members(ctx.org_id, ctx.user_id, db)


@router.post("/organizations/{org_id}/members", status_code=201)
async def invite_member(
    request: Request,
    body: InviteMemberRequest,
    ctx: OrgContext = Depends(require_roles("OWNER", "ADMIN")),
    db=Depends(get_db),
):
    """Invite a registered user to the organisation by email."""
    return await org_service.invite_member(
        org_id=ctx.org_id,
        inviter_id=ctx.user_id,
        data=body,
        db=db,
        request=request,
    )


@router.put("/organizations/{org_id}/members/{member_user_id}/role")
async def update_member_role(
    request: Request,
    member_user_id: str,
    body: UpdateMemberRoleRequest,
    ctx: OrgContext = Depends(require_roles("OWNER", "ADMIN")),
    db=Depends(get_db),
):
    """Change a member's role."""
    return await org_service.update_member_role(
        org_id=ctx.org_id,
        member_user_id=member_user_id,
        updater_id=ctx.user_id,
        data=body,
        db=db,
        request=request,
    )


@router.delete("/organizations/{org_id}/members/{member_user_id}", status_code=204)
async def remove_member(
    request: Request,
    member_user_id: str,
    ctx: OrgContext = Depends(require_roles("OWNER", "ADMIN")),
    db=Depends(get_db),
):
    """Remove a member from the organisation."""
    await org_service.remove_member(
        org_id=ctx.org_id,
        member_user_id=member_user_id,
        remover_id=ctx.user_id,
        db=db,
        request=request,
    )


# ══════════════════════════════════════════════════════════════════════════════
# CHART OF ACCOUNTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/organizations/{org_id}/accounts")
async def list_accounts(
    tree: bool = False,
    ctx: OrgContext = Depends(require_org_member),
    db=Depends(get_db),
):
    """
    Get Chart of Accounts.
    ?tree=true returns hierarchical structure.
    ?tree=false (default) returns flat list sorted by code.
    """
    if tree:
        return await coa_service.get_accounts_tree(ctx.org_id, db)
    return await coa_service.get_accounts_flat(ctx.org_id, db)


@router.post("/organizations/{org_id}/accounts", status_code=201)
async def create_account(
    request: Request,
    body: CreateAccountRequest,
    ctx: OrgContext = Depends(require_permission("create")),
    db=Depends(get_db),
):
    """Create a custom account in the Chart of Accounts."""
    data = body.model_dump()
    account = await coa_service.create_account(ctx.org_id, data, db)

    await log_action(
        db,
        org_id=ctx.org_id,
        user_id=ctx.user_id,
        action=AuditAction.CREATE_ACCOUNT,
        entity_type="account",
        entity_id=account["_id"],
        new_value={"code": body.code, "name": body.name, "type": body.account_type.value},
        request=request,
    )
    return account


@router.put("/organizations/{org_id}/accounts/{account_id}")
async def update_account(
    request: Request,
    account_id: str,
    body: UpdateAccountRequest,
    ctx: OrgContext = Depends(require_permission("update")),
    db=Depends(get_db),
):
    """Update an account. System accounts only allow name/description edits."""
    updates = body.model_dump(exclude_none=True)
    account = await coa_service.update_account(ctx.org_id, account_id, updates, db)

    await log_action(
        db,
        org_id=ctx.org_id,
        user_id=ctx.user_id,
        action=AuditAction.UPDATE_ACCOUNT,
        entity_type="account",
        entity_id=account_id,
        new_value=updates,
        request=request,
    )
    return account


@router.delete("/organizations/{org_id}/accounts/{account_id}", status_code=204)
async def deactivate_account(
    request: Request,
    account_id: str,
    ctx: OrgContext = Depends(require_permission("delete")),
    db=Depends(get_db),
):
    """Soft-delete a custom account. System accounts and accounts with balances cannot be deactivated."""
    await coa_service.deactivate_account(ctx.org_id, account_id, db)

    await log_action(
        db,
        org_id=ctx.org_id,
        user_id=ctx.user_id,
        action=AuditAction.DEACTIVATE_ACCOUNT,
        entity_type="account",
        entity_id=account_id,
        request=request,
    )


# ── Audit log (read-only) ─────────────────────────────────────────────────────

@router.get("/organizations/{org_id}/audit-log")
async def get_audit_log(
    page: int = 1,
    limit: int = 50,
    entity_type: str = None,
    ctx: OrgContext = Depends(require_permission("view_sensitive")),
    db=Depends(get_db),
):
    """
    Get audit log for the organisation.
    Requires view_sensitive permission (OWNER, ADMIN, CFO, CA, AUDITOR).
    """
    query: dict = {"org_id": ctx.org_id}
    if entity_type:
        query["entity_type"] = entity_type

    skip = (page - 1) * limit
    total = await db.audit_logs.count_documents(query)
    cursor = db.audit_logs.find(query).sort("timestamp", -1).skip(skip).limit(limit)

    logs = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        doc["timestamp"] = doc["timestamp"].isoformat()
        logs.append(doc)

    return {
        "data": logs,
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit,
    }
