"""
RBAC FastAPI dependencies for business routes.

Usage in a route:
    @router.get("/{org_id}/something")
    async def my_route(
        org_id: str,
        ctx: OrgContext = Depends(require_org_member),      # any member
        ctx: OrgContext = Depends(require_permission("create")),  # specific permission
    ):
        ...

The OrgContext object carries the resolved org, member record, and user —
so routes never need to re-query these.
"""
from dataclasses import dataclass
from functools import lru_cache
from typing import Callable
from fastapi import Depends, Path

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.utils.exceptions import forbidden, not_found
from app.business.organizations.schemas import ROLE_PERMISSIONS
from bson import ObjectId


@dataclass
class OrgContext:
    """Resolved context injected into every business route."""
    org: dict           # full org document
    member: dict        # org_members document for this user
    user: dict          # users document
    org_id: str
    user_id: str
    role: str
    permissions: set[str]

    def has_permission(self, perm: str) -> bool:
        return perm in self.permissions

    def require_permission(self, perm: str) -> None:
        if not self.has_permission(perm):
            raise forbidden()


# ── Core dependency ───────────────────────────────────────────────────────────

async def _resolve_org_context(
    org_id: str,
    current_user: dict,
    db,
) -> OrgContext:
    """Internal: resolve and validate org membership for a given org_id."""
    # Verify org exists
    org = await db.organizations.find_one(
        {"_id": ObjectId(org_id), "is_active": True}
    )
    if not org:
        raise not_found("Organisation")
    org["_id"] = str(org["_id"])

    # Verify membership
    member = await db.org_members.find_one(
        {"org_id": org_id, "user_id": current_user["_id"]}
    )
    if not member:
        raise forbidden()

    role = member["role"]
    permissions = ROLE_PERMISSIONS.get(role, set())

    return OrgContext(
        org=org,
        member=member,
        user=current_user,
        org_id=org_id,
        user_id=current_user["_id"],
        role=role,
        permissions=permissions,
    )


# ── Public dependency factories ───────────────────────────────────────────────

async def require_org_member(
    org_id: str = Path(...),
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db),
) -> OrgContext:
    """Require authenticated user to be any member of the org."""
    return await _resolve_org_context(org_id, current_user, db)


def require_permission(permission: str) -> Callable:
    """
    Dependency factory: require a specific permission.

    Example:
        Depends(require_permission("create"))
        Depends(require_permission("manage_payroll"))
    """
    async def _dep(
        org_id: str = Path(...),
        current_user: dict = Depends(get_current_user),
        db=Depends(get_db),
    ) -> OrgContext:
        ctx = await _resolve_org_context(org_id, current_user, db)
        ctx.require_permission(permission)
        return ctx

    # Give the dependency a unique name so FastAPI caches it correctly
    _dep.__name__ = f"require_{permission}"
    return _dep


def require_roles(*roles: str) -> Callable:
    """
    Dependency factory: require one of the specified roles.

    Example:
        Depends(require_roles("OWNER", "ADMIN"))
    """
    role_set = set(roles)

    async def _dep(
        org_id: str = Path(...),
        current_user: dict = Depends(get_current_user),
        db=Depends(get_db),
    ) -> OrgContext:
        ctx = await _resolve_org_context(org_id, current_user, db)
        if ctx.role not in role_set:
            raise forbidden()
        return ctx

    _dep.__name__ = f"require_roles_{'_'.join(sorted(roles))}"
    return _dep


# ── Convenience shorthands ────────────────────────────────────────────────────
require_owner_or_admin = require_roles("OWNER", "ADMIN")
require_financial_access = require_permission("view_statements")
require_manage_users = require_permission("manage_users")
