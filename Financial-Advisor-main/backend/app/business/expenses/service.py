"""
Business Expense Service — Phase 4.

Lifecycle:
  Create  → PENDING (if requires_approval=True) or APPROVED (immediate)
  Approve → posts journal entry + marks APPROVED
  Reject  → marks REJECTED, no journal entry

Auto-journal on approval:
  DR  Expense Account  (amount - gst_amount)
  DR  Input Tax Credit (gst_amount, if > 0)
  CR  Bank Account     (full amount)

Analytics pipeline: monthly trend, category breakdown, MoM change.
"""
from datetime import datetime, timedelta
from typing import Optional
from bson import ObjectId

from app.utils.exceptions import not_found, bad_request, forbidden
from app.business.expenses.schemas import (
    CreateExpenseRequest, UpdateExpenseRequest,
    ApprovalStatus, CATEGORY_ACCOUNT_MAP,
)
from app.business.audit.service import log_action, AuditAction
from app.business.accounting.journal_service import create_journal_entry
from app.business.accounting.journal_schemas import (
    CreateJournalEntryRequest, JournalLineRequest,
)


# ── Create ────────────────────────────────────────────────────────────────────

async def create_expense(
    org_id: str,
    user_id: str,
    data: CreateExpenseRequest,
    db,
    request=None,
) -> dict:
    now = datetime.utcnow()

    # Resolve expense account code: explicit override → category map → default
    expense_code = (
        data.expense_account_code
        or CATEGORY_ACCOUNT_MAP.get(data.category.value, "5200")
    )

    # Resolve vendor name
    vendor_name = data.vendor_name
    if data.vendor_id and not vendor_name:
        vendor = await db.biz_vendors.find_one(
            {"_id": ObjectId(data.vendor_id), "org_id": org_id}
        )
        if vendor:
            vendor_name = vendor["name"]

    approval_status = (
        ApprovalStatus.PENDING.value
        if data.requires_approval
        else ApprovalStatus.APPROVED.value
    )

    doc = {
        "org_id": org_id,
        "date": data.date,
        "category": data.category.value,
        "description": data.description,
        "amount": data.amount,
        "gst_amount": data.gst_amount,
        "net_amount": round(data.amount - data.gst_amount, 2),
        "payment_method": data.payment_method.value,
        "vendor_id": data.vendor_id,
        "vendor_name": vendor_name,
        "reference": data.reference,
        "expense_account_code": expense_code,
        "bank_account_code": data.bank_account_code,
        "notes": data.notes,
        "tags": data.tags,
        "approval_status": approval_status,
        "approved_by": None,
        "approved_at": None,
        "rejected_by": None,
        "rejected_at": None,
        "rejection_reason": None,
        "journal_entry_id": None,
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }

    result = await db.biz_expenses.insert_one(doc)
    expense_id = str(result.inserted_id)
    doc["_id"] = expense_id

    # If auto-approved, post the journal entry immediately
    if approval_status == ApprovalStatus.APPROVED.value:
        je_id = await _post_expense_journal(org_id, user_id, doc, db, request)
        if je_id:
            await db.biz_expenses.update_one(
                {"_id": ObjectId(expense_id)},
                {"$set": {"journal_entry_id": je_id}},
            )
            doc["journal_entry_id"] = je_id

    await log_action(
        db, org_id=org_id, user_id=user_id,
        action=AuditAction.CREATE_EXPENSE,
        entity_type="expense", entity_id=expense_id,
        new_value={
            "category": data.category.value,
            "amount": data.amount,
            "description": data.description,
        },
        request=request,
    )
    return doc


# ── Read ──────────────────────────────────────────────────────────────────────

