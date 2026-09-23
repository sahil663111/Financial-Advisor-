"""
Organization Service.
All business logic for company onboarding, profile management, and member management.
Routes call this service; this service calls repositories (db directly for now).
"""
from datetime import datetime
from typing import Optional
from bson import ObjectId

from app.utils.exceptions import not_found, bad_request, conflict, forbidden
from app.business.organizations.schemas import (
    OnboardingRequest, UpdateOrganizationRequest,
    InviteMemberRequest, UpdateMemberRoleRequest,
    ROLE_PERMISSIONS,
)
from app.business.accounting.coa_service import generate_default_coa
from app.business.audit.service import log_action, AuditAction


# ── Onboarding ────────────────────────────────────────────────────────────────

async def onboard_organization(
    user_id: str,
    data: OnboardingRequest,
    db,
    request=None,
) -> dict:
    """
    Create a new organisation and assign the creator as OWNER.
    Auto-generates the default Chart of Accounts.
    One user can own multiple organisations.
    """
    now = datetime.utcnow()

    # Check for duplicate GSTIN within platform (soft warning, not hard block)
    if data.gstin:
        existing_gstin = await db.organizations.find_one({"gstin": data.gstin})
        if existing_gstin:
            raise conflict(f"An organisation with GSTIN {data.gstin} already exists")

    org_doc = {
        "name": data.name,
        "legal_name": data.legal_name or data.name,
        "business_type": data.business_type.value,
        "industry": data.industry,
        "pan_number": data.pan_number,
        "gstin": data.gstin,
        "tan": data.tan,
        "address": data.address,
        "city": data.city,
        "state": data.state,
        "pincode": data.pincode,
        "country": data.country,
        "financial_year_start": data.financial_year_start,
        "accounting_method": data.accounting_method.value,
        "currency": data.currency,
        "fiscal_year_label": data.fiscal_year_label,
        "website": data.website,
        "phone": data.phone,
        "email": data.email,
        "is_active": True,
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }

    result = await db.organizations.insert_one(org_doc)
    org_id = str(result.inserted_id)

    # Make creator the OWNER
    await db.org_members.insert_one({
        "org_id": org_id,
        "user_id": user_id,
        "role": "OWNER",
        "joined_at": now,
        "invited_by": user_id,
    })

    # Auto-generate Chart of Accounts
    coa_count = await generate_default_coa(
        org_id, db,
        opening_cash=data.opening_cash_balance,
        opening_bank=data.opening_bank_balance,
    )

    await log_action(
        db,
        org_id=org_id,
        user_id=user_id,
        action=AuditAction.CREATE_ORG,
        entity_type="organization",
        entity_id=org_id,
        new_value={"name": data.name, "business_type": data.business_type.value},
        description=f"Organisation '{data.name}' created with {coa_count} default accounts",
        request=request,
    )

    org_doc["_id"] = org_id
    org_doc["user_role"] = "OWNER"
    org_doc["is_owner"] = True
    org_doc["coa_accounts_created"] = coa_count
    return org_doc


# ── Read ──────────────────────────────────────────────────────────────────────

async def get_user_organizations(user_id: str, db) -> list[dict]:
    """Return all organisations the user is a member of, with their role."""
    cursor = db.org_members.find({"user_id": user_id})
    memberships = [m async for m in cursor]
    if not memberships:
        return []

    org_ids = [ObjectId(m["org_id"]) for m in memberships]
    role_map = {m["org_id"]: m["role"] for m in memberships}

    orgs = []
    async for org in db.organizations.find({"_id": {"$in": org_ids}, "is_active": True}):
        org_id = str(org["_id"])
        org["_id"] = org_id
        org["user_role"] = role_map.get(org_id)
        org["is_owner"] = role_map.get(org_id) == "OWNER"
        orgs.append(org)
    return orgs


async def get_organization(org_id: str, user_id: str, db) -> dict:
    """Get a single org — verifies caller is a member."""
    await _require_membership(org_id, user_id, db)

    org = await db.organizations.find_one(
        {"_id": ObjectId(org_id), "is_active": True}
    )
    if not org:
        raise not_found("Organisation")

    member = await db.org_members.find_one({"org_id": org_id, "user_id": user_id})
    org["_id"] = str(org["_id"])
    org["user_role"] = member["role"] if member else None
    org["is_owner"] = (org["user_role"] == "OWNER")
    return org


# ── Update ────────────────────────────────────────────────────────────────────

async def update_organization(
    org_id: str,
    user_id: str,
    data: UpdateOrganizationRequest,
    db,
    request=None,
) -> dict:
    """Update org profile. Requires OWNER or ADMIN."""
    await _require_role(org_id, user_id, {"OWNER", "ADMIN"}, db)

    org = await db.organizations.find_one({"_id": ObjectId(org_id), "is_active": True})
    if not org:
        raise not_found("Organisation")

    updates = data.model_dump(exclude_none=True)
    if not updates:
        raise bad_request("No fields provided to update")

    prev = {k: org.get(k) for k in updates}
    updates["updated_at"] = datetime.utcnow()

    await db.organizations.update_one({"_id": ObjectId(org_id)}, {"$set": updates})

    await log_action(
        db,
        org_id=org_id,
        user_id=user_id,
        action=AuditAction.UPDATE_ORG,
        entity_type="organization",
        entity_id=org_id,
        previous_value=prev,
        new_value=updates,
        request=request,
    )

    return await get_organization(org_id, user_id, db)


