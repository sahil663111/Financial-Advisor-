"""
Customer Service — Phase 3.
CRUD for customers + balance summary (outstanding receivables).
"""
from datetime import datetime
from typing import Optional
from bson import ObjectId
from app.utils.exceptions import not_found, conflict, bad_request
from app.business.audit.service import log_action, AuditAction


async def create_customer(org_id: str, user_id: str, data: dict, db, request=None) -> dict:
    # Check duplicate email within org
    if data.get("email"):
        existing = await db.biz_customers.find_one(
            {"org_id": org_id, "email": data["email"], "is_active": True}
        )
        if existing:
            raise conflict(f"Customer with email '{data['email']}' already exists")

    now = datetime.utcnow()
    doc = {
        "org_id": org_id,
        **data,
        "is_active": True,
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.biz_customers.insert_one(doc)
    doc["_id"] = str(result.inserted_id)

    await log_action(db, org_id=org_id, user_id=user_id,
        action="CREATE_CUSTOMER", entity_type="customer",
        entity_id=doc["_id"], new_value={"name": data["name"]}, request=request)
    return doc


async def list_customers(org_id: str, db, search: Optional[str] = None,
                         active_only: bool = True, page: int = 1, limit: int = 50) -> dict:
    query: dict = {"org_id": org_id}
    if active_only:
        query["is_active"] = True
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]
    skip = (page - 1) * limit
    total = await db.biz_customers.count_documents(query)
    cursor = db.biz_customers.find(query).sort("name", 1).skip(skip).limit(limit)
    items = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        # Attach outstanding balance
        doc["outstanding_balance"] = await _customer_outstanding(org_id, doc["_id"], db)
        items.append(doc)
    return {"data": items, "total": total, "page": page, "pages": (total + limit - 1) // limit}


async def get_customer(org_id: str, customer_id: str, db) -> dict:
    doc = await db.biz_customers.find_one({"_id": ObjectId(customer_id), "org_id": org_id})
    if not doc:
        raise not_found("Customer")
    doc["_id"] = str(doc["_id"])
    doc["outstanding_balance"] = await _customer_outstanding(org_id, customer_id, db)
    # Recent invoices
    cursor = db.biz_invoices.find(
        {"org_id": org_id, "customer_id": customer_id}
    ).sort("issue_date", -1).limit(10)
    doc["recent_invoices"] = [
        {**i, "_id": str(i["_id"])} async for i in cursor
    ]
    return doc


async def update_customer(org_id: str, customer_id: str, user_id: str,
                           updates: dict, db, request=None) -> dict:
    doc = await db.biz_customers.find_one({"_id": ObjectId(customer_id), "org_id": org_id})
    if not doc:
        raise not_found("Customer")
    updates["updated_at"] = datetime.utcnow()
    await db.biz_customers.update_one({"_id": ObjectId(customer_id)}, {"$set": updates})
    await log_action(db, org_id=org_id, user_id=user_id,
        action="UPDATE_CUSTOMER", entity_type="customer",
        entity_id=customer_id, new_value=updates, request=request)
    return await get_customer(org_id, customer_id, db)


async def delete_customer(org_id: str, customer_id: str, user_id: str,
                           db, request=None) -> None:
    doc = await db.biz_customers.find_one({"_id": ObjectId(customer_id), "org_id": org_id})
    if not doc:
        raise not_found("Customer")
    # Prevent deletion if outstanding invoices exist
    open_count = await db.biz_invoices.count_documents({
        "org_id": org_id, "customer_id": customer_id,
        "status": {"$in": ["SENT", "PARTIALLY_PAID", "OVERDUE"]},
    })
    if open_count > 0:
        raise bad_request(f"Cannot delete customer with {open_count} open invoice(s). Close them first.")
    await db.biz_customers.update_one(
        {"_id": ObjectId(customer_id)},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}},
    )
    await log_action(db, org_id=org_id, user_id=user_id,
        action="DELETE_CUSTOMER", entity_type="customer",
        entity_id=customer_id, request=request)


async def _customer_outstanding(org_id: str, customer_id: str, db) -> float:
    """Sum of amount_due across open invoices for this customer."""
    pipeline = [
        {"$match": {"org_id": org_id, "customer_id": customer_id,
                    "status": {"$in": ["SENT", "PARTIALLY_PAID", "OVERDUE"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount_due"}}},
    ]
    result = [doc async for doc in db.biz_invoices.aggregate(pipeline)]
    return round(result[0]["total"], 2) if result else 0.0