async def list_expenses(
    org_id: str,
    db,
    page: int = 1,
    limit: int = 50,
    category: Optional[str] = None,
    approval_status: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    search: Optional[str] = None,
    vendor_id: Optional[str] = None,
) -> dict:
    query: dict = {"org_id": org_id}

    if category:
        query["category"] = category.upper()
    if approval_status:
        query["approval_status"] = approval_status.upper()
    if vendor_id:
        query["vendor_id"] = vendor_id
    if start_date or end_date:
        query["date"] = {}
        if start_date:
            query["date"]["$gte"] = start_date
        if end_date:
            query["date"]["$lte"] = end_date
    if search:
        query["$or"] = [
            {"description": {"$regex": search, "$options": "i"}},
            {"vendor_name": {"$regex": search, "$options": "i"}},
            {"reference": {"$regex": search, "$options": "i"}},
        ]

    skip = (page - 1) * limit
    total = await db.biz_expenses.count_documents(query)
    cursor = db.biz_expenses.find(query).sort("date", -1).skip(skip).limit(limit)
    items = [{**doc, "_id": str(doc["_id"])} async for doc in cursor]

    return {
        "data": items,
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit,
    }


async def get_expense(org_id: str, expense_id: str, db) -> dict:
    doc = await db.biz_expenses.find_one(
        {"_id": ObjectId(expense_id), "org_id": org_id}
    )
    if not doc:
        raise not_found("Expense")
    doc["_id"] = str(doc["_id"])
    return doc


# ── Update ────────────────────────────────────────────────────────────────────

async def update_expense(
    org_id: str,
    expense_id: str,
    user_id: str,
    data: UpdateExpenseRequest,
    db,
    request=None,
) -> dict:
    doc = await db.biz_expenses.find_one(
        {"_id": ObjectId(expense_id), "org_id": org_id}
    )
    if not doc:
        raise not_found("Expense")

    if doc["approval_status"] == ApprovalStatus.APPROVED.value:
        raise bad_request(
            "Approved expenses cannot be edited. "
            "Reject and re-create if a correction is needed."
        )

    updates = data.model_dump(exclude_none=True)
    if "category" in updates:
        updates["category"] = updates["category"].value
        # Recalculate expense account if not explicitly overridden
        if "expense_account_code" not in updates:
            updates["expense_account_code"] = CATEGORY_ACCOUNT_MAP.get(
                updates["category"], "5200"
            )
    if "payment_method" in updates:
        updates["payment_method"] = updates["payment_method"].value
    if "amount" in updates or "gst_amount" in updates:
        amount = updates.get("amount", doc["amount"])
        gst = updates.get("gst_amount", doc["gst_amount"])
        updates["net_amount"] = round(amount - gst, 2)

    updates["updated_at"] = datetime.utcnow()
    await db.biz_expenses.update_one(
        {"_id": ObjectId(expense_id)}, {"$set": updates}
    )
    return await get_expense(org_id, expense_id, db)


# ── Delete ────────────────────────────────────────────────────────────────────

async def delete_expense(
    org_id: str,
    expense_id: str,
    user_id: str,
    db,
    request=None,
) -> None:
    doc = await db.biz_expenses.find_one(
        {"_id": ObjectId(expense_id), "org_id": org_id}
    )
    if not doc:
        raise not_found("Expense")

    if doc["approval_status"] == ApprovalStatus.APPROVED.value:
        raise bad_request(
            "Approved expenses cannot be deleted. "
            "Use the reject workflow to reverse them."
        )

    await db.biz_expenses.delete_one({"_id": ObjectId(expense_id)})

    await log_action(
        db, org_id=org_id, user_id=user_id,
        action="DELETE_EXPENSE",
        entity_type="expense", entity_id=expense_id,
        previous_value={
            "category": doc["category"],
            "amount": doc["amount"],
        },
        request=request,
    )


# ── Approval workflow ─────────────────────────────────────────────────────────