# ── Members ───────────────────────────────────────────────────────────────────

async def get_members(org_id: str, user_id: str, db) -> list[dict]:
    """List all members of an org."""
    await _require_membership(org_id, user_id, db)

    cursor = db.org_members.find({"org_id": org_id})
    members = []
    async for m in cursor:
        # Enrich with user details
        user = await db.users.find_one({"_id": ObjectId(m["user_id"])})
        members.append({
            "id": str(m["_id"]),
            "user_id": m["user_id"],
            "user_email": user["email"] if user else "unknown",
            "user_name": user["full_name"] if user else "Unknown",
            "role": m["role"],
            "joined_at": m["joined_at"],
        })
    return members


async def invite_member(
    org_id: str,
    inviter_id: str,
    data: InviteMemberRequest,
    db,
    request=None,
) -> dict:
    """
    Add a user to an org by email. Requires OWNER or ADMIN.
    The invited user must already have an account on the platform.
    """
    await _require_role(org_id, inviter_id, {"OWNER", "ADMIN"}, db)

    # Find user by email
    invitee = await db.users.find_one({"email": data.user_email})
    if not invitee:
        raise not_found(f"User with email '{data.user_email}'")

    invitee_id = str(invitee["_id"])

    # Check not already a member
    existing = await db.org_members.find_one({"org_id": org_id, "user_id": invitee_id})
    if existing:
        raise conflict(f"User '{data.user_email}' is already a member of this organisation")

    now = datetime.utcnow()
    doc = {
        "org_id": org_id,
        "user_id": invitee_id,
        "role": data.role.value,
        "joined_at": now,
        "invited_by": inviter_id,
    }
    result = await db.org_members.insert_one(doc)

    await log_action(
        db,
        org_id=org_id,
        user_id=inviter_id,
        action=AuditAction.INVITE_MEMBER,
        entity_type="org_member",
        entity_id=str(result.inserted_id),
        new_value={"email": data.user_email, "role": data.role.value},
        request=request,
    )

    return {
        "id": str(result.inserted_id),
        "user_id": invitee_id,
        "user_email": data.user_email,
        "user_name": invitee.get("full_name", ""),
        "role": data.role.value,
        "joined_at": now,
    }


async def update_member_role(
    org_id: str,
    member_user_id: str,
    updater_id: str,
    data: UpdateMemberRoleRequest,
    db,
    request=None,
) -> dict:
    """Change a member's role. OWNER cannot have their role changed."""
    await _require_role(org_id, updater_id, {"OWNER", "ADMIN"}, db)

    target_member = await db.org_members.find_one(
        {"org_id": org_id, "user_id": member_user_id}
    )
    if not target_member:
        raise not_found("Member")

    if target_member["role"] == "OWNER" and updater_id != member_user_id:
        raise bad_request("Cannot change the role of the organisation owner")

    # Prevent removing last owner
    if target_member["role"] == "OWNER" and data.role.value != "OWNER":
        owner_count = await db.org_members.count_documents(
            {"org_id": org_id, "role": "OWNER"}
        )
        if owner_count <= 1:
            raise bad_request("Cannot remove the last owner. Assign another owner first.")

    prev_role = target_member["role"]
    await db.org_members.update_one(
        {"org_id": org_id, "user_id": member_user_id},
        {"$set": {"role": data.role.value}},
    )

    await log_action(
        db,
        org_id=org_id,
        user_id=updater_id,
        action=AuditAction.UPDATE_MEMBER_ROLE,
        entity_type="org_member",
        entity_id=member_user_id,
        previous_value={"role": prev_role},
        new_value={"role": data.role.value},
        request=request,
    )

    return {"user_id": member_user_id, "role": data.role.value}


async def remove_member(
    org_id: str,
    member_user_id: str,
    remover_id: str,
    db,
    request=None,
) -> None:
    """Remove a member. Cannot remove the last owner."""
    await _require_role(org_id, remover_id, {"OWNER", "ADMIN"}, db)

    target = await db.org_members.find_one(
        {"org_id": org_id, "user_id": member_user_id}
    )
    if not target:
        raise not_found("Member")

    if target["role"] == "OWNER":
        owner_count = await db.org_members.count_documents(
            {"org_id": org_id, "role": "OWNER"}
        )
        if owner_count <= 1:
            raise bad_request("Cannot remove the last owner")

    await db.org_members.delete_one({"org_id": org_id, "user_id": member_user_id})

    await log_action(
        db,
        org_id=org_id,
        user_id=remover_id,
        action=AuditAction.REMOVE_MEMBER,
        entity_type="org_member",
        entity_id=member_user_id,
        previous_value={"role": target["role"]},
        request=request,
    )


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _require_membership(org_id: str, user_id: str, db) -> dict:
    """Raise 403 if user is not a member of the org."""
    member = await db.org_members.find_one({"org_id": org_id, "user_id": user_id})
    if not member:
        raise forbidden()
    return member


async def _require_role(org_id: str, user_id: str, allowed_roles: set[str], db) -> dict:
    """Raise 403 if user's role is not in allowed_roles."""
    member = await _require_membership(org_id, user_id, db)
    if member["role"] not in allowed_roles:
        raise forbidden()
    return member
