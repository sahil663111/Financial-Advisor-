"""
Vendor Service — Phase 3.
CRUD for vendors + outstanding payables balance.
"""
from datetime import datetime
from typing import Optional
from bson import ObjectId
from app.utils.exceptions import not_found, conflict, bad_request


async def create_vendor(org_id: str, user_id: str, data: dict, db, request=None) -> dict:
    if data.get("email"):
        existing = await db.biz_vendors.find_one(
            {"org_id": org_id, "email": data["email"], "is_active": True}
        )
        if existing:
            raise conflict(f"Vendor with email '{data['email']}' already exists")

    now = datetime.utcnow()
    doc = {"org_id": org_id, **data, "is_active": True,
           "created_by": user_id, "created_at": now, "updated_at": now}
    result = await db.biz_vendors.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


async def list_vendors(org_id: str, db, search: Optional[str] = None,
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
    total = await db.biz_vendors.count_documents(query)
    cursor = db.biz_vendors.find(query).sort("name", 1).skip(skip).limit(limit)
    items = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        doc["outstanding_payable"] = await _vendor_outstanding(org_id, doc["_id"], db)
        items.append(doc)
    return {"data": items, "total": total, "page": page, "pages": (total + limit - 1) // limit}


async def get_vendor(org_id: str, vendor_id: str, db) -> dict:
    doc = await db.biz_vendors.find_one({"_id": ObjectId(vendor_id), "org_id": org_id})
    if not doc:
        raise not_found("Vendor")
    doc["_id"] = str(doc["_id"])
    doc["outstanding_payable"] = await _vendor_outstanding(org_id, vendor_id, db)
    cursor = db.biz_bills.find(
        {"org_id": org_id, "vendor_id": vendor_id}
    ).sort("bill_date", -1).limit(10)
    doc["recent_bills"] = [{**b, "_id": str(b["_id"])} async for b in cursor]
    return doc


async def update_vendor(org_id: str, vendor_id: str, user_id: str,
                         updates: dict, db, request=None) -> dict:
    doc = await db.biz_vendors.find_one({"_id": ObjectId(vendor_id), "org_id": org_id})
    if not doc:
        raise not_found("Vendor")
    updates["updated_at"] = datetime.utcnow()
    await db.biz_vendors.update_one({"_id": ObjectId(vendor_id)}, {"$set": updates})
    return await get_vendor(org_id, vendor_id, db)


async def delete_vendor(org_id: str, vendor_id: str, user_id: str, db, request=None) -> None:
    doc = await db.biz_vendors.find_one({"_id": ObjectId(vendor_id), "org_id": org_id})
    if not doc:
        raise not_found("Vendor")
    open_count = await db.biz_bills.count_documents({
        "org_id": org_id, "vendor_id": vendor_id,
        "status": {"$in": ["PENDING", "PARTIAL", "OVERDUE"]},
    })
    if open_count > 0:
        raise bad_request(f"Cannot delete vendor with {open_count} open bill(s)")
    await db.biz_vendors.update_one(
        {"_id": ObjectId(vendor_id)},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}},
    )


async def _vendor_outstanding(org_id: str, vendor_id: str, db) -> float:
    pipeline = [
        {"$match": {"org_id": org_id, "vendor_id": vendor_id,
                    "status": {"$in": ["PENDING", "PARTIAL", "OVERDUE"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount_due"}}},
    ]
    result = [doc async for doc in db.biz_bills.aggregate(pipeline)]
    return round(result[0]["total"], 2) if result else 0.0