async def approve_expense(
    org_id: str,
    expense_id: str,
    approver_id: str,
    comment: Optional[str],
    db,
    request=None,
) -> dict:
    doc = await db.biz_expenses.find_one(
        {"_id": ObjectId(expense_id), "org_id": org_id}
    )
    if not doc:
        raise not_found("Expense")

    if doc["approval_status"] != ApprovalStatus.PENDING.value:
        raise bad_request(
            f"Only PENDING expenses can be approved. "
            f"Current status: {doc['approval_status']}"
        )

    now = datetime.utcnow()
    await db.biz_expenses.update_one(
        {"_id": ObjectId(expense_id)},
        {
            "$set": {
                "approval_status": ApprovalStatus.APPROVED.value,
                "approved_by": approver_id,
                "approved_at": now,
                "updated_at": now,
            }
        },
    )

    # Post journal entry now that it's approved
    updated_doc = await db.biz_expenses.find_one({"_id": ObjectId(expense_id)})
    updated_doc["_id"] = str(updated_doc["_id"])

    je_id = await _post_expense_journal(org_id, approver_id, updated_doc, db, request)
    if je_id:
        await db.biz_expenses.update_one(
            {"_id": ObjectId(expense_id)},
            {"$set": {"journal_entry_id": je_id}},
        )
        updated_doc["journal_entry_id"] = je_id

    await log_action(
        db, org_id=org_id, user_id=approver_id,
        action=AuditAction.APPROVE_EXPENSE,
        entity_type="expense", entity_id=expense_id,
        new_value={"approval_status": "APPROVED", "comment": comment},
        request=request,
    )
    return updated_doc


async def reject_expense(
    org_id: str,
    expense_id: str,
    rejector_id: str,
    reason: str,
    db,
    request=None,
) -> dict:
    doc = await db.biz_expenses.find_one(
        {"_id": ObjectId(expense_id), "org_id": org_id}
    )
    if not doc:
        raise not_found("Expense")

    if doc["approval_status"] not in (
        ApprovalStatus.PENDING.value, ApprovalStatus.APPROVED.value
    ):
        raise bad_request("Only PENDING or APPROVED expenses can be rejected")

    now = datetime.utcnow()

    # If approved, void the journal entry first
    if doc.get("journal_entry_id") and doc["approval_status"] == ApprovalStatus.APPROVED.value:
        try:
            from app.business.accounting.journal_service import void_journal_entry
            await void_journal_entry(
                org_id=org_id,
                entry_id=doc["journal_entry_id"],
                user_id=rejector_id,
                reason=f"Expense rejected: {reason}",
                db=db,
                request=request,
            )
        except Exception:
            pass

    await db.biz_expenses.update_one(
        {"_id": ObjectId(expense_id)},
        {
            "$set": {
                "approval_status": ApprovalStatus.REJECTED.value,
                "rejected_by": rejector_id,
                "rejected_at": now,
                "rejection_reason": reason,
                "updated_at": now,
            }
        },
    )

    await log_action(
        db, org_id=org_id, user_id=rejector_id,
        action=AuditAction.REJECT_EXPENSE,
        entity_type="expense", entity_id=expense_id,
        new_value={"approval_status": "REJECTED", "reason": reason},
        request=request,
    )

    rejected = await db.biz_expenses.find_one({"_id": ObjectId(expense_id)})
    rejected["_id"] = str(rejected["_id"])
    return rejected


# ── Analytics ─────────────────────────────────────────────────────────────────

async def get_expense_analytics(
    org_id: str,
    db,
    months: int = 6,
) -> dict:
    """
    Returns:
    - Monthly expense trend (approved only)
    - Category distribution
    - Month-over-month change
    - Average monthly spend
    - Pending approval count + total
    - Top vendors by spend
    """
    end = datetime.utcnow()
    start = end - timedelta(days=months * 30)

    # Monthly trend + category breakdown
    pipeline = [
        {
            "$match": {
                "org_id": org_id,
                "approval_status": ApprovalStatus.APPROVED.value,
                "date": {"$gte": start},
            }
        },
        {
            "$group": {
                "_id": {
                    "year":  {"$year":  "$date"},
                    "month": {"$month": "$date"},
                    "category": "$category",
                },
                "total": {"$sum": "$amount"},
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id.year": 1, "_id.month": 1}},
    ]
    raw = [doc async for doc in db.biz_expenses.aggregate(pipeline)]

    monthly_map: dict[str, float] = {}
    category_map: dict[str, float] = {}
    for doc in raw:
        key = f"{doc['_id']['year']}-{doc['_id']['month']:02d}"
        cat = doc["_id"]["category"]
        monthly_map[key] = round(monthly_map.get(key, 0) + doc["total"], 2)
        category_map[cat] = round(category_map.get(cat, 0) + doc["total"], 2)

    monthly_trend = [
        {"month": k, "total": v}
        for k, v in sorted(monthly_map.items())
    ]
    category_dist = sorted(
        [{"category": k, "total": v} for k, v in category_map.items()],
        key=lambda x: -x["total"],
    )

    mom_change = None
    if len(monthly_trend) >= 2:
        prev = monthly_trend[-2]["total"]
        curr = monthly_trend[-1]["total"]
        mom_change = round(((curr - prev) / prev) * 100, 1) if prev > 0 else 0.0

    avg_monthly = (
        round(sum(v["total"] for v in monthly_trend) / len(monthly_trend), 2)
        if monthly_trend else 0.0
    )

    # Pending expenses
    pending_pipeline = [
        {"$match": {"org_id": org_id, "approval_status": ApprovalStatus.PENDING.value}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]
    pending_result = [doc async for doc in db.biz_expenses.aggregate(pending_pipeline)]
    pending_total = pending_result[0]["total"] if pending_result else 0.0
    pending_count = pending_result[0]["count"] if pending_result else 0

    # Top vendors
    vendor_pipeline = [
        {
            "$match": {
                "org_id": org_id,
                "approval_status": ApprovalStatus.APPROVED.value,
                "vendor_name": {"$ne": None},
                "date": {"$gte": start},
            }
        },
        {
            "$group": {
                "_id": "$vendor_name",
                "total": {"$sum": "$amount"},
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"total": -1}},
        {"$limit": 8},
    ]
    top_vendors = [
        {"vendor": doc["_id"], "total": round(doc["total"], 2), "count": doc["count"]}
        async for doc in db.biz_expenses.aggregate(vendor_pipeline)
    ]

    return {
        "monthly_trend": monthly_trend,
        "category_distribution": category_dist,
        "month_over_month_change_pct": mom_change,
        "average_monthly": avg_monthly,
        "top_categories": category_dist[:5],
        "top_vendors": top_vendors,
        "pending": {
            "count": pending_count,
            "total": round(pending_total, 2),
        },
    }


# ── Internal: post journal entry ──────────────────────────────────────────────

async def _post_expense_journal(
    org_id: str,
    user_id: str,
    expense: dict,
    db,
    request=None,
) -> Optional[str]:
    """
    DR  Expense Account    net_amount
    DR  Input Tax Credit   gst_amount  (only if gst > 0)
    CR  Bank Account       full amount
    """
    try:
        net = expense["net_amount"]
        gst = expense.get("gst_amount", 0.0)
        amount = expense["amount"]
        desc = expense.get("description", "Business Expense")
        vendor = expense.get("vendor_name", "")
        ref = expense.get("reference")

        lines = [
            JournalLineRequest(
                account_code=expense["expense_account_code"],
                description=f"{desc}{' — ' + vendor if vendor else ''}",
                debit=net,
                credit=0.0,
            ),
        ]
        if gst > 0:
            lines.append(JournalLineRequest(
                account_code="1600",   # Input Tax Credit (GST)
                description=f"GST ITC — {desc}",
                debit=gst,
                credit=0.0,
            ))
        lines.append(JournalLineRequest(
            account_code=expense["bank_account_code"],
            description=f"Payment — {desc}",
            debit=0.0,
            credit=amount,
        ))

        entry = await create_journal_entry(
            org_id=org_id,
            user_id=user_id,
            data=CreateJournalEntryRequest(
                date=expense["date"],
                description=f"Expense: {desc}{' — ' + vendor if vendor else ''}",
                reference=ref,
                lines=lines,
            ),
            db=db,
            request=request,
        )
        return str(entry["_id"])
    except Exception as e:
        print(f"[expense_service] auto-journal failed: {e}")
        return None


from typing import Optional
